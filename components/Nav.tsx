"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "./UserProvider";
import type { Role } from "@/lib/types";

// Which links each role sees. The pages and the API enforce the same rules.
const links: { href: string; label: string; role?: Role }[] = [
  { href: "/", label: "Browse" },
  { href: "/recommendations", label: "For You", role: "viewer" },
  { href: "/my-ratings", label: "My Ratings", role: "viewer" },
  { href: "/admin", label: "Admin", role: "admin" },
  { href: "/lab", label: "Query Lab", role: "admin" },
];

export default function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useUser();

  const visible = links.filter((l) => !l.role || (user && (l.role === "viewer" || user.role === "admin")));

  async function signOut() {
    await logout();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-gold text-sm text-gold">◉</span>
          <span className="font-[family-name:var(--font-display)] text-xl tracking-wide text-gold">CineSense</span>
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm">
          {visible.map((l) => {
            const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-3 py-1.5 transition ${active ? "bg-gold text-ink" : "text-muted hover:text-text"}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-3 text-sm">
          {loading ? null : user ? (
            <>
              <span className="min-w-0 truncate" title={user.name}>
                {user.name}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  user.role === "admin" ? "bg-gold text-ink" : "border border-line text-muted"
                }`}
              >
                {user.role}
              </span>
              <button onClick={signOut} className="text-muted underline-offset-2 hover:text-text hover:underline">
                Log out
              </button>
            </>
          ) : (
            <Link href={`/login?next=${encodeURIComponent(pathname)}`} className="rounded-md bg-gold px-3 py-1.5 text-ink">
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
