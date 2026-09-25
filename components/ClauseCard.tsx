import React, { useState } from "react";
import { ClauseAnalysis, ClauseChunk } from "@/lib/types";
import { RiskBadge } from "./RiskBadge";
import {
  ArrowUpRight,
  Sparkles,
  Tag,
  ShieldCheck,
  RefreshCw,
  StickyNote,
  Plus,
} from "lucide-react";
import { saveClauseNoteToSupabase, ClauseNote } from "@/lib/supabase";

interface ClauseCardProps {
  chunk: ClauseChunk;
  documentId?: string;
  analysis?: ClauseAnalysis;
  notes?: ClauseNote[];
  isSelected?: boolean;
  onSelect?: () => void;
  onReanalyze?: () => void;
  isReanalyzing?: boolean;
}

export const ClauseCard: React.FC<ClauseCardProps> = ({
  chunk,
  documentId,
  analysis,
  notes: initialNotes = [],
  isSelected = false,
  onSelect,
  onReanalyze,
  isReanalyzing = false,
}) => {
  const riskLevel = analysis?.risk_level || "LOW";
  const [notes, setNotes] = useState<ClauseNote[]>(initialNotes);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  const borderColor = {
    LOW: "border-emerald-200/80 hover:border-emerald-300",
    MEDIUM: "border-amber-200/80 hover:border-amber-300",
    HIGH: "border-rose-300 hover:border-rose-400",
  }[riskLevel];

  const riskTopAccent = {
    LOW: "border-t-emerald-500",
    MEDIUM: "border-t-amber-500",
    HIGH: "border-t-rose-500",
  }[riskLevel];

  const handleAddNote = async () => {
    if (!noteInput.trim() || !documentId) return;
    setIsSavingNote(true);
    try {
      const created = await saveClauseNoteToSupabase(
        chunk.id,
        documentId,
        noteInput.trim()
      );
      if (created) {
        setNotes((prev) => [...prev, created]);
        setNoteInput("");
        setShowNoteInput(false);
      }
    } finally {
      setIsSavingNote(false);
    }
  };

  return (
    <div
      id={`analysis-card-${chunk.id}`}
      className={`rounded-lg border bg-white p-4 shadow-2xs transition-all duration-200 border-t-2 ${borderColor} ${riskTopAccent} ${
        isSelected ? "ring-2 ring-slate-900 shadow-md bg-slate-50/50" : ""
      }`}
    >
      {/* HEADER: Category + Risk Badge */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-800 tracking-wide">
            <Tag className="h-3 w-3 text-slate-600" aria-hidden="true" />
            <span>{analysis?.category || "General Provision"}</span>
          </span>
          <span className="text-xs font-semibold text-slate-600">
            {chunk.sectionNumber}
          </span>
        </div>

        <div className="shrink-0">
          <RiskBadge level={riskLevel} reason={analysis?.risk_reason} />
        </div>
      </div>

      {/* PLAIN LANGUAGE SUMMARY */}
      <div className="mb-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 mb-1 flex items-center gap-1">
          <Sparkles className="h-3 w-3 text-amber-600" aria-hidden="true" />
          <span>Plain-Language Summary</span>
        </div>
        <p className="text-sm leading-relaxed text-slate-900 font-normal">
          {analysis?.plain_summary || "Analyzing clause language..."}
        </p>
      </div>

      {/* RISK REASON (FACTUAL, NOT ADVISORY) */}
      {analysis?.risk_reason && (
        <div className="mb-3 rounded-md bg-slate-50 p-2.5 border border-slate-200 text-xs">
          <div className="font-semibold text-slate-800 mb-0.5 flex items-center gap-1">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
            <span>Risk Assessment Factor</span>
          </div>
          <p className="text-slate-700 leading-normal">{analysis.risk_reason}</p>
        </div>
      )}

      {/* KEY TERMS / NUMBERS */}
      {analysis?.key_terms && analysis.key_terms.length > 0 && (
        <div className="mb-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
            Key Figures & Defined Terms
          </div>
          <div className="flex flex-wrap gap-1.5">
            {analysis.key_terms.map((term, idx) => (
              <span
                key={idx}
                className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-800 border border-slate-200"
              >
                {term}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* USER NOTES (REAL-TIME DATABASE PERSISTENCE) */}
      {notes.length > 0 && (
        <div className="mb-3 space-y-1.5 pt-2 border-t border-slate-100">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-900 flex items-center gap-1">
            <StickyNote className="h-3 w-3" aria-hidden="true" />
            <span>Attorney & Review Notes</span>
          </div>
          {notes.map((note) => (
            <div
              key={note.id}
              className="rounded bg-amber-50 border border-amber-200 p-2 text-xs text-amber-950"
            >
              {note.noteText}
            </div>
          ))}
        </div>
      )}

      {/* ADD NOTE FORM */}
      {showNoteInput && (
        <div className="mb-3 pt-2 border-t border-slate-100">
          <label htmlFor={`note-input-${chunk.id}`} className="sr-only">
            Add note for legal review on {chunk.sectionNumber}
          </label>
          <textarea
            id={`note-input-${chunk.id}`}
            rows={2}
            placeholder="Add note for legal review..."
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            className="w-full rounded border border-slate-300 p-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-600"
          />
          <div className="flex items-center justify-end gap-1.5 mt-1.5">
            <button
              type="button"
              onClick={() => setShowNoteInput(false)}
              className="text-[11px] font-medium text-slate-600 hover:text-slate-900 px-2 py-1 rounded focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddNote}
              disabled={isSavingNote || !noteInput.trim()}
              className="rounded bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              {isSavingNote ? "Saving..." : "Save Note"}
            </button>
          </div>
        </div>
      )}

      {/* CARD FOOTER & ACTIONS */}
      <div className="flex items-center justify-between pt-2.5 border-t border-slate-100 text-xs text-slate-600">
        <div className="flex items-center gap-3">
          <button
            onClick={onSelect}
            type="button"
            aria-label={`Highlight original text of ${chunk.sectionNumber}`}
            className="inline-flex items-center gap-1 font-semibold text-slate-800 hover:text-slate-950 transition hover:underline rounded p-0.5 focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            <span>Highlight Original Text</span>
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {documentId && !showNoteInput && (
            <button
              type="button"
              onClick={() => setShowNoteInput(true)}
              aria-label={`Add review note for ${chunk.sectionNumber}`}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 transition rounded p-0.5 focus-visible:ring-2 focus-visible:ring-teal-600"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
              <span>Add Note</span>
            </button>
          )}
        </div>

        {onReanalyze && (
          <button
            onClick={onReanalyze}
            disabled={isReanalyzing}
            type="button"
            aria-label={`Re-evaluate clause analysis for ${chunk.sectionNumber}`}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 transition disabled:opacity-50 rounded p-0.5 focus-visible:ring-2 focus-visible:ring-teal-600"
            title="Re-run AI extraction"
          >
            <RefreshCw
              className={`h-3 w-3 ${isReanalyzing ? "animate-spin" : ""}`}
              aria-hidden="true"
            />
            <span>{isReanalyzing ? "Analyzing..." : "Re-evaluate"}</span>
          </button>
        )}
      </div>
    </div>
  );
};
