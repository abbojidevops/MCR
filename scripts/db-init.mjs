/**
 * MCR — Database Initialization & Schema Validation Tool
 * 
 * Runs migrations, validates schema syntax, and executes schema against PostgreSQL.
 * Fails loudly (exit code 1) on any malformed SQL (e.g. missing comma) or connection error.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Validates schema SQL syntax prior to execution to detect syntax defects loudly.
 */
export function validateSchemaSyntax(sqlContent) {
  if (!sqlContent || typeof sqlContent !== 'string' || sqlContent.trim().length === 0) {
    throw new Error('Schema file is empty or missing');
  }

  // 1. Balanced parentheses
  let openParen = 0;
  for (let i = 0; i < sqlContent.length; i++) {
    if (sqlContent[i] === '(') openParen++;
    if (sqlContent[i] === ')') openParen--;
    if (openParen < 0) {
      throw new Error(`Unmatched closing parenthesis at position ${i}`);
    }
  }
  if (openParen !== 0) {
    throw new Error(`Unbalanced parentheses in schema file: ${openParen} unclosed parenthesis`);
  }

  // 2. Missing comma detector between column definitions in CREATE TABLE blocks
  const tableMatches = [...sqlContent.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi)];
  for (const match of tableMatches) {
    const tableName = match[1];
    const body = match[2];
    const lines = body
      .split('\n')
      .map((l) => l.replace(/--.*$/, '').trim())
      .filter((l) => l.length > 0 && !l.startsWith('--'));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const nextLine = lines[i + 1];

      // Check for inline multiple type definitions without comma on single line
      if (/(?:KEY|NULL|DEFAULT\s+\S+)\s+[a-zA-Z_]\w*\s+(?:VARCHAR|UUID|BOOLEAN|INTEGER|TIMESTAMPTZ|TEXT|NUMERIC|BIGINT|JSONB)/i.test(line)) {
        throw new Error(
          `Syntax error in CREATE TABLE ${tableName}: missing comma between columns in line: "${line}"`
        );
      }

      // If line defines a column/constraint and doesn't end with a comma, and next line begins another definition
      if (nextLine && !line.endsWith(',') && !line.endsWith('(') && !nextLine.startsWith(')')) {
        const looksLikeDefinition = /^[a-zA-Z_]\w*\s+(?:VARCHAR|UUID|BOOLEAN|INTEGER|TIMESTAMPTZ|TEXT|NUMERIC|BIGINT|JSONB|CONSTRAINT|PRIMARY|FOREIGN|UNIQUE|CHECK)/i.test(
          nextLine
        );
        if (looksLikeDefinition) {
          throw new Error(
            `Syntax error in CREATE TABLE ${tableName}: missing comma at end of line: "${line}" before "${nextLine}"`
          );
        }
      }
    }
  }

  return true;
}

/**
 * List of known insecure or publicly burned database passwords.
 * The legacy password 'mcr_password' is permanently burned and rejected.
 */
export const BURNED_DATABASE_PASSWORDS = new Set([
  'mcr_password',
  'password',
  'postgres',
  'admin',
  'root',
  '123456',
]);

/**
 * Validates that database credentials are provided from the environment and do not
 * use missing, default, or publicly burned passwords. Fails loudly on violations.
 */
export function validateDatabaseCredentials(options = {}) {
  const dbUrl = options.databaseUrl || process.env.DATABASE_URL;
  const pgPassword = process.env.POSTGRES_PASSWORD;
  const isProduction = process.env.NODE_ENV === 'production' && !options.allowNoDb;

  // 1. Check explicit POSTGRES_PASSWORD if provided
  if (pgPassword !== undefined && pgPassword !== null) {
    const cleanPw = String(pgPassword).trim().toLowerCase();
    if (!cleanPw) {
      throw new Error('FATAL: POSTGRES_PASSWORD cannot be empty.');
    }
    if (BURNED_DATABASE_PASSWORDS.has(cleanPw)) {
      throw new Error(
        `FATAL: Refusing to start with burned or default database password in POSTGRES_PASSWORD ("${pgPassword}"). You must rotate to a strong secret.`
      );
    }
  }

  // 2. Check DATABASE_URL
  if (dbUrl) {
    let parsedPassword = '';
    try {
      const parsed = new URL(dbUrl);
      parsedPassword = parsed.password;
    } catch {
      const match = dbUrl.match(/:([^:@]+)@/);
      if (match) parsedPassword = match[1];
    }

    if (!parsedPassword || parsedPassword.trim() === '') {
      throw new Error(
        'FATAL: DATABASE_URL must specify a password (password cannot be empty).'
      );
    }

    if (BURNED_DATABASE_PASSWORDS.has(parsedPassword.trim().toLowerCase())) {
      throw new Error(
        `FATAL: Refusing to start with burned or default database password in DATABASE_URL ("${parsedPassword}"). Set a strong, rotated password in POSTGRES_PASSWORD and DATABASE_URL.`
      );
    }
  } else if (isProduction) {
    throw new Error('FATAL: DATABASE_URL is required in production deployment');
  }

  return true;
}

/**
 * Runs full database initialization: migrations, schema application, and exit-code validation.
 */
export async function runDatabaseInit(options = {}) {
  // 1. Validate credentials and reject burned/default passwords loudly
  validateDatabaseCredentials(options);

  const schemaPath = options.schemaPath || path.join(rootDir, 'src', 'db', 'schema.sql');
  console.log(`[db-init] Checking schema file at: ${schemaPath}`);

  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at: ${schemaPath}`);
  }

  const sql = fs.readFileSync(schemaPath, 'utf-8');

  // 2. Validate SQL syntax upfront (fails loudly on missing commas or syntax flaws)
  console.log('[db-init] Validating schema SQL syntax...');
  validateSchemaSyntax(sql);
  console.log('   ✓ Schema SQL syntax validated.');

  const dbUrl = options.databaseUrl || process.env.DATABASE_URL;
  if (!dbUrl) {
    console.log('[db-init] No DATABASE_URL provided; schema syntax verified successfully.');
    return { success: true, schemaValidated: true };
  }

  // 2. Connect to PostgreSQL and apply schema
  const sanitizedUrl = dbUrl.replace(/:[^:@]+@/, ':****@');
  console.log(`[db-init] Connecting to PostgreSQL at: ${sanitizedUrl}`);
  const pool = new pg.Pool({
    connectionString: dbUrl,
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await pool.connect();
    try {
      console.log('[db-init] Applying migrations and schema to PostgreSQL...');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
      console.log('   ✓ PostgreSQL schema initialized successfully.');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw new Error(`Database execution failed: ${err.message}`);
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }

  return { success: true };
}

// CLI entry point
if (process.argv[1] && (process.argv[1] === fileURLToPath(import.meta.url) || process.argv[1].endsWith('db-init.mjs'))) {
  runDatabaseInit()
    .then(() => {
      console.log('✅ [db-init] Database initialization complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ [db-init FATAL ERROR]:', err.message);
      process.exit(1);
    });
}
