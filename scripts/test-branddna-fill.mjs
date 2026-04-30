// Verifies the agent pulls niche / audience / offer / voice details from
// the injected Aligned Income Blueprint when filling carousel slides,
// instead of using placeholders or asking clarifying questions.

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

async function embed(text) {
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "text-embedding-3-large", input: text, dimensions: 1536 }),
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

async function buildKb(query) {
  const e = await embed(query);
  const [matched, rules] = await Promise.all([
    rpc("match_kb_chunks", { query_embedding: e, match_count: 6, similarity_threshold: 0.2, metadata_filter: {} }),
    rpc("match_kb_chunks", { query_embedding: e, match_count: 20, similarity_threshold: 0, metadata_filter: { section_type: "rules" } }),
  ]);
  const ruleIds = new Set(rules.map((r) => r.id));
  return { rules, dynamic: matched.filter((m) => !ruleIds.has(m.id)) };
}

const fmt = (chunks) => chunks.map((c) => `### ${c.section_path}\n\n${c.content}`).join("\n\n---\n\n");

// Synthetic Aligned Income Blueprint to inject as the "user's brand DNA".
// Specific enough that the agent has no excuse to ask for niche/audience/offer.
const FAKE_BLUEPRINT = `# YOUR ALIGNED INCOME BLUEPRINT

## Step 1: Human Design Calculation & Interpretation
Sarah is a Projector with Splenic Authority, 6/2 Role Model/Hermit profile.

## Step 2: Identity Pattern Extraction
Sarah quietly walked away from a director-level marketing role at 42 after a slow-burn corporate burnout. She took a year off, then rebuilt around 1:1 strategy work. Recurring lived moment: the morning she sat in her parked car for 40 minutes before going into the office, googling "is it normal to dread Monday this much".

## Step 5: Most Aligned Starting Product
**The Quiet Exit** — a $1,200 6-week 1:1 strategy intensive for senior managers ready to leave corporate. Currently her primary offer.

## Step 6: Brand Architecture
**Brand name:** The Quiet Exit Co.
**Audience:** Women in their 40s in senior corporate roles (directors, senior managers) who've been told they're "too sensitive" for the corporate machine.
**Brand voice:** Surgical, observational, refuses empty motivation. Calm tonal authority. Sentences unfold rather than punch. Avoids slogans.
**Audience contradiction:** They're the competent ones in every meeting, so no one notices they're suffocating.

## Step 7: Audience Psychology & Behavioural Intelligence
Behaviour: They keep the role, work overtime to "prove" they can manage burnout.
Consequence: They're praised for resilience, internalise that exhaustion is the price of competence.
Solution: A quiet exit plan that doesn't require an identity-shaped collapse first.

## Step 8: Content That Sells Strategy
Pillars: corporate-exit playbook, nervous-system-aware career planning, "the quiet woman" archetype work, role redesign, soft-launch business architecture.

## Step 14: Monetisation Roadmap
Pricing logic: $1,200 sits below the threshold of "needs partner approval" for senior corporate salaries. Communicates "real but accessible".
`;

const SYSTEM_PROMPT_BUILD = (sys, kb) =>
  `${sys}

## THE USER'S ALIGNED INCOME BLUEPRINT (BRAND DNA)

The user has already completed their Aligned Income Blueprint. This is their complete brand strategy, Human Design reading, audience profile, product direction, content plan, and monetisation roadmap. You MUST use this as your knowledge base for every conversation. Do NOT ask questions about things that are already covered in the blueprint below. Reference their specific details (brand name, audience, product, Human Design type, authority, profile) naturally.

If the user asks for help with something covered in their blueprint (content strategy, brand voice, audience targeting, product development, pricing, etc.), use the specific details from their blueprint, not generic advice.

---
${FAKE_BLUEPRINT}
---

## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)

${kb}`;

async function callGrok(systemPrompt, userMessage) {
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    body: JSON.stringify({
      model: "grok-4-fast-reasoning",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
      stream: false,
      max_tokens: 6000,
    }),
  });
  return (await r.json()).choices[0].message.content;
}

const SCENARIOS = [
  {
    name: "Vague sales-carousel ask — Blueprint must drive specifics",
    prompt: "Write me a sales carousel.",
    // Key details from Blueprint that should appear in the output
    expectKeywords: [
      "Quiet Exit",
      "1,200",
      "6-week",
      "directors",
    ],
    expectAtLeast: 3, // require at least 3 of the keywords
  },
  {
    name: "Vague growth-carousel ask — Blueprint audience must drive copy",
    prompt: "Give me a growth carousel.",
    expectKeywords: ["40s", "corporate", "burnout", "quiet"],
    expectAtLeast: 2,
  },
  {
    name: "Story sequence — must use Blueprint pillars and audience",
    prompt: "Write me a story sequence I can run today to sell my offer.",
    expectKeywords: ["Quiet Exit", "1,200", "directors", "corporate"],
    expectAtLeast: 3,
  },
];

(async () => {
  await loadEnv();
  const sys = await loadProductionSystemPrompt();

  const results = [];
  for (const s of SCENARIOS) {
    console.log("\n" + "=".repeat(80));
    console.log(`SCENARIO: ${s.name}`);
    console.log("=".repeat(80));
    const { rules, dynamic } = await buildKb(s.prompt);
    const kbBlock = `### Writing Rules\n\n${fmt(rules)}\n\n---\n\n### Frameworks\n\n${fmt(dynamic)}`;
    const reply = await callGrok(SYSTEM_PROMPT_BUILD(sys, kbBlock), s.prompt);

    const lower = reply.toLowerCase();
    const hits = s.expectKeywords.filter((kw) => lower.includes(kw.toLowerCase()));
    const askedClarifyingFirst =
      /^[\s\S]{0,300}(what'?s your|tell me|can you share|what is your|who is your|do you have)\s/i.test(reply.trim()) ||
      /^[\s\S]{0,200}\?\s*$/.test(reply.trim());

    console.log("\n[Reply]\n" + reply);
    console.log("\n[Audit]");
    console.log(`  Blueprint keywords hit:    ${hits.join(" | ") || "❌ none"} (${hits.length}/${s.expectKeywords.length}, need ≥${s.expectAtLeast})`);
    console.log(`  Asked clarifying first:    ${askedClarifyingFirst ? "❌ YES" : "✓ no"}`);
    const passed = hits.length >= s.expectAtLeast && !askedClarifyingFirst;
    console.log(`  → ${passed ? "PASS" : "FAIL"}`);
    results.push({ name: s.name, passed, hits });
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  for (const r of results) console.log(`  ${r.passed ? "PASS" : "FAIL"}  ${r.name}`);
  const pass = results.filter((r) => r.passed).length;
  console.log(`\n  ${pass}/${results.length}`);
})();
