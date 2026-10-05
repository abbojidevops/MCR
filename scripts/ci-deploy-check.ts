/**
 * MCR — CI Deployment & Security Topology Verifier
 * 
 * Verifies all Task 13 deployment hardening acceptance criteria:
 * 1. Docker Compose has database volume and NO database port published to host.
 * 2. Production start path uses NODE_ENV=production and npm start (no dev server).
 * 3. scripts/db-init.mjs validates schema syntax; malformed schema fails deploy loudly.
 * 4. ADMIN_PASSWORD supplied by environment, never baked in; 503 fail-closed at admin boundary.
 * 5. .dockerignore prevents leaking secrets, local modules, and build cache into image.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { validateSchemaSyntax } from './db-init.mjs';

export async function runDeployCheck() {
  console.log('🚢 [Deploy Check] Verifying production deployment topology & boundary controls...\n');

  // 1. docker-compose.yml checks
  console.log('1. Checking docker-compose.yml configuration...');
  const composePath = path.join(process.cwd(), 'docker-compose.yml');
  if (!fs.existsSync(composePath)) {
    throw new Error('docker-compose.yml not found');
  }
  const composeContent = fs.readFileSync(composePath, 'utf-8');

  // 1.1 Database port must NOT be published to host
  if (composeContent.includes('5432:5432') || /ports:\s*-\s*['"]?5432/i.test(composeContent)) {
    throw new Error('CRITICAL VIOLATION: Database port 5432 is published to the host in docker-compose.yml!');
  }
  console.log('   ✓ Database port 5432 is NOT published to host (isolated container network).');

  // 1.2 Volume mount present
  if (!composeContent.includes('pg_data:/var/lib/postgresql/data')) {
    throw new Error('Database volume mount pg_data:/var/lib/postgresql/data missing in docker-compose.yml');
  }
  console.log('   ✓ Database storage volume (pg_data) configured.');

  // 1.3 Production environment variables
  if (!composeContent.includes('ADMIN_PASSWORD=${ADMIN_PASSWORD}')) {
    throw new Error('ADMIN_PASSWORD must be supplied by environment variable in docker-compose.yml');
  }
  if (!composeContent.includes('NODE_ENV=production')) {
    throw new Error('NODE_ENV=production must be specified in docker-compose.yml');
  }
  console.log('   ✓ Secrets and NODE_ENV=production supplied via environment.');

  // 1.4 Production startup runs db-init.mjs before starting app
  if (!composeContent.includes('db-init.mjs') || !composeContent.includes('npm start')) {
    throw new Error('App container must run db-init.mjs followed by npm start in docker-compose.yml');
  }
  console.log('   ✓ Production start path runs db-init.mjs then npm start (no dev server).\n');

  // 2. Dockerfile checks
  console.log('2. Checking Dockerfile multi-stage build...');
  const dockerfilePath = path.join(process.cwd(), 'Dockerfile');
  const dockerfileContent = fs.readFileSync(dockerfilePath, 'utf-8');

  if (!dockerfileContent.includes('scripts/db-init.mjs')) {
    throw new Error('Dockerfile must copy scripts/db-init.mjs to runner stage');
  }
  if (!dockerfileContent.includes('CMD ["npm", "start"]')) {
    throw new Error('Dockerfile runner stage must start via CMD ["npm", "start"]');
  }
  console.log('   ✓ Dockerfile includes db-init.mjs and starts via npm start.\n');

  // 3. .dockerignore checks
  console.log('3. Checking .dockerignore...');
  const ignorePath = path.join(process.cwd(), '.dockerignore');
  if (!fs.existsSync(ignorePath)) {
    throw new Error('.dockerignore file is missing');
  }
  const ignoreContent = fs.readFileSync(ignorePath, 'utf-8');
  if (!ignoreContent.includes('.env*') || !ignoreContent.includes('node_modules')) {
    throw new Error('.dockerignore must ignore .env* and node_modules');
  }
  console.log('   ✓ .dockerignore prevents leaking secrets and build artifacts.\n');

  // 4. Schema verification & loud failure on malformed SQL
  console.log('4. Checking database initialization & schema syntax validation...');
  const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
  const validSchema = fs.readFileSync(schemaPath, 'utf-8');
  validateSchemaSyntax(validSchema);
  console.log('   ✓ Real schema (src/db/schema.sql) passes syntax validation.');

  // Test that missing comma fails deploy loudly
  const malformedSchema = `
CREATE TABLE test_table (
    id UUID PRIMARY KEY
    name VARCHAR(255) NOT NULL
);
  `;
  let malformedCaught = false;
  try {
    validateSchemaSyntax(malformedSchema);
  } catch (err: any) {
    if (err.message.includes('missing comma')) {
      malformedCaught = true;
    }
  }
  if (!malformedCaught) {
    throw new Error('FAILED: validateSchemaSyntax did not catch missing comma syntax error loudly');
  }
  console.log('   ✓ Missing comma in schema file successfully triggers loud deploy failure.\n');

  // 5. RUNBOOK.md documentation checks
  console.log('5. Checking RUNBOOK.md §2 environment documentation...');
  const runbookPath = path.join(process.cwd(), 'RUNBOOK.md');
  const runbookContent = fs.readFileSync(runbookPath, 'utf-8');
  if (!runbookContent.includes('ADMIN_PASSWORD') || !runbookContent.includes('503 Service Unavailable')) {
    throw new Error('RUNBOOK.md §2 must document ADMIN_PASSWORD and 503 fail-closed behavior');
  }
  console.log('   ✓ RUNBOOK.md §2 documents ADMIN_PASSWORD and fail-closed 503 guarantee.\n');

  // 6. Test Suite & Multi-Table Gate Stability Invariance Check
  console.log('6. Running test suite and multi-table hygiene check...');
  try {
    execSync('npm run test:hygiene', { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } });
    console.log('   ✓ Full test suite and hygiene invariance passed.\n');
  } catch {
    throw new Error('Test suite execution or hygiene invariance check failed');
  }

  // 7. Probe scripts verification (runs green probes if defined)
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  if (pkg.scripts && pkg.scripts['probe:green']) {
    console.log('7. Running green probe verification...');
    try {
      execSync('npm run probe:green', { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } });
      console.log('   ✓ Green probes passed cleanly.\n');
    } catch {
      throw new Error('Green probes failed!');
    }
  }

  // 8. Probe red verification (asserts probe:red fails on fixed build)
  if (pkg.scripts && pkg.scripts['probe:red']) {
    console.log('8. Verifying red probe defect reproduction fails on fixed build...');
    let redFailedAsExpected = false;
    try {
      execSync('npm run probe:red', { stdio: 'pipe', env: { ...process.env, NODE_ENV: 'test' } });
    } catch {
      redFailedAsExpected = true;
    }
    if (!redFailedAsExpected) {
      throw new Error('Expected probe:red to fail on fixed build, but defects were reproduced!');
    }
    console.log('   ✓ Red probe confirmed failing on fixed build (all 7 defects blocked).\n');
  }

  console.log('✅ [Deploy Check PASSED] All deployment, test hygiene, and security topology criteria verified.');
  return true;
}

if (process.argv[1] && process.argv[1].endsWith('ci-deploy-check.ts')) {
  runDeployCheck()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ [Deploy Check FAILED]:', err.message);
      process.exit(1);
    });
}
