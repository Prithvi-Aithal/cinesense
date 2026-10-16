import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { badRequest, body, route } from "@/lib/http";
import { setSessionCookie } from "@/lib/session";

// POST /api/auth/register {name, password}
// New accounts are always viewers; only an admin can promote someone.
export const POST = route(async (req, { q }) => {
  const b = await body(req);
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!name || name.length > 60) return badRequest("Name must be 1-60 characters.");
  if (password.length < 6) return badRequest("Password must be at least 6 characters.");
  await q(SQL.register, [name, password]);
  const [s] = await q<{ token: string; user_id: number; name: string; role: string }>(SQL.login, [name, password]);
  return setSessionCookie(
    req,
    NextResponse.json({ user: { id: s.user_id, name: s.name, role: s.role } }, { status: 201 }),
    s.token
  );
});
