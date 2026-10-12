-- CineSense schema: relational tables (SQL) + one vector column (pgvector).
-- Run order: schema.sql -> load data -> indexes.sql (vector index is built AFTER the data is loaded).

CREATE EXTENSION IF NOT EXISTS vector;

DROP VIEW  IF EXISTS movie_details;
DROP TABLE IF EXISTS ratings, movie_genres, movies, genres, users CASCADE;

CREATE TABLE users (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(60) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
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
