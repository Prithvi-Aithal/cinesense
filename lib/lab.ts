// Query Lab: a fixed set of example queries the /lab page can EXPLAIN ANALYZE.
// Only these predefined statements can run; the page never sends raw SQL.

// What each query demonstrates (shown as a tag in the Lab).
export type LabKind = "SQL" | "Join" | "Correlated" | "Recursive" | "Function" | "Trigger" | "RBAC" | "Vector" | "Hybrid";

export type LabQuery = {
  id: string;
  title: string;
  kind: LabKind;
  explain: string;
  sql: string;
  params: unknown[];
};

export const LAB_QUERIES: LabQuery[] = [
  {
    id: "keyword",
    title: "Keyword search",
    kind: "SQL",
    explain:
      "ILIKE only matches exact substrings. Searching 'space' finds descriptions containing that word, but misses films about astronauts or galaxies that never use it.",
    sql: `SELECT id, title, year
FROM movies
WHERE title ILIKE '%' || $1 || '%' OR description ILIKE '%' || $1 || '%'
ORDER BY title`,
    params: ["space"],
  },
  {
    id: "genre-join",
    title: "Genre filter (3-table join)",
    kind: "Join",
    explain:
      "Sci-Fi movies released after 2010. Joins movies, movie_genres and genres, using the B-tree indexes on movie_genres.genre_id and movies.year.",
    sql: `SELECT m.id, m.title, m.year
FROM movies m
JOIN movie_genres mg ON mg.movie_id = m.id
JOIN genres g        ON g.id = mg.genre_id
WHERE g.name = $1 AND m.year > $2
ORDER BY m.year DESC`,
    params: ["Sci-Fi", 2010],
  },
  {
    id: "popular",
    title: "Top rated (aggregation + stored function)",
    kind: "Function",
    explain:
      "The cold-start ranking. GROUP BY with AVG and COUNT, scored by the stored SQL function bayesian_score(), which pulls movies with very few ratings towards the global mean.",
    sql: `SELECT m.title, COUNT(*) AS ratings, ROUND(AVG(r.rating), 2) AS avg,
       bayesian_score(AVG(r.rating), COUNT(*)::int) AS score
FROM ratings r
JOIN movies m ON m.id = r.movie_id
GROUP BY m.id
HAVING COUNT(*) >= $1
ORDER BY score DESC
LIMIT 10`,
    params: [2],
  },
  {
    id: "correlated",
    title: "Above their genre's average (correlated subquery)",
    kind: "Correlated",
    explain:
      "For each (movie, genre) row, the inner query recomputes that genre's average rating, so it is re-evaluated per outer row. Lists movies that beat their own genre's average by at least half a star.",
    sql: `SELECT d.title, g.name AS genre, d.avg_rating,
       (SELECT ROUND(AVG(r2.rating), 2)
        FROM ratings r2 JOIN movie_genres mg2 ON mg2.movie_id = r2.movie_id
        WHERE mg2.genre_id = g.id) AS genre_avg
FROM movie_details d
JOIN movie_genres mg ON mg.movie_id = d.id
JOIN genres g        ON g.id = mg.genre_id
WHERE d.rating_count >= $1
  AND d.avg_rating >= $2 + (SELECT AVG(r2.rating)
                            FROM ratings r2 JOIN movie_genres mg2 ON mg2.movie_id = r2.movie_id
                            WHERE mg2.genre_id = g.id)
ORDER BY d.avg_rating DESC, d.title
LIMIT 12`,
    params: [2, 0.5],
  },
  {
    id: "nested",
    title: "Users who never rated a genre (nested NOT IN)",
    kind: "SQL",
    explain:
      "A nested (non-correlated) subquery: the inner query runs once to collect everyone who rated a Horror movie, and the outer query keeps the users not in that set.",
    sql: `SELECT u.name, u.role
FROM users u
WHERE u.id NOT IN (
  SELECT r.user_id
  FROM ratings r
  JOIN movie_genres mg ON mg.movie_id = r.movie_id
  JOIN genres g        ON g.id = mg.genre_id
  WHERE g.name = $1
)
ORDER BY u.name`,
    params: ["Horror"],
  },
  {
    id: "recursive",
    title: "Similarity trail (recursive CTE)",
    kind: "Recursive",
    explain:
      "WITH RECURSIVE: start at Interstellar and repeatedly hop to the nearest movie not yet on the path. The anchor member picks the start, the recursive member adds one hop per iteration, and the path array stops loops. The same query is the similarity_trail() function behind the movie page.",
    sql: `WITH RECURSIVE trail (step, id, path, embedding, distance) AS (
  SELECT 0, m.id, ARRAY[m.id], m.embedding, NULL::float8
  FROM movies m
  WHERE m.title = $1
  UNION ALL
  SELECT t.step + 1, nxt.id, t.path || nxt.id, nxt.embedding, nxt.distance
  FROM trail t
  CROSS JOIN LATERAL (
    SELECT m.id, m.embedding, m.embedding <=> t.embedding AS distance
    FROM movies m
    WHERE m.id <> ALL (t.path) AND m.embedding IS NOT NULL
    ORDER BY m.embedding <=> t.embedding
    LIMIT 1
  ) nxt
  WHERE t.step < $2
)
SELECT t.step, mv.title, ROUND((1 - t.distance)::numeric, 3) AS similarity
FROM trail t JOIN movies mv ON mv.id = t.id
ORDER BY t.step`,
    params: ["Interstellar", 6],
  },
  {
    id: "similar",
    title: "More like this (k-nearest neighbours)",
    kind: "Vector",
    explain:
      "The 6 movies whose embeddings are closest to Interstellar's by cosine distance (<=>). Turn on 'Force index' to see the HNSW index scan instead of a full scan.",
    sql: `SELECT id, title,
       ROUND((1 - (embedding <=> (SELECT embedding FROM movies WHERE title = $1)))::numeric, 3) AS similarity
FROM movies
WHERE title <> $1
ORDER BY embedding <=> (SELECT embedding FROM movies WHERE title = $1)
LIMIT 6`,
    params: ["Interstellar"],
  },
  {
    id: "hybrid",
    title: "Recommendations, entirely in SQL",
    kind: "Hybrid",
    explain:
      "The taste vector is built inside the database with pgvector's AVG(vector) over the movies the user rated 4+. Nearest neighbours are then found, excluding movies they have already rated, restricted to one genre. Both stores are used in a single statement.",
    sql: `WITH taste AS (
  SELECT AVG(m.embedding) AS v
  FROM ratings r JOIN movies m ON m.id = r.movie_id
  WHERE r.user_id = (SELECT id FROM users WHERE name = $1) AND r.rating >= 4
)
SELECT m.id, m.title,
       ROUND((1 - (m.embedding <=> (SELECT v FROM taste)))::numeric, 3) AS match
FROM movies m
WHERE NOT EXISTS (SELECT 1 FROM ratings r
                  WHERE r.movie_id = m.id AND r.user_id = (SELECT id FROM users WHERE name = $1))
  AND EXISTS (SELECT 1 FROM movie_genres mg JOIN genres g ON g.id = mg.genre_id
              WHERE mg.movie_id = m.id AND g.name = $2)
ORDER BY m.embedding <=> (SELECT v FROM taste)
LIMIT 10`,
    params: ["Aarav", "Thriller"],
  },
  {
    id: "semantic-vs-keyword",
    title: "Same genre is not the same as similar",
    kind: "Hybrid",
    explain:
      "For Spirited Away, compare its genre-mates ranked by similarity. Some share a genre label but are far apart in meaning, which is why similarity search beats genre lists.",
    sql: `SELECT m.title, array_agg(DISTINCT g.name) AS shared_genres,
       ROUND((1 - (m.embedding <=> (SELECT embedding FROM movies WHERE title = $1)))::numeric, 3) AS similarity
FROM movies m
JOIN movie_genres mg ON mg.movie_id = m.id
JOIN genres g ON g.id = mg.genre_id
WHERE m.title <> $1
  AND mg.genre_id IN (SELECT genre_id FROM movie_genres
                      WHERE movie_id = (SELECT id FROM movies WHERE title = $1))
GROUP BY m.id
ORDER BY similarity DESC`,
    params: ["Spirited Away"],
  },
  {
    id: "audit",
    title: "Audit log (written by a trigger)",
    kind: "Trigger",
    explain:
      "rating_audit is filled only by the AFTER INSERT/UPDATE/DELETE trigger trg_ratings_audit on ratings. It records the old and new value, the signed-in user and the database role. Rate a movie anywhere in the app, then run this again.",
    sql: `SELECT a.action, u.name AS user_name, m.title, a.old_rating, a.new_rating,
       a.db_role, to_char(a.changed_at, 'YYYY-MM-DD HH24:MI:SS') AS changed_at
FROM rating_audit a
LEFT JOIN users u  ON u.id = a.user_id
LEFT JOIN movies m ON m.id = a.movie_id
ORDER BY a.changed_at DESC, a.id DESC
LIMIT 15`,
    params: [],
  },
  {
    id: "rbac",
    title: "Role privileges (GRANTs per database role)",
    kind: "RBAC",
    explain:
      "What each database role may do on each table, read from PostgreSQL's own privilege checks. The app logs in as cinesense_app (no privileges) and switches to one of these roles per request. Column-level grants count (users: admins can read some columns, never password_hash).",
    sql: `SELECT c.relname AS object,
       (SELECT string_agg(p, ' ') FROM unnest(ARRAY['SELECT','INSERT','UPDATE']) p
         WHERE has_any_column_privilege('cinesense_anon', c.oid, p)) AS anon,
       (SELECT string_agg(p, ' ') FROM unnest(ARRAY['SELECT','INSERT','UPDATE']) p
         WHERE has_any_column_privilege('cinesense_viewer', c.oid, p))
         || CASE WHEN has_table_privilege('cinesense_viewer', c.oid, 'DELETE') THEN ' DELETE' ELSE '' END AS viewer,
       (SELECT string_agg(p, ' ') FROM unnest(ARRAY['SELECT','INSERT','UPDATE']) p
         WHERE has_any_column_privilege('cinesense_admin', c.oid, p))
         || CASE WHEN has_table_privilege('cinesense_admin', c.oid, 'DELETE') THEN ' DELETE' ELSE '' END AS admin,
       c.relrowsecurity AS row_level_security
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
WHERE c.relkind IN ('r', 'v')
ORDER BY c.relkind, c.relname`,
    params: [],
  },
  {
    id: "rls",
    title: "Row-level security policies on ratings",
    kind: "RBAC",
    explain:
      "Viewers may only insert, change or delete their own ratings: each policy compares user_id with current_app_user(), which validates the session token inside the database. Admins have a policy that allows every row.",
    sql: `SELECT policyname, cmd, roles, qual AS using_expr, with_check
FROM pg_policies
WHERE tablename = $1
ORDER BY policyname`,
    params: ["ratings"],
  },
];

export const STATS_SQL = `
SELECT c.relname AS name,
       CASE c.relkind WHEN 'r' THEN 'table' WHEN 'i' THEN 'index' WHEN 'v' THEN 'view' END AS type,
       COALESCE(t.relname, '') AS on_table,
       COALESCE(am.amname, '') AS method,
       CASE WHEN c.relkind = 'r' THEN (xpath('/row/n/text()',
              query_to_xml(format('SELECT COUNT(*) AS n FROM %I', c.relname), false, true, '')))[1]::text::int END AS rows,
       pg_size_pretty(pg_relation_size(c.oid)) AS size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
LEFT JOIN pg_index i ON i.indexrelid = c.oid
LEFT JOIN pg_class t ON t.oid = i.indrelid
LEFT JOIN pg_am am   ON am.oid = c.relam AND c.relkind = 'i'
WHERE c.relkind IN ('r', 'i', 'v')
ORDER BY CASE c.relkind WHEN 'r' THEN 0 WHEN 'v' THEN 1 ELSE 2 END, COALESCE(t.relname, c.relname), c.relname`;
