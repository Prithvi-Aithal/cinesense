import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { SQL } from "@/lib/queries";
import { badRequest, handle, textParam } from "@/lib/http";

export const GET = handle(async () => {
  return NextResponse.json({ items: await query(SQL.listUsers) });
});

export const POST = handle(async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const name = textParam(body.name);
  if (!name || name.length > 60) return badRequest("Name must be 1-60 characters.");
  const [user] = await query(SQL.createUser, [name]);
  return NextResponse.json({ ...user, rating_count: 0 }, { status: 201 });
});
