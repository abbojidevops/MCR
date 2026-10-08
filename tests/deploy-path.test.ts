(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { NextRequest } from 'next/server';

import { validateSchemaSyntax, validateDatabaseCredentials } from '../scripts/db-init.mjs';
import { runStagingPreflight } from '../scripts/staging-preflight';
import { runStagingSmokeCheck } from '../scripts/staging-smoke';
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

test('DEP-7: Render Blueprint Manifest (render.yaml) — Defines Web Service, Postgres 16, and Health Check', () => {
  const renderPath = path.join(process.cwd(), 'render.yaml');
  assert.ok(fs.existsSync(renderPath), 'render.yaml must exist in root');
  const content = fs.readFileSync(renderPath, 'utf-8');

  assert.ok(content.includes('name: mcr-saas-app'), 'render.yaml must declare mcr-saas-app service');
  assert.ok(content.includes('healthCheckPath: /api/health'), 'render.yaml must route health checks to /api/health');
  assert.ok(content.includes('runtime: docker'), 'render.yaml must use Docker runtime');
  assert.ok(content.includes('name: mcr-postgres'), 'render.yaml must configure managed PostgreSQL service');
  assert.ok(content.includes('postgresMajorVersion: 16'), 'render.yaml must specify PostgreSQL 16');
});

test('DEP-8: Railway Manifest (railway.json) — Defines Dockerfile Builder and Health Check Path', () => {
  const railwayPath = path.join(process.cwd(), 'railway.json');
  assert.ok(fs.existsSync(railwayPath), 'railway.json must exist in root');
  const json = JSON.parse(fs.readFileSync(railwayPath, 'utf-8'));

  assert.equal(json.build?.builder, 'DOCKERFILE');
  assert.equal(json.build?.dockerfilePath, 'Dockerfile');
  assert.equal(json.deploy?.healthcheckPath, '/api/health');
  assert.equal(json.deploy?.restartPolicyType, 'ON_FAILURE');
});

test('DEP-9: Vercel Configuration (vercel.json) — Enforces Enterprise Security Headers and Framework Preset', () => {
  const vercelPath = path.join(process.cwd(), 'vercel.json');
  assert.ok(fs.existsSync(vercelPath), 'vercel.json must exist in root');
  const json = JSON.parse(fs.readFileSync(vercelPath, 'utf-8'));

  assert.equal(json.framework, 'nextjs');
  assert.ok(Array.isArray(json.headers));

  const globalHeaders = json.headers.find((h: any) => h.source === '/(.*)');
  assert.ok(globalHeaders, 'Must include global security headers block for /(.*)');

  const headerMap: Record<string, string> = {};
  for (const h of globalHeaders.headers) {
    headerMap[h.key] = h.value;
  }

  assert.equal(headerMap['X-Frame-Options'], 'DENY');
  assert.equal(headerMap['X-Content-Type-Options'], 'nosniff');
  assert.ok(headerMap['Strict-Transport-Security'].includes('max-age=31536000'));
});

test('DEP-10: Staging Pre-flight Verification Tool — Detects Insecure Secrets and Passes on Valid Topology', () => {
  // 1. Weak ADMIN_PASSWORD fails
  const weakAdminResult = runStagingPreflight({
    ADMIN_PASSWORD: 'short',
    SESSION_SECRET: 'a'.repeat(32),
  });
  assert.equal(weakAdminResult.ok, false);
  assert.ok(weakAdminResult.errors.some((e) => e.includes('ADMIN_PASSWORD must be at least 12')));

  // 2. Weak SESSION_SECRET fails
  const weakSessionResult = runStagingPreflight({
    ADMIN_PASSWORD: 'SuperSecurePass2026!',
    SESSION_SECRET: 'short',
  });
  assert.equal(weakSessionResult.ok, false);
  assert.ok(weakSessionResult.errors.some((e) => e.includes('SESSION_SECRET must be at least 32')));

  // 3. Burned database password fails
  const burnedDbResult = runStagingPreflight({
    ADMIN_PASSWORD: 'SuperSecurePass2026!',
    SESSION_SECRET: 'a'.repeat(32),
    DATABASE_URL: 'postgresql://mcr_user:mcr_password@localhost:5432/mcr_db',
  });
  assert.equal(burnedDbResult.ok, false);
  assert.ok(burnedDbResult.errors.some((e) => e.includes('burned or default database password')));

  // 4. Valid staging topology passes
  const validResult = runStagingPreflight({
    ADMIN_PASSWORD: 'SuperSecurePass2026!',
    SESSION_SECRET: 'x'.repeat(40),
    DATABASE_URL: 'postgresql://mcr_user:StrongStagingPass2026!Db@localhost:5432/mcr_db',
    TWILIO_MOCK_MODE: 'true',
  });
  assert.equal(validResult.ok, true, `Valid topology should pass with 0 errors. Errors: ${validResult.errors.join(', ')}`);
  assert.ok(validResult.passedChecks.length >= 5);
});


/**
 * RAIL-1..RAIL-5 — Railway Staging Deployment Readiness
 *
 * Railway staging boots the repository Dockerfile as a container. The schema is
 * NOT applied by the platform, so the deploy config itself must run
 * scripts/db-init.mjs before the production server starts. These tests pin that
 * contract and prove the staging pre-flight fails loudly when it is broken.
 */
const RAILWAY_STAGING_ENV = {
  ADMIN_PASSWORD: 'SuperSecurePass2026!',
  SESSION_SECRET: 'x'.repeat(40),
  DATABASE_URL: 'postgresql://mcr_user:StrongStagingPass2026!Db@localhost:5432/mcr_db',
  NEXT_PUBLIC_APP_URL: 'https://mcr-staging.up.railway.app',
  TWILIO_MOCK_MODE: 'true',
};

/**
 * Builds a throwaway project root containing only the manifests the staging
 * pre-flight inspects, so negative cases can be exercised without ever mutating
 * the real repository files.
 */
function withTempProjectRoot(mutate: (dir: string) => void): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcr-railway-'));
  const files = [
    'Dockerfile',
    'docker-compose.yml',
    'render.yaml',
    'vercel.json',
    'railway.json',
    'next.config.ts',
    path.join('src', 'db', 'schema.sql'),
  ];
  for (const rel of files) {
    const dest = path.join(dir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(process.cwd(), rel), dest);
  }
  mutate(dir);
  return dir;
}

function runPreflightIn(dir: string) {
  const previousCwd = process.cwd();
  try {
    process.chdir(dir);
    return runStagingPreflight(RAILWAY_STAGING_ENV);
  } finally {
    process.chdir(previousCwd);
  }
}

test('RAIL-1: Railway Staging Manifest Runs Schema Migration Before Production Server', () => {
  const railwayPath = path.join(process.cwd(), 'railway.json');
  const json = JSON.parse(fs.readFileSync(railwayPath, 'utf-8'));

  const preDeploy = json.deploy?.preDeployCommand;
  const startCommand = json.deploy?.startCommand;
  const preDeployStr = Array.isArray(preDeploy) ? preDeploy.join(' && ') : preDeploy || '';
  const startCommandStr = Array.isArray(startCommand) ? startCommand.join(' && ') : startCommand || '';

  assert.ok(
    preDeployStr.includes('node scripts/db-init.mjs') || startCommandStr.includes('node scripts/db-init.mjs'),
    'Railway staging must apply src/db/schema.sql via scripts/db-init.mjs on every deploy'
  );
  assert.ok(
    startCommandStr.includes('npm start'),
    'Railway start command must launch the production server via npm start (never the dev server)'
  );
  assert.equal(json.deploy?.healthcheckPath, '/api/health');
  assert.ok(
    typeof json.deploy?.healthcheckTimeout === 'number' && json.deploy.healthcheckTimeout >= 10,
    'Railway healthcheck timeout must allow schema bootstrap plus Next.js boot'
  );
  assert.equal(json.deploy?.restartPolicyType, 'ON_FAILURE');
});

test('RAIL-2: Container Binds All Interfaces and Probes the Runtime PORT', () => {
  const dockerfile = fs.readFileSync(path.join(process.cwd(), 'Dockerfile'), 'utf-8');

  assert.match(
    dockerfile,
    /ENV HOSTNAME=0\.0\.0\.0/,
    'Container must bind 0.0.0.0 so the Railway edge proxy can reach the app'
  );
  assert.match(
    dockerfile,
    /HEALTHCHECK[\s\S]*\$\{PORT\}/,
    'Container healthcheck must probe the runtime PORT rather than a hardcoded 3000'
  );
  assert.ok(
    !dockerfile.includes('http://localhost:3000/api/health'),
    'Healthcheck must not hardcode port 3000: platforms may inject a different PORT'
  );
});

test('RAIL-3: Staging Pre-flight Accepts an Unmodified Railway Topology', () => {
  const dir = withTempProjectRoot(() => {});
  try {
    const result = runPreflightIn(dir);
    assert.equal(
      result.ok,
      true,
      `Unmodified Railway topology must pass pre-flight. Errors: ${result.errors.join(', ')}`
    );
    assert.ok(
      result.passedChecks.some((c) => c.includes('db-init schema migration then production server')),
      'Pre-flight must report the Railway migration-then-serve path as a passing check'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('RAIL-4: Staging Pre-flight Fails Loudly When Railway Skips Schema Initialization', () => {
  const dir = withTempProjectRoot((d) => {
    const railwayPath = path.join(d, 'railway.json');
    const json = JSON.parse(fs.readFileSync(railwayPath, 'utf-8'));
    delete json.deploy.preDeployCommand;
    json.deploy.startCommand = 'npm start';
    fs.writeFileSync(railwayPath, JSON.stringify(json, null, 2));
  });
  try {
    const result = runPreflightIn(dir);
    assert.equal(result.ok, false, 'A Railway deploy that never applies the schema must block deployment');
    assert.ok(
      result.errors.some((e) => e.includes('db-init.mjs')),
      `Expected a db-init.mjs migration error, received: ${result.errors.join(' | ')}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('RAIL-5: Staging Pre-flight Fails Loudly When Railway Starts a Dev Server or Loses the Healthcheck', () => {
  // 1. Dev server as the start command
  const devDir = withTempProjectRoot((d) => {
    const railwayPath = path.join(d, 'railway.json');
    const json = JSON.parse(fs.readFileSync(railwayPath, 'utf-8'));
    json.deploy.startCommand = 'node scripts/db-init.mjs && npm run dev';
    fs.writeFileSync(railwayPath, JSON.stringify(json, null, 2));
  });
  try {
    const devResult = runPreflightIn(devDir);
    assert.equal(devResult.ok, false, 'A Railway dev-server start command must block deployment');
    assert.ok(devResult.errors.some((e) => e.includes('npm start')));
  } finally {
    fs.rmSync(devDir, { recursive: true, force: true });
  }

  // 2. Healthcheck path removed
  const healthDir = withTempProjectRoot((d) => {
    const railwayPath = path.join(d, 'railway.json');
    const json = JSON.parse(fs.readFileSync(railwayPath, 'utf-8'));
    delete json.deploy.healthcheckPath;
    fs.writeFileSync(railwayPath, JSON.stringify(json, null, 2));
  });
  try {
    const healthResult = runPreflightIn(healthDir);
    assert.equal(healthResult.ok, false, 'A Railway manifest without /api/health must block deployment');
    assert.ok(healthResult.errors.some((e) => e.includes('healthcheckPath')));
  } finally {
    fs.rmSync(healthDir, { recursive: true, force: true });
  }
});
/**
 * RAIL-6..RAIL-9 — Platform-Independent Hardening & Post-Deploy Staging Smoke
 */
test('RAIL-6: Application Security Headers Are Declared in next.config.ts (Not Only at the Edge)', () => {
  const configPath = path.join(process.cwd(), 'next.config.ts');
  assert.ok(fs.existsSync(configPath), 'next.config.ts must exist in root');

  const config = fs.readFileSync(configPath, 'utf-8');
  assert.match(config, /async headers\(\)/, 'next.config.ts must declare a headers() block');
  assert.match(config, /X-Content-Type-Options["']?,?\s*value:\s*["']nosniff["']/s, 'next.config.ts must set X-Content-Type-Options: nosniff');
  assert.ok(config.includes('X-Frame-Options'), 'next.config.ts must set X-Frame-Options');
  assert.ok(config.includes('"DENY"'), 'next.config.ts must set X-Frame-Options to DENY');
  assert.ok(
    config.includes('max-age=31536000; includeSubDomains; preload'),
    'next.config.ts must set a 1-year HSTS policy'
  );

  // Parity with the Vercel edge configuration: the app layer must never be weaker.
  const vercelJson = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf-8')
  );
  const globalBlock = vercelJson.headers.find((h: any) => h.source === '/(.*)');
  for (const header of globalBlock.headers) {
    assert.ok(
      config.includes(header.key) && config.includes(header.value),
      `next.config.ts must mirror vercel.json header ${header.key}: ${header.value} for non-Vercel platforms (Railway/Render/Docker)`
    );
  }
});

test('RAIL-7: Staging Pre-flight Fails Loudly When the Application Drops Security Headers', () => {
  const dir = withTempProjectRoot((d) => {
    fs.writeFileSync(path.join(d, 'next.config.ts'), 'const nextConfig = { reactStrictMode: true };\nexport default nextConfig;\n');
  });
  try {
    const result = runPreflightIn(dir);
    assert.equal(result.ok, false, 'Dropping application security headers must block staging deployment');
    assert.ok(
      result.errors.some((e) => e.includes('security headers')),
      `Expected an application security header error, received: ${result.errors.join(' | ')}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function jsonResponse(body: any, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const SMOKE_SECURITY_HEADERS = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
};

/** Fake staging service that passes every smoke check. */
function healthyStagingFetch(url: string, init?: any): Promise<Response> {
  if (url.endsWith('/api/health')) {
    return Promise.resolve(
      jsonResponse(
        { status: 'healthy', timestamp: new Date().toISOString(), version: '1.0.0' },
        200,
        SMOKE_SECURITY_HEADERS
      )
    );
  }
  if (url.endsWith('/dashboard')) {
    return Promise.resolve(
      new Response(null, { status: 307, headers: { location: '/login' } })
    );
  }
  if (url.endsWith('/api/admin/fleet')) {
    return Promise.resolve(jsonResponse({ error: 'Unauthorized' }, 401));
  }
  return Promise.resolve(new Response('Not Found', { status: 404 }));
}

test('RAIL-8: Staging Smoke Verifier Passes on a Healthy Deployment', async () => {
  const result = await runStagingSmokeCheck('https://mcr-staging.up.railway.app', healthyStagingFetch);

  assert.equal(result.ok, true, `Healthy staging deploy must pass smoke: ${result.errors.join(' | ')}`);
  assert.equal(result.errors.length, 0);
  assert.equal(result.passedChecks.length, 4);
  assert.ok(result.passedChecks.some((c) => c.includes('/api/health')));
  assert.ok(result.passedChecks.some((c) => c.includes('security headers')));
  assert.ok(result.passedChecks.some((c) => c.includes('/dashboard')));
  assert.ok(result.passedChecks.some((c) => c.includes('fail-closed')));
});

test('RAIL-9: Staging Smoke Verifier Fails Loudly on Posture Leaks, Missing Headers, and Open Boundaries', async () => {
  // 1. Health endpoint leaking internal posture
  const leakyResult = await runStagingSmokeCheck('https://staging.example.com', (url: string) =>
    Promise.resolve(
      jsonResponse(
        {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.0.0',
          storageEngine: 'postgresql',
          mockMode: false,
          activeTenants: 4,
        },
        200,
        SMOKE_SECURITY_HEADERS
      )
    )
  );
  assert.equal(leakyResult.ok, false);
  assert.ok(leakyResult.errors.some((e) => e.includes('exactly {status, timestamp, version}')));

  // 2. Missing security headers (Railway container without app-level headers)
  const noHeaderResult = await runStagingSmokeCheck('https://staging.example.com', (url: string) => {
    if (url.endsWith('/api/health')) {
      return Promise.resolve(
        jsonResponse({ status: 'healthy', timestamp: new Date().toISOString(), version: '1.0.0' })
      );
    }
    if (url.endsWith('/dashboard')) {
      return Promise.resolve(new Response(null, { status: 307, headers: { location: '/login' } }));
    }
    return Promise.resolve(jsonResponse({ error: 'Unauthorized' }, 401));
  });
  assert.equal(noHeaderResult.ok, false);
  assert.ok(noHeaderResult.errors.some((e) => e.includes('X-Frame-Options')));

  // 3. Exposed operator boundary + dashboard that no longer redirects
  const exposedResult = await runStagingSmokeCheck('https://staging.example.com', (url: string) => {
    if (url.endsWith('/api/health')) {
      return Promise.resolve(
        jsonResponse(
          { status: 'healthy', timestamp: new Date().toISOString(), version: '1.0.0' },
          200,
          SMOKE_SECURITY_HEADERS
        )
      );
    }
    if (url.endsWith('/dashboard')) {
      return Promise.resolve(new Response('<html>dashboard</html>', { status: 200 }));
    }
    return Promise.resolve(jsonResponse({ fleet: 'all tenants' }, 200));
  });
  assert.equal(exposedResult.ok, false);
  assert.ok(exposedResult.errors.some((e) => e.includes('redirect to /login')));
  assert.ok(exposedResult.errors.some((e) => e.includes('Operator boundary may be exposed')));

  // 4. Unreachable service and non-absolute target
  const unreachable = await runStagingSmokeCheck('https://staging.example.com', () =>
    Promise.reject(new Error('ECONNREFUSED'))
  );
  assert.equal(unreachable.ok, false);
  assert.ok(unreachable.errors.some((e) => e.includes('GET /api/health failed')));

  const badTarget = await runStagingSmokeCheck('mcr-staging.up.railway.app', healthyStagingFetch);
  assert.equal(badTarget.ok, false);
  assert.ok(badTarget.errors.some((e) => e.includes('must be absolute')));
});
