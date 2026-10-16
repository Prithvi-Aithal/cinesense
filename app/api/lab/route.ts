import { NextResponse } from "next/server";
import { LAB_QUERIES, STATS_SQL } from "@/lib/lab";
import { badRequest, body, route } from "@/lib/http";

// GET  /api/lab -> the predefined queries + table/index stats  (admin)
export const GET = route(
  async (_req, { q }) => {
    const stats = await q(STATS_SQL);
    return NextResponse.json({ queries: LAB_QUERIES, stats });
  },
  { role: "admin", readOnly: true }
);

// POST /api/lab {id, forceIndex} -> run one query and its EXPLAIN ANALYZE  (admin)
// The whole request is one read-only transaction; SET LOCAL settings vanish at the end.
export const POST = route(
  async (req, { q }) => {
    const b = await body(req);
    const lab = LAB_QUERIES.find((x) => x.id === b.id);
    if (!lab) return badRequest("Unknown query id.");
    if (b.forceIndex) {
      // On ~100 rows a full scan is cheaper, so the planner rightly ignores the indexes.
      // Disabling sequential scans shows what the indexed plan looks like at scale.
      await q("SET LOCAL enable_seqscan = off");
      await q("SET LOCAL hnsw.ef_search = 100");
    }
    const rows = await q(lab.sql, lab.params);
    const plan = (await q<{ "QUERY PLAN": string }>(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${lab.sql}`, lab.params))
      .map((r) => r["QUERY PLAN"])
      .join("\n");
    return NextResponse.json({ rows, plan });
  },
  { role: "admin", readOnly: true }
);
