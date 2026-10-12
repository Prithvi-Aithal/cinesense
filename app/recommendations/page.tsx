"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MovieCard from "@/components/MovieCard";
import GenrePills from "@/components/GenrePills";
import QueryPanel from "@/components/QueryPanel";
import { useUser } from "@/components/UserProvider";
import { api } from "@/lib/api";
import type { Movie } from "@/lib/types";

type Resp = {
  mode: "personalized" | "cold-start";
  profile: { rated: number; liked: number; disliked: number };
  items: Movie[];
  queries: string[];
};

export default function RecommendationsPage() {
  const { user } = useUser();
  const router = useRouter();
  const [genre, setGenre] = useState<string | null>(null);
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams({ userId: String(user.id) });
    if (genre) params.set("genre", genre);
    api<Resp>(`/api/recommendations?${params}`)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [user, genre, user?.rating_count]);

  const personalized = data?.mode === "personalized";

  return (
    <div>
      <section className="mb-6 mt-4">
        <h1 className="font-[family-name:var(--font-display)] text-4xl">For You{user ? `, ${user.name}` : ""}</h1>
        {data && (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span
              className={`rounded-full px-3 py-1 font-medium ${personalized ? "bg-gold text-ink" : "border border-gold-dim text-gold"}`}
            >
              {personalized ? "Personalized · SQL + vector" : "Cold start · SQL popularity"}
            </span>
            <span className="text-muted">
              {personalized
                ? `Taste profile built from ${data.profile.liked} liked and ${data.profile.disliked} disliked movies.`
                : "Rate a few movies 4★ or higher to get personal picks. Until then, these are the best-rated movies overall."}
            </span>
          </div>
        )}
      </section>

      <details className="mb-6 rounded-lg border border-line bg-panel px-4 py-3 text-sm text-muted">
        <summary className="cursor-pointer select-none hover:text-text">How these are picked</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li><b className="text-text">SQL</b> fetches every movie you rated, with its embedding.</li>
          <li>
            The app builds a <b className="text-text">taste vector</b>: a weighted sum of those embeddings, where 5★ counts +2,
            4★ +1, 3★ 0, 2★ −1 and 1★ −2. Movies you disliked push the vector away.
          </li>
          <li>
            <b className="text-text">pgvector</b> finds the movies closest to that vector, while SQL conditions skip anything
            you have already rated and apply the genre filter.
          </li>
          <li>For each pick, a LATERAL join finds which of your liked movies it is closest to.</li>
        </ol>
      </details>

      <GenrePills value={genre} onChange={setGenre} />
      {error && <p className="mt-4 text-red">{error}</p>}

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {data?.items.map((m) => (
          <MovieCard
            key={m.id}
            movie={m}
            badge={
              m.similarity
                ? `${Math.round(Number(m.similarity) * 100)}% match`
                : m.score
                  ? `${Number(m.score).toFixed(1)} score`
                  : null
            }
            footnote={
              m.because_title ? (
                <>
                  Because you liked{" "}
                  <span
                    role="link"
                    onClick={(e) => {
                      // The whole card is already a link, so this is a span to avoid nesting <a> tags.
                      e.preventDefault();
                      e.stopPropagation();
                      router.push(`/movie/${m.because_id}`);
                    }}
                    className="text-gold underline decoration-dotted"
                  >
                    {m.because_title}
                  </span>
                </>
              ) : null
            }
          />
        ))}
      </div>
      {data && data.items.length === 0 && (
        <p className="py-16 text-center text-muted">Nothing left to recommend in this genre. You&apos;ve rated them all.</p>
      )}

      <QueryPanel queries={data?.queries ?? []} label="Show the queries behind this" />
    </div>
  );
}
