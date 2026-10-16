-- Role-based access control, enforced by PostgreSQL itself.
--
--   cinesense_anon    visitors who are not logged in: read the catalog, register, log in
--   cinesense_viewer  logged-in users (inherits anon): rate movies, but only their own rows (row-level security)
--   cinesense_admin   administrators (inherits viewer): manage movies, genres and users, read the audit log
--   cinesense_app     the login the web app connects with. NOINHERIT: on its own it can do nothing.
--                     For every request the app runs SET LOCAL ROLE to anon, viewer or admin, so each query
--                     executes with exactly the privileges of the signed-in user's role.
--
-- Run last, after the tables, functions and triggers exist. Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cinesense_anon')   THEN CREATE ROLE cinesense_anon   NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cinesense_viewer') THEN CREATE ROLE cinesense_viewer NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cinesense_admin')  THEN CREATE ROLE cinesense_admin  NOLOGIN; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'cinesense_app')    THEN CREATE ROLE cinesense_app    LOGIN NOINHERIT; END IF;
END
$$;

-- Role hierarchy: admin ⊇ viewer ⊇ anon.
GRANT cinesense_anon   TO cinesense_viewer;
GRANT cinesense_viewer TO cinesense_admin;
-- The app may switch to any of the three, but inherits none of their privileges.
GRANT cinesense_anon, cinesense_viewer, cinesense_admin TO cinesense_app;
DO $$ BEGIN EXECUTE format('GRANT CONNECT ON DATABASE %I TO cinesense_app', current_database()); END $$;

-- Start from nothing, then grant only what each role needs.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION bayesian_score(numeric, int, numeric, int), register_user(text, text), login(text, text),
                           logout(), current_app_user(), whoami(), similarity_trail(int, int) FROM PUBLIC;
REVOKE EXECUTE ON PROCEDURE add_movie(text, int, text, text, text[], vector, int),
                            update_movie(int, text, int, text, text, text[], vector),
                            set_movie_genres(int, text[]), set_user_role(int, text) FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO cinesense_anon;

-- ---------- anon: browse the catalog, sign up, log in ----------
GRANT SELECT ON movies, genres, movie_genres, movie_details, ratings TO cinesense_anon;
GRANT EXECUTE ON FUNCTION bayesian_score(numeric, int, numeric, int), register_user(text, text), login(text, text),
                          logout(), current_app_user(), whoami(), similarity_trail(int, int) TO cinesense_anon;

-- ---------- viewer: rate movies ----------
GRANT INSERT, DELETE ON ratings TO cinesense_viewer;
GRANT UPDATE (rating) ON ratings TO cinesense_viewer;          -- column-level: only the rating can change

-- ---------- admin: manage the catalog and the users ----------
GRANT INSERT, UPDATE, DELETE ON movies, genres, movie_genres TO cinesense_admin;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO cinesense_admin;
GRANT SELECT (id, name, role, created_at) ON users TO cinesense_admin;   -- never password_hash
GRANT UPDATE (role) ON users TO cinesense_admin;
GRANT DELETE ON users TO cinesense_admin;
GRANT SELECT ON rating_audit TO cinesense_admin;
GRANT SELECT (user_id, created_at, expires_at) ON sessions TO cinesense_admin;  -- never token_hash
GRANT EXECUTE ON PROCEDURE add_movie(text, int, text, text, text[], vector, int),
                           update_movie(int, text, int, text, text, text[], vector),
                           set_movie_genres(int, text[]), set_user_role(int, text) TO cinesense_admin;

-- ---------- row-level security on ratings ----------
-- Everyone may read ratings (averages and counts are public), but a viewer may only add, change or delete
-- rows whose user_id is the logged-in user. The check uses current_app_user(), which validates the session
-- token inside the database, so the app cannot simply claim to be someone else.
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY ratings_read       ON ratings FOR SELECT USING (true);
CREATE POLICY ratings_own_insert ON ratings FOR INSERT TO cinesense_viewer WITH CHECK (user_id = current_app_user());
CREATE POLICY ratings_own_update ON ratings FOR UPDATE TO cinesense_viewer
  USING (user_id = current_app_user()) WITH CHECK (user_id = current_app_user());
CREATE POLICY ratings_own_delete ON ratings FOR DELETE TO cinesense_viewer USING (user_id = current_app_user());
CREATE POLICY ratings_admin_all  ON ratings FOR ALL    TO cinesense_admin  USING (true) WITH CHECK (true);
