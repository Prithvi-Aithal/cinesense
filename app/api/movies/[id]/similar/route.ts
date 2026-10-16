import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { badRequest, intParam, route } from "@/lib/http";

// GET /api/movies/:id/similar?sameGenre=1
export const GET = route<{ id: string }>(
  async (req, { q }, params) => {
    const id = intParam(params.id);
    if (!id) return badRequest("Invalid movie id.");
    const sameGenre = req.nextUrl.searchParams.get("sameGenre") === "1";
    const items = await q(SQL.similar, [id, sameGenre]);
    return NextResponse.json({ items, query: SQL.similar });
  },
  { readOnly: true }
);
