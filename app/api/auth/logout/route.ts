import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { route } from "@/lib/http";
import { clearSessionCookie } from "@/lib/session";

// POST /api/auth/logout -> delete the session row in the database and the cookie in the browser
export const POST = route(async (_req, { q }) => {
  await q(SQL.logout);
  return clearSessionCookie(NextResponse.json({ ok: true }));
});
