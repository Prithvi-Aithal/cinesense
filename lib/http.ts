import { NextRequest, NextResponse } from "next/server";
import { withSession, type Actor, type Query } from "./db";

export const SESSION_COOKIE = "cinesense_session";

export function intParam(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function textParam(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

/** Wraps a route handler so database errors come back as JSON instead of an HTML error page. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      const err = e as { message?: string; code?: string };
      // 42501 insufficient_privilege: the database refused the role (GRANTs or row-level security).
      if (err.code === "42501") return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
      // 23505 unique_violation, 23503 foreign_key_violation, 23514 check_violation
      if (err.code === "23505") return NextResponse.json({ error: "That already exists." }, { status: 409 });
      if (err.code === "23503") return NextResponse.json({ error: "Unknown user or movie." }, { status: 404 });
      if (err.code === "23514" || err.code === "22001") return NextResponse.json({ error: "Value out of range." }, { status: 400 });
      // Messages raised on purpose by our functions and procedures (see db/functions.sql)
      if (err.code === "22023") return NextResponse.json({ error: err.message }, { status: 400 });
      if (err.code === "P0002") return NextResponse.json({ error: err.message }, { status: 404 });
      console.error(err);
      return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
    }
  };
}

type Ctx = { q: Query; actor: Actor; token: string | null };
type Segment<P> = { params: Promise<P> };

/**
 * A route handler that runs inside withSession (one transaction, as the caller's database role).
 * `role` is checked here for a friendly 401/403, and enforced again by the database's GRANTs.
 */
export function route<P = Record<string, never>>(
  fn: (req: NextRequest, ctx: Ctx, params: P) => Promise<Response>,
  opts: { role?: "viewer" | "admin"; readOnly?: boolean } = {}
) {
  return handle(async (req: NextRequest, segment?: Segment<P>) => {
    const params = segment?.params ? await segment.params : ({} as P);
    const token = req.cookies.get(SESSION_COOKIE)?.value ?? null;
    return withSession(
      token,
      async (q, actor) => {
        if (opts.role && !actor) return NextResponse.json({ error: "Please log in." }, { status: 401 });
        if (opts.role === "admin" && actor?.role !== "admin") {
          return NextResponse.json({ error: "Admins only." }, { status: 403 });
        }
        return fn(req, { q, actor, token }, params);
      },
      { readOnly: opts.readOnly }
    );
  });
}

/** Read a JSON body, treating a malformed one as empty. */
export async function body(req: NextRequest): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => ({}));
  return b && typeof b === "object" ? (b as Record<string, unknown>) : {};
}
