import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { fromPgVector, toPgVector, weightedCentroid } from "@/lib/vector";
import { route, textParam } from "@/lib/http";

// GET /api/recommendations?genre=   (logged in; always for the signed-in user)
//
// 1. SQL:    fetch every movie the user rated, with its embedding.
// 2. App:    build a taste vector = weighted sum of those embeddings.
//            weight = rating - 3, so 5 stars = +2, 4 = +1, 3 = 0, 2 = -1, 1 = -2
//            (liked movies pull the vector towards them, disliked ones push it away).
// 3. Vector: nearest neighbours of the taste vector, with SQL filters
//            (not already rated, optional genre) and a "because you liked" lookup.
// Cold start (nothing rated 4+): fall back to a SQL popularity ranking.
export const GET = route(
  async (req, { q, actor }) => {
    const userId = actor!.id;
    const genre = textParam(req.nextUrl.searchParams.get("genre"));

    const rated = await q<{ id: number; title: string; rating: number; embedding: string }>(SQL.userRatedVectors, [userId]);
    const liked = rated.filter((r) => r.rating >= 4);
    const disliked = rated.filter((r) => r.rating <= 2);

    if (liked.length === 0) {
      const items = await q(SQL.popular, [genre, userId]);
      return NextResponse.json({
        mode: "cold-start",
        profile: { rated: rated.length, liked: 0, disliked: disliked.length },
        items,
        queries: [SQL.userRatedVectors, SQL.popular],
      });
    }

    const taste = weightedCentroid(rated.map((r) => ({ v: fromPgVector(r.embedding), w: r.rating - 3 })))!;
    const items = await q(SQL.recommend, [toPgVector(taste), userId, genre]);
    return NextResponse.json({
      mode: "personalized",
      profile: { rated: rated.length, liked: liked.length, disliked: disliked.length },
      items,
      queries: [SQL.userRatedVectors, SQL.recommend],
    });
  },
  { role: "viewer", readOnly: true }
);
