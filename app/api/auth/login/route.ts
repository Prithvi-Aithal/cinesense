import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { badRequest, body, route } from "@/lib/http";
import { setSessionCookie } from "@/lib/session";

// POST /api/auth/login {name, password}
// The database checks the bcrypt hash and creates the session (login() in db/functions.sql).
export const POST = route(async (req, { q }) => {
  const b = await body(req);
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!name || !password) return badRequest("Enter your name and password.");
  const [s] = await q<{ token: string; user_id: number; name: string; role: string }>(SQL.login, [name, password]);
  if (!s) return NextResponse.json({ error: "Wrong name or password." }, { status: 401 });
  return setSessionCookie(req, NextResponse.json({ user: { id: s.user_id, name: s.name, role: s.role } }), s.token);
});
