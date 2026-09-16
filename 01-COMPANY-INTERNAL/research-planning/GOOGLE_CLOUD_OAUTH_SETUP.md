# Google Cloud OAuth Setup — Step by Step

## What This Unlocks
Calendar integration: bot checks real availability, creates bookings in clinic's Google Calendar.

## Steps (10 minutes, $0)

1. Go to https://console.cloud.google.com
2. Sign in with your Google account
3. Click "Create Project" → Name: "Moon Hands Calendar" → Create
4. Left menu → "APIs & Services" → "Library"
5. Search "Google Calendar API" → Click it → "Enable"
6. Left menu → "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
7. If asked: "Configure consent screen" → "External" → Fill app name "Moon Hands" → your email → Save
8. Back to Credentials → "Create Credentials" → "OAuth 2.0 Client ID"
   - Application type: "Web application"
   - Name: "Moon Hands Backend"
   - Authorized redirect URIs: `https://moon-hands-backend.onrender.com/auth/google/callback`
   - Create
9. Copy the **Client ID** and **Client Secret** — paste them into Render env vars:
   - `GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com`
   - `GOOGLE_CLIENT_SECRET=your-secret`
10. Left menu → "OAuth consent screen" → "Publish App" → Confirm

Done. Google Calendar API is live.
