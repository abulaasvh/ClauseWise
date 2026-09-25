import { NextRequest, NextResponse } from "next/server";
import { auditWithLettuceDetect } from "@/lib/lettucedetect";
import {
  generateRequestId,
  buildErrorResponse,
  buildErrorPayload,
} from "@/lib/errors";
import { checkRateLimit, buildRateLimitResponse } from "@/lib/ratelimit";

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  // ── 1. Per-IP Rate Limiting (40 requests/hour for hallucination audit) ─────
  const rateLimitResult = checkRateLimit(request, {
    maxRequests: 40,
    windowMs: 60 * 60 * 1000,
    route: "hallucination",
  });
  if (!rateLimitResult.success) {
    return buildRateLimitResponse(rateLimitResult, requestId);
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        buildErrorPayload("UNKNOWN", requestId, "Invalid JSON payload in request body."),
        { status: 400 }
      );
    }

    const { question, answer, context } = body;

    // ── 2. Input Validation ──────────────────────────────────────────────────
    if (!answer || typeof answer !== "string" || !answer.trim()) {
      return NextResponse.json(
        buildErrorPayload("UNKNOWN", requestId, "Answer text is required for hallucination detection."),
        { status: 400 }
      );
    }

    if (answer.length > 30_000) {
      return NextResponse.json(
        buildErrorPayload("UNKNOWN", requestId, "Answer text exceeds maximum allowed length of 30,000 characters."),
        { status: 400 }
      );
    }

    const cleanQuestion = typeof question === "string" ? question.slice(0, 2000) : "";

    let contextArray: string[] = [];
    if (Array.isArray(context)) {
      contextArray = context
        .slice(0, 25)
        .filter((c): c is string => typeof c === "string")
        .map((c) => c.slice(0, 50_000));
    } else if (typeof context === "string" && context.trim()) {
      contextArray = [context.slice(0, 50_000)];
    }

    const audit = await auditWithLettuceDetect(
      cleanQuestion,
      answer.trim(),
      contextArray
    );

    return NextResponse.json({
      success: true,
      audit,
    });
  } catch (error) {
    return buildErrorResponse(error, requestId, "LettuceDetect");
  }
}
