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

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const { documentId, clauseId, sectionNumber, title, text } = await request.json();

    if (!text || !clauseId) {
      return NextResponse.json(
        { error: "clauseId and text are required for clause analysis." },
        { status: 400 }
      );
    }

    const analysis = await analyzeClauseWithClaude(
      clauseId,
      sectionNumber || "",
      title || "",
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
