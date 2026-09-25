"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  UploadCloud,
  FileText,
  FileSpreadsheet,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  AlertTriangle,
  Loader2,
  Plus,
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

export default function DocumentsPage() {
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
        throw new Error(data.error || "Processing failed");
      }

      setShowPasteModal(false);
      setPastedText("");
      router.push(`/document/${data.document.id}`);
    } catch (err) {
      setErrorMessage((err as Error).message);
      setIsUploading(false);
    }
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
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-10">
      {/* FUNCTIONAL HEADER - NO MARKETING COPY */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-navy sm:text-2xl font-headline">
            Documents & Upload Workspace
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Upload contract files or choose from preloaded legal agreements to analyze clauses and risk levels.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowPasteModal(true)}
          aria-label="Open paste raw contract text dialog"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink-navy hover:bg-slate-50 transition shadow-2xs self-start sm:self-auto focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
        >
          <Plus className="h-3.5 w-3.5 text-jade" aria-hidden="true" />
          <span>Paste Raw Text</span>
        </button>
      </div>

      {/* UPLOAD WORKSPACE */}
      <section className="max-w-4xl mx-auto">
        <label
          htmlFor={isUploading ? undefined : "file-upload-documents"}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`relative block rounded-xl border-2 border-dashed p-8 sm:p-10 text-center transition cursor-pointer select-none group bg-white shadow-2xs ${dragActive
              ? "border-jade bg-jade-50/50"
              : "border-slate-300 hover:border-jade-500 hover:bg-jade-50/30"
            }`}
        >
          <input
            type="file"
            id="file-upload-documents"
            accept=".pdf,.docx,.doc,.txt"
            onChange={(e) => {
              if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
            }}
            className="sr-only"
            disabled={isUploading}
          />

          <div className="flex flex-col items-center justify-center space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-700 shadow-inner group-hover:bg-jade-50 group-hover:text-jade transition">
              {isUploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-jade" />
              ) : (
                <UploadCloud className="h-6 w-6 text-slate-600 group-hover:text-jade transition" />
              )}
            </div>

            <div>
              <span className="text-sm font-semibold text-ink-navy group-hover:text-jade underline underline-offset-2 transition">
                {isUploading ? "Extracting & Chunking Document..." : "Choose a PDF or DOCX file"}
              </span>
              <span className="text-sm text-slate-500"> or drag and drop here</span>
            </div>

            <p className="text-xs text-slate-400">
              Click anywhere in this box or drop file · Preserves legal numbering and structured provisions
            </p>
          </div>
        </label>

        {errorMessage && (
          <div className="mt-3 rounded-md bg-rose-50 p-3 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{errorMessage}</span>
          </div>
        )}
      </section>

      {/* INSTANT SAMPLE CONTRACTS */}
      <section className="max-w-4xl mx-auto space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Instant Preloaded Samples
          </h2>
          <span className="text-[11px] text-slate-400">
            Zero setup required · click to view instant analysis
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {documents
            .filter((d) => d.id.startsWith("sample-"))
            .map((sample) => (
              <div
                key={sample.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-jade hover:shadow-xs transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700 uppercase tracking-wider">
                      <Sparkles className="h-3 w-3 text-jade" />
                      Sample
                    </span>
                    <span className="text-[11px] text-slate-400 uppercase font-mono">
                      {sample.fileType}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-ink-navy leading-snug line-clamp-1">
                    {sample.fileName}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                    {sample.id === "sample-saas-msa" &&
                      "Standard SaaS subscription terms, auto-renewal, mutual indemnity, and liability caps."}
                    {sample.id === "sample-vendor-proposal" &&
                      "Vendor counter-proposal shifting jurisdiction and expanding IP warranty disclaimers."}
                    {sample.id === "sample-mutual-nda" &&
                      "Confidentiality commitments, 3-year term, standard carve-outs, and return obligations."}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
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

      {/* ALL UPLOADED DOCUMENTS */}
      <section className="max-w-4xl mx-auto space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          All Processed Documents ({documents.length})
        </h2>

        {documents.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500 text-xs">
            No documents uploaded yet. Upload a PDF or select a sample above.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white shadow-2xs divide-y divide-slate-100 overflow-hidden">
            {documents.map((doc) => (
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

                <div className="flex items-center gap-4 self-end sm:self-auto">
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
                    <span>Open</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MODAL FOR RAW CONTRACT TEXT PASTE */}
      {showPasteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="docs-paste-modal-title"
        >
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 id="docs-paste-modal-title" className="text-base font-bold text-ink-navy font-headline">Paste Raw Contract Text</h3>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                aria-label="Close paste contract text dialog"
                className="text-slate-400 hover:text-slate-600 rounded p-1 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Paste contract clauses, an agreement draft, or lease agreement. ClauseWise will detect numbering and headings automatically.
            </p>
            <label htmlFor="docs-paste-textarea" className="sr-only">
              Paste raw contract text
            </label>
            <textarea
              id="docs-paste-textarea"
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
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleTextSubmit}
                disabled={isUploading || !pastedText.trim()}
                aria-label="Process and analyze pasted contract text"
                className="rounded-lg bg-ink-navy px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition disabled:opacity-50 flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
              >
                {isUploading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                <span>Process Text</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
