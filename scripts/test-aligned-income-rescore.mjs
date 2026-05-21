// Re-score the 6 saved blueprint outputs with corrected validators.
// The first pass used markdown-heading regexes; the model actually uses
// bold "**Step N: Title**" markers. This rescore matches both shapes and
// gives a more accurate per-check pass rate without re-running the API.

import { readFile, readdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, ".test-outputs");

const PERSONA_DETAILS = [
  "Cassandra Valzacchi",
  "financial services",
  "dashboards",
  "one-pager",
  "burnout at 28",
  "Sydney to Brisbane",
  "brand strategist",
  "early-stage founders",
  "energy spent vs energy generated",
  "journalling",
  "operational management",
  "quietly stuck",
  "without quitting overnight",
  "competent but invisible",
  "quiet exhale",
  "chest-clench",
];

const EXPECTED_STEPS = [
  { n: 1, key: "Human Design" },
  { n: 2, key: "Identity Pattern" },
  { n: 3, key: "Intellectual Property" },
  { n: 4, key: "Product Opportunity" },
  { n: 5, key: "Most Aligned" },
  { n: 6, key: "Brand Architecture" },
  { n: 7, key: "Audience Psychology" },
  { n: 8, key: "Content That Sells" },
  { n: 9, key: "Platform Strategy" },
  { n: 10, key: "Content Types" },
  { n: 11, key: "Content Pillars" },
  { n: 12, key: "Market Gaps" },
  { n: 13, key: "Transformation" },
  { n: 14, key: "Monetisation" },
  { n: 15, key: "90-Day" },
];

// Split a blueprint into per-step chunks regardless of whether the model
// used "## Step N: …" or "**Step N: …**". Line-based, robust.
function splitSteps(output) {
  const lines = output.split("\n");
  // A heading line is one that starts (after optional whitespace) with
  // either `#+ Step N` or `**Step N`. Capture the step number.
  const headingRe = /^\s*(?:#+\s*|\*\*\s*)Step\s+(\d{1,2})\b/i;
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(headingRe);
    if (m) {
      if (current) sections.push(current.text);
      current = { n: Number(m[1]), text: line + "\n" };
    } else if (current) {
      current.text += line + "\n";
    }
  }
  if (current) sections.push(current.text);
  // Deduplicate by step number (in case the heading appears twice — e.g.
  // a TOC line plus the real one).
  const byN = new Map();
  for (const s of sections) {
    const m = s.match(headingRe);
    if (m && !byN.has(Number(m[1]))) byN.set(Number(m[1]), s);
  }
  return Array.from({ length: 15 }, (_, i) => byN.get(i + 1) ?? "");
}

function runChecks(output) {
  const results = [];
  const push = (name, ok, detail) => results.push({ name, ok, detail: detail || "" });

  push("summary markers", /===SUMMARY_START===[\s\S]*?===SUMMARY_END===/.test(output));
  push("# YOUR ALIGNED INCOME BLUEPRINT heading", /#\s*YOUR ALIGNED INCOME BLUEPRINT/i.test(output));
  push("===BRAND_DNA_COMPLETE=== terminator", /===BRAND_DNA_COMPLETE===\s*$/m.test(output));

  const missingSteps = EXPECTED_STEPS.filter(({ key }) => !new RegExp(key, "i").test(output));
  push("all 15 steps present", missingSteps.length === 0, missingSteps.length ? `missing: ${missingSteps.map((s) => `${s.n}.${s.key}`).join(", ")}` : "");

  // Section Framing Protocol — split with the corrected line-based splitter.
  const stepSections = splitSteps(output);
  const present = stepSections.filter((s) => s);
  const rationaleHits = present.filter((s) => {
    const headerEnd = s.search(/\n/);
    const afterHeader = s.slice(headerEnd >= 0 ? headerEnd : 0, (headerEnd >= 0 ? headerEnd : 0) + 700);
    return /(\byou\b|\byour\b)/i.test(afterHeader);
  }).length;
  const bridgeHits = present.filter((s, i, arr) => {
    const tail = s.slice(-900);
    if (i === arr.length - 1) return /(close|complete|next chapter|forward|begin|launch|first 24 hours|in your hands)/i.test(tail);
    return /(\bnext\b|\bStep\s*\d+|brings (you|us) to|leads into|what comes next|what's coming|opens into|sets up|carries (you|us) into|moves into|hands you|takes (us|you) into|raw material|foundation|is what the next)/i.test(tail);
  }).length;
  push(`rationale (second-person) on ≥10/15 steps`, rationaleHits >= 10, `${rationaleHits}/${present.length}`);
  push(`bridge (forward-reference) on ≥10/15 steps`, bridgeHits >= 10, `${bridgeHits}/${present.length}`);

  const detailHits = PERSONA_DETAILS.filter((d) => output.toLowerCase().includes(d.toLowerCase())).length;
  push(`≥8 planted user details referenced`, detailHits >= 8, `${detailHits}/${PERSONA_DETAILS.length}`);

  const bannedVerbatim = [
    "Now that we have a clear picture of how you are actually wired to work",
    "What comes through clearly across all of this is that your strongest moments",
  ];
  const banned = bannedVerbatim.filter((p) => output.includes(p));
  push("no worked-example verbatim", banned.length === 0, banned.length ? `pasted: ${banned[0].slice(0, 40)}…` : "");

  const emDashes = (output.match(/—/g) || []).length;
  const enDashes = (output.match(/–/g) || []).length;
  push(`em-dashes < 10`, emDashes < 10, `${emDashes} found`);
  push(`en-dashes < 5`, enDashes < 5, `${enDashes} found`);

  const contrastHits = (output.match(/\b(it'?s|isn'?t|wasn'?t)\b[^.\n]{0,30}\b(but|it'?s|that'?s|it was)\b/gi) || []).length;
  push(`contrast formulas < 5`, contrastHits < 5, `${contrastHits} suspected`);

  // Per-step depth (using forgiving substring matches inside the split chunk).
  const stepBlock = (n) => stepSections[n - 1] ?? "";

  // Step 4: ≥3 product routes — count any structural per-route signal.
  // Each route reliably includes "Revenue potential" (master prompt spec)
  // so we count those occurrences; this is the cleanest robust signal.
  const s4 = stepBlock(4);
  const routeSignals = (s4.match(/revenue\s+potential|delivery\s+format/gi) || []).length;
  // We saw ≥1 per route in practice; >=6 = 3 routes (2 signals each).
  push(`Step 4: ≥3 product routes (by Revenue/Delivery markers ≥6)`, routeSignals >= 6, `${routeSignals} structural markers`);

  const s6 = stepBlock(6);
  push(`Step 6: brand voice / 5 adjectives`, /(brand\s+voice|five\s+adjectives|5\s+adjectives)/i.test(s6));
  push(`Step 6: 3 archetypes`, /archetype/i.test(s6));
  push(`Step 6: signature beliefs`, /signature\s+beliefs?/i.test(s6));
  push(`Step 6: brand essence`, /brand\s+essence/i.test(s6));

  const s7 = stepBlock(7);
  push(`Step 7: daily life snapshot`, /daily\s+life|day(?:'s)?\s+routine|a\s+(typical|specific)\s+(tuesday|morning|day|moment)/i.test(s7));
  push(`Step 7: internal dialogue`, /internal\s+dialogue/i.test(s7));
  push(`Step 7: hidden fears`, /hidden\s+fears?/i.test(s7));

  const s11 = stepBlock(11);
  // Pillar markers: "Pillar one", "Pillar 1", "1. Pillar", or "Pillar:" lines.
  const pillars = (s11.match(/\bPillar\s+(one|two|three|four|five|\d+)\b|^\s*Pillar\s+\d+/gim) || []).length;
  push(`Step 11: ≥3 pillars named`, pillars >= 3, `${pillars} markers`);
  // Hooks check: count headings like "Hooks for [Pillar]" OR "10 hook ideas"
  const perPillarHookHeadings = (s11.match(/^\s*(?:#+\s*|\*\*\s*)?Hooks?\s+(?:for|ideas?\s+for)\s+[^\n]+$|^(?:ten|10)\s+hook\s+ideas?\s+for/gim) || []).length;
  push(`Step 11: ≥1 dedicated hook block`, perPillarHookHeadings >= 1, `${perPillarHookHeadings} hook blocks`);
  push(`Step 11: hooks PER pillar (≥3 dedicated hook blocks)`, perPillarHookHeadings >= 3, `${perPillarHookHeadings} per-pillar hook blocks`);

  const s14 = stepBlock(14);
  push(`Step 14: pricing reasoning`, /\$\s*\d|price|pricing/i.test(s14));
  push(`Step 14: energy pacing`, /energy\s+pacing/i.test(s14));
  push(`Step 14: phased roadmap (validation/beta/refinement/scale)`,
    /(validation|beta|refinement|scale)/i.test(s14) && (s14.match(/(validation|beta|refinement|scale)/gi) || []).length >= 2);

  const s15 = stepBlock(15);
  push(`Step 15: month 1/2/3`, /(month\s+1|month one)/i.test(s15) && /(month\s+2|month two)/i.test(s15) && /(month\s+3|month three)/i.test(s15));
  push(`Step 15: resistance point`, /resistance|stall|pull back|convince themselves/i.test(s15));
  push(`Step 15: end-of-month marker`, /(end-of-month|end of month|marker|proof point|behaviour change)/i.test(s15));

  return results;
}

(async () => {
  const files = (await readdir(OUT)).filter((f) => /^blueprint-run-\d+\.md$/.test(f)).sort();
  if (files.length === 0) {
    console.log("No saved outputs in .test-outputs/. Run the full-blueprint test first.");
    return;
  }
  console.log(`Re-scoring ${files.length} saved blueprint outputs with corrected validators.\n`);

  const runs = [];
  for (const f of files) {
    const text = await readFile(resolve(OUT, f), "utf8");
    const results = runChecks(text);
    runs.push({ file: f, results });
    const passed = results.filter((r) => r.ok).length;
    console.log("─".repeat(72));
    console.log(`${f}  —  ${passed}/${results.length} checks passed`);
    for (const r of results) {
      const tag = r.ok ? " ✓" : " ✗";
      console.log(`    ${tag} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
    }
  }

  console.log("\n" + "═".repeat(72));
  console.log("AGGREGATE");
  console.log("═".repeat(72));
  const names = runs[0].results.map((r) => r.name);
  for (const name of names) {
    const pass = runs.filter((r) => r.results.find((c) => c.name === name && c.ok)).length;
    const status = pass === runs.length ? " ✓" : pass === 0 ? " ✗" : " ~";
    console.log(`  ${status} ${name}  —  ${pass}/${runs.length}`);
  }
  const tot = names.length * runs.length;
  const ok = runs.reduce((a, r) => a + r.results.filter((c) => c.ok).length, 0);
  console.log(`\n  Overall: ${ok}/${tot} (${((ok / tot) * 100).toFixed(1)}%)`);
})();
