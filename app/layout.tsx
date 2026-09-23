import type { Metadata } from "next";
import "./globals.css";
import { ShieldAlert } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "ClauseWise — GenAI Legal Document Assistant",
  description:
    "Understand, compare, and navigate legal documents with plain-language simplification and grounded Q&A. Informational tool only.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-screen max-h-screen flex flex-col overflow-hidden font-body bg-[#F6F7F9] text-[#12203D]">
        {/* MANDATORY PERSISTENT LEGAL DISCLAIMER BANNER */}
        <aside
          aria-label="Legal Disclaimer"
          className="sticky top-0 z-50 flex h-[33px] flex-shrink-0 items-center justify-between border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 shadow-sm"
        >
          <div className="mx-auto flex max-w-7xl items-center gap-2 text-center md:text-left">
            <ShieldAlert className="h-4 w-4 shrink-0 text-amber-700" />
            <span>
              <strong>Legal Notice:</strong> ClauseWise helps you understand documents. It does not provide legal advice or judge enforceability. Always consult a licensed attorney for legal decisions.
            </span>
          </div>
        </aside>

        {/* TOP NAVIGATION HEADER */}
        <Navbar />

        {/* MAIN APPLICATION CONTAINER */}
        <main className="flex-1 min-h-0 flex flex-col overflow-y-auto">{children}</main>

        {/* MINIMAL TRUST FOOTER */}
        <Footer />
      </body>
    </html>
  );
}
