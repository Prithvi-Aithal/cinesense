# CineSense

**A hybrid SQL + vector movie recommender.** PostgreSQL stores the facts (movies, genres, users, ratings), and pgvector handles what's similar. Built with Next.js for a DBMS course project.

| Industry / Domain | Problem Statement | Problem Description |
|---|---|---|
| Media & Entertainment (content recommendation) | Users struggle to discover movies relevant to their taste using only keyword or genre-based search. | Catalog search relies on exact matches (title, genre, director), so it misses movies that are similar in theme, tone or story. CineSense stores structured data (ratings, genres, metadata) in relational SQL tables and stores an embedding of each movie's description in a pgvector column. Recommendations combine a user's rating history (SQL) with nearest-neighbour search over the embeddings (vector), filtered by structured attributes like genre. This is polyglot persistence where each store does work the other can't. |

## Features

| Page | What it does | Database work |
|---|---|---|
| **Browse** `/` | Keyword search, genre filter, star ratings | SQL: `ILIKE` and a genre join through the `movie_details` view |
| **Browse: Meaning search** | Type "lonely robot falls in love" and get WALL-E and Her | Vector: the text is embedded, then `ORDER BY embedding <=> $1` |
| **Movie** `/movie/[id]` | Details, your rating, and *More like this* (optionally only genre-mates) | Vector kNN plus an optional SQL `EXISTS` genre filter |
| **For You** `/recommendations` | Personal picks, a genre filter, and "Because you liked X" on each card | Hybrid: SQL history → taste vector → vector kNN with SQL filters → `LATERAL` join for the explanation |
| **Cold start** | Users with no 4★+ ratings get top-rated movies | SQL: `GROUP BY` with a Bayesian average |
| **My Ratings** `/my-ratings` | Change or remove ratings | SQL upsert (`ON CONFLICT`) and `DELETE` |
| **Query Lab** `/lab` | The key queries with live results and `EXPLAIN ANALYZE`, a "force index" toggle, plus table and index sizes | Read-only transactions with `SET LOCAL enable_seqscan = off` |
| **User switcher** (header) | Switch between 13 seeded users or create a new one | SQL `INSERT` and aggregates |

Every page has a **"Show the query behind this"** panel with the exact SQL the API ran.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4). API route handlers are the backend, and the browser never touches the database.
- **PostgreSQL 16 + pgvector 0.8+**: relational tables and a `vector(384)` column in the same database, with an HNSW index. (0.8 adds iterative index scans, which keep genre-filtered vector searches from returning too few rows.)
- **Embeddings:** `all-MiniLM-L6-v2` (384 dims) run locally through `@huggingface/transformers`. No API key and no paid service.
- `pg` driver, `tsx` for the seed script.

```
Browser ──> Next.js pages ──> Next.js API routes ──> PostgreSQL 16
                                   │                   ├─ users, genres, movies, movie_genres, ratings  (SQL)
                                   │                   └─ movies.embedding vector(384) + HNSW index    (pgvector)
                                   └─ embedding model (only for Meaning search; runs in the Node process)
```

## Run it locally

1. **Postgres 16 + pgvector.** Install both, then:
   ```bash
   createdb moviedb
   psql -d moviedb -c "CREATE EXTENSION vector;"
   ```
   (Windows: use the pgvector installer or Docker: `docker run -e POSTGRES_PASSWORD=postgres -p 5432:5432 pgvector/pgvector:pg16`.)
2. **Configure.** Copy `.env.example` to `.env.local` and set `DATABASE_URL` (default: `postgres://postgres:postgres@localhost:5432/moviedb`).
3. **Install and seed.**
   ```bash
   npm install
   npm run seed
   ```
   The seed drops and recreates the tables, loads 105 movies, 12 genres, 13 users and about 216 ratings, then builds the indexes **after** the data is in. Embeddings ship precomputed in `data/embeddings.json`, so seeding needs no model download.
4. **Start.** Run `npm run dev` and open http://localhost:3000.
   The first *Meaning* search downloads the model (~90 MB) into `./.models` and is instant after that. If the download fails, search falls back to keyword mode and shows a notice.

Adding a movie: append it to `data/movies.json` and run `npm run seed`. Only new or changed movies are re-embedded.

## Project layout

```
app/
  page.tsx                     Browse (keyword + meaning search)
  movie/[id]/page.tsx          Movie detail + More like this
  recommendations/page.tsx     For You
  my-ratings/page.tsx          Rating history
  lab/page.tsx                 Query Lab (EXPLAIN ANALYZE)
  api/
    movies/route.ts            GET  ?q=&genre=&mode=keyword|semantic&userId=
    movies/[id]/route.ts       GET  one movie
    movies/[id]/similar/       GET  ?sameGenre=1
    recommendations/route.ts   GET  ?userId=&genre=
    ratings/route.ts           POST {userId,movieId,rating}  DELETE {userId,movieId}
    users/route.ts             GET, POST {name}
    users/[id]/ratings/        GET
    genres/route.ts            GET
    lab/route.ts               GET list, POST {id, forceIndex}
components/                    Nav (user switcher), MovieCard, StarRating, GenrePills, QueryPanel, UserProvider
lib/
  queries.ts                   every SQL statement the app runs
  lab.ts                       Query Lab statements
  embeddings.ts                local MiniLM embedding model
  vector.ts                    pgvector literal helpers + weighted centroid
  db.ts                        pg Pool
db/schema.sql                  tables + movie_details view
db/indexes.sql                 B-tree + HNSW indexes (run after load)
data/                          movies.json, users.json, embeddings.json (cache)
scripts/seed.ts                seed script
docs/REPORT.md                 ER diagram, normalization, queries, viva Q&A
```

See **[docs/REPORT.md](docs/REPORT.md)** for the report material.
