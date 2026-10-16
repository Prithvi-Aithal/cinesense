import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "./http";

const WEEK = 7 * 24 * 60 * 60;

/** Put the session token in an httpOnly cookie: page scripts can't read it, only the server can. */
export function setSessionCookie(req: NextRequest, res: NextResponse, token: string) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: WEEK,
  });
  return res;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
