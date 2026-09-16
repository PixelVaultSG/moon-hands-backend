# MOON HANDS — PRIVACY POLICY
## AI Receptionist Service for Singapore Aesthetic Clinics

**Effective Date:** 2026-05-18  
**Last Updated:** 2026-05-18  
**Legal Entity:** Pixel Vault Pte Ltd (UEN: 202504500D)  
**Registered Address:** 60 Paya Lebar Road, #08-55, Singapore 409051  
**Data Protection Officer (DPO):** pixelvaultsg@gmail.com  
**Product:** Moon Hands  
**Jurisdiction:** Republic of Singapore  

---

## 1. WHO WE ARE

**Pixel Vault Pte Ltd** ("Moon Hands", "we", "us", "our") operates the Moon Hands AI receptionist service for aesthetic clinics in Singapore. We act as a **data intermediary** under the Singapore Personal Data Protection Act 2012 (PDPA) on behalf of the clinics (our Clients) who subscribe to our Service.

**Our DPO can be reached at:**  
- Email: pixelvaultsg@gmail.com  
- Subject line: "DPO — [your query]"  
- Response time: Within 3 business days  

---

## 2. WHAT THIS POLICY COVERS

This Privacy Policy explains how we collect, use, disclose, store, and protect personal data through our Service. It applies to:

- **Patients** who message our Clients' clinics via WhatsApp and interact with our AI
- **Clinic staff** who configure and manage the Service through Telegram
- **Prospective clients** who enquire about or sign up for our Service
- **Website visitors** who browse moonhands.sg

By using our Service or interacting with our AI on behalf of a clinic, you acknowledge that you have read and understood this Privacy Policy.

---

## 3. PERSONAL DATA WE COLLECT

### 3.1 Patient Data (Collected via WhatsApp Conversations)

When patients message a clinic that uses Moon Hands, we may collect:

| Category | Examples | Source |
|----------|----------|--------|
| **Contact Information** | Name, mobile phone number | Voluntarily provided by patient via WhatsApp |
| **Appointment Information** | Preferred dates, times, treatment type, doctor preference | Voluntarily provided during booking conversation |
| **Conversation Content** | Messages sent to and received from the AI, including treatment questions and responses | Generated through WhatsApp interaction |
| **Technical Data** | WhatsApp phone number, message timestamps | Automatically collected from 360dialog webhook |

**What we NEVER collect:**
- Singapore NRIC/FIN numbers
- Passport numbers
- Credit card or banking details
- Medical records or diagnosis information
- Photos or biometric data
- Passwords or authentication credentials

### 3.2 Clinic Data (Provided by Subscribing Clinics)

| Category | Examples | Purpose |
|----------|----------|---------|
| **Business Information** | Clinic name, address, UEN, operating hours | Service configuration |
| **Staff Information** | Name, Telegram user ID, role | Admin access and booking approvals |
| **Service Configuration** | Treatment menu, pricing, FAQ responses, brand voice settings | AI training for that clinic only |
| **Payment Information** | Billing contact, bank transfer details | Subscription billing |

### 3.3 Technical & Usage Data

| Category | Examples | Purpose |
|----------|----------|---------|
| **Device Data** | IP address, User-Agent string, device fingerprint | Security monitoring and intrusion detection |
| **Usage Metrics** | Message counts, response times, feature usage | Cost tracking and service improvement |
| **Log Data** | Error logs, security events, audit trails | Troubleshooting and security compliance |

---

## 4. WHY WE COLLECT PERSONAL DATA (PURPOSES)

### 4.1 Primary Purposes (Consent Obtained via Clinic)

We process patient personal data solely to:

1. **Respond to patient inquiries** about treatments, pricing, and clinic services
2. **Check appointment availability** and propose suitable time slots
3. **Create booking requests** and send them to clinic staff for approval
4. **Send appointment reminders** and follow-up communications
5. **Handle rescheduling and cancellations** with explicit confirmation
6. **Generate daily closing summaries** of next-day appointments for clinic staff
7. **Provide real-time Telegram alerts** to clinic staff when bookings are made or cancelled

### 4.2 Secondary Purposes (Service Operation)

We process clinic data to:

1. **Configure and customise** the AI for each clinic's specific treatments and brand voice
2. **Send billing notifications** and subscription management communications
3. **Provide usage reports** and analytics via the Telegram admin interface
4. **Maintain service security** through monitoring, rate limiting, and intrusion detection
5. **Comply with legal obligations** under Singapore law

### 4.3 What We Do NOT Use Data For

We expressly do **NOT**:
- Use patient conversations to train AI models for other clinics
- Share patient data between different clinic clients
- Sell, rent, or trade personal data to third parties
- Use data for marketing purposes without explicit consent
- Send promotional materials to patients
- Make medical diagnoses or treatment recommendations (our AI provides information only)

---

## 5. LEGAL BASIS FOR PROCESSING

### 5.1 Deemed Consent (PDPA Section 15)

When a patient voluntarily messages a clinic's WhatsApp number and provides personal data for the purpose of making an inquiry or booking an appointment, they are deemed to have consented to our collection and use of that data for those purposes.

### 5.2 Consent Through Clinic Relationship

Our Client clinics are responsible for obtaining appropriate consent from their patients for AI-mediated communications. This is typically done through:
- Clinic privacy notices displayed at the premises
- Registration forms with consent clauses
- Website privacy policies
- Notices on WhatsApp Business profiles

### 5.3 Contractual Necessity

We process clinic staff data and configuration data as necessary to perform our contract with the subscribing clinic.

### 5.4 Legitimate Interests

We process technical data (IP addresses, device fingerprints) for:
- Fraud prevention and abuse detection
- Service security and intrusion detection
- Debugging and performance optimisation

---

## 6. HOW WE SHARE PERSONAL DATA

### 6.1 Third-Party Service Providers

We engage the following service providers who process personal data on our behalf:

| Provider | Location | Purpose | Data Transferred | Safeguards |
|----------|----------|---------|-----------------|------------|
| **Supabase** | Singapore (primary) | Database storage | All patient and clinic data | AES-256 encryption at rest; TLS in transit; row-level security |
| **OpenAI** | United States | AI conversation processing | Conversation messages (anonymised session IDs) | Data Processing Addendum; API data not used for model training |
| **360dialog** | Germany/EU | WhatsApp Business API routing | WhatsApp phone numbers and message content | GDPR-compliant; WhatsApp Business Terms |
| **Telegram** | Multiple (EU/Singapore) | Admin alerts and bot interface | Booking summaries, alert notifications | End-to-end encryption available; bot token authentication |
| **Render** | United States | Cloud hosting and deployment | Encrypted application logs and runtime data | SOC 2 Type II; encrypted storage |

### 6.2 Overseas Data Transfers

Personal data may be transferred outside Singapore to the United States (OpenAI, Render) and the European Union (360dialog, Telegram). We ensure such transfers are protected by:

- **Legally enforceable contractual clauses** requiring comparable protection to PDPA standards
- **Data Processing Agreements** with all processors
- **Encryption** of all data in transit and at rest
- **Minimal data exposure** — only conversation content is sent to OpenAI; patient identifiers remain in our Singapore-hosted database

### 6.3 Disclosure to Clinic (Data Controller)

Patient data collected through WhatsApp conversations is accessible to the subscribing clinic through:
- Telegram booking approval interface
- Daily closing summary reports
- Data export functionality (upon request)

The clinic is the data controller for patient data. We act as their data intermediary.

### 6.4 Legal Disclosures

We may disclose personal data if required by:
- Singapore law or court order
- Regulatory authorities (PDPC, Ministry of Health, police)
- To protect our legal rights or the safety of our users

---

## 7. DATA RETENTION

### 7.1 Patient Conversation Data

- **Active subscription:** Retained for the duration of the clinic's subscription
- **After cancellation:** Retained for **90 days** to allow data export, then permanently deleted
- **Booking records:** Retained for 2 years for clinic reference (anonymised after 90 days post-cancellation)

### 7.2 Clinic Configuration Data

- **Active subscription:** Retained for the duration of the subscription
- **After cancellation:** Retained for **30 days** for reactivation, then permanently deleted

### 7.3 Security & Audit Logs

- **Security event logs:** Retained for 1 year
- **Audit trail:** Retained for 1 year
- **Access logs:** Retained for 6 months

### 7.4 Technical & Usage Data

- **Aggregated usage metrics:** Retained for 2 years (anonymised)
- **Individual usage logs:** Retained for 90 days

---

## 8. DATA SECURITY MEASURES

We implement the following security measures to protect personal data:

### 8.1 Technical Security

| Measure | Implementation |
|---------|---------------|
| **Encryption at rest** | AES-256 encryption on Supabase database |
| **Encryption in transit** | TLS 1.3 for all data transmission |
| **Row-level security (RLS)** | Clinic data strictly isolated; no cross-tenant access |
| **Prompt injection detection** | Real-time scanning of all incoming messages for injection attacks |
| **Rate limiting** | Per-patient and per-clinic rate limits to prevent abuse |
| **Input sanitisation** | Automatic stripping of HTML, scripts, and malicious content |
| **API authentication** | HMAC signature verification on all webhooks |
| **Cost protection** | Per-clinic daily spending caps |

### 8.2 Administrative Security

| Measure | Implementation |
|---------|---------------|
| **Data Protection Officer** | Appointed DPO with direct reporting to management |
| **Access control** | Staff access limited to Telegram admin interface only |
| **No direct database access** | Even clinic owners cannot access raw database |
| **Security audits** | Weekly automated security scans |
| **Intrusion detection** | Real-time monitoring with Telegram alerts for suspicious activity |
| **Staff training** | Annual data protection training |

### 8.3 Physical Security

All data is stored in cloud infrastructure (Supabase, Render) with SOC 2 Type II certification. No patient data is stored on local devices.

---

## 9. DATA BREACH NOTIFICATION

### 9.1 Our Obligation

In the event of a data breach affecting personal data:

1. **Within 24 hours:** Internal assessment of breach scope and impact
2. **Within 72 hours (3 calendar days):** Notify the Personal Data Protection Commission (PDPC) if the breach is notifiable
3. **As soon as practicable:** Notify affected clinics and individuals if the breach is likely to result in significant harm

### 9.2 What Constitutes a Notifiable Breach

Under PDPA, a breach is notifiable if it:
- Results in, or is likely to result in, significant harm to affected individuals
- Involves personal data of 500 or more individuals

### 9.3 Clinic's Obligation

Clinics must notify us within **24 hours** of discovering or suspecting any data breach involving patient data processed through our Service.

---

## 10. YOUR RIGHTS UNDER PDPA

### 10.1 Access Right

You have the right to request access to the personal data we hold about you. We will respond within **30 calendar days** of receiving your request.

**How to request:** Email pixelvaultsg@gmail.com with subject line "DPO — Data Access Request" and provide:
- Your full name
- Your WhatsApp phone number
- The clinic you interacted with
- Date range of interaction (if known)

**Fee:** We do not charge for the first access request per year. Subsequent requests may incur a reasonable administrative fee of S$50.

### 10.2 Correction Right

You have the right to request correction of inaccurate or incomplete personal data. We will respond within **30 calendar days**.

**How to request:** Email pixelvaultsg@gmail.com with subject line "DPO — Data Correction Request" and provide:
- The specific data to be corrected
- Supporting documentation (if applicable)

### 10.3 Withdrawal of Consent

You may withdraw your consent for us to process your personal data at any time. However, please note that:
- Withdrawing consent will prevent the AI from responding to your future messages
- Existing bookings will not be affected
- We may need to retain certain data for legal compliance even after withdrawal

**How to withdraw:** Email pixelvaultsg@gmail.com with subject line "DPO — Consent Withdrawal" or inform the clinic directly.

### 10.4 Deletion Right

You may request deletion of your personal data. We will:
- Delete all conversation data and appointment records within **14 days**
- Retain anonymised usage metrics for service improvement
- Notify you once deletion is complete

**How to request:** Email pixelvaultsg@gmail.com with subject line "DPO — Data Deletion Request"

### 10.5 Data Portability

Upon request, we can provide your data in a commonly used machine-readable format (JSON or CSV) within 30 days.

---

## 11. AI PROCESSING & DATA USE

### 11.1 How Our AI Works

Moon Hands uses OpenAI's GPT-4o-mini to process patient conversations. Important facts:

- **No model training on your data:** OpenAI does not use API-submitted data to train or improve their models (as per OpenAI's Business Terms)
- **Session-based processing:** Each conversation is processed in real-time; conversation history is maintained only for context within the same chat session
- **Clinic-specific responses:** AI responses are based solely on each clinic's configured treatment data, FAQ, and brand voice settings
- **No cross-clinic learning:** Patient conversations from Clinic A are never used to inform responses for Clinic B

### 11.2 Human-in-the-Loop

**Every booking requires explicit clinic approval.** Our AI creates booking requests; clinic staff must approve via Telegram before any appointment is confirmed. This ensures human oversight of all patient interactions.

### 11.3 Cancellation Safety

Before cancelling any booking, our AI requires explicit patient confirmation with specific wording. This prevents accidental cancellations.

---

## 12. COOKIES & WEBSITE TRACKING

Our website (moonhands.sg) uses:

| Cookie Type | Purpose | Duration |
|-------------|---------|----------|
| **Essential** | Website functionality, simulator state | Session |
| **Analytics** | Anonymous visitor statistics (no personal data) | 90 days |

We do **not** use:
- Third-party advertising cookies
- Cross-site tracking pixels
- Social media tracking widgets
- Retargeting cookies

---

## 13. CHILDREN'S PRIVACY

Our Service is not intended for individuals under 18 years of age. We do not knowingly collect personal data from children. If you believe we have inadvertently collected data from a minor, please contact us immediately at privacy@pixelvault.sg and we will delete the data within 48 hours.

---

## 14. CHANGES TO THIS POLICY

We may update this Privacy Policy from time to time to reflect:
- Changes in our practices
- New legal requirements
- New service features

**We will notify you of material changes by:**
- Posting the updated policy on our website with a new effective date
- Sending a notification via the Telegram admin bot to all subscribed clinics
- Updating the "Last Updated" date at the top of this document

Material changes will take effect **30 days** after posting. Continued use of the Service after that date constitutes acceptance of the updated Policy.

---

## 15. CONTACT US

For any privacy-related questions, concerns, or to exercise your rights:

**Data Protection Officer**  
Pixel Vault Pte Ltd  
Email: pixelvaultsg@gmail.com (subject line: "DPO — [your query]")  
Address: 60 Paya Lebar Road, #08-55, Singapore 409051  

**Response times:**
- General enquiries: 3 business days
- Data access/correction requests: 30 calendar days
- Data breach reports: 24 hours

If you are not satisfied with our response, you may lodge a complaint with the **Personal Data Protection Commission (PDPC)** at https://www.pdpc.gov.sg.

---

## 16. COMPLIANCE CERTIFICATION

This Privacy Policy is designed to comply with:

- **Personal Data Protection Act 2012 (Singapore)** — all 11 data protection obligations
- **PDPA (Amendment) Act 2020** — mandatory data breach notification
- **PDPC Advisory Guidelines** — healthcare sector guidance (May 2024)
- **Singapore Medical Council guidelines** — ethical standards for patient data

**Policy version:** 1.0  
**Next review date:** 2026-11-18 (every 6 months)  
**Approved by:** Data Protection Officer, Pixel Vault Pte Ltd

---

*Pixel Vault Pte Ltd (UEN: 202504500D)*  
*60 Paya Lebar Road, #08-55, Singapore 409051*
