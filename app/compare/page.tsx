"use client";

import React, { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { ComparisonReport } from "@/lib/types";
import { ComparisonView } from "@/components/ComparisonView";
import {
  GitCompare,
  ArrowRight,
  ArrowLeftRight,
  Loader2,
  FileText,
  AlertTriangle,
  UploadCloud,
  FileUp,
  Files,
  CheckCircle2,
  RefreshCw,
  X,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

interface DocOption {
  id: string;
  fileName: string;
  fileType: string;
  uploadedAt?: string;
  stats?: {
    totalClauses: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    categories?: string[];
  };
}

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-16 text-slate-500 text-xs">
          <Loader2 className="h-5 w-5 animate-spin mr-2 text-jade" />
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
  const [selectedDocA, setSelectedDocA] = useState<DocOption | null>(null);
  const [selectedDocB, setSelectedDocB] = useState<DocOption | null>(null);
  const [report, setReport] = useState<ComparisonReport | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [isLoadingDocs, setIsLoadingDocs] = useState(true);

  // Load available documents and resolve initialBase if present
  useEffect(() => {
    let isMounted = true;

    const loadDocs = async () => {
      setIsLoadingDocs(true);
      try {
        const res = await fetch("/api/documents");
        if (res.ok) {
          const data = await res.json();
          const docs: DocOption[] = data.documents || [];
          if (!isMounted) return;
          setAvailableDocs(docs);

          if (initialBase) {
            // Find the prefilled base document
            const matched = docs.find((d) => d.id === initialBase);
            if (matched) {
              setSelectedDocA(matched);
            } else {
              // Try fetching directly if not in list yet
              try {
                const singleRes = await fetch(`/api/document/${initialBase}`);
                if (singleRes.ok) {
                  const singleData = await singleRes.json();
                  if (singleData.document && isMounted) {
                    const docObj: DocOption = {
                      id: singleData.document.id,
                      fileName: singleData.document.fileName,
                      fileType: singleData.document.fileType,
                      uploadedAt: singleData.document.uploadedAt,
                      stats: singleData.document.stats,
                    };
                    setSelectedDocA(docObj);
                    setAvailableDocs((prev) => {
                      if (prev.some((d) => d.id === docObj.id)) return prev;
                      return [docObj, ...prev];
                    });
                  }
                }
              } catch (err) {
                console.error("Failed to fetch initial base doc:", err);
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to load documents for comparison:", err);
      } finally {
        if (isMounted) setIsLoadingDocs(false);
      }
    };

    loadDocs();

    return () => {
      isMounted = false;
    };
  }, [initialBase]);

  // Handler for uploading a new document directly in Slot A or B
  const handleDocUploaded = (doc: DocOption, slot: "A" | "B") => {
    setAvailableDocs((prev) => {
      if (prev.some((d) => d.id === doc.id)) return prev;
      return [doc, ...prev];
    });

    if (slot === "A") {
      setSelectedDocA(doc);
    } else {
      setSelectedDocB(doc);
    }

    // Reset previous report since documents changed
    setReport(null);
    setCompareError(null);
  };

  // Swap Slot A and Slot B
  const handleSwapSlots = () => {
    const tempA = selectedDocA;
    setSelectedDocA(selectedDocB);
    setSelectedDocB(tempA);
    setReport(null);
  };

  // Trigger comparison logic
  const handleRunComparison = async () => {
    if (!selectedDocA || !selectedDocB) {
      setCompareError("Please select or upload two contracts to compare.");
      return;
    }

    if (selectedDocA.id === selectedDocB.id) {
      setCompareError("Please select two distinct contracts to compare.");
      return;
    }

    setComparing(true);
    setCompareError(null);

    try {
      const res = await fetch("/api/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          docAId: selectedDocA.id,
          docBId: selectedDocB.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to compare documents.");
      }

      setReport(data.report);
    } catch (err) {
      setCompareError((err as Error).message);
    } finally {
      setComparing(false);
    }
  };

  const isReadyToCompare = !!selectedDocA && !!selectedDocB && selectedDocA.id !== selectedDocB.id;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* PAGE HEADER */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-navy text-white">
                <GitCompare className="h-4 w-4" />
              </span>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink-navy font-headline">
                Two-Document Comparison Mode
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 font-body">
              Semantically align clauses across contract drafts to identify substantive alterations, omissions, and asymmetric terms.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 border border-slate-200 bg-white px-3 py-1.5 rounded-lg shadow-2xs hover:bg-slate-50 transition"
          >
            <FileText className="h-3.5 w-3.5 text-jade" />
            <span>Main Upload & Analysis</span>
          </Link>
        </div>
      </div>

      {/* DUAL DOCUMENT SELECTION & UPLOAD SLOTS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 font-body">
            Configure Comparison Pair
          </h2>

          {selectedDocA && selectedDocB && (
            <button
              type="button"
              onClick={handleSwapSlots}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100 transition"
              title="Swap Document A and Document B"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              <span>Swap A & B</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* SLOT A: DOCUMENT A (BASE CONTRACT) */}
          <CompareSlot
            slotId="A"
            slotLabel="Document A"
            roleDescription="Base Agreement / Original Version"
            selectedDoc={selectedDocA}
            onSelectDoc={(doc) => {
              setSelectedDocA(doc);
              setReport(null);
            }}
            onClearDoc={() => {
              setSelectedDocA(null);
              setReport(null);
            }}
            onUploadDoc={(doc) => handleDocUploaded(doc, "A")}
            availableDocs={availableDocs}
            otherDocId={selectedDocB?.id || null}
            isPrefilled={!!initialBase && selectedDocA?.id === initialBase}
            isLoadingDocs={isLoadingDocs}
          />

          {/* SLOT B: DOCUMENT B (COMPARISON DRAFT) */}
          <CompareSlot
            slotId="B"
            slotLabel="Document B"
            roleDescription="Comparison Draft / Counterparty Version"
            selectedDoc={selectedDocB}
            onSelectDoc={(doc) => {
              setSelectedDocB(doc);
              setReport(null);
            }}
            onClearDoc={() => {
              setSelectedDocB(null);
              setReport(null);
            }}
            onUploadDoc={(doc) => handleDocUploaded(doc, "B")}
            availableDocs={availableDocs}
            otherDocId={selectedDocA?.id || null}
            isPrefilled={false}
            isLoadingDocs={isLoadingDocs}
          />
        </div>

        {/* COMPARISON CTA BAR */}
        <div className="pt-2 flex flex-col items-center justify-center space-y-3">
          <button
            type="button"
            onClick={handleRunComparison}
            disabled={!isReadyToCompare || comparing}
            className={`w-full sm:w-auto min-w-[260px] inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold transition shadow-sm ${
              isReadyToCompare && !comparing
                ? "bg-ink-navy text-white hover:bg-slate-800 cursor-pointer shadow-md hover:shadow-lg"
                : "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
            }`}
          >
            {comparing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-jade-200" />
                <span>Vectorizing & Aligning Clauses...</span>
              </>
            ) : (
              <>
                <GitCompare className="h-4 w-4" />
                <span>Compare Contracts</span>
              </>
            )}
          </button>

          {!isReadyToCompare && (
            <p className="text-xs text-slate-400 text-center font-body">
              {!selectedDocA && !selectedDocB
                ? "Select or upload both Document A and Document B to enable comparison."
                : !selectedDocA
                ? "Select or upload Document A to proceed."
                : !selectedDocB
                ? "Select or upload Document B to proceed."
                : selectedDocA.id === selectedDocB.id
                ? "Document A and Document B must be different contracts."
                : ""}
            </p>
          )}

          {compareError && (
            <div className="w-full max-w-xl rounded-lg bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{compareError}</span>
            </div>
          )}
        </div>
      </div>

      {/* COMPARISON LOADING INDICATOR */}
      {comparing && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-slate-500 shadow-xs">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-jade mb-3" />
          <p className="text-sm font-semibold text-ink-navy font-headline">
            Vectorizing & Semantically Aligning Clauses...
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Computing high-dimensional embeddings, identifying semantic matches, and surfacing critical alterations.
          </p>
        </div>
      )}

      {/* COMPARISON VIEW REPORT */}
      {!comparing && report && <ComparisonView report={report} />}
    </div>
  );
}

interface CompareSlotProps {
  slotId: "A" | "B";
  slotLabel: string;
  roleDescription: string;
  selectedDoc: DocOption | null;
  onSelectDoc: (doc: DocOption) => void;
  onClearDoc: () => void;
  onUploadDoc: (doc: DocOption) => void;
  availableDocs: DocOption[];
  otherDocId: string | null;
  isPrefilled?: boolean;
  isLoadingDocs: boolean;
}

function CompareSlot({
  slotId,
  slotLabel,
  roleDescription,
  selectedDoc,
  onSelectDoc,
  onClearDoc,
  onUploadDoc,
  availableDocs,
  otherDocId,
  isPrefilled,
  isLoadingDocs,
}: CompareSlotProps) {
  // If there are existing documents and slot is not prefilled, user can toggle between "upload" and "select"
  // Default to "upload" if no documents exist yet, otherwise "select" or "upload"
  const [activeTab, setActiveTab] = useState<"upload" | "select">("upload");
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Default to "select" if available docs exist and not already uploading
  useEffect(() => {
    if (availableDocs.length > 0 && !selectedDoc) {
      // If there are selectable docs, default to select tab unless user prefers upload
      if (activeTab === "upload" && availableDocs.length >= 2) {
        setActiveTab("select");
      }
    }
  }, [availableDocs.length]);

  const handleFileUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError(null);

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

      const uploadedDoc: DocOption = {
        id: data.document.id,
        fileName: data.document.fileName,
        fileType: data.document.fileType,
        uploadedAt: data.document.uploadedAt,
        stats: data.document.stats,
      };

      onUploadDoc(uploadedDoc);
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
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

  const selectableDocs = availableDocs.filter((d) => d.id !== otherDocId);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between min-h-[300px] transition-all">
      {/* SLOT HEADER */}
      <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-700">
              {slotId}
            </span>
            <span className="text-sm font-bold text-ink-navy font-headline">
              {slotLabel}
            </span>
            {isPrefilled && (
              <span className="rounded-full bg-jade-50 border border-jade-200 px-2 py-0.5 text-[10px] font-semibold text-jade-700">
                Pre-filled
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 font-body">
            {roleDescription}
          </p>
        </div>

        {selectedDoc && (
          <button
            type="button"
            onClick={onClearDoc}
            className="text-xs text-slate-500 hover:text-slate-800 underline font-medium"
          >
            Change
          </button>
        )}
      </div>

      {/* IF A DOCUMENT IS SELECTED */}
      {selectedDoc ? (
        <div className="flex-1 flex flex-col justify-center">
          <div className="rounded-lg border border-jade-200 bg-jade-50/50 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-jade-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-900 leading-snug break-all font-body">
                    {selectedDoc.fileName}
                  </h4>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="rounded bg-white border border-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
                      {selectedDoc.fileType}
                    </span>
                    {selectedDoc.stats && (
                      <span className="text-[11px] text-slate-600">
                        {selectedDoc.stats.totalClauses} clauses
                        {selectedDoc.stats.highRisk > 0 && (
                          <span className="text-rose-600 font-medium ml-1">
                            ({selectedDoc.stats.highRisk} high risk)
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-jade-700 shrink-0">
                <CheckCircle2 className="h-4 w-4 text-jade" />
                <span>Ready</span>
              </span>
            </div>
          </div>
        </div>
      ) : (
        /* IF NO DOCUMENT SELECTED: TABBED INTERFACE (UPLOAD VS CHOOSE EXISTING) */
        <div className="flex-1 flex flex-col">
          {/* TABS HEADER */}
          <div className="flex items-center gap-2 mb-3 bg-slate-50 p-1 rounded-lg border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition ${
                activeTab === "upload"
                  ? "bg-white text-ink-navy shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <FileUp className="h-3.5 w-3.5" />
              <span>Upload New File</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("select")}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition ${
                activeTab === "select"
                  ? "bg-white text-ink-navy shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Files className="h-3.5 w-3.5" />
              <span>Choose Existing ({availableDocs.length})</span>
            </button>
          </div>

          {/* TAB CONTENT: UPLOAD DROPZONE */}
          {activeTab === "upload" && (
            <label
              htmlFor={isUploading ? undefined : `compare-file-slot-${slotId}`}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`flex-1 border-2 border-dashed rounded-xl p-6 text-center flex flex-col items-center justify-center transition cursor-pointer select-none group ${
                dragActive
                  ? "border-jade-600 bg-jade-50/60"
                  : "border-slate-300 hover:border-jade-500 hover:bg-jade-50/30 bg-slate-50/50"
              }`}
            >
              <input
                type="file"
                id={`compare-file-slot-${slotId}`}
                accept=".pdf,.docx,.doc,.txt"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                }}
                className="sr-only"
                disabled={isUploading}
              />

              {isUploading ? (
                <div className="space-y-2 py-4">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-jade" />
                  <p className="text-xs font-semibold text-slate-800">
                    Extracting & Chunking Clauses...
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Evaluating risks and preparing embedding vectors
                  </p>
                </div>
              ) : (
                <div className="space-y-2 py-2">
                  <UploadCloud
                    className={`h-9 w-9 mx-auto transition ${
                      dragActive ? "text-jade" : "text-slate-400 group-hover:text-jade"
                    }`}
                  />
                  <div>
                    <span className="text-xs font-semibold text-jade group-hover:underline">
                      Choose a PDF or DOCX file
                    </span>
                    <span className="text-xs text-slate-500 font-body">
                      {" "}or drag & drop
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Click anywhere or drop PDF, DOCX, DOC, or TXT
                  </p>
                </div>
              )}
            </label>
          )}

          {/* TAB CONTENT: SELECT EXISTING DOCUMENT */}
          {activeTab === "select" && (
            <div className="flex-1 flex flex-col justify-center space-y-3 py-2">
              {availableDocs.length === 0 ? (
                <div className="text-center py-6 px-4 bg-slate-50 rounded-lg border border-slate-100">
                  <Files className="h-7 w-7 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-medium text-slate-600">
                    No contracts uploaded yet
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 mb-3">
                    Upload a file directly to populate this slot.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("upload")}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-jade hover:underline"
                  >
                    <FileUp className="h-3 w-3" />
                    <span>Switch to Upload</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <label
                    htmlFor={`select-doc-${slotId}`}
                    className="block text-xs font-medium text-slate-700"
                  >
                    Select an uploaded contract:
                  </label>
                  <select
                    id={`select-doc-${slotId}`}
                    defaultValue=""
                    onChange={(e) => {
                      const doc = availableDocs.find((d) => d.id === e.target.value);
                      if (doc) onSelectDoc(doc);
                    }}
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                  >
                    <option value="" disabled>
                      -- Choose a document ({selectableDocs.length} available) --
                    </option>
                    {availableDocs.map((doc) => {
                      const isSelectedInOther = doc.id === otherDocId;
                      return (
                        <option
                          key={doc.id}
                          value={doc.id}
                          disabled={isSelectedInOther}
                        >
                          {doc.fileName} ({doc.fileType.toUpperCase()})
                          {isSelectedInOther ? ` — [Selected in Document ${slotId === "A" ? "B" : "A"}]` : ""}
                        </option>
                      );
                    })}
                  </select>

                  <div className="pt-2">
                    <p className="text-[11px] text-slate-400">
                      Need to compare an unlisted file?{" "}
                      <button
                        type="button"
                        onClick={() => setActiveTab("upload")}
                        className="text-jade font-semibold hover:underline"
                      >
                        Upload a new draft
                      </button>
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {uploadError && (
            <div className="mt-3 rounded-md bg-rose-50 p-2.5 text-xs text-rose-700 border border-rose-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
