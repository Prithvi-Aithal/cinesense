"use client";

import { useState } from "react";

type Props = {
  value: number | null;
  onRate: (rating: number) => void;
  size?: "sm" | "lg";
  disabled?: boolean;
};

export default function StarRating({ value, onRate, size = "sm", disabled }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value ?? 0;
  return (
    <div className="flex items-center" onMouseLeave={() => setHover(null)} aria-label="Rate this movie">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onMouseEnter={() => setHover(n)}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRate(n);
          }}
          className={`${size === "lg" ? "text-3xl" : "text-lg"} leading-none transition disabled:cursor-not-allowed ${
            n <= shown ? "text-gold" : "text-line"
          } hover:scale-110`}
          title={`${n} star${n > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}
