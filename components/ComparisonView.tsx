"use client";

import React, { useState } from "react";
import { ComparisonReport, ClauseComparisonItem } from "@/lib/types";
import {
  GitCompare,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Filter,
  Layers,
  ArrowUpRight,
  Shield,
} from "lucide-react";

interface ComparisonViewProps {
  report: ComparisonReport;
}

export const ComparisonView: React.FC<ComparisonViewProps> = ({ report }) => {
  const [filterMode, setFilterMode] = useState<"ALL" | "DIFFERENT" | "ONLY_A" | "ONLY_B">("ALL");

  const filteredPairs = report.pairs.filter((item) => {
    if (filterMode === "ALL") return true;
    if (filterMode === "DIFFERENT")
      return (
        item.status !== "both" ||
        item.riskImpact === "SIGNIFICANT_CHANGE" ||
        item.riskImpact === "FAVORS_A" ||
        item.riskImpact === "FAVORS_B"
      );
    if (filterMode === "ONLY_A") return item.status === "only_in_a";
    if (filterMode === "ONLY_B") return item.status === "only_in_b";
    return true;
  });

  return (
    <div className="space-y-6">
      {/* COMPARISON METRICS SUMMARY */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 text-white">
                <GitCompare className="h-4 w-4" />
              </span>
              <h2 className="text-base font-semibold text-slate-900">
                Cross-Document Comparison Analysis
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Comparing{" "}
              <strong className="text-slate-800 font-medium">
                {report.docA.name}
              </strong>{" "}
              against{" "}
              <strong className="text-slate-800 font-medium">
                {report.docB.name}
              </strong>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {report.matchedCount} Aligned Clauses
            </span>
            {report.onlyInACount > 0 && (
              <span className="rounded-md bg-rose-50 border border-rose-200 px-3 py-1 text-xs font-medium text-rose-700">
                {report.onlyInACount} Omitted in Doc B
              </span>
            )}
            {report.onlyInBCount > 0 && (
              <span className="rounded-md bg-amber-50 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-700">
                {report.onlyInBCount} New in Doc B
              </span>
            )}
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex items-center justify-between gap-2 pt-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-medium text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="h-3 w-3" /> View:
            </span>
            <button
              onClick={() => setFilterMode("ALL")}
              type="button"
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                filterMode === "ALL"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All Clauses ({report.pairs.length})
            </button>
            <button
              onClick={() => setFilterMode("DIFFERENT")}
              type="button"
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                filterMode === "DIFFERENT"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Changes & Discrepancies
            </button>
            <button
              onClick={() => setFilterMode("ONLY_A")}
              type="button"
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                filterMode === "ONLY_A"
                  ? "bg-rose-600 text-white shadow-xs"
                  : "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200"
              }`}
            >
              Only in Doc A ({report.onlyInACount})
            </button>
            <button
              onClick={() => setFilterMode("ONLY_B")}
              type="button"
              className={`rounded px-2.5 py-1 text-xs font-medium transition ${
                filterMode === "ONLY_B"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
              }`}
            >
              Only in Doc B ({report.onlyInBCount})
            </button>
          </div>

          <span className="text-xs text-slate-500">
            Showing {filteredPairs.length} items
          </span>
        </div>
      </div>

      {/* COMPARISON CARDS LIST */}
      <div className="space-y-4">
        {filteredPairs.map((item) => (
          <ComparisonCard key={item.id} item={item} docAName={report.docA.name} docBName={report.docB.name} />
        ))}
      </div>
    </div>
  );
};

const ComparisonCard: React.FC<{
  item: ClauseComparisonItem;
  docAName: string;
  docBName: string;
}> = ({ item, docAName, docBName }) => {
  const isOnlyA = item.status === "only_in_a";
  const isOnlyB = item.status === "only_in_b";

  const impactBadge = {
    FAVORS_A: {
      text: "Favors Document A (Customer)",
      bg: "bg-blue-50 text-blue-700 border-blue-200",
    },
    FAVORS_B: {
      text: "Favors Document B (Vendor)",
      bg: "bg-purple-50 text-purple-700 border-purple-200",
    },
    SIGNIFICANT_CHANGE: {
      text: "Material Risk Modification",
      bg: "bg-rose-50 text-rose-700 border-rose-200",
    },
    NEUTRAL: {
      text: "Neutral / Identical",
      bg: "bg-slate-50 text-slate-600 border-slate-200",
    },
  }[item.riskImpact || "NEUTRAL"];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-slate-300">
      {/* HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-800">
            {item.category}
          </span>
          {isOnlyA && (
            <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[11px] font-medium text-rose-700">
              Omitted in Doc B
            </span>
          )}
          {isOnlyB && (
            <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              New in Doc B
            </span>
          )}
        </div>

        <span
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${impactBadge.bg}`}
        >
          {impactBadge.text}
        </span>
      </div>

      {/* CLAUSE SAMPLES SIDE-BY-SIDE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
        {/* DOC A */}
        <div
          className={`rounded-lg p-3.5 border text-xs ${
            isOnlyA
              ? "border-rose-200 bg-rose-50/40"
              : "border-slate-200 bg-slate-50/60"
          }`}
        >
          <div className="font-semibold text-slate-900 mb-1 flex items-center justify-between">
            <span>Doc A: {item.clauseA?.sectionNumber || docAName}</span>
            {item.clauseA?.title && (
              <span className="text-slate-500 font-normal">{item.clauseA.title}</span>
            )}
          </div>
          <p className="text-slate-700 leading-relaxed">
            {item.doc_a_summary}
          </p>
        </div>

        {/* DOC B */}
        <div
          className={`rounded-lg p-3.5 border text-xs ${
            isOnlyB
              ? "border-amber-200 bg-amber-50/40"
              : "border-slate-200 bg-slate-50/60"
          }`}
        >
          <div className="font-semibold text-slate-900 mb-1 flex items-center justify-between">
            <span>Doc B: {item.clauseB?.sectionNumber || docBName}</span>
            {item.clauseB?.title && (
              <span className="text-slate-500 font-normal">{item.clauseB.title}</span>
            )}
          </div>
          <p className="text-slate-700 leading-relaxed">
            {item.doc_b_summary}
          </p>
        </div>
      </div>

      {/* WHAT CHANGED */}
      <div className="rounded-md bg-slate-50 border border-slate-200/80 p-3 mb-2.5 text-xs">
        <div className="font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-slate-500" />
          <span>What Changed:</span>
        </div>
        <p className="text-slate-600 leading-relaxed">{item.whats_different}</p>
      </div>

      {/* WHO IT FAVORS & WHY */}
      <div className="rounded-md bg-amber-50/60 border border-amber-200/70 p-3 text-xs">
        <div className="font-semibold text-amber-900 mb-1 flex items-center gap-1.5">
          <Shield className="h-3.5 w-3.5 text-amber-700" />
          <span>Who It Favors & Factual Rationale:</span>
        </div>
        <p className="text-amber-800 leading-relaxed">
          {item.which_favors_whom_and_why}
        </p>
      </div>
    </div>
  );
};
