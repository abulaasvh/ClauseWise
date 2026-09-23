import { NextRequest, NextResponse } from "next/server";
import { analyzeClauseWithClaude } from "@/lib/claude";
import { getDocument, saveDocument } from "@/lib/docstore";

export async function POST(request: NextRequest) {
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
    console.error("Analyze clause route error:", error);
    const errMsg = (error as Error).message || "AI service temporarily unavailable, please try again.";
    return NextResponse.json(
      { error: errMsg },
      { status: 503 }
    );
  }
}
