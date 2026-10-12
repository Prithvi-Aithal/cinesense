// Query Lab: a fixed set of example queries the /lab page can EXPLAIN ANALYZE.
// Only these predefined statements can run; the page never sends raw SQL.

export type LabQuery = {
  id: string;
  title: string;
  kind: "SQL" | "Vector" | "Hybrid";
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
    kind: "SQL",
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
    title: "Top rated (aggregation)",
    kind: "SQL",
    explain:
      "The cold-start ranking. GROUP BY with AVG and COUNT, and a Bayesian average so movies with very few ratings don't dominate.",
    sql: `SELECT m.title, COUNT(*) AS ratings, ROUND(AVG(r.rating), 2) AS avg,
       ROUND((SUM(r.rating) + 3.5 * 3) / (COUNT(*) + 3), 2) AS score
FROM ratings r
JOIN movies m ON m.id = r.movie_id
GROUP BY m.id
HAVING COUNT(*) >= $1
ORDER BY score DESC
LIMIT 10`,
    params: [2],
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
