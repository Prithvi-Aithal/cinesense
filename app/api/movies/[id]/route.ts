import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { SQL } from "@/lib/queries";
import { badRequest, handle, intParam } from "@/lib/http";

export const GET = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const id = intParam((await ctx.params).id);
  if (!id) return badRequest("Invalid movie id.");
  const userId = intParam(req.nextUrl.searchParams.get("userId"));
  const [movie] = await query(SQL.movieById, [id, userId]);
  if (!movie) return NextResponse.json({ error: "Movie not found." }, { status: 404 });
  return NextResponse.json({ item: movie, query: SQL.movieById });
});
