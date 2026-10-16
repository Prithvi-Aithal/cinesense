-- Stored functions, procedures and triggers.
-- Run after the data load (so the seed data itself is not written to the audit log) and before security.sql.
--
-- Functions marked SECURITY DEFINER run with the owner's rights. They are the only way the app's restricted
-- roles can touch users.password_hash, sessions or rating_audit, so those rules live in exactly one place.

DROP FUNCTION  IF EXISTS bayesian_score(numeric, int, numeric, int) CASCADE;
DROP FUNCTION  IF EXISTS register_user(text, text) CASCADE;
DROP FUNCTION  IF EXISTS login(text, text) CASCADE;
DROP FUNCTION  IF EXISTS logout() CASCADE;
DROP FUNCTION  IF EXISTS current_app_user() CASCADE;
DROP FUNCTION  IF EXISTS whoami() CASCADE;
DROP FUNCTION  IF EXISTS similarity_trail(int, int) CASCADE;
DROP FUNCTION  IF EXISTS audit_rating_change() CASCADE;
DROP FUNCTION  IF EXISTS touch_rated_at() CASCADE;
DROP FUNCTION  IF EXISTS invalidate_stale_embedding() CASCADE;
DROP PROCEDURE IF EXISTS add_movie(text, int, text, text, text[], vector, int) CASCADE;
DROP PROCEDURE IF EXISTS update_movie(int, text, int, text, text, text[], vector) CASCADE;
DROP PROCEDURE IF EXISTS set_movie_genres(int, text[]) CASCADE;
DROP PROCEDURE IF EXISTS set_user_role(int, text) CASCADE;

-- ===================================================================================
-- Scalar function
-- ===================================================================================

-- Bayesian average: behave as if every movie had `weight` extra ratings of `prior`,
-- so one lucky 5-star rating can't put a movie at the top of the cold-start list.
CREATE FUNCTION bayesian_score(avg_rating numeric, n int, prior numeric DEFAULT 3.5, weight int DEFAULT 3)
RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT ROUND((COALESCE(avg_rating, 0) * n + prior * weight) / (n + weight), 2)
$$;

-- ===================================================================================
-- Authentication (all logic inside the database)
-- ===================================================================================

-- Create a viewer account. The password is hashed with bcrypt by pgcrypto; plain text is never stored.
CREATE FUNCTION register_user(p_name text, p_password text)
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  new_id int;
BEGIN
  IF length(coalesce(p_password, '')) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO users (name, password_hash)
  VALUES (trim(p_name), crypt(p_password, gen_salt('bf', 8)))
  RETURNING id INTO new_id;
  RETURN new_id;
END
$$;

-- Check a name and password. On success, open a 7-day session and return its token (once).
-- On failure, return no row, without saying which part was wrong.
CREATE FUNCTION login(p_name text, p_password text)
RETURNS TABLE (token text, user_id int, name text, role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  u users%ROWTYPE;
  t text;
BEGIN
  SELECT * INTO u FROM users WHERE users.name = trim(p_name);
  IF NOT FOUND OR u.password_hash <> crypt(p_password, u.password_hash) THEN
    RETURN;
  END IF;
  DELETE FROM sessions WHERE sessions.expires_at < now();          -- housekeeping
  t := encode(gen_random_bytes(32), 'hex');
  INSERT INTO sessions (token_hash, user_id, expires_at)
  VALUES (encode(digest(t, 'sha256'), 'hex'), u.id, now() + interval '7 days');
  RETURN QUERY SELECT t, u.id, u.name::text, u.role::text;
END
$$;

-- The signed-in user for this transaction, from the session token the app put in app.session_token.
-- Row-level security policies call this, so the database itself decides whose rows you may change.
CREATE FUNCTION current_app_user()
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT s.user_id
  FROM sessions s
  WHERE s.token_hash = encode(digest(NULLIF(current_setting('app.session_token', true), ''), 'sha256'), 'hex')
    AND s.expires_at > now()
$$;

CREATE FUNCTION whoami()
RETURNS TABLE (id int, name text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT u.id, u.name::text, u.role::text FROM users u WHERE u.id = current_app_user()
$$;

CREATE FUNCTION logout()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  DELETE FROM sessions
  WHERE token_hash = encode(digest(NULLIF(current_setting('app.session_token', true), ''), 'sha256'), 'hex')
$$;

-- ===================================================================================
-- Recursive query (vector + recursive CTE)
-- ===================================================================================

-- "Similarity trail": start at a movie, hop to its nearest unvisited neighbour, and repeat.
-- The recursive member carries the visited path so the walk never loops back.
CREATE FUNCTION similarity_trail(p_movie int, p_steps int DEFAULT 5)
RETURNS TABLE (step int, id int, title text, similarity numeric)
LANGUAGE sql STABLE
AS $$
  WITH RECURSIVE trail (step, id, path, embedding, distance) AS (
    SELECT 0, m.id, ARRAY[m.id], m.embedding, NULL::float8
    FROM movies m
    WHERE m.id = p_movie AND m.embedding IS NOT NULL
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
    WHERE t.step < p_steps
  )
  SELECT t.step, t.id, mv.title::text, ROUND((1 - t.distance)::numeric, 3)
  FROM trail t
  JOIN movies mv ON mv.id = t.id
  ORDER BY t.step
$$;

-- ===================================================================================
-- Procedures (admin catalog management; they run with the caller's rights)
-- ===================================================================================

-- Replace a movie's genre links, creating any genre that doesn't exist yet.
CREATE PROCEDURE set_movie_genres(p_movie int, p_genres text[])
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_genres IS NULL OR cardinality(array_remove(p_genres, '')) = 0 THEN
    RAISE EXCEPTION 'A movie needs at least one genre.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO genres (name)
  SELECT DISTINCT trim(g) FROM unnest(p_genres) AS g WHERE trim(g) <> ''
  ON CONFLICT (name) DO NOTHING;
  DELETE FROM movie_genres WHERE movie_id = p_movie;
  INSERT INTO movie_genres (movie_id, genre_id)
  SELECT p_movie, gn.id FROM genres gn WHERE gn.name IN (SELECT trim(g) FROM unnest(p_genres) AS g);
END
$$;

-- Add a movie and its genres in one call. INOUT p_id returns the new id to the caller.
CREATE PROCEDURE add_movie(p_title text, p_year int, p_director text, p_description text,
                           p_genres text[], p_embedding vector, INOUT p_id int DEFAULT NULL)
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO movies (title, year, director, description, embedding)
  VALUES (trim(p_title), p_year, NULLIF(trim(p_director), ''), trim(p_description), p_embedding)
  RETURNING id INTO p_id;
  CALL set_movie_genres(p_id, p_genres);
END
$$;

-- Edit a movie. A NULL p_embedding keeps the old vector, but trg_movies_stale_embedding
-- clears it if the text changed, so a stale vector is never searched.
CREATE PROCEDURE update_movie(p_id int, p_title text, p_year int, p_director text, p_description text,
                              p_genres text[], p_embedding vector)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE movies
  SET title = trim(p_title), year = p_year, director = NULLIF(trim(p_director), ''),
      description = trim(p_description), embedding = COALESCE(p_embedding, embedding)
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movie % not found.', p_id USING ERRCODE = 'P0002';
  END IF;
  CALL set_movie_genres(p_id, p_genres);
END
$$;

-- Promote or demote a user, refusing to remove the last admin.
CREATE PROCEDURE set_user_role(p_user int, p_role text)
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_role = 'viewer'
     AND (SELECT u.role FROM users u WHERE u.id = p_user) = 'admin'
     AND (SELECT count(*) FROM users u WHERE u.role = 'admin') = 1 THEN
    RAISE EXCEPTION 'Cannot remove the last admin.' USING ERRCODE = '22023';
  END IF;
  UPDATE users SET role = p_role WHERE id = p_user;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found.', p_user USING ERRCODE = 'P0002';
  END IF;
END
$$;

-- ===================================================================================
-- Triggers
-- ===================================================================================

-- 1. Audit log: every insert, change or delete of a rating is recorded, with who did it.
--    SECURITY DEFINER so viewers can write the log through the trigger but never directly.
CREATE FUNCTION audit_rating_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO rating_audit (action, user_id, movie_id, old_rating, new_rating, changed_by, db_role)
    VALUES (TG_OP, NEW.user_id, NEW.movie_id, NULL, NEW.rating, current_app_user(), current_setting('role'));
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.rating = NEW.rating THEN
      RETURN NULL;   -- re-saving the same rating is not a change
    END IF;
    INSERT INTO rating_audit (action, user_id, movie_id, old_rating, new_rating, changed_by, db_role)
    VALUES (TG_OP, NEW.user_id, NEW.movie_id, OLD.rating, NEW.rating, current_app_user(), current_setting('role'));
  ELSE
    INSERT INTO rating_audit (action, user_id, movie_id, old_rating, new_rating, changed_by, db_role)
    VALUES (TG_OP, OLD.user_id, OLD.movie_id, OLD.rating, NULL, current_app_user(), current_setting('role'));
  END IF;
  RETURN NULL;   -- AFTER trigger: the return value is ignored
END
$$;

CREATE TRIGGER trg_ratings_audit
AFTER INSERT OR DELETE OR UPDATE OF rating ON ratings
FOR EACH ROW
EXECUTE FUNCTION audit_rating_change();   -- also logs ratings removed by a cascading movie/user delete

-- 2. Keep rated_at honest: it moves only when the rating value actually changes.
CREATE FUNCTION touch_rated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.rated_at := now();
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_ratings_touch
BEFORE UPDATE OF rating ON ratings
FOR EACH ROW
WHEN (OLD.rating IS DISTINCT FROM NEW.rating)
EXECUTE FUNCTION touch_rated_at();

-- 3. Vector consistency: if a movie's title or description changes without a new embedding,
--    drop the old vector so similarity search never uses a description that no longer exists.
CREATE FUNCTION invalidate_stale_embedding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (NEW.title, NEW.description) IS DISTINCT FROM (OLD.title, OLD.description)
     AND NEW.embedding IS NOT DISTINCT FROM OLD.embedding THEN
    NEW.embedding := NULL;
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER trg_movies_stale_embedding
BEFORE UPDATE OF title, description ON movies
FOR EACH ROW
EXECUTE FUNCTION invalidate_stale_embedding();
