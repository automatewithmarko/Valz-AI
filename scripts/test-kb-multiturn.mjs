// Multi-turn conversation test. Each turn re-runs retrieval against the
// latest user message, mirroring what /api/chat does in production.

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
    body: JSON.stringify({ model: "text-embedding-3-large", input: text, dimensions: 1536 }),
  });
  return (await res.json()).data[0].embedding;
}

async function rpc(fn, args) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
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
  return { rules, dynamic: matched.filter((m) => !ruleIds.has(m.id)) };
}

function formatChunks(chunks) {
  return chunks
    .map((c) => {
      const tag = c.metadata?.framework_name
        ? `[FRAMEWORK: ${c.metadata.framework_name}]`
        : c.metadata?.section_type
          ? `[${String(c.metadata.section_type).toUpperCase()}]`
          : "";
      return `### ${c.section_path} ${tag}\n\n${c.content}`;
    })
    .join("\n\n---\n\n");
}

const SYSTEM_PROMPT_BASE = `You are Valzacchi.ai, a personal brand consultant. Keep replies SHORT (2-5 sentences ideal). Ask questions before giving plans. Be direct and opinionated. Use Australian English. Never use em or en dashes — use commas/full stops instead. Use the retrieved KB block below as your primary source for content questions; name frameworks when you use them; never invent frameworks.`;

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
  return (await res.json()).choices[0].message.content;
}

async function multiturn(name, turns) {
  console.log(`\n${"=".repeat(80)}\nMULTI-TURN: ${name}\n${"=".repeat(80)}`);
  const messages = [];
  for (const userTurn of turns) {
    messages.push({ role: "user", content: userTurn });
    const { rules, dynamic } = await buildKbContext(userTurn);
    console.log(`\n> USER: ${userTurn}`);
    console.log(`  retrieved: ${dynamic.map((d) => d.metadata?.framework_name || d.heading).slice(0, 3).join(" | ")}`);
    const kbBlock = `### Writing Rules (always apply, quote verbatim)\n\n${formatChunks(rules)}\n\n---\n\n### Most relevant frameworks\n\n${formatChunks(dynamic)}`;
    const sysPrompt = `${SYSTEM_PROMPT_BASE}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${kbBlock}`;
    const reply = await callGrok(sysPrompt, messages);
    messages.push({ role: "assistant", content: reply });
    console.log(`< ASSISTANT: ${reply}`);
  }
}

(async () => {
  await loadEnv();

  await multiturn("Building a sales carousel iteratively", [
    "I want to launch my new $497 mindset coaching programme. Help me write a carousel that sells it.",
    "I help women in their 40s who feel stuck in their career figure out what's actually next for them. Programme runs 8 weeks, group format.",
    "Use the Quiet Upgrade Carousel framework. Write me slides 1 and 2.",
    "Make slide 1 stronger. The hook isn't quite landing.",
  ]);

  await multiturn("Cross-platform: stories then reels", [
    "Quick check: what's the one thing about story selling I should obsess over?",
    "Now flip it. Same answer but for trial reels — what should I obsess over?",
  ]);
})();
