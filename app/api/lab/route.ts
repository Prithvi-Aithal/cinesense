import { NextRequest, NextResponse } from "next/server";
import { pool, query } from "@/lib/db";
import { LAB_QUERIES, STATS_SQL } from "@/lib/lab";
import { badRequest, handle } from "@/lib/http";

// GET  /api/lab -> the predefined queries + table/index stats
export const GET = handle(async () => {
  const stats = await query(STATS_SQL);
  return NextResponse.json({
    queries: LAB_QUERIES.map(({ params, ...q }) => ({ ...q, params })),
    stats,
  });
});

// POST /api/lab {id, forceIndex} -> run one query and its EXPLAIN ANALYZE
export const POST = handle(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const q = LAB_QUERIES.find((x) => x.id === body.id);
  if (!q) return badRequest("Unknown query id.");

  const client = await pool.connect();
  try {
    // Read-only transaction; SET LOCAL settings vanish at ROLLBACK.
    await client.query("BEGIN READ ONLY");
    if (body.forceIndex) {
      // On ~100 rows a full scan is cheaper, so the planner rightly ignores the indexes.
      // Disabling sequential scans shows what the indexed plan looks like at scale.
      await client.query("SET LOCAL enable_seqscan = off");
      await client.query("SET LOCAL hnsw.ef_search = 100");
    }
    const rows = (await client.query(q.sql, q.params)).rows;
    const plan = (await client.query(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${q.sql}`, q.params)).rows
      .map((r) => r["QUERY PLAN"])
      .join("\n");
    await client.query("ROLLBACK");
    return NextResponse.json({ rows, plan });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
});
