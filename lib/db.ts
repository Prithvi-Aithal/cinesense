import { Pool } from "pg";

// One pool per server process. In dev, Next.js hot-reloads modules, so the pool
// is kept on globalThis to avoid opening a new set of connections on every edit.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
