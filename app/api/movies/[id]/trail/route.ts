import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { badRequest, intParam, route } from "@/lib/http";

// GET /api/movies/:id/trail?steps=5  -> similarity trail from a recursive CTE
export const GET = route<{ id: string }>(
  async (req, { q }, params) => {
    const id = intParam(params.id);
    if (!id) return badRequest("Invalid movie id.");
    const steps = Math.min(intParam(req.nextUrl.searchParams.get("steps")) ?? 5, 10);
    const items = await q(SQL.trail, [id, steps]);
    return NextResponse.json({ items, query: SQL.trail });
  },
  { readOnly: true }
);
