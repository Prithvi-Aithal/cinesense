"use client";

import { useEffect, useState } from "react";
import MovieCard from "@/components/MovieCard";
import GenrePills from "@/components/GenrePills";
import QueryPanel from "@/components/QueryPanel";
import { useUser } from "@/components/UserProvider";
import { api } from "@/lib/api";
import { useRate } from "@/lib/useRate";
import type { Movie } from "@/lib/types";

type Mode = "keyword" | "semantic";
type Resp = { mode: Mode; items: Movie[]; query: string; warning?: string };

const EXAMPLES = ["astronauts stranded far from home", "a heist that goes wrong", "falling in love across time", "a family haunted by grief"];

export default function BrowsePage() {
  const { user, loading: userLoading } = useUser();
  const userId = user?.id ?? null;
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [mode, setMode] = useState<Mode>("keyword");
  const [genre, setGenre] = useState<string | null>(null);
  const [movies, setMovies] = useState<Movie[]>([]);
  const [sql, setSql] = useState<string[]>([]);
  const [usedMode, setUsedMode] = useState<Mode>("keyword");
  const [warning, setWarning] = useState<string | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rate = useRate(setMovies);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (userLoading) return;
    const params = new URLSearchParams({ mode });
    if (debounced) params.set("q", debounced);
    if (genre) params.set("genre", genre);
    let cancelled = false;
    const key = params.toString();
    api<Resp>(`/api/movies?${key}`)
      .then((d) => {
        if (cancelled) return;
        setMovies(d.items);
        setSql([d.query]);
        setUsedMode(d.mode);
        setWarning(d.warning ?? null);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoadedKey(key));
    return () => {
      cancelled = true;
    };
  }, [debounced, mode, genre, userId, userLoading]);

  const requestKey = userLoading
    ? null
    : new URLSearchParams({ mode, ...(debounced ? { q: debounced } : {}), ...(genre ? { genre } : {}) }).toString();
  const loading = requestKey !== loadedKey;

  return (
    <div>
      <section className="mb-8 mt-4">
        <h1 className="font-[family-name:var(--font-display)] text-4xl text-text">Find films by what they&apos;re about</h1>
        <p className="mt-2 max-w-2xl text-muted">
          Keyword search matches exact words with SQL. Meaning search turns your text into a vector and finds the
          closest movies with pgvector, even when none of your words appear in the description.
        </p>
      </section>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={mode === "semantic" ? "Describe a movie: “lonely robot falls in love”" : "Search title, director or description"}
            className="flex-1 rounded-lg border border-line bg-panel px-4 py-3 outline-none placeholder:text-muted/70 focus:border-gold"
          />
          <div className="flex rounded-lg border border-line bg-panel p-1 text-sm">
            {(["keyword", "semantic"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-4 py-2 transition ${mode === m ? "bg-gold text-ink" : "text-muted hover:text-text"}`}
              >
                {m === "keyword" ? "Keyword · SQL" : "Meaning · Vector"}
              </button>
            ))}
          </div>
        </div>
        {mode === "semantic" && !q && (
          <div className="flex flex-wrap gap-2 text-sm text-muted">
            Try:
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => setQ(ex)} className="underline decoration-dotted hover:text-gold">
                {ex}
              </button>
            ))}
          </div>
        )}
        <GenrePills value={genre} onChange={setGenre} />
      </div>

      <div className="mb-4 mt-6 flex items-center justify-between text-sm text-muted">
        <span>
          {loading ? "Loading…" : `${movies.length} movie${movies.length === 1 ? "" : "s"}`}
          {!loading && usedMode === "semantic" && " · ranked by similarity"}
        </span>
      </div>
      {warning && <p className="mb-4 rounded-md border border-gold-dim/50 bg-gold/10 px-3 py-2 text-sm text-gold">{warning}</p>}
      {error && <p className="mb-4 text-red">{error}</p>}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {movies.map((m) => (
          <MovieCard
            key={m.id}
            movie={m}
            onRate={rate}
            badge={m.similarity ? `${Math.round(Number(m.similarity) * 100)}% match` : null}
          />
        ))}
      </div>
      {!loading && movies.length === 0 && <p className="py-16 text-center text-muted">No movies match. Try Meaning search.</p>}

      <QueryPanel queries={sql} />
    </div>
  );
}
