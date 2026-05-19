# Pixel Vault - Security Operations Center (SOC)
## Threat Detection & Response Framework

---

## Why Security Monitoring Exists

After exposing credentials in chat, we learned: **security is not optional.**
This system monitors for:
- Stolen/compromised API keys being used
- Brute force attacks on our services
- Unusual cost spikes (indicating abuse)
- Prompt injection attempts on our AI agents
- Data exfiltration patterns
- Credential exposure in conversation logs

---

## Detection Categories

| Category | Icon | What It Catches | Severity |
|----------|------|----------------|----------|
| **auth** | 🔐 | Brute force, credential stuffing | High |
| **api_abuse** | 🛡️ | Unusual volume, scraping attempts | Medium |
| **credential_exposure** | 🔑 | API keys/passwords in messages | **Critical** |
| **cost_anomaly** | 💰 | Spend spikes indicating abuse | High |
| **injection** | 📝 | Prompt injection, SQL injection | High |
| **data_exfil** | 📤 | Bulk data reads, unusual exports | Critical |
| **rate_limit** | ⏱️ | Repeated rate limit violations | Medium |

---

## Detection Thresholds

### Authentication
- **5 failed attempts/hour** per identifier → Medium alert
- **10 failed attempts/hour** per IP → Critical alert (brute force)

### Cost Anomalies
- **2x average daily spend** → High alert
- **3x average daily spend** → Critical alert
- Auto-calculated from rolling 30-day baseline

### API Abuse
- **10 rate limit (429) responses in 10 minutes** → High alert
- **500+ requests/hour from single IP** → Medium alert

### Injection Detection
- Monitors for keywords: `ignore previous`, `system prompt`, `DAN mode`, `jailbreak`, SQL patterns
- Flags conversations containing these patterns

### Credential Exposure
- Scans conversations for: `sk_live_`, `AC` (Twilio), `eyJhbG` (JWT), password patterns
- **Never logs the actual secret** — only the pattern matched

---

## Alert Response

| Severity | Telegram Alert | Auto-Action | Human Required |
|----------|---------------|-------------|----------------|
| **Critical** | 🚨 Immediate | Flags for review | **Yes — within 15 min** |
| **High** | 🔴 Immediate | Logs + pattern tracking | Yes — within 1 hour |
| **Medium** | 🟡 In daily report | None | Review at convenience |
| **Low** | 🟢 In daily report | None | Optional |
| **Info** | 🟢 In daily report | None | Optional |

### Critical Alerts Sent Immediately
- Brute force attack detected
- Credential exposure in conversation
- Cost spike >3x normal
- Data exfiltration pattern detected

### Auto-Mitigation
- **Rate limiting**: Auto-acknowledged, flagged
- **Cost spikes**: Flagged for review (potential abuse)
- **Injection**: Source IP flagged, pattern logged
- **Credential exposure**: **Never auto-mitigated** — always requires human

---

## Monitoring Schedule

| Check | Frequency | Immediate Alert |
|-------|-----------|----------------|
| Security scan (all categories) | Every 10 minutes | Critical + High only |
| Failed auth monitoring | Every 10 minutes | Yes |
| Cost anomaly detection | Every 10 minutes | Yes |
| API abuse detection | Every 10 minutes | Yes |
| Injection detection | Every 10 minutes | Yes |
| Credential exposure scan | Every 10 minutes | **Immediate** |
| Daily security report | 8:15 PM SGT | Summary only |

---

## Database Tables

### security_events
All detected threats logged here with severity, category, resolution status.

### api_access_log
Every API request logged: service, IP, key prefix, status, latency.

### failed_auth_attempts
Failed login/auth attempts: identifier, IP, reason, timestamp.

### cost_baselines
Rolling averages per client/service for anomaly detection.

---

## Views

| View | Purpose |
|------|---------|
| `active_threats` | Unresolved critical/high events |
| `hourly_failed_auth` | Brute force candidates |
| `cost_anomalies` | Clients with abnormal spend |
| `security_dashboard` | Single-row summary for quick status |

---

## Telegram Commands

| Command | What It Shows |
|---------|--------------|
| `/security` | Current threat summary |
| `/threats` | List active (unresolved) threats |
| `/authlog` | Recent failed auth attempts |

---

## Response Playbooks

### Credential Exposure Detected
1. 🚨 Critical alert sent immediately
2. **Rotate the exposed credential within 15 minutes**
3. Check api_access_log for unauthorized usage
4. Review conversation for context
5. Document in security_events

### Brute Force Attack
1. 🚨 Critical alert with source IP
2. Block IP at firewall/VAPI level
3. Check if any successful logins from that IP
4. Force password reset if compromised

### Cost Spike
1. 🔴 High/Critical alert with multiplier
2. Check api_access_log for unusual patterns
3. Verify client isn't under attack
4. Consider pausing client if abuse confirmed

### Injection Attempt
1. 🔴 High alert with matched keywords
2. Review conversation context
3. Ensure AI didn't bypass safety rules
4. Block repeat offenders

---

## Implementation Status

| Component | Status |
|-----------|--------|
| Database schema (security_schema.sql) | ✅ Ready |
| Security monitor (security/monitor.js) | ✅ Ready |
| Scheduler integration | ✅ Ready |
| Telegram alerts | ✅ Ready |
| Auto-mitigation triggers | ✅ Ready |
| Cost baseline calculation | ⏳ Needs 7 days data |
| IP blocking automation | ⏳ Future phase |

---

**Bottom Line: We monitor everything. Every 10 minutes. Critical alerts within seconds.**
