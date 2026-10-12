import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { SQL } from "@/lib/queries";
import { badRequest, handle, intParam } from "@/lib/http";

export const GET = handle(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const userId = intParam((await ctx.params).id);
  if (!userId) return badRequest("Invalid user id.");
  return NextResponse.json({ items: await query(SQL.userRatings, [userId]), query: SQL.userRatings });
});
