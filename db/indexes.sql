-- Built after the data load, so the indexes reflect the real data.

-- B-tree indexes for the SQL side (filters and joins).
CREATE INDEX IF NOT EXISTS idx_movies_year         ON movies (year);
CREATE INDEX IF NOT EXISTS idx_movie_genres_genre  ON movie_genres (genre_id);   -- (movie_id, ...) is covered by the PK
CREATE INDEX IF NOT EXISTS idx_ratings_movie       ON ratings (movie_id);        -- (user_id, ...) is covered by the PK
CREATE INDEX IF NOT EXISTS idx_sessions_user       ON sessions (user_id);        -- logout everywhere / cascade on user delete
CREATE INDEX IF NOT EXISTS idx_rating_audit_time   ON rating_audit (changed_at DESC);  -- newest-first activity log

-- HNSW graph index for approximate nearest-neighbour search on the vector side.
-- vector_cosine_ops matches the <=> (cosine distance) operator used in every similarity query.
CREATE INDEX IF NOT EXISTS idx_movies_embedding_hnsw
  ON movies USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

ANALYZE;
