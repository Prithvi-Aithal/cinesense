import { NextResponse } from "next/server";
import { SQL } from "@/lib/queries";
import { badRequest, body, intParam, route } from "@/lib/http";
import { NO_MODEL_WARNING, parseMovieInput, tryEmbedMovie } from "@/lib/movieInput";

type P = { id: string };

// GET /api/movies/:id  (public; includes the caller's own rating when logged in)
export const GET = route<P>(
  async (_req, { q, actor }, params) => {
    const id = intParam(params.id);
    if (!id) return badRequest("Invalid movie id.");
    const [movie] = await q(SQL.movieById, [id, actor?.id ?? null]);
    if (!movie) return NextResponse.json({ error: "Movie not found." }, { status: 404 });
    return NextResponse.json({ item: movie, query: SQL.movieById });
  },
  { readOnly: true }
);

// PATCH /api/movies/:id  (admin)
//   {title, year, director, description, genres[]}  -> vector "update": edit and re-embed
//   {reembed: true}                                  -> recompute the vector from the current text only
export const PATCH = route<P>(
  async (req, { q }, params) => {
    const id = intParam(params.id);
    if (!id) return badRequest("Invalid movie id.");
    const b = await body(req);

    if (b.reembed === true) {
      const [current] = await q<{ title: string; description: string; genres: string[] }>(SQL.movieText, [id]);
      if (!current) return NextResponse.json({ error: "Movie not found." }, { status: 404 });
      const vector = await tryEmbedMovie(current);
      if (!vector) return NextResponse.json({ error: "The embedding model could not be loaded." }, { status: 503 });
      await q(SQL.updateEmbedding, [id, vector]);
      return NextResponse.json({ id, embedded: true, query: SQL.updateEmbedding });
    }

    const input = parseMovieInput(b);
    if (typeof input === "string") return badRequest(input);
    const vector = await tryEmbedMovie(input);
    await q(SQL.updateMovie, [id, input.title, input.year, input.director, input.description, input.genres, vector]);
    return NextResponse.json({ id, embedded: vector !== null, warning: vector ? undefined : NO_MODEL_WARNING, query: SQL.updateMovie });
  },
  { role: "admin" }
);

// DELETE /api/movies/:id  (admin) -> vector "delete": the row, its vector, genre links and ratings go
export const DELETE = route<P>(
  async (_req, { q }, params) => {
    const id = intParam(params.id);
    if (!id) return badRequest("Invalid movie id.");
    const [gone] = await q(SQL.deleteMovie, [id]);
    if (!gone) return NextResponse.json({ error: "Movie not found." }, { status: 404 });
    return NextResponse.json({ ok: true, deleted: gone, query: SQL.deleteMovie });
  },
  { role: "admin" }
);
