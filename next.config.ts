import type { NextConfig } from "next";

/**
 * Enterprise security headers.
 *
 * These are declared in next.config.ts (not only in vercel.json) so the exact same
 * header policy is served by EVERY deployment target: the Railway staging
 * container, the Render blueprint, docker-compose, and the Vercel preset. Defining
 * them at the application layer means a platform whose edge config is missed or
 * misconfigured can still never serve the app without baseline hardening.
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Apply to every route, including API routes and webhooks.
        source: "/(.*)",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
