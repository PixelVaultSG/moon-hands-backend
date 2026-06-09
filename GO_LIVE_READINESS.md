# Moon Hands — Go-Live Readiness Assessment

**Date:** 2026-05-24
**Status:** Pre-launch
**First Clinic Target:** TBD

---

## The Honest Assessment

| Area | Status | What's Needed |
|------|--------|--------------|
| **Backend Core** | ✅ Ready | Bot, webhook, security, rate limiting all working |
| **Frontend Website** | ✅ Ready | 5 pages, simulator, pricing, onboarding form |
| **AI Bot Engine** | ✅ Ready | GPT-4o-mini, smart routing, booking state machine |
| **Database** | ✅ Ready | Supabase with all tables, RLS, audit log |
| **Security** | ✅ Ready | 15/15 audit findings fixed, all protections active |
| **Telegram Alerts** | ✅ Ready | All alert templates tested and confirmed working |
| **Cost Protection** | ✅ Ready | Alert-only, never blocks clinic operations |
| **iCal Feed** | ✅ Ready | Auto-generated, works with any calendar app |
| **Device Registration** | ✅ Ready | Master devices registered |
| **WhatsApp Sandbox** | ⚠️ Limited | 360dialog sandbox unreliable — need production for real clinic |
| **Google Calendar OAuth** | 🔄 Needs work | Code exists but no self-serve "Connect" button |
| **Onboarding Automation** | 🔄 Needs work | Form submits but no auto-provision → welcome → live flow |
| **Welcome Email** | 🔄 Not built | Need email template + sending mechanism |
| **Payment Collection** | 🔄 Not built | Need Stripe integration for S$347/S$547 collection |
| **Clinic Dashboard** | 🔄 Preview only | Dashboard is static preview, needs real data |
| **Privacy Policy** | ✅ Ready | Published on website |
| **Terms of Service** | ✅ Ready | Published on website |
| **360dialog Production** | 🔄 Not applied | Need real WABA account |
| **Singapore Phone Number** | 🔄 Not acquired | Need dedicated number for first clinic |

---

## What's Blocking Go-Live

### Critical Path (Must Have Before First Clinic)

| # | Blocker | Effort | Action |
|---|---------|--------|--------|
| 1 | **360dialog Production Account** | 3-7 days | Apply on 360dialog dashboard with Pixel Vault Pte Ltd |
| 2 | **Singapore Phone Number** | 1 day | Get SIM from Singtel/M1/StarHub (~S$15-20/mo) |
| 3 | **Payment Collection (Stripe)** | 1-2 days | Set up Stripe account, integrate with onboarding |
| 4 | **Onboarding → Auto-Provision Flow** | 1 day | Connect form submission to client creation |
| 5 | **Google Calendar Self-Serve** | 1-2 days | Add "Connect Google Calendar" button + OAuth flow |
| 6 | **Welcome Email** | 2-3 hours | Build email template + send on clinic activation |

### Nice-to-Have (Can Add After First Clinic)

| # | Feature | Effort |
|---|---------|--------|
| 7 | Clinic Dashboard (real data) | 2-3 days |
| 8 | Multi-language support (Chinese/Malay) | 1-2 days |
| 9 | Advanced analytics | 2-3 days |
| 10 | Auto-upgrade prompts (cost overusage → higher tier) | 1 day |

---

## Recommended Go-Live Plan

### Phase 1: Foundation (This Week)
- [ ] Apply for 360dialog production account
- [ ] Set up Stripe account for SGD payments
- [ ] Get Singapore phone number
- [ ] Build auto-provision flow (form → client creation)
- [ ] Build welcome email

### Phase 2: Integration (Next Week)
- [ ] Build Google Calendar self-serve OAuth
- [ ] End-to-end test with first friendly clinic
- [ ] Clinic fills onboarding form → auto-provisioned → welcome email → test WhatsApp

### Phase 3: Launch (Week 3)
- [ ] First paying clinic onboarded
- [ ] Monitor real patient interactions
- [ ] Refine based on real data

---

## 360dialog Production Application Checklist

### What You Need
- [ ] Pixel Vault Pte Ltd registration documents (UEN, ACRA biz profile)
- [ ] Dedicated Singapore phone number
- [ ] Business website (your moonhands.io)
- [ ] Business email (hello@moonhands.io or similar)

### Application Steps
1. Go to [hub.360dialog.io](https://hub.360dialog.io)
2. Click "Apply for Production"
3. Fill in Pixel Vault Pte Ltd details
4. Submit UEN and business registration
5. 360dialog reviews (1-3 business days)
6. Meta approves WABA account (2-4 business days)
7. Add your Singapore phone number
8. Verify number via SMS
9. Set webhook URL to `https://moon-hands-backend.onrender.com/webhook/whatsapp`
10. Test with a message

---

## Stripe Integration Plan

### Why Stripe
- Singapore supported ✅
- SGD currency supported ✅
- Recurring subscriptions (monthly/annual) ✅
- Invoice generation ✅
- Webhook for payment events ✅

### What to Build
1. Stripe account setup (you do this)
2. `/api/create-subscription` endpoint
3. Stripe webhook handler for payment events
4. Store subscription status in `clients` table
5. Grace period handling (48h if payment fails)

### Pricing Tiers in Stripe
| Plan | Monthly | Annual (10% off) |
|------|---------|-----------------|
| Basic | S$347 | S$3,468 |
| Premium | S$547 | S$5,468 |

---

## On the Question: Website Form vs Google Forms

**Recommendation: Website form (already built, better integration)**

| Factor | Website Form | Google Forms |
|--------|-------------|--------------|
| **Data flow** | Direct to Supabase ✅ | Needs Zapier/middleware ❌ |
| **Validation** | Server-side, real-time ✅ | Basic, limited ❌ |
| **UX** | Branded, seamless ✅ | Generic, off-brand ❌ |
| **Google Calendar OAuth** | Can embed "Connect" button ✅ | Not possible ❌ |
| **Auto-provision** | Easy webhook trigger ✅ | Complex integration ❌ |
| **File upload** | Can add later ✅ | Built-in but messy ❌ |
| **Cost** | Free (your server) ✅ | Free but limited ❌ |

**Google Forms only wins if:** You want to collect responses without any technical setup. But you're technical now — the website form is superior in every way for your workflow.

**Verdict:** Keep the website form. Add the Google Calendar "Connect" button to it.

---

*Last updated: 2026-05-24*
