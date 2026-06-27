# Moon Hands - API Account Setup Guide

## What You're Creating
Three free accounts that power the entire backend:

| # | Service | What It Powers | Cost |
|---|---------|---------------|------|
| 1 | **Supabase** | Database (clients, usage, configs) | Free tier |
| 2 | **VAPI.ai** | Voice AI (phone calls) | Free trial |
| 3 | **Twilio** | WhatsApp API | Free trial |

After these, you'll create your **Telegram Bot** (step 2).

---

## Step 1: Supabase (Database)

**Time: 10 minutes | Cost: Free**

1. Go to https://supabase.com
2. Click "Start your project" → Sign up with Google or GitHub
3. Create a new organization (name it "Moon Hands")
4. Create a new project:
   - **Name:** `pixel-vault`
   - **Database Password:** Save this somewhere safe
   - **Region:** Singapore (Southeast Asia)
5. Wait ~2 minutes for the project to spin up
6. Go to **Project Settings** (gear icon) → **API**
7. Copy these two values:
   - `SUPABASE_URL` (starts with `https://...`)
   - `SUPABASE_SERVICE_KEY` (the `service_role` key — NOT the anon key)
8. Go to **SQL Editor** → **New query**
9. Paste the entire contents of `backend/supabase/schema.sql`
10. Click **Run** — this creates all tables, indexes, and seed data

**Done.** Your database is live.

---

## Step 2: VAPI.ai (Voice AI)

**Time: 5 minutes | Cost: Free trial ($10 credit)**

1. Go to https://vapi.ai
2. Sign up with Google or email
3. You'll get $10 in free credits automatically
4. Go to **Dashboard** → **API Keys**
5. Copy the key → this is `VAPI_API_KEY`

That's it for now. We'll create the actual AI assistant later.

---

## Step 3: Twilio (WhatsApp API)

**Time: 10 minutes | Cost: Free trial ($15.50 credit)**

1. Go to https://twilio.com/try-twilio
2. Sign up with your email
3. Verify your phone number
4. You'll get $15.50 in free trial credit
5. Once in the console, go to **Account Info**
6. Copy:
   - `Account SID` → `TWILIO_ACCOUNT_SID`
   - `Auth Token` → `TWILIO_AUTH_TOKEN`
7. Go to **Phone Numbers** → **Manage** → **Buy a number**
8. Search for a Singapore number (or US if SG unavailable)
9. Buy it (free with trial credit) → this is `TWILIO_PHONE_NUMBER`

### Activate WhatsApp Sandbox

10. In Twilio console, go to **Messaging** → **Try it out** → **Send a WhatsApp message**
11. Follow the steps to join the WhatsApp sandbox
12. Note the sandbox number — you'll use this for testing

---

## Step 4: Telegram Bot

**Time: 5 minutes | Cost: Free**

1. Open Telegram, search for **@BotFather**
2. Start a chat, send `/newbot`
3. Name it: `Moon Hands Admin`
4. Username: `pixelvault_admin_bot` (must end in `_bot`, try variations if taken)
5. BotFather gives you a token — copy it, this is `TELEGRAM_BOT_TOKEN`
6. **Important:** Never share this token with anyone

### Get Your Admin Chat ID

7. Search for **@userinfobot** on Telegram
8. Start it — it replies with your user ID
9. This is `TELEGRAM_ADMIN_CHAT_ID`

---

## Step 5: Configure the Backend

1. In your project folder, copy the environment file:
   ```bash
   cd backend
   cp .env.example .env
   ```
2. Open `.env` and fill in ALL the values you collected above
3. Save the file

---

## Step 6: Run the Bot

```bash
cd backend
npm install
npm start
```

You should see:
```
[2026-04-18T...] Moon Hands Telegram Bot started
  Admin: YOUR_CHAT_ID
  Use Ctrl+C to stop
```

### Test it

In Telegram, message your bot:
- `/start` — Should welcome you
- `/help` — Should show all commands
- `/clients` — Should show "Demo Aesthetic Clinic"

---

## Quick Reference: What You Need

| Variable | Where You Got It |
|----------|-----------------|
| `TELEGRAM_BOT_TOKEN` | @BotFather |
| `TELEGRAM_ADMIN_CHAT_ID` | @userinfobot |
| `SUPABASE_URL` | Supabase dashboard → API |
| `SUPABASE_SERVICE_KEY` | Supabase dashboard → API (service_role) |
| `VAPI_API_KEY` | vapi.ai dashboard |
| `TWILIO_ACCOUNT_SID` | twilio.com console |
| `TWILIO_AUTH_TOKEN` | twilio.com console |
| `TWILIO_PHONE_NUMBER` | Twilio phone numbers |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Bot says "Unauthorized" | Wrong `TELEGRAM_ADMIN_CHAT_ID` — double-check @userinfobot |
| `/clients` shows nothing | Schema not run — go to Supabase SQL Editor and run schema.sql |
| npm install fails | Make sure you have Node.js 18+ (`node -v`) |
| Can't find Supabase service key | It's under Project Settings → API → `service_role` (scroll down) |

---

**Once all 3 accounts are set up and the bot is running, tell me and we'll wire up the WhatsApp webhook + voice AI.**
