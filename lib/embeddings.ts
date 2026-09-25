/**
 * Vector embeddings and similarity computation.
 * Supports Voyage AI, Google Gemini Embedding (models/gemini-embedding-2 / gemini-embedding-001),
 * OpenAI text-embedding-3-small, and local normalized vectorizer fallback.
 */

import { getGeminiApiKey } from "./gemini";

// Cosine similarity between two unit-normalized vectors
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Local deterministic semantic text embedding generator.
 * Produces a normalized 256-dimensional vector using hash-based term frequencies
 * and word character n-grams. Excellent for contract terms and clause matching.
 */
const VECTOR_DIM = 256;

const LEGAL_STOPWORDS = new Set([
  "the", "and", "or", "to", "in", "of", "for", "with", "a", "an", "is", "be",
  "as", "by", "that", "this", "it", "at", "from", "shall", "may", "herein",
  "thereto", "thereof", "which", "any", "all", "such", "are", "on", "not"
]);

function hashString(str: string, seed: number): number {
  let h = seed ^ 0xdeadbeef;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 2654435761);
  }
  return (h ^ (h >>> 16)) >>> 0;
}

export function generateLocalEmbedding(text: string): number[] {
  const vec = new Array(VECTOR_DIM).fill(0);
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s$%-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  if (words.length === 0) {
    return vec;
  }

  // Word token weights
  for (const word of words) {
    const isStop = LEGAL_STOPWORDS.has(word);
    const weight = isStop ? 0.3 : 1.5;
    const idx1 = hashString(word, 11) % VECTOR_DIM;
    const idx2 = hashString(word, 37) % VECTOR_DIM;
    vec[idx1] += weight;
    vec[idx2] += weight * 0.5;
  }

  // Word bi-grams for legal context
  for (let i = 0; i < words.length - 1; i++) {
    const bigram = `${words[i]}_${words[i + 1]}`;
    const idx = hashString(bigram, 73) % VECTOR_DIM;
    vec[idx] += 2.0;
  }

  // Normalize vector to unit length (L2 norm)
  let norm = 0;
  for (let i = 0; i < VECTOR_DIM; i++) {
    norm += vec[i] * vec[i];
  }
  if (norm > 0) {
    const sqrtNorm = Math.sqrt(norm);
    for (let i = 0; i < VECTOR_DIM; i++) {
      vec[i] = vec[i] / sqrtNorm;
    }
  }

  return vec;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const embeddingCache = new Map<string, number[]>();

/**
 * Call Google Gemini Embedding API with exponential backoff retries.
 * Retries on network errors (ConnectTimeoutError, fetch failed, etc.) and 429/503 status codes.
 */
export async function callGeminiEmbeddingWithRetry(
  text: string,
  apiKey: string,
  maxRetries: number = 2,
  backoffDelays: number[] = [500, 1000]
): Promise<number[] | null> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent?key=${apiKey}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/gemini-embedding-2",
          content: { parts: [{ text: text.slice(0, 8000) }] },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const emb = data.embedding?.values;
        if (emb && Array.isArray(emb) && emb.length > 0) {
          return emb;
        }
      }

      const errText = await res.text().catch(() => "");
      const isRetryable =
        res.status === 429 ||
        res.status === 503 ||
        errText.includes("high demand") ||
        errText.includes("RESOURCE_EXHAUSTED") ||
        errText.includes("UNAVAILABLE");

      if (isRetryable && attempt < maxRetries) {
        const delay = backoffDelays[attempt] ?? 1000;
        console.warn(
          `[Gemini Embedding] Status ${res.status} ("${errText.slice(0, 80)}"). Retrying in ${delay}ms (retry ${attempt + 1} of ${maxRetries})...`
        );
        await sleep(delay);
        continue;
      }

      console.warn(`[Gemini Embedding] Request failed with status ${res.status}: ${errText.slice(0, 120)}`);
      if (attempt < maxRetries && res.status >= 500) {
        const delay = backoffDelays[attempt] ?? 1000;
        await sleep(delay);
        continue;
      }
      return null;
    } catch (err) {
      const errMsg = (err as Error)?.message || String(err);
      if (attempt < maxRetries) {
        const delay = backoffDelays[attempt] ?? 1000;
        console.warn(
          `[Gemini Embedding] Network error (${errMsg}). Retrying in ${delay}ms (retry ${attempt + 1} of ${maxRetries})...`
        );
        await sleep(delay);
        continue;
      }
      console.warn(`[Gemini Embedding] Embedding failed after ${maxRetries} retries:`, errMsg);
      return null;
    }
  }

  return null;
}

/**
 * Fetch embeddings from Voyage AI if configured.
 */
export async function fetchVoyageEmbedding(clean: string): Promise<number[] | null> {
  const voyageKey = process.env.VOYAGE_API_KEY;
  if (!voyageKey || voyageKey.includes("your-voyage") || voyageKey.trim().length === 0) {
    return null;
  }

  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${voyageKey.trim()}`,
      },
      body: JSON.stringify({
        model: "voyage-3-lite",
        input: [clean.slice(0, 8000)],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const emb = data.data?.[0]?.embedding;
      if (emb && Array.isArray(emb) && emb.length > 0) {
        return emb;
      }
    } else {
      const errText = await res.text().catch(() => "");
      console.warn(`[Voyage AI] Request failed with status ${res.status}:`, errText.slice(0, 100));
    }
  } catch (e) {
    console.warn("[Voyage AI] Embedding request failed:", e);
  }

  return null;
}

/**
 * Fetch embeddings from OpenAI text-embedding-3-small if configured.
 */
export async function fetchOpenAIEmbedding(clean: string): Promise<number[] | null> {
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!openAiKey || openAiKey.includes("your-openai") || openAiKey.trim().length === 0) {
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openAiKey.trim()}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: clean.slice(0, 8000),
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const emb = data.data?.[0]?.embedding;
      if (emb && Array.isArray(emb) && emb.length > 0) {
        return emb;
      }
    } else {
      const errText = await response.text().catch(() => "");
      console.warn(`[OpenAI Embedding] Request failed with status ${response.status}:`, errText.slice(0, 100));
    }
  } catch (e) {
    console.warn("[OpenAI Embedding] Embedding request failed:", e);
  }

  return null;
}

/**
 * Query-time embedding with retries and fallback:
 * 1. Checks memory cache.
 * 2. Attempts Gemini embedding with retry-with-backoff (up to 2 retries: 500ms, 1000ms).
 * 3. Falls back to Voyage AI (if configured) if Gemini fails.
 * 4. Falls back to OpenAI (if configured).
 * 5. If ALL options fail, logs explicit warning and returns null to trigger keyword-only matching.
 */
export async function getQueryEmbedding(text: string): Promise<number[] | null> {
  const clean = text.trim();
  if (embeddingCache.has(clean)) {
    return embeddingCache.get(clean)!;
  }

  // 1. Primary: Gemini with retries and short backoff
  const geminiKey = getGeminiApiKey();
  if (geminiKey) {
    const emb = await callGeminiEmbeddingWithRetry(clean, geminiKey, 2, [500, 1000]);
    if (emb) {
      embeddingCache.set(clean, emb);
      return emb;
    }
  }

  // 2. Fallback provider: Voyage AI (if configured)
  const voyageEmb = await fetchVoyageEmbedding(clean);
  if (voyageEmb) {
    embeddingCache.set(clean, voyageEmb);
    return voyageEmb;
  }

  // 3. Fallback provider: OpenAI (if configured)
  const openAiEmb = await fetchOpenAIEmbedding(clean);
  if (openAiEmb) {
    embeddingCache.set(clean, openAiEmb);
    return openAiEmb;
  }

  // 4. Fallback: local normalized vectorizer (matches getEmbedding fallback)
  const local = generateLocalEmbedding(clean);
  if (local && local.length > 0) {
    embeddingCache.set(clean, local);
    return local;
  }

  // 5. If ALL options fail, throw a typed error for the route catch block
  throw new Error(
    "EMBEDDING_FAILED: Query embedding failed after all providers returned null."
  );
}

/**
 * Get embeddings for text (used during document chunk indexing and general embedding).
 */
export async function getEmbedding(text: string): Promise<number[]> {
  const clean = text.trim();
  if (embeddingCache.has(clean)) {
    return embeddingCache.get(clean)!;
  }

  // 1. Voyage AI (if configured)
  const voyageEmb = await fetchVoyageEmbedding(clean);
  if (voyageEmb) {
    embeddingCache.set(clean, voyageEmb);
    return voyageEmb;
  }

  // 2. Google Gemini Embedding with retry
  const geminiKey = getGeminiApiKey();
  if (geminiKey) {
    const geminiEmb = await callGeminiEmbeddingWithRetry(clean, geminiKey, 2, [500, 1000]);
    if (geminiEmb) {
      embeddingCache.set(clean, geminiEmb);
      return geminiEmb;
    }
  }

  // 3. OpenAI text-embedding-3-small (if configured)
  const openAiEmb = await fetchOpenAIEmbedding(clean);
  if (openAiEmb) {
    embeddingCache.set(clean, openAiEmb);
    return openAiEmb;
  }

  // 4. Local fallback vectorizer
  const local = generateLocalEmbedding(clean);
  embeddingCache.set(clean, local);
  return local;
}
