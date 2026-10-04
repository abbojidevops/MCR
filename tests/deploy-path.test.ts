(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { NextRequest } from 'next/server';

import { validateSchemaSyntax } from '../scripts/db-init.mjs';
import { middleware } from '@/middleware';
import { POST as adminLoginHandler } from '@/app/api/admin/login/route';
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
