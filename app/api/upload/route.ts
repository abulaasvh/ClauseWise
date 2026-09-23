import { NextRequest, NextResponse } from "next/server";
import { parsePdfBuffer, parseDocxBuffer, chunkDocumentText } from "@/lib/parsing";
import { fallbackClauseAnalysis } from "@/lib/claude";
import { saveDocument } from "@/lib/docstore";
import { getVectorStore } from "@/lib/vectorstore";
import { ClauseAnalysis, ParsedDocument } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const directText = formData.get("text") as string | null;
    const documentName = (formData.get("title") as string | null) || "Uploaded Document";

    let rawText = "";
    let fileName = file ? file.name : `${documentName}.txt`;
    let fileType: "pdf" | "docx" | "text" = "text";

    if (file) {
      const lowerName = file.name.toLowerCase();
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (lowerName.endsWith(".pdf")) {
        fileType = "pdf";
        const res = await parsePdfBuffer(buffer);
        rawText = res.text;
      } else if (lowerName.endsWith(".docx")) {
        fileType = "docx";
        const res = await parseDocxBuffer(buffer);
        rawText = res.text;
      } else {
        fileType = "text";
        rawText = buffer.toString("utf-8");
      }
    } else if (directText && directText.trim()) {
      rawText = directText;
      fileType = "text";
    } else {
      return NextResponse.json(
        { error: "No document file or text content provided." },
        { status: 400 }
      );
    }

    if (!rawText || rawText.trim().length === 0) {
      return NextResponse.json(
        { error: "Could not extract readable text from this document." },
        { status: 422 }
      );
    }

    // Chunk by section / clause boundaries
    const chunks = chunkDocumentText(rawText);
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "Document is empty or could not be partitioned into clauses." },
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
    console.error("Upload route error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to process document." },
      { status: 500 }
    );
  }
}
