import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { badRequest, body, intParam, route } from "@/lib/http";

// Both handlers act for the signed-in user only. A userId in the body is ignored, and the
// database's row-level security would refuse another user's row anyway.

// POST /api/ratings {movieId, rating}  -> insert or update (upsert)
export const POST = route(
  async (req, { q, actor }) => {
    const b = await body(req);
    const movieId = intParam(String(b.movieId ?? ""));
    const rating = Number(b.rating);
    if (!movieId) return badRequest("movieId is required.");
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return badRequest("rating must be an integer from 1 to 5.");
    const [row] = await q(SQL.upsertRating, [actor!.id, movieId, rating]);
    return NextResponse.json(row);
  },
  { role: "viewer" }
);

// DELETE /api/ratings {movieId}
export const DELETE = route(
  async (req, { q, actor }) => {
    const movieId = intParam(String((await body(req)).movieId ?? ""));
    if (!movieId) return badRequest("movieId is required.");
    await q(SQL.deleteRating, [actor!.id, movieId]);
    return NextResponse.json({ ok: true });
  },
  { role: "viewer" }
);
