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
} from "lucide-react";
import {
  getSupabaseClient,
  saveChatMessageToSupabase,
  fetchChatMessagesFromSupabase,
  isSupabaseConfigured,
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

    // Supabase Realtime Subscription
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

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
    }
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  };

  // Auto-scroll to bottom whenever messages change or loading indicator updates
  useEffect(() => {
    scrollToBottom("smooth");
  }, [messages, isLoading, isLongWait]);

  // Track long requests (>15 seconds) to update loading status message
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isLoading) {
      setIsLongWait(false);
      timer = setTimeout(() => {
        setIsLongWait(true);
      }, 15000);
    } else {
      setIsLongWait(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [isLoading]);

  const toggleCitations = (msgId: string) => {
    setExpandedCitations((prev) => {
      const nextState = !prev[msgId];
      // Small timeout to scroll into view if expanding
      if (nextState) {
        setTimeout(() => scrollToBottom("smooth"), 50);
      }
      return { ...prev, [msgId]: nextState };
    });
  };

  const handleSend = async (queryText?: string) => {
    const textToSend = (queryText || input).trim();
    if (!textToSend || isLoading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setIsLongWait(false);
    setIsSuggestedOpen(false);

    // Save user message to Supabase
    saveChatMessageToSupabase(userMessage, documentId).catch(() => { });

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId,
          question: textToSend,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to retrieve grounded answer.");
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

      // Automatically expand citations for the fresh response if available
      if (data.citations && data.citations.length > 0) {
        setExpandedCitations((prev) => ({ ...prev, [assistantId]: true }));
      }

      setMessages((prev) => [...prev, assistantMessage]);

      // Save assistant message to Supabase
      saveChatMessageToSupabase(assistantMessage, documentId).catch(() => { });
    } catch (err) {
      const rawMsg = (err as Error).message || "";
      const errMsg = rawMsg.includes("AI service temporarily unavailable")
        ? "AI service temporarily unavailable, please try again."
        : rawMsg || "AI service temporarily unavailable, please try again.";

      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: errMsg,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        },
      ]);
    } finally {
      setIsLoading(false);
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
          <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-900 text-white">
            <MessageSquare className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-900">
                Grounded Q&A
              </h2>
              {isRealtimeActive && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-medium bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-200">
                  <Radio className="h-2.5 w-2.5 animate-pulse text-emerald-600" />
                  Realtime
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500">
              Strictly cited from document text
            </p>
          </div>
        </div>

        <button
          onClick={handleClearHistory}
          type="button"
          className="rounded p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          title="Clear Chat History"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 2. MESSAGES LIST (THE ONLY SCROLLABLE AREA) */}
      <div
        ref={messageListRef}
        className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4"
      >
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          const isError = msg.id.startsWith("err-");
          const hasCitations = Boolean(msg.citations && msg.citations.length > 0);
          const isExpanded = expandedCitations[msg.id] ?? false;

          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[88%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed ${isUser
                    ? "bg-slate-900 text-white"
                    : isError
                      ? "bg-rose-50 text-rose-900 border border-rose-200"
                      : "bg-slate-100 text-slate-900 border border-slate-200/80"
                  }`}
              >
                {isError && (
                  <div className="flex items-center gap-1.5 font-semibold text-rose-700 mb-1">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    <span>Service Notice</span>
                  </div>
                )}
                <div className="whitespace-pre-line">{msg.content}</div>

                {/* EXPANDABLE CITATIONS / RETRIEVED EXCERPTS SECTION */}
                {hasCitations && msg.citations && (
                  <div className="mt-3 pt-2.5 border-t border-slate-200/70">
                    <button
                      type="button"
                      onClick={() => toggleCitations(msg.id)}
                      className="w-full flex items-center justify-between text-left text-[10px] font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-900 transition py-0.5"
                    >
                      <span className="flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-amber-500 shrink-0" />
                        <span>Retrieved Excerpts ({msg.citations.length})</span>
                      </span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180 text-slate-700" : ""
                          }`}
                      />
                    </button>

                    {/* EXPANDABLE BODY - EXPANDS WITHIN SCROLLABLE MESSAGE LIST */}
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
                              className="w-full flex items-center justify-between text-left group font-semibold text-slate-900"
                            >
                              <span className="group-hover:underline truncate mr-1">
                                {cite.sectionNumber} — {cite.title}
                              </span>
                              <ExternalLink className="h-3 w-3 text-slate-400 group-hover:text-slate-700 shrink-0" />
                            </button>
                            {cite.snippet && (
                              <p className="mt-1 text-[10.5px] text-slate-500 italic bg-slate-50 p-1.5 rounded border border-slate-100 line-clamp-3">
                                &ldquo;{cite.snippet.trim()}&rdquo;
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-400 mt-1 px-1">
                {msg.timestamp}
              </span>
            </div>
          );
        })}

        {isLoading && (
          <div className="flex flex-col items-start transition-opacity duration-200">
            <div className="max-w-[88%] rounded-lg px-3.5 py-2.5 text-xs leading-relaxed bg-slate-100 text-slate-900 border border-slate-200/80 shadow-2xs">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 py-0.5 px-0.5" aria-hidden="true">
                  <span className="typing-dot typing-dot-1 h-1.5 w-1.5 rounded-full bg-slate-600" />
                  <span className="typing-dot typing-dot-2 h-1.5 w-1.5 rounded-full bg-slate-600" />
                  <span className="typing-dot typing-dot-3 h-1.5 w-1.5 rounded-full bg-slate-600" />
                </div>
                <span className="text-xs text-slate-600 font-medium">
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

      {/* 3. FIXED BOTTOM CONTAINER (NEVER SCROLLS, NEVER PUSHED OUT OF VIEW) */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-white shadow-xs">
        {/* COLLAPSIBLE SUGGESTED QUESTIONS DROPDOWN (DEFAULT COLLAPSED) */}
        <div className="border-b border-slate-100 bg-slate-50/80">
          <button
            type="button"
            onClick={() => setIsSuggestedOpen((prev) => !prev)}
            className="w-full flex items-center justify-between px-3.5 py-2 text-[11px] font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition"
          >
            <span className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>Suggested questions</span>
            </span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isSuggestedOpen ? "rotate-180 text-slate-700" : ""
                }`}
            />
          </button>

          {isSuggestedOpen && (
            <div className="px-3.5 pb-2.5 pt-1 flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
              {SUGGESTED_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    handleSend(q);
                    setIsSuggestedOpen(false);
                  }}
                  disabled={isLoading}
                  className="rounded-full bg-white hover:bg-slate-100 border border-slate-200 px-2.5 py-1 text-[11px] text-slate-700 transition disabled:opacity-50 text-left shadow-2xs hover:border-slate-300"
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
            <input
              type="text"
              placeholder="Ask a question about this contract..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              className="flex-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:bg-white focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400 transition"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-slate-800 transition disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
