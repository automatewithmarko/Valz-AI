-- ─────────────────────────────────────────────────────────────────────
-- Extend brand_dna_documents into a per-user knowledge-base store.
--
-- Each row represents one uploaded document that the chat AI should
-- consult alongside the Aligned Income Blueprint. The user-supplied
-- "When should this be used:" prompt is injected with the extracted
-- text so the AI can decide which KBs are relevant per question.
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE public.brand_dna_documents
  ADD COLUMN IF NOT EXISTS when_to_use TEXT,
  ADD COLUMN IF NOT EXISTS content_text TEXT;

CREATE INDEX IF NOT EXISTS brand_dna_documents_user_id_idx
  ON public.brand_dna_documents (user_id);
