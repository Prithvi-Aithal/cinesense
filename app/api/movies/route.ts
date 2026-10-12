import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { SQL } from "@/lib/queries";
import { embed } from "@/lib/embeddings";
import { toPgVector } from "@/lib/vector";
import { handle, intParam, textParam } from "@/lib/http";

// GET /api/movies?q=&genre=&mode=keyword|semantic&userId=
//   keyword  -> pure SQL (ILIKE substring match)
//   semantic -> embed the search text, then nearest-neighbour search in pgvector
export const GET = handle(async (req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  const q = textParam(p.get("q"));
  const genre = textParam(p.get("genre"));
  const userId = intParam(p.get("userId"));
  const mode = p.get("mode") === "semantic" && q ? "semantic" : "keyword";

  if (mode === "semantic") {
    try {
      const [vec] = await embed([q!]);
      const items = await query(SQL.semanticSearch, [toPgVector(vec), genre, userId]);
      return NextResponse.json({ mode, items, query: SQL.semanticSearch });
    } catch (e) {
      // The model could not be loaded (e.g. offline on first run): fall back to keyword search.
      console.error("Semantic search unavailable:", e);
      const items = await query(SQL.keywordSearch, [genre, q, userId]);
      return NextResponse.json({
        mode: "keyword",
        warning: "Meaning search needs the embedding model, which could not be loaded. Showing keyword results.",
        items,
        query: SQL.keywordSearch,
      });
    }
  }

  const items = await query(SQL.keywordSearch, [genre, q, userId]);
  return NextResponse.json({ mode, items, query: SQL.keywordSearch });
});
