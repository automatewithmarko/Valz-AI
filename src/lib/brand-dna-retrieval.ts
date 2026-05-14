import type { SupabaseClient } from "@supabase/supabase-js";
import { embedQuery } from "@/lib/kb-retrieval";

export type BrandDnaDocMatch = {
  id: string;
  label: string;
  when_to_use: string | null;
  content_text: string | null;
  similarity: number;
};

// Compute the embedding payload for a user-uploaded doc. Combining
// label + when_to_use gives the embedding a stronger signal than the
// when_to_use hint alone — the doc name often carries domain words the
// hint doesn't repeat.
export function buildDocEmbedText(label: string, whenToUse: string | null): string {
  return [label, whenToUse].filter(Boolean).join("\n").trim();
}

// Embed the given doc text. Returns null on failure (missing API key,
// network error, etc.) so callers can degrade gracefully instead of
// failing the upload.
export async function embedDocHint(label: string, whenToUse: string | null) {
  const text = buildDocEmbedText(label, whenToUse);
  if (!text) return null;
  return embedQuery(text);
}

// Retrieve the user's KB docs whose "when_to_use" embedding is closest
// to the live query. Threshold-filtered so unrelated docs are dropped.
// Returns an empty array on any failure path.
export async function matchBrandDnaDocs(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  opts: { matchCount?: number; threshold?: number } = {}
): Promise<BrandDnaDocMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const embedding = await embedQuery(trimmed);
  if (!embedding) return [];

  const { data, error } = await supabase.rpc("match_brand_dna_documents", {
    p_user_id: userId,
    query_embedding: embedding,
    match_count: opts.matchCount ?? 4,
    similarity_threshold: opts.threshold ?? 0.3,
  });
  if (error) {
    console.warn("matchBrandDnaDocs failed", error.message);
    return [];
  }
  return (data ?? []) as BrandDnaDocMatch[];
}

// Format a list of matched docs into the system-prompt block. Mirrors
// the prior "include all docs" formatting so the model sees the same
// structure — just filtered to relevant ones.
export function formatDocsForPrompt(docs: BrandDnaDocMatch[]): string {
  return docs
    .filter((d) => d.content_text)
    .map(
      (d) => `### ${d.label}
When to use: ${d.when_to_use ?? "(no guidance provided)"}

---
${d.content_text}
---`
    )
    .join("\n\n");
}
