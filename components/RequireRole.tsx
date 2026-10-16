"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useUser } from "./UserProvider";
import type { Role } from "@/lib/types";

/**
 * Front-end gate for pages that need a signed-in user (or an admin). It only decides what to show:
 * the API and the database enforce the same rule on every request.
 */
export default function RequireRole({ role, children }: { role: Role; children: React.ReactNode }) {
  const { user, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [loading, user, router, pathname]);

  if (loading || !user) return <p className="py-16 text-center text-muted">Loading…</p>;
  if (role === "admin" && user.role !== "admin") {
    return (
      <div className="py-16 text-center">
        <p className="text-2xl">Admins only</p>
        <p className="mt-2 text-muted">
          You are signed in as {user.name}, a viewer. <Link href="/" className="text-gold underline">Back to browse</Link>
        </p>
      </div>
    );
  }
  return <>{children}</>;
}
