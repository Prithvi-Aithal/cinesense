import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { embed } from "@/lib/embeddings";
import { toPgVector } from "@/lib/vector";
import { badRequest, body, route, textParam } from "@/lib/http";
import { NO_MODEL_WARNING, parseMovieInput, tryEmbedMovie } from "@/lib/movieInput";

// GET /api/movies?q=&genre=&mode=keyword|semantic
//   keyword  -> pure SQL (ILIKE substring match)
//   semantic -> embed the search text, then nearest-neighbour search in pgvector
// Public. When someone is logged in, each movie also carries their own rating.
export const GET = route(
  async (req, { q, actor }) => {
    const p = req.nextUrl.searchParams;
    const text = textParam(p.get("q"));
    const genre = textParam(p.get("genre"));
    const userId = actor?.id ?? null;
    const mode = p.get("mode") === "semantic" && text ? "semantic" : "keyword";

    if (mode === "semantic") {
      let vec: number[] | null = null;
      try {
        [vec] = await embed([text!]);
      } catch (e) {
        // The model could not be loaded (e.g. offline on first run): fall back to keyword search.
        console.error("Semantic search unavailable:", e);
      }
      if (vec) {
        const items = await q(SQL.semanticSearch, [toPgVector(vec), genre, userId]);
        return NextResponse.json({ mode, items, query: SQL.semanticSearch });
      }
      const items = await q(SQL.keywordSearch, [genre, text, userId]);
      return NextResponse.json({
        mode: "keyword",
        warning: "Meaning search needs the embedding model, which could not be loaded. Showing keyword results.",
        items,
        query: SQL.keywordSearch,
      });
    }

    const items = await q(SQL.keywordSearch, [genre, text, userId]);
    return NextResponse.json({ mode, items, query: SQL.keywordSearch });
  },
  { readOnly: true }
);

// POST /api/movies {title, year, director, description, genres[]}  (admin)
// Vector "create": the text is embedded and stored with the movie by the add_movie procedure.
export const POST = route(
  async (req, { q }) => {
    const input = parseMovieInput(await body(req));
    if (typeof input === "string") return badRequest(input);
    const vector = await tryEmbedMovie(input);
    const [row] = await q<{ p_id: number }>(SQL.addMovie, [
      input.title, input.year, input.director, input.description, input.genres, vector,
    ]);
    return NextResponse.json(
      { id: row.p_id, embedded: vector !== null, warning: vector ? undefined : NO_MODEL_WARNING, query: SQL.addMovie },
      { status: 201 }
    );
  },
  { role: "admin" }
);
