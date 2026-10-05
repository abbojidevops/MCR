import crypto from 'crypto';
import { NextRequest } from 'next/server';

/**
 * Cloudflare's published official IPv4 CIDR blocks
 * Source: https://www.cloudflare.com/ips-v4
 */
export const CLOUDFLARE_IPV4_CIDRS: string[] = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];

/**
 * Cloudflare's published official IPv6 CIDR blocks
 * Source: https://www.cloudflare.com/ips-v6
 */
export const CLOUDFLARE_IPV6_CIDRS: string[] = [
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
];

/**
 * Converts standard IPv4 string into 32-bit unsigned integer
 */
export function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (let i = 0; i < 4; i++) {
    const octet = Number(parts[i]);
    if (isNaN(octet) || octet < 0 || octet > 255) return null;
    num = (num << 8) | octet;
  }
  return num >>> 0;
}

/**
 * Tests whether an IPv4 integer matches a CIDR range
 */
export function matchesIpv4Cidr(ipInt: number, cidr: string): boolean {
  const [subnet, prefixStr] = cidr.split('/');
  const prefix = Number(prefixStr);
  const subnetInt = ipv4ToInt(subnet);
  if (subnetInt === null || isNaN(prefix) || prefix < 0 || prefix > 32) return false;
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (subnetInt & mask);
}

/**
 * Converts standard or expanded IPv6 string into 128-bit BigInt
 */
export function ipv6ToBigInt(ip: string): bigint | null {
  try {
    // Handle IPv4-mapped IPv6 (::ffff:192.0.2.128)
    if (ip.startsWith('::ffff:') || ip.startsWith('::FFFF:')) {
      const v4Part = ip.slice(7);
      const v4Int = ipv4ToInt(v4Part);
      if (v4Int !== null) {
        return (0xffffn << 32n) | BigInt(v4Int >>> 0);
      }
    }

    let parts: string[];
    if (ip.includes('::')) {
      const [left, right] = ip.split('::');
      const leftParts = left ? left.split(':') : [];
      const rightParts = right ? right.split(':') : [];
      const missing = 8 - (leftParts.length + rightParts.length);
      if (missing < 0) return null;
      parts = [...leftParts, ...Array(missing).fill('0'), ...rightParts];
    } else {
      parts = ip.split(':');
    }

    if (parts.length !== 8) return null;

    let res = 0n;
    for (let i = 0; i < 8; i++) {
      const val = parseInt(parts[i] || '0', 16);
      if (isNaN(val) || val < 0 || val > 0xffff) return null;
      res = (res << 16n) | BigInt(val);
    }
    return res;
  } catch {
    return null;
  }
}

/**
 * Tests whether an IPv6 BigInt matches a CIDR range
 */
export function matchesIpv6Cidr(ipBigInt: bigint, cidr: string): boolean {
  const [subnet, prefixStr] = cidr.split('/');
  const prefix = Number(prefixStr);
  const subnetBigInt = ipv6ToBigInt(subnet);
  if (subnetBigInt === null || isNaN(prefix) || prefix < 0 || prefix > 128) return false;
  const shift = 128n - BigInt(prefix);
  const mask = prefix === 0 ? 0n : ((1n << 128n) - 1n) ^ ((1n << shift) - 1n);
  return (ipBigInt & mask) === (subnetBigInt & mask);
}

/**
 * Validates basic IP format (IPv4 or IPv6)
 */
export function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const clean = ip.trim();
  if (ipv4ToInt(clean) !== null) return true;
  if (ipv6ToBigInt(clean) !== null) return true;
  return false;
}

/**
 * Strips port numbers and IPv4-mapped IPv6 prefixes
 */
export function normalizeIp(ip: string): string {
  if (!ip) return '127.0.0.1';
  let clean = ip.trim();

  // Strip IPv4-mapped IPv6 prefix
  if (clean.startsWith('::ffff:')) {
    clean = clean.slice(7);
  }

  // Strip port if formatted as ip:port (IPv4 only)
  if (clean.includes('.') && clean.includes(':')) {
    clean = clean.split(':')[0];
  }

  return clean;
}

/**
 * Verifies if a given IP address belongs to Cloudflare's published edge ranges
 */
export function isCloudflareIp(ip: string): boolean {
  const clean = normalizeIp(ip);

  // Check IPv4 CIDRs
  const v4Int = ipv4ToInt(clean);
  if (v4Int !== null) {
    return CLOUDFLARE_IPV4_CIDRS.some((cidr) => matchesIpv4Cidr(v4Int, cidr));
  }

  // Check IPv6 CIDRs
  const v6BigInt = ipv6ToBigInt(clean);
  if (v6BigInt !== null) {
    return CLOUDFLARE_IPV6_CIDRS.some((cidr) => matchesIpv6Cidr(v6BigInt, cidr));
  }

  return false;
}

/**
 * Constant-time string equality check to prevent timing attacks
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (!a || !b) return false;
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Extracts raw socket/peer IP from request runtime
 */
export function getSocketIp(req: Request | NextRequest): string {
  if ('ip' in req && typeof (req as any).ip === 'string' && (req as any).ip) {
    return (req as any).ip;
  }
  if ((req as any).socket?.remoteAddress) {
    return (req as any).socket.remoteAddress;
  }
  if ((req as any).connection?.remoteAddress) {
    return (req as any).connection.remoteAddress;
  }
  return '127.0.0.1';
}

/**
 * Determines whether a request demonstrably originated from Cloudflare.
 * Evaluates:
 * 1. Configured Tunnel Secret header (`x-cf-tunnel-secret` or `x-cloudflare-tunnel-secret`)
 * 2. Socket peer IP verification against Cloudflare's published CIDRs
 */
export function isRequestFromCloudflare(
  req: Request | NextRequest,
  socketIp?: string
): boolean {
  // 1. Verification via Cloudflare Tunnel shared secret
  const configuredSecret = process.env.CLOUDFLARE_TUNNEL_SECRET || process.env.CF_TUNNEL_SECRET;
  const headerSecret =
    req.headers.get('x-cf-tunnel-secret') ||
    req.headers.get('x-cloudflare-tunnel-secret');

  if (configuredSecret && headerSecret) {
    if (constantTimeEqual(headerSecret, configuredSecret)) {
      return true;
    }
  }

  // 2. Verification via socket peer IP matching Cloudflare's published CIDRs
  const effectiveSocket = socketIp || getSocketIp(req);
  if (effectiveSocket && isCloudflareIp(effectiveSocket)) {
    return true;
  }

  return false;
}

/**
 * Resolves trusted client IP for rate-limiting, audit trails, and security gates.
 *
 * POLICY:
 * - `CF-Connecting-IP` is trusted ONLY if the request demonstrably originated from Cloudflare
 *   (via verified Cloudflare edge CIDR or shared tunnel secret).
 * - If NOT demonstrably from Cloudflare, `CF-Connecting-IP`, `X-Forwarded-For`, and `X-Real-IP`
 *   are strictly ignored to prevent client-side header spoofing.
 * - The socket IP is used as the unforgeable fallback.
 */
export function resolveClientIp(
  req: Request | NextRequest,
  options?: { socketIp?: string }
): string {
  const socketIp = options?.socketIp || getSocketIp(req);
  const fromCloudflare = isRequestFromCloudflare(req, socketIp);

  if (fromCloudflare) {
    const cfIp = req.headers.get('cf-connecting-ip');
    if (cfIp && isValidIp(cfIp.trim())) {
      return cfIp.trim();
    }
  }

  // Fall back strictly to unforgeable socket address
  return normalizeIp(socketIp);
}
