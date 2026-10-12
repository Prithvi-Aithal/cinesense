import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { SQL } from "@/lib/queries";
import { badRequest, handle, intParam } from "@/lib/http";

// POST /api/ratings {userId, movieId, rating}  -> insert or update (upsert)
export const POST = handle(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const userId = intParam(String(body.userId ?? ""));
  const movieId = intParam(String(body.movieId ?? ""));
  const rating = Number(body.rating);
  if (!userId || !movieId) return badRequest("userId and movieId are required.");
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return badRequest("rating must be an integer from 1 to 5.");
  const [row] = await query(SQL.upsertRating, [userId, movieId, rating]);
  return NextResponse.json(row);
});

// DELETE /api/ratings {userId, movieId}
export const DELETE = handle(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const userId = intParam(String(body.userId ?? ""));
  const movieId = intParam(String(body.movieId ?? ""));
  if (!userId || !movieId) return badRequest("userId and movieId are required.");
  await query(SQL.deleteRating, [userId, movieId]);
  return NextResponse.json({ ok: true });
});
