// Verifies two newly-tightened rules:
//   1. No contrast-formula violations in slide bodies (Writing Rules §1.2).
//   2. Trailing follow-up is the new tweaks/caption question, NOT the
//      visuals offer (which now belongs to the next turn).
//   3. After the user accepts/declines tweaks on a second turn, the
//      visuals offer DOES appear.

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

async function callGrok(systemPrompt, messages) {
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    body: JSON.stringify({
      model: "grok-4-fast-reasoning",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: false,
      max_tokens: 5000,
    }),
  });
  return (await r.json()).choices[0].message.content;
}

// Detect Writing-Rules §1.2 violations in slide body text.
// Slide-label lines (e.g. "**Slide 3 - Reframe the Narrative**" or
// "**Slide 3 — ...**") are structural markers, not body copy, so we
// strip them before auditing.
function findWritingRuleViolations(text) {
  const stripped = text
    .split("\n")
    .filter((line) => !/^\s*\*\*Slide\s*\d+\s*[-—–]/i.test(line) && !/^\s*\*\*[A-Z][A-Z0-9 +\-/&]+\*\*\s*$/.test(line))
    .join("\n");

  const violations = [];

  // Em / en dashes
  if (/[—–]/.test(stripped)) {
    const m = stripped.match(/.{0,30}[—–].{0,30}/);
    violations.push({ rule: "em/en dash", excerpt: m?.[0]?.trim() });
  }

  // Contrast formulas: "it's not X, it's Y" / "it wasn't X, it was Y" / "not X, but Y"
  // Two-clause sentence joined by comma where first clause is negation and
  // second clause asserts.
  const contrastPatterns = [
    /\b(?:it'?s?|that'?s?|this is|it was|it wasn'?t|that wasn'?t|this wasn'?t)\s+not\s+(?:about|just\s+about)?\s*[^.,]{2,80}[,.]\s*(?:it'?s?|that'?s?|it was|that was|this is|this was)\b/i,
    /\bnot\s+just\s+[^,.]{2,80},\s*(?:it'?s|but|it was|that'?s)\b/i,
    /\bit'?s? not\s+[^,.]{2,80},\s*it'?s\s+/i,
    /\bit wasn'?t\s+[^,.]{2,80},\s*it was\s+/i,
    /\bnot\s+[^,.]{2,80},\s*but\s+/i,
  ];
  for (const re of contrastPatterns) {
    const m = text.match(re);
    if (m) {
      violations.push({ rule: "contrast formula (It's not X, it's Y)", excerpt: m[0].slice(0, 140).trim() });
      break;
    }
  }

  return violations;
}

const PROMPT = "Use the Curiosity Carousel. I'm a fitness coach for new mums going back to gyms after baby. They feel watched, like everyone's silently judging their form, their pace, their body. The shift I want to surface: that watched feeling has nothing to do with the room — it shows up the moment the camera comes out, the moment they think about posting. Brand voice: warm, observational, calm. Write the carousel.";

(async () => {
  await loadEnv();
  const sys = await loadSys();

  console.log("=".repeat(80));
  console.log("TURN 1 — initial carousel + new tweaks/caption follow-up");
  console.log("=".repeat(80));

  const { rules, dynamic } = await buildKb(PROMPT);
  const kbBlock = `### Writing Rules\n\n${fmt(rules)}\n\n---\n\n### Frameworks\n\n${fmt(dynamic)}`;
  const reply1 = await callGrok(`${sys}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${kbBlock}`, [
    { role: "user", content: PROMPT },
  ]);
  console.log("\n[Reply]\n" + reply1);

  // Audit
  const slideRegion = (() => {
    const idx = reply1.search(/^\s*\*?\*?Slide\s*\d+/m);
    return idx >= 0 ? reply1.slice(idx) : reply1;
  })();
  const violations = findWritingRuleViolations(slideRegion);
  const trailingQ = reply1.slice(-500);
  const hasTweaksAsk = /(tweak|tweaks)[^?]*\?/i.test(trailingQ) && /(caption)/i.test(trailingQ);
  const hasVisualsOnTurn1 = /(visual|sketch).{0,80}\?/i.test(trailingQ);

  console.log("\n[Audit — Turn 1]");
  console.log(`  Writing-rule violations: ${violations.length === 0 ? "✓ none" : "❌"}`);
  for (const v of violations) console.log(`     · ${v.rule}: "${v.excerpt}"`);
  console.log(`  Trailing question is tweaks/caption: ${hasTweaksAsk ? "✓ yes" : "❌ no"}`);
  console.log(`  Visuals offer leaked onto turn 1:    ${hasVisualsOnTurn1 ? "❌ yes (should be turn 2)" : "✓ no"}`);

  const turn1Pass = violations.length === 0 && hasTweaksAsk && !hasVisualsOnTurn1;

  // ── Turn 2 — user accepts, expects visuals offer
  console.log("\n" + "=".repeat(80));
  console.log("TURN 2 — user says 'looks good', expects visuals offer now");
  console.log("=".repeat(80));

  const userTurn2 = "Looks great, no tweaks. Caption isn't needed.";
  const reply2 = await callGrok(`${sys}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${kbBlock}`, [
    { role: "user", content: PROMPT },
    { role: "assistant", content: reply1 },
    { role: "user", content: userTurn2 },
  ]);
  console.log("\n[Reply]\n" + reply2);
  const visualsOnTurn2 = /(visual|sketch).{0,80}\?/i.test(reply2.slice(-500));
  console.log("\n[Audit — Turn 2]");
  console.log(`  Visuals offer present:   ${visualsOnTurn2 ? "✓ yes" : "❌ no"}`);

  const turn2Pass = visualsOnTurn2;

  console.log("\n" + "=".repeat(80));
  console.log(`SUMMARY: turn1=${turn1Pass ? "PASS" : "FAIL"}, turn2=${turn2Pass ? "PASS" : "FAIL"}`);
  console.log("=".repeat(80));
})();
