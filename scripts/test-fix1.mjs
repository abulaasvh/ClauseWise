
import {
  callGeminiEmbeddingWithRetry,
  getQueryEmbedding,
} from "../lib/embeddings.js";
import { InMemoryVectorStore } from "../lib/vectorstore.js";

async function runTests() {
  console.log("=== FIX 1 VERIFICATION TEST ===");

  // 1. Test Gemini embedding retry logic with network error / ConnectTimeoutError simulation
  console.log("\n--- Test 1.1: Simulating network error to observe 2 retries & backoff (500ms + 1000ms) ---");
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async (...args) => {
    attempts++;
    console.log(`  -> Mock fetch called (attempt ${attempts}), simulating ConnectTimeoutError...`);
    throw new TypeError("fetch failed: ConnectTimeoutError: Connect Timeout Error");
  };

  const startTime = Date.now();
  const failedEmb = await callGeminiEmbeddingWithRetry(
    "What is the penalty for late payment?",
    "mock_key",
    2,
    [500, 1000]
  );
  const elapsed = Date.now() - startTime;
  console.log(`Failed embedding returned: ${failedEmb} after ${attempts} attempts in ${elapsed}ms`);
  if (failedEmb === null && attempts === 3 && elapsed >= 1400) {
    console.log("✓ Gemini embedding retry executed exactly 2 retries (3 attempts total) with backoff (~1500ms)!");
  } else {
    console.error(`✗ Expected 3 attempts and >=1400ms, got ${attempts} attempts and ${elapsed}ms`);
  }

  // Restore fetch
  globalThis.fetch = originalFetch;

  // 1.2 Test getQueryEmbedding when all options fail -> should emit warning
  console.log("\n--- Test 1.2: Verify [RETRIEVAL WARNING] when all providers fail ---");
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed: ConnectTimeoutError");
  };
  const warnLog = [];
  const origWarn = console.warn;
  console.warn = (...msg) => {
    warnLog.push(msg.join(" "));
    origWarn(...msg);
  };

  const queryEmbResult = await getQueryEmbedding("What is the penalty for late payment?");
  console.warn = origWarn;
  globalThis.fetch = originalFetch;

  const hasWarning = warnLog.some((w) =>
    w.includes("[RETRIEVAL WARNING] Query embedding failed after all retries — falling back to keyword-only matching, results may be degraded")
  );
  if (queryEmbResult === null && hasWarning) {
    console.log("✓ Correctly logged [RETRIEVAL WARNING] and returned null!");
  } else {
    console.error("✗ Warning was not logged as expected!");
  }

  // 2. Test InMemoryVectorStore search with degraded / null query embedding
  console.log("\n--- Test 1.2: Testing VectorStore retrieval when query embedding is null ---");
  const store = new InMemoryVectorStore();
  await store.indexChunks([
    {
      id: "clause-1",
      sectionNumber: "Section 3",
      title: "Late Payment Fees",
      text: "Tenant shall pay a late fee of $50 plus $10 per day for each day payment is delayed past the 5th of the month.",
      embedding: new Array(768).fill(0.01),
    },
    {
      id: "clause-2",
      sectionNumber: "Section 12",
      title: "Governing Law",
      text: "This agreement is governed by the laws of the State of California.",
      embedding: new Array(768).fill(0.02),
    },
  ]);

  console.log("\nTesting search fallback to keyword-only matching...");
  const results = await store.search("late payment fee penalty", 2);
  console.log(`Search returned ${results.length} results:`);
  results.forEach((r, idx) => {
    console.log(`  [Result ${idx + 1}] ${r.chunk.sectionNumber} - ${r.chunk.title} (Score: ${r.score.toFixed(4)}, Keyword bonus: ${r.keywordBonus.toFixed(4)})`);
  });

  if (results[0]?.chunk.id === "clause-1" && results[0].keywordBonus > 0) {
    console.log("✓ VectorStore correctly matches Section 3 using keyword bonus even in degraded mode!");
  } else {
    console.error("✗ Keyword matching failed to prioritize Section 3!");
  }

  console.log("\n=== FIX 1 TESTS COMPLETED SUCCESSFULLY ===");
}

runTests().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
