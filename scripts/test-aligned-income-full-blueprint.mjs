// Full Aligned Income Blueprint stress test, 6 runs.
//
// Bypasses the 51-question interview by feeding the model a comprehensive
// pre-baked "answers summary" and asking it to produce the FINAL blueprint
// in one shot (same call shape as production after the section-by-section
// review approves all 15 steps).
//
// Each run is graded against rules extracted from:
//   - Aligned income main doc.md   (the report structure spec)
//   - Master prompt aligned income.md   (depth + writing + framing rules)
//
// Results: per-run check table + aggregate summary.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUTPUTS_DIR = resolve(ROOT, ".test-outputs");

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

async function loadSystemPrompt() {
  const src = await readFile(
    resolve(ROOT, "src/app/api/brand-chat/route.ts"),
    "utf8"
  );
  const marker = "const SYSTEM_PROMPT = `";
  const start = src.indexOf(marker);
  const after = start + marker.length;
  const end = src.indexOf("`;", after);
  return src.slice(after, end);
}

// Specific planted client details. Each rationale and bridge across the
// blueprint should reference at least one of these somewhere nearby (we
// won't require it per-section but we do require many of them to appear
// across the full document).
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

const fakeReviewApproval = `===INTERVIEW_COMPLETE===

Below is the full interview transcript for Cassandra Valzacchi. Treat it as her complete questionnaire input.

HUMAN DESIGN: Type Projector. Strategy: wait for the invitation. Authority: Splenic. Profile: 4/6 — Opportunist/Role Model. Defined: Spleen, Ajna, Throat. Undefined: Sacral, Solar Plexus, Root, Heart, G-Center, Head. Personality Sun: Pisces 21°. Design Sun: Sagittarius 0°. Brisbane, Australia. DOB 12/03/1990.

SECTION 1 — LIFE MAP:
- 8 years as a corporate exec in financial services. Strong at synthesising messy data into clean dashboards and one-pagers. Became the person teams came to when something needed structure. What felt natural: pulling clarity out of chaos. What felt draining: the constant Zoom-call grind and being responsible for other people's deliverables.
- 2 years freelancing as a brand strategist for early-stage founders. Felt natural: small teams, real impact, honest conversations.
- Outperformed peers on synthesis and writing. Managers relied on her for "translating muddy strategy into a one-pager nobody could argue with." People thanked her for being "the one who could actually see what they meant."
- Major life chapters: career burnout at 28 (Googling "what's wrong with me" at 2am), geographic relocation Sydney → Brisbane at 30, two-year identity-crisis stretch (29 to 31) where she was Googling "how do I know what I actually want from work" at midnight, a healing arc through somatic work that didn't exist as a packaged offer when she needed it.

SECTION 2 — STRUGGLE → SKILL → RESULT:
- Struggled with knowing what she wanted from work after corporate. Figured it out via a season of weekly journalling, tracking energy spent vs energy generated. Strategy and writing kept landing on the green side. Operational management kept landing on the red.
- People naturally come to her for clarity. Friends ask about job-change decisions. Founders ask her to describe their product so it does not sound like everyone else. She has had this conversation literally hundreds of times.
- Topics she can talk about for hours: identity-led career changes, why competent women stall on visibility, how somatic awareness applies to professional decision-making.

SECTION 3 — WHO YOU FEEL CALLED TO HELP:
- Women in their 30s, late-corporate or recently exited, who feel quietly stuck. Tired of feeling competent but invisible. Embarrassed to admit they Google their "alignment" at 11pm. Frustrated daily by their own inability to make the move they keep telling themselves they want to make.

SECTION 4 — WHERE YOU ARE RIGHT NOW:
- Stage: Building a business.
- Current reality: Two hours of focused time per day, energy is up some weeks and dragging others, confidence in her thinking is high, financial stability is solid for now but the runway is finite.

SECTION 5 — CAPACITY + AMBITION:
- Income goal: Replace full-time income.
- Time available: 2 hours/day.
- On-camera: Maybe but nervous. Comfortable with prep, dreads on-the-fly.
- Platform: Instagram (where her audience is) but writing/blogging feels most natural to her brain.

SECTION 6 — ENERGY + DECISION PATTERNS:
- Decisions: Trusting gut instinct combined with talking it out with one trusted person.
- Aligned decision: Quitting corporate at 30 — body felt a quiet exhale.
- Misaligned decision: Taking on a 6-month operational consulting gig in 2024 — chest-clench, knew within a week.
- Emotion that shows up most in work: Disappointment when things don't work the way she expected (mirrors Projector not-self of bitterness).
- Opportunities currently feel like they require effort to summon, not yet flowing in.
- After working: Depleted by client-heavy days, energised by strategy/writing days.

SECTION 7 — PROBLEM DEPTH:
- Surface problem of audience: "I don't have time to start something on the side."
- Deeper problem: "I no longer trust that I can recognise what's mine — I've spent so long building other people's things that the thread back to my own sense of direction feels weak." (This is a belief, not a feeling.)
- Cost: Identity erosion. Months passing without traction. The slow erosion of believing the version of her life she pictures is still available.

SECTION 8 — HOW YOU NATURALLY HELP:
- When someone comes to her for help she instinctively asks a question that reframes their assumption, then offers structure once they've spoken. Coaching style, not consulting.
- Prefers to learn: Watching videos AND reading guides. Self-paced.
- Structure or exploration: Clear step-by-step frameworks for the first 80%, then open exploration for the last 20%.
- Comfortable sharing: Recording once and selling repeatedly. Writing guides. Building community.
- Uncomfortable: Daily live teaching.

SECTION 9 — CAPACITY + LIFESTYLE FILTER:
- Time consistently: 12 hours/week.
- Overwhelming: A daily live presence.
- Sustainable: Twice-weekly long-form thinking + 3-4 IG posts/week.
- Responsibility level: Structured outcomes. Light accountability, not full transformation oversight.
- Income vs impact: Balance of both, but currently weighted toward scalable income with depth in 1-2 close offers.

SECTION 10 — AMBITION + EDGE:
- Income goal: $5K to $10K per month.
- Reason: To stop watching the clock on her own runway and to fund a slower pace of decision-making.
- Visibility: Fully personal brand but selectively. Willing to share story and lessons. Boundary: not real-time personal grief.
- Platform least intimidating: Writing/blogging. Most intimidating: TikTok.

SECTION 11 — MESSY VISION:
- "I think I want to build something that helps people who feel quietly stuck in their careers find the version of work that fits how they're actually wired, without quitting overnight."
- Five years from now expert in: "the bridge between corporate competence and creator-led income."
- Embarrassing: Being known as another "freedom-lifestyle" coach.
- Powerful: Being known as the person who helped competent women find work that actually fits their wiring.

EAVESDROP PHRASES from her interview that capture her audience's internal language:
- "I'm so tired of feeling like I'm waiting for permission to want what I actually want."
- "I know it's not the money keeping me here."
- "What if I do the brave thing and find out I'm not actually any good at it."
- "I just need someone to tell me what to do."
- "Why is this so hard."

===ALL_15_SECTIONS_APPROVED===
Every step has been reviewed and approved by the client during the section-by-section review.

Now generate the COMPLETE final blueprint as a single message. Follow EVERY rule in your system prompt, including:
- The SECTION FRAMING PROTOCOL (rationale + bridge on every step).
- The DEPTH STANDARD (scenes, beliefs not behaviours, lived specificity).
- The WRITING RULES (no em dashes, no contrast formulas, Australian English).
- The output format: ===SUMMARY_START===...===SUMMARY_END===, then # YOUR ALIGNED INCOME BLUEPRINT, then all 15 steps in full, then ===BRAND_DNA_COMPLETE=== on its own line at the end.

Do not abbreviate any section. Step 11 must include the full hook/idea generation. Step 14 must include all pricing logic. Step 15 must include the full 3-month plan.`;

async function call(messages) {
  // Streaming mode — non-streaming times out on the gateway for very long
  // outputs like a full blueprint. Production uses streaming here too.
  const res = await fetch(`${process.env.MENTOR_API_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.MENTOR_API_KEY}`,
    },
    body: JSON.stringify({
      model: "xai/grok-3-fast",
      messages,
      stream: true,
      max_tokens: 32768,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let content = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let eol;
    while ((eol = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, eol).trim();
      buf = buf.slice(eol + 1);
      if (!line || !line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return content;
      try {
        const evt = JSON.parse(data);
        const delta = evt.choices?.[0]?.delta?.content ?? "";
        if (delta) content += delta;
      } catch {
        // skip malformed lines
      }
    }
  }
  return content;
}

// ─────────────────────────────────────────────────────────────────────
// VALIDATION RULES
// ─────────────────────────────────────────────────────────────────────

// Expected step heading hints (the model sometimes uses "## Step N:" or
// "## STEP N — TITLE" — we match liberally).
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

function runChecks(output) {
  const results = [];
  const push = (name, ok, detail) => results.push({ name, ok, detail: detail || "" });

  // 1. Output envelope
  push("summary markers", /===SUMMARY_START===[\s\S]*?===SUMMARY_END===/.test(output));
  push("# YOUR ALIGNED INCOME BLUEPRINT heading", /#\s*YOUR ALIGNED INCOME BLUEPRINT/i.test(output));
  push("===BRAND_DNA_COMPLETE=== terminator", /===BRAND_DNA_COMPLETE===\s*$/m.test(output));

  // 2. All 15 steps present (loose match per key phrase)
  const missingSteps = EXPECTED_STEPS.filter(({ key }) => !new RegExp(key, "i").test(output));
  push(
    "all 15 steps present",
    missingSteps.length === 0,
    missingSteps.length ? `missing: ${missingSteps.map((s) => `${s.n}.${s.key}`).join(", ")}` : ""
  );

  // 3. Section Framing Protocol — heuristic: count how many step sections
  // have at least one "you" / "your" within the first 400 chars after the
  // section heading (rationale check), and a forward reference ("next",
  // "Step N+1", "what comes next") in the last 600 chars of that step.
  // Approximate by splitting on step heading markers.
  const stepSplits = output.split(/(?=^#+\s*Step\s+\d+|^#+\s*\d+\.\s)/im);
  const stepSections = stepSplits.filter((s) => /^#+\s*Step\s+\d+|^#+\s*\d+\./im.test(s)).slice(0, 15);
  const rationaleHits = stepSections.filter((s) => {
    const after = s.slice(0, 500);
    return /(\byou\b|\byour\b)/i.test(after);
  }).length;
  const bridgeHits = stepSections.filter((s, i) => {
    if (i === stepSections.length - 1) return /(close|complete|launch|begin|next chapter|forward)/i.test(s.slice(-600));
    const tail = s.slice(-600);
    return /(\bnext\b|\bStep\s*\d+|what's coming|what comes next|brings us to)/i.test(tail);
  }).length;
  push(`rationale (second-person opener) on ≥10/15 steps`, rationaleHits >= 10, `found on ${rationaleHits}/${stepSections.length}`);
  push(`bridge (forward-reference at section close) on ≥10/15 steps`, bridgeHits >= 10, `found on ${bridgeHits}/${stepSections.length}`);

  // 4. Specific user details — at least 8 of 16 planted phrases should
  // appear across the document.
  const detailHits = PERSONA_DETAILS.filter((d) => output.toLowerCase().includes(d.toLowerCase())).length;
  push(`≥8 planted user details referenced`, detailHits >= 8, `${detailHits}/${PERSONA_DETAILS.length} present`);

  // 5. Worked-example verbatim — should NOT appear.
  const bannedVerbatim = [
    "Now that we have a clear picture of how you are actually wired to work",
    "What comes through clearly across all of this is that your strongest moments",
  ];
  const banned = bannedVerbatim.filter((p) => output.includes(p));
  push("no worked-example verbatim paste", banned.length === 0, banned.length ? `pasted: ${banned[0].slice(0, 40)}…` : "");

  // 6. Writing rules: no em dashes / en dashes in body
  // (We allow them inside the HD reading label area only — be lenient,
  // but flag when > 5 occurrences in the whole blueprint as suspicious.)
  const emDashes = (output.match(/—/g) || []).length;
  const enDashes = (output.match(/–/g) || []).length;
  push(`few em-dashes (<10)`, emDashes < 10, `${emDashes} found`);
  push(`few en-dashes (<5)`, enDashes < 5, `${enDashes} found`);

  // 7. No "It's not X, it's Y" contrast formulas (count and threshold)
  const contrastRe = /\b(it'?s|that'?s|this'?s|it was|that was|isn'?t|wasn'?t|wasn't)\b[^.\n]{0,30}\b(but|it'?s|that'?s|it was)\b/gi;
  const contrastHits = (output.match(contrastRe) || []).length;
  push(`few contrast formulas (<5)`, contrastHits < 5, `${contrastHits} suspected`);

  // 8. Specific structural requirements
  // 8a. Step 4: 3-5 product routes — look for at least 3 "product" / "route" markers
  const stepIdx = output.search(/Step\s+4[:\s—]/i);
  const step4 = stepIdx >= 0 ? output.slice(stepIdx, stepIdx + 6000) : "";
  const productRoutes = (step4.match(/(product\s+route|route\s+\d+|product\s+concept\s+name|opportunity\s+\d+)/gi) || []).length;
  push(`Step 4: ≥3 product routes`, productRoutes >= 3, `${productRoutes} route markers`);

  // 8b. Step 6 — Brand Architecture: contains 5 adjectives & 3 archetypes & signature beliefs
  const step6Start = output.search(/Step\s+6[:\s—]|Brand Architecture/i);
  const step6 = step6Start >= 0 ? output.slice(step6Start, step6Start + 8000) : "";
  push(`Step 6: brand voice in 5 adjectives`, /(5\s+(adjectives|words)|brand\s+voice[:\s])/i.test(step6));
  push(`Step 6: 3 archetypes`, /3\s+(brand\s+)?archetypes|archetype/i.test(step6));
  push(`Step 6: signature beliefs`, /signature\s+beliefs?/i.test(step6));
  push(`Step 6: brand essence`, /brand\s+essence/i.test(step6));

  // 8c. Step 7 — Audience: avatar, daily life, internal dialogue, hidden fears
  const step7Start = output.search(/Step\s+7[:\s—]|Audience Psychology/i);
  const step7 = step7Start >= 0 ? output.slice(step7Start, step7Start + 8000) : "";
  push(`Step 7: daily life snapshot`, /daily life|daily routine/i.test(step7));
  push(`Step 7: internal dialogue`, /internal\s+dialogue/i.test(step7));
  push(`Step 7: hidden fears`, /hidden\s+fears?/i.test(step7));

  // 8d. Step 11 — Content pillars + hook generation
  const step11Start = output.search(/Step\s+11[:\s—]|Content Pillars/i);
  const step11 = step11Start >= 0 ? output.slice(step11Start, step11Start + 15000) : "";
  const pillarCount = (step11.match(/^\s*Pillar\s*\d+|^\s*\d+\.\s+Pillar|\bPillar\s+(One|Two|Three|Four|Five)\b/gim) || []).length;
  push(`Step 11: ≥3 pillars named`, pillarCount >= 3, `${pillarCount} pillar markers`);
  const hooksCount = (step11.match(/hook/gi) || []).length;
  push(`Step 11: hooks generated (≥10 hook mentions)`, hooksCount >= 10, `${hooksCount} mentions of "hook"`);

  // 8e. Step 14 — Monetisation: pricing, energy pacing
  const step14Start = output.search(/Step\s+14[:\s—]|Monetisation/i);
  const step14 = step14Start >= 0 ? output.slice(step14Start, step14Start + 8000) : "";
  push(`Step 14: pricing reasoning present`, /\$\s*\d|price[d\s]|pricing/i.test(step14));
  push(`Step 14: energy pacing section`, /energy\s+pacing/i.test(step14));

  // 8f. Step 15 — 3 monthly phases + resistance points + end-of-month markers
  const step15Start = output.search(/Step\s+15[:\s—]|90-Day|90 Day/i);
  const step15 = step15Start >= 0 ? output.slice(step15Start) : "";
  push(`Step 15: month 1/2/3 referenced`, /(month\s+1|month one)/i.test(step15) && /(month\s+2|month two)/i.test(step15) && /(month\s+3|month three)/i.test(step15));
  push(`Step 15: resistance point named`, /resistance|stall|pull back/i.test(step15));

  return results;
}

function summarise(results) {
  const passed = results.filter((r) => r.ok).length;
  return { passed, total: results.length };
}

(async () => {
  await loadEnv();
  await mkdir(OUTPUTS_DIR, { recursive: true });
  const system = await loadSystemPrompt();

  console.log(`SYSTEM_PROMPT loaded: ${system.length.toLocaleString()} chars`);
  console.log(`Running 6 full blueprint generations against the live gateway. Each run can take 60-180 seconds.\n`);

  const runs = [];
  for (let i = 1; i <= 6; i++) {
    const t0 = performance.now();
    console.log("─".repeat(72));
    console.log(`RUN ${i}/6 starting …`);
    let output = "";
    let err = null;
    try {
      output = await call([
        { role: "system", content: system },
        { role: "user", content: fakeReviewApproval },
      ]);
    } catch (e) {
      err = e.message;
    }
    const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
    console.log(`RUN ${i} done in ${elapsed}s, ${output.length.toLocaleString()} chars`);

    if (err) {
      console.log(`  ERROR: ${err}`);
      runs.push({ i, err, elapsed, results: [] });
      continue;
    }

    // Save raw output for offline inspection
    await writeFile(resolve(OUTPUTS_DIR, `blueprint-run-${i}.md`), output, "utf8");

    const results = runChecks(output);
    const { passed, total } = summarise(results);
    console.log(`  CHECKS: ${passed}/${total} passed`);
    for (const r of results) {
      const tag = r.ok ? " ✓" : " ✗";
      console.log(`    ${tag} ${r.name}${r.detail ? `  (${r.detail})` : ""}`);
    }
    runs.push({ i, elapsed, output, results });
  }

  // ── Aggregate ─────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(72));
  console.log("AGGREGATE SUMMARY");
  console.log("═".repeat(72));

  const checkNames = runs.find((r) => r.results.length)?.results.map((r) => r.name) ?? [];
  for (const name of checkNames) {
    const pass = runs.filter((r) => r.results.find((c) => c.name === name && c.ok)).length;
    const total = runs.filter((r) => r.results.length).length;
    const status = pass === total ? " ✓" : pass === 0 ? " ✗" : "~";
    console.log(`  ${status} ${name}  —  ${pass}/${total} runs passed`);
  }

  const totalPossible = checkNames.length * 6;
  const totalPassed = runs.reduce((acc, r) => acc + r.results.filter((c) => c.ok).length, 0);
  console.log(`\n  Overall: ${totalPassed}/${totalPossible} check-runs passed (${(totalPassed / Math.max(1, totalPossible) * 100).toFixed(1)}%)`);

  console.log(`\n  Raw outputs saved to: ${OUTPUTS_DIR}`);
  console.log(`  Files: blueprint-run-1.md … blueprint-run-6.md`);
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
