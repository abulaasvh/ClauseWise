"use client";

import React, { useState, useRef, useEffect } from "react";
import { ClauseChunk, ParsedDocument, RiskLevel } from "@/lib/types";
import { ClauseCard } from "./ClauseCard";
import {
  FileText,
  Search,
  Filter,
  Copy,
  Check,
  Download,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { fetchClauseNotes, ClauseNote, getSupabaseClient } from "@/lib/supabase";

interface DocumentViewerProps {
  document: ParsedDocument;
  selectedClauseId?: string | null;
  onSelectClause?: (clauseId: string) => void;
  onGenerateChecklist?: () => void;
}

export const DocumentViewer: React.FC<DocumentViewerProps> = ({
  document,
  selectedClauseId,
  onSelectClause,
  onGenerateChecklist,
}) => {
  const [riskFilter, setRiskFilter] = useState<RiskLevel | "ALL">("ALL");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reanalyzingId, setReanalyzingId] = useState<string | null>(null);
  const [clauseNotesMap, setClauseNotesMap] = useState<Record<string, ClauseNote[]>>({});

  const leftPaneRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);

  // Load notes for this document and subscribe to Realtime note updates
  useEffect(() => {
    let mounted = true;
    const loadNotes = async () => {
      const notes = await fetchClauseNotes(document.id);
      if (mounted) {
        const map: Record<string, ClauseNote[]> = {};
        for (const n of notes) {
          if (!map[n.clauseId]) map[n.clauseId] = [];
          map[n.clauseId].push(n);
        }
        setClauseNotesMap(map);
      }
    };
    loadNotes();

    const client = getSupabaseClient();
    if (client) {
      const channel = client
        .channel(`notes_${document.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "clause_notes",
            filter: `document_id=eq.${document.id}`,
          },
          (payload) => {
            const row = payload.new as {
              id: string;
              clause_id: string;
              document_id: string;
              note_text: string;
              created_at: string;
            };
            setClauseNotesMap((prev) => {
              const existing = prev[row.clause_id] || [];
              if (existing.some((n) => n.id === row.id)) return prev;
              return {
                ...prev,
                [row.clause_id]: [
                  ...existing,
                  {
                    id: row.id,
                    clauseId: row.clause_id,
                    documentId: row.document_id,
                    noteText: row.note_text,
                    createdAt: row.created_at,
                  },
                ],
              };
            });
          }
        )
        .subscribe();

      return () => {
        mounted = false;
        client.removeChannel(channel);
      };
    }

    return () => {
      mounted = false;
    };
  }, [document.id]);

  const handleCopyClause = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleReanalyzeClause = async (chunk: ClauseChunk) => {
    setReanalyzingId(chunk.id);
    try {
      const res = await fetch("/api/analyze-clause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: document.id,
          clauseId: chunk.id,
          sectionNumber: chunk.sectionNumber,
          title: chunk.title,
          text: chunk.text,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.analysis) {
          document.analyses[chunk.id] = data.analysis;
        }
      }
    } catch (e) {
      console.error("Reanalyze error:", e);
    } finally {
      setReanalyzingId(null);
    }
  };

  const scrollToClauseInView = (clauseId: string) => {
    if (onSelectClause) {
      onSelectClause(clauseId);
    }

    // Scroll original text in left pane
    const origElem = window.document.querySelector(`#orig-clause-${clauseId}`);
    if (origElem) {
      origElem.scrollIntoView({ behavior: "smooth", block: "center" });
      origElem.classList.add("highlight-pulse");
      setTimeout(() => origElem.classList.remove("highlight-pulse"), 2500);
    }

    // Scroll card in right pane
    const cardElem = window.document.querySelector(`#analysis-card-${clauseId}`);
    if (cardElem) {
      cardElem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  // Filter chunks based on risk, category, and search query
  const filteredChunks = document.chunks.filter((chunk) => {
    const analysis = document.analyses[chunk.id];
    const riskMatches =
      riskFilter === "ALL" || (analysis && analysis.risk_level === riskFilter);
    const categoryMatches =
      selectedCategory === "ALL" || (analysis && analysis.category === selectedCategory);
    const searchMatches =
      !searchQuery.trim() ||
      chunk.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
      chunk.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (analysis && analysis.plain_summary.toLowerCase().includes(searchQuery.toLowerCase()));

    return riskMatches && categoryMatches && searchMatches;
  });

  return (
    <div className="flex flex-col h-full min-h-0 bg-slate-100 overflow-hidden">
      {/* TOOLBAR: Document Title, Filters, and Action Export */}
      <div className="border-b border-slate-200 bg-white px-4 py-3 shadow-2xs flex-shrink-0">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          {/* Document metadata info */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-slate-900 text-base leading-tight">
                  {document.fileName}
                </h1>
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-mono font-medium text-slate-700 uppercase">
                  {document.fileType}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                {document.chunks.length} detected clauses • {document.stats.highRisk} High Risk • {document.stats.mediumRisk} Medium Risk
              </p>
            </div>
          </div>

          {/* Action Export Button & Quick Stats */}
          <div className="flex items-center gap-2 flex-wrap">
            {onGenerateChecklist && (
              <button
                onClick={onGenerateChecklist}
                type="button"
                aria-label="Export Action Checklist dialog"
                className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Export Action Checklist</span>
              </button>
            )}
          </div>
        </div>

        {/* Filter controls row */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          {/* Search box */}
          <div className="relative w-full sm:w-64">
            <label htmlFor="document-search-input" className="sr-only">
              Search clauses or terms
            </label>
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            <input
              id="document-search-input"
              type="text"
              placeholder="Search clauses or terms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search clauses or terms in document"
              className="w-full rounded-md border border-slate-300 bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:bg-white focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600 transition"
            />
          </div>

          {/* Filter by Risk Level */}
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Filter clauses by risk level">
            <span className="text-xs font-semibold text-slate-600 mr-1 flex items-center gap-1">
              <Filter className="h-3 w-3" aria-hidden="true" /> Risk:
            </span>
            <button
              onClick={() => setRiskFilter("ALL")}
              type="button"
              aria-pressed={riskFilter === "ALL"}
              aria-label={`Show all ${document.chunks.length} clauses`}
              className={`rounded px-2.5 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-teal-600 ${
                riskFilter === "ALL"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              All ({document.chunks.length})
            </button>
            <button
              onClick={() => setRiskFilter("HIGH")}
              type="button"
              aria-pressed={riskFilter === "HIGH"}
              aria-label={`Filter by High Risk clauses (${document.stats.highRisk})`}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-teal-600 ${
                riskFilter === "HIGH"
                  ? "bg-rose-700 text-white shadow-xs"
                  : "bg-rose-50 text-rose-950 hover:bg-rose-100 border border-rose-300"
              }`}
            >
              <AlertOctagon className="h-3 w-3" aria-hidden="true" />
              High ({document.stats.highRisk})
            </button>
            <button
              onClick={() => setRiskFilter("MEDIUM")}
              type="button"
              aria-pressed={riskFilter === "MEDIUM"}
              aria-label={`Filter by Medium Risk clauses (${document.stats.mediumRisk})`}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-teal-600 ${
                riskFilter === "MEDIUM"
                  ? "bg-amber-800 text-white shadow-xs"
                  : "bg-amber-50 text-amber-950 hover:bg-amber-100 border border-amber-300"
              }`}
            >
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Medium ({document.stats.mediumRisk})
            </button>
            <button
              onClick={() => setRiskFilter("LOW")}
              type="button"
              aria-pressed={riskFilter === "LOW"}
              aria-label={`Filter by Low Risk clauses (${document.stats.lowRisk})`}
              className={`inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition focus-visible:ring-2 focus-visible:ring-teal-600 ${
                riskFilter === "LOW"
                  ? "bg-emerald-700 text-white shadow-xs"
                  : "bg-emerald-50 text-emerald-950 hover:bg-emerald-100 border border-emerald-300"
              }`}
            >
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              Low ({document.stats.lowRisk})
            </button>
          </div>
        </div>
      </div>

      {/* TWO-COLUMN SYNCHRONIZED SPLIT VIEW WITH INDEPENDENT NATIVE SCROLL */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
        {/* COLUMN 1: ORIGINAL VERBATIM CONTRACT */}
        <div className="flex-1 min-w-0 min-h-0 h-full flex flex-col border-b md:border-b-0 md:border-r border-slate-200 bg-white overflow-hidden">
          {/* FIXED COLUMN 1 HEADER */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-slate-900" aria-hidden="true"></span>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                Original Contract Text
              </h2>
            </div>
            <span className="text-[11px] text-slate-600 font-mono">
              Verbatim Excerpts
            </span>
          </div>

          {/* INDEPENDENT SCROLLABLE BODY */}
          <div
            ref={leftPaneRef}
            tabIndex={0}
            aria-label="Original Contract Text List"
            className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 focus-visible:ring-1 focus-visible:ring-teal-600 focus-visible:outline-none"
          >
            <div className="space-y-4">
              {filteredChunks.length === 0 ? (
                <div className="text-center py-12 text-slate-600 text-sm">
                  No clauses match the active search or risk filters.
                </div>
              ) : (
                filteredChunks.map((chunk) => {
                  const isSelected = selectedClauseId === chunk.id;
                  return (
                    <article
                      key={chunk.id}
                      id={`orig-clause-${chunk.id}`}
                      tabIndex={0}
                      role="button"
                      aria-label={`View clause ${chunk.sectionNumber}: ${chunk.title}`}
                      onClick={() => scrollToClauseInView(chunk.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          scrollToClauseInView(chunk.id);
                        }
                      }}
                      className={`group relative rounded-md border p-4 transition-all duration-150 cursor-pointer focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
                        isSelected
                          ? "border-slate-900 bg-slate-50/70 shadow-xs ring-1 ring-slate-900"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/40"
                      }`}
                    >
                      {/* Clause header bar */}
                      <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2 text-xs text-slate-600">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {chunk.sectionNumber}
                          </span>
                          <span className="text-slate-400" aria-hidden="true">•</span>
                          <span className="font-medium text-slate-800">
                            {chunk.title}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyClause(chunk.id, chunk.text);
                            }}
                            aria-label={`Copy verbatim text of clause ${chunk.sectionNumber}`}
                            className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-200 font-medium focus-visible:ring-2 focus-visible:ring-teal-600"
                            title="Copy raw text"
                          >
                            {copiedId === chunk.id ? (
                              <Check className="h-3 w-3 text-emerald-700" aria-hidden="true" />
                            ) : (
                              <Copy className="h-3 w-3 text-slate-600" aria-hidden="true" />
                            )}
                            <span>{copiedId === chunk.id ? "Copied" : "Copy"}</span>
                          </button>
                        </div>
                      </div>

                      {/* Verbatim text in serif legal font */}
                      <p className="legal-prose text-sm whitespace-pre-line text-slate-900">
                        {chunk.text}
                      </p>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* COLUMN 2: SIMPLIFIED CLAUSE CARDS */}
        <div className="flex-1 min-w-0 min-h-0 h-full flex flex-col bg-slate-50 overflow-hidden">
          {/* FIXED COLUMN 2 HEADER */}
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-amber-600" aria-hidden="true"></span>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                AI Simplification & Risk Ratings
              </h2>
            </div>
            <span className="text-[11px] text-slate-600 font-medium">
              Showing {filteredChunks.length} of {document.chunks.length} clauses
            </span>
          </div>

          {/* INDEPENDENT SCROLLABLE BODY */}
          <div
            ref={rightPaneRef}
            tabIndex={0}
            aria-label="AI Simplification and Risk Ratings List"
            className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 focus-visible:ring-1 focus-visible:ring-teal-600 focus-visible:outline-none"
          >
            <div className="space-y-4">
              {filteredChunks.length === 0 ? (
                <div className="text-center py-12 text-slate-600 text-sm">
                  No simplified cards match the active filter.
                </div>
              ) : (
                filteredChunks.map((chunk) => {
                  const analysis = document.analyses[chunk.id];
                  const notes = clauseNotesMap[chunk.id] || [];
                  const isSelected = selectedClauseId === chunk.id;
                  return (
                    <ClauseCard
                      key={chunk.id}
                      chunk={chunk}
                      documentId={document.id}
                      analysis={analysis}
                      notes={notes}
                      isSelected={isSelected}
                      onSelect={() => scrollToClauseInView(chunk.id)}
                      onReanalyze={() => handleReanalyzeClause(chunk)}
                      isReanalyzing={reanalyzingId === chunk.id}
                    />
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
