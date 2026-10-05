(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { NextRequest } from 'next/server';

import { validateSchemaSyntax, validateDatabaseCredentials } from '../scripts/db-init.mjs';
import { middleware } from '@/middleware';
import { POST as adminLoginHandler } from '@/app/api/admin/login/route';
import { POST as loginHandler } from '@/app/api/auth/login/route';
import { clearAllRateLimits } from '@/lib/auth/rate-limiter';
import { resolveClientIp, isCloudflareIp } from '@/lib/security/client-ip';
import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

function createMockRequest(
  url: string,
  options: { method?: string; body?: any; headers?: Record<string, string>; cookie?: string } = {}
) {
  const reqHeaders = new Headers(options.headers || {});
  if (options.body) {
    reqHeaders.set('content-type', 'application/json');
  }
  if (options.cookie) {
    reqHeaders.set('cookie', `${SESSION_COOKIE_NAME}=${options.cookie}`);
  }
  return new NextRequest(new URL(url, 'http://localhost:3001'), {
    method: options.method || 'GET',
    headers: reqHeaders,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

test('DEP-1: Database Isolation Topology — docker-compose.yml Does Not Publish Port 5432 to Host', () => {
  const composePath = path.join(process.cwd(), 'docker-compose.yml');
  const content = fs.readFileSync(composePath, 'utf-8');

  // Must NOT publish port 5432 to host
  assert.equal(
    content.includes('5432:5432'),
    false,
    'Postgres port 5432 must NEVER be published to the host machine'
  );
  assert.equal(
    /ports:\s*-\s*['"]?5432/i.test(content),
    false,
    'No host port binding for 5432 allowed'
  );

  // Must mount persistent database volume
  assert.ok(
    content.includes('pg_data:/var/lib/postgresql/data'),
    'Postgres must store data in a persistent volume (pg_data)'
  );
});

test('DEP-2: Production Start Path — Uses NODE_ENV=production and npm start (No Dev Server)', () => {
  const dockerfilePath = path.join(process.cwd(), 'Dockerfile');
  const dockerfile = fs.readFileSync(dockerfilePath, 'utf-8');

  assert.ok(
    dockerfile.includes('ENV NODE_ENV=production'),
    'Dockerfile must set NODE_ENV=production'
  );
  assert.ok(
    dockerfile.includes('CMD ["npm", "start"]'),
    'Dockerfile runner stage must start via CMD ["npm", "start"] rather than dev server'
  );

  const composePath = path.join(process.cwd(), 'docker-compose.yml');
  const compose = fs.readFileSync(composePath, 'utf-8');
  assert.ok(
    compose.includes('NODE_ENV=production'),
    'docker-compose.yml must specify NODE_ENV=production'
  );
  assert.ok(
    compose.includes('npm start'),
    'docker-compose.yml command must use npm start'
  );
});

test('DEP-3: Database Initialization Tooling — scripts/db-init.mjs Exists and is Packaged in Image', () => {
  const dbInitPath = path.join(process.cwd(), 'scripts', 'db-init.mjs');
  assert.ok(fs.existsSync(dbInitPath), 'scripts/db-init.mjs must exist in the repository');

  const dockerfilePath = path.join(process.cwd(), 'Dockerfile');
  const dockerfile = fs.readFileSync(dockerfilePath, 'utf-8');
  assert.ok(
    dockerfile.includes('scripts/db-init.mjs'),
    'Dockerfile must copy scripts/db-init.mjs into the runtime container'
  );
});

test('DEP-4: Malformed Schema Loud Failure — Syntax Flaws (e.g. Missing Comma) Fail Loudly', () => {
  // 1. Real schema must be syntactically valid
  const realSchemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
  const realSchema = fs.readFileSync(realSchemaPath, 'utf-8');
  assert.doesNotThrow(() => {
    validateSchemaSyntax(realSchema);
  }, 'Production schema.sql must be completely valid SQL');

  // 2. Schema with missing comma must throw syntax error loudly
  const brokenSchema = `
CREATE TABLE appointments (
    id UUID PRIMARY KEY
    customer_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
  `;
  assert.throws(
    () => {
      validateSchemaSyntax(brokenSchema);
    },
    /missing comma/,
    'A missing comma between column definitions must fail the deploy loudly'
  );

  // 3. Unbalanced parenthesis must throw syntax error
  const unbalancedSchema = `
CREATE TABLE unclosed (
    id UUID PRIMARY KEY,
    name VARCHAR(255)
  `;
  assert.throws(
    () => {
      validateSchemaSyntax(unbalancedSchema);
    },
    /Unbalanced parentheses/,
    'Unbalanced parenthesis must fail the deploy loudly'
  );
});

test('DEP-5: Admin Boundary Fail-Closed — Middleware Returns 503 When ADMIN_PASSWORD Unset', async () => {
  const originalAdminPw = process.env.ADMIN_PASSWORD;

  try {
    // 1. When ADMIN_PASSWORD is unset
    delete process.env.ADMIN_PASSWORD;

    const req = createMockRequest('http://localhost:3001/admin/concierge');
    const res = await middleware(req);

    assert.equal(
      res.status,
      503,
      'Accessing /admin/* when ADMIN_PASSWORD is unset must fail closed with 503 Service Unavailable'
    );
    const body = await res.json();
    assert.match(body.error, /ADMIN_PASSWORD/);

    // 2. When ADMIN_PASSWORD is empty string
    process.env.ADMIN_PASSWORD = '   ';
    const reqEmpty = createMockRequest('http://localhost:3001/admin/launch-gate');
    const resEmpty = await middleware(reqEmpty);

    assert.equal(
      resEmpty.status,
      503,
      'Accessing /admin/* when ADMIN_PASSWORD is whitespace must fail closed with 503'
    );
  } finally {
    if (originalAdminPw !== undefined) {
      process.env.ADMIN_PASSWORD = originalAdminPw;
    } else {
      delete process.env.ADMIN_PASSWORD;
    }
  }
});

test('DEP-6: Admin Login Boundary 503 Fail-Closed & Constant-Time Auth', async () => {
  const originalAdminPw = process.env.ADMIN_PASSWORD;

  try {
    // 1. Unset ADMIN_PASSWORD -> 503
    delete process.env.ADMIN_PASSWORD;
    const reqUnset = createMockRequest('http://localhost:3001/api/admin/login', {
      method: 'POST',
      body: { password: 'any_password' },
    });
    const resUnset = await adminLoginHandler(reqUnset);
    assert.equal(
      resUnset.status,
      503,
      'POST /api/admin/login must return 503 when ADMIN_PASSWORD is not configured'
    );

    // 2. Configured ADMIN_PASSWORD
    const testSecret = 'SuperSecureAdminPassword2026!';
    process.env.ADMIN_PASSWORD = testSecret;

    // Wrong password -> 401
    const reqWrong = createMockRequest('http://localhost:3001/api/admin/login', {
      method: 'POST',
      body: { password: 'WrongPassword123' },
    });
    const resWrong = await adminLoginHandler(reqWrong);
    assert.equal(resWrong.status, 401, 'Wrong password must return 401');

    // Correct password -> 200 + admin session cookie
    const reqCorrect = createMockRequest('http://localhost:3001/api/admin/login', {
      method: 'POST',
      body: { password: testSecret },
    });
    const resCorrect = await adminLoginHandler(reqCorrect);
    assert.equal(resCorrect.status, 200, 'Correct password must return 200');

    const setCookie = resCorrect.headers.get('set-cookie');
    assert.ok(setCookie, 'Session cookie must be set');
    assert.match(setCookie, new RegExp(`${SESSION_COOKIE_NAME}=`));

    // Verify issued token has admin role
    const tokenMatch = setCookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    assert.ok(tokenMatch);
    const session = verifySessionToken(tokenMatch[1]);
    assert.ok(session);
    assert.equal(session.role, 'admin', 'Issued session must have admin role');
  } finally {
    if (originalAdminPw !== undefined) {
      process.env.ADMIN_PASSWORD = originalAdminPw;
    } else {
      delete process.env.ADMIN_PASSWORD;
    }
  }
});

test('DEP-7: Image Secret Hygiene — .dockerignore Excludes Secrets, node_modules, and DB', () => {
  const ignorePath = path.join(process.cwd(), '.dockerignore');
  assert.ok(fs.existsSync(ignorePath), '.dockerignore must exist');

  const content = fs.readFileSync(ignorePath, 'utf-8');
  assert.ok(content.includes('.env*'), '.dockerignore must exclude .env* files');
  assert.ok(content.includes('node_modules'), '.dockerignore must exclude node_modules');
  assert.ok(content.includes('.next'), '.dockerignore must exclude .next build cache');
  assert.ok(content.includes('data/*.json'), '.dockerignore must exclude persistent local database JSON');
});

test('DEP-8: Operator Documentation — RUNBOOK.md §2 Documents ADMIN_PASSWORD & Fail-Closed Guarantee', () => {
  const runbookPath = path.join(process.cwd(), 'RUNBOOK.md');
  const content = fs.readFileSync(runbookPath, 'utf-8');

  assert.ok(content.includes('ADMIN_PASSWORD'), 'RUNBOOK.md §2 must document ADMIN_PASSWORD');
  assert.ok(content.includes('503 Service Unavailable'), 'RUNBOOK.md §2 must document 503 fail-closed guarantee');
  assert.ok(content.includes('db-init.mjs'), 'RUNBOOK.md §2 must document db-init.mjs');
});

test('T21a-1: docker-compose.yml Takes DB Credentials from Environment (No Hardcoded Password)', () => {
  const composePath = path.join(process.cwd(), 'docker-compose.yml');
  const content = fs.readFileSync(composePath, 'utf-8');

  // Must not have hardcoded mcr_password
  assert.equal(
    content.includes('mcr_password'),
    false,
    'docker-compose.yml must not contain hardcoded "mcr_password"'
  );

  // Must reference environment variables
  assert.match(content, /POSTGRES_PASSWORD:\s*\$\{POSTGRES_PASSWORD\}/);
  assert.match(content, /DATABASE_URL=\$\{DATABASE_URL\}/);
});

test('T21a-2: validateDatabaseCredentials Fails Loudly on Missing or Burned Default Password', () => {
  // 1. Burned password mcr_password in DATABASE_URL
  assert.throws(
    () => {
      validateDatabaseCredentials({
        databaseUrl: 'postgresql://mcr_user:mcr_password@postgres:5432/mcr_db',
      });
    },
    /burned or default database password/,
    'Burned default password in DATABASE_URL must throw fatal error'
  );

  // 2. Burned password in POSTGRES_PASSWORD environment variable
  const originalPg = process.env.POSTGRES_PASSWORD;
  try {
    process.env.POSTGRES_PASSWORD = 'mcr_password';
    assert.throws(
      () => {
        validateDatabaseCredentials({ allowNoDb: true });
      },
      /burned or default database password in POSTGRES_PASSWORD/
    );
  } finally {
    if (originalPg !== undefined) process.env.POSTGRES_PASSWORD = originalPg;
    else delete process.env.POSTGRES_PASSWORD;
  }

  // 3. Empty password in DATABASE_URL
  assert.throws(
    () => {
      validateDatabaseCredentials({
        databaseUrl: 'postgresql://mcr_user:@postgres:5432/mcr_db',
      });
    },
    /DATABASE_URL must specify a password/
  );

  // 4. Valid strong password passes cleanly
  assert.doesNotThrow(() => {
    validateDatabaseCredentials({
      databaseUrl: 'postgresql://mcr_user:V3ryStr0ngRotat3dPass2026!@postgres:5432/mcr_db',
    });
  });
});

test('T21b-1: Spoofed X-Forwarded-For Headers from Unverified Origin Do Not Defeat Login IP Rate Limiting', async () => {
  clearAllRateLimits();

  // Send 5 failed login attempts with rotating X-Forwarded-For headers from the same unverified socket
  for (let i = 1; i <= 5; i++) {
    const req = createMockRequest('http://localhost:3001/api/auth/login', {
      method: 'POST',
      body: { email: `unique_user_${i}@example.com`, password: 'WrongPassword!' },
      headers: { 'x-forwarded-for': `198.51.100.${i}` },
    });
    const res = await loginHandler(req);
    assert.equal(res.status, 401, `Attempt ${i} must return 401`);
  }

  // Attempt 6 with yet another different X-Forwarded-For header MUST be throttled (429)
  // because the unverified socket IP (127.0.0.1) is used instead of the spoofed header
  const req6 = createMockRequest('http://localhost:3001/api/auth/login', {
    method: 'POST',
    body: { email: 'unique_user_6@example.com', password: 'WrongPassword!' },
    headers: { 'x-forwarded-for': '198.51.100.6' },
  });
  const res6 = await loginHandler(req6);
  assert.equal(res6.status, 429, 'Attempt 6 must be throttled with 429 despite rotating X-Forwarded-For');
  const body6 = await res6.json();
  assert.match(body6.error, /too many failed login attempts/i);

  clearAllRateLimits();
});

test('T21b-2: Spoofed CF-Connecting-IP Header from Non-Cloudflare Socket Is Ignored and Fails Back to Socket IP', () => {
  // Direct client sends fake cf-connecting-ip without Cloudflare provenance
  const req = createMockRequest('http://localhost:3001/api/auth/login', {
    headers: { 'cf-connecting-ip': '8.8.8.8', 'x-forwarded-for': '1.2.3.4' },
  });

  const resolvedIp = resolveClientIp(req);
  assert.equal(
    resolvedIp,
    '127.0.0.1',
    'Unverified request must ignore cf-connecting-ip and x-forwarded-for, resolving to socket IP'
  );
});

test('T21b-3: Legitimate Cloudflare Request (CIDR or Tunnel Secret) Preserves CF-Connecting-IP Attribution', () => {
  // 1. Verification via Cloudflare Tunnel Secret
  process.env.CLOUDFLARE_TUNNEL_SECRET = 'super-secret-tunnel-token-2026';
  try {
    const reqTunnel = createMockRequest('http://localhost:3001/api/auth/login', {
      headers: {
        'x-cf-tunnel-secret': 'super-secret-tunnel-token-2026',
        'cf-connecting-ip': '203.0.113.195',
      },
    });
    const ipTunnel = resolveClientIp(reqTunnel);
    assert.equal(ipTunnel, '203.0.113.195', 'Valid tunnel secret must trust CF-Connecting-IP');
  } finally {
    delete process.env.CLOUDFLARE_TUNNEL_SECRET;
  }

  // 2. Verification via published Cloudflare edge CIDR
  const reqEdge = createMockRequest('http://localhost:3001/api/auth/login', {
    headers: {
      'cf-connecting-ip': '198.51.100.88',
    },
  });
  // Simulate request arriving from Cloudflare edge IP (172.64.10.5 in 172.64.0.0/13)
  const ipEdge = resolveClientIp(reqEdge, { socketIp: '172.64.10.5' });
  assert.equal(ipEdge, '198.51.100.88', 'Request from Cloudflare CIDR must trust CF-Connecting-IP');
  assert.equal(isCloudflareIp('172.64.10.5'), true);
  assert.equal(isCloudflareIp('192.168.1.1'), false);
});

test('T21c-1: WAF Webhook Exemption Documentation Strictly Scoped and Defines App-Level Signature Control', () => {
  const docPath = path.join(process.cwd(), 'docs', 'CLOUDFLARE_DEPLOYMENT.md');
  const doc = fs.readFileSync(docPath, 'utf-8');

  // Must be strictly scoped to webhook paths
  assert.ok(
    doc.includes('starts_with "/api/webhooks/"'),
    'CLOUDFLARE_DEPLOYMENT.md must scope WAF exemption strictly to starts_with "/api/webhooks/"'
  );

  // Must explicitly state that WAF is NOT the control and app signature check is
  assert.ok(
    doc.includes('THE WAF SKIP RULE IS NOT THE SECURITY CONTROL'),
    'CLOUDFLARE_DEPLOYMENT.md must explicitly declare WAF rule is not the security control'
  );
  assert.ok(
    doc.includes('Fail-Closed Guarantees'),
    'CLOUDFLARE_DEPLOYMENT.md must document 503/403 fail-closed guarantees'
  );
});

