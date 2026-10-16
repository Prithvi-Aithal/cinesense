"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import StarRating from "@/components/StarRating";
import QueryPanel from "@/components/QueryPanel";
import { useUser } from "@/components/UserProvider";
import RequireRole from "@/components/RequireRole";
import { api } from "@/lib/api";
import type { Movie } from "@/lib/types";

export default function MyRatingsPage() {
  return (
    <RequireRole role="viewer">
      <MyRatings />
    </RequireRole>
  );
}

function MyRatings() {
  const { user, refreshUser } = useUser();
  const [items, setItems] = useState<Movie[]>([]);
  const [sql, setSql] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) return;
    api<{ items: Movie[]; query: string }>("/api/me/ratings").then((d) => {
      setItems(d.items);
      setSql([d.query]);
      setLoaded(true);
    });
  }, [user]);

  async function rate(movieId: number, rating: number) {
    if (!user) return;
    setItems((xs) => xs.map((m) => (m.id === movieId ? { ...m, my_rating: rating } : m)));
    await api("/api/ratings", { method: "POST", body: JSON.stringify({ movieId, rating }) });
  }

  async function remove(movieId: number) {
    if (!user) return;
    setItems((xs) => xs.filter((m) => m.id !== movieId));
    await api("/api/ratings", { method: "DELETE", body: JSON.stringify({ movieId }) });
    refreshUser();
  }

  return (
    <div>
      <h1 className="mb-2 mt-4 font-[family-name:var(--font-display)] text-4xl">{user?.name ?? "My"}&apos;s ratings</h1>
      <p className="mb-6 text-muted">
        {loaded ? `${items.length} rated.` : "Loading…"} Change a rating here and For You updates to match. Ratings of 4★ and above pull
        recommendations closer, and 1-2★ push them away.
      </p>
      <div className="overflow-hidden rounded-lg border border-line">
        {items.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-4 border-b border-line bg-panel px-4 py-3 last:border-0">
            <Link href={`/movie/${m.id}`} className="min-w-48 flex-1 hover:text-gold">
              <span className="font-medium">{m.title}</span>{" "}
              <span className="text-sm text-muted">
                ({m.year}) · {m.genres.join(", ")}
              </span>
            </Link>
            <StarRating value={m.my_rating} onRate={(r) => rate(m.id, r)} />
            <button onClick={() => remove(m.id)} className="text-xs text-muted hover:text-red">
              Remove
            </button>
          </div>
        ))}
        {loaded && items.length === 0 && (
          <p className="bg-panel px-4 py-10 text-center text-muted">
            No ratings yet. <Link href="/" className="text-gold underline">Browse</Link> and rate a few movies.
          </p>
        )}
      </div>
      <QueryPanel queries={sql} />
    </div>
  );
}
