"use client";

import React, { useState, useRef, useEffect } from "react";
import { ChatMessage, Citation } from "@/lib/types";
import {
  Send,
  MessageSquare,
  Sparkles,
  ExternalLink,
  Trash2,
  Radio,
  ChevronDown,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import {
  getSupabaseClient,
  saveChatMessageToSupabase,
  fetchChatMessagesFromSupabase,
} from "@/lib/supabase";

interface ChatPanelProps {
  documentId: string;
  onCitationClick?: (clauseId: string) => void;
}

const SUGGESTED_QUESTIONS = [
  "What are the termination requirements and notice periods?",
  "Does this contract automatically renew?",
  "What is the maximum limitation of liability?",
  "What indemnification obligations exist?",
];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  documentId,
  onCitationClick,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLongWait, setIsLongWait] = useState(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState(false);
  const [expandedCitations, setExpandedCitations] = useState<Record<string, boolean>>({});
  const [isSuggestedOpen, setIsSuggestedOpen] = useState(false);

  const messageListRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastFailedQueryRef = useRef<string>("");

  // Load chat messages from Supabase / local on mount
  useEffect(() => {
    let mounted = true;

    const loadHistory = async () => {
      const persisted = await fetchChatMessagesFromSupabase(documentId);
      if (mounted && persisted.length > 0) {
        setMessages(persisted);
      } else if (mounted) {
        setMessages([
          {
            id: "welcome-msg",
            role: "assistant",
            content:
              "Hello. I can answer questions grounded strictly in this document's text. Ask about termination, liability caps, warranties, payment obligations, or auto-renewals.",
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          },
        ]);
      }
    };

    loadHistory();

    const client = getSupabaseClient();
    if (client) {
      setIsRealtimeActive(true);
      const channel = client
        .channel(`chat_${documentId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "chat_messages",
            filter: `document_id=eq.${documentId}`,
          },
          (payload) => {
            const newRow = payload.new as {
              id: string;
              role: "user" | "assistant";
              content: string;
              citations: Citation[];
              hallucination_audit?: any;
              created_at: string;
            };
            setMessages((prev) => {
              if (prev.some((m) => m.id === newRow.id)) return prev;
              return [
                ...prev,
                {
                  id: newRow.id,
                  role: newRow.role,
                  content: newRow.content,
                  citations: newRow.citations || [],
                  hallucination: newRow.hallucination_audit || undefined,
                  timestamp: new Date(newRow.created_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                },
              ];
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
  }, [documentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const toggleCitation = (msgId: string) => {
    setExpandedCitations((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  const handleSend = async (textToSend?: string) => {
    const q = (textToSend || input).trim();
    if (!q || isLoading) return;

    lastFailedQueryRef.current = q;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: q,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!textToSend) setInput("");
    setIsLoading(true);
    setIsLongWait(false);

    saveChatMessageToSupabase(userMessage, documentId).catch(() => {});

    const longWaitTimer = setTimeout(() => {
      setIsLongWait(true);
    }, 6000);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          question: q,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errObj = Object.assign(
          new Error(data.message ?? data.error ?? "Failed to retrieve grounded answer."),
          {
            category: data.category ?? "UNKNOWN",
            requestId: data.requestId ?? "",
            message: data.message ?? data.error ?? "Failed to retrieve grounded answer.",
          }
        );
        throw errObj;
      }

      const assistantId = `assistant-${Date.now()}`;
      const assistantMessage: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: data.answer,
        citations: data.citations || [],
        hallucination: data.hallucination || undefined,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      if (data.citations && data.citations.length > 0) {
        setExpandedCitations((prev) => ({ ...prev, [assistantId]: true }));
      }

      setMessages((prev) => [...prev, assistantMessage]);
      saveChatMessageToSupabase(assistantMessage, documentId).catch(() => {});
    } catch (err) {
      const typedErr = err as { category?: string; requestId?: string; message?: string };
      const category = typedErr.category ?? "UNKNOWN";
      const requestId = typedErr.requestId ?? "";
      const userMessageText =
        typedErr.message ?? "Something went wrong while retrieving the answer. Please try again.";

      const errorMessage: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: userMessageText,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        isError: true,
        errorCategory: category,
        requestId,
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      clearTimeout(longWaitTimer);
      setIsLoading(false);
      setIsLongWait(false);
    }
  };

  const handleRetry = (queryToRetry?: string) => {
    const q = queryToRetry || lastFailedQueryRef.current;
    if (q) {
      handleSend(q);
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: "welcome-cleared",
        role: "assistant",
        content: "Chat history cleared. How can I assist with this document?",
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
    ]);
    setExpandedCitations({});
    setIsSuggestedOpen(false);
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-white overflow-hidden">
      {/* 1. HEADER (FIXED TOP) */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 text-white shadow-2xs">
            <MessageSquare className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-900">
                Grounded Q&A
              </h2>
              {isRealtimeActive && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-950 font-medium bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-300">
                  <Radio className="h-2.5 w-2.5 animate-pulse text-emerald-700" aria-hidden="true" />
                  Realtime
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600">
              Strictly cited from document text
            </p>
          </div>
        </div>

        <button
          onClick={handleClearHistory}
          type="button"
          aria-label="Clear chat history"
          className="rounded p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
          title="Clear Chat History"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {/* 2. CHAT SCROLLABLE BODY */}
      <div
        ref={messageListRef}
        tabIndex={0}
        aria-label="Chat conversation history"
        className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3.5 focus-visible:ring-1 focus-visible:ring-teal-600 focus-visible:outline-none"
      >
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const isExpanded = !!expandedCitations[msg.id];

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed ${
                  isUser
                    ? "bg-slate-900 text-white"
                    : msg.isError
                    ? "bg-amber-50 text-amber-950 border border-amber-300"
                    : "bg-slate-100 text-slate-900 border border-slate-200"
                }`}
              >
                {msg.isError ? (
                  <div className="space-y-2">
                    <div className="flex items-start gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0 mt-0.5" aria-hidden="true" />
                      <p>{msg.content}</p>
                    </div>

                    <div className="flex items-center justify-between pt-1 border-t border-amber-200 text-[10px]">
                      {msg.requestId && (
                        <span className="font-mono text-amber-900">
                          Ref: {msg.requestId}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRetry()}
                        disabled={isLoading}
                        aria-label="Retry failed query"
                        className="inline-flex items-center gap-1 font-semibold text-amber-950 hover:underline disabled:opacity-50 ml-auto focus-visible:ring-2 focus-visible:ring-teal-600"
                      >
                        <RefreshCw className="h-2.5 w-2.5" aria-hidden="true" />
                        <span>Try again</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-line">{msg.content}</p>

                    {/* CITATION EXPANDER */}
                    {msg.citations && msg.citations.length > 0 && (
                      <div className="mt-2.5 pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => toggleCitation(msg.id)}
                          aria-expanded={isExpanded}
                          aria-label={`Toggle citations (${msg.citations.length} excerpts)`}
                          className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-700 hover:text-slate-950 py-0.5 rounded focus-visible:ring-2 focus-visible:ring-teal-600"
                        >
                          <span className="flex items-center gap-1">
                            <Sparkles className="h-3 w-3 text-amber-600 shrink-0" aria-hidden="true" />
                            <span>Retrieved Excerpts ({msg.citations.length})</span>
                          </span>
                          <ChevronDown
                            aria-hidden="true"
                            className={`h-3.5 w-3.5 text-slate-600 transition-transform duration-200 ${
                              isExpanded ? "rotate-180 text-slate-900" : ""
                            }`}
                          />
                        </button>

                        {isExpanded && (
                          <div className="mt-2 flex flex-col gap-1.5 pt-1">
                            {msg.citations.map((cite, i) => (
                              <div
                                key={i}
                                className="rounded bg-white border border-slate-200 p-2 text-[11px] shadow-2xs hover:border-slate-300 transition"
                              >
                                <button
                                  type="button"
                                  onClick={() => onCitationClick && onCitationClick(cite.clauseId)}
                                  aria-label={`Navigate to cited section: ${cite.sectionNumber} ${cite.title}`}
                                  className="w-full flex items-center justify-between text-left group font-semibold text-slate-900 rounded focus-visible:ring-2 focus-visible:ring-teal-600"
                                >
                                  <span className="group-hover:underline truncate mr-1">
                                    {cite.sectionNumber} — {cite.title}
                                  </span>
                                  <ExternalLink className="h-3 w-3 text-slate-600 group-hover:text-slate-900 shrink-0" aria-hidden="true" />
                                </button>
                                {cite.snippet && (
                                  <p className="mt-1 text-[10.5px] text-slate-600 italic bg-slate-50 p-1.5 rounded border border-slate-100 line-clamp-3">
                                    &ldquo;{cite.snippet.trim()}&rdquo;
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              <span className="text-[10px] text-slate-500 mt-1 px-1 font-medium">
                {msg.timestamp}
              </span>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex flex-col items-start transition-opacity duration-200" role="status" aria-live="polite">
            <div className="max-w-[88%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed bg-slate-100 text-slate-900 border border-slate-200/80 shadow-2xs">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 py-0.5 px-0.5" aria-hidden="true">
                  <span className="typing-dot typing-dot-1 h-1.5 w-1.5 rounded-full bg-slate-700" />
                  <span className="typing-dot typing-dot-2 h-1.5 w-1.5 rounded-full bg-slate-700" />
                  <span className="typing-dot typing-dot-3 h-1.5 w-1.5 rounded-full bg-slate-700" />
                </div>
                <span className="text-xs text-slate-700 font-medium">
                  {isLongWait
                    ? "Still checking — this can take a moment"
                    : "Reading the document..."}
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} className="h-1" />
      </div>

      {/* 3. FIXED BOTTOM CONTAINER */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white shadow-xs">
        {/* COLLAPSIBLE SUGGESTED QUESTIONS */}
        <div className="border-b border-slate-100 bg-slate-50/80">
          <button
            type="button"
            onClick={() => setIsSuggestedOpen((prev) => !prev)}
            aria-expanded={isSuggestedOpen}
            aria-label="Toggle suggested questions list"
            className="w-full flex items-center justify-between px-3.5 py-2 text-[11px] font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
              <span>Suggested questions</span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={`h-3.5 w-3.5 text-slate-600 transition-transform duration-200 ${
                isSuggestedOpen ? "rotate-180 text-slate-900" : ""
              }`}
            />
          </button>

          {isSuggestedOpen && (
            <div className="px-3.5 pb-2.5 pt-1 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto" role="group" aria-label="Suggested Questions">
              {SUGGESTED_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    handleSend(q);
                    setIsSuggestedOpen(false);
                  }}
                  disabled={isLoading}
                  className="rounded-full bg-white hover:bg-slate-100 border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-800 transition disabled:opacity-50 text-left shadow-2xs hover:border-slate-400 focus-visible:ring-2 focus-visible:ring-teal-600"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* INPUT BAR */}
        <div className="p-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-2"
          >
            <label htmlFor="chat-user-input" className="sr-only">
              Ask a question about this contract
            </label>
            <input
              id="chat-user-input"
              type="text"
              placeholder="Ask a question about this contract..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              aria-label="Ask a question about this contract"
              className="flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600 transition"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label="Send question"
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-xs hover:bg-slate-800 transition disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
