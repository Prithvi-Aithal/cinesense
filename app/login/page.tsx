"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useUser } from "@/components/UserProvider";

function LoginForm() {
  const { login, register } = useUser();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === "login" ? login(name.trim(), password) : register(name.trim(), password));
      // Only follow same-site paths, never an absolute URL from the query string.
      router.replace(next && next.startsWith("/") && !next.startsWith("//") && next !== "/login" ? next : "/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const tab = (m: typeof mode, label: string) => (
    <button
      type="button"
      onClick={() => {
        setMode(m);
        setError(null);
      }}
      className={`flex-1 rounded-md px-3 py-2 text-sm transition ${mode === m ? "bg-gold text-ink" : "text-muted hover:text-text"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto mt-10 max-w-sm">
      <h1 className="font-[family-name:var(--font-display)] text-4xl">{mode === "login" ? "Welcome back" : "Create an account"}</h1>
      <p className="mt-2 text-sm text-muted">
        {mode === "login"
          ? "Log in to rate movies and get recommendations."
          : "New accounts are viewers. An admin can promote you later."}
      </p>

      <div className="mt-6 flex rounded-lg border border-line bg-panel p-1">
        {tab("login", "Log in")}
        {tab("register", "Sign up")}
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Name
          <input
            autoFocus
            autoComplete="username"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
            className="rounded-lg border border-line bg-panel px-3 py-2 text-text outline-none focus:border-gold"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          Password
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={mode === "register" ? 6 : undefined}
            required
            className="rounded-lg border border-line bg-panel px-3 py-2 text-text outline-none focus:border-gold"
          />
        </label>
        {error && <p className="text-sm text-red">{error}</p>}
        <button disabled={busy} className="mt-1 rounded-lg bg-gold px-4 py-2 font-medium text-ink disabled:opacity-60">
          {busy ? "…" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>

      <div className="mt-8 rounded-lg border border-line bg-panel p-4 text-sm text-muted">
        <p className="mb-1 font-medium text-text">Demo accounts</p>
        <p>
          Admin: <code className="text-gold">admin</code> / <code className="text-gold">admin123</code>
        </p>
        <p>
          Viewers: <code className="text-gold">Aarav</code>, <code className="text-gold">Meera</code>, … /{" "}
          <code className="text-gold">viewer123</code>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams needs a Suspense boundary so the rest of the page can be prerendered.
  return (
    <Suspense fallback={<p className="py-16 text-center text-muted">Loading…</p>}>
      <LoginForm />
    </Suspense>
  );
}
