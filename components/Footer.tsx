"use client";

import React from "react";
import { usePathname } from "next/navigation";

export const Footer: React.FC = () => {
  const pathname = usePathname();

  // Do not render footer on document workspace view to maintain strict full-height 3-column independent layout
  if (pathname?.startsWith("/document/")) {
    return null;
  }

  return (
    <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-600 flex-shrink-0">
      <div className="mx-auto max-w-7xl px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <div>ClauseWise Document Assistant &copy; 2026. Non-attorney informational system.</div>
        <div className="flex items-center gap-4 text-[11px] text-slate-500 font-medium">
          <span>RAG Chunking</span>
          <span aria-hidden="true">•</span>
          <span>Semantic Alignment</span>
          <span aria-hidden="true">•</span>
          <span>Guardrailed Inference</span>
        </div>
      </div>
    </footer>
  );
};
