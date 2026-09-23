/**
 * lib/errors.ts
 * Shared error classifier, sanitizer, server-side logger, and response builder
 * for all AI-calling routes.
 *
 * SECURITY CONTRACT:
 *   - Nothing that could identify an API key, billing account, raw provider JSON,
 *     or internal file path is ever included in what `buildErrorResponse` returns.
 *   - `sanitizeForClient` is the final gate before any string leaves this module
 *     toward the client.
 */

// ─── Error Categories ────────────────────────────────────────────────────────

export type ErrorCategory =
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "AUTH_ERROR"
  | "ALL_PROVIDERS_DOWN"
  | "EMBEDDING_FAILED"
  | "UNKNOWN";

// ─── Safe User-Facing Messages ───────────────────────────────────────────────

const USER_MESSAGES: Record<ErrorCategory, string> = {
  QUOTA_EXCEEDED:
    "The AI service has reached its usage limit for now. Please try again in a few minutes.",
  RATE_LIMITED:
    "The AI service is experiencing high demand. Retrying automatically — please wait a moment.",
  NETWORK_ERROR:
    "Couldn't reach the AI service due to a network issue. Please try again.",
  AUTH_ERROR:
    "There's a configuration issue with the AI service. Please contact the site owner.",
  ALL_PROVIDERS_DOWN:
    "All AI services are temporarily unavailable. Please try again shortly.",
  EMBEDDING_FAILED:
    "Couldn't process your question against the document right now. Please try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

// ─── HTTP Status Map ─────────────────────────────────────────────────────────

export const CATEGORY_HTTP_STATUS: Record<ErrorCategory, number> = {
  QUOTA_EXCEEDED: 429,
  RATE_LIMITED: 503,
  NETWORK_ERROR: 503,
  AUTH_ERROR: 500,     // Don't expose 401 to clients — hides auth detail
  ALL_PROVIDERS_DOWN: 503,
  EMBEDDING_FAILED: 503,
  UNKNOWN: 500,
};

// ─── Request ID Generator ────────────────────────────────────────────────────

/**
 * Generates a short, collision-resistant request ID for log correlation.
 * Safe to expose to the client (no internal detail, just a random string).
 */
export function generateRequestId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "req_";
  for (let i = 0; i < 8; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

// ─── Security Sanitizer ──────────────────────────────────────────────────────

/**
 * Patterns whose presence in a client-bound string indicates a potential
 * secret or sensitive internal detail has leaked through an unclassified path.
 */
const LEAK_PATTERNS = [
  /sk-[A-Za-z0-9_-]{10,}/,           // OpenAI / Anthropic secret keys
  /AIza[A-Za-z0-9_-]{10,}/,          // Google API keys
  /gsk_[A-Za-z0-9_-]{10,}/,          // Groq secret keys
  /api[_-]?key\s*[:=]/i,             // Generic "api_key =" or "api-key:" patterns
  /Bearer\s+[A-Za-z0-9._-]{10,}/i,   // Raw Bearer tokens
  /\bpa-[A-Za-z0-9_-]{20,}/,         // Voyage AI keys
  /"error"\s*:\s*\{/,                // Raw JSON error blobs
  /at\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\(/,  // Stack trace frames: "at functionName ("
  /\/[a-z]+\/[a-z]+\/[a-z]+\//,     // Internal file paths like /app/api/chat/
];

/**
 * Runs the final security gate before any message reaches the client.
 * If any leak pattern is detected, returns the generic UNKNOWN message instead.
 */
export function sanitizeForClient(text: string): string {
  for (const pattern of LEAK_PATTERNS) {
    if (pattern.test(text)) {
      console.warn(
        "[SECURITY] sanitizeForClient: Blocked potential secret/path leak. Pattern:",
        pattern.toString().slice(0, 60)
      );
      return USER_MESSAGES.UNKNOWN;
    }
  }
  return text;
}

// ─── Error Classifier ────────────────────────────────────────────────────────

/**
 * Inspects an error's message (and optionally a raw HTTP response body)
 * and returns the most accurate ErrorCategory.
 */
export function classifyError(
  err: unknown,
  rawResponseText?: string
): ErrorCategory {
  const msg = ((err as Error)?.message ?? String(err)).toLowerCase();
  const raw = (rawResponseText ?? "").toLowerCase();
  const combined = `${msg} ${raw}`;

  // Embedding failures (typed prefix from lib/embeddings.ts)
  if (combined.includes("embedding_failed") || combined.includes("embedding failed")) {
    return "EMBEDDING_FAILED";
  }

  // All providers exhausted (typed prefix from lib/gemini.ts)
  if (
    combined.includes("all_providers_down") ||
    combined.includes("all ai services") ||
    combined.includes("both gemini and groq")
  ) {
    return "ALL_PROVIDERS_DOWN";
  }

  // Quota / billing
  if (
    combined.includes("429") ||
    combined.includes("insufficient_quota") ||
    combined.includes("quota") ||
    combined.includes("credit_balance_exhausted") ||
    combined.includes("resource_exhausted") ||
    combined.includes("billing")
  ) {
    return "QUOTA_EXCEEDED";
  }

  // Rate limiting / service overload
  if (
    combined.includes("rate limit") ||
    combined.includes("high demand") ||
    combined.includes("503") ||
    combined.includes("unavailable") ||
    combined.includes("overloaded")
  ) {
    return "RATE_LIMITED";
  }

  // Network / connectivity
  if (
    combined.includes("connecttimeout") ||
    combined.includes("fetch failed") ||
    combined.includes("econnrefused") ||
    combined.includes("enotfound") ||
    combined.includes("network") ||
    combined.includes("socket") ||
    combined.includes("etimedout")
  ) {
    return "NETWORK_ERROR";
  }

  // Auth / key problems
  if (
    combined.includes("401") ||
    combined.includes("invalid_api_key") ||
    combined.includes("invalid key") ||
    combined.includes("unauthorized") ||
    combined.includes("authentication") ||
    combined.includes("permission denied")
  ) {
    return "AUTH_ERROR";
  }

  return "UNKNOWN";
}

// ─── Server-Side Logger ──────────────────────────────────────────────────────

/**
 * Logs the FULL error detail server-side (never reaches the browser).
 * Prefixed with category and requestId for easy grepping.
 */
export function logServerError(
  category: ErrorCategory,
  requestId: string,
  provider: string,
  err: unknown
): void {
  const message = (err as Error)?.message ?? String(err);
  const stack = (err as Error)?.stack;
  console.error(
    `[${category}] [${requestId}] Provider: ${provider} — ${message}`
  );
  if (stack) {
    // Log the stack only server-side, never forwarded to the client
    console.error(`[${category}] [${requestId}] Stack:\n${stack}`);
  }
}

// ─── Client Response Builder ─────────────────────────────────────────────────

export interface ApiErrorPayload {
  error: true;
  category: ErrorCategory;
  message: string;
  requestId: string;
  timestamp: string;
}

/**
 * Assembles the sanitized JSON error payload for the client.
 * Runs sanitizeForClient as a final gate on the message.
 */
export function buildErrorPayload(
  category: ErrorCategory,
  requestId: string
): ApiErrorPayload {
  const rawMessage = USER_MESSAGES[category] ?? USER_MESSAGES.UNKNOWN;
  return {
    error: true,
    category,
    message: sanitizeForClient(rawMessage),
    requestId,
    timestamp: new Date().toISOString(),
  };
}
