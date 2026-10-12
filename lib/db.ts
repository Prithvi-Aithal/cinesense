import { Pool } from "pg";

// One pool per server process. In dev, Next.js hot-reloads modules, so the pool
// is kept on globalThis to avoid opening a new set of connections on every edit.
const globalForPg = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPg.pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

if (!globalForPg.pgPool) {
  // HNSW returns only ef_search (40) candidates before WHERE filters run, so a genre
  // filter could leave fewer than LIMIT rows. pgvector 0.8+ iterative scans keep
  // walking the graph until LIMIT is filled. Ignored on older pgvector.
  pool.on("connect", (client) => {
    client.query("SET hnsw.iterative_scan = strict_order").catch(() => {});
  });
}

if (process.env.NODE_ENV !== "production") globalForPg.pgPool = pool;

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
