/**
 * Resilient LLM Layer: Google Gemini with Exponential Backoff Retries & Groq Fallback
 */

import Groq from "groq-sdk";
import { applyGuardrailSafetyFilter } from "./claude";

export function getGeminiApiKey(): string | null {
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && !envKey.includes("your-gemini")) return envKey.trim();

  if (typeof window !== "undefined") {
    try {
      return localStorage.getItem("clausewise_gemini_api_key");
    } catch {
      return null;
    }
  }
  return null;
}

export function getGroqApiKey(): string | null {
  const envKey = process.env.GROQ_API_KEY;
  if (envKey && !envKey.includes("your-groq") && envKey.trim().length > 0) return envKey.trim();

  if (typeof window !== "undefined") {
    try {
      return localStorage.getItem("clausewise_groq_api_key");
    } catch {
      return null;
    }
  }
  return null;
}

export function getOpenAIApiKey(): string | null {
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey && !envKey.includes("your-openai") && envKey.trim().length > 0) return envKey.trim();

  if (typeof window !== "undefined") {
    try {
      return localStorage.getItem("clausewise_openai_api_key");
    } catch {
      return null;
    }
  }
  return null;
}

export function saveGeminiApiKey(key: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("clausewise_gemini_api_key", key.trim());
  }
}

export function saveGroqApiKey(key: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("clausewise_groq_api_key", key.trim());
  }
}

export function saveOpenAIApiKey(key: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("clausewise_openai_api_key", key.trim());
  }
}

export interface LLMGenerationResult {
  text: string;
  provider: "Gemini" | "Groq" | "OpenAI";
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new DOMException("The operation was aborted", "AbortError"));
    }, { once: true });
  });

export interface ResilientLLMOptions {
  jsonMode?: boolean;
  maxRetries?: number;
  backoffDelays?: number[];
  timeoutMs?: number;
}

/**
 * Call Gemini 1.5 Flash via REST API with retry logic on 429/503 errors (configurable retries and backoff)
 */
async function callGeminiWithRetry(
  systemInstruction: string,
  userPrompt: string,
  apiKey: string,
  maxRetries: number = 1,
  backoffDelays: number[] = [1000],
  signal?: AbortSignal
): Promise<string | null> {

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents: [
            {
              parts: [{ text: userPrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return text;
        }
      }

      const errText = await res.text();
      const isRetryable =
        res.status === 429 ||
        res.status === 503 ||
        errText.includes("high demand") ||
        errText.includes("RESOURCE_EXHAUSTED") ||
        errText.includes("UNAVAILABLE");

      if (isRetryable && attempt < maxRetries) {
        const delay = backoffDelays[attempt];
        console.warn(
          `[Gemini] Status ${res.status} ("${errText.slice(0, 80)}"). Retrying in ${delay / 1000}s (retry ${attempt + 1} of ${maxRetries})...`
        );
        await sleep(delay, signal);
        continue;
      }

      console.warn(`[Gemini] Request failed with status ${res.status}: ${errText.slice(0, 120)}`);
      return null;
    } catch (err) {
      if (attempt < maxRetries) {
        const delay = backoffDelays[attempt];
        console.warn(
          `[Gemini] Network error (${(err as Error).message}). Retrying in ${delay / 1000}s (retry ${attempt + 1} of ${maxRetries})...`
        );
        await sleep(delay, signal);
        continue;
      }
      console.warn("[Gemini] Invocations exhausted:", err);
      return null;
    }
  }

  return null;
}

/**
 * Call Groq chat.completions.create with llama-3.3-70b-versatile (falls back to available models if not accessible)
 */
async function callGroqFallback(
  systemInstruction: string,
  userPrompt: string,
  apiKey: string,
  jsonMode: boolean = false,
  signal?: AbortSignal
): Promise<string | null> {
  const modelsToTry = [
    "llama-3.3-70b-versatile",
    "openai/gpt-oss-120b",
    "groq/compound",
  ];

  try {
    const groq = new Groq({ apiKey });

    for (const model of modelsToTry) {
      try {
        const completion = await groq.chat.completions.create({
          model,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.3,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        }, { signal });

        const text = completion.choices[0]?.message?.content;
        if (text) return text;
      } catch (err: unknown) {
        const anyErr = err as { status?: number; error?: { code?: string }; message?: string };
        if (
          anyErr?.status === 404 ||
          anyErr?.error?.code === "model_not_found" ||
          anyErr?.message?.includes("does not exist")
        ) {
          continue;
        }
        console.error(`[Groq Fallback] Model ${model} failed:`, err);
        return null;
      }
    }
    return null;
  } catch (err) {
    console.error("[Groq Fallback] chat.completions.create failed:", err);
    return null;
  }
}

/**
 * Unified generation function with:
 * 1. Gemini primary with one retry on 429/503 (1s flat backoff)
 * 2. Groq fallback (llama-3.3-70b-versatile)
 * 3. Provider logging
 * 4. Throws error if both fail (stops fake 200 responses)
 */
async function generateWithResilientLLMInternal(
  systemInstruction: string,
  userPrompt: string,
  options: ResilientLLMOptions | undefined,
  signal: AbortSignal
): Promise<LLMGenerationResult> {
  const geminiKey = getGeminiApiKey();
  const maxRetries = options?.maxRetries ?? 1;
  const backoffDelays = options?.backoffDelays ?? [1000];

  if (geminiKey) {
    const geminiText = await callGeminiWithRetry(
      systemInstruction,
      userPrompt,
      geminiKey,
      maxRetries,
      backoffDelays,
      signal
    );
    if (geminiText) {
      console.log("[LLM] Answered by: Gemini");
      return {
        text: applyGuardrailSafetyFilter(geminiText),
        provider: "Gemini",
      };
    }
    console.warn("[LLM] Gemini failed after retries. Attempting Groq fallback...");
  } else {
    console.warn("[LLM] No Gemini API key configured. Attempting Groq fallback...");
  }

  const groqKey = getGroqApiKey();
  if (groqKey) {
    const isJson =
      options?.jsonMode ?? /return only valid json|respond only with valid json/i.test(systemInstruction);
    const groqText = await callGroqFallback(systemInstruction, userPrompt, groqKey, isJson, signal);
    if (groqText) {
      console.log("[LLM] Answered by: Groq");
      return {
        text: applyGuardrailSafetyFilter(groqText),
        provider: "Groq",
      };
    }
  }

  console.error("[LLM] Both Gemini and Groq fallback failed to produce a response.");
  throw new Error("ALL_PROVIDERS_DOWN: All configured AI providers (Gemini, Groq) failed to produce a response.");
}

export async function generateWithResilientLLM(
  systemInstruction: string,
  userPrompt: string,
  options?: ResilientLLMOptions
): Promise<LLMGenerationResult> {
  const timeoutMs = options?.timeoutMs ?? 8000;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("LLM_TIMEOUT: AI service temporarily unavailable."));
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      generateWithResilientLLMInternal(systemInstruction, userPrompt, options, controller.signal),
      timeoutPromise,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/**
 * Legacy wrapper for backward compatibility (returns null on complete failure)
 */
export async function generateWithGemini(
  systemInstruction: string,
  userPrompt: string
): Promise<string | null> {
  try {
    const result = await generateWithResilientLLM(systemInstruction, userPrompt);
    return result.text;
  } catch {
    return null;
  }
}
