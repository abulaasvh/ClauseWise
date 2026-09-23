import Anthropic from "@anthropic-ai/sdk";
import { ClauseAnalysis, RiskLevel, Citation } from "./types";
import { generateWithGemini, generateWithResilientLLM } from "./gemini";

/**
 * EXACT SYSTEM PROMPT FOR CLAUSE SIMPLIFICATION (as required)
 */
export const CLAUSE_SIMPLIFICATION_SYSTEM_PROMPT = `You are a legal document assistant helping a non-lawyer understand
a document. You do not give legal advice or judge enforceability.

For the clause provided, return ONLY valid JSON with this shape:
{
  "category": string,
  "plain_summary": string (9th-grade reading level, preserve exact
    figures/dates/defined terms verbatim),
  "risk_level": "LOW" | "MEDIUM" | "HIGH",
  "risk_reason": string (what obligation, penalty, or ambiguity
    creates this risk — factual, not advisory),
  "key_terms": string[] (defined terms or figures worth flagging)
}

Never speculate beyond what the clause states. If the clause is
boilerplate/low-risk, say so plainly rather than manufacturing
concern.`;

/**
 * EXACT SYSTEM PROMPT FOR GROUNDED Q&A CHAT (as required)
 */
export const GROUNDED_QA_SYSTEM_PROMPT = `You are ClauseWise, a document assistant that answers questions using
ONLY the retrieved excerpts provided below. You are not a lawyer and do
not give legal advice.

RETRIEVED EXCERPTS:
{{ranked_chunks_with_section_labels}}
(ordered by relevance — the first excerpt is the most likely to contain
the answer; do not treat lower-ranked excerpts as equally authoritative)

USER QUESTION:
{{user_question}}

HOW TO ANSWER:

1. Identify which excerpt(s) actually address the question. If the
   top-ranked excerpt doesn't answer it but a lower-ranked one does, use
   the one that answers it — relevance rank is a hint, not a rule.

2. Give the direct answer FIRST, in one or two sentences, using the
   exact figures, dates, and terms from the excerpt. Do not describe the
   clause in the abstract — compute or state the specific answer.
   Example: if asked "how much is the late fee at 10 days late" and the
   clause says "$150 plus $25/day after the 5th," calculate and state:
   "$275 ($150 flat fee + $25 × 5 additional days)."

3. After the direct answer, cite the exact section it came from
   (e.g. "Source: Section 2, Rent"). Cite ONLY the section(s) you
   actually used to construct the answer — never list a section in your
   citation that your answer doesn't draw from.

4. If NONE of the retrieved excerpts answer the question, say so
   explicitly: "This document doesn't address [topic]." Do not cite
   unrelated sections and do not suggest checking "supplementary
   exhibits" or other materials that don't exist — if nothing in the
   provided document covers it, say that plainly.

5. SCOPE CHECK — before answering, determine if the question is asking
   for a legal judgment or jurisdiction-specific determination rather
   than what the document says. This includes questions about: legality
   in a specific state/jurisdiction, enforceability, whether a clause is
   "fair" or "standard," or what the user "should" do.
   For these, do not quote a tangentially related clause as if it
   answers the question. Instead respond:
   "This document can't tell you whether [topic] — that depends on
   [state/jurisdiction] law and requires a licensed attorney. What I can
   tell you is what this document itself says about [related clause,
   if any exists]: [brief factual description, if relevant]."

6. Never use filler phrases like "the language outlines specific
   procedural requirements," "key factual elements identified," or
   "governed under Section X" as a substitute for an actual answer.
   Every response must contain a real fact, number, or explicit
   scope-decline — never a vague summary of a clause's existence.

7. End every substantive answer with: "This is informational, not
   legal advice." Skip this line only for pure scope-decline answers
   that already made that clear.

FORMAT:
Direct answer (with figures/terms) → Source citation (only what you
actually used) → [disclaimer line if applicable]`;

/**
 * SYSTEM PROMPT FOR DOCUMENT COMPARISON
 */
export const DOCUMENT_COMPARISON_SYSTEM_PROMPT = `You are an expert legal document analyst comparing two clauses from different contract versions for a non-lawyer.
You do not provide legal advice or recommend which to sign.

Compare the two clauses provided and return ONLY valid JSON with this shape:
{
  "category": string,
  "doc_a_summary": string,
  "doc_b_summary": string,
  "whats_different": string,
  "which_favors_whom_and_why": string
}

Be precise about numerical thresholds, notice periods, liability caps, and asymmetric burdens. State factually which party benefits from the changes.`;

/**
 * Guardrail post-processing filter to strip out or rewrite prescriptive statements
 * such as "you should sign", "you must agree", "this is illegal", "this is unenforceable".
 */
export function applyGuardrailSafetyFilter(text: string): string {
  if (!text) return text;

  let sanitized = text;

  // Catch prescriptive recommendations
  const replacements: [RegExp, string][] = [
    [/\byou should sign\b/gi, "parties typically evaluate this with counsel"],
    [/\byou shouldn't sign\b/gi, "this provision warrants review with an attorney"],
    [/\byou should not sign\b/gi, "this provision warrants review with an attorney"],
    [/\byou must not sign\b/gi, "consultation with legal counsel is advised"],
    [/\bthis is illegal\b/gi, "this provision creates high compliance and regulatory risk"],
    [/\bthis is unenforceable\b/gi, "courts often closely scrutinize this type of provision"],
    [/\byou should refuse\b/gi, "parties often negotiate this term"],
    [/\byou need to delete\b/gi, "parties often seek to strike or revise"],
    [/\byou must accept\b/gi, "the clause is drafted as a mandatory requirement"],
    [/\byou ought to\b/gi, "a party may consider reviewing"],
  ];

  for (const [pattern, replacement] of replacements) {
    sanitized = sanitized.replace(pattern, replacement);
  }

  return sanitized;
}

/**
 * Anthropic Client instantiation helper
 */
function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === "your-anthropic-api-key") {
    return null;
  }
  return new Anthropic({ apiKey });
}

/**
 * Calls Claude to analyze and simplify a specific clause
 */
export async function analyzeClauseWithClaude(
  clauseId: string,
  sectionNumber: string,
  title: string,
  text: string
): Promise<ClauseAnalysis> {
  const client = getAnthropicClient();

  if (client) {
    try {
      const response = await client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        temperature: 0.1,
        system: CLAUSE_SIMPLIFICATION_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Analyze this clause:\n\nSection/Number: ${sectionNumber}\nTitle: ${title}\nText:\n${text}`,
          },
        ],
      });

      const responseText = response.content[0]?.type === "text" ? response.content[0].text : "";
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          clauseId,
          category: parsed.category || "General",
          plain_summary: applyGuardrailSafetyFilter(parsed.plain_summary || ""),
          risk_level: (["LOW", "MEDIUM", "HIGH"].includes(parsed.risk_level) ? parsed.risk_level : "LOW") as RiskLevel,
          risk_reason: applyGuardrailSafetyFilter(parsed.risk_reason || "Standard standard contract provision."),
          key_terms: Array.isArray(parsed.key_terms) ? parsed.key_terms : [],
        };
      }
    } catch (error) {
      console.warn("Claude API call failed or timed out, falling back:", error);
    }
  }

  // Resilient LLM: Gemini (with 429/503 retries) -> Groq fallback (llama-3.3-70b-versatile)
  try {
    const result = await generateWithResilientLLM(
      CLAUSE_SIMPLIFICATION_SYSTEM_PROMPT,
      `Analyze this clause:\n\nSection/Number: ${sectionNumber}\nTitle: ${title}\nText:\n${text}`
    );
    if (result && result.text) {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          clauseId,
          category: parsed.category || "General",
          plain_summary: applyGuardrailSafetyFilter(parsed.plain_summary || ""),
          risk_level: (["LOW", "MEDIUM", "HIGH"].includes(parsed.risk_level) ? parsed.risk_level : "LOW") as RiskLevel,
          risk_reason: applyGuardrailSafetyFilter(parsed.risk_reason || "Standard contract provision."),
          key_terms: Array.isArray(parsed.key_terms) ? parsed.key_terms : [],
        };
      }
    }
  } catch (err) {
    console.warn("Resilient LLM clause analysis failed:", err);
    throw err;
  }

  throw new Error("AI service temporarily unavailable, please try again.");
}

/**
 * Intelligent deterministic fallback analysis engine
 * Accurately classifies contract clauses by category, risk level, plain summary, and key terms
 */
export function fallbackClauseAnalysis(
  clauseId: string,
  sectionNumber: string,
  title: string,
  text: string
): ClauseAnalysis {
  const lower = (text + " " + title).toLowerCase();

  // Extract key figures and terms
  const keyTerms: string[] = [];
  const dollarMatches = text.match(/\$[0-9,]+(?:\.[0-9]{2})?|\b[0-9]+\s*(?:days|business days|months|years|percent|%)/gi);
  if (dollarMatches) {
    keyTerms.push(...Array.from(new Set(dollarMatches)).slice(0, 4));
  }
  const capitalizedTerms = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b/g);
  if (capitalizedTerms) {
    const legalKeywords = capitalizedTerms.filter(t =>
      !["The", "This", "Section", "Article", "Agreement", "Party", "Parties"].includes(t)
    );
    keyTerms.push(...Array.from(new Set(legalKeywords)).slice(0, 3));
  }

  let category = "General Provisions";
  let risk_level: RiskLevel = "LOW";
  let plain_summary = "";
  let risk_reason = "Standard boilerplate provision without immediate asymmetric exposure.";

  if (lower.includes("indemnif") || lower.includes("hold harmless") || lower.includes("defend and hold")) {
    category = "Indemnification";
    risk_level = "HIGH";
    plain_summary = "One party promises to cover legal fees, damages, and third-party claims incurred by the other party.";
    risk_reason = "Imposes broad financial liability to reimburse third-party lawsuits and attorney fees without a fixed dollar limit.";
  } else if (lower.includes("limitation of liability") || lower.includes("consequential damages") || lower.includes("aggregate liability") || lower.includes("exceed")) {
    category = "Liability & Damages";
    risk_level = lower.includes("unlimited") || lower.includes("sole remedy") ? "HIGH" : "MEDIUM";
    plain_summary = "Caps the maximum amount of financial damages either party can recover if a dispute or breach occurs.";
    risk_reason = "Restricts the financial compensation available in the event of default or significant service downtime.";
  } else if (lower.includes("terminat") || lower.includes("cure period") || lower.includes("material breach")) {
    category = "Termination";
    risk_level = lower.includes("immediate") || lower.includes("for convenience") ? "HIGH" : "MEDIUM";
    plain_summary = "Explains how, when, and with what prior notice either party can end the contract.";
    risk_reason = "Defines notice requirements, cure windows, and whether a party can cancel without cause.";
  } else if (lower.includes("auto-renew") || lower.includes("automatic renewal") || lower.includes("successive terms") || lower.includes("renew automatically")) {
    category = "Auto-Renewal & Term";
    risk_level = "HIGH";
    plain_summary = "The contract automatically renews for another term unless written cancellation is provided within the specified advance notice window.";
    risk_reason = "Risk of unexpected multi-month or annual lock-in and billing if cancellation window is missed.";
  } else if (lower.includes("payment") || lower.includes("fee") || lower.includes("invoice") || lower.includes("late fee") || lower.includes("net 30")) {
    category = "Payment & Pricing";
    risk_level = lower.includes("interest") || lower.includes("non-refundable") ? "MEDIUM" : "LOW";
    plain_summary = "Outlines invoicing schedule, due dates, taxes, and any late payment interest charges.";
    risk_reason = "Outlines exact payment obligations and penalties for delayed wire or ACH settlements.";
  } else if (lower.includes("confidential") || lower.includes("non-disclosure") || lower.includes("proprietary information")) {
    category = "Confidentiality";
    risk_level = lower.includes("indefinite") || lower.includes("in perpetuity") ? "MEDIUM" : "LOW";
    plain_summary = "Requires both parties to keep shared business, customer, and technical information strictly secret.";
    risk_reason = "Obligates rigorous data protection and non-disclosure extending during and after contract term.";
  } else if (lower.includes("intellectual property") || lower.includes("work made for hire") || lower.includes("patent") || lower.includes("copyright") || lower.includes("ownership of deliverables")) {
    category = "Intellectual Property";
    risk_level = lower.includes("assign") || lower.includes("exclusive") ? "HIGH" : "MEDIUM";
    plain_summary = "Specifies who owns pre-existing assets, newly created software, documentation, and inventions.";
    risk_reason = "Determines permanent transfer or licensing rights over valuable work product and tools.";
  } else if (lower.includes("non-compete") || lower.includes("non-solicit") || lower.includes("restrictive covenant")) {
    category = "Restrictive Covenants";
    risk_level = "HIGH";
    plain_summary = "Restricts the ability to hire employees, solicit clients, or engage in competing commercial activities.";
    risk_reason = "Limits business operations, customer outreach, and hiring capabilities for a stated geographical radius or duration.";
  } else if (lower.includes("governing law") || lower.includes("jurisdiction") || lower.includes("arbitration") || lower.includes("venue")) {
    category = "Governing Law & Disputes";
    risk_level = lower.includes("mandatory arbitration") || lower.includes("waive jury") ? "MEDIUM" : "LOW";
    plain_summary = "Designates which state's laws govern disputes and what court or arbitration venue must be used.";
    risk_reason = "Dictates litigation venue, requiring travel or arbitration and potentially waiving trial rights.";
  } else if (lower.includes("warranty") || lower.includes("as is") || lower.includes("disclaimer of warranties")) {
    category = "Warranties & Disclaimers";
    risk_level = lower.includes("as is") || lower.includes("without warranty") ? "MEDIUM" : "LOW";
    plain_summary = "States what quality or performance promises are guaranteed, or disclaims all implied warranties.";
    risk_reason = "Disclaims performance guarantees, transferring operational performance risks to the buyer.";
  } else {
    plain_summary = `Defines formal operating conditions, notices, or definitions under ${sectionNumber || "this section"}.`;
    risk_level = "LOW";
    risk_reason = "Standard contractual clause governing ongoing administration.";
  }

  return {
    clauseId,
    category,
    plain_summary: applyGuardrailSafetyFilter(plain_summary),
    risk_level,
    risk_reason: applyGuardrailSafetyFilter(risk_reason),
    key_terms: keyTerms.length > 0 ? keyTerms : [title || sectionNumber],
  };
}

/**
 * Formats retrieved excerpts in relevance order with section labels
 */
export function formatRankedChunks(
  excerpts: { sectionNumber: string; title: string; text: string }[]
): string {
  if (!excerpts || excerpts.length === 0) {
    return "[No matching excerpts found in document]";
  }

  return excerpts
    .map((e, idx) => {
      const sectionLabel = [e.sectionNumber, e.title].filter(Boolean).join(", ");
      return `[Excerpt ${idx + 1}] (${sectionLabel || "Unlabeled Section"}):\n"${e.text.trim()}"`;
    })
    .join("\n\n");
}

/**
 * Builds the complete grounded Q&A system prompt by populating
 * {{ranked_chunks_with_section_labels}} and {{user_question}} in relevance order
 */
export function buildGroundedQASystemPrompt(
  question: string,
  retrievedExcerpts: { sectionNumber: string; title: string; text: string }[]
): string {
  const rankedChunks = formatRankedChunks(retrievedExcerpts);
  return GROUNDED_QA_SYSTEM_PROMPT
    .replace("{{ranked_chunks_with_section_labels}}", () => rankedChunks)
    .replace("{{user_question}}", () => question.trim());
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Derives structured citations strictly from what the model references in its answer text,
 * ensuring citations always match the content quoted or cited.
 */
export function extractReferencedCitations(
  answer: string,
  candidateExcerpts: {
    clauseId: string;
    sectionNumber: string;
    title: string;
    text: string;
    score?: number;
  }[]
): Citation[] {
  if (!answer || !candidateExcerpts || candidateExcerpts.length === 0) {
    return [];
  }

  // Pure scope-decline or unaddressed check without Source citation
  const doesNotAddress = /this document (?:doesn't|does not|cannot|can't) address/i.test(answer);

  // Extract explicit Source / Citation lines
  const citationLines: string[] = [];
  for (const line of answer.split("\n")) {
    const trimmed = line.trim();
    if (/^(?:source|citation)s?\s*:/i.test(trimmed)) {
      citationLines.push(trimmed);
    }
  }

  const hasExplicitSourceLine = citationLines.length > 0;
  const combinedCitationText = citationLines.join(" ");

  // If the model stated the document doesn't address the topic and gave no Source line, return empty
  if (doesNotAddress && !hasExplicitSourceLine) {
    return [];
  }

  const matched: Citation[] = [];

  for (let idx = 0; idx < candidateExcerpts.length; idx++) {
    const excerpt = candidateExcerpts[idx];
    if (checkExcerptReferenced(excerpt, idx, answer, hasExplicitSourceLine, combinedCitationText)) {
      matched.push({
        clauseId: excerpt.clauseId,
        sectionNumber: excerpt.sectionNumber,
        title: excerpt.title,
        snippet: excerpt.text.slice(0, 160).trim() + "...",
      });
    }
  }

  return matched;
}

function checkExcerptReferenced(
  excerpt: { sectionNumber: string; title: string; text: string },
  excerptIndex: number,
  answer: string,
  hasExplicitSourceLine: boolean,
  combinedCitationText: string
): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

  const rawSec = excerpt.sectionNumber ? excerpt.sectionNumber.trim() : "";
  const rawTitle = excerpt.title ? excerpt.title.trim() : "";
  const secNumOnly = rawSec.replace(/^(?:section|clause|article|sec\.?)\s*/i, "").trim();

  if (hasExplicitSourceLine) {
    const normSource = norm(combinedCitationText);

    // 1. Direct excerpt reference, e.g. "Excerpt 1"
    const excerptRefRegex = new RegExp(`\\bexcerpt\\s*${excerptIndex + 1}\\b`, "i");
    if (excerptRefRegex.test(combinedCitationText)) {
      return true;
    }

    // 2. Section number match in Source line
    if (rawSec && rawSec.length >= 2 && normSource.includes(norm(rawSec))) {
      return true;
    }
    if (secNumOnly && secNumOnly.length > 0) {
      const secRegex = new RegExp(`\\b(?:section|sec|clause|article|§)?\\s*${escapeRegex(secNumOnly)}\\b`, "i");
      if (secRegex.test(combinedCitationText)) {
        return true;
      }
    }

    // 3. Section title match in Source line (at least 3 characters)
    if (rawTitle && rawTitle.length >= 3 && normSource.includes(norm(rawTitle))) {
      return true;
    }

    return false;
  }

  // When no explicit Source line was present:
  if (/this document (?:doesn't|does not|cannot|can't) address/i.test(answer)) {
    return false;
  }

  const normAnswer = norm(answer);

  // Check section number in answer body
  if (rawSec && rawSec.length >= 2 && normAnswer.includes(norm(rawSec))) {
    return true;
  }
  if (secNumOnly && secNumOnly.length > 0) {
    const secRegex = new RegExp(`\\b(?:section|sec\\.?|clause|article|§)\\s*${escapeRegex(secNumOnly)}\\b`, "i");
    if (secRegex.test(answer)) {
      return true;
    }
  }

  // Check title in answer body (at least 4 characters)
  if (rawTitle && rawTitle.length >= 4) {
    const titleRegex = new RegExp(`\\b${escapeRegex(rawTitle)}\\b`, "i");
    if (titleRegex.test(answer)) {
      return true;
    }
  }

  // Check verbatim text overlap from excerpt (35+ consecutive characters)
  const cleanExcerpt = excerpt.text.replace(/\s+/g, " ").trim();
  if (cleanExcerpt.length >= 35) {
    const chunkSize = 35;
    for (let i = 0; i <= cleanExcerpt.length - chunkSize; i += 25) {
      const sub = cleanExcerpt.substring(i, i + chunkSize);
      if (answer.includes(sub)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Calls Claude for Grounded RAG Q&A
 */
export async function answerGroundedQuestion(
  question: string,
  retrievedExcerpts: { sectionNumber: string; title: string; text: string }[]
): Promise<string> {
  const client = getAnthropicClient();
  const systemPrompt = buildGroundedQASystemPrompt(question, retrievedExcerpts);

  console.log(`[LLM PROMPT VERIFICATION] Model prompt populated with ${retrievedExcerpts.length} excerpt(s):`);
  retrievedExcerpts.forEach((e, idx) => {
    console.log(`  [Excerpt ${idx + 1}] ${e.sectionNumber} - ${e.title}: "${e.text.slice(0, 100).replace(/\s+/g, " ")}..."`);
  });

  if (client) {
    try {
      const response = await client.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1200,
        temperature: 0.1,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: question,
          },
        ],
      });

      const responseText = response.content[0]?.type === "text" ? response.content[0].text : "";
      let cleaned = applyGuardrailSafetyFilter(responseText);
      const isScopeDecline =
        /requires a licensed attorney|that depends on .* law/i.test(cleaned) ||
        /this document (?:doesn't|does not|cannot|can't) address/i.test(cleaned);
      if (!isScopeDecline && !cleaned.includes("This is informational, not legal advice.")) {
        cleaned += "\n\nThis is informational, not legal advice.";
      }
      return cleaned;
    } catch (error) {
      console.warn("Claude Q&A failed, falling back:", error);
    }
  }

  // Resilient LLM: Gemini (with 429/503 retries) -> Groq fallback (llama-3.3-70b-versatile)
  // For conversational chat Q&A: 1 retry with a flat 1s backoff to minimize latency
  const llmResult = await generateWithResilientLLM(systemPrompt, question, {
    maxRetries: 1,
    backoffDelays: [1000],
  });
  let cleaned = applyGuardrailSafetyFilter(llmResult.text);
  const isScopeDecline =
    /requires a licensed attorney|that depends on .* law/i.test(cleaned) ||
    /this document (?:doesn't|does not|cannot|can't) address/i.test(cleaned);
  if (!isScopeDecline && !cleaned.includes("This is informational, not legal advice.")) {
    cleaned += "\n\nThis is informational, not legal advice.";
  }
  return cleaned;
}

function fallbackGroundedSynthesizer(
  question: string,
  excerpts: { sectionNumber: string; title: string; text: string }[]
): string {
  if (excerpts.length === 0) {
    return "This document doesn't address this topic.";
  }

  const primary = excerpts[0];
  const sectionLabel = [primary.sectionNumber, primary.title].filter(Boolean).join(", ") || "General";

  const lowerQ = question.toLowerCase();
  const isScopeQuery = /\b(is this legal|is it legal|enforceable|is this enforceable|is this fair|is this standard|should i sign|what should i do)\b/i.test(lowerQ);

  if (isScopeQuery) {
    const topic = primary.title || "this clause";
    return `This document can't tell you whether this is legally enforceable or standard — that depends on governing jurisdiction law and requires a licensed attorney. What I can tell you is what this document itself says about ${topic}: ${primary.text.slice(0, 200).trim()}...\n\nSource: ${sectionLabel}`;
  }

  // Direct factual answer without filler phrases
  const textSnippet = primary.text.trim();
  const previewSnippet = textSnippet.length > 250
    ? textSnippet.substring(0, 240).trim() + "..."
    : textSnippet;

  return `${previewSnippet}\n\nSource: ${sectionLabel}\n\nThis is informational, not legal advice.`;
}
