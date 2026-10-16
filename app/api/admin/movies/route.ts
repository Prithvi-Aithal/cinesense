import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { route } from "@/lib/http";

// GET /api/admin/movies  (admin) -> vector "read": every movie with its vector's dimensions and length
export const GET = route(
  async (_req, { q }) => NextResponse.json({ items: await q(SQL.adminMovies), query: SQL.adminMovies }),
  { role: "admin", readOnly: true }
);
