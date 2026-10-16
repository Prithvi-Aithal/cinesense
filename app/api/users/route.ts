import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { route } from "@/lib/http";

// GET /api/users  (admin) -> every account with its role and activity.
// Accounts are created through /api/auth/register.
export const GET = route(
  async (_req, { q }) => NextResponse.json({ items: await q(SQL.listUsers), query: SQL.listUsers }),
  { role: "admin", readOnly: true }
);
