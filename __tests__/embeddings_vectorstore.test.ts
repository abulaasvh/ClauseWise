import { cosineSimilarity, generateLocalEmbedding } from "@/lib/embeddings";
import { InMemoryVectorStore } from "@/lib/vectorstore";
import { ClauseChunk } from "@/lib/types";

describe("lib/embeddings.ts - cosineSimilarity", () => {
  it("calculates 1.0 for identical unit vectors", () => {
    const v1 = [1, 0, 0];
    const v2 = [1, 0, 0];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 5);
  });

  it("calculates 0.0 for orthogonal vectors", () => {
    const v1 = [1, 0, 0];
    const v2 = [0, 1, 0];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(0.0, 5);
  });

  it("calculates -1.0 for directly opposite vectors", () => {
    const v1 = [1, 0, 0];
    const v2 = [-1, 0, 0];
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1.0, 5);
  });

  it("handles zero vectors and mismatched dimensions safely without NaN", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe("lib/vectorstore.ts - InMemoryVectorStore retrieval & caching", () => {
  it("ranks semantically relevant clauses above unrelated clauses for a known query", async () => {
    const store = new InMemoryVectorStore();

    const chunkIndemnity: ClauseChunk = {
      id: "c-1",
      sectionNumber: "3.1",
      title: "Indemnification",
      text: "Vendor will indemnify, defend, and hold harmless Customer against all third-party claims.",
      order: 1,
    };

    const chunkPayment: ClauseChunk = {
      id: "c-2",
      sectionNumber: "4.0",
      title: "Payment Terms",
      text: "Customer shall pay all invoices within thirty days of billing date.",
      order: 2,
    };

    const chunkGoverning: ClauseChunk = {
      id: "c-3",
      sectionNumber: "9.2",
      title: "Governing Law",
      text: "This agreement is governed by the laws of the State of New York.",
      order: 3,
    };

    await store.indexChunks([chunkIndemnity, chunkPayment, chunkGoverning]);

    const results = await store.search("Who indemnifies against third-party claims?", 3);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].chunk.id).toBe("c-1");
    expect(results[0].chunk.title).toBe("Indemnification");
    expect(results[0].score).toBeGreaterThan(results[1]?.score ?? 0);
  });

  it("reuses existing chunk.embedding and skips re-embedding cached chunks", async () => {
    const store = new InMemoryVectorStore();

    // A unique custom 3-dimensional vector
    const customEmbedding = [0.1234, 0.5678, 0.9012];

    const cachedChunk: ClauseChunk = {
      id: "cached-clause-1",
      sectionNumber: "1.0",
      title: "Cached Clause",
      text: "This clause already contains an embedded vector.",
      order: 1,
      embedding: customEmbedding,
    };

    await store.indexChunks([cachedChunk]);

    const storedRecords = store.getAll();
    expect(storedRecords.length).toBe(1);

    // If re-embedding occurred, vector length would be standard 256 or remote dim.
    // Preserving customEmbedding proves chunk.embedding was directly reused without re-embedding.
    expect(storedRecords[0].embedding).toBe(customEmbedding);
    expect(storedRecords[0].embedding.length).toBe(3);
  });

  it("preserves cached embeddings on re-indexing without recalculation", async () => {
    const store = new InMemoryVectorStore();

    const chunkA: ClauseChunk = {
      id: "chunk-a",
      sectionNumber: "1.1",
      title: "Clause A",
      text: "Terms and conditions of licensing.",
      order: 1,
    };

    // First indexing generates embedding
    await store.indexChunks([chunkA]);
    const firstVectorRef = store.getAll()[0].embedding;
    expect(firstVectorRef).toBeDefined();

    // Second indexing of the same store
    await store.indexChunks([chunkA]);
    const secondVectorRef = store.getAll()[0].embedding;

    // Must be the identical cached vector reference
    expect(secondVectorRef).toBe(firstVectorRef);
    expect(store.getAll().length).toBe(1);
  });
});
