"use client";

import Link from "next/link";
import StarRating from "./StarRating";
import type { Movie } from "@/lib/types";

type Props = {
  movie: Movie;
  onRate?: (movieId: number, rating: number) => void;
  badge?: string | null; // e.g. "87% match"
  footnote?: React.ReactNode; // e.g. "Because you liked ..."
};

// Deterministic poster colour from the title, so every movie has its own look without images.
function hue(title: string) {
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export default function MovieCard({ movie, onRate, badge, footnote }: Props) {
  const h = hue(movie.title);
  return (
    <Link href={`/movie/${movie.id}`} className="film-card group flex flex-col transition hover:border-gold-dim">
      <div
        className="mb-3 flex h-28 items-end rounded-md p-3"
        style={{ background: `linear-gradient(135deg, hsl(${h} 45% 22%), hsl(${(h + 40) % 360} 35% 10%))` }}
      >
        <h3 className="font-[family-name:var(--font-display)] text-lg leading-tight text-text group-hover:text-gold">
          {movie.title}
        </h3>
      </div>
      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          {movie.year} · {movie.director}
        </span>
        {badge && <span className="rounded-full bg-gold/15 px-2 py-0.5 font-medium text-gold">{badge}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {movie.genres.map((g) => (
          <span key={g} className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted">
            {g}
          </span>
        ))}
      </div>
      <p className="mt-2 line-clamp-3 text-sm text-muted">{movie.description}</p>
      <div className="ticket-divider" />
      <div className="mt-auto flex items-center justify-between">
        {onRate ? (
          <StarRating value={movie.my_rating} onRate={(r) => onRate(movie.id, r)} />
        ) : (
          <span className="text-xs text-muted">{movie.my_rating ? `You rated ${movie.my_rating}★` : ""}</span>
        )}
        <span className="text-xs text-muted">
          {movie.avg_rating ? `${Number(movie.avg_rating).toFixed(1)}★ · ${movie.rating_count}` : "No ratings"}
        </span>
      </div>
      {footnote && <div className="mt-2 text-xs text-gold-dim">{footnote}</div>}
    </Link>
  );
}
