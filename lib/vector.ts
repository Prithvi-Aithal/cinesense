// Small vector helpers shared by the seed script and the API routes.

export type Vec = number[];

/** Format a JS array as a pgvector literal: '[0.1,0.2,...]' */
export function toPgVector(v: Vec): string {
  return `[${v.map((x) => Number(x.toFixed(6))).join(",")}]`;
}

/** Parse pgvector's text output '[0.1,0.2,...]' back into numbers. */
export function fromPgVector(s: string): Vec {
  return s.slice(1, -1).split(",").map(Number);
}

export function normalize(v: Vec): Vec {
  const len = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return len === 0 ? v : v.map((x) => x / len);
}

/**
 * Weighted sum of vectors, then normalized. Used to build a user's taste vector:
 * liked movies pull it towards them, disliked movies push it away.
 */
export function weightedCentroid(items: { v: Vec; w: number }[]): Vec | null {
  if (items.length === 0) return null;
  const out = new Array(items[0].v.length).fill(0);
  for (const { v, w } of items) for (let i = 0; i < v.length; i++) out[i] += w * v[i];
  return normalize(out);
}
