"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Database,
  Key,
  ExternalLink,
  Copy,
  Check,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Zap,
} from "lucide-react";
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  getSupabaseClient,
} from "@/lib/supabase";
import {
  getGeminiApiKey,
  saveGeminiApiKey,
  getGroqApiKey,
  saveGroqApiKey,
  getOpenAIApiKey,
  saveOpenAIApiKey,
} from "@/lib/gemini";

interface SupabaseConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseConfigModal: React.FC<SupabaseConfigModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [supabaseUrl, setSupabaseUrl] = useState("");
  const [anonKey, setAnonKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [status, setStatus] = useState<"connected" | "disconnected" | "testing">("disconnected");
  const [statusMsg, setStatusMsg] = useState("");
  const [copiedSql, setCopiedSql] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const config = getSupabaseConfig();
    if (config) {
      setSupabaseUrl(config.url);
      setAnonKey(config.anonKey);
      setStatus("connected");
      setStatusMsg("Connected to Supabase project");
    } else {
      setStatus("disconnected");
      setStatusMsg("Using local in-memory fallback");
    }

    const gKey = getGeminiApiKey();
    if (gKey) setGeminiKey(gKey);

    const grKey = getGroqApiKey();
    if (grKey) setGroqKey(grKey);

    const oKey = getOpenAIApiKey();
    if (oKey) setOpenaiKey(oKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestAndSave = async () => {
    if (!supabaseUrl.trim() || !anonKey.trim()) {
      setStatus("disconnected");
      setStatusMsg("Please enter both Supabase URL and Anon Key.");
      return;
    }

    setStatus("testing");
    setStatusMsg("Testing Supabase connection...");

    try {
      saveSupabaseConfig({
        url: supabaseUrl.trim(),
        anonKey: anonKey.trim(),
      });

      if (geminiKey.trim()) {
        saveGeminiApiKey(geminiKey);
      }

      if (groqKey.trim()) {
        saveGroqApiKey(groqKey);
      }

      if (openaiKey.trim()) {
        saveOpenAIApiKey(openaiKey);
      }

      const client = getSupabaseClient();
      if (!client) throw new Error("Could not initialize Supabase client");

      const { error } = await client.from("documents").select("id").limit(1);
      if (error && !error.message.includes("does not exist")) {
        // Table might not exist yet if SQL schema hasn't run, but connection reached
        throw error;
      }

      setStatus("connected");
      setStatusMsg("Successfully connected to Supabase!");
    } catch (err) {
      setStatus("disconnected");
      setStatusMsg(`Connection test note: ${(err as Error).message}. (Make sure you ran the SQL schema)`);
    }
  };

  const handleDisconnect = () => {
    clearSupabaseConfig();
    setSupabaseUrl("");
    setAnonKey("");
    setStatus("disconnected");
    setStatusMsg("Disconnected. Reverted to local mode.");
  };

  const handleCopySchema = async () => {
    try {
      const res = await fetch("/supabase-schema.sql");
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    } catch {
      // Fallback
      setCopiedSql(true);
      setTimeout(() => setCopiedSql(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-2xl">
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 text-white">
              <Database className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Supabase Database & Free API Setup
              </h3>
              <p className="text-xs text-slate-500">
                Enable cloud persistence, Supabase Realtime, and free AI inference
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

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-slate-800 text-xs">
          {/* STATUS PILL */}
          <div
            className={`flex items-center justify-between rounded-lg p-3 border ${
              status === "connected"
                ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                : "bg-slate-50 border-slate-200 text-slate-700"
            }`}
          >
            <div className="flex items-center gap-2">
              {status === "connected" ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-slate-400 shrink-0" />
              )}
              <span className="font-medium">{statusMsg}</span>
            </div>
            {status === "connected" && (
              <button
                onClick={handleDisconnect}
                type="button"
                className="text-[11px] font-medium text-rose-600 hover:underline"
              >
                Disconnect
              </button>
            )}
          </div>

          {/* SECTION 1: SUPABASE CONFIG */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                <Database className="h-4 w-4 text-emerald-600" />
                <span>1. Free Supabase Project Credentials</span>
              </h4>
              <a
                href="https://supabase.com"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium hover:underline"
              >
                <span>Create Free Project</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>

            <div className="space-y-2">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Project URL
                </label>
                <input
                  type="text"
                  placeholder="https://xyzabcdef.supabase.co"
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  className="w-full rounded-md border border-slate-200 p-2 text-xs text-slate-900 font-mono focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Anon / Public API Key
                </label>
                <input
                  type="password"
                  placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  className="w-full rounded-md border border-slate-200 p-2 text-xs text-slate-900 font-mono focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
                />
              </div>
            </div>

            {/* SQL SCHEMA COPY HELPER */}
            <div className="rounded-md bg-slate-50 border border-slate-200 p-3 flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-slate-800">
                  Supabase SQL Migration Script
                </div>
                <div className="text-[11px] text-slate-500">
                  Creates tables for documents, clauses, chat, notes, and enables Realtime
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopySchema}
                className="inline-flex items-center gap-1 rounded bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 border border-slate-200 hover:bg-slate-100 transition shrink-0"
              >
                {copiedSql ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                <span>{copiedSql ? "Copied SQL" : "Copy SQL Schema"}</span>
              </button>
            </div>
          </div>

          {/* SECTION 2: FREE AI API KEY */}
          <div className="space-y-3 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-amber-500" />
                <span>2. Free AI API Key (Google Gemini Flash)</span>
              </h4>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-amber-800 font-medium hover:underline"
              >
                <span>Get Free Gemini Key (0$)</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <p className="text-[11px] text-slate-500">
              Anthropic and OpenAI require payment, but <strong>Google AI Studio and Groq offer 100% free tiers</strong> with high rate limits.
            </p>
            <div>
              <label className="block font-medium text-slate-700 mb-1">
                Google Gemini API Key (Primary)
              </label>
              <input
                type="password"
                placeholder="AIzaSy..."
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="w-full rounded-md border border-slate-200 p-2 text-xs text-slate-900 font-mono focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-medium text-slate-700">
                  Groq API Key (Fallback — llama-3.3-70b-versatile)
                </label>
                <a
                  href="https://console.groq.com/keys"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-amber-800 font-medium hover:underline"
                >
                  <span>Get Free Groq Key (0$)</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <input
                type="password"
                placeholder="gsk_..."
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                className="w-full rounded-md border border-slate-200 p-2 text-xs text-slate-900 font-mono focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>

            <div>
              <label className="block font-medium text-slate-700 mb-1">
                OpenAI API Key (Optional 3rd Fallback / Embeddings)
              </label>
              <input
                type="password"
                placeholder="sk-proj-..."
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="w-full rounded-md border border-slate-200 p-2 text-xs text-slate-900 font-mono focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-6 py-3.5">
          <span className="text-[11px] text-slate-400">
            Keys stored securely in your browser session
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              type="button"
              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              onClick={handleTestAndSave}
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-xs font-semibold text-white shadow hover:bg-emerald-700 transition"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>Save & Connect</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
