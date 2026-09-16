# Pixel Vault Health Monitoring System
## Client-Facing Service Reliability Framework

---

## Services Monitored

| Service | Provider | Client Impact if Down |
|---------|----------|----------------------|
| Voice AI | VAPI.ai | Patients can't call |
| WhatsApp API | Twilio | Messages not sent/received |
| Database | Supabase | No data, no booking records |
| Calendar Sync | Google/Outlook | Appointments not synced |
| Instagram/Facebook API | Meta | DMs not processed |
| Telegram Bot | BotFather | Admin notifications fail |

---

## Health Check Design

### Level 1: Heartbeat (Every 30 seconds)

```
GET /health/vapi         → Check VAPI API status
GET /health/twilio       → Check Twilio API status  
GET /health/supabase     → Check database connectivity
GET /health/calendar     → Check Google Calendar API
GET /health/instagram    → Check Meta Graph API
GET /health/telegram     → Check Telegram Bot API
```

**Response Format:**
```json
{
  "service": "twilio",
  "status": "healthy",
  "latency_ms": 85,
  "last_success": "2026-04-17T10:30:00Z",
  "error_count_24h": 0
}
```

### Level 2: Functional Test (Every 5 minutes)

- **VAPI:** Place test call, verify connection
- **Twilio:** Send test WhatsApp message, verify delivery
- **Supabase:** Insert test row, verify, delete
- **Calendar:** Create test event, verify, delete
- **Instagram:** Check API token validity
- **Telegram:** Send test message to admin

### Level 3: End-to-End Test (Every 15 minutes)

Simulate full patient journey:
1. Send WhatsApp message as "patient"
2. Verify AI responds
3. Verify response is logged in database
4. Verify admin gets notification

---

## Alert Levels

### INFO (Green)
- Latency > 200ms but < 500ms
- 1-2 failed requests in 1 hour
- **Action:** Log, monitor

### WARNING (Yellow)
- Latency > 500ms or 3-5 failed requests in 1 hour
- **Action:** Send Telegram alert to admin, begin investigation

### CRITICAL (Red)
- Service completely down or 5+ failed requests in 10 minutes
- **Action:** 
  - Send Telegram + SMS alert to admin
  - Start auto-recovery process
  - Update status page for clients

### EMERGENCY (Black)
- Multiple services down simultaneously
- **Action:**
  - Emergency Telegram alert
  - Automatic failover to backup
  - Direct phone call to admin

---

## Auto-Recovery Actions

| Service | Failure | Auto-Recovery Action |
|---------|---------|---------------------|
| **VAPI** | API timeout (3 retries) | Switch to backup VAPI key |
| **Twilio** | Message delivery fail | Retry with exponential backoff (1s, 2s, 4s) |
| **Supabase** | Connection fail | Wait 10s, reconnect, queue writes if needed |
| **Calendar** | Sync fail | Mark as pending, retry every minute |
| **Instagram** | Token expired | Auto-refresh token using stored credentials |
| **Telegram** | Bot unresponsive | Send alert via backup channel (email) |

---

## Client-Facing Status Page

Simple page at: `status.pixelvault.sg`

```
✅ Voice Calls        - Operational (12ms)
✅ WhatsApp Messages   - Operational (85ms)
✅ Database            - Operational (45ms)
✅ Calendar Sync       - Operational (150ms)
✅ Instagram/Facebook  - Operational (200ms)
✅ Telegram Bot        - Operational (180ms)

Last updated: 2026-04-17 10:30 AM SGT
```

**If service is down:**
```
⚠️ WhatsApp Messages  - Degraded Performance
We're investigating delays. ETA: 15 minutes.

Incident #2026-0417-001
Started: 10:15 AM SGT
Status: Investigating
```

---

## SLA Commitments

| Metric | Target |
|--------|--------|
| Voice API uptime | 99.9% |
| WhatsApp delivery | 99.5% |
| AI response time | < 30 seconds |
| Database availability | 99.9% |
| Calendar sync | 99.5% |

**If we miss SLA:**
- Log incident
- Root cause analysis within 24 hours
- Client notification if impact > 30 minutes
- Service credit for extended downtime

---

## Implementation Priority

### Phase 1 (Must Have - Before Go Live)
- ✅ Basic health checks (Level 1)
- ✅ Telegram alerts for WARNING/CRITICAL
- ✅ Auto-retry for message delivery failures
- ✅ Simple status page

### Phase 2 (Nice to Have - Month 2)
- ✅ Functional tests (Level 2)
- ✅ Auto-recovery actions
- ✅ Client-facing incident history
- ✅ SMS backup alerts

### Phase 3 (Advanced - Month 3+)
- ✅ End-to-end tests (Level 3)
- ✅ Predictive failure detection
- ✅ Automatic failover
- ✅ Detailed analytics dashboard

---

**Bottom Line: Zero tolerance for missed messages. Every failure is logged, alerted, and auto-recovered.**
