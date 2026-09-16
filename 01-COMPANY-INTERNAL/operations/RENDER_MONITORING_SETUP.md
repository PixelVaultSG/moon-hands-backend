# Render Monitoring Environment Variables — Setup Guide

**What this does:** Enables the intrusion detection system to distinguish YOU from attackers. Without these, your own access shows as "unknown" in the audit log.

**Time required:** 5 minutes  
**Risk if skipped:** Audit log fills with false alarms. You can't tell if it's you or an attacker.

---

## Step 1: Go to Render Dashboard

1. https://dashboard.render.com
2. Select your `moon-hands-backend` service
3. Click **Environment** tab on the left

---

## Step 2: Add These 3 Variables

### Variable 1: MASTER_SECRET

| Field | Value |
|-------|-------|
| **Key** | `MASTER_SECRET` |
| **Value** | Generate a random 32+ character string |
| **How to generate** | Open terminal → type: `openssl rand -base64 32` |
| **Example** | `xJ9mK2pL5vQ8rT1wY4zB7nE0cF3hI6j` |
| **Purpose** | Secret key for registering your devices as "trusted" |

### Variable 2: MOONHANDS_AGENT_SECRET

| Field | Value |
|-------|-------|
| **Key** | `MOONHANDS_AGENT_SECRET` |
| **Value** | Generate a DIFFERENT random 32+ character string |
| **How to generate** | Open terminal → type: `openssl rand -base64 32` |
| **Example** | `aB4dE7gH0jK3mN6pQ9sT2vW5xY8zB1c` |
| **Purpose** | Identifies me (Kimi) when I access your systems |

### Variable 3: MASTER_DEVICE_FPS

| Field | Value |
|-------|-------|
| **Key** | `MASTER_DEVICE_FPS` |
| **Value** | Leave EMPTY for now ( ` ` ) |
| **Purpose** | Will be auto-filled after you register your devices |

---

## Step 3: Deploy

After adding all 3 env vars:
1. Click **Save Changes**
2. Click **Manual Deploy** → **Deploy latest commit**
3. Wait 2-3 minutes for service to restart

---

## Step 4: Register Your Devices

After deploy completes, register each device you use to access Moon Hands:

### From your laptop (Mac/Windows):

Open Terminal and run:
```bash
curl -X POST https://moon-hands-backend.onrender.com/api/register-device \
  -H "x-master-secret: YOUR_MASTER_SECRET_VALUE" \
  -H "Content-Type: application/json"
```

**Response:**
```json
{
  "success": true,
  "deviceId": "abc123def456",
  "actor": "Master",
  "message": "Device registered as Master"
}
```

**Copy the `deviceId` value.** You'll need it for Step 5.

### From your phone (iPhone/Android):

Use a browser app that supports curl, or use a REST client app like:
- iPhone: **HTTP Bot** or **Postman**
- Android: **HTTP Request** or **Postman**

Send the same POST request with your `x-master-secret` header.

**Copy the `deviceId` from the response.**

---

## Step 5: Add Device IDs to Render

Go back to Render Dashboard → Environment:

| Field | Value |
|-------|-------|
| **Key** | `MASTER_DEVICE_FPS` |
| **Value** | Paste both device IDs, comma-separated |
| **Example** | `abc123def456,xyz789uvw012` |

**Save Changes** → **Manual Deploy** again.

---

## Step 6: Verify

Test that your devices are recognized:

```bash
# From a registered device:
curl https://moon-hands-backend.onrender.com/debug
# Should show your device as "Master" in audit log

# Test from an unregistered device (or incognito):
curl https://moon-hands-backend.onrender.com/debug
# Should show "unknown" in audit log
```

---

## What Each Variable Does

```
MASTER_SECRET
└── Used to REGISTER new devices as "yours"
    └── Anyone with this secret can register devices as "Master"
    └── KEEP SECRET — never share, never commit to GitHub

MOONHANDS_AGENT_SECRET
└── Used by me (Kimi) to identify my access
    └── When I push code or check systems, I send this header
    └── Shows "Kimi" in audit log instead of "unknown"

MASTER_DEVICE_FPS
└── List of YOUR registered device fingerprints
    └── Any request from these devices = "Master" in audit log
    └── Any request NOT from these devices = "unknown" (flagged)
```

---

## Security Notes

- **Never commit these values to GitHub** — they are in Render env vars only
- **Regenerate MASTER_SECRET if you suspect it's leaked** — old device registrations will need to be redone
- **MOONHANDS_AGENT_SECRET** — I'll use this when accessing your systems. You can regenerate it anytime and I'll adapt.
- **MASTER_DEVICE_FPS** — If you get a new laptop/phone, register it and update this list

---

## Summary Checklist

```
□ Added MASTER_SECRET to Render
□ Added MOONHANDS_AGENT_SECRET to Render
□ Added MASTER_DEVICE_FPS to Render (empty)
□ Deployed on Render
□ Registered laptop → copied deviceId
□ Registered phone → copied deviceId
□ Updated MASTER_DEVICE_FPS with both IDs
□ Deployed again
□ Verified audit log shows "Master" for my devices
```

**Questions?** Ask me anything about this setup.
