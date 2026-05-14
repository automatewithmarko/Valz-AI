import type { SupabaseClient } from "@supabase/supabase-js";

const OPENAI_EMBEDDING_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 1536;

type KbChunk = {
  id: string;
  section_path: string;
  heading: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

// Exported so other retrieval paths (brand-dna user docs) share the same
// embedding model + dimensions and don't drift apart.
export async function embedQuery(text: string): Promise<number[] | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const trimmed = text.trim().slice(0, 8000);
  if (!trimmed) return null;

  const res = await fetch(OPENAI_EMBEDDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: trimmed,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!res.ok) {
    console.error("KB embed failed", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data?.data?.[0]?.embedding ?? null;
}

function formatChunks(chunks: KbChunk[]): string {
  return chunks
    .map((c) => {
      const meta = c.metadata as { framework_name?: string; section_type?: string };
      const tag = meta.framework_name
        ? `[FRAMEWORK: ${meta.framework_name}]`
        : meta.section_type
          ? `[${String(meta.section_type).toUpperCase()}]`
          : "";
      return `### ${c.section_path} ${tag}\n\n${c.content}`;
    })
    .join("\n\n---\n\n");
}

// Builds the KB context block to inject into the system prompt.
// - Always pulls the foundational Writing Rules (Section 1) verbatim.
// - Pulls top-K most-similar chunks for the live query.
// Returns null when retrieval fails or there's no signal to inject.
export async function buildKbContext(
  supabase: SupabaseClient,
  userQuery: string,
  topK = 6
): Promise<string | null> {
  const embedding = await embedQuery(userQuery);
  if (!embedding) return null;

  const [matchRes, rulesRes] = await Promise.all([
    supabase.rpc("match_kb_chunks", {
      query_embedding: embedding,
      match_count: topK,
      similarity_threshold: 0.2,
      metadata_filter: {},
    }),
    // Always pull every rules chunk regardless of similarity (there are only
    // a handful, they're foundational, and the writing rules must always
    // be in context).
    supabase.rpc("match_kb_chunks", {
      query_embedding: embedding,
      match_count: 20,
      similarity_threshold: 0,
      metadata_filter: { section_type: "rules" },
    }),
  ]);

  const matched: KbChunk[] = (matchRes.data ?? []) as KbChunk[];
  const rules: KbChunk[] = (rulesRes.data ?? []) as KbChunk[];

  // Drop any matched chunk that's already in rules (avoid duplicate writing rules)
  const ruleIds = new Set(rules.map((r) => r.id));
  const dynamic = matched.filter((m) => !ruleIds.has(m.id));

  if (rules.length === 0 && dynamic.length === 0) return null;

  const parts: string[] = [];
  if (rules.length > 0) {
    parts.push(`### Writing Rules (Section 1, ALWAYS APPLY — quote verbatim)\n\n${formatChunks(rules)}`);
  }
  if (dynamic.length > 0) {
    parts.push(
      `### Most relevant frameworks / strategies for this query (ranked by similarity)\n\n${formatChunks(dynamic)}`
    );
  }
  return parts.join("\n\n---\n\n");
}
