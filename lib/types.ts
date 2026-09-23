export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ClauseChunk {
  id: string;
  sectionNumber: string;
  title: string;
  text: string;
  pageNumber?: number;
  order: number;
  embedding?: number[];
}

export interface ClauseAnalysis {
  clauseId: string;
  category: string;
  plain_summary: string;
  risk_level: RiskLevel;
  risk_reason: string;
  key_terms: string[];
}

export interface ParsedDocument {
  id: string;
  fileName: string;
  fileType: "pdf" | "docx" | "text";
  uploadedAt: string;
  rawText: string;
  chunks: ClauseChunk[];
  analyses: Record<string, ClauseAnalysis>;
  stats: {
    totalClauses: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    categories: string[];
  };
}

export interface Citation {
  clauseId: string;
  sectionNumber: string;
  title: string;
  snippet: string;
}

export interface HallucinatedSpan {
  start: number;
  end: number;
  text: string;
  confidence: number;
}

export interface HallucinationAudit {
  score: number; // 0 to 100 (100 = completely faithful, 0 = pure hallucination)
  hallucinationRate: number; // 0 to 100%
  riskLevel: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  spans: HallucinatedSpan[];
  supportedClaims: string[];
  unsupportedSpans: string[];
  modelUsed: string;
  verdictSummary: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  hallucination?: HallucinationAudit;
  timestamp: string;
  /** Set to true when this message represents an API/AI error rather than a real answer */
  isApiError?: boolean;
  /** The ErrorCategory returned by the server (e.g. "QUOTA_EXCEEDED") */
  errorCategory?: string;
  /** The requestId from the server for log correlation */
  errorRequestId?: string;
}

export interface ClauseComparisonItem {
  id: string;
  category: string;
  clauseA?: ClauseChunk;
  clauseB?: ClauseChunk;
  doc_a_summary: string;
  doc_b_summary: string;
  whats_different: string;
  which_favors_whom_and_why: string;
  status: "both" | "only_in_a" | "only_in_b";
  riskImpact?: "FAVORS_A" | "FAVORS_B" | "NEUTRAL" | "SIGNIFICANT_CHANGE";
}

export interface ComparisonReport {
  docA: { id: string; name: string };
  docB: { id: string; name: string };
  summary: string;
  totalClausesA: number;
  totalClausesB: number;
  matchedCount: number;
  onlyInACount: number;
  onlyInBCount: number;
  pairs: ClauseComparisonItem[];
}
