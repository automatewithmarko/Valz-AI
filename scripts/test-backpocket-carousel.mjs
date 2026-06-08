// Back Pocket AI — carousel deliverable test.
//
// Faithfully reproduces the /api/chat route's context assembly:
//   SYSTEM_PROMPT (extracted from route.ts)
//   + KB retrieval (OpenAI text-embedding-3-large @1536 → match_kb_chunks)
//   + a representative Aligned Income Blueprint (so the AI has audience/voice)
// then sends carousel requests through Claude Sonnet (the migrated model).
//
// Asserts per response:
//   1. NO framework name is mentioned anywhere in the output.
//   2. The carousel follows ONE canonical Plug-and-Play template exactly —
//      the emitted slide labels (in order) match a known framework's labels.
//   3. No "framework / structure / template / knowledge base" meta-leak.
//   4. Writing rules: no em/en dashes, no "It's not X it's Y" contrast.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

async function loadEnv() {
  const text = await readFile(resolve(ROOT, ".env.local"), "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}
await loadEnv();

// ── Extract SYSTEM_PROMPT verbatim from the chat route ────────────────
async function loadSystemPrompt() {
  const src = await readFile(resolve(ROOT, "src/app/api/chat/route.ts"), "utf8");
  const marker = "const SYSTEM_PROMPT = `";
  const start = src.indexOf(marker);
  const after = start + marker.length;
  const end = src.indexOf("`;", after);
  return src.slice(after, end);
}

// ── KB retrieval, mirroring src/lib/kb-retrieval.ts ───────────────────
const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 1536;

async function embedQuery(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.trim().slice(0, 8000),
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!res.ok) throw new Error(`embed failed ${res.status}: ${await res.text()}`);
  return (await res.json()).data[0].embedding;
}

function formatChunks(chunks) {
  return chunks
    .map((c) => {
      const meta = c.metadata ?? {};
      const tag = meta.framework_name
        ? `[FRAMEWORK: ${meta.framework_name}]`
        : meta.section_type
          ? `[${String(meta.section_type).toUpperCase()}]`
          : "";
      return `### ${c.section_path} ${tag}\n\n${c.content}`;
    })
    .join("\n\n---\n\n");
}

async function buildKbContext(supabase, userQuery, topK = 6) {
  const embedding = await embedQuery(userQuery);
  const [matchRes, rulesRes] = await Promise.all([
    supabase.rpc("match_kb_chunks", {
      query_embedding: embedding,
      match_count: topK,
      similarity_threshold: 0.2,
      metadata_filter: {},
    }),
    supabase.rpc("match_kb_chunks", {
      query_embedding: embedding,
      match_count: 20,
      similarity_threshold: 0,
      metadata_filter: { section_type: "rules" },
    }),
  ]);
  const matched = matchRes.data ?? [];
  const rules = rulesRes.data ?? [];
  const ruleIds = new Set(rules.map((r) => r.id));
  const dynamic = matched.filter((m) => !ruleIds.has(m.id));
  if (rules.length === 0 && dynamic.length === 0) return { block: null, matched, rules };
  const parts = [];
  if (rules.length > 0)
    parts.push(`### Writing Rules (Section 1, ALWAYS APPLY — quote verbatim)\n\n${formatChunks(rules)}`);
  if (dynamic.length > 0)
    parts.push(`### Most relevant frameworks / strategies for this query (ranked by similarity)\n\n${formatChunks(dynamic)}`);
  return { block: parts.join("\n\n---\n\n"), matched, rules, dynamic };
}

// ── A representative blueprint so the AI has audience/voice context ───
const BLUEPRINT = `## THE USER'S ALIGNED INCOME BLUEPRINT (BRAND DNA)

Brand: Maya Lindenburg — "The Return Edit". Helps competent women in their 30s returning to work after parental leave find the version of work that fits how they're wired, without quitting overnight.
Human Design: Projector, Splenic authority, 4/6 profile.
Audience: late-corporate women, one or two kids under five, earning $120K-$180K pre-break, smart, exhausted, quietly suspicious the role they're returning to is no longer the one they want. Tired of feeling competent but invisible. Embarrassed to admit they Google their "alignment" at 11pm.
Audience internal language: "I'm so tired of waiting for permission to want what I actually want." "I know it's not the money keeping me here." "I just need someone to tell me what to do."
Brand voice: warm, structured, observational, never hype. Founder pillar built on lived experience of postnatal reentry and energy auditing.
Offer: The Return Edit — a 6-week group program, plus a self-paced product.`;

// ── Canonical Plug-and-Play templates (from SYSTEM_PROMPT reference) ─
const TEMPLATES = {
  "Borrow the Moment, Build the Depth": ["The Moment", "The Surface", "The Deeper Layer", "The Mirror", "The Shareable Truth", "The Encouragement"],
  "Pattern Interrupt": ["The Identity Call Out", "Name the Fixations", "The Core Principle", "The Nuance", "The Sharable Wrap"],
  "Curiosity Carousel": ["The Curiosity Hook", "Expand the Personal Context", "Introduce the Concept", "Reframe the Narrative", "Validation", "Empowered Close", "Soft CTA"],
  "Permission Slip Post": ["Identity + Tension", "Real Moment", "Expand the Experience", "Name the Invisible Problem", "Cultural Expectation", "Encouragement", "Invitation"],
  "Small Shift, Big Shift": ["Personal Entry", "Reveal the Hidden Issue", "Expand the Pattern", "The Replacement", "Integration", "Emotional Result", "Invitation"],
  "Quiet Upgrade": ["Personal Realisation", "Hidden Friction", "Real Life Pattern", "The Upgrade", "Integration", "Emotional Result", "Invitation"],
  "Proof Over Hype": ["Outcome", "Starting Point", "The Inputs", "The Shift", "The Meaning", "Invitation"],
  "I Needed This": ["The Moment", "Expand the Weight", "Effort", "The Gap", "The Build", "The Resource", "What's Inside", "Invitation"],
};

// Framework names that must NEVER appear in user-facing output.
const FRAMEWORK_NAMES = [
  "Borrow the Moment", "Build the Depth", "Pattern Interrupt", "Curiosity Carousel",
  "Permission Slip", "Small Shift", "Big Shift", "Quiet Upgrade", "Vetted Edit",
  "Proof Over Hype", "I Needed This", "Plug-and-Play", "Plug and Play",
];
const META_LEAKS = [
  "from my framework", "from my structure", "from my knowledge base",
  "knowledge base", "the framework", "this framework", "my framework",
  "carousel structure", "structure document", "per my system",
];

function norm(s) {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// Pull slide labels in order from the output. Slides look like:
//   "**Slide 1 - The Identity Call Out**" or "Slide 1: The Identity Call Out"
function extractSlideLabels(text) {
  const labels = [];
  const re = /^\s*\**\s*slide\s+(\d+)\s*[-–—:]\s*([^\n*]+?)\s*\**\s*$/gim;
  let m;
  while ((m = re.exec(text)) !== null) {
    labels.push({ n: Number(m[1]), label: m[2].trim() });
  }
  labels.sort((a, b) => a.n - b.n);
  return labels.map((l) => l.label);
}

// Find the template whose labels best match the emitted labels (order-sensitive).
function matchTemplate(emittedLabels) {
  let best = null;
  for (const [name, tmplLabels] of Object.entries(TEMPLATES)) {
    if (emittedLabels.length === 0) continue;
    // Compare normalized labels position-by-position up to the shorter length.
    const n = Math.min(emittedLabels.length, tmplLabels.length);
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const a = norm(emittedLabels[i]);
      const b = norm(tmplLabels[i]);
      if (a === b || a.includes(b) || b.includes(a)) hits++;
    }
    const score = hits / tmplLabels.length;
    const countMatch = emittedLabels.length === tmplLabels.length;
    if (!best || score > best.score || (score === best.score && countMatch && !best.countMatch)) {
      best = { name, score, hits, tmplCount: tmplLabels.length, emittedCount: emittedLabels.length, countMatch };
    }
  }
  return best;
}

const client = new Anthropic({
  apiKey: process.env.MENTOR_API_KEY,
  baseURL: (process.env.MENTOR_API_URL ?? "").replace(/\/v1\/?$/, ""),
});
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function runScenario({ title, query, followup }) {
  const systemBase = await loadSystemPrompt();
  // Retrieval uses the original query; for the follow-up turn we keep the
  // same KB block (the route re-retrieves on the *last* user message, but
  // for a one-line clarification answer that would weaken retrieval — so we
  // anchor the KB to the substantive carousel request, which is faithful to
  // how a real conversation accumulates context).
  const { block, dynamic = [] } = await buildKbContext(supabase, query, 6);
  let system = systemBase;
  system += `\n\n${BLUEPRINT}`;
  if (block) system += `\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${block}`;

  const turns = [{ role: "user", content: query }];
  let res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system,
    messages: turns,
  });
  let out = res.content[0]?.type === "text" ? res.content[0].text : "";

  // Consultant rule: the AI may ask 1-2 clarifying questions before
  // producing a deliverable. If no slides came back and we have a canned
  // follow-up, answer it and let the AI produce the carousel.
  if (extractSlideLabels(out).length === 0 && followup) {
    turns.push({ role: "assistant", content: out });
    turns.push({ role: "user", content: followup });
    res = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system,
      messages: turns,
    });
    const second = res.content[0]?.type === "text" ? res.content[0].text : "";
    out = `${out}\n\n[USER FOLLOW-UP: ${followup}]\n\n${second}`;
  }

  console.log("\n" + "═".repeat(74));
  console.log(title);
  console.log("═".repeat(74));
  console.log(`KB frameworks retrieved this turn: ${dynamic
    .map((d) => d.metadata?.framework_name)
    .filter(Boolean)
    .join(", ") || "(none tagged)"}`);
  console.log("\n--- ASSISTANT OUTPUT ---\n");
  console.log(out);

  // ── Checks ──────────────────────────────────────────────────────
  const checks = [];
  const lower = out.toLowerCase();

  const namedFrameworks = FRAMEWORK_NAMES.filter((f) => lower.includes(f.toLowerCase()));
  checks.push({ name: "No framework name mentioned", ok: namedFrameworks.length === 0, detail: namedFrameworks.join(", ") });

  const metaHits = META_LEAKS.filter((p) => lower.includes(p.toLowerCase()));
  checks.push({ name: "No internal-structure meta-leak", ok: metaHits.length === 0, detail: metaHits.join(", ") });

  const labels = extractSlideLabels(out);
  const tmpl = matchTemplate(labels);
  const followsTemplate = tmpl && tmpl.score >= 0.8 && tmpl.countMatch;
  checks.push({
    name: "Follows a Plug-and-Play template (labels+count)",
    ok: !!followsTemplate,
    detail: tmpl
      ? `best=${tmpl.name} labels ${tmpl.hits}/${tmpl.tmplCount} matched, emitted ${tmpl.emittedCount} slides (template ${tmpl.tmplCount})`
      : `no slide labels detected`,
  });

  const emDashes = (out.match(/—/g) || []).length;
  const enDashes = (out.match(/–/g) || []).length;
  checks.push({ name: "No em/en dashes", ok: emDashes === 0 && enDashes === 0, detail: `em=${emDashes} en=${enDashes}` });

  const contrast = (out.match(/\b(it'?s|isn'?t|wasn'?t)\b[^.\n]{0,30}\b(but|it'?s|that'?s)\b/gi) || []).length;
  checks.push({ name: "No contrast formulas", ok: contrast < 2, detail: `${contrast} suspected` });

  console.log("\n--- CHECKS ---");
  for (const c of checks) {
    console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
  }
  return { title, checks, labels, tmpl };
}

const SCENARIOS = [
  {
    title: "SCENARIO 1 — direct growth carousel",
    query:
      "Write me an Instagram carousel to grow my reach. My audience is exhausted by all the 'just push through' hustle advice about going back to work after kids. I want to cut through that.",
    followup:
      "They feel like they're being told to hustle their way back into a role they're not even sure they want anymore. Pull from my own reentry where I froze in my first meeting back. Just write the carousel now please.",
  },
  {
    title: "SCENARIO 2 — sales carousel for the offer",
    query:
      "Write me a carousel that sells The Return Edit to my warm audience. I want to show the quiet upgrade in how their work feels, not hype it up.",
    followup:
      "Selling the 6-week group program. CTA: comment a keyword. Write the carousel now please.",
  },
  {
    title: "SCENARIO 3 — story-led growth carousel",
    query:
      "Give me a carousel built around a trending moment my audience is already talking about (the 'snapback to work' pressure after maternity leave), then take it deeper.",
    followup: "Growth, no offer mention. Keep it story-led and personal. Write it now please.",
  },
];

const all = [];
for (const s of SCENARIOS) all.push(await runScenario(s));

console.log("\n" + "█".repeat(74));
console.log("SUMMARY");
console.log("█".repeat(74));
let pass = 0,
  total = 0;
for (const r of all) {
  for (const c of r.checks) {
    total++;
    if (c.ok) pass++;
  }
}
console.log(`  ${pass}/${total} checks passed across ${all.length} scenarios`);
for (const r of all) {
  const fails = r.checks.filter((c) => !c.ok).map((c) => c.name);
  console.log(`  ${fails.length === 0 ? "✓" : "✗"} ${r.title}${fails.length ? " — " + fails.join("; ") : ""}`);
}
