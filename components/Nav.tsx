"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useUser } from "./UserProvider";

const links = [
  { href: "/", label: "Browse" },
  { href: "/recommendations", label: "For You" },
  { href: "/my-ratings", label: "My Ratings" },
  { href: "/lab", label: "Query Lab" },
];

export default function Nav() {
  const pathname = usePathname();
  const { users, user, setUserId, createUser } = useUser();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await createUser(name.trim());
      setName("");
      setAdding(false);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-ink/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-full border-2 border-gold text-sm text-gold">◉</span>
          <span className="font-[family-name:var(--font-display)] text-xl tracking-wide text-gold">CineSense</span>
        </Link>
        <nav className="flex flex-wrap gap-1 text-sm">
          {links.map((l) => {
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
        <div className="ml-auto flex min-w-0 items-center gap-2 text-sm">
          {adding ? (
            <form onSubmit={submit} className="flex items-center gap-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="New user name"
                maxLength={60}
                className="w-36 rounded-md border border-line bg-panel px-2 py-1 outline-none focus:border-gold"
              />
              <button className="rounded-md bg-gold px-2 py-1 text-ink" disabled={!name.trim()}>
                Add
              </button>
              <button type="button" onClick={() => { setAdding(false); setError(null); }} className="text-muted">
                Cancel
              </button>
              {error && <span className="text-red">{error}</span>}
            </form>
          ) : (
            <>
              <span className="text-muted">Watching as</span>
              <select
                value={user?.id ?? ""}
                onChange={(e) => (e.target.value === "new" ? setAdding(true) : setUserId(Number(e.target.value)))}
                className="max-w-48 truncate rounded-md border border-line bg-panel px-2 py-1 outline-none focus:border-gold"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.rating_count})
                  </option>
                ))}
                <option value="new">+ New user…</option>
              </select>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
