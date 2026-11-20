import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { badRequest, body, intParam, route } from "@/lib/http";

type P = { id: string };

// PATCH /api/users/:id {role}  (super admin only) -> set_user_role procedure; the super admin's own role can't change
export const PATCH = route<P>(
  async (req, { q }, params) => {
    const id = intParam(params.id);
    if (!id) return badRequest("Invalid user id.");
    const role = (await body(req)).role;
    if (role !== "admin" && role !== "viewer") return badRequest("role must be 'admin' or 'viewer'.");
    await q(SQL.setUserRole, [id, role]);
    return NextResponse.json({ ok: true, query: SQL.setUserRole });
  },
  { role: "superadmin" }
);

// DELETE /api/users/:id  (super admin only) -> ratings and sessions go with it (ON DELETE CASCADE)
export const DELETE = route<P>(
  async (_req, { q, actor }, params) => {
    const id = intParam(params.id);
    if (!id) return badRequest("Invalid user id.");
    if (id === actor!.id) return badRequest("You can't delete your own account while signed in.");
    const [gone] = await q(SQL.deleteUser, [id]);
    if (!gone) return NextResponse.json({ error: "User not found." }, { status: 404 });
    return NextResponse.json({ ok: true, query: SQL.deleteUser });
  },
  { role: "superadmin" }
);
