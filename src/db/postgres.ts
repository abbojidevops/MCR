import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

let pool: Pool | null = null;
let isConnected = false;

export function getPostgresPool(): Pool | null {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;

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
