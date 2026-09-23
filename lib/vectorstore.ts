import { ClauseChunk } from "./types";
import { cosineSimilarity, getEmbedding, getQueryEmbedding } from "./embeddings";

export interface VectorRecord {
  chunk: ClauseChunk;
  embedding: number[];
}

export interface SearchResult {
  chunk: ClauseChunk;
  score: number;
}

const STOP_WORDS = new Set([
  "the", "this", "that", "with", "have", "who", "what", "where", "when", "how",
  "can", "will", "does", "for", "and", "are", "is", "a", "an", "of", "to", "in",
  "on", "at", "by", "from", "my", "if"
]);

const SYNONYM_MAP: Record<string, string[]> = {
  dog: ["pet", "pets", "animal", "animals", "dog", "dogs", "cat", "cats"],
  dogs: ["pet", "pets", "animal", "animals", "dog", "dogs"],
  cat: ["pet", "pets", "animal", "animals"],
  cats: ["pet", "pets", "animal", "animals"],
  pet: ["pet", "pets", "animal", "animals", "dog", "cat"],
  pets: ["pet", "pets", "animal", "animals", "dog", "cat"],
  dishwasher: ["appliance", "appliances", "plumbing", "maintenance", "repairs", "equipment", "dishwasher"],
  appliance: ["appliance", "appliances", "dishwasher", "refrigerator", "stove", "oven", "plumbing", "repairs"],
  appliances: ["appliance", "appliances", "dishwasher", "refrigerator", "stove", "oven", "plumbing", "repairs"],
  break: ["repair", "repairs", "maintenance", "damage", "damages", "fix", "breaks", "broken"],
  breaks: ["repair", "repairs", "maintenance", "damage", "damages", "fix", "break", "broken"],
  broken: ["repair", "repairs", "maintenance", "damage", "damages", "fix", "break", "breaks"],
  california: ["california", "state", "governing", "jurisdiction", "law", "laws"],
  legal: ["governing", "jurisdiction", "law", "laws", "enforceable", "validity", "state"],
  legality: ["governing", "jurisdiction", "law", "laws", "enforceable", "validity", "state"],
  law: ["governing", "jurisdiction", "laws", "state", "court"],
};

function computeKeywordBonus(query: string, chunk: ClauseChunk): number {
  const queryLower = query.toLowerCase();
  const chunkTextLower = `${chunk.sectionNumber || ""} ${chunk.title || ""} ${chunk.text || ""}`.toLowerCase();

  const queryTokens = queryLower
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

  let bonus = 0;
  for (const token of queryTokens) {
    if (chunkTextLower.includes(token)) {
      bonus += 0.05;
    }
    const syns = SYNONYM_MAP[token];
    if (syns) {
      for (const syn of syns) {
        if (chunkTextLower.includes(syn)) {
          bonus += 0.04;
          break;
        }
      }
    }
  }

  return Math.min(bonus, 0.15);
}

export class InMemoryVectorStore {
  private records: VectorRecord[] = [];

  /**
   * Clears existing records and indexes the given clause chunks with deduplication,
   * reusing cached embeddings whenever available.
   */
  async indexChunks(chunks: ClauseChunk[]): Promise<void> {
    // Deduplicate incoming chunks before processing (by sectionNumber + title + text preview)
    const seen = new Set<string>();
    const uniqueChunks: ClauseChunk[] = [];

    for (const chunk of chunks) {
      const key = `${chunk.sectionNumber || ""}::${chunk.title || ""}::${chunk.text.slice(0, 40)}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueChunks.push(chunk);
      }
    }

    let cachedCount = 0;
    let newCount = 0;
    const newRecords: VectorRecord[] = [];

    for (const chunk of uniqueChunks) {
      // 1. Check if chunk already has a stored vector
      if (chunk.embedding && Array.isArray(chunk.embedding) && chunk.embedding.length > 0) {
        newRecords.push({ chunk, embedding: chunk.embedding });
        cachedCount++;
        continue;
      }

      // 2. Check if this vector store already has an existing vector for this chunk
      const existing = this.records.find((r) => r.chunk.id === chunk.id);
      if (existing && existing.embedding && existing.embedding.length > 0) {
        chunk.embedding = existing.embedding;
        newRecords.push({ chunk, embedding: existing.embedding });
        cachedCount++;
        continue;
      }

      // 3. Compute new embedding only when not cached
      const textToEmbed = `${chunk.sectionNumber || ""} ${chunk.title || ""}: ${chunk.text}`;
      const embedding = await getEmbedding(textToEmbed);
      chunk.embedding = embedding;
      newRecords.push({ chunk, embedding });
      newCount++;
    }

    // Atomically set records to prevent partial or duplicate states
    this.records = newRecords;
    console.log(
      `[VECTORSTORE] Using ${cachedCount} cached embeddings, ${newCount} new`
    );
  }

  /**
   * Retrieves top-k most relevant chunks for a user query (default 3 chunks) using hybrid scoring
   */
  async search(query: string, topK: number = 3): Promise<SearchResult[]> {
    if (this.records.length === 0) return [];
    const queryEmbedding = await getQueryEmbedding(query);

    const scored = this.records.map((rec) => {
      const semScore =
        queryEmbedding && queryEmbedding.length > 0 && queryEmbedding.length === rec.embedding.length
          ? cosineSimilarity(queryEmbedding, rec.embedding)
          : 0;
      const kwBonus = computeKeywordBonus(query, rec.chunk);
      return {
        chunk: rec.chunk,
        score: semScore + kwBonus,
        rawSemanticScore: semScore,
        keywordBonus: kwBonus,
      };
    });

    // Sort descending by score
    scored.sort((a, b) => b.score - a.score);

    console.log(`[RETRIEVAL] Query: "${query}"`);
    console.log(`[RETRIEVAL] top_k: ${topK}`);
    scored.forEach((c, i) => {
      const selected = i < topK ? "✓ SELECTED" : "✗ cut";
      const sectionLabel = `${c.chunk.sectionNumber ? c.chunk.sectionNumber + " - " : ""}${c.chunk.title || "Untitled"}`;
      console.log(
        `  [${selected}] ${sectionLabel} — score: ${c.score.toFixed(4)} (sem: ${c.rawSemanticScore.toFixed(4)}, kw: ${c.keywordBonus.toFixed(4)})`
      );
    });

    return scored.slice(0, topK);
  }

  /**
   * Returns all stored records
   */
  getAll(): VectorRecord[] {
    return this.records;
  }
}

// Global store instances mapped by document ID
const documentStores = new Map<string, InMemoryVectorStore>();

export function getVectorStore(documentId: string): InMemoryVectorStore {
  let store = documentStores.get(documentId);
  if (!store) {
    store = new InMemoryVectorStore();
    documentStores.set(documentId, store);
  }
  return store;
}
