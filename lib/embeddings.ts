// Sentence embeddings computed locally with all-MiniLM-L6-v2 (384 dimensions).
// No API key or external service: the model (~90 MB) is downloaded from Hugging Face
// on first use and cached in ./.models. Set MODEL_DIR to load it from a local folder instead.
import path from "node:path";

export const MODEL_ID = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMS = 384;

type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

let extractorPromise: Promise<Extractor> | null = null;

async function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.cacheDir = path.join(process.cwd(), ".models");
      if (process.env.MODEL_DIR) {
        env.localModelPath = process.env.MODEL_DIR;
        env.allowRemoteModels = false;
      }
      return (await pipeline("feature-extraction", MODEL_ID, { dtype: "fp32" })) as unknown as Extractor;
    })();
    extractorPromise.catch(() => (extractorPromise = null)); // allow a retry after a failed load
  }
  return extractorPromise;
}

/** Embed a batch of texts. Vectors come back L2-normalized (length 1). */
export async function embed(texts: string[]): Promise<number[][]> {
  const extractor = await getExtractor();
  const out = await extractor(texts, { pooling: "mean", normalize: true });
  return out.tolist();
}

/** The text that represents a movie in vector space. */
export function movieText(m: { title: string; genres: string[]; description: string }) {
  return `${m.title}. ${m.genres.join(", ")}. ${m.description}`;
}
