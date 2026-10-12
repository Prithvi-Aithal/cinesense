// Every SQL statement the app runs, in one place. The API routes import these,
// and the UI can show them ("Show query"), which is handy for the viva.
//
// Pattern used by all vector queries: an inner query orders the base `movies` table by
// distance and LIMITs (so the HNSW index can be used), then the outer query joins the
// few winners to the `movie_details` view for display.

export const SQL = {
  // ---------- SQL side ----------
  listGenres: `SELECT id, name FROM genres ORDER BY name`,

  listUsers: `
SELECT u.id, u.name, COUNT(r.movie_id)::int AS rating_count
FROM users u
LEFT JOIN ratings r ON r.user_id = u.id
GROUP BY u.id
ORDER BY u.id`,

  createUser: `INSERT INTO users (name) VALUES ($1) RETURNING id, name`,

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
DO UPDATE SET rating = EXCLUDED.rating, rated_at = now()
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
WHERE r.user_id = $1`,

  // Cold start: popularity. A Bayesian average pulls movies with few ratings towards the
  // global mean (3.5), so one lucky 5-star rating can't put a movie at the top.
  popular: `
SELECT d.*, NULL::int AS my_rating,
       ROUND((d.avg_rating * d.rating_count + 3.5 * 3) / (d.rating_count + 3), 2) AS score
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
  WHERE ($2::text IS NULL OR EXISTS (
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
  WHERE m.id <> $1
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
  WHERE NOT EXISTS (SELECT 1 FROM ratings r WHERE r.user_id = $2 AND r.movie_id = m.id)
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
} as const;
