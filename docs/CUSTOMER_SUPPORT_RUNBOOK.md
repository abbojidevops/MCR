# Missed Call Recovery (MCR) — Customer Support & Telephony Runbook

**Document Version:** 1.0.0  
**Target Audience:** Tier 1 / Tier 2 Support Engineers, Operations, Onboarding Specialists  
**Classification:** Confidential — Internal Operations Runbook

---

## 1. Overview & Purpose
This runbook provides actionable procedures for diagnosing, resolving, and escalating issues encountered by home-service contractors using the Missed Call Recovery (MCR) platform. It covers:
1. Carrier-specific conditional call forwarding (CCF) configuration and troubleshooting.
2. TCPA and A2P 10DLC compliance and subscriber opt-out disputes.
3. Telephony and SMS delivery failure triage.
4. Emergency job dispatch and manual fallback protocols.

---

## 2. Carrier Conditional Call Forwarding (CCF) Matrix

Conditional Call Forwarding routes inbound calls to the contractor's dedicated MCR Twilio number **only when the contractor is on another call, rejects the call, or does not answer within 15–20 seconds**.

### Standard Activation & Deactivation Codes

| Carrier | CCF Type | Activation Dial String | Deactivation Dial String | Verification Procedure |
| :--- | :--- | :--- | :--- | :--- |
| **Verizon Wireless** | No Answer / Busy | `*71<MCR_NUMBER>` | `*73` | Call from mobile; listen for 2 quick confirmation beeps, then call hangs up. |
| **AT&T Wireless** | No Answer | `*61*<MCR_NUMBER>#` | `#61#` | Dial string, press Call; verify screen popup confirming "Forwarding registration succeeded". |
| **AT&T Wireless** | Busy / Declined | `*67*<MCR_NUMBER>#` | `#67#` | Dial string, press Call. |
| **AT&T Wireless** | Unreachable / Out of Range | `*62*<MCR_NUMBER>#` | `#62#` | Dial string, press Call. |
| **T-Mobile** | All Conditional | `**61*<MCR_NUMBER>**20#` | `##61#` | `**20#` sets delay to 20 seconds (adjustable between 5–30 seconds in 5s increments). |
| **Spectrum / Xfinity Mobile** | Verizon MVNO | `*71<MCR_NUMBER>` | `*73` | Same as Verizon. Requires VoLTE enabled on device. |
| **Cricket Wireless** | AT&T MVNO | `*61*<MCR_NUMBER>#` | `#61#` | Same as AT&T. |
| **US Cellular** | No Answer / Busy | `*92<MCR_NUMBER>` | `*920` | Listen for activation confirmation tone. |
| **Comcast / Spectrum Business Landline** | No Answer | `*92<MCR_NUMBER>` | `*93` | Configure through Business Voice Portal if dial code blocked by PBX. |
| **RingCentral / Vonage VoIP** | Forwarding Rules | Configured in Admin Portal | Configured in Admin Portal | Add MCR number under "Call Handling & Forwarding" after 3 rings (15 seconds). |

### CCF Troubleshooting Procedures

#### Issue A: Contractor dials `*71` and hears a fast busy tone or error message
1. **Prepaid Plan Limitation:** Many prepaid mobile plans (e.g. Cricket Basic, T-Mobile Prepaid, Metro) disable conditional call forwarding by default.
   - *Resolution:* Advise the customer to contact carrier customer service and request "Feature: Conditional Call Forwarding (Busy/No Answer) enabled on line".
2. **Dial Format Error:** Ensure the 10-digit number includes area code without `+1` prefix (e.g. `*712175550190`, NOT `*71+12175550190`).
3. **Wi-Fi Calling Conflict:** Turn off Wi-Fi Calling in phone Settings, dial the activation code over cellular LTE/5G, and then turn Wi-Fi Calling back on.

#### Issue B: Both phones ring simultaneously (Unconditional Forwarding Error)
- **Root Cause:** The customer mistakenly dialed `*72` (Unconditional Forwarding) instead of `*71` (Conditional).
- **Resolution:**
  1. Dial `*73` to cancel all unconditional forwarding.
  2. Confirm test call rings the mobile phone normally.
  3. Re-dial `*71<MCR_NUMBER>`.

---

## 3. TCPA & A2P 10DLC Messaging Compliance Runbook

MCR strictly adheres to Telephone Consumer Protection Act (TCPA) regulations and Cellular Telecommunications Industry Association (CTIA) messaging guidelines.

### Mandatory Compliance Rules
1. **Consent Provenance:** Text-backs are triggered exclusively in response to an inbound call placed voluntarily by the consumer ("inbound call opt-in").
2. **Quiet Hours Enforcement:** Automated SMS text-backs are blocked between **9:00 PM and 8:00 AM recipient local time**. Calls received during quiet hours are queued and delivered at 8:05 AM next morning.
3. **Mandatory Opt-Out Disclosures:** Every initial text-back includes contractor business name, purpose, and `"Reply STOP to unsubscribe"`.

### STOP / UNSUBSCRIBE Keyword Handling
- When a recipient texts `STOP`, `UNSUBSCRIBE`, `CANCEL`, `END`, or `QUIT`:
  1. Twilio and MCR immediately register the phone number in the tenant's `suppression_list`.
  2. MCR logs a revocation entry in `consent_logs` with `consent_status: 'revoked'`.
  3. A standard single confirmation SMS is dispatched: `"You have unsubscribed from notifications for [Business Name]. No more messages will be sent."`
  4. All future automated and manual messages to that phone number are rejected with `SUPPRESSED_PHONE_NUMBER`.

### Re-Opt-In Procedure (START / UNSTOP)
- If a customer previously opted out and wishes to receive updates again:
  1. The recipient must text `START` or `UNSTOP` from their handset to the business number.
  2. Carrier network removes carrier-level suppression.
  3. MCR marks the suppression record inactive and logs a new `inbound_call_opt_in` consent log.
  4. Contractor support **CANNOT** manually remove a recipient from suppression without recipient handset consent.

---

## 4. Telephony & SMS Delivery Failure Triage

### Diagnostic Decision Tree
```
Inbound Call Received
       │
       ▼
Did Twilio Voice Webhook fire? ─── NO ───► Check Carrier CCF forwarding & Twilio Voice URL config
       │ YES
       ▼
Did Twilio validate HMAC signature? ─ NO ─► Verify TWILIO_AUTH_TOKEN in app environment
       │ YES
       ▼
Is recipient in Quiet Hours (9pm-8am)? ─ YES ─► Queued in pending queue until 8:05 AM next morning
       │ NO
       ▼
Is recipient on Suppression List? ── YES ──► Dropped cleanly (TCPA compliance protected)
       │ NO
       ▼
Did Twilio SMS dispatch succeed? ── NO ──► Check Twilio error code (30007, 30008, 30005)
       │ YES
       ▼
Conversation & Job Card created in Dashboard!
```

### Twilio Error Code Quick Reference
- **Error 30007 (Carrier Violation):** Message filtered by carrier spam filter. Verify 10DLC Campaign approval status with TCR in `/admin/launch-gate`.
- **Error 30008 (Unknown Error):** Carrier temporary delivery failure. System retries once after 120 seconds.
- **Error 30005 (Unknown Destination):** Landline number incapable of receiving SMS. System logs "Landline detected; text-back skipped".
- **Error 21610 (Attempt to send to unsubscribed recipient):** Recipient opted out. Verify against `suppression_list`.

---

## 5. Emergency Job Escalation & Manual Fallback Protocols

### Emergency Keyword Triggers
The AI intake engine scans customer replies for safety emergencies:
- **Keywords:** `gas leak`, `gas smell`, `flooding`, `rupture`, `burst pipe`, `sparking`, `breaker smoking`, `sewage backing up`, `no heat infant`, `no heat elderly`.
- **Automated Response:**
  1. Flags job card with `is_emergency: true` (High Priority Red Badge).
  2. Immediately sends emergency SMS notification to contractor owner cell.
  3. Inserts emergency safety disclaimer: `"If you smell gas or see sparking, evacuate immediately and call 911 or your utility company."`

### Manual Text-Back Fallback Procedure
If Twilio reports an outage or SMS delivery delays exceed 3 minutes:
1. Support Engineer accesses Contractor Dashboard > **Missed Calls**.
2. Click caller phone number > **Quick Call Back** or **Copy Formatted Lead Details**.
3. Contractor receives urgent email digest with caller ID, timestamp, and audio voicemail recording (if left).

---

## 6. Tier Escalation Matrix

| Level | Contact Role | Response SLA | Scope |
| :--- | :--- | :--- | :--- |
| **Tier 1** | Onboarding Specialist | < 15 minutes | CCF dial assistance, app login, phone number porting status. |
| **Tier 2** | Technical Support Engineer | < 30 minutes | Webhook delivery failures, Twilio error codes, 10DLC TCR vetting status. |
| **Tier 3** | Core Platform Engineering | < 10 minutes (P1) | Platform 503 outage, Postgres database connectivity, HMAC signature faults. |

---

*End of Runbook.*
