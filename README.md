# CineSense

**A hybrid SQL + vector movie recommender.** PostgreSQL stores the facts (movies, genres, users, ratings), and pgvector handles what's similar. Built with Next.js for a DBMS course project.

| Industry / Domain | Problem Statement | Problem Description |
|---|---|---|
| Media & Entertainment (content recommendation) | Users struggle to discover movies relevant to their taste using only keyword or genre-based search. | Catalog search relies on exact matches (title, genre, director), so it misses movies that are similar in theme, tone or story. CineSense stores structured data (ratings, genres, metadata) in relational SQL tables and stores an embedding of each movie's description in a pgvector column. Recommendations combine a user's rating history (SQL) with nearest-neighbour search over the embeddings (vector), filtered by structured attributes like genre. This is polyglot persistence where each store does work the other can't. |

## Features

| Page | Who | What it does | Database work |
|---|---|---|---|
| **Browse** `/` | everyone | Keyword search, genre filter, star ratings | SQL: `ILIKE` and a genre join through the `movie_details` view |
| **Browse: Meaning search** | everyone | Type "lonely robot falls in love" and get WALL-E and Her | Vector: the text is embedded, then `ORDER BY embedding <=> $1` |
| **Movie** `/movie/[id]` | everyone | Details, your rating, *More like this*, and a *Similarity trail* | Vector kNN with an optional SQL genre filter; a **recursive CTE** for the trail |
| **Log in / Sign up** `/login` | everyone | Accounts with hashed passwords and httpOnly session cookies | `register_user()` and `login()` functions with pgcrypto bcrypt |
| **For You** `/recommendations` | viewer, admin | Personal picks, a genre filter, and "Because you liked X" on each card | Hybrid: SQL history → taste vector → vector kNN with SQL filters → `LATERAL` join for the explanation |
| **Cold start** | viewer, admin | Users with no 4★+ ratings get top-rated movies | SQL `GROUP BY` scored by the `bayesian_score()` stored function |
| **My Ratings** `/my-ratings` | viewer, admin | Change or remove your ratings | Upsert (`ON CONFLICT`) and `DELETE`, limited to your rows by row-level security; triggers log each change |
| **Admin → Movies & vectors** `/admin` | admin | Add, edit, re-embed and delete movies; see every vector's size and length | **Vector create / read / update / delete** through the `add_movie` and `update_movie` procedures |
| **Admin → Users & roles** | admin | Promote, demote and delete accounts | `set_user_role` procedure (refuses to remove the last admin) |
| **Admin → Activity log** | admin | Every rating insert, change and delete | Written only by the `trg_ratings_audit` **trigger** |
| **Query Lab** `/lab` | admin | Joins, nested, correlated and recursive queries, functions, the trigger log, role privileges and RLS policies, with live results and `EXPLAIN ANALYZE` | Read-only transactions, optional `SET LOCAL enable_seqscan = off` |

Every page has a **"Show the query behind this"** panel with the exact SQL the API ran.

## Accounts and roles

`npm run seed` creates these demo accounts:

| Name | Password | Role |
|---|---|---|
| `admin` | `admin123` | admin |
| `Aarav`, `Meera`, `Kabir`, `Zoya`, `Rohan`, `Isha`, `Dev`, `Ananya`, `Vikram`, `Sara`, `Neel`, `Tara`, `New Viewer` | `viewer123` | viewer |

Anyone can sign up; new accounts are viewers. Access is enforced in three layers: the UI hides what you can't use, each API route checks your role, and **PostgreSQL itself** refuses anything else. The app connects as `cinesense_app`, a database login with no privileges of its own, and every request switches to `cinesense_anon`, `cinesense_viewer` or `cinesense_admin` with `SET LOCAL ROLE`. GRANTs (including column-level ones) and row-level security policies in [`db/security.sql`](db/security.sql) decide what each role can do. See [docs/REPORT.md](docs/REPORT.md#8-authentication-and-role-based-access-control).

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind v4). API route handlers are the backend, and the browser never touches the database.
- **PostgreSQL 16 + pgvector 0.8+**: relational tables and a `vector(384)` column in the same database, with an HNSW index. (0.8 adds iterative index scans, which keep genre-filtered vector searches from returning too few rows.)
- **pgcrypto** for bcrypt password hashes and session tokens.
- **Embeddings:** `all-MiniLM-L6-v2` (384 dims) run locally through `@huggingface/transformers`. No API key and no paid service.
- `pg` driver, `tsx` for the seed script.

```
Browser ──> Next.js pages ──> Next.js API routes ──> PostgreSQL 16 (login: cinesense_app)
   httpOnly session cookie        │    SET LOCAL ROLE anon | viewer | admin per request
                                  │                     ├─ users, genres, movies, movie_genres, ratings, sessions, rating_audit
                                  │                     ├─ movies.embedding vector(384) + HNSW index (pgvector)
                                  │                     └─ functions, procedures, triggers, roles, row-level security
                                  └─ embedding model (Meaning search and new movies; runs in the Node process)
```

## Run it locally

1. **Postgres 16 + pgvector 0.8+.** The simplest way is Docker:
   ```bash
   docker run -d --name cinesense-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=moviedb -p 5432:5432 pgvector/pgvector:pg16
   ```
   Or install both yourself and run `createdb moviedb`.
2. **Configure.** Copy `.env.example` to `.env.local`. It holds two connection strings:
   - `DATABASE_OWNER_URL`: the database owner (`postgres`). Only the seed script uses it, to create tables, functions, triggers and roles.
   - `DATABASE_URL`: the app's restricted login, `cinesense_app`. The seed creates this role with the password in this URL.
3. **Install and seed.**
   ```bash
   npm install
   npm run seed
   ```
   The seed drops and recreates the tables, loads 105 movies, 12 genres, 14 users and about 216 ratings, builds the indexes **after** the data is in, then creates the functions, triggers, roles and privileges. Embeddings ship precomputed in `data/embeddings.json`, so seeding needs no model download.
4. **Start.** Run `npm run dev`, open http://localhost:3000 and log in with a demo account.
   The first *Meaning* search, or the first movie an admin adds, downloads the model (~90 MB) into `./.models`; after that it is instant. If the download fails, search falls back to keyword mode and shows a notice, and new movies are saved without a vector until re-embedded.

Adding a movie: use **Admin → Add movie**, or append it to `data/movies.json` and run `npm run seed` (only new or changed movies are re-embedded).

## Project layout

```
app/
  page.tsx                     Browse (keyword + meaning search)
  movie/[id]/page.tsx          Movie detail, More like this, Similarity trail
  login/page.tsx               Log in / Sign up
  recommendations/page.tsx     For You                         (viewer)
  my-ratings/page.tsx          Rating history                  (viewer)
  admin/page.tsx               Movies & vectors, Users & roles, Activity log   (admin)
  lab/page.tsx                 Query Lab (EXPLAIN ANALYZE)     (admin)
  api/
    auth/{login,register,logout,me}   POST / GET  session cookie handling
    movies/route.ts            GET  ?q=&genre=&mode=keyword|semantic    POST (admin: create + embed)
    movies/[id]/route.ts       GET  one movie    PATCH (admin: edit + re-embed)    DELETE (admin)
    movies/[id]/similar/       GET  ?sameGenre=1
    movies/[id]/trail/         GET  ?steps=5   (recursive CTE)
    recommendations/route.ts   GET  ?genre=                   (viewer)
    ratings/route.ts           POST {movieId,rating}  DELETE {movieId}   (viewer, own rows only)
    me/ratings/route.ts        GET                            (viewer)
    users/route.ts             GET                            (admin)
    users/[id]/route.ts        PATCH {role}  DELETE           (admin)
    admin/movies/route.ts      GET  movies with vector stats  (admin)
    audit/route.ts             GET  trigger-written log       (admin)
    genres/route.ts            GET
    lab/route.ts               GET list, POST {id, forceIndex}  (admin)
components/                    Nav, RequireRole, MovieCard, StarRating, GenrePills, QueryPanel, UserProvider
lib/
  db.ts                        pg Pool + withSession(): one transaction as the caller's database role
  http.ts                      route() wrapper: role checks, DB error -> HTTP status
  session.ts                   httpOnly session cookie
  queries.ts                   every SQL statement the app runs
  lab.ts                       Query Lab statements
  embeddings.ts                local MiniLM embedding model
  movieInput.ts                admin form validation + embedding
  vector.ts                    pgvector literal helpers + weighted centroid
db/
  schema.sql                   tables, constraints, movie_details view
  indexes.sql                  B-tree + HNSW indexes (run after load)
  functions.sql                functions, procedures, recursive CTE, triggers
  security.sql                 roles, GRANTs, row-level security
data/                          movies.json, users.json, embeddings.json (cache)
scripts/seed.ts                seed script
docs/REPORT.md                 ER diagram, normalization, RBAC, triggers, queries, viva Q&A
docs/RUBRIC.md                 where each evaluation criterion is implemented
docs/er-diagram.png            ER diagram image
```

See **[docs/REPORT.md](docs/REPORT.md)** for the report material and **[docs/RUBRIC.md](docs/RUBRIC.md)** for the rubric mapping.
