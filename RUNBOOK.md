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

# Platform Operator / Admin Boundary
# MANDATORY: Must be supplied via environment (never baked into Docker image).
# If unset or empty, /admin boundary strictly returns 503 Service Unavailable (no dev fallback).
ADMIN_PASSWORD=your-secure-random-admin-password
SESSION_SECRET=your-secure-signing-secret-key-32bytes

# Telephony (Twilio)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
TWILIO_MOCK_MODE=false # Set to false in production

# Database (PostgreSQL)
# In development, MCR falls back to file-persistent JSON at ./data/mcr_db.json if DATABASE_URL is unset.
# In Docker deployments, Postgres credentials must be supplied via environment variables.
# The legacy password 'mcr_password' is permanently burned and rejected loudly at startup by scripts/db-init.mjs.
POSTGRES_USER=mcr_user
POSTGRES_PASSWORD=generate_a_secure_random_postgres_password_32_chars
POSTGRES_DB=mcr_db
DATABASE_URL=postgresql://mcr_user:generate_a_secure_random_postgres_password_32_chars@postgres:5432/mcr_db
# Security rule: In Docker deployments, Postgres port 5432 is never published to the host machine.
# Migrations & schema application are executed on container startup via scripts/db-init.mjs (which fails loudly on missing or burned default passwords).

# Stripe Billing
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...

# Carrier Webhook Authentication (A2P 10DLC Vetting Callbacks)
# MANDATORY: Must be a high-entropy secret (openssl rand -hex 32).
# If unset, carrier webhook endpoints fail-closed with 503 Service Unavailable.
# NOTE: The legacy placeholder 'mcr-carrier-webhook-secret-2026' is permanently burned and rejected.
CARRIER_WEBHOOK_SECRET=your_32_byte_hex_carrier_webhook_secret
```

### Seeded Tenant Credentials & Demo Walkthrough

MCR commits standard seeded fixtures for evaluation, automated test suites, and interactive sales walkthroughs:

| Tenant Name | Account ID | Email | Password | `is_demo` Flag | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Apex Plumbing & Rooter** | `acc-apex-plumbing` | `demo@apexplumbing.com` | `ApexDemo2026!Secure` | `true` | Interactive Demo Walkthrough (`npm run demo`) |
| **CoolBreeze Heating & Air** | `acc-coolbreeze-hvac` | `owner@coolbreezehvac.com` | `CoolBreeze2026!Secure` | `false` | Production Non-Demo Baseline Tenant |

* **Demo Tenant Invariant**: `acc-apex-plumbing` is strictly marked `is_demo: true`. All simulated walkthrough calls, conversations, and jobs generated for this tenant are unconditionally tagged `is_simulated: true` and excluded from paid customer metrics and reports.
* **Running the Interactive Walkthrough**:
  ```bash
  npm run demo
  ```
  This simulates an inbound missed call through real telecom webhook handlers (`TwilioService.handleInboundCall` and `TwilioService.handleInboundSms`), auto-dispatches text-back, triages emergency leak keywords, accepts MMS photo attachments, generates a qualified job card, and books the job — while proving 100% field-by-field payload invariance across all paid customer metrics.

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

### Option B: Railway (Staging & Production PaaS)
Railway builds this repository through `railway.json` + the root `Dockerfile`, applies the schema via a pre-deploy command, then serves the app with `npm start` behind a `/api/health` healthcheck.

```bash
# 1. Railway project: Deploy from GitHub repo + Add PostgreSQL 16
# 2. Set service variables (Railway reads railway.json automatically):
#      DATABASE_URL=${{Postgres.DATABASE_URL}}
#      ADMIN_PASSWORD=<openssl rand -base64 24>   (>=12 chars, upper+lower+digit)
#      SESSION_SECRET=<openssl rand -hex 32>      (>=32 chars)
#      NEXT_PUBLIC_APP_URL=https://<your-service>.up.railway.app
#      TWILIO_MOCK_MODE=true                      (staging)
# 3. Verify the topology locally BEFORE pushing:
ADMIN_PASSWORD='...' SESSION_SECRET='...' \
DATABASE_URL='postgresql://user:pass@host:5432/mcr_db' \
NEXT_PUBLIC_APP_URL='https://<your-service>.up.railway.app' \
npm run staging:preflight
# 4. After the deploy goes live, smoke-test the running staging service.
#    --wait polls /api/health until the fresh container is serving (default 120s):
npm run staging:smoke -- https://<your-service>.up.railway.app --wait
```

Full procedure, variable reference, rollback and troubleshooting: [Railway Staging Deployment Guide](docs/RAILWAY_STAGING.md).

### Option C: Vercel (static/serverless edge)
1. Push git repository to GitHub / GitLab.
2. Link project in the Vercel dashboard (framework preset: Next.js).
3. Configure environment variables in Settings; security headers are pre-declared in `vercel.json`.
4. Deploy — Vercel handles build (`npm run build`) and routing automatically.

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

---

## 8. Customer Support & Telephony Escalations

For detailed contractor tier-1/tier-2 support, carrier conditional forwarding troubleshooting, and TCPA dispute resolution, see the dedicated [Customer Support & Telephony Runbook](docs/CUSTOMER_SUPPORT_RUNBOOK.md).

---

## 9. Cloudflare Edge & Zero-Trust Tunnel Setup

For deploying MCR behind Cloudflare, setting up Cloudflare Tunnel (`cloudflared`), and mandatory WAF Skip rules for Twilio/Stripe webhooks, see the [Cloudflare Edge & Zero-Trust Deployment Guide](docs/CLOUDFLARE_DEPLOYMENT.md).


