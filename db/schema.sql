-- CineSense schema: relational tables (SQL) + one vector column (pgvector).
-- Run order: schema.sql -> load data -> indexes.sql -> functions.sql -> security.sql
-- (the vector index is built AFTER the data is loaded, and triggers start after the seed data is in).

CREATE EXTENSION IF NOT EXISTS vector;     -- vector type, <=> distance operator, HNSW index
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- bcrypt password hashing and session tokens

DROP VIEW  IF EXISTS movie_details;
DROP TABLE IF EXISTS rating_audit, sessions, ratings, movie_genres, movies, genres, users CASCADE;

-- Accounts. role drives both the UI and the database role the app switches to (see security.sql).
-- password_hash is a bcrypt hash made by pgcrypto inside the database; no role can read it directly.
CREATE TABLE users (
  id             SERIAL PRIMARY KEY,
  name           VARCHAR(60) NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  role           VARCHAR(10) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE genres (
  id    SERIAL PRIMARY KEY,
  name  VARCHAR(30) NOT NULL UNIQUE
);

CREATE TABLE movies (
  id           SERIAL PRIMARY KEY,
  title        VARCHAR(200) NOT NULL,
  year         SMALLINT NOT NULL CHECK (year BETWEEN 1888 AND 2100),
  director     VARCHAR(200),
  description  TEXT NOT NULL,
  embedding    vector(384),                 -- all-MiniLM-L6-v2 sentence embedding of the description
  UNIQUE (title, year)
);

-- Many-to-many: a movie can have several genres.
CREATE TABLE movie_genres (
  movie_id  INT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  genre_id  INT NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, genre_id)
);

-- Many-to-many between users and movies, carrying the rating attribute.
-- The composite primary key guarantees one rating per user per movie.
CREATE TABLE ratings (
  user_id     INT NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  movie_id    INT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  rated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, movie_id)
);

-- Login sessions. Only a SHA-256 hash of the cookie token is stored, so a leaked table can't be replayed.
CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,
  CHECK (expires_at > created_at)
);

-- History of every rating change, written only by the trg_ratings_audit trigger.
-- No foreign keys on purpose: the log must survive the user or movie being deleted.
CREATE TABLE rating_audit (
  id          BIGSERIAL PRIMARY KEY,
  action      VARCHAR(6) NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  user_id     INT NOT NULL,
  movie_id    INT NOT NULL,
  old_rating  SMALLINT,
  new_rating  SMALLINT,
  changed_by  INT,                      -- the signed-in user who made the change
  db_role     TEXT NOT NULL,            -- the database role the change ran under
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Read model used by the UI: one row per movie with its genres and rating stats.
-- Derived data lives in a view, not in extra columns, so the base tables stay normalized.
CREATE VIEW movie_details AS
SELECT m.id, m.title, m.year, m.director, m.description,
       COALESCE(g.genres, '{}')       AS genres,
       ROUND(AVG(r.rating)::numeric, 2) AS avg_rating,
       COUNT(r.rating)::int            AS rating_count
FROM movies m
LEFT JOIN LATERAL (
  SELECT array_agg(gn.name ORDER BY gn.name) AS genres
  FROM movie_genres mg JOIN genres gn ON gn.id = mg.genre_id
  WHERE mg.movie_id = m.id
) g ON true
LEFT JOIN ratings r ON r.movie_id = m.id
GROUP BY m.id, g.genres;
