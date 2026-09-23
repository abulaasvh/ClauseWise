import { NextRequest, NextResponse } from "next/server";
import { getVectorStore } from "@/lib/vectorstore";
import { getDocumentAsync } from "@/lib/docstore";
import { answerGroundedQuestion, extractReferencedCitations } from "@/lib/claude";
import { Citation } from "@/lib/types";
import { auditWithLettuceDetect } from "@/lib/lettucedetect";

export async function POST(request: NextRequest) {
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

    const store = getVectorStore(documentId);
    // If vector store is empty, index from chunks (using cached vectors)
    if (store.getAll().length === 0 && doc.chunks.length > 0) {
      await store.indexChunks(doc.chunks);
    } else {
      console.log(`[VECTORSTORE] Using ${store.getAll().length} cached embeddings, 0 new`);
    }

    // Retrieve top 2-3 relevant chunks for single-fact lookups
    // (reduced from 4 to prevent semantically-close but irrelevant chunks like "Term" vs "Rent" from leaking)
    let searchResults = await store.search(question, 3);

    // If 3 chunks were returned and the 3rd chunk is significantly less relevant than the top match,
    // prune to top 2 to keep context sharp for single-fact lookups
    if (
      searchResults.length === 3 &&
      searchResults[0].score > 0.35 &&
      searchResults[2].score < searchResults[0].score * 0.55
    ) {
      console.log(`[RETRIEVAL PRUNING] Pruned 3rd chunk (${searchResults[2].chunk.sectionNumber} - ${searchResults[2].chunk.title}) due to score dropoff (${searchResults[2].score.toFixed(4)} vs top ${searchResults[0].score.toFixed(4)})`);
      searchResults = searchResults.slice(0, 2);
    }

    const excerpts = searchResults.map((r) => ({
      clauseId: r.chunk.id,
      sectionNumber: r.chunk.sectionNumber,
      title: r.chunk.title,
      text: r.chunk.text,
      score: r.score,
    }));

    console.log(`[RETRIEVAL -> LLM] Final list of chunks passed to LLM (${excerpts.length} chunk(s)):`);
    excerpts.forEach((e, i) => {
      console.log(`  [Chunk ${i + 1}] ${e.sectionNumber} - ${e.title} (score: ${e.score.toFixed(4)})`);
    });

    // Generate grounded answer using Claude/Gemini (with populated system prompt in relevance order)
    const answer = await answerGroundedQuestion(
      question,
      excerpts.map((e) => ({
        sectionNumber: e.sectionNumber,
        title: e.title,
        text: e.text,
      }))
    );

    // Derive citations strictly from what the model actually references in its answer text
    const citations: Citation[] = extractReferencedCitations(answer, excerpts);

    // Audit generated answer for hallucinations using LettuceDetect
    const contextTexts = excerpts.map((e) => `[${e.sectionNumber} - ${e.title}]\n${e.text}`);
    const hallucination = await auditWithLettuceDetect(question, answer, contextTexts);

    return NextResponse.json({
      answer,
      citations,
      hallucination,
    });
  } catch (error) {
    console.error("Chat route error:", error);
    const errMsg = (error as Error).message || "AI service temporarily unavailable, please try again.";
    return NextResponse.json(
      { error: errMsg },
      { status: 503 }
    );
  }
}
