import { NextRequest, NextResponse } from "next/server";
import { getVectorStore } from "@/lib/vectorstore";
import { getDocumentAsync } from "@/lib/docstore";
import { answerGroundedQuestion, extractReferencedCitations } from "@/lib/claude";
import { Citation } from "@/lib/types";
import { auditWithLettuceDetect } from "@/lib/lettucedetect";
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
    const { documentId, question } = await request.json();

    if (!documentId || !question || !question.trim()) {
      return NextResponse.json(
        { error: "documentId and question are required." },
        { status: 400 }
      );
    }

    const doc = await getDocumentAsync(documentId);
    if (!doc) {
      return NextResponse.json(
        { error: "Document not found in storage. Please re-open or re-upload the document." },
        { status: 404 }
      );
    }

    // ── Embedding / vector-search step ───────────────────────────────────────
    // Wrap separately so embedding failures surface as EMBEDDING_FAILED,
    // not as a generic UNKNOWN from the outer catch.
    let searchResults: Awaited<ReturnType<typeof store.search>>;
    const store = getVectorStore(documentId);
    try {
      if (store.getAll().length === 0 && doc.chunks.length > 0) {
        await store.indexChunks(doc.chunks);
      } else {
        console.log(`[VECTORSTORE] [${requestId}] Using ${store.getAll().length} cached embeddings, 0 new`);
      }

      // Retrieve top 2-3 relevant chunks for single-fact lookups
      searchResults = await store.search(question, 3);

      // Prune low-relevance 3rd chunk when top match is significantly stronger
      if (
        searchResults.length === 3 &&
        searchResults[0].score > 0.35 &&
        searchResults[2].score < searchResults[0].score * 0.55
      ) {
        console.log(
          `[RETRIEVAL PRUNING] [${requestId}] Pruned 3rd chunk (${searchResults[2].chunk.sectionNumber} - ${searchResults[2].chunk.title}) due to score dropoff (${searchResults[2].score.toFixed(4)} vs top ${searchResults[0].score.toFixed(4)})`
        );
        searchResults = searchResults.slice(0, 2);
      }
    } catch (embErr) {
      const category = classifyError(embErr);
      logServerError(category, requestId, "VectorStore/Embedding", embErr);
      const payload = buildErrorPayload(category, requestId);
      return NextResponse.json(payload, { status: CATEGORY_HTTP_STATUS[category] });
    }

    const excerpts = searchResults.map((r) => ({
      clauseId: r.chunk.id,
      sectionNumber: r.chunk.sectionNumber,
      title: r.chunk.title,
      text: r.chunk.text,
      score: r.score,
    }));

    console.log(`[RETRIEVAL -> LLM] [${requestId}] Final list of chunks passed to LLM (${excerpts.length} chunk(s)):`);
    excerpts.forEach((e, i) => {
      console.log(`  [Chunk ${i + 1}] ${e.sectionNumber} - ${e.title} (score: ${e.score.toFixed(4)})`);
    });

    // ── LLM generation ────────────────────────────────────────────────────────
    const answer = await answerGroundedQuestion(
      question,
      excerpts.map((e) => ({
        sectionNumber: e.sectionNumber,
        title: e.title,
        text: e.text,
      }))
    );

    // Derive citations strictly from what the model actually references
    const citations: Citation[] = extractReferencedCitations(answer, excerpts);

    // Audit for hallucinations using LettuceDetect
    const contextTexts = excerpts.map((e) => `[${e.sectionNumber} - ${e.title}]\n${e.text}`);
    const hallucination = await auditWithLettuceDetect(question, answer, contextTexts);

    return NextResponse.json({ answer, citations, hallucination });

  } catch (error) {
    const category = classifyError(error);
    logServerError(category, requestId, "Chat/LLM", error);
    const payload = buildErrorPayload(category, requestId);
    return NextResponse.json(payload, { status: CATEGORY_HTTP_STATUS[category] });
  }
}
