"use client";

// Collapsible "Show query" panel: displays the exact SQL the API just ran.
export default function QueryPanel({ queries, label = "Show the query behind this" }: { queries: string[]; label?: string }) {
  if (queries.length === 0) return null;
  return (
    <details className="mt-8 rounded-lg border border-line bg-panel">
      <summary className="cursor-pointer select-none px-4 py-2 text-sm text-muted hover:text-text">{label}</summary>
      {queries.map((q, i) => (
        <pre key={i} className="sql-block border-t border-line px-4 py-3 text-text/90">
          {q.trim()}
        </pre>
      ))}
    </details>
  );
}
