import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { route } from "@/lib/http";

// GET /api/auth/me -> the signed-in user, or null
export const GET = route(
  async (_req, { q, actor }) => {
    if (!actor) return NextResponse.json({ user: null });
    const [{ rating_count }] = await q<{ rating_count: number }>(SQL.myRatingCount, [actor.id]);
    return NextResponse.json({ user: { ...actor, rating_count } });
  },
  { readOnly: true }
);
