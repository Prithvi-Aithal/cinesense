import { NextResponse } from "next/server";

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
      console.error(err);
      // 23505 unique_violation, 23503 foreign_key_violation, 23514 check_violation
      if (err.code === "23505") return NextResponse.json({ error: "That already exists." }, { status: 409 });
      if (err.code === "23503") return NextResponse.json({ error: "Unknown user or movie." }, { status: 404 });
      if (err.code === "23514") return NextResponse.json({ error: "Value out of range." }, { status: 400 });
      return NextResponse.json({ error: err.message ?? "Server error" }, { status: 500 });
    }
  };
}
