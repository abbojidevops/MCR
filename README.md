# MCR — Missed Call Revenue Recovery for Local Service Businesses

> **"Turn missed calls into potential booked jobs."**  
> Never lose a high-value customer just because you couldn't answer the phone.

---

## 1. Executive Summary

**MCR (Missed Call Recovery)** is a multi-tenant B2B SaaS designed specifically for local trade and home-service contractors (plumbers, HVAC technicians, electricians, garage door companies, locksmiths, roofers, landscapers, pest control, etc.).

When a business owner or technician is on a job, driving, or after-hours, callers hang up on voicemail and immediately dial competitors. MCR solves this problem reliably:

```
MISSED CALL → CONDITIONAL FORWARDING → AUTOMATIC TEXT-BACK (<60s) → TRADE QUALIFICATION → PHOTO/MMS → JOB CARD CREATION → BUSINESS OWNER NOTIFICATION → RECOVERED REVENUE
```

---

## 2. Core Architecture & Highlights

- **Conditional Call Forwarding (`*61`, `*71`, `*92`, `**004*`)**:
  - The contractor's normal cell phone rings first.
  - If unanswered or busy, the carrier automatically forwards the call to MCR.
  - Caller ID and customer experience are preserved.
- **Strict Multi-Tenant Isolation**:
  - Every tenant record contains `account_id`.
  - Queries and mutations validate tenant ownership before granting access.
- **Qualification State Machine**:
  - `NEW` → `ASK_EMERGENCY` → `ASK_PROBLEM` → `ASK_ADDRESS` → `ASK_PHOTO` → `QUALIFIED`.
  - Emergency keyword detection (`leak`, `burst`, `flood`, `sparks`, `smoke`, `trapped`, etc.) flags `is_emergency = true` and immediately dispatches high-priority owner alerts.
- **Carrier & TCPA Compliance**:
  - **Quiet Hours**: Enforces TCPA/CTIA 8:00 AM – 9:00 PM recipient local time with automatic area-code timezone resolution.
  - **STOP / UNSUBSCRIBE Suppression**: Immediate opt-out suppression prior to message delivery, with immutable audit logging.
  - **A2P 10DLC Compliance State Machine**: Tracks TCR brand & campaign approvals (`signed_up` → `brand_submitted` → `brand_approved` → `campaign_submitted` → `campaign_approved` → `number_linked` → `sms_live`).
- **Owner Field Experience**:
  - Mobile-first dashboard.
  - 1-tap call to customer, 1-tap SMS reply, canned reply templates (`/dispatch`, `/shutoff`, `/pricing`).
  - Daily 6:00 PM executive report and Weekly Recovered-Jobs Report.
- **Subscription Billing (Stripe)**:
  - Starter ($49/mo), Pro ($149/mo), Business ($299/mo).
  - Metered usage tracking for calls, SMS segments, MMS attachments, and overage rates.
- **Dual-Mode Operation**:
  - **Production Mode**: Integrates with live Twilio Voice & SMS webhooks with HMAC-SHA1 signature verification and Stripe webhooks.
  - **Interactive Test & Simulation Mode**: Built-in virtual phone screen and test runner allowing full end-to-end simulation without needing carrier or paid API credentials.

---

## 3. Database Schema

A 35-table PostgreSQL DDL is provided at [`src/db/schema.sql`](file:///c:/Users/abboj/OneDrive/Desktop/MCR/src/db/schema.sql):
- `accounts`, `users`, `account_users`, `business_profiles`, `business_hours`
- `phone_numbers`, `phone_number_assignments`, `contacts`
- `call_records`, `call_events`, `conversations`, `messages`
- `intake_sessions`, `intake_questions`, `intake_answers`
- `jobs`, `job_status_history`
- `notifications`, `notification_preferences`, `canned_replies`
- `suppression_list`, `consent_logs`
- `compliance_registrations`, `compliance_events`
- `subscription_plans`, `subscriptions`, `usage_records`, `invoices`, `payment_events`
- `webhook_events` (Idempotency storage)
- `audit_logs`, `system_errors`, `admin_users`, `trade_templates`, `media_attachments`

---

## 4. Getting Started

### Prerequisites
- Node.js 18+ (tested on Node.js v24)
- npm

### Installation
```bash
# Clone the repository and install dependencies
npm install
```

### Run Automated Tests
```bash
npm test
```
All 10 automated unit & integration tests verify:
1. Strict multi-tenant isolation
2. Webhook idempotency
3. Missed-call detection and text-back delivery
4. 2-Hour deduplication window
5. SMS suppression (STOP/UNSUBSCRIBE)
6. TCPA quiet hours compliance
7. Qualification state machine & emergency job card creation
8. Carrier forwarding code generator
9. Subscription billing states & usage tracking
10. Daily & Weekly recovery report computation

### Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser:
- **Landing Page & ROI Calculator**: `http://localhost:3000`
- **12-Step Setup Wizard**: `http://localhost:3000/onboarding`
- **Owner Dashboard**: `http://localhost:3000/dashboard`
- **Job Cards (Kanban / List)**: `http://localhost:3000/dashboard/jobs`
- **Inbox & 2-Way SMS**: `http://localhost:3000/dashboard/inbox`
- **Carrier Forwarding Codes**: `http://localhost:3000/dashboard/forwarding`
- **A2P 10DLC Compliance**: `http://localhost:3000/dashboard/compliance`
- **Interactive Test Simulator**: `http://localhost:3000/dashboard/test-mode`
- **Admin Control Room**: `http://localhost:3000/admin`

---

## 5. Carrier Forwarding Cheat Sheet

| Carrier | Conditional Forward (No Answer) | Deactivation Code |
| :--- | :--- | :--- |
| **Verizon** | `*71[MCR_NUMBER]` | `*73` |
| **AT&T** | `*61*[MCR_NUMBER]#` | `#61#` or `##004#` |
| **T-Mobile** | `**61*1[MCR_NUMBER]*11*20#` | `##004#` |
| **Xfinity Mobile** | `*71[MCR_NUMBER]` | `*73` |
| **Spectrum Mobile** | `*71[MCR_NUMBER]` | `*73` |
| **UScellular** | `*92[MCR_NUMBER]` | `*920` |
| **Mint Mobile** | `**004*1[MCR_NUMBER]#` | `##004#` |
| **VoIP / PBX** | Set Rollover after 4 rings to MCR number with Caller ID preservation | N/A |
