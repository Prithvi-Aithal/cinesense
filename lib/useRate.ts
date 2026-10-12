"use client";

import { useCallback } from "react";
import { api } from "./api";
import { useUser } from "@/components/UserProvider";
import type { Movie } from "./types";

/** Returns a rate(movieId, rating) function that saves the rating and updates local state optimistically. */
export function useRate(setMovies: React.Dispatch<React.SetStateAction<Movie[]>>) {
  const { user, refreshUsers } = useUser();
  return useCallback(
    async (movieId: number, rating: number) => {
      if (!user) return;
      setMovies((ms) => ms.map((m) => (m.id === movieId ? { ...m, my_rating: rating } : m)));
      await api("/api/ratings", { method: "POST", body: JSON.stringify({ userId: user.id, movieId, rating }) });
      refreshUsers();
    },
    [user, setMovies, refreshUsers]
  );
}
