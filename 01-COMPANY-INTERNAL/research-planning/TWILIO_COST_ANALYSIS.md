# Twilio vs 360dialog - 2 Year Cost Analysis
## Pixel Vault WhatsApp API Provider Comparison

---

## Cost Structure

### Twilio (Pay-Per-Use)
| Component | Cost |
|-----------|------|
| Monthly subscription | **$0** |
| Per WhatsApp message | **$0.005** |
| Per voice minute | ~$0.13 (via VAPI) |

### 360dialog (Subscription)
| Component | Cost |
|-----------|------|
| Monthly subscription | **€49 (~$71)** |
| Per WhatsApp message | $0 (service window) |
| Per voice minute | ~$0.13 (via VAPI) |

---

## 2-Year Cost Projection

### Scenario A: Small Clinic (Starter Tier Client)
**Usage:** 800 messages/month average

| Provider | Year 1 | Year 2 | **2-Year Total** |
|----------|--------|--------|-----------------|
| **Twilio** | $48 | $48 | **$96** |
| **360dialog** | $852 | $852 | **$1,704** |
| **Savings with Twilio** | $804 | $804 | **$1,608** |

**Twilio is 94% cheaper for small clinics**

---

### Scenario B: Medium Clinic (Pro Tier Client)
**Usage:** 3,500 messages/month average

| Provider | Year 1 | Year 2 | **2-Year Total** |
|----------|--------|--------|-----------------|
| **Twilio** | $210 | $210 | **$420** |
| **360dialog** | $852 | $852 | **$1,704** |
| **Savings with Twilio** | $642 | $642 | **$1,284** |

**Twilio is 75% cheaper for medium clinics**

---

### Scenario C: Large Clinic (Heavy Usage)
**Usage:** 8,000 messages/month average

| Provider | Year 1 | Year 2 | **2-Year Total** |
|----------|--------|--------|-----------------|
| **Twilio** | $480 | $480 | **$960** |
| **360dialog** | $852 | $852 | **$1,704** |
| **Savings with Twilio** | $372 | $372 | **$744** |

**Twilio is 44% cheaper for large clinics**

---

## Break-Even Analysis

At what volume does 360dialog become cheaper?

| 360dialog Monthly Cost | Twilio Messages Equivalent | Break-Even |
|------------------------|---------------------------|------------|
| $71/month | 14,200 messages | **Only at 14,200+ messages/month** |

**Reality Check:**
- Our Starter plan limits clients to 1,000 messages/month
- Our Pro plan limits clients to 5,000 messages/month
- Even our heaviest Pro client at 7,500 msgs (grace period) is below the 14,200 break-even
- **360dialog is NEVER cheaper for our client mix**

---

## Risk Analysis

### Twilio Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **Price increase** | Medium | Lock in annual contract if needed; still likely cheaper |
| **Free tier ends** | Low | Twilio has always been pay-per-use; no free tier to end |
| **API changes** | Low | Twilio is stable; backward compatibility maintained |
| **Singapore data center** | N/A | Messages routed through Meta, not Twilio infrastructure |

### 360dialog Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **Price increase** | High | They raised prices before; locked into their pricing |
| **Service degradation** | Medium | Smaller provider; less engineering resources than Twilio |
| **Feature limitations** | Medium | Limited to WhatsApp; Twilio offers broader API ecosystem |
| **Vendor lock-in** | High | Switching requires rebuilding integration |

---

## Scalability Considerations

### Year 1: 10 Clients
| Metric | Twilio | 360dialog |
|--------|--------|-----------|
| Monthly API cost | ~$150 | $710 |
| Annual API cost | $1,800 | $8,520 |
| **Savings** | **—** | **$6,720** |

### Year 2: 30 Clients
| Metric | Twilio | 360dialog |
|--------|--------|-----------|
| Monthly API cost | ~$450 | $2,130 |
| Annual API cost | $5,400 | $25,560 |
| **Savings** | **—** | **$20,160** |

### Year 2: 50 Clients
| Metric | Twilio | 360dialog |
|--------|--------|-----------|
| Monthly API cost | ~$750 | $3,550 |
| Annual API cost | $9,000 | $42,600 |
| **Savings** | **—** | **$33,600** |

**At 50 clients, Twilio saves us $33,600/year — that's 67% of a full-time salary in Singapore.**

---

## Additional Twilio Benefits (Long-Term)

### 1. Ecosystem Expansion
- **SMS fallback:** If WhatsApp fails, send SMS
- **Email integration:** One API for multiple channels
- **Phone numbers:** Buy Singapore numbers through Twilio
- **Analytics:** Built-in messaging analytics

### 2. Reliability
- **Twilio:** Publicly traded, $3B+ revenue, 99.999% SLA
- **360dialog:** Private company, smaller team
- **Uptime matters:** Twilio has better track record for enterprise

### 3. Developer Experience
- **Documentation:** Twilio's docs are industry standard
- **SDKs:** Every programming language supported
- **Community:** Massive developer community

---

## Verdict

# Twilio is the Right Choice — Short AND Long Term

### Cost Savings Over 2 Years:
| Scale | Twilio Cost | 360dialog Cost | **Savings** |
|-------|-------------|----------------|-------------|
| 10 clients | $7,200 | $17,040 | **$9,840** |
| 30 clients | $21,600 | $51,120 | **$29,520** |
| 50 clients | $36,000 | $85,200 | **$49,200** |

### Why It's Sustainable:
1. **No monthly fee** = better margins at every scale
2. **Pay-per-use** = costs grow with revenue
3. **Enterprise-grade** = won't break as we scale
4. **Ecosystem** = room to grow (SMS, email, voice)

### The Only Time We'd Switch:
- If we reach 100+ clients with 15,000+ messages each
- At that scale, 360dialog's flat fee might win
- But that's Year 3-4, and we'd have the revenue to justify it

---

**Bottom Line: Twilio saves us money from Day 1 and keeps saving as we grow. No reason to switch to 360dialog at any point in the next 2 years.**
