import { embed, movieText } from "./embeddings";
import { toPgVector } from "./vector";

export type MovieInput = { title: string; year: number; director: string; description: string; genres: string[] };

/** Validate an admin's create/edit form. Returns the clean input, or an error message. */
export function parseMovieInput(b: Record<string, unknown>): MovieInput | string {
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const director = typeof b.director === "string" ? b.director.trim() : "";
  const description = typeof b.description === "string" ? b.description.trim() : "";
  const year = Number(b.year);
  const genres = Array.isArray(b.genres)
    ? [...new Set(b.genres.filter((g): g is string => typeof g === "string").map((g) => g.trim()).filter(Boolean))]
    : [];
  if (!title || title.length > 200) return "Title must be 1-200 characters.";
  if (!Number.isInteger(year) || year < 1888 || year > 2100) return "Year must be between 1888 and 2100.";
  if (director.length > 200) return "Director must be at most 200 characters.";
  if (description.length < 10) return "Description must be at least 10 characters.";
  if (genres.length === 0) return "Pick at least one genre.";
  if (genres.some((g) => g.length > 30)) return "Genre names must be at most 30 characters.";
  return { title, year, director, description, genres };
}

/**
 * Embed a movie's text with the local model. Returns null if the model can't be loaded,
 * in which case the movie is saved without a vector (and stays out of similarity search).
 */
export async function tryEmbedMovie(m: { title: string; description: string; genres: string[] }): Promise<string | null> {
  try {
    const [v] = await embed([movieText(m)]);
    return toPgVector(v);
  } catch (e) {
    console.error("Embedding failed:", e);
    return null;
  }
}

export const NO_MODEL_WARNING =
  "Saved, but the embedding model could not be loaded, so this movie has no vector and won't appear in similarity search until it is re-embedded.";
