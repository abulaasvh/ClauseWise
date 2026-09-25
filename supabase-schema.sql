-- =========================================================
-- ClauseWise: Supabase Database Schema & Realtime Setup
-- =========================================================
-- Paste this entire script into your Supabase project's SQL Editor
-- (https://app.supabase.com/project/_/sql) and click "Run".

-- 1. Create documents table
CREATE TABLE IF NOT EXISTS public.documents (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL DEFAULT 'text',
    raw_text TEXT NOT NULL,
    stats JSONB DEFAULT '{}'::jsonb,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Create clauses table
CREATE TABLE IF NOT EXISTS public.clauses (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    section_number TEXT NOT NULL,
    title TEXT NOT NULL,
    text TEXT NOT NULL,
    page_number INT DEFAULT 1,
    order_num INT NOT NULL
);

-- 3. Create analyses table
CREATE TABLE IF NOT EXISTS public.analyses (
    clause_id TEXT PRIMARY KEY REFERENCES public.clauses(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    plain_summary TEXT NOT NULL,
    risk_level TEXT NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
    risk_reason TEXT NOT NULL,
    key_terms JSONB DEFAULT '[]'::jsonb
);

-- 4. Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    citations JSONB DEFAULT '[]'::jsonb,
    hallucination_audit JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Migration for existing databases:
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS hallucination_audit JSONB DEFAULT NULL;

-- 5. Create clause_notes table (for real-time annotations)
CREATE TABLE IF NOT EXISTS public.clause_notes (
    id TEXT PRIMARY KEY,
    clause_id TEXT NOT NULL REFERENCES public.clauses(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
    note_text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Indexes for lightning-fast lookups
CREATE INDEX IF NOT EXISTS idx_clauses_document_id ON public.clauses(document_id);
CREATE INDEX IF NOT EXISTS idx_chat_document_id ON public.chat_messages(document_id);
CREATE INDEX IF NOT EXISTS idx_notes_clause_id ON public.clause_notes(clause_id);

-- =========================================================
-- 6. Row Level Security (RLS) Configuration
-- =========================================================
-- SECURITY AUDIT:
-- Row Level Security MUST remain enabled on all tables to prevent
-- anonymous client-side key abuse. Without explicit policies, all
-- operations default to DENIED.

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clause_notes ENABLE ROW LEVEL SECURITY;

-- ── Standard Permissive Demo Policies ─────────────────────────────────────────
-- Permits read (SELECT) and append (INSERT) for client demonstration.
-- NOTE: UPDATE and DELETE are NOT granted on documents, clauses, analyses, or
-- chat_messages, preventing unauthorized modification or tampering of stored records.
CREATE POLICY "Allow public read documents" ON public.documents FOR SELECT USING (true);
CREATE POLICY "Allow public insert documents" ON public.documents FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read clauses" ON public.clauses FOR SELECT USING (true);
CREATE POLICY "Allow public insert clauses" ON public.clauses FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read analyses" ON public.analyses FOR SELECT USING (true);
CREATE POLICY "Allow public insert analyses" ON public.analyses FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read chat_messages" ON public.chat_messages FOR SELECT USING (true);
CREATE POLICY "Allow public insert chat_messages" ON public.chat_messages FOR INSERT WITH CHECK (true);

-- Clause notes allows users to add and remove their own annotations in the demo UI
CREATE POLICY "Allow public read clause_notes" ON public.clause_notes FOR SELECT USING (true);
CREATE POLICY "Allow public insert clause_notes" ON public.clause_notes FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete clause_notes" ON public.clause_notes FOR DELETE USING (true);

-- ── Optional: Production Authenticated Multi-Tenant Policies ─────────────────
-- To scope documents strictly to authenticated Supabase users:
-- 1. Add user_id column: ALTER TABLE public.documents ADD COLUMN user_id UUID REFERENCES auth.users(id);
-- 2. Drop the public policies: DROP POLICY "Allow public read documents" ON public.documents;
-- 3. Enforce user ownership:
--    CREATE POLICY "User read own docs" ON public.documents FOR SELECT USING (auth.uid() = user_id);
--    CREATE POLICY "User insert own docs" ON public.documents FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Enable Supabase Realtime subscriptions on chat and notes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'clause_notes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.clause_notes;
  END IF;
END $$;
