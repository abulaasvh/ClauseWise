"use client";

import React, { useState } from "react";
import { ParsedDocument } from "@/lib/types";
import {
  X,
  Download,
  Printer,
  Calendar,
  HelpCircle,
  FileCheck,
  ShieldAlert,
  Copy,
  Check,
} from "lucide-react";

interface ChecklistModalProps {
  document: ParsedDocument;
  isOpen: boolean;
  onClose: () => void;
}

export const ChecklistModal: React.FC<ChecklistModalProps> = ({
  document,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Extract High and Medium risk items
  const highRiskItems = document.chunks
    .map((c) => ({ chunk: c, analysis: document.analyses[c.id] }))
    .filter((item) => item.analysis?.risk_level === "HIGH");

  const mediumRiskItems = document.chunks
    .map((c) => ({ chunk: c, analysis: document.analyses[c.id] }))
    .filter((item) => item.analysis?.risk_level === "MEDIUM");

  // Questions to ask a lawyer
  const lawyerQuestions = [
    ...highRiskItems.map((item) => ({
      clause: `${item.chunk.sectionNumber} (${item.chunk.title})`,
      question: `Does the ${item.analysis?.category || "provision"} create uncapped or disproportionate exposure given: "${item.analysis?.risk_reason}"?`,
      reference: item.chunk.sectionNumber,
    })),
    ...mediumRiskItems.map((item) => ({
      clause: `${item.chunk.sectionNumber} (${item.chunk.title})`,
      question: `Is the standard remedy or obligation in this ${item.analysis?.category || "clause"} consistent with standard commercial market terms?`,
      reference: item.chunk.sectionNumber,
    })),
  ];

  // Deadlines & calendar milestones to track
  const deadlines = document.chunks
    .filter((c) => {
      const txt = c.text.toLowerCase();
      return (
        txt.includes("day") ||
        txt.includes("month") ||
        txt.includes("renew") ||
        txt.includes("notice") ||
        txt.includes("term")
      );
    })
    .map((c) => {
      const matchDays = c.text.match(/([0-9]+)\s*(?:calendar\s*)?(?:business\s*)?days/i);
      const matchMonths = c.text.match(/([0-9]+)\s*months/i);
      const timeframe = matchDays ? matchDays[0] : matchMonths ? matchMonths[0] : "Stated notice period";
      return {
        section: c.sectionNumber,
        title: c.title,
        timeline: timeframe,
        detail: c.text.slice(0, 140) + "...",
      };
    })
    .slice(0, 6);

  // Clauses to negotiate
  const negotiationPoints = highRiskItems.map((item) => ({
    section: item.chunk.sectionNumber,
    title: item.chunk.title,
    proposal: `Request mutual reciprocity or establish a reasonable monetary ceiling/cure window. Currently flagged: ${item.analysis?.risk_reason}`,
  }));

  // Generate plain text format for download
  const generatePlainTextChecklist = (): string => {
    let output = `=================================================================\n`;
    output += `CLAUSEWISE ACTION CHECKLIST: ${document.fileName}\n`;
    output += `Generated: ${new Date().toLocaleDateString()}\n`;
    output += `LEGAL DISCLAIMER: Informational tool only. Not legal advice.\n`;
    output += `=================================================================\n\n`;

    output += `1. QUESTIONS TO ASK A LICENSED ATTORNEY:\n`;
    output += `-----------------------------------------------------------------\n`;
    lawyerQuestions.forEach((q, idx) => {
      output += `[ ] ${idx + 1}. [${q.clause}]:\n    ${q.question}\n\n`;
    });

    output += `\n2. CRITICAL CALENDAR DEADLINES & NOTICE PERIODS:\n`;
    output += `-----------------------------------------------------------------\n`;
    deadlines.forEach((d, idx) => {
      output += `[ ] ${idx + 1}. ${d.section} - ${d.title} (${d.timeline}):\n    ${d.detail}\n\n`;
    });

    output += `\n3. CLAUSES RECOMMENDED FOR COMMERCIAL NEGOTIATION:\n`;
    output += `-----------------------------------------------------------------\n`;
    negotiationPoints.forEach((n, idx) => {
      output += `[ ] ${idx + 1}. ${n.section} (${n.title}):\n    ${n.proposal}\n\n`;
    });

    output += `\nEnd of Checklist. Review with legal counsel.\n`;
    return output;
  };

  const handleDownloadTxt = () => {
    const text = generatePlainTextChecklist();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = `ClauseWise_Checklist_${document.fileName.replace(/\.[^/.]+$/, "")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatePlainTextChecklist());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* MODAL HEADER */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <FileCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Action Checklist & Legal Review Items
              </h3>
              <p className="text-xs text-slate-500">
                Derived from {highRiskItems.length} High Risk and {mediumRiskItems.length} Medium Risk clauses
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            type="button"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* MODAL BODY (SCROLLABLE) */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-800">
          {/* DISCLAIMER BOX */}
          <div className="flex items-start gap-2.5 rounded-lg bg-amber-50 p-3 border border-amber-200 text-xs text-amber-900">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-700 mt-0.5" />
            <p>
              This checklist is synthesized automatically from your document&apos;s risk flags. It serves as preparation for consultation with an attorney, not legal advice.
            </p>
          </div>

          {/* SECTION 1: QUESTIONS TO ASK A LAWYER */}
          <div>
            <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-100">
              <HelpCircle className="h-4 w-4 text-slate-700" />
              <h4 className="text-sm font-semibold text-slate-900">
                1. Questions to Ask Your Attorney
              </h4>
            </div>
            <div className="space-y-2.5">
              {lawyerQuestions.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  No high or medium risk clauses flagged for legal questioning.
                </p>
              ) : (
                lawyerQuestions.map((q, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-slate-50/70 p-3 text-xs"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <div className="flex-1">
                      <span className="font-semibold text-slate-900 mr-1.5">
                        {q.clause}:
                      </span>
                      <span className="text-slate-700">{q.question}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* SECTION 2: DEADLINES TO TRACK */}
          <div>
            <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-100">
              <Calendar className="h-4 w-4 text-slate-700" />
              <h4 className="text-sm font-semibold text-slate-900">
                2. Deadlines, Notice Windows & Milestones
              </h4>
            </div>
            <div className="space-y-2.5">
              {deadlines.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  No explicit calendar windows or day counts detected.
                </p>
              ) : (
                deadlines.map((d, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 rounded-md border border-slate-200 bg-slate-50/70 p-3 text-xs"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-slate-900">
                          {d.section} — {d.title}
                        </span>
                        <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-medium text-amber-900">
                          {d.timeline}
                        </span>
                      </div>
                      <p className="text-slate-600 text-[11px]">{d.detail}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* SECTION 3: CLAUSES TO NEGOTIATE */}
          <div>
            <div className="flex items-center gap-2 pb-2 mb-3 border-b border-slate-100">
              <FileCheck className="h-4 w-4 text-slate-700" />
              <h4 className="text-sm font-semibold text-slate-900">
                3. Clauses Recommended for Commercial Negotiation
              </h4>
            </div>
            <div className="space-y-2.5">
              {negotiationPoints.length === 0 ? (
                <p className="text-xs text-slate-500 italic">
                  No high-risk terms requiring immediate renegotiation.
                </p>
              ) : (
                negotiationPoints.map((n, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 rounded-md border border-rose-200 bg-rose-50/30 p-3 text-xs"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 rounded border-rose-300 text-rose-900 focus:ring-rose-900"
                    />
                    <div className="flex-1">
                      <span className="font-semibold text-slate-900 mr-1.5">
                        {n.section} ({n.title}):
                      </span>
                      <span className="text-slate-700">{n.proposal}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* MODAL FOOTER & EXPORT BUTTONS */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3.5">
          <button
            onClick={handleCopy}
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? "Copied" : "Copy to Clipboard"}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
            >
              <Printer className="h-3.5 w-3.5" />
              <span>Print / PDF</span>
            </button>
            <button
              onClick={handleDownloadTxt}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-slate-800 transition"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Plain Text (.txt)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
