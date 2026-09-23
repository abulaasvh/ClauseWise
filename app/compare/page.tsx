"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ComparisonReport } from "@/lib/types";
import { ComparisonView } from "@/components/ComparisonView";
import {
  GitCompare,
  ArrowRight,
  Loader2,
  FileText,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

interface DocOption {
  id: string;
  fileName: string;
  fileType: string;
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-16 text-slate-500 text-xs">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span>Loading comparison workspace...</span>
        </div>
      }
    >
      <CompareContent />
    </Suspense>
  );
}

function CompareContent() {
  const searchParams = useSearchParams();
  const initialBase = searchParams.get("base");

  const [availableDocs, setAvailableDocs] = useState<DocOption[]>([]);
  const [docAId, setDocAId] = useState<string>("");
  const [docBId, setDocBId] = useState<string>("");
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available documents
  useEffect(() => {
    const loadDocs = async () => {
      try {
        const res = await fetch("/api/documents");
        if (res.ok) {
          const data = await res.json();
          const docs: DocOption[] = data.documents || [];
          setAvailableDocs(docs);

          if (docs.length >= 2) {
            const first = initialBase || docs[0].id;
            const second = docs.find((d) => d.id !== first)?.id || docs[1].id;
            setDocAId(first);
            setDocBId(second);
          } else if (docs.length === 1) {
            setDocAId(docs[0].id);
          }
        }
      } catch (err) {
        console.error("Failed to load documents for comparison:", err);
      }
    };
    loadDocs();
  }, [initialBase]);

  // Run comparison when docA and docB are selected
  const runComparison = async (aId?: string, bId?: string) => {
    const targetA = aId || docAId;
    const targetB = bId || docBId;

    if (!targetA || !targetB || targetA === targetB) {
      setError("Please select two distinct contracts to compare.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docAId: targetA, docBId: targetB }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to compare documents.");
      }

      const data = await res.json();
      setReport(data.report);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (docAId && docBId && docAId !== docBId) {
      runComparison(docAId, docBId);
    }
  }, [docAId, docBId]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* PAGE HEADER */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-white">
                <GitCompare className="h-4 w-4" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                Two-Document Comparison Mode
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Semantically align clauses across contract drafts to identify substantive alterations, omissions, and asymmetric terms.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-slate-900"
          >
            <FileText className="h-3.5 w-3.5" />
            <span>Upload New Contract</span>
          </Link>
        </div>
      </div>

      {/* DOCUMENT SELECTION PICKER */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          Select Contracts to Compare
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          {/* DOC A SELECTOR */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Base Document (Document A)
            </label>
            <select
              value={docAId}
              onChange={(e) => setDocAId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="">Select first document...</option>
              {availableDocs.map((doc) => (
                <option key={doc.id} value={doc.id} disabled={doc.id === docBId}>
                  {doc.fileName} ({doc.fileType.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {/* DOC B SELECTOR */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Comparison Draft (Document B)
            </label>
            <select
              value={docBId}
              onChange={(e) => setDocBId(e.target.value)}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
            >
              <option value="">Select second document...</option>
              {availableDocs.map((doc) => (
                <option key={doc.id} value={doc.id} disabled={doc.id === docAId}>
                  {doc.fileName} ({doc.fileType.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* LOADING STATE */}
      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-xs">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-slate-900 mb-3" />
          <p className="text-sm font-medium text-slate-800">
            Vectorizing & Semantically Aligning Clauses...
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Computing cosine similarities and extracting substantive discrepancies.
          </p>
        </div>
      )}

      {/* COMPARISON VIEW REPORT */}
      {!loading && report && <ComparisonView report={report} />}
    </div>
  );
}
