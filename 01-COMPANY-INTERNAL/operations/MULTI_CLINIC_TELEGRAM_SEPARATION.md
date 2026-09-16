# Moon Hands — Multi-Clinic Telegram Admin Separation
## CRITICAL: Zero Cross-Clinic Data Leakage
## Status: DESIGN DOCUMENT — Implementation Required

---

## THE GOLDEN RULE

**NEVER, EVER, under any circumstances, send Clinic A's information to Clinic B's Telegram.**

This applies to:
- ✅ WhatsApp bot responses to patients
- ✅ Telegram booking notifications to clinic staff
- ✅ Telegram system alerts (errors, security)
- ✅ Telegram cost/usage reports
- ✅ Google Calendar events
- ✅ Any database query result

**Violation = immediate business death.** One cross-clinic leak and every clinic unsubscribes.

---

## CURRENT STATE (Single Admin — Ash Only)

```
Render env: TELEGRAM_ADMIN_CHAT_ID=81398272

All notifications → ONE Telegram chat (Ash)
  ↓
Ash manually forwards to clinic staff
```

**This is fine for 1-2 clinics but does not scale.**

---

## TARGET STATE (Multi-Clinic — Each Clinic Gets Their Own)

```
Clinic "Glow Aesthetics" (GLOW001)
  telegram_chat_ids: [123456789, 987654321]
  → Notifications go ONLY to these 2 Telegram chats
  
Clinic "Skin Studio" (SKIN002)
  telegram_chat_ids: [555555555]
  → Notifications go ONLY to this 1 Telegram chat

Moon Hands Admin (Ash)
  TELEGRAM_ADMIN_CHAT_ID: 81398272
  → Gets COPY of all notifications for oversight
  → Can /takeover any clinic's patient
```

---

## DATA MODEL

### Database Schema (Already Exists — `clients` table)

```sql
-- Already in schema from previous migration
ALTER TABLE clients
  ADD COLUMN telegram_chat_ids BIGINT[] DEFAULT '{}';  -- Array of chat IDs

-- Example data after onboarding:
-- Clinic 1: Glow Aesthetics
INSERT INTO clients (id, name, slug, telegram_chat_ids) VALUES
  ('GLOW001', 'Glow Aesthetics', 'glow-aesthetics', ARRAY[123456789, 987654321]);

-- Clinic 2: Skin Studio  
INSERT INTO clients (id, name, 'skin-studio', 'skin-studio', ARRAY[555555555]);
```

### How It Works

| Step | What Happens |
|------|-------------|
| 1. Clinic owner messages bot `/start` | Bot records their `chat_id` |
| 2. Bot asks: "Which clinic are you from? [Glow Aesthetics] [Skin Studio]" | Clinic selects |
| 3. Bot stores `chat_id` in `clients.telegram_chat_ids[]` | Linked |
| 4. All future notifications scoped to that clinic | Isolated |

---

## THE 4 WALLS OF ISOLATION

### Wall 1: WABA Webhook (Already Correct)

```
Patient messages clinic's WhatsApp number
  ↓
360dialog routes to webhook with clinic_id parameter
  https://moon-hands.onrender.com/webhook/whatsapp?clinic_id=GLOW001&token=abc123
  ↓
Server loads ONLY Glow Aesthetics config
  ↓
Bot responds using Glow Aesthetics treatments, hours, greeting
  ↓
IMPOSSIBLE to send Skin Studio's data to Glow's patient
```

✅ **Already safe.** Each clinic has unique webhook URL with unique token.

---

### Wall 2: Booking Notifications (Needs Implementation)

**CURRENT (Broken for multi-clinic):**
```javascript
// Sends to ONE admin only
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
await bot.sendMessage(adminChatId, "New booking for Thomas...");
// Problem: Which clinic is Thomas from? Not specified!
```

**TARGET (Safe):**
```javascript
// Resolve clinic from booking
const { data: client } = await supabase
  .from('clients')
  .select('telegram_chat_ids, name')
  .eq('id', booking.client_id)
  .single();

// Send to clinic's staff (PRIMARY)
for (const chatId of client.telegram_chat_ids) {
  await bot.sendMessage(chatId, `📋 New booking for ${booking.patient_name}...`);
}

// Send COPY to Moon Hands admin (SECONDARY — for oversight)
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
await bot.sendMessage(adminChatId, 
  `📋 [Glow Aesthetics] New booking for ${booking.patient_name}...`
);
```

**Key rule:** Clinic staff get their OWN bookings. Ash gets a COPY with clinic name prefix.

---

### Wall 3: Staff Takeover Notifications (Needs Implementation)

**CURRENT (Broken):**
```javascript
// staff-takeover.js sends to clinic's telegram_chat_id
// BUT: doesn't verify the chat_id belongs to the right clinic
```

**TARGET (Safe):**
```javascript
// When bot auto-pauses on complaint:
// 1. Get clinic's telegram_chat_ids from booking
const { data: client } = await supabase
  .from('clients')
  .select('telegram_chat_ids, name')
  .eq('id', clinicId)
  .single();

// 2. Send ONLY to that clinic's staff
for (const chatId of client.telegram_chat_ids) {
  await bot.sendMessage(chatId, `😠 Complaint from patient ${phone}...`);
}

// 3. Send COPY to Ash (with clinic name)
await bot.sendMessage(adminChatId, 
  `😠 [Glow Aesthetics] Complaint from patient ${phone}...`
);
```

---

### Wall 4: The `/start` Command (Needs Implementation)

When a new clinic staff member messages the bot for the first time:

```javascript
bot.command('start', async (ctx) => {
  const chatId = ctx.chat.id;
  const name = ctx.from.first_name || 'there';
  
  // Check if this chat_id is already linked to a clinic
  const { data: existing } = await supabase
    .from('clients')
    .select('name')
    .contains('telegram_chat_ids', [chatId]);
  
  if (existing?.length > 0) {
    // Already linked — just show the menu
    await ctx.reply(`👋 Welcome back, ${name}!`, { reply_markup: QUICK_MENU_KEYBOARD });
    return;
  }
  
  // New user — need to link to clinic
  // Get all active clinics
  const { data: clinics } = await supabase
    .from('clients')
    .select('id, name, slug')
    .eq('is_trial', false); // Or whatever filter
  
  if (clinics.length === 0) {
    await ctx.reply('❌ No clinics found. Contact Pixel Vault support.');
    return;
  }
  
  if (clinics.length === 1) {
    // Only one clinic — auto-link
    await supabase
      .from('clients')
      .update({ telegram_chat_ids: [...clinics[0].telegram_chat_ids, chatId] })
      .eq('id', clinics[0].id);
    
    await ctx.reply(
      `👋 Welcome, ${name}!\n\n` +
      `You're now linked to *${clinics[0].name}*.\n\n` +
      `You'll receive booking notifications and alerts for this clinic.`,
      { parse_mode: 'Markdown', reply_markup: QUICK_MENU_KEYBOARD }
    );
    return;
  }
  
  // Multiple clinics — ask which one
  const keyboard = clinics.map(c => [{ text: c.name, callback_data: `link_clinic:${c.id}` }]);
  await ctx.reply(
    `👋 Welcome, ${name}!\n\n` +
    `Which clinic are you from?`,
    { reply_markup: { inline_keyboard: keyboard } }
  );
});
```

---

## ONBOARDING FORM — NEW FIELDS

The clinic onboarding form needs these NEW fields:

| Field | Required | Purpose |
|-------|----------|---------|
| Clinic name | ✅ | Display name |
| Clinic slug | ✅ | URL-safe identifier |
| Clinic phone (WABA) | ✅ | WhatsApp Business number |
| **Telegram admin name(s)** | ✅ | Who receives notifications |
| **Telegram username(s)** | ❌ | Optional, for verification |
| **Staff count** | ✅ | How many people need access |
| **Clinic email** | ✅ | Backup communication |

### Onboarding Flow (Telegram Linking)

```
Step 1: Clinic fills onboarding form (web)
        → Submitted to Moon Hands
        
Step 2: Moon Hands creates clinic in database
        → clinic_id = "GLOW001"
        → status = "pending_telegram_link"
        
Step 3: Moon Hands sends clinic owner a unique link
        → https://t.me/MoonHandsAdminBot?start=GLOW001
        
Step 4: Clinic owner clicks link, messages /start GLOW001
        → Bot records their chat_id
        → Links to GLOW001
        → Status = "active"
        
Step 5: Moon Hands confirms via email
        → "Your bot is live. Test it by messaging [WABA number]."
```

---

## VERIFICATION CHECKLIST (Before Go-Live)

Before onboarding ANY clinic, verify:

- [ ] Each clinic has unique `clinic_id`
- [ ] Each clinic has unique webhook token
- [ ] Each clinic's `telegram_chat_ids[]` is isolated
- [ ] Booking notifications include `clinic_id` in WHERE clause
- [ ] Staff takeover notifications scoped to correct clinic
- [ ] Ash receives COPY (not exclusive) of all notifications
- [ ] Ash's copy has clinic name prefix for identification
- [ ] `/start` command links chat_id to correct clinic
- [ ] No Supabase query returns data for wrong clinic (RLS + WHERE)
- [ ] Test: Book at Clinic A → Only Clinic A's Telegram gets notified
- [ ] Test: Book at Clinic B → Only Clinic B's Telegram gets notified
- [ ] Test: Ash gets BOTH notifications with clinic name prefix
- [ ] Test: Clinic A's staff NEVER sees Clinic B's data

---

## CODE CHANGES REQUIRED

| File | Change | Effort |
|------|--------|--------|
| `telegram/bot.js` | `/start` command with clinic linking | 2 hours |
| `telegram/commands/approvals.js` | Scope booking notifications to clinic's chat_ids | 2 hours |
| `middleware/staff-takeover.js` | Scope takeover alerts to clinic's chat_ids | 1 hour |
| `server/webhook.js` | Pass clinic_id through to all notification functions | 1 hour |
| `server/onboarding.js` | Generate unique /start links per clinic | 2 hours |
| `supabase/migrations/` | Ensure `telegram_chat_ids[]` column exists | 30 min |
| Test suite | 6 isolation tests (above) | 2 hours |

**Total: ~1.5 days of work.**

---

## WHAT'S SAFE NOW (No Changes Needed)

| Component | Why Safe |
|-----------|----------|
| WABA webhook | Each clinic has unique URL with `clinic_id` param |
| Bot responses | `clinicConfig` loaded from `clinic_id` in webhook URL |
| Intent matching | Same code for all clinics, uses clinic's own `config.services` |
| Booking flow | Uses clinic's own `config.operating_hours` |
| Response sanitizer | Stateless — same filter for all |
| Loop protection | Per-phone-number, not per-clinic |

---

*Document version: 1.0*
*Status: DESIGN — awaiting implementation*
*Priority: CRITICAL (block go-live for multi-clinic)*
