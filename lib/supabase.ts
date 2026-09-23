import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ParsedDocument, ChatMessage, ClauseChunk, ClauseAnalysis } from "./types";

let cachedClient: SupabaseClient | null = null;

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/**
 * Retrieve Supabase configuration from environment or localStorage
 */
export function getSupabaseConfig(): SupabaseConfig | null {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const envKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (envUrl && envKey && !envUrl.includes("your-project")) {
    return { url: envUrl, anonKey: envKey };
  }

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("clausewise_supabase_config");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.url && parsed.anonKey) {
          return parsed;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
  }

  return null;
}

export function saveSupabaseConfig(config: SupabaseConfig): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("clausewise_supabase_config", JSON.stringify(config));
    cachedClient = null; // reset cached client
  }
}

export function clearSupabaseConfig(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem("clausewise_supabase_config");
    cachedClient = null;
  }
}

/**
 * Get active Supabase client instance or null if not configured
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cachedClient) return cachedClient;

  const config = getSupabaseConfig();
  if (!config) return null;

  try {
    cachedClient = createClient(config.url, config.anonKey, {
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    });
    return cachedClient;
  } catch (e) {
    console.error("Failed to initialize Supabase client:", e);
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

// -------------------------------------------------------------
// Database Operations with Graceful Fallback
// -------------------------------------------------------------

export async function saveDocumentToSupabase(doc: ParsedDocument): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    // 1. Insert document record
    const { error: docErr } = await client.from("documents").upsert({
      id: doc.id,
      file_name: doc.fileName,
      file_type: doc.fileType,
      raw_text: doc.rawText,
      stats: doc.stats,
      uploaded_at: doc.uploadedAt,
    });
    if (docErr) throw docErr;

    // 2. Insert clauses
    const clauseRows = doc.chunks.map((c) => ({
      id: c.id,
      document_id: doc.id,
      section_number: c.sectionNumber,
      title: c.title,
      text: c.text,
      page_number: c.pageNumber || 1,
      order_num: c.order,
    }));
    const { error: clauseErr } = await client.from("clauses").upsert(clauseRows);
    if (clauseErr) throw clauseErr;

    // 3. Insert analyses
    const analysisRows = Object.values(doc.analyses).map((a) => ({
      clause_id: a.clauseId,
      category: a.category,
      plain_summary: a.plain_summary,
      risk_level: a.risk_level,
      risk_reason: a.risk_reason,
      key_terms: a.key_terms,
    }));
    if (analysisRows.length > 0) {
      const { error: anaErr } = await client.from("analyses").upsert(analysisRows);
      if (anaErr) throw anaErr;
    }

    return true;
  } catch (err) {
    console.warn("Supabase document save failed:", err);
    return false;
  }
}

export async function fetchDocumentFromSupabase(id: string): Promise<ParsedDocument | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data: docData, error: docErr } = await client
      .from("documents")
      .select("*")
      .eq("id", id)
      .single();

    if (docErr || !docData) return null;

    const { data: clauseData } = await client
      .from("clauses")
      .select("*")
      .eq("document_id", id)
      .order("order_num", { ascending: true });

    const chunks: ClauseChunk[] = (clauseData || []).map((c) => ({
      id: c.id,
      sectionNumber: c.section_number,
      title: c.title,
      text: c.text,
      pageNumber: c.page_number,
      order: c.order_num,
    }));

    const clauseIds = chunks.map((c) => c.id);
    const analyses: Record<string, ClauseAnalysis> = {};

    if (clauseIds.length > 0) {
      const { data: anaData } = await client
        .from("analyses")
        .select("*")
        .in("clause_id", clauseIds);

      for (const a of anaData || []) {
        analyses[a.clause_id] = {
          clauseId: a.clause_id,
          category: a.category,
          plain_summary: a.plain_summary,
          risk_level: a.risk_level,
          risk_reason: a.risk_reason,
          key_terms: Array.isArray(a.key_terms) ? a.key_terms : [],
        };
      }
    }

    return {
      id: docData.id,
      fileName: docData.file_name,
      fileType: docData.file_type as "pdf" | "docx" | "text",
      uploadedAt: docData.uploaded_at,
      rawText: docData.raw_text,
      chunks,
      analyses,
      stats: docData.stats || {
        totalClauses: chunks.length,
        highRisk: 0,
        mediumRisk: 0,
        lowRisk: chunks.length,
        categories: [],
      },
    };
  } catch (e) {
    console.warn("fetchDocumentFromSupabase error:", e);
    return null;
  }
}

export async function saveChatMessageToSupabase(
  msg: ChatMessage,
  documentId: string
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  try {
    const payload: Record<string, unknown> = {
      id: msg.id,
      document_id: documentId,
      role: msg.role,
      content: msg.content,
      citations: msg.citations || [],
    };
    if (msg.hallucination) {
      payload.hallucination_audit = msg.hallucination;
    }

    const { error } = await client.from("chat_messages").insert(payload);
    if (error) {
      // Graceful fallback if user's existing Supabase schema doesn't have hallucination_audit column yet
      if (error.message && error.message.includes("hallucination_audit")) {
        delete payload.hallucination_audit;
        const { error: retryErr } = await client.from("chat_messages").insert(payload);
        return !retryErr;
      }
      console.warn("Supabase chat insert warning:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("Supabase chat message save failed:", err);
    return false;
  }
}

export async function fetchChatMessagesFromSupabase(
  documentId: string
): Promise<ChatMessage[]> {
  const client = getSupabaseClient();
  if (!client) return [];

  try {
    const { data, error } = await client
      .from("chat_messages")
      .select("*")
      .eq("document_id", documentId)
      .order("created_at", { ascending: true });

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      role: row.role as "user" | "assistant",
      content: row.content,
      citations: row.citations || [],
      hallucination: row.hallucination_audit || undefined,
      timestamp: new Date(row.created_at).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    }));
  } catch {
    return [];
  }
}

export interface ClauseNote {
  id: string;
  clauseId: string;
  documentId: string;
  noteText: string;
  createdAt: string;
}

export async function saveClauseNoteToSupabase(
  clauseId: string,
  documentId: string,
  noteText: string
): Promise<ClauseNote | null> {
  const client = getSupabaseClient();
  const note: ClauseNote = {
    id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    clauseId,
    documentId,
    noteText,
    createdAt: new Date().toISOString(),
  };

  if (!client) {
    // Local storage fallback for note
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(`notes_${documentId}`) || "[]";
      const notes: ClauseNote[] = JSON.parse(stored);
      notes.push(note);
      localStorage.setItem(`notes_${documentId}`, JSON.stringify(notes));
    }
    return note;
  }

  try {
    const { error } = await client.from("clause_notes").insert({
      id: note.id,
      clause_id: clauseId,
      document_id: documentId,
      note_text: noteText,
    });
    if (error) throw error;
    return note;
  } catch (err) {
    console.warn("Supabase note save failed:", err);
    return note;
  }
}

export async function fetchClauseNotes(documentId: string): Promise<ClauseNote[]> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from("clause_notes")
        .select("*")
        .eq("document_id", documentId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        return data.map((d) => ({
          id: d.id,
          clauseId: d.clause_id,
          documentId: d.document_id,
          noteText: d.note_text,
          createdAt: d.created_at,
        }));
      }
    } catch {
      // fallback
    }
  }

  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem(`notes_${documentId}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  return [];
}
