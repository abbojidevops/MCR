# Cloudflare Edge & Zero-Trust Tunnel Deployment Guide for MCR

**Document Version:** 1.0.0  
**Target Audience:** DevOps Engineers, Platform Operators, System Administrators  
**Classification:** Production Infrastructure Specification

---

## 1. Executive Summary

Deploying **MCR (Missed Call Revenue Recovery)** behind Cloudflare provides global CDN caching, DDoS mitigation, and SSL/TLS termination. However, because MCR processes **real-time telephony webhooks from Twilio** and **payment events from Stripe**, specific Cloudflare WAF and proxy settings must be configured to prevent automated webhook drops while maintaining zero-trust origin security.

---

## 2. Recommended Deployment Topology: Cloudflare Tunnel (`cloudflared`)

Cloudflare Tunnel establishes an encrypted, outbound-only connection from your Docker host to Cloudflare's nearest edge data center. **No public IP address and no inbound ports (80/443/3000) need to be open on your firewall.**

```text
                                       Cloudflare Edge
[ Inbound Caller ]                           │
       │                                     │
       ▼                                     │
[ Carrier (*71 / *61) ]                      │
       │                                     │
       ▼                                     │
[ Twilio Telecom ]                           │
       │ (POST Webhook)                      │
       ▼                                     │
[ https://mcr.yourdomain.com ] ─────────────►│
                                             │  WAF Custom Rule:
                                             │  Skip Bot Fight Mode for /api/webhooks/*
                                             │
                                             ▼
                                     [ Cloudflare Tunnel ] (Encrypted QUIC/HTTP2 tunnel)
                                             │
─────────────────────────────────────────────┼──────────────────────────────────────────
                                             ▼  Origin Docker Network (Isolated)
                                     [ cloudflared container ]
                                             │
                                             ▼
                                     [ mcr-saas-app (Next.js) ] ◄──► [ Postgres Database ]
```

### Docker Compose Service Configuration

To run Cloudflare Tunnel natively alongside MCR, add the `tunnel` service to your `docker-compose.yml`:

```yaml
services:
  app:
    # ... existing app configuration ...
    networks:
      - mcr_net

  postgres:
    # ... existing postgres configuration ...
    networks:
      - mcr_net

  tunnel:
    image: cloudflare/cloudflared:latest
    container_name: mcr-cloudflare-tunnel
    restart: unless-stopped
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    command: tunnel --no-autoupdate run
    networks:
      - mcr_net
    depends_on:
      - app

networks:
  mcr_net:
    driver: bridge
```

In your Cloudflare Zero Trust Dashboard:
1. Navigate to **Networks** > **Tunnels** > **Create a Tunnel**.
2. Name the tunnel `mcr-production` and copy the tunnel token to `.env.local` as `CLOUDFLARE_TUNNEL_TOKEN`.
3. Under **Public Hostnames**, add:
   - **Subdomain/Domain:** `mcr.yourdomain.com`
   - **Service Type:** `HTTP`
   - **URL:** `app:3000`

---

## 3. Mandatory Cloudflare WAF Exemption Rules

> [!CAUTION]
> **CRITICAL PRODUCTION REQUIREMENT:**  
> If Cloudflare's "Bot Fight Mode" or "Managed Challenges" are active on your domain, Twilio and Stripe webhook calls will be challenged with JavaScript challenges or CAPTCHAs. Automated webhook clients cannot solve challenges, causing missed call text-backs and billing events to fail.

### Create a WAF Custom Rule (Skip Rule)

1. Open your domain in the **Cloudflare Dashboard**.
2. Go to **Security** > **WAF** > **Custom Rules** > **Create rule**.
3. Configure the rule:
   - **Rule Name:** `Allow Telecom & Billing Webhooks (Scoped)`
   - **Field / Expression (Strictly Scoped to Webhook Paths):**
     ```text
     (http.request.uri.path starts_with "/api/webhooks/")
     ```
   - **Action:** **Skip**
   - **Under "WAF components to skip", check:**
     - `All remaining custom rules`
     - `WAF Managed Rules`
     - `Cloudflare Managed Rules`
     - `Bot Management / Super Bot Fight Mode`
     - `Rate Limiting Rules`
4. Click **Deploy**.

#### Security Rationale & Control Invariant

> [!IMPORTANT]
> **THE WAF SKIP RULE IS NOT THE SECURITY CONTROL:**
> The Cloudflare WAF exemption is strictly a transport-availability configuration to prevent automated third-party webhooks from being dropped by interactive JavaScript/CAPTCHA challenges. 
> 
> **The actual security boundary is enforced 100% at the application layer:**
> - **Twilio Voice & SMS:** Validated using Twilio HMAC-SHA1 cryptographic signatures (`X-Twilio-Signature`) via `TwilioService.validateSignature()`.
> - **Stripe Billing:** Validated using Stripe HMAC-SHA256 signatures (`Stripe-Signature`) via `stripe.webhooks.constructEvent()`.
> - **Carrier Vetting:** Validated using carrier HMAC-SHA256 signatures (`x-carrier-signature`, `x-carrier-timestamp`) via `verifyCarrierHmac()`.
> 
> **Fail-Closed Guarantees:**
> - If auth tokens/secrets are unset: MCR immediately fails closed with **HTTP 503 Service Unavailable**.
> - If signatures are unsigned, forged, or replayed: MCR immediately refuses with **HTTP 403 Forbidden** (or **HTTP 409 Conflict**) and writes nothing to the database.
> - With the WAF exemption active, an unauthenticated attacker sending raw requests to `/api/webhooks/*` is still completely blocked by the application's cryptographic verification.

---

## 4. SSL/TLS Encryption Configuration

In the Cloudflare Dashboard under **SSL/TLS**:

1. **Encryption Mode:** Set to **Full (Strict)**.
   - *Never select "Flexible":* Flexible mode encrypts between the browser and Cloudflare, but talks HTTP to origin. This causes Next.js canonical redirect loops (`ERR_TOO_MANY_REDIRECTS`).
2. **Edge Certificates:**
   - **Always Use HTTPS:** `ON`
   - **Minimum TLS Version:** `TLS 1.2`
   - **HTTP Strict Transport Security (HSTS):** Enabled (Max-Age: 6 months).

---

## 5. Client IP Attribution & Spoofing Protection (`CF-Connecting-IP`)

When traffic is proxied through Cloudflare, the origin socket sees Cloudflare's edge IP rather than the end-user's IP. However, blindly trusting client-supplied headers like `X-Forwarded-For` or `CF-Connecting-IP` allows attackers to bypass rate limiting by rotating headers.

MCR implements hardened client IP resolution in [`src/lib/security/client-ip.ts`](file:///c:/Users/abboj/OneDrive/Desktop/MCR/src/lib/security/client-ip.ts):

```typescript
import { resolveClientIp } from '@/lib/security/client-ip';

const clientIp = resolveClientIp(req);
```

### Verification & Fallback Hierarchy:
1. **Demonstrable Cloudflare Origin Required:** `CF-Connecting-IP` is trusted **only** when the request demonstrably originated from Cloudflare, verified via:
   - Request socket IP matching Cloudflare's published CIDRs (`173.245.48.0/20`, `103.21.244.0/22`, `104.16.0.0/13`, `172.64.0.0/13`, etc.), OR
   - Cloudflare Tunnel shared secret (`CLOUDFLARE_TUNNEL_SECRET` validated against `x-cf-tunnel-secret`).
2. **Unverified Fallback to Socket Address:** If the request arrives directly at the origin without demonstrating Cloudflare provenance:
   - `CF-Connecting-IP`, `X-Forwarded-For`, and `X-Real-IP` are **strictly ignored**.
   - The client IP falls back to the unforgeable TCP socket address.
   - Brute-force attacks sending rotating `X-Forwarded-For` or `CF-Connecting-IP` headers to port 3000 are attributed to the socket IP and throttled with HTTP 429 after 5 failed attempts.

---

## 6. Page Rules & Cache Rules

By default, Next.js server-rendered pages and API routes must never be cached at the edge.

### Cache Rule Configuration
In **Caching** > **Cache Rules** > **Create Rule**:
1. **Rule 1 (Bypass API & Authenticated Dashboards):**
   - Expression: `(http.request.uri.path starts_with "/api/") or (http.request.uri.path starts_with "/dashboard/") or (http.request.uri.path starts_with "/admin/")`
   - Action: **Bypass Cache**
2. **Rule 2 (Static Assets Cache):**
   - Expression: `(http.request.uri.path starts_with "/_next/static/") or (http.request.uri.path starts_with "/images/")`
   - Action: **Eligible for cache** (Edge TTL: 1 month).

---

## 7. Cloudflare Pre-Flight Verification Checklist

Before publishing your production DNS switch:
- [ ] Cloudflare SSL/TLS mode is set to **Full (Strict)**.
- [ ] WAF Custom Rule for `/api/webhooks/` is active with action **Skip**.
- [ ] Webhook URL registered in Twilio Console: `https://mcr.yourdomain.com/api/webhooks/twilio/voice`.
- [ ] Webhook URL registered in Stripe Dashboard: `https://mcr.yourdomain.com/api/webhooks/stripe`.
- [ ] Rate limiting correctly logs individual client IPs using `cf-connecting-ip`.
- [ ] Production build (`npm run deploy:check`) passes all deployment checks.
