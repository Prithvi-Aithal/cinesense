"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type LabQuery = { id: string; title: string; kind: "SQL" | "Vector" | "Hybrid"; explain: string; sql: string; params: unknown[] };
type Stat = { name: string; type: string; on_table: string; method: string; rows: number | null; size: string };
type Result = { rows: Record<string, unknown>[]; plan: string };

const kindColor = { SQL: "border-sky-400/50 text-sky-300", Vector: "border-gold/60 text-gold", Hybrid: "border-fuchsia-400/50 text-fuchsia-300" };

export default function LabPage() {
  const [queries, setQueries] = useState<LabQuery[]>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [forceIndex, setForceIndex] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doneKey, setDoneKey] = useState<string | null>(null);

  useEffect(() => {
    api<{ queries: LabQuery[]; stats: Stat[] }>("/api/lab").then((d) => {
      setQueries(d.queries);
      setStats(d.stats);
      setSelected(d.queries[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    const key = `${selected}:${forceIndex}`;
    api<Result>("/api/lab", { method: "POST", body: JSON.stringify({ id: selected, forceIndex }) })
      .then((r) => {
        setResult(r);
        setError(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setDoneKey(key));
  }, [selected, forceIndex]);

  const running = doneKey !== `${selected}:${forceIndex}`;
  const q = queries.find((x) => x.id === selected);
  const cols = result?.rows[0] ? Object.keys(result.rows[0]) : [];

  return (
    <div>
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl">Query Lab</h1>
      <p className="mt-2 max-w-3xl text-muted">
        The key queries behind CineSense, with their real results and <code className="text-gold">EXPLAIN ANALYZE</code>{" "}
        plans from PostgreSQL. Each runs in a read-only transaction.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-2">
          {queries.map((x) => (
            <button
              key={x.id}
              onClick={() => setSelected(x.id)}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                selected === x.id ? "border-gold bg-panel-2" : "border-line bg-panel hover:border-gold-dim"
              }`}
            >
              <span className={`mr-2 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${kindColor[x.kind]}`}>{x.kind}</span>
              {x.title}
            </button>
          ))}
          <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-muted">
            <input type="checkbox" checked={forceIndex} onChange={(e) => setForceIndex(e.target.checked)} className="mt-1 accent-[#e5b453]" />
            <span>
              <b className="text-text">Force index use</b>
              <br />
              SET enable_seqscan = off. With about 100 rows the planner rightly prefers a full scan. This shows the plan
              you would get at scale.
            </span>
          </label>
        </div>

        {q && (
          <div className="min-w-0">
            <h2 className="font-[family-name:var(--font-display)] text-2xl">{q.title}</h2>
            <p className="mt-1 text-sm text-muted">{q.explain}</p>
            <pre className="sql-block mt-4 rounded-lg border border-line bg-panel p-4">{q.sql}</pre>
            <p className="mt-1 text-xs text-muted">Parameters: {q.params.map((p) => JSON.stringify(p)).join(", ")}</p>

            {error && <p className="mt-4 text-red">{error}</p>}
            {result && (
              <div className={running ? "opacity-50" : ""}>
                <h3 className="mb-2 mt-6 text-sm uppercase tracking-wider text-muted">Result ({result.rows.length} rows)</h3>
                <div className="overflow-x-auto rounded-lg border border-line">
                  <table className="w-full text-sm">
                    <thead className="bg-panel-2 text-left text-muted">
                      <tr>{cols.map((c) => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 12).map((r, i) => (
                        <tr key={i} className="border-t border-line bg-panel">
                          {cols.map((c) => (
                            <td key={c} className="px-3 py-1.5">{Array.isArray(r[c]) ? (r[c] as unknown[]).join(", ") : String(r[c])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <h3 className="mb-2 mt-6 text-sm uppercase tracking-wider text-muted">EXPLAIN ANALYZE</h3>
                <pre className="sql-block rounded-lg border border-line bg-panel p-4 text-text/90">{result.plan}</pre>
              </div>
            )}
          </div>
        )}
      </div>

      <h2 className="mb-3 mt-12 font-[family-name:var(--font-display)] text-2xl">Tables, views and indexes</h2>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-sm">
          <thead className="bg-panel-2 text-left text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">On table</th>
              <th className="px-3 py-2 font-medium">Method</th>
              <th className="px-3 py-2 font-medium">Rows</th>
              <th className="px-3 py-2 font-medium">Size</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.name} className="border-t border-line bg-panel">
                <td className="px-3 py-1.5 font-mono text-xs">{s.name}</td>
                <td className="px-3 py-1.5">{s.type}</td>
                <td className="px-3 py-1.5">{s.on_table}</td>
                <td className={`px-3 py-1.5 ${s.method === "hnsw" ? "text-gold" : ""}`}>{s.method}</td>
                <td className="px-3 py-1.5">{s.rows ?? ""}</td>
                <td className="px-3 py-1.5">{s.size}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
