# Calendar Integration Design

## Overview

Moon Hands pushes every booking to the clinic's preferred calendar system.
We support a tiered approach: **Google Calendar as primary**, with graceful
fallbacks for clinics that can't or won't use Google.

## Architecture

```
Booking Created/Modified/Cancelled
    ↓
[Calendar Sync Router] — picks the right provider
    ↓
Google Calendar ←───→ iCal Feed ←──→ Dashboard Calendar
(primary)           (fallback #1)     (fallback #2, manual)
```

---

## Primary: Google Calendar

### Why Google Calendar First

| Factor | Why It Wins |
|--------|-------------|
| **Market penetration** | 95%+ of Singapore clinics use Gmail for business |
| **API quality** | Best-in-class OAuth 2.0, webhooks, freebusy |
| **Cost** | Free tier = 1 million API calls/month |
| **Our code** | Already partially implemented |

### What Gets Synced

- **Booking created** → Event inserted into clinic's Google Calendar
- **Booking confirmed** → Event title updated with [CONFIRMED]
- **Booking cancelled** → Event removed from Google Calendar
- **Booking rescheduled** → Old event deleted, new event created

### Clinic Onboarding Flow

```
Onboarding form asks:
  "Which calendar do you use?"
    [ ] Google Calendar (recommended)
    [ ] Other calendar (Apple, Outlook, etc.)
    [ ] None / Don't want to sync

If Google Calendar selected:
  → Show "Connect Google Calendar" button
  → Clinic owner clicks → OAuth consent screen
  → Google redirects back with refresh token
  → We store the token securely
  → All future bookings auto-sync

If "Other" selected:
  → Explain iCal feed option (see Fallback #1)

If "None" selected:
  → Explain dashboard calendar option (see Fallback #2)
```

### Implementation

1. **OAuth endpoint** (`GET /auth/google`) — redirects to Google consent
2. **Callback endpoint** (`GET /auth/google/callback`) — receives code, exchanges for tokens
3. **Token storage** — `clients.google_refresh_token` + `clients.google_calendar_id`
4. **Event sync** — `calendar.events.insert/update/delete` (already in bot-engine.js)
5. **Event ID tracking** — store Google event ID in `appointments` table for updates

---

## Fallback #1: iCal Feed (.ics)

### What It Is
A live URL that generates an iCalendar (.ics) file of all bookings.
Clinic staff can **subscribe** to this feed in ANY calendar app:

- Apple Calendar (iPhone/Mac)
- Outlook
- Google Calendar (ironically)
- Any app supporting iCal

### Why This Is The Best Fallback

| Factor | Why It Works |
|--------|-------------|
| **Zero setup** | No auth, no passwords, no API keys for clinic |
| **Universal** | Works with every calendar app ever made |
| **Read-only** | Clinic can't accidentally delete bookings |
| **Auto-refresh** | Most calendar apps check every 15-60 minutes |

### Clinic Experience

```
"I don't use Google Calendar. I use Apple Calendar."

→ Moon Hands generates a unique feed URL:
   https://your-backend.com/ical/clinic-uuid.ics

→ Clinic copies URL into Apple Calendar:
   File → New Calendar Subscription → Paste URL

→ Done. All bookings appear in Apple Calendar within 15 minutes.
```

### Technical

- **No auth required** — URL contains a UUID that acts as the key
- **Generated on-demand** — each request creates a fresh .ics file
- **Lightweight** — pure text generation, no database writes
- **Secure** — UUID is unguessable (128-bit random)

---

## Fallback #2: Dashboard Calendar

### What It Is
A built-in calendar view in the admin dashboard showing all bookings.
No external sync — purely a visual reference.

### When To Use
- Clinic has no calendar system at all
- Clinic prefers checking bookings in our dashboard
- Clinic only has 1-2 staff who don't use digital calendars

### Features
- Monthly/weekly/daily views
- Color-coded: confirmed (green), pending (yellow), cancelled (red)
- Click to view patient details
- Export as PDF for printing

### Limitation
- Clinic must manually check dashboard (no push notifications)
- No integration with clinic's existing workflow

---

## Singapore-Specific Clinic Systems (Phase 2)

These are popular clinic management systems in Singapore. We can integrate
with them later if multiple clinics request it.

| System | Type | Integration Difficulty |
|--------|------|----------------------|
| **Plato** | Clinic management | Medium — has API |
| **Clinicea** | Clinic management | Medium — has API |
| **WriteUpp** | Aesthetic-focused | Medium — has API |
| **Fresha** | Beauty bookings | Hard — closed API |
| **Acuity Scheduling** | Appointment booking | Easy — Squarespace has API |
| **Timely** | Beauty bookings | Hard — closed API |

---

## Data Model Changes

### Table: `clients` (add columns)

```sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS calendar_provider TEXT 
  CHECK (calendar_provider IN ('google', 'ical', 'dashboard', 'none')) 
  DEFAULT 'none';

ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ical_token UUID DEFAULT gen_random_uuid();
```

### Table: `appointments` (add column)

```sql
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ical_sequence INTEGER DEFAULT 0;
```

---

## Implementation Priority

| Priority | Feature | Effort |
|----------|---------|--------|
| P0 | iCal feed generator | 1-2 hours |
| P0 | `google_event_id` tracking in bookings | 30 min |
| P0 | Calendar delete on cancel | 30 min |
| P1 | Google OAuth flow (auth endpoints) | 2-3 hours |
| P1 | Onboarding form calendar section | 1 hour |
| P2 | Dashboard calendar view | 3-4 hours |
| P3 | Outlook 365 integration | 4-6 hours |
| P3 | CalDAV support | 6-8 hours |

---

## Recommendation

**Ship iCal feed FIRST** (today), then Google Calendar OAuth (this week).

Reason: iCal is the "just works" solution — clinics can subscribe in
Apple/Outlook/Google Calendar with zero code from us. Then Google Calendar
OAuth gives clinics who want full two-way sync a premium option.
