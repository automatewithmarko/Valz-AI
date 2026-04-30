// Quick re-run of the 3 failed story frameworks with full reply printing
// so we can see what label format Grok actually used.
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

async function loadProductionSystemPrompt() {
  const src = await readFile(resolve(ROOT, "src/app/api/chat/route.ts"), "utf8");
  return src.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/)[1];
}

async function embedQuery(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
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
  return res.json();
}

function formatChunks(chunks) {
  return chunks.map((c) => `### ${c.section_path}\n\n${c.content}`).join("\n\n---\n\n");
}

async function callGrok(systemPrompt, prompt) {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    body: JSON.stringify({
      model: "grok-3-fast",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }],
      stream: false,
      max_tokens: 3500,
    }),
  });
  return (await res.json()).choices[0].message.content;
}

const TESTS = [
  {
    name: "Authority Loop",
    prompt: "Use the Authority Loop story framework for me. I'm a brand strategist for women launching their first $5K-10K offer. I want to drive bookings to my 3-month strategy intensive at $4,500. Write the story sequence.",
  },
  {
    name: "Anticipation Arc",
    prompt: "Use the Anticipation Arc story framework. I'm doing a 5-day countdown to opening enrolment for my $1,997 group programme on aligned income for female founders. Write the story sequence I can run across the lead-up.",
  },
  {
    name: "Casual Conversation Close",
    prompt: "Use the Casual Conversation Close story framework. I'm a creative writing coach for novelists with day jobs, selling a $2,400 12-week intensive. I want a softer, conversational story sequence. Write it.",
  },
];

(async () => {
  await loadEnv();
  const sys = await loadProductionSystemPrompt();
  for (const t of TESTS) {
    const embedding = await embedQuery(t.prompt);
    const [matched, rules] = await Promise.all([
      rpc("match_kb_chunks", { query_embedding: embedding, match_count: 6, similarity_threshold: 0.2, metadata_filter: {} }),
      rpc("match_kb_chunks", { query_embedding: embedding, match_count: 20, similarity_threshold: 0, metadata_filter: { section_type: "rules" } }),
    ]);
    const ruleIds = new Set(rules.map((r) => r.id));
    const dynamic = matched.filter((m) => !ruleIds.has(m.id));
    const kbBlock = `### Writing Rules\n\n${formatChunks(rules)}\n\n---\n\n### Frameworks\n\n${formatChunks(dynamic)}`;
    const reply = await callGrok(`${sys}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${kbBlock}`, t.prompt);
    console.log(`\n${"=".repeat(80)}\n${t.name}\n${"=".repeat(80)}\n${reply}\n`);
  }
})();
