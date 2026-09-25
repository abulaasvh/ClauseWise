/**
 * @jest-environment node
 */
import { POST as chatHandler } from "@/app/api/chat/route";
import { POST as uploadHandler } from "@/app/api/upload/route";
import { NextRequest } from "next/server";
import { ParsedDocument } from "@/lib/types";

// Mock dependent modules cleanly
jest.mock("@/lib/docstore", () => ({
  getDocumentAsync: jest.fn(),
  getDocument: jest.fn(),
  saveDocument: jest.fn(),
  getAllDocuments: jest.fn(),
}));

jest.mock("@/lib/claude", () => ({
  answerGroundedQuestion: jest.fn(),
  extractReferencedCitations: jest.fn(),
  fallbackClauseAnalysis: jest.fn(),
}));

jest.mock("@/lib/lettucedetect", () => ({
  auditWithLettuceDetect: jest.fn(),
}));

// Import mocked modules after jest.mock
import { getDocumentAsync } from "@/lib/docstore";
import { answerGroundedQuestion, extractReferencedCitations } from "@/lib/claude";
import { auditWithLettuceDetect } from "@/lib/lettucedetect";

describe("API Routes Integration Tests", () => {
  const dummyDoc: ParsedDocument = {
    id: "doc-test-123",
    fileName: "test_agreement.pdf",
    fileType: "pdf",
    uploadedAt: new Date().toISOString(),
    rawText: "Section 1. Indemnification: Vendor indemnifies Customer.",
    chunks: [
      {
        id: "chunk-1",
        sectionNumber: "1.0",
        title: "Indemnification",
        text: "Vendor will indemnify Customer against third party losses.",
        order: 1,
      },
    ],
    analyses: {},
    stats: {
      totalClauses: 1,
      highRisk: 0,
      mediumRisk: 0,
      lowRisk: 1,
      categories: ["Indemnity"],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/chat", () => {
    it("returns properly shaped response with answer, citations, and hallucination audit", async () => {
      (getDocumentAsync as jest.Mock).mockResolvedValue(dummyDoc);

      (answerGroundedQuestion as jest.Mock).mockResolvedValue(
        "According to Section 1.0, the Vendor indemnifies the Customer."
      );

      (extractReferencedCitations as jest.Mock).mockReturnValue([
        {
          clauseId: "chunk-1",
          sectionNumber: "1.0",
          title: "Indemnification",
          quote: "Vendor will indemnify Customer against third party losses.",
          similarityScore: 0.95,
        },
      ]);

      (auditWithLettuceDetect as jest.Mock).mockResolvedValue({
        isHallucinated: false,
        confidenceScore: 0.05,
        flaggedSentences: [],
        reasoning: "Answer is fully grounded in the provided clause.",
      });

      const request = new NextRequest("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: "doc-test-123",
          question: "Who provides indemnification?",
        }),
      });

      const response = await chatHandler(request);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty("answer");
      expect(body.answer).toContain("Vendor indemnifies the Customer");
      expect(body).toHaveProperty("citations");
      expect(Array.isArray(body.citations)).toBe(true);
      expect(body.citations.length).toBe(1);
      expect(body).toHaveProperty("hallucination");
      expect(body.hallucination.isHallucinated).toBe(false);
    });

    it("returns a sanitized error response on LLM provider failure without leaking stack traces or keys", async () => {
      (getDocumentAsync as jest.Mock).mockResolvedValue(dummyDoc);

      (answerGroundedQuestion as jest.Mock).mockRejectedValue(
        new Error("Rate limit exceeded: 429 quota_exceeded sk-ant-api03-SECRETKEY at /app/internal/claude.ts:45")
      );

      const request = new NextRequest("http://localhost:3000/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: "doc-test-123",
          question: "What is the liability cap?",
        }),
      });

      const response = await chatHandler(request);

      expect([429, 503]).toContain(response.status);

      const body = await response.json();
      expect(body).toHaveProperty("error");
      expect(body).toHaveProperty("category");
      expect(body).toHaveProperty("message");
      expect(body).toHaveProperty("requestId");
      expect(body).toHaveProperty("timestamp");

      // Verify no sensitive keys or file paths leaked to client
      expect(body.message).not.toContain("sk-ant");
      expect(body.message).not.toContain("/app/internal");
      expect(body.error).not.toContain("SECRETKEY");
      expect(body.category).toBe("QUOTA_EXCEEDED");
    });
  });

  describe("POST /api/upload", () => {
    it("rejects unsupported executable / binary file types explicitly with status 415", async () => {
      const formData = new FormData();
      const fakeExeFile = new File([Buffer.from("MZ binary content")], "malicious.exe", {
        type: "application/x-msdownload",
      });
      formData.append("file", fakeExeFile);

      const request = new NextRequest("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadHandler(request);
      expect(response.status).toBe(415);

      const body = await response.json();
      expect(body.error).toContain("Unsupported file extension");
    });

    it("rejects corrupted or spoofed PDF files with mismatched magic header", async () => {
      const formData = new FormData();
      const fakePdf = new File([Buffer.from("NOT_REALLY_A_PDF")], "contract.pdf", {
        type: "application/pdf",
      });
      formData.append("file", fakePdf);

      const request = new NextRequest("http://localhost:3000/api/upload", {
        method: "POST",
        body: formData,
      });

      const response = await uploadHandler(request);
      expect(response.status).toBe(400);

      const body = await response.json();
      expect(body.error).toContain("Corrupted or invalid PDF file format");
    });
  });
});
