# Moon Hands Backend

AI-powered receptionist backend for Singapore aesthetic clinics.

## Architecture

| Layer | Purpose |
|-------|---------|
| `server/` | Webhook handlers (WhatsApp, Voice, Onboarding) |
| `ai/` | Smart router + OpenAI GPT-4o mini with function calling |
| `middleware/` | Security, cost protection, rate limiting, loop detection |
| `telegram/` | Admin bot for approvals and alerts |
| `jobs/` | Cron jobs for appointment reminders |
| `supabase/` | Database client and migrations |

## Quick Start

1. Copy `.env.example` to `.env` and fill in values
2. Run `npm install`
3. Run `npm start`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `TELEGRAM_BOT_TOKEN` | Yes | Telegram bot token |
| `TELEGRAM_ADMIN_CHAT_ID` | Yes | Admin chat ID for alerts |
| `API_KEY` | Yes | Webhook API authentication key |
| `WEBHOOK_SECRET` | Yes | Webhook HMAC signature secret |
| `OPENAI_API_KEY` | For AI | OpenAI API key |
| `GOOGLE_CLIENT_ID` | For Calendar | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For Calendar | Google OAuth client secret |
| `VAPI_API_KEY` | For Voice | VAPI.ai API key |
| `TWILIO_ACCOUNT_SID` | For SMS | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | For SMS | Twilio auth token |
| `D360_API_KEY` | For WhatsApp | 360dialog API key |

## Deployment

See `DEPLOYMENT.md` for Render deployment instructions.
