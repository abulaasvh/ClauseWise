import { NextRequest, NextResponse } from "next/server";
import { analyzeClauseWithClaude } from "@/lib/claude";
import { getDocument, saveDocument } from "@/lib/docstore";
import {
  classifyError,
  logServerError,
  buildErrorPayload,
  generateRequestId,
  CATEGORY_HTTP_STATUS,
} from "@/lib/errors";
import { checkRateLimit, buildRateLimitResponse } from "@/lib/ratelimit";
import { validateAnalyzeClauseInput } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  // ── 1. Per-IP Rate Limiting (60 requests/hour for clause analysis) ──────────
  const rateLimitResult = checkRateLimit(request, {
    maxRequests: 60,
    windowMs: 60 * 60 * 1000,
    route: "analyze-clause",
  });
  if (!rateLimitResult.success) {
    return buildRateLimitResponse(rateLimitResult, requestId);
  }

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        buildErrorPayload("UNKNOWN", requestId, "Invalid JSON payload in request body."),
        { status: 400 }
      );
    }

    // ── 2. Input Validation ──────────────────────────────────────────────────
    const validation = validateAnalyzeClauseInput(body);
    if (!validation.valid) {
      return NextResponse.json(
        buildErrorPayload("UNKNOWN", requestId, validation.error),
        { status: validation.statusCode }
      );
    }

    const { documentId, clauseId, sectionNumber, title, text } = validation.data;

    const analysis = await analyzeClauseWithClaude(
      clauseId,
      sectionNumber,
      title,
      text
    );

    // If documentId is provided, update stored doc analysis cache
    if (documentId) {
      const doc = getDocument(documentId);
      if (doc) {
        doc.analyses[clauseId] = analysis;
        saveDocument(doc);
      }
    }

    return NextResponse.json({ analysis });
  } catch (error) {
    const category = classifyError(error);
    logServerError(category, requestId, "AnalyzeClause/LLM", error);
    const payload = buildErrorPayload(category, requestId);
    return NextResponse.json(payload, { status: CATEGORY_HTTP_STATUS[category] });
  }
}
