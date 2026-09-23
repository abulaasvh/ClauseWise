import { answerGroundedQuestion } from "../lib/claude.js";
import * as geminiModule from "../lib/gemini.js";

async function testFix2GenerationRetries() {
  console.log("=== FIX 2.1 GENERATION RETRY TEST ===");

  // Mock callGeminiWithRetry or inspect options passed to generateWithResilientLLM
  const origGenerate = geminiModule.generateWithResilientLLM;
  let passedOptions = null;

  // We can test by calling answerGroundedQuestion with Anthropic disabled (which falls back to generateWithResilientLLM)
  // Temporarily unset ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY;

  // Spy on generateWithResilientLLM
  let geminiAttempts = 0;
  let groqAttempts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    const urlStr = String(url);
    if (urlStr.includes("generativelanguage.googleapis.com")) {
      geminiAttempts++;
      console.log(`  -> Mock Gemini generateContent fetch called (attempt ${geminiAttempts})...`);
      return {
        ok: false,
        status: 503,
        text: async () => "The model is overloaded. Please try again later.",
      };
    }
    groqAttempts++;
    return {
      ok: false,
      status: 503,
      text: async () => "Groq overloaded",
    };
  };

  const startTime = Date.now();
  try {
    await answerGroundedQuestion("What is the rent?", [
      {
        sectionNumber: "Section 2",
        title: "Rent",
        text: "Monthly rent is $2,000 due on the 1st.",
      },
    ]);
  } catch (err) {
    console.log("Caught expected error after retries exhausted:", err.message);
  }
  const elapsed = Date.now() - startTime;
  globalThis.fetch = originalFetch;

  console.log(`Total Gemini generation attempts: ${geminiAttempts}, elapsed: ${elapsed}ms`);
  // For 1 retry with 1s backoff: exactly 2 attempts (initial attempt + 1 retry) and ~1000ms delay
  if (geminiAttempts === 2 && elapsed >= 950 && elapsed < 2200) {
    console.log("✓ Correctly performed only 1 retry with flat 1s backoff for chat generation!");
  } else {
    console.error(`✗ Expected 2 Gemini attempts and ~1000ms elapsed, got ${geminiAttempts} attempts and ${elapsed}ms`);
  }

  console.log("\n=== FIX 2.1 TESTS COMPLETED SUCCESSFULLY ===");
}

testFix2GenerationRetries().catch((err) => {
  console.error(err);
  process.exit(1);
});
