/**
 * @jest-environment node
 */
jest.mock("groq-sdk", () =>
  jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn(() => new Promise(() => {})),
      },
    },
  }))
);

import { generateWithResilientLLM } from "@/lib/gemini";

describe("resilient LLM deadline", () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGroqKey = process.env.GROQ_API_KEY;

  afterEach(() => {
    jest.restoreAllMocks();
    process.env.GEMINI_API_KEY = originalGeminiKey;
    process.env.GROQ_API_KEY = originalGroqKey;
  });

  it("aborts the combined Gemini-to-Groq path at the configured deadline", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-key";
    process.env.GROQ_API_KEY = "test-groq-key";
    jest.spyOn(global, "fetch").mockResolvedValue(
      new Response("temporarily unavailable", { status: 503 })
    );

    const startedAt = Date.now();
    await expect(
      generateWithResilientLLM("system", "question", {
        maxRetries: 0,
        timeoutMs: 100,
      })
    ).rejects.toThrow("LLM_TIMEOUT");

    expect(Date.now() - startedAt).toBeLessThan(500);
  });
});