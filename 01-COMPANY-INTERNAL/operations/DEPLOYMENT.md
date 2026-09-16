# Moon Hands — Proper Deployment Guide
# Render + GitHub (Production-Ready)

## Overview

This guide deploys the Moon Hands backend to Render.com using GitHub as the source of truth. This is the most maintainable, professional approach for long-term operations.

**Time required:** 30-45 minutes  
**Cost:** Free tier (upgrade to Starter $7/mo before go-live)

---

## Phase 1: Prepare Your Computer

### Step 1.1: Gather All Credentials

Before touching any website, collect these values in a secure note (1Password, iCloud Keychain, or locked Notes app):

```
API_KEY=4-3j2Xwn74JsdEEy9aFUplQHecpdATmcXoTczzQEMys
WEBHOOK_SECRET=ef86935cf794bbe22d11b121d9468827e0ebe46109c78103c367abd6113dd115
SUPABASE_URL=https://grbimwhndcijmpkvyiiu.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<your moon_hands_25apr26 key>
TELEGRAM_BOT_TOKEN=<your rotated Telegram token>
TELEGRAM_ADMIN_CHAT_ID=416113875
VAPI_API_KEY=<your rotated VAPI key>
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=<your rotated Twilio token>
```

**Leave blank for now (Phase 2):**
- OPENAI_API_KEY
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- D360_API_KEY

---

## Phase 2: Create GitHub Repository

### Step 2.1: Create Account (if needed)
1. Go to **github.com**
2. Sign up with your email
3. Verify email

### Step 2.2: Create the Repository
1. Click **+** (top right) → **New repository**
2. **Repository name:** `moon-hands-backend`
3. **Description:** `Moon Hands AI receptionist backend — Node.js + Express + OpenAI`
4. **Visibility:** **Private** (critical — code contains logic patterns)
5. **Initialize:** Check "Add a README file"
6. Click **Create repository**

### Step 2.3: Understand the Folder Structure

Your local `pixel-vault/backend/` folder should be uploaded as the **entire contents** of the repo. NOT the `pixel-vault/` parent folder.

**Correct structure on GitHub:**
```
moon-hands-backend/          ← This is the repo root
├── render.yaml              ← Render reads this
├── package.json
├── server.js
├── .gitignore
├── README.md
├── server/
│   ├── webhook.js
│   ├── onboarding.js
│   └── health.js
├── ai/
│   ├── smart-router.js
│   ├── bot-engine.js
│   ├── intent-matcher.js
│   ├── intent-handlers.js
│   └── response-composer.js
├── middleware/
│   ├── security.js
│   ├── cost-protection.js
│   ├── per-customer-rate-limiter.js
│   └── loop-protection.js
├── supabase/
│   ├── client.js
│   └── schema.sql
├── telegram/
│   ├── bot.js
│   └── commands/
└── jobs/
    └── reminders.js
```

### Step 2.4: Upload Files

**Option A — GitHub Desktop (Easiest on Computer):**
1. Download GitHub Desktop from desktop.github.com
2. Sign in → Clone `moon-hands-backend`
3. Copy all files from `pixel-vault/backend/` into the cloned folder
4. GitHub Desktop shows all changes
5. Write commit message: "Initial backend deployment"
6. Click "Commit to main" → "Push origin"

**Option B — Drag-and-Drop (Web Browser):**
1. On your repo page, click **"Add file"** → **"Upload files"**
2. Drag the `backend/` folder contents into the upload area
3. Write commit message: "Initial backend deployment"
4. Click **"Commit changes"**
5. Repeat for any folders that don't upload in one batch

**Option C — Git Command Line:**
```bash
# Terminal / Command Prompt
cd pixel-vault/backend
git init
git remote add origin https://github.com/YOUR_USERNAME/moon-hands-backend.git
git add .
git commit -m "Initial backend deployment"
git push -u origin main
```

**Verification:** Refresh github.com repo page. All files should be visible.

---

## Phase 3: Deploy to Render

### Step 3.1: Create Render Account
1. Go to **render.com**
2. Click **Sign Up**
3. Choose **"Sign up with GitHub"** (links your repos automatically)
4. Authorize Render to access your GitHub
5. Verify email if prompted

### Step 3.2: Create Web Service from GitHub
1. Render Dashboard → **"New +"** button → **"Web Service"**
2. Under "Connect a repository", find `moon-hands-backend`
3. Click **"Connect"**
4. Render reads `render.yaml` and auto-fills:
   - Name: `moon-hands-backend`
   - Runtime: Node
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && node server.js`

**If `render.yaml` is NOT detected:**
- Root Directory: `backend`
- Build Command: `npm install`
- Start Command: `node server.js`
- Plan: Free

### Step 3.3: Set Region
- Region: **Singapore** (closest to your clinics)

### Step 3.4: Add Environment Variables (CRITICAL)

This is where you paste the credentials. **Never put these in the code.**

1. Scroll down to **"Environment"** section
2. Click **"Add Environment Variable"** for each:

| Key | Value |
|-----|-------|
| NODE_ENV | `production` |
| PORT | `10000` |
| API_KEY | `4-3j2Xwn74JsdEEy9aFUplQHecpdATmcXoTczzQEMys` |
| WEBHOOK_SECRET | `ef86935cf794bbe22d11b121d9468827e0ebe46109c78103c367abd6113dd115` |
| SUPABASE_URL | `https://grbimwhndcijmpkvyiiu.supabase.co` |
| SUPABASE_SERVICE_ROLE_KEY | `<your rotated key>` |
| TELEGRAM_BOT_TOKEN | `<your rotated token>` |
| TELEGRAM_ADMIN_CHAT_ID | `416113875` |
| VAPI_API_KEY | `<your rotated key>` |
| TWILIO_ACCOUNT_SID | `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |
| TWILIO_AUTH_TOKEN | `<your rotated token>` |
| GOOGLE_REDIRECT_URI | `https://moon-hands-backend.onrender.com/auth/google/callback` |

3. Click **"Advanced"** and add:

| Key | Value |
|-----|-------|
| RATE_LIMIT_MAX_REQUESTS | `60` |
| COST_MAX_DAILY_CALLS | `500` |
| COST_MAX_DAILY_SPEND_USD | `20` |

4. **Leave blank for now:**
   - OPENAI_API_KEY
   - GOOGLE_CLIENT_ID
   - GOOGLE_CLIENT_SECRET
   - D360_API_KEY

### Step 3.5: Deploy
1. Click **"Create Web Service"**
2. Render shows build logs. Wait 2-3 minutes.
3. Status changes from "Building" → "Deploying" → "Live"
4. Note the URL: `https://moon-hands-backend.onrender.com`

---

## Phase 4: Verify Deployment

### Test 1: Health Check
1. Open browser
2. Go to: `https://moon-hands-backend.onrender.com/health`
3. **Expected:** `{"status":"ok","service":"moon-hands","timestamp":"..."}`

### Test 2: Cost Protection Status
1. Go to: `https://moon-hands-backend.onrender.com/health?status=1`
2. **Expected:** Shows kill switch status, daily limits, clinic counters

### Test 3: Telegram Bot
1. Open Telegram
2. Message your bot: `/pending`
3. **Expected:** "No pending bookings" or a list

### Test 4: Security Layer
1. Try accessing without API key: `https://moon-hands-backend.onrender.com/`
2. **Expected:** `{"status":"error","message":"Unauthorized"}`

---

## Phase 5: Connect WhatsApp Webhook (Post-360dialog)

After you sign up for 360dialog (future step):

1. 360dialog Dashboard → Webhooks
2. Set webhook URL: `https://moon-hands-backend.onrender.com/webhook/whatsapp`
3. Set webhook secret: Your `WEBHOOK_SECRET` value
4. Save

---

## Phase 6: Upgrade Before Go-Live

**Free tier sleeps after 15 min idle.** Not acceptable for a clinic receptionist.

1. Render Dashboard → Select `moon-hands-backend`
2. **Settings** → **Plan**
3. Select **Starter** ($7/month)
4. Click **Update Plan**
5. Instance stays always-on. No cold starts.

---

## Maintenance Best Practices

### Updates (Future)
```bash
# On your computer
git clone https://github.com/YOUR_USERNAME/moon-hands-backend.git
cd moon-hands-backend
# Make code changes
git add .
git commit -m "Fix: updated rate limits"
git push origin main
# Render auto-deploys from main branch
```

### Monitoring
- Check Render logs: Dashboard → `moon-hands-backend` → Logs
- Check Telegram for admin alerts
- Check Supabase for security_events table

### Security
- Rotate API keys every 90 days
- Review security_events monthly
- Never commit `.env` to Git (`.gitignore` blocks this)

---

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "Missing SUPABASE_URL" | Env var not set in Render | Add in Dashboard → Environment |
| "Build failed" | `package.json` missing or wrong | Verify `backend/package.json` exists in repo root |
| "Cannot find module" | File path wrong | Check `render.yaml` has `startCommand: cd backend && node server.js` |
| Server sleeps between messages | Free tier | Upgrade to Starter ($7/mo) |
| Telegram bot not responding | Wrong TELEGRAM_BOT_TOKEN | Verify with @BotFather, re-copy token |

---

## Files Reference

| File | Location | Purpose |
|------|----------|---------|
| `render.yaml` | Repo root | Render auto-detects this |
| `backend/package.json` | `backend/` | Dependencies and scripts |
| `backend/server.js` | `backend/` | Entry point — starts webhook + Telegram |
| `backend/.env.example` | `backend/` | Template for env vars (no secrets) |
| `backend/.gitignore` | `backend/` | Prevents committing secrets |
