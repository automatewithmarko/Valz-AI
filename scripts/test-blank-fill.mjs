// Verifies the agent fills Plug-and-Play blanks rather than paraphrasing.
// Looks for the exact scaffold sentence patterns from the KB Plug-and-Play
// in the assistant's output.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

async function loadEnv() {
  const t = await readFile(resolve(ROOT, ".env.local"), "utf8");
  for (const raw of t.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

async function loadSys() {
  const s = await readFile(resolve(ROOT, "src/app/api/chat/route.ts"), "utf8");
  return s.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/)[1];
}

async function embed(t) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "text-embedding-3-large", input: t, dimensions: 1536 }),
  });
  return (await r.json()).data[0].embedding;
}

async function rpc(fn, args) {
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
    body: JSON.stringify(args),
  });
  return r.json();
}

async function callGrok(systemPrompt, userMessage) {
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    body: JSON.stringify({
      model: "grok-4-fast-reasoning",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
      stream: false,
      max_tokens: 4000,
    }),
  });
  return (await r.json()).choices[0].message.content;
}

const fmt = (chunks) => chunks.map((c) => `### ${c.section_path}\n\n${c.content}`).join("\n\n---\n\n");

(async () => {
  await loadEnv();
  const sys = await loadSys();
  const userMsg = "Use the Small Shift, Big Shift framework. I'm a confidence coach for women in their 30s who've quietly built skill in their day jobs but undercharge in their side businesses. The shift I want to surface: stop chasing more certifications, start listing the wins they already have. My voice is grounded, calm, observational. Write the carousel.";

  const e = await embed(userMsg);
  const [matched, rules] = await Promise.all([
    rpc("match_kb_chunks", { query_embedding: e, match_count: 6, similarity_threshold: 0.2, metadata_filter: {} }),
    rpc("match_kb_chunks", { query_embedding: e, match_count: 20, similarity_threshold: 0, metadata_filter: { section_type: "rules" } }),
  ]);
  const ruleIds = new Set(rules.map((r) => r.id));
  const dynamic = matched.filter((m) => !ruleIds.has(m.id));
  const kbBlock = `### Writing Rules\n\n${fmt(rules)}\n\n---\n\n### Frameworks\n\n${fmt(dynamic)}`;
  const reply = await callGrok(`${sys}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${kbBlock}`, userMsg);

  console.log("=".repeat(80));
  console.log("REPLY");
  console.log("=".repeat(80));
  console.log(reply);
  console.log();

  // Audit: are the canonical fill-in scaffold openings present?
  // From Small Shift, Big Shift Plug-and-Play in KB:
  const scaffoldPatterns = [
    { slide: 1, opener: /(?:I used to believe|For a long time I thought)/i, label: "Slide 1 starts with 'I used to believe' or 'For a long time I thought'" },
    { slide: 2, opener: /(?:What I didn'?t see at the time was|Most people don'?t realise)/i, label: "Slide 2 starts with 'What I didn't see at the time was' or 'Most people don't realise'" },
    { slide: 3, opener: /(?:It looked like|It felt like|Behind the scenes,? I was)/i, label: "Slide 3 has 'It looked like' / 'It felt like' / 'Behind the scenes, I was'" },
    { slide: 4, opener: /(?:The shift happened when|Instead of)/i, label: "Slide 4 has 'The shift happened when' or 'Instead of'" },
    { slide: 5, opener: /(?:Since then,? )/i, label: "Slide 5 has 'Since then,'" },
    { slide: 6, opener: /(?:It feels like)/i, label: "Slide 6 has 'It feels like'" },
    { slide: 7, opener: /(?:If you'?re currently|Comment )/i, label: "Slide 7 has 'If you're currently' or 'Comment'" },
  ];

  console.log("=".repeat(80));
  console.log("AUDIT — does each slide use the Plug-and-Play scaffold opening?");
  console.log("=".repeat(80));
  let hits = 0;
  for (const p of scaffoldPatterns) {
    const present = p.opener.test(reply);
    console.log(`  Slide ${p.slide}: ${present ? "✓" : "❌"}  ${p.label}`);
    if (present) hits++;
  }
  console.log(`\n  Scaffold-opener hits: ${hits}/${scaffoldPatterns.length}`);
  console.log(`  Verdict: ${hits >= 5 ? "PASS — agent fills the Plug-and-Play blanks" : "FAIL — agent is paraphrasing instead of filling blanks"}`);
})();
