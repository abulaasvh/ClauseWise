import { NextRequest, NextResponse } from "next/server";
import { getDocument } from "@/lib/docstore";
import { cosineSimilarity, getEmbedding } from "@/lib/embeddings";
import { applyGuardrailSafetyFilter } from "@/lib/claude";
import { ClauseComparisonItem, ComparisonReport } from "@/lib/types";
import {
  classifyError,
  logServerError,
  buildErrorPayload,
  generateRequestId,
  CATEGORY_HTTP_STATUS,
} from "@/lib/errors";
import { checkRateLimit, buildRateLimitResponse } from "@/lib/ratelimit";
import { validateCompareInput } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const requestId = generateRequestId();

  // ── 1. Per-IP Rate Limiting (20 requests/hour for comparison) ──────────────
  const rateLimitResult = checkRateLimit(request, {
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
    route: "compare",
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
    const validation = validateCompareInput(body);
    if (!validation.valid) {
      return NextResponse.json(
        buildErrorPayload("UNKNOWN", requestId, validation.error),
        { status: validation.statusCode }
      );
    }

    const { docAId, docBId } = validation.data;

    const docA = getDocument(docAId);
    const docB = getDocument(docBId);

    if (!docA || !docB) {
      return NextResponse.json(
        buildErrorPayload("UNKNOWN", requestId, "One or both documents could not be found in storage."),
        { status: 404 }
      );
    }

    // Embed all clauses from both documents for semantic matching (reuse cached chunk embeddings)
    let pairsA: { chunk: (typeof docA.chunks)[0]; analysis: (typeof docA.analyses)[string]; embedding: number[] }[];
    let pairsB: { chunk: (typeof docB.chunks)[0]; analysis: (typeof docB.analyses)[string]; embedding: number[] }[];
    try {
      pairsA = await Promise.all(
        docA.chunks.map(async (chunk) => ({
          chunk,
          analysis: docA.analyses[chunk.id],
          embedding:
            chunk.embedding && chunk.embedding.length > 0
              ? chunk.embedding
              : await getEmbedding(`${chunk.title} ${chunk.text}`),
        }))
      );

      pairsB = await Promise.all(
        docB.chunks.map(async (chunk) => ({
          chunk,
          analysis: docB.analyses[chunk.id],
          embedding:
            chunk.embedding && chunk.embedding.length > 0
              ? chunk.embedding
              : await getEmbedding(`${chunk.title} ${chunk.text}`),
        }))
      );
    } catch (embErr) {
      const category = classifyError(embErr);
      logServerError(category, requestId, "Compare/Embedding", embErr);
      const payload = buildErrorPayload(category, requestId);
      return NextResponse.json(payload, { status: CATEGORY_HTTP_STATUS[category] });
    }

    const matchedBIndices = new Set<number>();
    const comparisonItems: ClauseComparisonItem[] = [];

    // For each clause in Doc A, find the closest semantic counterpart in Doc B
    for (const itemA of pairsA) {
      let bestMatchIdx = -1;
      let highestSim = -1;

      for (let j = 0; j < pairsB.length; j++) {
        if (matchedBIndices.has(j)) continue;
        const sim = cosineSimilarity(itemA.embedding, pairsB[j].embedding);
        if (sim > highestSim) {
          highestSim = sim;
          bestMatchIdx = j;
        }
      }

      // Threshold for considering a clause a "match" across documents
      if (bestMatchIdx !== -1 && highestSim > 0.45) {
        matchedBIndices.add(bestMatchIdx);
        const itemB = pairsB[bestMatchIdx];

        // Synthesize comparison analysis
        const comparisonAnalysis = analyzeClausePair(
          itemA.chunk.sectionNumber,
          itemA.chunk.title,
          itemA.chunk.text,
          itemB.chunk.sectionNumber,
          itemB.chunk.title,
          itemB.chunk.text,
          itemA.analysis?.category || itemB.analysis?.category || "Contract Term"
        );

        comparisonItems.push({
          id: `match-${itemA.chunk.id}-${itemB.chunk.id}`,
          category: itemA.analysis?.category || itemB.analysis?.category || "General",
          clauseA: itemA.chunk,
          clauseB: itemB.chunk,
          status: "both",
          doc_a_summary: comparisonAnalysis.doc_a_summary,
          doc_b_summary: comparisonAnalysis.doc_b_summary,
          whats_different: comparisonAnalysis.whats_different,
          which_favors_whom_and_why: comparisonAnalysis.which_favors_whom_and_why,
          riskImpact: comparisonAnalysis.riskImpact,
        });
      } else {
        // Clause exists in A, missing or significantly omitted in B
        const cat = itemA.analysis?.category || "General";
        comparisonItems.push({
          id: `onlyA-${itemA.chunk.id}`,
          category: cat,
          clauseA: itemA.chunk,
          status: "only_in_a",
          doc_a_summary: itemA.analysis?.plain_summary || itemA.chunk.text.slice(0, 180),
          doc_b_summary: "Not present in Document B (omitted or eliminated).",
          whats_different: `Clause is present in ${docA.fileName} under ${itemA.chunk.sectionNumber}, but entirely missing in ${docB.fileName}.`,
          which_favors_whom_and_why: "Missing protections or obligations may unilaterally benefit one party depending on who held the duty.",
          riskImpact: "SIGNIFICANT_CHANGE",
        });
      }
    }

    // Add remaining clauses in Doc B that had no match in Doc A
    for (let j = 0; j < pairsB.length; j++) {
      if (!matchedBIndices.has(j)) {
        const itemB = pairsB[j];
        const cat = itemB.analysis?.category || "General";
        comparisonItems.push({
          id: `onlyB-${itemB.chunk.id}`,
          category: cat,
          clauseB: itemB.chunk,
          status: "only_in_b",
          doc_a_summary: "Not present in Document A.",
          doc_b_summary: itemB.analysis?.plain_summary || itemB.chunk.text.slice(0, 180),
          whats_different: `New provision introduced in ${docB.fileName} under ${itemB.chunk.sectionNumber} that does not appear in ${docA.fileName}.`,
          which_favors_whom_and_why: `Introduces a new condition or restriction (${cat}) not contemplated in the original draft.`,
          riskImpact: "SIGNIFICANT_CHANGE",
        });
      }
    }

    const matchedCount = comparisonItems.filter((i) => i.status === "both").length;
    const onlyInACount = comparisonItems.filter((i) => i.status === "only_in_a").length;
    const onlyInBCount = comparisonItems.filter((i) => i.status === "only_in_b").length;

    const report: ComparisonReport = {
      docA: { id: docA.id, name: docA.fileName },
      docB: { id: docB.id, name: docB.fileName },
      summary: `Identified ${matchedCount} aligned clauses, ${onlyInACount} clauses unique to Doc A, and ${onlyInBCount} new additions in Doc B.`,
      totalClausesA: docA.chunks.length,
      totalClausesB: docB.chunks.length,
      matchedCount,
      onlyInACount,
      onlyInBCount,
      pairs: comparisonItems,
    };

    return NextResponse.json({ report });
  } catch (error) {
    const category = classifyError(error);
    logServerError(category, requestId, "Compare/LLM", error);
    const payload = buildErrorPayload(category, requestId);
    return NextResponse.json(payload, { status: CATEGORY_HTTP_STATUS[category] });
  }
}

/**
 * Deterministic comparative analysis generator between two clauses
 */
function analyzeClausePair(
  numA: string,
  titleA: string,
  textA: string,
  numB: string,
  titleB: string,
  textB: string,
  category: string
): {
  doc_a_summary: string;
  doc_b_summary: string;
  whats_different: string;
  which_favors_whom_and_why: string;
  riskImpact: "FAVORS_A" | "FAVORS_B" | "NEUTRAL" | "SIGNIFICANT_CHANGE";
} {
  const normA = textA.replace(/\s+/g, " ").trim();
  const normB = textB.replace(/\s+/g, " ").trim();

  if (normA === normB) {
    return {
      doc_a_summary: `Standard clause under ${numA}: ${textA.slice(0, 140)}...`,
      doc_b_summary: `Identical text under ${numB}.`,
      whats_different: "Verbatim identical language between both drafts.",
      which_favors_whom_and_why: "Neutral: neither party altered the risk allocation in this provision.",
      riskImpact: "NEUTRAL",
    };
  }

  // Detect specific numbers / days / liability differences
  const daysMatchA = textA.match(/([0-9]+)\s*(?:calendar\s*)?(?:business\s*)?days/i);
  const daysMatchB = textB.match(/([0-9]+)\s*(?:calendar\s*)?(?:business\s*)?days/i);

  const dollarMatchA = textA.match(/\$[0-9,]+/);
  const dollarMatchB = textB.match(/\$[0-9,]+/);

  let difference = `Draft A (${numA}) and Draft B (${numB}) show substantive wording modifications.`;
  let favored = "Altered obligations modify procedural rights for both parties.";
  let impact: "FAVORS_A" | "FAVORS_B" | "NEUTRAL" | "SIGNIFICANT_CHANGE" = "SIGNIFICANT_CHANGE";

  if (daysMatchA && daysMatchB && daysMatchA[1] !== daysMatchB[1]) {
    const daysA = parseInt(daysMatchA[1]);
    const daysB = parseInt(daysMatchB[1]);
    difference = `Notice/cure period changed from ${daysA} days in Doc A to ${daysB} days in Doc B.`;
    favored = daysB > daysA
      ? `Favors the responding party by providing an extended ${daysB}-day window to cure or respond.`
      : `Favors the notifying party by tightening the window to ${daysB} days.`;
    impact = daysB > daysA ? "FAVORS_B" : "FAVORS_A";
  } else if (dollarMatchA || dollarMatchB) {
    difference = `Monetary threshold or liability cap altered: Doc A mentions ${dollarMatchA ? dollarMatchA[0] : "none"} vs Doc B mentions ${dollarMatchB ? dollarMatchB[0] : "none"}.`;
    favored = "Alters maximum financial exposure and indemnification recovery limits.";
    impact = "SIGNIFICANT_CHANGE";
  } else if (textB.length < textA.length * 0.6) {
    difference = "Doc B significantly condensed or removed protections found in Doc A.";
    favored = "Omission of detailed covenants typically shifts discretionary power to the drafting vendor.";
    impact = "FAVORS_B";
  } else if (textB.toLowerCase().includes("sole remedy") || textB.toLowerCase().includes("disclaims all")) {
    difference = "Doc B adds restrictive disclaimers and limits remedies to sole remedy clauses.";
    favored = "Favors the providing vendor by limiting Customer recourse in the event of default.";
    impact = "FAVORS_B";
  }

  return {
    doc_a_summary: applyGuardrailSafetyFilter(`Doc A (${numA} - ${titleA}): ${textA.slice(0, 160).trim()}...`),
    doc_b_summary: applyGuardrailSafetyFilter(`Doc B (${numB} - ${titleB}): ${textB.slice(0, 160).trim()}...`),
    whats_different: applyGuardrailSafetyFilter(difference),
    which_favors_whom_and_why: applyGuardrailSafetyFilter(favored),
    riskImpact: impact,
  };
}
