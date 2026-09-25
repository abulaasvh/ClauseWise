"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Scale,
  FileText,
  GitCompare,
  Database,
  Radio,
  User,
  Github,
  Linkedin,
  Mail,
} from "lucide-react";
import { SupabaseConfigModal } from "./SupabaseConfigModal";
import { isSupabaseConfigured } from "@/lib/supabase";

export const Navbar: React.FC = () => {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [hasSupabase, setHasSupabase] = useState(false);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const creatorRef = useRef<HTMLDivElement>(null);

  const showByokButton = process.env.NEXT_PUBLIC_SHOW_BYOK_BUTTON === "true";

  useEffect(() => {
    if (showByokButton) {
      setHasSupabase(isSupabaseConfigured());
    }
  }, [isConfigOpen, showByokButton]);

  useEffect(() => {
    if (!isCreatorOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (creatorRef.current && !creatorRef.current.contains(event.target as Node)) {
        setIsCreatorOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsCreatorOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isCreatorOpen]);

  return (
    <>
      <header className="border-b border-slate-200 bg-white sticky top-[33px] z-40 h-14 flex-shrink-0">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link
              href="/"
              aria-label="ClauseWise Home"
              className="flex items-center gap-2.5 font-semibold text-slate-900 tracking-tight text-base hover:opacity-90 transition rounded-md p-1 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 text-white shadow-sm">
                <Scale className="h-4 w-4" aria-hidden="true" />
              </div>
              <span>ClauseWise</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 uppercase tracking-wider">
                Informational AI
              </span>
            </Link>

            <nav aria-label="Main Navigation" className="hidden md:flex items-center gap-1">
              <Link
                href="/documents"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
              >
                <FileText className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                <span>Documents & Upload</span>
              </Link>
              <Link
                href="/compare"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
              >
                <GitCompare className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
                <span>Compare Contracts</span>
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            {/* CREATOR CREDIT POPOVER */}
            <div className="relative" ref={creatorRef}>
              <button
                type="button"
                onClick={() => setIsCreatorOpen((prev) => !prev)}
                className="flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-900 transition-colors rounded px-2 py-1 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                aria-expanded={isCreatorOpen}
                aria-haspopup="dialog"
                aria-label="Creator info and links"
              >
                <User size={14} aria-hidden="true" />
                <span className="font-medium">Creator</span>
              </button>

              {isCreatorOpen && (
                <div
                  role="dialog"
                  aria-label="Creator Information"
                  className="absolute right-0 top-full mt-2 z-50 w-48 rounded-lg border border-slate-200 bg-white p-3.5 shadow-md"
                >
                  <div className="text-sm font-semibold text-slate-900">
                    Abul aas V H
                  </div>
                  <div className="mt-2.5 flex items-center gap-3.5 text-slate-600">
                    <a
                      href="https://github.com/abulaasvh"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Abul aas V H GitHub profile (opens in new tab)"
                      title="GitHub"
                      className="hover:text-slate-900 transition-colors p-1 rounded focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                    >
                      <Github size={16} aria-hidden="true" />
                    </a>
                    <a
                      href="https://www.linkedin.com/in/abulaas-in/"
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Abul aas V H LinkedIn profile (opens in new tab)"
                      title="LinkedIn"
                      className="hover:text-slate-900 transition-colors p-1 rounded focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                    >
                      <Linkedin size={16} aria-hidden="true" />
                    </a>
                    <a
                      href="mailto:abulaasvh0553@gmail.com"
                      aria-label="Send email to Abul aas V H"
                      title="Email"
                      className="hover:text-slate-900 transition-colors p-1 rounded focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                    >
                      <Mail size={16} aria-hidden="true" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            {showByokButton && (
              <>
                <div className="h-4 w-px bg-slate-300" aria-hidden="true" />

                {/* BYOK (SUPABASE / FREE KEY SETUP) BUTTON - ONLY SHOWN IF TOGGLED ON */}
                <button
                  onClick={() => setIsConfigOpen(true)}
                  type="button"
                  aria-label={hasSupabase ? "Supabase Connected - Manage Database Settings" : "Connect Supabase or Free API Key"}
                  className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium border transition focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${hasSupabase
                      ? "bg-emerald-50 text-emerald-950 border-emerald-300 hover:bg-emerald-100"
                      : "bg-white text-slate-800 border-slate-300 hover:bg-slate-50"
                    }`}
                >
                  <Database className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
                  <span>{hasSupabase ? "Supabase Connected" : "Connect Supabase / Free Key"}</span>
                  {hasSupabase && (
                    <Radio className="h-2.5 w-2.5 text-emerald-700 animate-pulse ml-0.5" aria-hidden="true" />
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {showByokButton && (
        <SupabaseConfigModal
          isOpen={isConfigOpen}
          onClose={() => {
            setIsConfigOpen(false);
            setHasSupabase(isSupabaseConfigured());
          }}
        />
      )}
    </>
  );
};
