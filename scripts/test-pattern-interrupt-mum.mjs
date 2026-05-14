// Reproduce the failure the user reported: Pattern Interrupt carousel for
// busy-mum diet scenario was paraphrasing instead of filling the
// Plug-and-Play scaffolds and also leaked a contrast formula
// ("It's not X, but Y") on slide 4.
//
// Audits:
//   1. Each slide uses the Plug-and-Play scaffold opening.
//   2. No contrast formula (Writing Rules §1.2) anywhere in the body.

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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-large",
      input: t,
      dimensions: 1536,
    }),
  });
  return (await r.json()).data[0].embedding;
}

async function rpc(fn, args) {
  const r = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fn}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(args),
    }
  );
  return r.json();
}

async function callGrok(systemPrompt, messages) {
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "grok-4-fast-reasoning",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: false,
      max_tokens: 4000,
    }),
  });
  return (await r.json()).choices[0].message.content;
}

const fmt = (chunks) =>
  chunks.map((c) => `### ${c.section_path}\n\n${c.content}`).join("\n\n---\n\n");

(async () => {
  await loadEnv();
  const sys = await loadSys();

  // The user's reported scenario: busy mums diet/weight loss niche,
  // results-driven programme, time-poor audience. The agent picked
  // Pattern Interrupt itself — we use the same situational prompt and
  // confirm fork by asking for that framework.
  const messages = [
    {
      role: "user",
      content:
        "I run a weight loss programme for busy mums who don't have time to log every meal or do 90-minute gym sessions. My differentiator is that it's results-driven and respects their actual schedule (school runs, work calls, family). Most of my audience is stuck in quick-fix cycles: 7-day cleanses, no-carb hacks, midnight scrolling on diet apps. I want a carousel that calls out those traps and reframes toward my approach. Pick the right framework.",
    },
    { role: "assistant", content: "Going with Pattern Interrupt because it calls out the quick-fix noise and reframes toward your steady, results-driven approach. Want me to pull the canonical template and write it?" },
    { role: "user", content: "yeah go ahead" },
  ];

  const queryForRetrieval = messages.map((m) => m.content).join("\n");
  const e = await embed(queryForRetrieval);
  const [matched, rules] = await Promise.all([
    rpc("match_kb_chunks", {
      query_embedding: e,
      match_count: 6,
      similarity_threshold: 0.2,
      metadata_filter: {},
    }),
    rpc("match_kb_chunks", {
      query_embedding: e,
      match_count: 20,
      similarity_threshold: 0,
      metadata_filter: { section_type: "rules" },
    }),
  ]);
  const ruleIds = new Set(rules.map((r) => r.id));
  const dynamic = matched.filter((m) => !ruleIds.has(m.id));

  console.log("RETRIEVED CHUNKS:");
  for (const c of dynamic) {
    console.log(`  · ${c.section_path}  (sim=${c.similarity?.toFixed(3)})`);
  }
  console.log();

  const kbBlock =
    `### Writing Rules\n\n${fmt(rules)}\n\n---\n\n### Frameworks\n\n${fmt(dynamic)}`;
  const reply = await callGrok(
    `${sys}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${kbBlock}`,
    messages
  );

  console.log("=".repeat(80));
  console.log("REPLY");
  console.log("=".repeat(80));
  console.log(reply);
  console.log();

  // Pattern Interrupt Plug-and-Play scaffold openings from KB:
  //   Slide 1: "I don't know which __________ needs to hear this…"
  //   Slide 2: three lines starting "__________ won't automatically/guarantee/create __________"
  //   Slide 3: three lines starting "Growth comes from / Momentum builds when / Real traction starts with"
  //   Slide 4: "__________ is powerful. / __________ can help. / They're valuable when / Just be careful not to"
  //   Slide 5: "Tools amplify __________. / Clarity creates __________. / Alignment sustains __________."
  const scaffoldPatterns = [
    {
      slide: 1,
      re: /(?:I don'?t know which|I dont know which)\b[^.\n!?]{1,200}\bneeds to hear this/i,
      label: "Slide 1: \"I don't know which ___ needs to hear this…\"",
    },
    {
      slide: 2,
      re: /\bwon'?t automatically\b|\bwon'?t guarantee\b|\bwon'?t create\b/i,
      label: "Slide 2: \"___ won't automatically/guarantee/create ___\"",
    },
    {
      slide: 3,
      re: /\b(Growth comes from|Momentum builds when|Real traction starts with)\b/i,
      label: "Slide 3: \"Growth comes from / Momentum builds when / Real traction starts with\"",
    },
    {
      slide: 4,
      re: /\bis powerful\b|\bcan help\b|\bThey'?re valuable when\b|\bJust be careful not to\b/i,
      label: "Slide 4: \"___ is powerful / can help / valuable when / Just be careful not to ___\"",
    },
    {
      slide: 5,
      re: /\bTools amplify\b|\bClarity creates\b|\bAlignment sustains\b/i,
      label: "Slide 5: \"Tools amplify ___ / Clarity creates ___ / Alignment sustains ___\"",
    },
  ];

  console.log("=".repeat(80));
  console.log("AUDIT 1 — Plug-and-Play scaffold openings");
  console.log("=".repeat(80));
  let hits = 0;
  for (const p of scaffoldPatterns) {
    const present = p.re.test(reply);
    console.log(`  Slide ${p.slide}: ${present ? "✓" : "❌"}  ${p.label}`);
    if (present) hits++;
  }
  console.log(`  → Scaffold hits: ${hits}/${scaffoldPatterns.length}`);

  console.log();
  console.log("=".repeat(80));
  console.log("AUDIT 2 — Writing Rules §1.2 (contrast formula)");
  console.log("=".repeat(80));
  const contrastPatterns = [
    /\bit'?s not\b[^.!?\n]{0,80}\bit'?s\b/i,
    /\bit'?s not\b[^.!?\n]{0,80}\bbut\b/i,
    /\bit wasn'?t\b[^.!?\n]{0,80}\bit was\b/i,
    /\bnot just\b[^.!?\n]{0,80}\bbut\b/i,
    /\bisn'?t (?:about|just)\b[^.!?\n]{0,80}\bit'?s\b/i,
    /\bdoesn'?t\b[^.!?\n]{0,60}\bbut\b[^.!?\n]{0,60}\b(?:can|is|does)\b/i,
  ];
  const contrastHits = [];
  // Iterate per-line so we can show offending lines
  for (const line of reply.split("\n")) {
    for (const cp of contrastPatterns) {
      if (cp.test(line)) {
        contrastHits.push({ pattern: cp.source, line: line.trim() });
        break;
      }
    }
  }
  if (contrastHits.length === 0) {
    console.log("  ✓ no contrast-formula violations detected");
  } else {
    for (const h of contrastHits) {
      console.log(`  ❌  ${h.line}`);
      console.log(`        (pattern: ${h.pattern})`);
    }
  }

  console.log();
  const passed = hits >= 4 && contrastHits.length === 0;
  console.log(passed ? "PASS" : "FAIL");
})();
