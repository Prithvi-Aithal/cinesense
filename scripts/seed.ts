// Seeds the database: schema -> genres, movies (+ embeddings) -> users, ratings -> indexes
// -> functions and triggers -> roles and privileges.
// Run with `npm run seed` (reads DATABASE_OWNER_URL and DATABASE_URL from .env.local).
//
// Embeddings are cached in data/embeddings.json, keyed by the exact text that was embedded,
// so re-seeding is instant and works offline. Add or edit a movie in data/movies.json and
// only that movie is re-embedded (the model is downloaded on first use).
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { embed, movieText, MODEL_ID, EMBEDDING_DIMS } from "../lib/embeddings";
import { toPgVector } from "../lib/vector";

type Movie = { title: string; year: number; director: string; genres: string[]; description: string };
type UserSpec = { name: string; role?: "admin" | "viewer"; likes: string[]; dislikes: string[] };

// Demo passwords, listed in the README. Hashed with bcrypt inside the database.
const DEMO_PASSWORD = { admin: "admin123", viewer: "viewer123" } as const;

// Creating roles, functions and policies needs the database owner, not the app's restricted login.
const ownerUrl = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
const pool = new Pool({ connectionString: ownerUrl });
type Cache = { model: string; dims: number; vectors: Record<string, { hash: string; v: number[] }> };

const root = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const movies: Movie[] = JSON.parse(read("data/movies.json"));
const users: UserSpec[] = JSON.parse(read("data/users.json"));
const cachePath = path.join(root, "data/embeddings.json");

// Deterministic pseudo-random numbers, so every seed produces the same ratings.
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

async function loadEmbeddings(): Promise<number[][]> {
  let cache: Cache = { model: MODEL_ID, dims: EMBEDDING_DIMS, vectors: {} };
  if (fs.existsSync(cachePath)) {
    const c = JSON.parse(fs.readFileSync(cachePath, "utf8")) as Cache;
    if (c.model === MODEL_ID && c.dims === EMBEDDING_DIMS) cache = c;
  }
  const texts = movies.map(movieText);
  const keys = movies.map((m) => `${m.title} (${m.year})`);
  const hashes = texts.map((t) => createHash("sha1").update(t).digest("hex"));
  const missing = keys.map((_, i) => i).filter((i) => cache.vectors[keys[i]]?.hash !== hashes[i]);

  if (missing.length) {
    console.log(`Embedding ${missing.length} movie(s) with ${MODEL_ID} ...`);
    const vecs = await embed(missing.map((i) => texts[i]));
    missing.forEach((i, j) => (cache.vectors[keys[i]] = { hash: hashes[i], v: vecs[j].map((x) => Number(x.toFixed(6))) }));
    fs.writeFileSync(cachePath, JSON.stringify(cache));
  } else {
    console.log("All embeddings found in data/embeddings.json (no model needed).");
  }
  return keys.map((k) => cache.vectors[k].v);
}

// Give the cinesense_app login role the password from DATABASE_URL, so the two can't drift apart.
async function setAppPassword(client: import("pg").PoolClient) {
  const appUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
  if (appUrl?.username !== "cinesense_app") {
    console.warn("DATABASE_URL does not use cinesense_app, so the app will not run under the restricted role.");
    return;
  }
  const password = decodeURIComponent(appUrl.password);
  await client.query(`ALTER ROLE cinesense_app PASSWORD ${client.escapeLiteral(password)}`);
}

async function main() {
  const vectors = await loadEmbeddings();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(read("db/schema.sql"));

    // Genres (lookup table)
    const genreNames = [...new Set(movies.flatMap((m) => m.genres))].sort();
    const genreId = new Map<string, number>();
    for (const g of genreNames) {
      const { rows } = await client.query("INSERT INTO genres (name) VALUES ($1) RETURNING id", [g]);
      genreId.set(g, rows[0].id);
    }

    // Movies + their genres
    const movieIds: number[] = [];
    for (let i = 0; i < movies.length; i++) {
      const m = movies[i];
      const { rows } = await client.query(
        `INSERT INTO movies (title, year, director, description, embedding)
         VALUES ($1, $2, $3, $4, $5::vector) RETURNING id`,
        [m.title, m.year, m.director, m.description, toPgVector(vectors[i])]
      );
      movieIds.push(rows[0].id);
      for (const g of m.genres) {
        await client.query("INSERT INTO movie_genres (movie_id, genre_id) VALUES ($1, $2)", [rows[0].id, genreId.get(g)]);
      }
    }

    // Users + ratings generated from each user's taste (likes rate high, dislikes rate low).
    let ratingCount = 0;
    for (let u = 0; u < users.length; u++) {
      const spec = users[u];
      const role = spec.role ?? "viewer";
      const { rows } = await client.query(
        "INSERT INTO users (name, password_hash, role) VALUES ($1, crypt($2, gen_salt('bf', 8)), $3) RETURNING id",
        [spec.name, DEMO_PASSWORD[role], role]
      );
      if (spec.likes.length === 0) continue; // the cold-start demo user has no ratings
      const rand = rng(1000 + u * 7919);
      const liked = movies.map((m, i) => i).filter((i) => movies[i].genres.some((g) => spec.likes.includes(g)));
      const others = movies.map((m, i) => i).filter((i) => !liked.includes(i));
      const pick = (arr: number[], n: number) => [...arr].sort(() => rand() - 0.5).slice(0, n);
      const chosen = [...pick(liked, 12), ...pick(others, 6)];
      for (const i of chosen) {
        const g = movies[i].genres;
        let score = 3 + (rand() - 0.5) * 1.6;
        if (g.some((x) => spec.likes.includes(x))) score += 1.5;
        if (g.some((x) => spec.dislikes.includes(x))) score -= 1.8;
        const rating = Math.max(1, Math.min(5, Math.round(score)));
        await client.query("INSERT INTO ratings (user_id, movie_id, rating) VALUES ($1, $2, $3)", [rows[0].id, movieIds[i], rating]);
        ratingCount++;
      }
    }

    await client.query(read("db/indexes.sql"));
    await client.query(read("db/functions.sql"));   // triggers start now, so the seed data isn't in the audit log
    await client.query(read("db/security.sql"));
    await setAppPassword(client);
    await client.query("COMMIT");
    console.log(`Seeded ${genreNames.length} genres, ${movies.length} movies, ${users.length} users, ${ratingCount} ratings.`);
    console.log("Created roles cinesense_anon, cinesense_viewer, cinesense_admin and login role cinesense_app.");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
