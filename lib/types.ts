export type Movie = {
  id: number;
  title: string;
  year: number;
  director: string | null;
  description: string;
  genres: string[];
  avg_rating: string | null; // NUMERIC comes back from pg as a string
  rating_count: number;
  my_rating: number | null;
  similarity?: string | null;
  because_id?: number | null;
  because_title?: string | null;
  score?: string | null;
};

export type User = { id: number; name: string; rating_count: number };
