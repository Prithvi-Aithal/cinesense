"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import MovieCard from "@/components/MovieCard";
import StarRating from "@/components/StarRating";
import QueryPanel from "@/components/QueryPanel";
import { useUser } from "@/components/UserProvider";
import { api } from "@/lib/api";
import type { Movie } from "@/lib/types";

export default function MoviePage() {
  const { id } = useParams<{ id: string }>();
  const { user, refreshUsers } = useUser();
  const [movie, setMovie] = useState<Movie | null>(null);
  const [similar, setSimilar] = useState<Movie[]>([]);
  const [sameGenre, setSameGenre] = useState(false);
  const [sql, setSql] = useState<{ detail?: string; similar?: string }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const qs = user ? `?userId=${user.id}` : "";
    api<{ item: Movie; query: string }>(`/api/movies/${id}${qs}`)
      .then((d) => {
        setMovie(d.item);
        setSql((s) => ({ ...s, detail: d.query }));
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [id, user]);

  useEffect(() => {
    api<{ items: Movie[]; query: string }>(`/api/movies/${id}/similar${sameGenre ? "?sameGenre=1" : ""}`)
      .then((d) => {
        setSimilar(d.items);
        setSql((s) => ({ ...s, similar: d.query }));
      })
      .catch(console.error);
  }, [id, sameGenre]);

  async function rate(rating: number) {
    if (!user || !movie) return;
    setMovie({ ...movie, my_rating: rating });
    await api("/api/ratings", { method: "POST", body: JSON.stringify({ userId: user.id, movieId: movie.id, rating }) });
    const fresh = await api<{ item: Movie }>(`/api/movies/${id}?userId=${user.id}`);
    setMovie(fresh.item);
    refreshUsers();
  }

  async function clearRating() {
    if (!user || !movie) return;
    await api("/api/ratings", { method: "DELETE", body: JSON.stringify({ userId: user.id, movieId: movie.id }) });
    const fresh = await api<{ item: Movie }>(`/api/movies/${id}?userId=${user.id}`);
    setMovie(fresh.item);
    refreshUsers();
  }

  if (error) return <p className="py-16 text-center text-red">{error}</p>;
  if (!movie) return <p className="py-16 text-center text-muted">Loading…</p>;

  return (
    <div>
      <Link href="/" className="text-sm text-muted hover:text-gold">
        ← Back to browse
      </Link>
      <article className="film-card mt-4 grid gap-6 p-8 md:grid-cols-[1fr_260px]">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-4xl text-gold">{movie.title}</h1>
          <p className="mt-2 text-muted">
            {movie.year} · Directed by {movie.director}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {movie.genres.map((g) => (
              <span key={g} className="rounded border border-line px-2 py-0.5 text-sm text-muted">
                {g}
              </span>
            ))}
          </div>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed">{movie.description}</p>
        </div>
        <aside className="rounded-lg border border-line bg-panel-2 p-5">
          <p className="text-sm text-muted">Average rating</p>
          <p className="text-3xl text-gold">
            {movie.avg_rating ? Number(movie.avg_rating).toFixed(1) : "–"}
            <span className="text-base text-muted"> / 5 · {movie.rating_count} ratings</span>
          </p>
          <div className="ticket-divider !mx-[-20px]" />
          <p className="mb-1 text-sm text-muted">{user ? `${user.name}'s rating` : "Your rating"}</p>
          <StarRating value={movie.my_rating} onRate={rate} size="lg" disabled={!user} />
          {movie.my_rating && (
            <button onClick={clearRating} className="mt-2 text-xs text-muted underline hover:text-red">
              Remove rating
            </button>
          )}
        </aside>
      </article>

      <section className="mt-10">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl">More like this</h2>
            <p className="text-sm text-muted">The 6 nearest movies by cosine distance between description embeddings.</p>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={sameGenre} onChange={(e) => setSameGenre(e.target.checked)} className="accent-[#e5b453]" />
            Only movies sharing a genre (SQL filter)
          </label>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {similar.map((m) => (
            <MovieCard key={m.id} movie={m} badge={m.similarity ? `${Math.round(Number(m.similarity) * 100)}% similar` : null} />
          ))}
        </div>
      </section>

      <QueryPanel queries={[sql.detail, sql.similar].filter(Boolean) as string[]} label="Show the queries behind this page" />
    </div>
  );
}
