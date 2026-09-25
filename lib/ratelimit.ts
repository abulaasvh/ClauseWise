import { NextRequest, NextResponse } from "next/server";
import { generateRequestId, buildErrorPayload } from "./errors";

/**
 * lib/ratelimit.ts
 * In-memory sliding window per-IP rate limiter for ClauseWise API routes.
 * Prevents abuse of shared LLM API keys and backend resources.
 */

interface RateLimitRecord {
  timestamps: number[];
}

// In-memory bucket storage: key -> RateLimitRecord
// Key format: `${routePrefix}:${clientIp}`
const rateLimitMap = new Map<string, RateLimitRecord>();

// Clean up stale entries every 10 minutes to prevent memory leak
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupStaleRecords(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const threshold = now - windowMs;
  for (const [key, record] of rateLimitMap.entries()) {
    record.timestamps = record.timestamps.filter((ts) => ts > threshold);
    if (record.timestamps.length === 0) {
      rateLimitMap.delete(key);
    }
  }
}

/**
 * Extracts client IP from incoming NextRequest headers.
 */
export function getClientIp(req: NextRequest): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    // Format may be "client, proxy1, proxy2"
    const firstIp = forwardedFor.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) {
    return realIp.trim();
  }

  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp && cfIp.trim()) {
    return cfIp.trim();
  }

  return "127.0.0.1";
}

export interface RateLimitOptions {
  /** Maximum number of requests allowed in the window. Default: 20 */
  maxRequests?: number;
  /** Window duration in milliseconds. Default: 3600000 (1 hour) */
  windowMs?: number;
  /** Route prefix identifier for isolated per-route quotas */
  route?: string;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;       // Unix timestamp in seconds
  retryAfter: number;  // Seconds until earliest window slot frees up
  clientIp: string;
}

/**
 * Checks and records rate limit for the incoming request.
 */
export function checkRateLimit(
  req: NextRequest,
  options: RateLimitOptions = {}
): RateLimitResult {
  const maxRequests = options.maxRequests ?? 20;
  const windowMs = options.windowMs ?? 60 * 60 * 1000; // 1 hour default
  const route = options.route ?? "api";

  const clientIp = getClientIp(req);
  const now = Date.now();
  const windowStart = now - windowMs;

  cleanupStaleRecords(windowMs);

  const bucketKey = `${route}:${clientIp}`;
  let record = rateLimitMap.get(bucketKey);

  if (!record) {
    record = { timestamps: [] };
    rateLimitMap.set(bucketKey, record);
  }

  // Filter out timestamps outside current sliding window
  record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

  if (record.timestamps.length >= maxRequests) {
    // Limit exceeded
    const oldestTimestamp = record.timestamps[0];
    const resetTimestampMs = oldestTimestamp + windowMs;
    const retryAfterSeconds = Math.max(1, Math.ceil((resetTimestampMs - now) / 1000));

    return {
      success: false,
      limit: maxRequests,
      remaining: 0,
      reset: Math.ceil(resetTimestampMs / 1000),
      retryAfter: retryAfterSeconds,
      clientIp,
    };
  }

  // Record this request
  record.timestamps.push(now);

  const remaining = Math.max(0, maxRequests - record.timestamps.length);
  const resetTimestampMs = record.timestamps[0] + windowMs;

  return {
    success: true,
    limit: maxRequests,
    remaining,
    reset: Math.ceil(resetTimestampMs / 1000),
    retryAfter: 0,
    clientIp,
  };
}

/**
 * Helper to construct standard 429 Too Many Requests response with RFC-compliant headers.
 */
export function buildRateLimitResponse(
  result: RateLimitResult,
  requestId: string
): NextResponse {
  const payload = buildErrorPayload(
    "RATE_LIMITED",
    requestId,
    `Too many requests. Per-IP rate limit of ${result.limit} requests per hour reached. Please try again in ${Math.ceil(result.retryAfter / 60)} minute(s).`
  );

  return NextResponse.json(payload, {
    status: 429,
    headers: {
      "Retry-After": result.retryAfter.toString(),
      "X-RateLimit-Limit": result.limit.toString(),
      "X-RateLimit-Remaining": result.remaining.toString(),
      "X-RateLimit-Reset": result.reset.toString(),
    },
  });
}
