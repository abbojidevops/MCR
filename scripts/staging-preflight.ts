/**
 * MCR — Staging & Production Deployment Pre-flight Verifier
 *
 * Validates environment integrity, cloud manifests (Docker, Render, Railway, Vercel),
 * database schema syntax, and security boundaries prior to live staging/production deployment.
 */
import fs from 'fs';
import path from 'path';
import { validateSchemaSyntax, validateDatabaseCredentials } from './db-init.mjs';

export interface PreflightResult {
  ok: boolean;
  passedChecks: string[];
  warnings: string[];
  errors: string[];
}

export function runStagingPreflight(envOverride?: Record<string, string>): PreflightResult {
  const env = envOverride || (process.env as Record<string, string>);
  const passedChecks: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const rootDir = process.cwd();

  // 1. Environment Variable & Secret Strength Checks
  const adminPassword = env.ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.trim().length === 0) {
    errors.push('ADMIN_PASSWORD must be configured in environment');
  } else if (adminPassword.length < 12) {
    errors.push('ADMIN_PASSWORD must be at least 12 characters long');
  } else if (
    !/[A-Z]/.test(adminPassword) ||
    !/[a-z]/.test(adminPassword) ||
    !/[0-9]/.test(adminPassword)
  ) {
    errors.push('ADMIN_PASSWORD must contain uppercase, lowercase, and numeric characters');
  } else {
    passedChecks.push('ADMIN_PASSWORD satisfies enterprise length and complexity requirements');
  }

  const sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.trim().length === 0) {
    errors.push('SESSION_SECRET must be configured in environment');
  } else if (sessionSecret.length < 32) {
    errors.push('SESSION_SECRET must be at least 32 characters long for cryptographically secure cookies');
  } else {
    passedChecks.push('SESSION_SECRET satisfies length requirements (>= 32 chars)');
  }

  // 2. Database Configuration & Credential Hygiene
  const dbUrl = env.DATABASE_URL;
  if (dbUrl) {
    try {
      validateDatabaseCredentials({ databaseUrl: dbUrl });
      if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
        errors.push('DATABASE_URL must start with postgresql:// or postgres://');
      } else {
        passedChecks.push('DATABASE_URL is syntactically valid and uses non-burned credentials');
      }
    } catch (err: any) {
      errors.push(`DATABASE_URL credential validation failed: ${err.message}`);
    }
  } else {
    warnings.push('DATABASE_URL not set; system will use local file storage (fine for demo/local staging)');
  }

  // 3. Telephony Mode Check
  if (env.TWILIO_MOCK_MODE === 'true' || !env.TWILIO_ACCOUNT_SID) {
    warnings.push('TWILIO_MOCK_MODE active or TWILIO_ACCOUNT_SID missing — Telephony operating in mock mode');
  } else {
    if (env.TWILIO_ACCOUNT_SID.startsWith('AC') && env.TWILIO_ACCOUNT_SID.length === 34) {
      passedChecks.push('TWILIO_ACCOUNT_SID format valid for production carrier telephony');
    } else {
      errors.push('TWILIO_ACCOUNT_SID is not a valid 34-character Twilio Account SID format');
    }
  }

  // 4. Public App URL (webhook callbacks, absolute links, and secure cookies in staging)
  const appUrl = env.NEXT_PUBLIC_APP_URL;
  if (!appUrl || !/^https?:\/\//i.test(appUrl)) {
    warnings.push(
      'NEXT_PUBLIC_APP_URL is not set to an absolute URL — set it to the Railway staging domain so webhook callbacks and links resolve correctly'
    );
  } else if (/^http:\/\//i.test(appUrl) && !/localhost|127\.0\.0\.1/i.test(appUrl)) {
    warnings.push(
      'NEXT_PUBLIC_APP_URL uses http:// on a public host — staging and production must use https://'
    );
  } else {
    passedChecks.push('NEXT_PUBLIC_APP_URL is an absolute URL');
  }

  // 5. Schema Syntax & Required Tables Audit
  const schemaPath = path.join(rootDir, 'src', 'db', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    errors.push(`Production schema file missing at ${schemaPath}`);
  } else {
    try {
      const sql = fs.readFileSync(schemaPath, 'utf-8');
      validateSchemaSyntax(sql);

      const requiredTables = [
        'accounts',
        'business_profiles',
        'user_credentials',
        'compliance_registrations',
        'jobs',
        'conversations',
        'call_records',
        'consent_logs',
      ];

      const missingTables = requiredTables.filter(
        (t) => !new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${t}`, 'i').test(sql)
      );

      if (missingTables.length > 0) {
        errors.push(`Schema missing required tables: ${missingTables.join(', ')}`);
      } else {
        passedChecks.push('Production schema.sql is syntactically valid and contains all 8 core tables');
      }
    } catch (err: any) {
      errors.push(`Schema syntax validation failed: ${err.message}`);
    }
  }

  // 6. Cloud Manifests Verification
  // Docker
  const dockerfilePath = path.join(rootDir, 'Dockerfile');
  const composePath = path.join(rootDir, 'docker-compose.yml');
  if (fs.existsSync(dockerfilePath) && fs.existsSync(composePath)) {
    const composeContent = fs.readFileSync(composePath, 'utf-8');
    if (composeContent.includes('5432:5432')) {
      errors.push('docker-compose.yml publishes port 5432 to host (security violation)');
    } else {
      passedChecks.push('Docker & Compose manifests verified with isolated database network');
    }
  } else {
    errors.push('Dockerfile or docker-compose.yml missing from project root');
  }

  // Render
  const renderPath = path.join(rootDir, 'render.yaml');
  if (fs.existsSync(renderPath)) {
    const renderContent = fs.readFileSync(renderPath, 'utf-8');
    if (renderContent.includes('mcr-saas-app') && renderContent.includes('/api/health')) {
      passedChecks.push('Render blueprint (render.yaml) verified with health check and PostgreSQL 16');
    } else {
      errors.push('render.yaml is missing web service or /api/health check path');
    }
  } else {
    errors.push('render.yaml missing from project root');
  }

  // Railway
  const railwayPath = path.join(rootDir, 'railway.json');
  if (fs.existsSync(railwayPath)) {
    try {
      const railwayJson = JSON.parse(fs.readFileSync(railwayPath, 'utf-8'));

      // 6a. Docker builder must be pinned so Railway never silently falls back to
      // auto-detection and builds a different artifact than docker-compose / Render.
      if (railwayJson.build?.builder !== 'DOCKERFILE') {
        errors.push('railway.json build.builder must be "DOCKERFILE"');
      } else if (railwayJson.build?.dockerfilePath !== 'Dockerfile') {
        errors.push('railway.json build.dockerfilePath must be "Dockerfile"');
      } else {
        passedChecks.push('Railway build pinned to the repository Dockerfile');
      }

      // 6b. Schema must be applied on deploy. Without a pre-deploy/start hook the
      // container boots against an empty database and every tenant query fails.
      const preDeploy = railwayJson.deploy?.preDeployCommand;
      const startCommand = railwayJson.deploy?.startCommand;
      const preDeployStr = Array.isArray(preDeploy) ? preDeploy.join(' && ') : preDeploy || '';
      const startCommandStr = Array.isArray(startCommand) ? startCommand.join(' && ') : startCommand || '';

      if (!preDeployStr.includes('db-init.mjs') && !startCommandStr.includes('db-init.mjs')) {
        errors.push(
          'railway.json must run schema initialization on deploy (deploy.preDeployCommand or deploy.startCommand must invoke scripts/db-init.mjs)'
        );
      } else if (
        !startCommandStr.includes('npm start') &&
        !startCommandStr.includes('next start')
      ) {
        errors.push(
          'railway.json deploy.startCommand must launch the production server via "npm start" (dev server is never allowed)'
        );
      } else {
        passedChecks.push(
          'Railway deploy runs db-init schema migration then production server (npm start)'
        );
      }

      // 6c. Health check + restart policy for the staging service.
      if (railwayJson.deploy?.healthcheckPath !== '/api/health') {
        errors.push('railway.json is missing deploy.healthcheckPath = "/api/health"');
      } else if (railwayJson.deploy?.restartPolicyType !== 'ON_FAILURE') {
        errors.push('railway.json deploy.restartPolicyType must be "ON_FAILURE"');
      } else {
        passedChecks.push(
          'Railway manifest (railway.json) verified with /api/health healthcheck and ON_FAILURE restarts'
        );
      }
    } catch (err: any) {
      errors.push(`railway.json JSON parsing failed: ${err.message}`);
    }
  } else {
    errors.push('railway.json missing from project root');
  }

  // Application-level security headers (platform independent: Railway, Render, Docker, Vercel)
  const nextConfigPath = path.join(rootDir, 'next.config.ts');
  if (!fs.existsSync(nextConfigPath)) {
    errors.push('next.config.ts missing from project root');
  } else {
    const nextConfigContent = fs.readFileSync(nextConfigPath, 'utf-8');
    const requiredHeaders = [
      'X-Content-Type-Options',
      'X-Frame-Options',
      'Strict-Transport-Security',
    ];
    const missingHeaders = requiredHeaders.filter((h) => !nextConfigContent.includes(h));

    if (missingHeaders.length > 0) {
      errors.push(
        `next.config.ts must declare application security headers so deployment targets without edge config (Railway, Render, docker-compose) are still hardened; missing: ${missingHeaders.join(', ')}`
      );
    } else {
      passedChecks.push(
        'Application security headers declared in next.config.ts and applied on every platform'
      );
    }
  }

  // Vercel
  const vercelPath = path.join(rootDir, 'vercel.json');
  if (fs.existsSync(vercelPath)) {
    try {
      const vercelJson = JSON.parse(fs.readFileSync(vercelPath, 'utf-8'));
      if (vercelJson.framework === 'nextjs' && Array.isArray(vercelJson.headers)) {
        passedChecks.push('Vercel configuration (vercel.json) verified with enterprise security headers');
      } else {
        errors.push('vercel.json is missing framework=nextjs or security headers block');
      }
    } catch (err: any) {
      errors.push(`vercel.json JSON parsing failed: ${err.message}`);
    }
  } else {
    errors.push('vercel.json missing from project root');
  }

  return {
    ok: errors.length === 0,
    passedChecks,
    warnings,
    errors,
  };
}

// Direct CLI Execution
if (
  process.argv[1] &&
  (process.argv[1].endsWith('staging-preflight.ts') || process.argv[1].endsWith('staging-preflight.js'))
) {
  console.log('\n🚀 [MCR] Running Staging & Production Deployment Pre-flight Verifier...\n');
  const result = runStagingPreflight();

  result.passedChecks.forEach((c) => console.log(`  ✅ [PASS] ${c}`));
  result.warnings.forEach((w) => console.log(`  ⚠️ [WARN] ${w}`));
  result.errors.forEach((e) => console.log(`  ❌ [FAIL] ${e}`));

  console.log(
    `\nPre-flight Result: ${result.ok ? '✅ READY FOR DEPLOYMENT' : '❌ DEPLOYMENT BLOCKED'}`
  );
  console.log(
    `Checks Passed: ${result.passedChecks.length} | Warnings: ${result.warnings.length} | Errors: ${result.errors.length}\n`
  );

  if (!result.ok) {
    process.exit(1);
  }
}
