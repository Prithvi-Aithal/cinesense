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

export type Role = "admin" | "viewer";
export type Actor = { id: number; name: string; role: Role } | null;
export type Query = <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>;

// Database role for each kind of caller (see db/security.sql). A fixed map, never user input,
// because SET ROLE can't take a bind parameter.
const DB_ROLE = { anon: "cinesense_anon", viewer: "cinesense_viewer", admin: "cinesense_admin" } as const;

/**
 * Run fn inside one transaction as the caller's database role.
 *
 * 1. SET LOCAL ROLE cinesense_anon, then hand the session token to the database.
 * 2. whoami() validates the token in the database and returns the user and their role.
 * 3. SET LOCAL ROLE cinesense_viewer or cinesense_admin, so every query in fn runs with
 *    exactly that role's privileges and row-level security policies.
 * The app's own login (cinesense_app) has no privileges, so nothing can skip this.
 */
export async function withSession<T>(
  token: string | null,
  fn: (q: Query, actor: Actor) => Promise<T>,
  opts: { readOnly?: boolean } = {}
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query(opts.readOnly ? "BEGIN READ ONLY" : "BEGIN");
    await client.query(`SET LOCAL ROLE ${DB_ROLE.anon}`);
    await client.query("SELECT set_config('app.session_token', $1, true)", [token ?? ""]);
    const [me] = (await client.query<{ id: number; name: string; role: Role }>("SELECT id, name, role FROM whoami()")).rows;
    const actor: Actor = me ?? null;
    if (actor) await client.query(`SET LOCAL ROLE ${DB_ROLE[actor.role]}`);
    const q: Query = async (text, params = []) => (await client.query(text, params)).rows;
    const result = await fn(q, actor);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
