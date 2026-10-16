import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { route } from "@/lib/http";

export const GET = route(
  async (_req, { q }) => NextResponse.json({ items: await q(SQL.listGenres), query: SQL.listGenres }),
  { readOnly: true }
);
