"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import MovieCard from "@/components/MovieCard";
import StarRating from "@/components/StarRating";
import QueryPanel from "@/components/QueryPanel";
import { useUser } from "@/components/UserProvider";
import { api } from "@/lib/api";
import type { Movie, TrailStep } from "@/lib/types";

export default function MoviePage() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: userLoading, refreshUser } = useUser();
  const userId = user?.id ?? null;
  const [movie, setMovie] = useState<Movie | null>(null);
  const [similar, setSimilar] = useState<Movie[]>([]);
  const [similarLoaded, setSimilarLoaded] = useState(false);
  const [trail, setTrail] = useState<TrailStep[]>([]);
  const [sameGenre, setSameGenre] = useState(false);
  const [sql, setSql] = useState<{ detail?: string; similar?: string; trail?: string }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading) return;
    api<{ item: Movie; query: string }>(`/api/movies/${id}`)
      .then((d) => {
        setMovie(d.item);
        setSql((s) => ({ ...s, detail: d.query }));
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [id, userId, userLoading]);

  useEffect(() => {
    api<{ items: TrailStep[]; query: string }>(`/api/movies/${id}/trail?steps=5`)
      .then((d) => {
        setTrail(d.items);
        setSql((s) => ({ ...s, trail: d.query }));
      })
      .catch(console.error);
  }, [id]);

  useEffect(() => {
    api<{ items: Movie[]; query: string }>(`/api/movies/${id}/similar${sameGenre ? "?sameGenre=1" : ""}`)
      .then((d) => {
        setSimilar(d.items);
        setSimilarLoaded(true);
        setSql((s) => ({ ...s, similar: d.query }));
      })
      .catch(console.error);
  }, [id, sameGenre]);

  async function rate(rating: number) {
    if (!user || !movie) return;
    setMovie({ ...movie, my_rating: rating });
    await api("/api/ratings", { method: "POST", body: JSON.stringify({ movieId: movie.id, rating }) });
    const fresh = await api<{ item: Movie }>(`/api/movies/${id}`);
    setMovie(fresh.item);
    refreshUser();
  }

  async function clearRating() {
    if (!user || !movie) return;
    await api("/api/ratings", { method: "DELETE", body: JSON.stringify({ movieId: movie.id }) });
    const fresh = await api<{ item: Movie }>(`/api/movies/${id}`);
    setMovie(fresh.item);
    refreshUser();
  }

  if (error) return <p className="py-16 text-center text-red">{error}</p>;
  if (!movie) return <p className="py-16 text-center text-muted">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-muted hover:text-gold">
          ← Back to browse
        </Link>
        {user?.role === "admin" && (
          <Link href={`/admin?edit=${movie.id}`} className="text-sm text-gold underline">
            Edit in admin
          </Link>
        )}
      </div>
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
          {user ? (
            <StarRating value={movie.my_rating} onRate={rate} size="lg" />
          ) : (
            <Link href={`/login?next=/movie/${movie.id}`} className="text-sm text-gold underline">
              Log in to rate this movie
            </Link>
          )}
          {user && movie.my_rating && (
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
        {similarLoaded && similar.length === 0 && (
          <p className="rounded-lg border border-line bg-panel px-4 py-6 text-sm text-muted">
            This movie has no embedding yet, so there is nothing to compare it with. An admin can re-embed it.
          </p>
        )}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {similar.map((m) => (
            <MovieCard key={m.id} movie={m} badge={m.similarity ? `${Math.round(Number(m.similarity) * 100)}% similar` : null} />
          ))}
        </div>
      </section>

      {trail.length > 1 && (
        <section className="mt-10">
          <h2 className="font-[family-name:var(--font-display)] text-2xl">Similarity trail</h2>
          <p className="mb-4 text-sm text-muted">
            A recursive query: from this movie, keep hopping to the nearest movie not visited yet.
          </p>
          <ol className="flex flex-wrap items-center gap-2 text-sm">
            {trail.map((t, i) => (
              <li key={t.id} className="flex items-center gap-2">
                {i > 0 && <span className="text-muted">→</span>}
                {i === 0 ? (
                  <span className="rounded-full bg-gold px-3 py-1 text-ink">{t.title}</span>
                ) : (
                  <Link href={`/movie/${t.id}`} className="rounded-full border border-line px-3 py-1 hover:border-gold-dim hover:text-gold">
                    {t.title}
                    {t.similarity && <span className="ml-1 text-xs text-muted">{Math.round(Number(t.similarity) * 100)}%</span>}
                  </Link>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      <QueryPanel
        queries={[sql.detail, sql.similar, sql.trail].filter(Boolean) as string[]}
        label="Show the queries behind this page"
      />
    </div>
  );
}
