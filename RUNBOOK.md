# MCR — Production Operations & Engineering Runbook

This document details the operational, telecom, compliance, and disaster recovery procedures for **MCR (Missed Call Revenue Recovery)**.

---

## 1. System Architecture

```text
[ Inbound Customer Call ] 
          │ (Contractor phone rings 4-5 times / No Answer)
          ▼
[ Carrier Conditional Forwarding (*61* / *71) ]
          │ (Caller ID Preserved)
          ▼
[ Twilio Voice Webhook: /api/webhooks/twilio/voice ]
          │
    ┌─────┴──────────────────────────────┐
    ▼                                    ▼
[ TwiML Response: Hangup/Reject ]   [ Voice Processor ]
                                         │
                                         ├─ 1. Idempotency Check (CallSid in redis/json)
                                         ├─ 2. Deduplication Window Check (2-hour limit per caller)
                                         ├─ 3. TCPA Quiet Hours Check (8:00 AM - 9:00 PM local)
                                         ├─ 4. Opt-Out Suppression Check (isSuppressed = true)
                                         │
                                         ▼ (Passed)
[ Twilio SMS Dispatch: Auto Text-Back (<60s) ]
          │
          ▼
[ Customer Qualification & Photo Intake: /api/webhooks/twilio/sms ]
          │
          ├─ Trade Emergency Keyword Detection ("burst", "flood", "sparking", "gas")
          ├─ State Machine Progression (Q1 -> Q2 -> Photos -> Complete)
          ├─ Job Card Auto-Generation (status: 'new' or 'booked')
          ├─ Urgent Owner Alert SMS to Contractor Cell
          └─ Outgoing Webhook Trigger (ServiceTitan / Zapier / Housecall Pro)
```

---

## 2. Environment Configuration

Copy `.env.example` to `.env.local` for production:

```bash
# Server Configuration
PORT=3001
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://mcr.yourdomain.com

# Telephony (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
TWILIO_MOCK_MODE=false # Set to false in production

# Database
# If DATABASE_URL is not set, MCR automatically falls back to file-persistent JSON at ./data/mcr_db.json
DATABASE_URL=postgresql://postgres:password@localhost:5432/mcr_db

# Stripe Billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

---

## 3. Production Deployment Guide

### Option A: Docker Compose (Self-Hosted / DigitalOcean / AWS EC2)
```bash
# 1. Clone repository
git clone https://github.com/yourorg/mcr.git /opt/mcr
cd /opt/mcr

# 2. Configure environment
cp .env.example .env.local
nano .env.local

# 3. Build & start containers
docker compose up -d --build

# 4. Verify running health
curl -s http://localhost:3000/api/health | jq
```

### Option B: Vercel / Railway
1. Push git repository to GitHub / GitLab.
2. Link project in Vercel or Railway dashboard.
3. Configure environment variables in Settings.
4. Set build command: `npm run build` and output directory: `.next`.

---

## 4. Twilio 10DLC Campaign Registration (A2P 10DLC)

All local business SMS in the US must be registered with **The Campaign Registry (TCR)** to prevent carrier filtering (Error 30007 / 30008).

### Step-by-Step 10DLC Registration in Twilio Console
1. **Brand Registration**:
   * Navigate to: *Twilio Console -> Messaging -> Regulatory Compliance -> Brands*.
   * Select **Sole Proprietor** (if unincorporated) or **Standard Brand** (if LLC / Corp with EIN).
   * Enter legal entity name, EIN, and business address matching IRS documentation.
2. **Campaign Registration**:
   * Navigate to: *Messaging -> Regulatory Compliance -> Campaigns*.
   * Select Campaign Type: **Customer Care / Mixed**.
   * Description: *"Automated text-back and qualification for customers who miss a phone call with local service contractors."*
   * Sample Message 1: *"Hi, this is [Company]. Sorry we missed your call! Are you experiencing an emergency, or can you tell us what you need help with? Reply STOP to cancel."*
   * Sample Message 2: *"Thanks! Could you text a quick photo of the issue so our tech can review before arrival?"*
   * Opt-In Flow: *"Homeowner initiates inbound phone call to the contractor's published business number; by calling, caller consents to transactional missed-call recovery SMS."*
   * Keywords: `STOP`, `UNSUBSCRIBE`, `CANCEL`, `HELP`.
3. **Number Assignment**:
   * Link your purchased Twilio phone numbers to the verified Messaging Service.

---

## 5. Carrier Forwarding Diagnostic & Troubleshooting

### Diagnostic Decision Tree

```text
Problem: Contractor says "When someone calls me, I don't get the call, it goes straight to text."
Cause:   The contractor dialed *72 instead of *71 (Unconditional Forwarding instead of Conditional).
Fix:     1. Dial *73 to cancel unconditional forwarding.
         2. Dial *71[MCR_NUMBER] to activate conditional "No-Answer" forwarding.
```

### Carrier Dial Codes Quick Reference

| Carrier | Conditional Activation Code | Deactivation Code | Notes |
| :--- | :--- | :--- | :--- |
| **Verizon** | `*71[MCR_NUMBER]` | `*73` | Rings 4–6 times before forwarding. |
| **AT&T** | `*61*[MCR_NUMBER]#` | `#61#` | Standard GSM Call Forward No Reply. |
| **T-Mobile** | `**61*[MCR_NUMBER]**25#` | `##61#` | Sets 25-second ring timer before forwarding. |
| **Spectrum Mobile** | `*71[MCR_NUMBER]` | `*73` | Operates on Verizon MVNO. |
| **Xfinity Mobile** | `*71[MCR_NUMBER]` | `*73` | Operates on Verizon MVNO. |
| **VoIP / PBX** | Portal Call Hunt / Simultaneous Ring | Portal toggle | Enable "Caller ID Pass-through". |

---

## 6. Live Monitoring & Alerts

### Health Check Endpoint
* URL: `GET /api/health`
* Monitored Metrics:
  * Database connectivity & record counts
  * Twilio driver state (Mock vs Live)
  * TCPA quiet hours engine
  * TCR 10DLC compliance state
  * Memory footprint (Heap & RSS)

### Critical Alerts to Configure (Datadog / BetterStack / Sentry)
* **Webhook 5xx Rate > 1%**: Investigate `/api/webhooks/twilio/*`.
* **SMS Delivery Failure Spike**: Twilio Error 30007 / 30008 indicates 10DLC TCR vetting suspension.
* **Carrier Forward Loop**: Caller ID equals MCR number (automatically dropped by Twilio service to prevent infinite loop).

---

## 7. Data Backup & Disaster Recovery

* **File Storage Fallback (`data/mcr_db.json`)**:
  * Automated atomic write prevents corruptions (`writeFile + rename`).
  * Backup script:
    ```powershell
    Copy-Item "data/mcr_db.json" "data/backups/mcr_db_$(Get-Date -Format 'yyyyMMdd_HHmmss').json"
    ```
* **PostgreSQL Backup**:
  ```bash
  pg_dump -U postgres -d mcr_db -F c -b -v -f "/backups/mcr_db_$(date +%Y%m%d).dump"
  ```
