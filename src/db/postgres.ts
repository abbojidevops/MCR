import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

let pool: Pool | null = null;
let isConnected = false;

const BURNED_PASSWORDS = new Set([
  'mcr_password',
  'password',
  'postgres',
  'admin',
  'root',
  '123456',
]);

export function isBurnedDatabasePassword(password?: string | null): boolean {
  if (!password) return true;
  return BURNED_PASSWORDS.has(password.trim().toLowerCase());
}

export function extractDatabasePassword(dbUrl: string): string | null {
  try {
    const parsed = new URL(dbUrl);
    return parsed.password || null;
  } catch {
    const match = dbUrl.match(/:([^:@]+)@/);
    return match ? match[1] : null;
  }
}

export function getPostgresPool(): Pool | null {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;

  const password = extractDatabasePassword(dbUrl);
  if (!password || isBurnedDatabasePassword(password)) {
    console.warn(
      '[Postgres Security]: Refusing to connect using empty, default, or burned password. Set a rotated secure password in DATABASE_URL.'
    );
    return null;
  }

  if (!pool) {
    try {
      pool = new Pool({
        connectionString: dbUrl,
        connectionTimeoutMillis: 3000,
        idleTimeoutMillis: 10000,
        max: 10,
      });
      pool.on('error', (err) => {
        console.warn('[Postgres Pool Error]:', err.message);
        isConnected = false;
      });
    } catch (e: any) {
      console.warn('[Postgres Init Error]:', e.message);
      pool = null;
    }
  }
  return pool;
}

export async function checkPostgresConnection(): Promise<boolean> {
  const currentPool = getPostgresPool();
  if (!currentPool) {
    isConnected = false;
    return false;
  }
  try {
    const client = await currentPool.connect();
    try {
      await client.query('SELECT 1');
      isConnected = true;
      return true;
    } finally {
      client.release();
    }
  } catch (err: any) {
    isConnected = false;
    return false;
  }
}

export function isPostgresHealthy(): boolean {
  return isConnected;
}

export function isPostgresConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Initialize PostgreSQL Schema from src/db/schema.sql
 */
export async function initializePostgresSchema(): Promise<{ success: boolean; error?: string }> {
  const currentPool = getPostgresPool();
  if (!currentPool) {
    return { success: false, error: 'DATABASE_URL is not configured' };
  }
  try {
    const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      return { success: false, error: 'schema.sql not found at ' + schemaPath };
    }
    const sql = fs.readFileSync(schemaPath, 'utf-8');
    await currentPool.query(sql);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
