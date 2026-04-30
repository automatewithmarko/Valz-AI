// One-shot ingestion: parse the content strategy KB into structured chunks,
// embed each chunk with OpenAI text-embedding-3-large @ 1536 dims, and emit
// a JSON file (scripts/kb_chunks.seed.json) ready to be loaded into Supabase.
//
// Usage:  node scripts/ingest-kb.mjs
//
// Reads OPENAI_API_KEY from .env.local. The Supabase upsert is performed
// separately via the supabase MCP execute_sql against the produced JSON.

import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const KB_PATH = resolve(ROOT, "content_strategy_knowledge_base.md");
const ENV_PATH = resolve(ROOT, ".env.local");
const OUT_PATH = resolve(ROOT, "scripts", "kb_chunks.seed.json");

const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 1536;
// Soft target for chunk size when splitting large H2 sections by H3.
// 6000 chars ≈ 1500 tokens, matching the KB's vectorization guidance.
const SPLIT_THRESHOLD_CHARS = 5000;

// ---------- env loader (no dotenv dep) ----------
async function loadEnv() {
  const text = await readFile(ENV_PATH, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ---------- markdown chunking ----------
// Strategy:
// 1. Strip the meta "VECTORIZATION INSTRUCTIONS" block (it's instructions for
//    Claude during indexing, not content the chat agent should retrieve).
// 2. Walk H1/H2/H3 headings, building a heading stack.
// 3. Each H2 is a candidate chunk. If its body (incl. children) exceeds the
//    threshold, split into one chunk per H3 with the parent H2 prepended as
//    breadcrumb context (per the KB's own chunking guidance).
async function loadAndChunk() {
  const md = await readFile(KB_PATH, "utf8");
  const lines = md.split("\n");

  // Remove the meta "VECTORIZATION INSTRUCTIONS" block — it spans from its
  // H2 heading to the next H1.
  const cleaned = [];
  let inMetaBlock = false;
  for (const line of lines) {
    if (/^##\s+VECTORIZATION INSTRUCTIONS/i.test(line)) {
      inMetaBlock = true;
      continue;
    }
    if (inMetaBlock && /^# /.test(line)) {
      inMetaBlock = false;
    }
    if (!inMetaBlock) cleaned.push(line);
  }

  // Strip frontmatter fence (--- ... ---) at top
  let body = cleaned.join("\n");
  body = body.replace(/^---[\s\S]*?---\n/, "");

  // Parse into a tree of sections keyed by heading level
  const sections = []; // { level, heading, lines: [], children: [] }
  const stack = []; // nesting stack
  const root = { level: 0, heading: "ROOT", lines: [], children: [] };
  stack.push(root);

  for (const line of body.split("\n")) {
    const m = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (m) {
      const level = m[1].length;
      const heading = m[2].trim();
      while (stack.length && stack[stack.length - 1].level >= level) stack.pop();
      const node = { level, heading, lines: [], children: [] };
      stack[stack.length - 1].children.push(node);
      stack.push(node);
    } else {
      stack[stack.length - 1].lines.push(line);
    }
  }

  // Render a section + all its descendants back to markdown text.
  function renderSection(node, includeOwnHeading = true) {
    const out = [];
    if (includeOwnHeading && node.level > 0) {
      out.push(`${"#".repeat(node.level)} ${node.heading}`);
      out.push("");
    }
    if (node.lines.length) out.push(node.lines.join("\n"));
    for (const child of node.children) {
      out.push(renderSection(child, true));
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // Walk the tree producing chunks.
  // We treat H1 as section grouping (e.g. "SECTION 2: INSTAGRAM CAROUSEL STRUCTURES")
  // and chunk at H2. Large H2s split at H3.
  const chunks = [];
  for (const h1 of root.children.filter((c) => c.level === 1)) {
    const sectionTitle = h1.heading; // e.g. "SECTION 2: INSTAGRAM CAROUSEL STRUCTURES"
    // If H1 has direct line content (rare), include as its own chunk
    if (h1.children.length === 0 && h1.lines.join("").trim().length > 0) {
      chunks.push(buildChunk({
        breadcrumb: [sectionTitle],
        heading: sectionTitle,
        body: h1.lines.join("\n").trim(),
      }));
      continue;
    }

    for (const h2 of h1.children.filter((c) => c.level === 2)) {
      const fullText = renderSection(h2, false);
      const breadcrumb = [sectionTitle, h2.heading];
      const shouldSplit =
        fullText.length > SPLIT_THRESHOLD_CHARS &&
        h2.children.some((c) => c.level === 3);

      if (!shouldSplit) {
        chunks.push(buildChunk({
          breadcrumb,
          heading: h2.heading,
          body: fullText,
        }));
        continue;
      }

      // Split: emit the H2 preamble (lines before first H3) as its own
      // small chunk if substantive, then one chunk per H3 with H2 breadcrumb.
      const preamble = h2.lines.join("\n").trim();
      if (preamble.length > 200) {
        chunks.push(buildChunk({
          breadcrumb,
          heading: `${h2.heading} (overview)`,
          body: preamble,
        }));
      }
      for (const h3 of h2.children.filter((c) => c.level === 3)) {
        const h3Text = renderSection(h3, false);
        chunks.push(buildChunk({
          breadcrumb: [...breadcrumb, h3.heading],
          heading: h3.heading,
          body: h3Text,
          parentHeading: h2.heading,
        }));
      }
    }
  }

  return chunks;
}

// ---------- metadata derivation ----------
function deriveMetadata({ breadcrumb, heading, body, parentHeading }) {
  const path = breadcrumb.join(" / ").toLowerCase();
  const text = (heading + " " + body + " " + (parentHeading || "")).toLowerCase();

  const has = (s) => text.includes(s) || path.includes(s);

  // platform
  let platform = "cross-platform";
  if (has("instagram") && !has("tiktok")) platform = "instagram";
  else if (has("tiktok") && !has("instagram")) platform = "tiktok";
  else if (has("instagram") && has("tiktok")) platform = "cross-platform";
  // section-based fallbacks
  if (path.includes("section 2") || path.includes("section 3")) platform = "instagram";
  if (path.includes("section 4")) platform = "tiktok";
  if (path.includes("section 6")) platform = "instagram"; // trial reels

  // content_type
  let contentType = "general";
  if (has("carousel")) contentType = "carousel";
  else if (path.includes("section 3") || has("story") || has("stories")) contentType = "story";
  else if (has("reel") || has("trial reel")) contentType = "reel";
  else if (has("tiktok")) contentType = "reel";

  // intent — section_path is the canonical source of truth ("2.1 GROWTH-FOCUSED"
  // vs "2.2 SALES-FOCUSED" in the doc). Body text mentions of "growth" or
  // "sales" must NOT override that, since framework prose discusses both
  // angles freely (e.g. a sales framework still talks about growth dynamics).
  let intent = "general";
  if (path.includes("growth-focused")) intent = "growth";
  else if (path.includes("sales-focused")) intent = "sales";
  else if (path.includes("section 1") || heading.toLowerCase().includes("rule")) intent = "rules";
  else if (has("engagement")) intent = "engagement";
  else if (has("nurture")) intent = "nurture";
  else if (has("growth")) intent = "growth";
  else if (has("sales") || has("selling") || has("convert")) intent = "sales";

  // section_type
  let sectionType = "strategy";
  if (path.includes("section 1")) sectionType = "rules";
  else if (heading.toLowerCase().includes("framework") || /\d\.\d+\.\d+/.test(heading)) sectionType = "framework";
  else if (heading.toLowerCase().includes("template")) sectionType = "template";
  else if (heading.toLowerCase().includes("example")) sectionType = "example";

  // framework_name (only if this chunk IS a framework)
  let frameworkName = null;
  const fw = /Framework:\s*(.+?)$/i.exec(heading);
  if (fw) frameworkName = fw[1].replace(/[("')]/g, "").trim();
  else if (sectionType === "framework") frameworkName = heading;

  return {
    platform,
    content_type: contentType,
    intent,
    section_type: sectionType,
    ...(frameworkName ? { framework_name: frameworkName } : {}),
  };
}

function buildChunk({ breadcrumb, heading, body, parentHeading }) {
  // Prepend the breadcrumb so the embedding+content has full context
  const fullContent = `${breadcrumb.join(" > ")}\n\n${body}`.trim();
  return {
    section_path: breadcrumb.join(" / "),
    heading,
    content: fullContent,
    metadata: deriveMetadata({ breadcrumb, heading, body, parentHeading }),
    token_count: Math.ceil(fullContent.length / 4),
  };
}

// ---------- OpenAI embeddings ----------
async function embedBatch(texts) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings failed (${res.status}): ${err}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

// ---------- main ----------
(async () => {
  await loadEnv();
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing in .env.local");
  }

  console.log("Reading + chunking KB...");
  const chunks = await loadAndChunk();
  console.log(`Produced ${chunks.length} chunks`);

  // Quick sanity print
  for (const c of chunks.slice(0, 3)) {
    console.log(`  - ${c.section_path}  (${c.content.length} chars, ${JSON.stringify(c.metadata)})`);
  }
  console.log("  ...");
  for (const c of chunks.slice(-3)) {
    console.log(`  - ${c.section_path}  (${c.content.length} chars)`);
  }

  // Embed in batches of 32 (OpenAI allows up to 2048 inputs but we keep it modest)
  console.log(`\nEmbedding via ${EMBEDDING_MODEL} @ ${EMBEDDING_DIMENSIONS} dims...`);
  const BATCH = 32;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const embeddings = await embedBatch(slice.map((c) => c.content));
    for (let j = 0; j < slice.length; j++) slice[j].embedding = embeddings[j];
    console.log(`  ${Math.min(i + BATCH, chunks.length)}/${chunks.length}`);
  }

  await writeFile(OUT_PATH, JSON.stringify(chunks, null, 2), "utf8");
  console.log(`\nWrote ${chunks.length} embedded chunks → ${OUT_PATH}`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
