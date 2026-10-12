import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { SQL } from "@/lib/queries";
import { badRequest, handle, intParam } from "@/lib/http";

// GET /api/movies/:id/similar?sameGenre=1
export const GET = handle(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const id = intParam((await ctx.params).id);
  if (!id) return badRequest("Invalid movie id.");
  const sameGenre = req.nextUrl.searchParams.get("sameGenre") === "1";
  const items = await query(SQL.similar, [id, sameGenre]);
  return NextResponse.json({ items, query: SQL.similar });
});
