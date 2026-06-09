-- RAG Knowledge Base — atomare Wissensdateien (eine Datei = ein Eintrag).
-- Entspricht dem live deployten Schema (Supabase-Migration `create_knowledge_base_rag`).
-- Global / admin-kuratiert: kein company_id-Scoping. Public read, authenticated write.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.knowledge_base (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN (
    'use_case', 'tool', 'template_baustein',
    'template_workflow', 'branche', 'ui_guide'
  )),
  filename text NOT NULL,
  filepath text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  embedding vector(1024),                 -- Mistral mistral-embed = 1024 Dimensionen
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  indexed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Ein Eintrag pro Datei
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_base_filepath_key ON public.knowledge_base(filepath);
CREATE INDEX IF NOT EXISTS knowledge_base_source_type_idx ON public.knowledge_base(source_type);
CREATE INDEX IF NOT EXISTS knowledge_base_embedding_idx
  ON public.knowledge_base USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

-- Global, admin-kuratiert: alle dürfen aktive Einträge lesen.
DROP POLICY IF EXISTS "kb_read_active" ON public.knowledge_base;
CREATE POLICY "kb_read_active" ON public.knowledge_base
  FOR SELECT USING (is_active = true);

-- Schreiben nur für eingeloggte Nutzer (Admin-UI nutzt die User-Session;
-- das CLI-Script nutzt den service_role-Key, der RLS ohnehin umgeht).
DROP POLICY IF EXISTS "kb_write_auth" ON public.knowledge_base;
CREATE POLICY "kb_write_auth" ON public.knowledge_base
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Semantische Suche über die globale Knowledge Base mit optionalem source_type-Filter.
CREATE OR REPLACE FUNCTION public.search_knowledge (
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 5,
  filter_types text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_type text,
  title text,
  content text,
  filepath text,
  similarity float,
  metadata jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kb.id,
    kb.source_type,
    kb.title,
    kb.content,
    kb.filepath,
    1 - (kb.embedding <=> query_embedding) AS similarity,
    kb.metadata
  FROM public.knowledge_base kb
  WHERE kb.is_active = true
    AND (filter_types IS NULL OR kb.source_type = ANY(filter_types))
    AND 1 - (kb.embedding <=> query_embedding) > match_threshold
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
