"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  FileText,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  AlertTriangle,
  Loader2,
  FileUp,
  Files,
} from "lucide-react";
import Link from "next/link";

interface DocSummary {
  id: string;
  fileName: string;
  fileType: string;
  uploadedAt: string;
  stats: {
    totalClauses: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    categories: string[];
  };
}

export default function HomePage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<DocSummary[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [showPasteModal, setShowPasteModal] = useState(false);

  // Fetch preloaded sample & uploaded documents
  const fetchDocuments = async () => {
    try {
      const res = await fetch("/api/documents");
      if (res.ok) {
        const data = await res.json();
        setDocuments(data.documents || []);
      }
    } catch (e) {
      console.error("Failed to load documents:", e);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      router.push(`/document/${data.document.id}`);
    } catch (err) {
      setErrorMessage((err as Error).message);
      setIsUploading(false);
    }
  };

  const handleTextSubmit = async () => {
    if (!pastedText.trim()) return;
    setIsUploading(true);
    setErrorMessage(null);

    const formData = new FormData();
    formData.append("text", pastedText);
    formData.append("title", "Custom Agreement Draft");

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      router.push(`/document/${data.document.id}`);
    } catch (err) {
      setErrorMessage((err as Error).message);
      setIsUploading(false);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative min-h-full"
    >
      {/* FULL-PAGE DRAG OVERLAY */}
      {dragActive && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-jade-700/85 backdrop-blur-xs text-white p-6 transition-all">
          <div className="rounded-2xl border-2 border-dashed border-white/60 p-12 text-center max-w-md">
            <UploadCloud className="h-14 w-14 mx-auto mb-4 animate-bounce text-white" />
            <h3 className="text-xl font-bold font-headline">Drop Contract File Here</h3>
            <p className="mt-2 text-xs text-white/80">
              PDF or DOCX documents will be sectioned and analyzed immediately
            </p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-14">
        {/* TWO-COLUMN HERO SECTION */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center pt-2 sm:pt-6">
          {/* LEFT COLUMN: HEADLINE, TRUST TAGS, & INTEGRATED CTA */}
          <div className="lg:col-span-7 space-y-6">
            {/* TRUST STRIP RESTYLED AS CLEAN PILL TAGS */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-jade" />
                RAG Chunking
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-jade" />
                Semantic Alignment
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-2xs">
                <span className="h-1.5 w-1.5 rounded-full bg-jade" />
                Guardrailed Inference
              </span>
            </div>

            {/* HEADLINE IN FRAUNCES */}
            <h1 className="text-3xl sm:text-5xl font-medium tracking-tight text-ink-navy leading-[1.18] font-headline">
              Demystify Contracts with Verifiable AI Analysis
            </h1>

            {/* SUBTITLE IN IBM PLEX SANS */}
            <p className="text-sm sm:text-base text-slate-600 leading-relaxed font-body max-w-xl">
              Upload any PDF or DOCX agreement to view side-by-side plain-language translations,
              objective risk evaluations, and grounded question answering with clickable citations.
            </p>

            {/* INTEGRATED CTA ROW (NO GENERIC DASHED BOX) */}
            <div className="pt-2 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  type="file"
                  id="hero-file-upload"
                  accept=".pdf,.docx,.doc,.txt"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                  }}
                  className="sr-only"
                  disabled={isUploading}
                />

                <label
                  htmlFor="hero-file-upload"
                  className="inline-flex items-center gap-2 rounded-lg bg-ink-navy px-5 py-3 text-xs sm:text-sm font-semibold text-white shadow-sm hover:bg-slate-800 transition cursor-pointer"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-white" />
                      <span>Extracting Clauses...</span>
                    </>
                  ) : (
                    <>
                      <FileUp className="h-4 w-4 text-jade-100" />
                      <span>Upload Contract (PDF, DOCX)</span>
                    </>
                  )}
                </label>

                <Link
                  href="/documents"
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 text-xs sm:text-sm font-semibold text-ink-navy hover:bg-slate-50 transition shadow-2xs"
                >
                  <Files className="h-4 w-4 text-slate-500" />
                  <span>Browse All Documents</span>
                </Link>
              </div>

              {/* INTEGRATED MICROCOPY */}
              <div className="flex items-center gap-2 text-xs text-slate-500 font-body">
                <span>or drag a file anywhere on this page</span>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => setShowPasteModal(true)}
                  className="text-jade font-semibold hover:underline"
                >
                  paste raw text
                </button>
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-lg bg-rose-50 p-3 border border-rose-200 text-xs text-rose-800 flex items-center gap-2 max-w-lg">
                <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: CUSTOM SVG ILLUSTRATION (DOCUMENT EXCERPT WITH JADE HIGHLIGHT & CITATION CHIP) */}
          <div className="lg:col-span-5 flex justify-center lg:justify-end">
            <div className="relative w-full max-w-[440px] select-none">
              {/* SHADOW CARD BACKING */}
              <div className="absolute inset-0 bg-slate-200/60 rounded-2xl transform translate-x-2 translate-y-2" />

              {/* MAIN DOCUMENT SVG ARTBOARD */}
              <svg
                viewBox="0 0 440 370"
                className="relative w-full h-auto drop-shadow-sm"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* DOCUMENT SHEET */}
                <rect
                  x="1"
                  y="1"
                  width="438"
                  height="368"
                  rx="14"
                  fill="#FFFFFF"
                  stroke="#E5E7EB"
                  strokeWidth="1.5"
                />

                {/* TOP HEADER BAR */}
                <rect x="24" y="24" width="392" height="32" rx="6" fill="#F6F7F9" />
                <circle cx="42" cy="40" r="3" fill="#CBD5E1" />
                <circle cx="52" cy="40" r="3" fill="#CBD5E1" />
                <circle cx="62" cy="40" r="3" fill="#CBD5E1" />

                <text
                  x="82"
                  y="44"
                  fill="#6B7280"
                  fontSize="10"
                  fontFamily="system-ui, sans-serif"
                  fontWeight="600"
                  letterSpacing="0.08em"
                >
                  LEASE_AGREEMENT_2026.PDF
                </text>

                {/* DOCUMENT HEADING */}
                <text
                  x="28"
                  y="88"
                  fill="#12203D"
                  fontSize="14"
                  fontFamily="Georgia, serif"
                  fontWeight="600"
                >
                  RESIDENTIAL LEASE AGREEMENT
                </text>

                {/* SKELETON PARAGRAPH 1 */}
                <rect x="28" y="104" width="380" height="7" rx="3.5" fill="#E5E7EB" />
                <rect x="28" y="118" width="340" height="7" rx="3.5" fill="#E5E7EB" />

                {/* SECTION 6 HEADING */}
                <text
                  x="28"
                  y="154"
                  fill="#12203D"
                  fontSize="12"
                  fontFamily="Georgia, serif"
                  fontWeight="600"
                >
                  Section 6 · Pets and Animals
                </text>

                {/* SECTION 6 REGULAR CLAUSE TEXT */}
                <text
                  x="28"
                  y="174"
                  fill="#475569"
                  fontSize="10.5"
                  fontFamily="system-ui, sans-serif"
                >
                  Tenant shall not keep or permit any pets without prior written consent.
                </text>

                {/* HIGHLIGHTED JADE EXCERPT BOX */}
                <rect
                  x="24"
                  y="188"
                  width="392"
                  height="34"
                  rx="5"
                  fill="#E0EFEB"
                />
                {/* JADE LEFT ACCENT STRIP */}
                <rect x="24" y="188" width="4" height="34" rx="2" fill="#2E6E5E" />

                {/* HIGHLIGHTED TARGET TEXT */}
                <text
                  x="36"
                  y="204"
                  fill="#12203D"
                  fontSize="10.5"
                  fontFamily="system-ui, sans-serif"
                  fontWeight="600"
                >
                  A non-refundable pet deposit of $350 applies
                </text>
                <text
                  x="36"
                  y="216"
                  fill="#2E6E5E"
                  fontSize="10"
                  fontFamily="system-ui, sans-serif"
                  fontWeight="500"
                >
                  to each authorized animal and must be paid before move-in.
                </text>

                {/* SKELETON PARAGRAPH 2 */}
                <text
                  x="28"
                  y="250"
                  fill="#475569"
                  fontSize="10.5"
                  fontFamily="system-ui, sans-serif"
                >
                  Failure to register an animal will result in a 24-hour notice of violation.
                </text>
                <rect x="28" y="264" width="310" height="7" rx="3.5" fill="#E5E7EB" />

                {/* SECTION 7 HEADING */}
                <text
                  x="28"
                  y="300"
                  fill="#12203D"
                  fontSize="12"
                  fontFamily="Georgia, serif"
                  fontWeight="600"
                >
                  Section 7 · Utilities & Maintenance
                </text>
                <rect x="28" y="314" width="360" height="7" rx="3.5" fill="#E5E7EB" />
                <rect x="28" y="328" width="280" height="7" rx="3.5" fill="#E5E7EB" />

                {/* CONNECTING LEADER LINE FROM CITATION CHIP TO HIGHLIGHTED SENTENCE */}
                <path
                  d="M 280 152 L 280 180 L 230 180 L 230 198"
                  stroke="#2E6E5E"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  fill="none"
                />
                {/* ANCHOR DOT ON THE HIGHLIGHTED TEXT */}
                <circle cx="230" cy="202" r="3.5" fill="#2E6E5E" />
                <circle cx="230" cy="202" r="6" stroke="#2E6E5E" strokeWidth="1" opacity="0.4" />

                {/* FLOATING CITATION CHIP ("Section 6 · Pets") */}
                <g filter="url(#shadow-chip)">
                  <rect
                    x="215"
                    y="126"
                    width="135"
                    height="28"
                    rx="14"
                    fill="#2E6E5E"
                  />
                  {/* CITATION PIN / SPARKLE ICON */}
                  <circle cx="231" cy="140" r="3.5" fill="#E0EFEB" />
                  <text
                    x="242"
                    y="144"
                    fill="#FFFFFF"
                    fontSize="10.5"
                    fontFamily="system-ui, sans-serif"
                    fontWeight="700"
                    letterSpacing="0.02em"
                  >
                    Section 6 · Pets
                  </text>
                </g>

                {/* FILTER FOR CITATION CHIP SHADOW */}
                <defs>
                  <filter id="shadow-chip" x="205" y="120" width="155" height="46" filterUnits="userSpaceOnUse">
                    <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#12203D" floodOpacity="0.18" />
                  </filter>
                </defs>
              </svg>
            </div>
          </div>
        </section>

        {/* SAMPLE LEGAL CONTRACTS (1-CLICK LOADERS) */}
        <section className="space-y-4 pt-6 border-t border-slate-200/80">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Instant Demonstration Contracts
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pre-indexed documents ready for immediate clause review and grounded chat
              </p>
            </div>
            <Link
              href="/documents"
              className="text-xs font-semibold text-jade hover:text-jade-700 flex items-center gap-1"
            >
              <span>View all {documents.length} documents</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {documents
              .filter((d) => d.id.startsWith("sample-"))
              .map((sample) => (
                <div
                  key={sample.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs hover:border-jade hover:shadow-xs transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 uppercase tracking-wider">
                        <Sparkles className="h-3 w-3 text-jade" />
                        Sample
                      </span>
                      <span className="text-[11px] text-slate-400 uppercase font-mono">
                        {sample.fileType}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-ink-navy leading-snug line-clamp-1 font-headline">
                      {sample.fileName}
                    </h3>
                    <p className="mt-1.5 text-xs text-slate-500 leading-relaxed line-clamp-2">
                      {sample.id === "sample-saas-msa" &&
                        "Standard SaaS subscription terms, auto-renewal, mutual indemnity, and liability caps."}
                      {sample.id === "sample-vendor-proposal" &&
                        "Vendor counter-proposal shifting jurisdiction and expanding IP warranty disclaimers."}
                      {sample.id === "sample-mutual-nda" &&
                        "Confidentiality commitments, 3-year term, standard carve-outs, and return obligations."}
                    </p>
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-semibold text-slate-800">
                        {sample.stats?.totalClauses || 0}
                      </span>{" "}
                      clauses
                    </div>
                    <Link
                      href={`/document/${sample.id}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-jade hover:text-jade-700 transition"
                    >
                      <span>Analyze</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
          </div>
        </section>

        {/* RECENT UPLOADS TABLE (IF ANY) */}
        {documents.filter((d) => !d.id.startsWith("sample-")).length > 0 && (
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Recently Uploaded Contracts
            </h2>

            <div className="rounded-xl border border-slate-200 bg-white shadow-2xs divide-y divide-slate-100 overflow-hidden">
              {documents
                .filter((d) => !d.id.startsWith("sample-"))
                .slice(0, 5)
                .map((doc) => (
                  <div
                    key={doc.id}
                    className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-ink-navy">{doc.fileName}</h4>
                        <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                          <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span className="uppercase">{doc.fileType}</span>
                          <span>•</span>
                          <span>{doc.stats.totalClauses} clauses</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      {doc.stats.highRisk > 0 && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
                          <span>{doc.stats.highRisk} High Risk</span>
                        </span>
                      )}
                      <Link
                        href={`/document/${doc.id}`}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-jade hover:text-jade-700 bg-jade-50 px-3 py-1.5 rounded-lg border border-jade-200 hover:bg-jade-100 transition"
                      >
                        <span>Open Analysis</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        )}
      </div>

      {/* MODAL FOR RAW CONTRACT TEXT PASTE */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-ink-navy font-headline">Paste Raw Contract Text</h3>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Paste contract clauses, an agreement draft, or lease agreement. ClauseWise will detect numbering and headings automatically.
            </p>
            <textarea
              rows={10}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              placeholder="Paste raw agreement text here (e.g., Section 1. Term... Section 2. Payment...)"
              className="w-full rounded-lg border border-slate-200 p-3 text-xs text-slate-800 font-mono focus:border-jade focus:outline-none focus:ring-1 focus:ring-jade leading-relaxed"
            />
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTextSubmit}
                disabled={isUploading || !pastedText.trim()}
                className="rounded-lg bg-ink-navy px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition disabled:opacity-50 flex items-center gap-1.5"
              >
                {isUploading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>Process Text</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
