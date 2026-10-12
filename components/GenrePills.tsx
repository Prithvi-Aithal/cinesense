"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export default function GenrePills({ value, onChange }: { value: string | null; onChange: (g: string | null) => void }) {
  const [genres, setGenres] = useState<string[]>([]);
  useEffect(() => {
    api<{ items: { name: string }[] }>("/api/genres")
      .then((d) => setGenres(d.items.map((g) => g.name)))
      .catch(console.error);
  }, []);
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm transition ${
      active ? "border-gold bg-gold text-ink" : "border-line text-muted hover:border-gold-dim hover:text-text"
    }`;
  return (
    <div className="flex flex-wrap gap-2">
      <button className={pill(value === null)} onClick={() => onChange(null)}>
        All
      </button>
      {genres.map((g) => (
        <button key={g} className={pill(value === g)} onClick={() => onChange(value === g ? null : g)}>
          {g}
        </button>
      ))}
    </div>
  );
}
