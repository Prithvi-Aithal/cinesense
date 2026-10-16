// Every SQL statement the app runs, in one place. The API routes import these,
// and the UI can show them ("Show query"), which is handy for the viva.
//
// Pattern used by all vector queries: an inner query orders the base `movies` table by
// distance and LIMITs (so the HNSW index can be used), then the outer query joins the
// few winners to the `movie_details` view for display.

export const SQL = {
  // ---------- SQL side ----------
  listGenres: `SELECT id, name FROM genres ORDER BY name`,

  // ---------- Accounts (the functions are in db/functions.sql) ----------
  register: `SELECT register_user($1, $2) AS id`,
  login: `SELECT token, user_id, name, role FROM login($1, $2)`,
  logout: `SELECT logout()`,
  myRatingCount: `SELECT COUNT(*)::int AS rating_count FROM ratings WHERE user_id = $1`,

  // Admin: every account with its activity (password_hash is not even readable by admins).
  listUsers: `
SELECT u.id, u.name, u.role, u.created_at,
       COUNT(r.movie_id)::int AS rating_count,
       (SELECT COUNT(*)::int FROM sessions s WHERE s.user_id = u.id AND s.expires_at > now()) AS active_sessions
FROM users u
LEFT JOIN ratings r ON r.user_id = u.id
GROUP BY u.id
ORDER BY u.role, u.name`,

  setUserRole: `CALL set_user_role($1, $2)`,
  deleteUser: `DELETE FROM users WHERE id = $1 RETURNING id`,

  // Browse: genre filter + keyword search (exact substring match only).
  keywordSearch: `
SELECT d.*, r.rating AS my_rating
FROM movie_details d
LEFT JOIN ratings r ON r.movie_id = d.id AND r.user_id = $3
WHERE ($1::text IS NULL OR $1 = ANY (d.genres))
  AND ($2::text IS NULL
       OR d.title       ILIKE '%' || $2 || '%'
       OR d.director    ILIKE '%' || $2 || '%'
       OR d.description ILIKE '%' || $2 || '%')
ORDER BY d.title`,

  movieById: `
SELECT d.*, r.rating AS my_rating
FROM movie_details d
LEFT JOIN ratings r ON r.movie_id = d.id AND r.user_id = $2
WHERE d.id = $1`,

  // Upsert: the composite primary key (user_id, movie_id) turns a second rating into an update.
  upsertRating: `
INSERT INTO ratings (user_id, movie_id, rating)
VALUES ($1, $2, $3)
ON CONFLICT (user_id, movie_id)
DO UPDATE SET rating = EXCLUDED.rating   -- trg_ratings_touch moves rated_at
RETURNING user_id, movie_id, rating`,

  deleteRating: `DELETE FROM ratings WHERE user_id = $1 AND movie_id = $2`,

  userRatings: `
SELECT d.*, r.rating AS my_rating, r.rated_at
FROM ratings r
JOIN movie_details d ON d.id = r.movie_id
WHERE r.user_id = $1
ORDER BY r.rating DESC, r.rated_at DESC`,

  // Step 1 of recommendations: everything this user rated, with the vectors.
  userRatedVectors: `
SELECT m.id, m.title, r.rating, m.embedding::text AS embedding
FROM ratings r
JOIN movies m ON m.id = r.movie_id
WHERE r.user_id = $1 AND m.embedding IS NOT NULL`,

  // Cold start: popularity. bayesian_score() (a stored function) pulls movies with few ratings
  // towards the global mean (3.5), so one lucky 5-star rating can't put a movie at the top.
  popular: `
SELECT d.*, NULL::int AS my_rating,
       bayesian_score(d.avg_rating, d.rating_count) AS score
FROM movie_details d
WHERE d.rating_count > 0
  AND ($1::text IS NULL OR $1 = ANY (d.genres))
  AND NOT EXISTS (SELECT 1 FROM ratings r WHERE r.user_id = $2 AND r.movie_id = d.id)
ORDER BY score DESC, d.rating_count DESC, d.title
LIMIT 12`,

  // ---------- Vector side ----------
  // Browse in "meaning" mode: nearest neighbours of the embedded search text.
  semanticSearch: `
WITH nn AS (
  SELECT m.id, m.embedding <=> $1::vector AS distance
  FROM movies m
  WHERE m.embedding IS NOT NULL
    AND ($2::text IS NULL OR EXISTS (
          SELECT 1 FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id
          WHERE mg.movie_id = m.id AND g.name = $2))
  ORDER BY m.embedding <=> $1::vector
  LIMIT 12
)
SELECT d.*, r.rating AS my_rating, ROUND((1 - nn.distance)::numeric, 3) AS similarity
FROM nn
JOIN movie_details d ON d.id = nn.id
LEFT JOIN ratings r ON r.movie_id = d.id AND r.user_id = $3
ORDER BY nn.distance`,

  // More like this: k-nearest neighbours of one movie's vector,
  // optionally restricted (SQL filter) to movies that share a genre with it.
  similar: `
WITH nn AS (
  SELECT m.id, m.embedding <=> (SELECT embedding FROM movies WHERE id = $1) AS distance
  FROM movies m
  WHERE m.id <> $1 AND m.embedding IS NOT NULL
    AND (NOT $2::boolean OR EXISTS (
          SELECT 1 FROM movie_genres a JOIN movie_genres b ON b.genre_id = a.genre_id
          WHERE a.movie_id = m.id AND b.movie_id = $1))
  ORDER BY m.embedding <=> (SELECT embedding FROM movies WHERE id = $1)
  LIMIT 6
)
SELECT d.*, ROUND((1 - nn.distance)::numeric, 3) AS similarity
FROM nn
JOIN movie_details d ON d.id = nn.id
ORDER BY nn.distance`,

  // ---------- Hybrid ----------
  // Step 3 of recommendations: nearest neighbours of the taste vector ($1),
  // excluding movies already rated (SQL), optionally one genre (SQL), and for each
  // result the liked movie it is closest to ("Because you liked ...").
  recommend: `
WITH nn AS (
  SELECT m.id, m.embedding <=> $1::vector AS distance
  FROM movies m
  WHERE m.embedding IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM ratings r WHERE r.user_id = $2 AND r.movie_id = m.id)
    AND ($3::text IS NULL OR EXISTS (
          SELECT 1 FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id
          WHERE mg.movie_id = m.id AND g.name = $3))
  ORDER BY m.embedding <=> $1::vector
  LIMIT 12
)
SELECT d.*, NULL::int AS my_rating,
       ROUND((1 - nn.distance)::numeric, 3) AS similarity,
       because.id AS because_id, because.title AS because_title
FROM nn
JOIN movie_details d ON d.id = nn.id
LEFT JOIN LATERAL (
  SELECT lm.id, lm.title
  FROM ratings lr
  JOIN movies lm ON lm.id = lr.movie_id
  WHERE lr.user_id = $2 AND lr.rating >= 4
  ORDER BY lm.embedding <=> (SELECT embedding FROM movies WHERE id = nn.id)
  LIMIT 1
) because ON true
ORDER BY nn.distance`,

  // Recursive CTE (wrapped in a stored function): start at a movie and keep hopping to the
  // nearest movie not yet visited. See similarity_trail() in db/functions.sql.
  trail: `SELECT step, id, title, similarity FROM similarity_trail($1, $2)`,

  // ---------- Admin: vector create / read / update / delete ----------
  // Read: every movie with the state of its vector (pgvector's vector_dims and vector_norm).
  adminMovies: `
SELECT d.id, d.title, d.year, d.director, d.description, d.genres, d.rating_count,
       vector_dims(m.embedding) AS dims,
       ROUND(vector_norm(m.embedding)::numeric, 3) AS norm
FROM movie_details d
JOIN movies m ON m.id = d.id
ORDER BY d.title`,

  // Create: a stored procedure inserts the movie and links its genres in one call.
  addMovie: `CALL add_movie($1, $2, $3, $4, $5::text[], $6::vector, NULL)`,

  // Update: text, genres and a freshly computed vector. NULL keeps the old vector, but the
  // trg_movies_stale_embedding trigger clears it if the text changed.
  updateMovie: `CALL update_movie($1, $2, $3, $4, $5, $6::text[], $7::vector)`,

  // Update the vector alone (re-embed the current text).
  updateEmbedding: `UPDATE movies SET embedding = $2::vector WHERE id = $1 RETURNING id`,

  // Delete: removes the row and its vector; ratings and genre links go with it (ON DELETE CASCADE).
  deleteMovie: `DELETE FROM movies WHERE id = $1 RETURNING id, title`,

  movieText: `SELECT d.title, d.description, d.genres FROM movie_details d WHERE d.id = $1`,

  // Written only by the trg_ratings_audit trigger. LEFT JOINs because the log keeps rows
  // for users and movies that have since been deleted.
  auditLog: `
SELECT a.id, a.action, a.old_rating, a.new_rating, a.db_role, a.changed_at,
       COALESCE(u.name, '(deleted user #' || a.user_id || ')') AS user_name,
       COALESCE(m.title, '(deleted movie #' || a.movie_id || ')') AS movie_title,
       by_u.name AS changed_by_name
FROM rating_audit a
LEFT JOIN users  u    ON u.id = a.user_id
LEFT JOIN movies m    ON m.id = a.movie_id
LEFT JOIN users  by_u ON by_u.id = a.changed_by
ORDER BY a.changed_at DESC, a.id DESC
LIMIT 50`,
} as const;
