import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { route } from "@/lib/http";

// GET /api/audit  (admin) -> latest rating changes, as recorded by the trg_ratings_audit trigger
export const GET = route(
  async (_req, { q }) => NextResponse.json({ items: await q(SQL.auditLog), query: SQL.auditLog }),
  { role: "admin", readOnly: true }
);
