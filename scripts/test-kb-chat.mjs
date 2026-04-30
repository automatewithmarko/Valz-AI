// End-to-end test harness: simulates a /api/chat request flow without
// the auth gate. Embeds a test query, retrieves KB chunks, builds the
// system prompt exactly the way route.ts does, then calls Grok and
// prints the response. Useful for sanity-checking retrieval + grounding.
//
// Usage:  node scripts/test-kb-chat.mjs
//
// Each scenario is an object { name, messages }. The retrieved chunks
// are printed so you can audit relevance; the Grok response is then
// printed so you can audit fidelity to the KB.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

async function embedQuery(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-large",
      input: text,
      dimensions: 1536,
    }),
  });
  if (!res.ok) throw new Error(`embed: ${res.status} ${await res.text()}`);
  const d = await res.json();
  return d.data[0].embedding;
}

async function rpc(fn, args) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fn}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function selectRest(table, query) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`select ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function buildKbContext(query) {
  const embedding = await embedQuery(query);
  const [matched, rules] = await Promise.all([
    rpc("match_kb_chunks", {
      query_embedding: embedding,
      match_count: 6,
      similarity_threshold: 0.2,
      metadata_filter: {},
    }),
    rpc("match_kb_chunks", {
      query_embedding: embedding,
      match_count: 20,
      similarity_threshold: 0,
      metadata_filter: { section_type: "rules" },
    }),
  ]);
  const ruleIds = new Set(rules.map((r) => r.id));
  const dynamic = matched.filter((m) => !ruleIds.has(m.id));
  return { rules, dynamic };
}

const SYSTEM_PROMPT_BASE = `You are Valzacchi.ai, a personal brand consultant and marketing strategist. You talk like a sharp, experienced coach sitting across the table from someone, not like a search engine or a textbook.

## HOW YOU COMMUNICATE

You are having a CONVERSATION, not writing an essay. Keep every message SHORT (2-5 sentences ideal). Ask questions BEFORE giving answers when you don't have context. Be direct and opinionated.

## WRITING RULES

- NEVER use em dashes (—) anywhere. Use commas, full stops, or break into separate sentences.
- NEVER use en dashes (–).
- Use Australian English spelling at all times.

## USING YOUR CONTENT STRATEGY KNOWLEDGE BASE

Below is a "CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)" block with the most relevant frameworks/rules for the current question. Treat it as your primary source for any content question. When you reference a framework, name it. Quote writing rules verbatim. Do not invent frameworks not in the retrieved block.`;

function formatChunks(chunks) {
  return chunks
    .map((c) => {
      const meta = c.metadata || {};
      const tag = meta.framework_name
        ? `[FRAMEWORK: ${meta.framework_name}]`
        : meta.section_type
          ? `[${String(meta.section_type).toUpperCase()}]`
          : "";
      return `### ${c.section_path} ${tag}\n\n${c.content}`;
    })
    .join("\n\n---\n\n");
}

async function callGrok(systemPrompt, messages) {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "grok-3-fast",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: false,
    }),
  });
  if (!res.ok) throw new Error(`grok: ${res.status} ${await res.text()}`);
  const d = await res.json();
  return d.choices[0].message.content;
}

async function runScenario({ name, messages }) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user").content;
  console.log(`\n${"=".repeat(80)}\nSCENARIO: ${name}\nQuery: "${lastUser.slice(0, 100)}${lastUser.length > 100 ? "…" : ""}"\n${"=".repeat(80)}`);

  const { rules, dynamic } = await buildKbContext(lastUser);

  console.log(`\n[Retrieval] Top ${dynamic.length} dynamic matches:`);
  for (const m of dynamic) {
    console.log(`  · ${m.similarity.toFixed(3)}  ${m.section_path}`);
  }
  console.log(`[Retrieval] +${rules.length} writing-rules chunks always included`);

  const kbBlock = `### Writing Rules (Section 1, ALWAYS APPLY — quote verbatim)\n\n${formatChunks(rules)}\n\n---\n\n### Most relevant frameworks / strategies for this query\n\n${formatChunks(dynamic)}`;

  const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${kbBlock}`;

  const reply = await callGrok(systemPrompt, messages);
  console.log(`\n[Grok reply]\n${reply}\n`);
}

const SCENARIOS = [
  {
    name: "Carousel ask (growth)",
    messages: [
      { role: "user", content: "I want to make a carousel that gets new people to follow me. I'm a holistic nutritionist working with women in their 30s who feel stuck in burnout. Pick a framework and walk me through it." },
    ],
  },
  {
    name: "Story selling tactical",
    messages: [
      { role: "user", content: "Give me a story sequence I can run today to sell my $97 nervous system reset workshop without sounding pushy." },
    ],
  },
  {
    name: "Hook help",
    messages: [
      { role: "user", content: "Write me a carousel hook for someone who runs a Pilates studio for first-time mums." },
    ],
  },
  {
    name: "Trial Reels question",
    messages: [
      { role: "user", content: "Should I be using trial reels and how often do I post them?" },
    ],
  },
  {
    name: "Off-topic check (no KB chunk should dominate)",
    messages: [
      { role: "user", content: "What's a good price to charge for a 1:1 strategy call?" },
    ],
  },
];

(async () => {
  await loadEnv();
  for (const s of SCENARIOS) {
    try {
      await runScenario(s);
    } catch (err) {
      console.error(`Scenario "${s.name}" failed:`, err.message);
    }
  }
})();
