import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { route } from "@/lib/http";

// GET /api/me/ratings  -> the signed-in user's rating history
export const GET = route(
  async (_req, { q, actor }) => NextResponse.json({ items: await q(SQL.userRatings, [actor!.id]), query: SQL.userRatings }),
  { role: "viewer", readOnly: true }
);
