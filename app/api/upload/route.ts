import { NextRequest, NextResponse } from "next/server";
import { parsePdfBuffer, parseDocxBuffer, chunkDocumentText } from "@/lib/parsing";
import { fallbackClauseAnalysis } from "@/lib/claude";
import { saveDocument } from "@/lib/docstore";
import { getVectorStore } from "@/lib/vectorstore";
import { ClauseAnalysis, ParsedDocument } from "@/lib/types";
import {
  generateRequestId,
  buildErrorPayload,
  buildErrorResponse,
} from "@/lib/errors";
import { checkRateLimit, buildRateLimitResponse } from "@/lib/ratelimit";
import {
  validateUploadFile,
  validateFileMagicBytes,
} from "@/lib/validation";

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  // ── 1. Per-IP Rate Limiting (20 requests/hour for uploads) ─────────────────
  const rateLimitResult = checkRateLimit(request, {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
    route: "upload",
  });
  if (!rateLimitResult.success) {
    return buildRateLimitResponse(rateLimitResult, requestId);
  }

  try {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        buildErrorPayload("UNKNOWN", requestId, "Invalid multipart form data."),
        { status: 400 }
      );
    }

    const file = formData.get("file") as File | null;
    const directText = formData.get("text") as string | null;
    const rawTitle = formData.get("title") as string | null;
    const documentName = (rawTitle && rawTitle.slice(0, 200).trim()) || "Uploaded Document";

    // ── 2. Input Validation: File size, MIME type, Extension ──────────────────
    const fileValidation = validateUploadFile(file, directText);
    if (!fileValidation.valid) {
      return NextResponse.json(
        buildErrorPayload("UNKNOWN", requestId, fileValidation.error),
        { status: fileValidation.statusCode }
      );
    }

    let rawText = "";
    let fileName = file ? fileValidation.data.fileName : `${documentName}.txt`;
    const fileType = fileValidation.data.fileType;

    if (file) {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Validate magic bytes to verify content matches declared type
      const magicCheck = validateFileMagicBytes(buffer, fileType);
      if (!magicCheck.valid) {
        return NextResponse.json(
          buildErrorPayload("UNKNOWN", requestId, magicCheck.error),
          { status: magicCheck.statusCode }
        );
      }

      if (fileType === "pdf") {
        const res = await parsePdfBuffer(buffer);
        rawText = res.text;
      } else if (fileType === "docx") {
        const res = await parseDocxBuffer(buffer);
        rawText = res.text;
      } else {
        rawText = buffer.toString("utf-8");
      }
    } else if (directText && directText.trim()) {
      rawText = directText.trim();
    }

    if (!rawText || rawText.trim().length === 0) {
      return NextResponse.json(
        buildErrorPayload(
          "UNKNOWN",
          requestId,
          "Could not extract readable text from this document."
        ),
        { status: 422 }
      );
    }

    // Chunk by section / clause boundaries
    const chunks = chunkDocumentText(rawText);
    if (chunks.length === 0) {
      return NextResponse.json(
        buildErrorPayload(
          "UNKNOWN",
          requestId,
          "Document is empty or could not be partitioned into clauses."
        ),
        { status: 422 }
      );
    }

    const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const analyses: Record<string, ClauseAnalysis> = {};

    let highRisk = 0;
    let mediumRisk = 0;
    let lowRisk = 0;
    const categoriesSet = new Set<string>();

    for (const chunk of chunks) {
      const analysis = fallbackClauseAnalysis(
        chunk.id,
        chunk.sectionNumber,
        chunk.title,
        chunk.text
      );
      analyses[chunk.id] = analysis;
      categoriesSet.add(analysis.category);

      if (analysis.risk_level === "HIGH") highRisk++;
      else if (analysis.risk_level === "MEDIUM") mediumRisk++;
      else lowRisk++;
    }

    const doc: ParsedDocument = {
      id: docId,
      fileName,
      fileType,
      uploadedAt: new Date().toISOString(),
      rawText,
      chunks,
      analyses,
      stats: {
        totalClauses: chunks.length,
        highRisk,
        mediumRisk,
        lowRisk,
        categories: Array.from(categoriesSet),
      },
    };

    // Index chunks in vector store (computes embeddings once at upload time and caches on chunk)
    const store = getVectorStore(docId);
    await store.indexChunks(chunks);

    // Save in document store (persisting chunks with their cached embeddings)
    saveDocument(doc);

    return NextResponse.json({
      success: true,
      document: doc,
    });
  } catch (error) {
    return buildErrorResponse(error, requestId, "Upload");
  }
}
