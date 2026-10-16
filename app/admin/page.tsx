"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import RequireRole from "@/components/RequireRole";
import QueryPanel from "@/components/QueryPanel";
import { useUser } from "@/components/UserProvider";
import { api } from "@/lib/api";

type AdminMovie = {
  id: number;
  title: string;
  year: number;
  director: string | null;
  description: string;
  genres: string[];
  rating_count: number;
  dims: number | null;
  norm: string | null;
};
type AdminUser = { id: number; name: string; role: "admin" | "viewer"; created_at: string; rating_count: number; active_sessions: number };
type AuditRow = {
  id: number;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_rating: number | null;
  new_rating: number | null;
  db_role: string;
  changed_at: string;
  user_name: string;
  movie_title: string;
  changed_by_name: string | null;
};
type Form = { id?: number; title: string; year: string; director: string; description: string; genres: string[]; newGenres: string };

const EMPTY: Form = { title: "", year: "", director: "", description: "", genres: [], newGenres: "" };
const TABS = ["movies", "users", "activity"] as const;
type Tab = (typeof TABS)[number];

export default function AdminPage() {
  return (
    <RequireRole role="admin">
      <Suspense fallback={<p className="py-16 text-center text-muted">Loading…</p>}>
        <Admin />
      </Suspense>
    </RequireRole>
  );
}

function Admin() {
  const params = useSearchParams();
  const editId = Number(params.get("edit")) || null;
  const [tab, setTab] = useState<Tab>("movies");

  return (
    <div>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl">Admin</h1>
      <p className="mt-2 max-w-3xl text-muted">
        Only the <code className="text-gold">cinesense_admin</code> database role may change the catalog and accounts. Every
        action here runs as that role, and PostgreSQL refuses it for anyone else.
      </p>
      <div className="mt-6 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm capitalize transition ${
              tab === t ? "border-gold text-text" : "border-transparent text-muted hover:text-text"
            }`}
          >
            {t === "movies" ? "Movies & vectors" : t === "activity" ? "Activity log" : "Users & roles"}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {tab === "movies" && <MoviesTab editId={editId} />}
        {tab === "users" && <UsersTab />}
        {tab === "activity" && <ActivityTab />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Movies: vector create / read / update / delete
// ---------------------------------------------------------------------------------------------

function fetchMovies() {
  return Promise.all([
    api<{ items: AdminMovie[]; query: string }>("/api/admin/movies"),
    api<{ items: { name: string }[] }>("/api/genres"),
  ]);
}

function formFor(m: AdminMovie): Form {
  return { id: m.id, title: m.title, year: String(m.year), director: m.director ?? "", description: m.description, genres: m.genres, newGenres: "" };
}

function MoviesTab({ editId }: { editId: number | null }) {
  const router = useRouter();
  const [movies, setMovies] = useState<AdminMovie[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "warn" | "error"; text: string } | null>(null);
  const [sql, setSql] = useState<string[]>([]);

  function openEdit(m: AdminMovie) {
    setForm(formFor(m));
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const apply = useCallback(([m, g]: Awaited<ReturnType<typeof fetchMovies>>) => {
    setMovies(m.items);
    setGenres(g.items.map((x) => x.name));
    setSql((s) => [m.query, ...s.slice(1)]);
  }, []);
  const load = useCallback(() => fetchMovies().then(apply), [apply]);

  useEffect(() => {
    fetchMovies().then((d) => {
      apply(d);
      const m = editId ? d[0].items.find((x) => x.id === editId) : null;
      if (m) openEdit(m);
    });
  }, [apply, editId]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const extra = form.newGenres.split(",").map((g) => g.trim()).filter(Boolean);
    const payload = {
      title: form.title,
      year: Number(form.year),
      director: form.director,
      description: form.description,
      genres: [...new Set([...form.genres, ...extra])],
    };
    setBusy("save");
    try {
      const r = await api<{ id: number; embedded: boolean; warning?: string; query: string }>(
        form.id ? `/api/movies/${form.id}` : "/api/movies",
        { method: form.id ? "PATCH" : "POST", body: JSON.stringify(payload) }
      );
      setSql((s) => [s[0], r.query]);
      setNotice(
        r.warning
          ? { kind: "warn", text: r.warning }
          : { kind: "ok", text: `${form.id ? "Updated" : "Added"} "${payload.title}" and stored its 384-dimension embedding.` }
      );
      setForm(null);
      if (editId) router.replace("/admin");
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function reembed(m: AdminMovie) {
    setBusy(`embed-${m.id}`);
    try {
      const r = await api<{ query: string }>(`/api/movies/${m.id}`, { method: "PATCH", body: JSON.stringify({ reembed: true }) });
      setSql((s) => [s[0], r.query]);
      setNotice({ kind: "ok", text: `Re-embedded "${m.title}".` });
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function remove(m: AdminMovie) {
    if (!window.confirm(`Delete "${m.title}"? Its vector, genre links and ${m.rating_count} rating(s) are deleted too.`)) return;
    setBusy(`delete-${m.id}`);
    try {
      const r = await api<{ query: string }>(`/api/movies/${m.id}`, { method: "DELETE" });
      setSql((s) => [s[0], r.query]);
      setNotice({ kind: "ok", text: `Deleted "${m.title}" and its vector.` });
      if (form?.id === m.id) setForm(null);
      await load();
    } catch (err) {
      setNotice({ kind: "error", text: (err as Error).message });
    } finally {
      setBusy(null);
    }
  }

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase();
    return f ? movies.filter((m) => m.title.toLowerCase().includes(f) || m.genres.some((g) => g.toLowerCase().includes(f))) : movies;
  }, [movies, filter]);
  const missing = movies.filter((m) => m.dims === null).length;

  return (
    <div>
      {notice && (
        <p
          className={`mb-4 rounded-md border px-3 py-2 text-sm ${
            notice.kind === "ok"
              ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
              : notice.kind === "warn"
                ? "border-gold-dim/50 bg-gold/10 text-gold"
                : "border-red/50 bg-red/10 text-red"
          }`}
        >
          {notice.text}
        </p>
      )}

      {form ? (
        <form onSubmit={save} className="film-card mb-8 grid gap-3 p-6 md:grid-cols-2">
          <h2 className="font-[family-name:var(--font-display)] text-2xl md:col-span-2">{form.id ? `Edit: ${form.title}` : "Add a movie"}</h2>
          <Field label="Title">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={200} required className={input} />
          </Field>
          <div className="grid grid-cols-[110px_1fr] gap-3">
            <Field label="Year">
              <input type="number" min={1888} max={2100} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} required className={input} />
            </Field>
            <Field label="Director">
              <input value={form.director} onChange={(e) => setForm({ ...form, director: e.target.value })} maxLength={200} className={input} />
            </Field>
          </div>
          <Field label="Description (this text is embedded into the vector)" wide>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={4}
              minLength={10}
              required
              className={input}
            />
          </Field>
          <div className="md:col-span-2">
            <p className="mb-1 text-sm text-muted">Genres</p>
            <div className="flex flex-wrap gap-2">
              {genres.map((g) => {
                const on = form.genres.includes(g);
                return (
                  <button
                    type="button"
                    key={g}
                    onClick={() => setForm({ ...form, genres: on ? form.genres.filter((x) => x !== g) : [...form.genres, g] })}
                    className={`rounded-full border px-3 py-1 text-sm ${on ? "border-gold bg-gold text-ink" : "border-line text-muted hover:text-text"}`}
                  >
                    {g}
                  </button>
                );
              })}
              <input
                value={form.newGenres}
                onChange={(e) => setForm({ ...form, newGenres: e.target.value })}
                placeholder="New genres, comma separated"
                className={`${input} w-56 py-1`}
              />
            </div>
          </div>
          <div className="flex gap-3 md:col-span-2">
            <button disabled={busy === "save"} className="rounded-lg bg-gold px-4 py-2 font-medium text-ink disabled:opacity-60">
              {busy === "save" ? "Embedding and saving…" : form.id ? "Save and re-embed" : "Add movie"}
            </button>
            <button
              type="button"
              onClick={() => {
                setForm(null);
                if (editId) router.replace("/admin");
              }}
              className="text-muted hover:text-text"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button onClick={() => { setForm({ ...EMPTY }); setNotice(null); }} className="rounded-lg bg-gold px-4 py-2 font-medium text-ink">
            + Add movie
          </button>
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by title or genre" className={`${input} w-64`} />
          <span className="text-sm text-muted">
            {movies.length} movies · {movies.length - missing} with vectors{missing ? ` · ${missing} missing` : ""}
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-panel-2 text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Title</th>
              <th className="px-3 py-2 font-medium">Genres</th>
              <th className="px-3 py-2 font-medium">Ratings</th>
              <th className="px-3 py-2 font-medium">Vector</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.id} className="border-t border-line bg-panel">
                <td className="px-3 py-2">
                  <Link href={`/movie/${m.id}`} className="hover:text-gold">
                    {m.title}
                  </Link>{" "}
                  <span className="text-muted">({m.year})</span>
                </td>
                <td className="px-3 py-2 text-muted">{m.genres.join(", ")}</td>
                <td className="px-3 py-2">{m.rating_count}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {m.dims ? (
                    <span className="text-emerald-300" title={`L2 norm ${m.norm}`}>
                      {m.dims} dims · ‖v‖ {m.norm}
                    </span>
                  ) : (
                    <span className="text-gold">missing</span>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-right">
                  <button onClick={() => openEdit(m)} className="mr-3 text-muted hover:text-gold">Edit</button>
                  <button onClick={() => reembed(m)} disabled={busy === `embed-${m.id}`} className="mr-3 text-muted hover:text-gold disabled:opacity-50">
                    {busy === `embed-${m.id}` ? "…" : "Re-embed"}
                  </button>
                  <button onClick={() => remove(m)} disabled={busy === `delete-${m.id}`} className="text-muted hover:text-red disabled:opacity-50">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <QueryPanel queries={sql.filter(Boolean)} label="Show the queries behind this tab" />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Users and roles
// ---------------------------------------------------------------------------------------------

function UsersTab() {
  const { user: me, refreshUser } = useUser();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sql, setSql] = useState<string[]>([]);

  const apply = useCallback((d: { items: AdminUser[]; query: string }) => {
    setUsers(d.items);
    setSql((s) => [d.query, ...s.slice(1)]);
  }, []);
  const load = useCallback(() => api<{ items: AdminUser[]; query: string }>("/api/users").then(apply), [apply]);

  useEffect(() => {
    api<{ items: AdminUser[]; query: string }>("/api/users")
      .then(apply)
      .catch((e) => setError(e.message));
  }, [apply]);

  async function setRole(u: AdminUser, role: AdminUser["role"]) {
    setError(null);
    try {
      const r = await api<{ query: string }>(`/api/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ role }) });
      setSql((s) => [s[0], r.query]);
      await load();
      if (u.id === me?.id) await refreshUser();
    } catch (err) {
      setError((err as Error).message);
      await load();
    }
  }

  async function remove(u: AdminUser) {
    if (!window.confirm(`Delete ${u.name}? Their ${u.rating_count} rating(s) and sessions are deleted too.`)) return;
    setError(null);
    try {
      const r = await api<{ query: string }>(`/api/users/${u.id}`, { method: "DELETE" });
      setSql((s) => [s[0], r.query]);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <p className="mb-4 max-w-3xl text-sm text-muted">
        Role changes go through the <code className="text-gold">set_user_role</code> stored procedure, which refuses to remove
        the last admin. Password hashes are not readable here: the admin role has no privilege on that column.
      </p>
      {error && <p className="mb-4 rounded-md border border-red/50 bg-red/10 px-3 py-2 text-sm text-red">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-panel-2 text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Ratings</th>
              <th className="px-3 py-2 font-medium">Active sessions</th>
              <th className="px-3 py-2 font-medium">Joined</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-line bg-panel">
                <td className="px-3 py-2">
                  {u.name} {u.id === me?.id && <span className="text-xs text-muted">(you)</span>}
                </td>
                <td className="px-3 py-2">
                  <select
                    aria-label={`Role for ${u.name}`}
                    value={u.role}
                    onChange={(e) => setRole(u, e.target.value as AdminUser["role"])}
                    className="rounded-md border border-line bg-panel px-2 py-1 outline-none focus:border-gold"
                  >
                    <option value="viewer">viewer</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td className="px-3 py-2">{u.rating_count}</td>
                <td className="px-3 py-2">{u.active_sessions}</td>
                <td className="px-3 py-2 text-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right">
                  {u.id !== me?.id && (
                    <button onClick={() => remove(u)} className="text-muted hover:text-red">
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <QueryPanel queries={sql.filter(Boolean)} label="Show the queries behind this tab" />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Activity: the audit log written by the trg_ratings_audit trigger
// ---------------------------------------------------------------------------------------------

function ActivityTab() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [sql, setSql] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api<{ items: AuditRow[]; query: string }>("/api/audit").then((d) => {
      setRows(d.items);
      setSql([d.query]);
      setLoaded(true);
    });
  }, []);

  const change = (r: AuditRow) =>
    r.action === "INSERT" ? `rated ${r.new_rating}★` : r.action === "UPDATE" ? `${r.old_rating}★ → ${r.new_rating}★` : `removed ${r.old_rating}★`;

  return (
    <div>
      <p className="mb-4 max-w-3xl text-sm text-muted">
        Every rating insert, change and delete, recorded by the <code className="text-gold">trg_ratings_audit</code> trigger on
        the ratings table. The app never writes this table itself.
      </p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-panel-2 text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">User</th>
              <th className="px-3 py-2 font-medium">Movie</th>
              <th className="px-3 py-2 font-medium">Change</th>
              <th className="px-3 py-2 font-medium">Done by · DB role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line bg-panel">
                <td className="px-3 py-2 whitespace-nowrap text-muted">{new Date(r.changed_at).toLocaleString()}</td>
                <td className="px-3 py-2">{r.action}</td>
                <td className="px-3 py-2">{r.user_name}</td>
                <td className="px-3 py-2">{r.movie_title}</td>
                <td className="px-3 py-2 whitespace-nowrap">{change(r)}</td>
                <td className="px-3 py-2 text-muted">
                  {r.changed_by_name ?? "—"} · <code className="text-xs">{r.db_role}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loaded && rows.length === 0 && (
          <p className="bg-panel px-4 py-10 text-center text-muted">No rating changes yet. Rate a movie and it shows up here.</p>
        )}
      </div>
      <QueryPanel queries={sql} />
    </div>
  );
}

const input = "rounded-lg border border-line bg-panel px-3 py-2 text-text outline-none focus:border-gold";

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 text-sm text-muted ${wide ? "md:col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}
