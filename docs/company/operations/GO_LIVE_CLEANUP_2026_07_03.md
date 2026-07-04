# Moon Hands — Go-Live Cleanup: Database Cleanup & Slug Fix
**Date:** 2026-07-03
**Purpose:** Clean slate for go-live with ONE demo clinic (Pixel Vault)

---

## What Was Done

### 1. Database Cleanup
| Clinic | Action | Data |
|--------|--------|------|
| **Demo Aesthetic Clinic** (slug: `demo-clinic`) | ❌ DELETED | All appointments, conversations, waitlist, configs |
| **Glow Aesthetics** (slug: `glow-aesthetics`, `glow-demo`) | ❌ DELETED | All appointments, conversations, waitlist, configs |
| **Pixel Vault** (slug: `pixellvault`) | ✅ KEPT & ENRICHED | Copied Glow/Demo's rich config (services, FAQs, hours, tone) + seeded 5 appointments, 6 conversations, 2 waitlist entries |

### 2. Slug Fix
| Before | After |
|--------|-------|
| `pixellvault` (double L) | `pixelvault` (single L) |

### 3. Pixel Vault Now Contains
- **10 treatments** with full descriptions and pricing
- **8 FAQs** with answers
- **8 operating hours entries** (Mon–Sat + Public Holidays)
- **5 demo appointments** (confirmed, pending, completed)
- **6 demo conversations** (hours, booking, pricing, aftercare)
- **2 waitlist entries** (active, notified)
- **Full booking settings** (auto-confirm off, waitlist on, 4hr notice, etc.)

---

## ⚠️  IMPACT OF SLUG CHANGE (pixellvault → pixelvault)

The slug is used in the **webhook URL** that 360dialog calls:

```
OLD: https://moon-hands-backend.onrender.com/webhook/whatsapp?clinic_id=pixellvault&token=...
NEW: https://moon-hands-backend.onrender.com/webhook/whatsapp?clinic_id=pixelvault&token=...
                                              ^^^^^^^^^^^
```

### What You MUST Update

#### 1. 360dialog Webhook Configuration
1. Log in to **360dialog Dashboard** → Settings → Webhooks
2. Update the webhook URL from `clinic_id=pixellvault` to `clinic_id=pixelvault`
3. **If you don't do this, incoming WhatsApp messages will return "Clinic not found"**

#### 2. Render Environment Variables (if D360_API_URL is set)
If you have `D360_API_URL` set in Render Dashboard → Environment, update it if the URL contains the old slug (unlikely but check).

#### 3. Hardcoded References in Code
The following files reference the old slug and have been updated in this deployment:

| File | What Changed |
|------|-------------|
| `supabase/setup-pixellvault.sql` | Renamed to `setup-pixelvault.sql`, slug fixed |
| `supabase/CLEANUP_AND_MIGRATE_2026_07_03.sql` | Uses `pixelvault` |

#### 4. Telegram Bot Webhook (if applicable)
If the Telegram webhook URL contains `clinic_id=pixellvault`, update it. Check in Render environment variables.

#### 5. Browser Bookmarks / Testing URLs
Any URLs you have bookmarked with `clinic_id=pixellvault` need updating.

### What Does NOT Need Updating
| Thing | Why |
|-------|-----|
| **Database `clients.id`** (UUID) | Unchanged — slug is just a lookup key |
| **Render service URL** | Unchanged — `moon-hands-backend.onrender.com` |
| **Telegram bot token** | Unchanged — bot talks directly to backend |
| **360dialog API key** | Unchanged — independent of clinic slug |
| **Google Calendar** | Unchanged — linked by `google_calendar_id` column |
| **Supabase project** | Unchanged — same database, same tables |

---

## How to Run the Cleanup

1. Go to **Supabase Dashboard** → SQL Editor
2. Open `supabase/CLEANUP_AND_MIGRATE_2026_07_03.sql`
3. Click **Run**
4. Verify output shows:
   - `=== AFTER CLEANUP ===` with only `pixelvault`
   - `PIXEL VAULT CONFIG` with 10 services, 8 FAQs
   - `PIXEL VAULT DATA COUNTS` with 5 appointments, 6 conversations, 2 waitlist
5. Update 360dialog webhook URL (see above)

---

## Rollback Plan

If anything goes wrong, the cleanup script only deleted:
- `demo-clinic` — originally a sample from `schema.sql`
- `glow-aesthetics`, `glow-demo` — test data from migration 006

**No production data was deleted.** Pixel Vault is your only real clinic.

To restore Glow data, re-run migration `006_test_data_glow_pixellvault.sql`.
