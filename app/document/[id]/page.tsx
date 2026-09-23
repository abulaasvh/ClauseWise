"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ParsedDocument } from "@/lib/types";
import { DocumentViewer } from "@/components/DocumentViewer";
import { ChatPanel } from "@/components/ChatPanel";
import { ChecklistModal } from "@/components/ChecklistModal";
import {
  ArrowLeft,
  MessageSquare,
  GitCompare,
  Download,
  Loader2,
  AlertTriangle,
  SidebarClose,
  SidebarOpen,
} from "lucide-react";
import Link from "next/link";

export default function DocumentWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const docId = params.id as string;

  const [document, setDocument] = useState<ParsedDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedClauseId, setSelectedClauseId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(true);
  const [isChecklistOpen, setIsChecklistOpen] = useState(false);

  useEffect(() => {
    if (!docId) return;
    const fetchDocument = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/document/${docId}`);
        if (!res.ok) {
          throw new Error("Failed to load document.");
        }
        const data = await res.json();
        setDocument(data.document);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchDocument();
  }, [docId]);

  const handleCitationClick = (clauseId: string) => {
    setSelectedClauseId(clauseId);
    // Find the original text element in DocumentViewer
    const elem = window.document.getElementById(`orig-clause-${clauseId}`);
    if (elem) {
      elem.scrollIntoView({ behavior: "smooth", block: "center" });
      elem.classList.add("highlight-pulse");
      setTimeout(() => elem.classList.remove("highlight-pulse"), 2500);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-slate-800 mb-3" />
        <p className="text-sm font-medium">Loading document and clause embeddings...</p>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center py-24 text-center px-4">
        <div className="h-10 w-10 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Document Not Found</h2>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          {error || "The requested contract could not be located in session storage."}
        </p>
        <Link
          href="/"
          className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
        >
          Return to Upload
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
      {/* SECONDARY NAVIGATION BAR */}
      <div className="h-11 flex-shrink-0 border-b border-slate-200 bg-white px-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-900 transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>All Documents</span>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-slate-800 truncate max-w-xs sm:max-w-md">
            {document.fileName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/compare?base=${document.id}`}
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 font-medium transition"
          >
            <GitCompare className="h-3.5 w-3.5" />
            <span>Compare with Another</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsChecklistOpen(true)}
            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-slate-800 hover:bg-slate-200 font-medium transition"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Action Checklist</span>
          </button>

          <button
            type="button"
            onClick={() => setIsChatOpen(!isChatOpen)}
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition ${
              isChatOpen
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{isChatOpen ? "Hide Chat" : "Ask Q&A"}</span>
          </button>
        </div>
      </div>

      {/* MAIN THREE-COLUMN WORKSPACE CONTAINER: Left = Verbatim, Middle = Analysis, Right = Chat */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* DOCUMENT VIEWER (Left 2 columns: verbatim text & simplified cards) */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
          <DocumentViewer
            document={document}
            selectedClauseId={selectedClauseId}
            onSelectClause={(id) => setSelectedClauseId(id)}
            onGenerateChecklist={() => setIsChecklistOpen(true)}
          />
        </div>

        {/* CHAT PANEL (Right Drawer / 3rd Column) */}
        {isChatOpen && (
          <aside aria-label="Grounded Q&A Chat" className="w-full sm:w-80 md:w-96 flex-shrink-0 flex flex-col h-full min-h-0 shadow-lg z-20 border-l border-slate-200">
            <ChatPanel
              documentId={document.id}
              onCitationClick={handleCitationClick}
            />
          </aside>
        )}
      </div>

      {/* ACTION CHECKLIST MODAL */}
      <ChecklistModal
        document={document}
        isOpen={isChecklistOpen}
        onClose={() => setIsChecklistOpen(false)}
      />
    </div>
  );
}
