"use client";

import { useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "./api";
import { useUser } from "@/components/UserProvider";
import type { Movie } from "./types";

/**
 * Returns a rate(movieId, rating) function that saves the signed-in user's rating and updates
 * local state optimistically. Visitors who are not logged in are sent to the login page.
 */
export function useRate(setMovies: React.Dispatch<React.SetStateAction<Movie[]>>) {
  const { user, refreshUser } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    async (movieId: number, rating: number) => {
      if (!user) {
        router.push(`/login?next=${encodeURIComponent(pathname)}`);
        return;
      }
      setMovies((ms) => ms.map((m) => (m.id === movieId ? { ...m, my_rating: rating } : m)));
      await api("/api/ratings", { method: "POST", body: JSON.stringify({ movieId, rating }) });
      refreshUser();
    },
    [user, setMovies, refreshUser, router, pathname]
  );
}
