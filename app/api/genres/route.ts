import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { SQL } from "@/lib/queries";
import { handle } from "@/lib/http";

export const GET = handle(async () => {
  return NextResponse.json({ items: await query(SQL.listGenres), query: SQL.listGenres });
});
