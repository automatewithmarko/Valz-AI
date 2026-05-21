// Short, targeted test of the four prompt tightens that just landed.
// Runs four single-section generations (faster than full blueprints) and
// checks the specific failure mode each tighten was meant to fix.
//
//   Test A — Bridge forward-reference enforcement (Step 2 → Step 3)
//   Test B — Step 7 labelled "Daily Life Snapshot"
//   Test C — Step 11 per-pillar "Hooks for [Pillar]" sub-blocks
//   Test D — Persona detail floor (≥2 concrete details in step body)
//
// Each call is streamed (gateway times out on long non-streamed calls).
// Approx total time: 2-4 minutes.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT = resolve(ROOT, ".test-outputs/short");

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
  const src = await readFile(resolve(ROOT, "src/app/api/brand-chat/route.ts"), "utf8");
  const marker = "const SYSTEM_PROMPT = `";
  const start = src.indexOf(marker);
  const after = start + marker.length;
  const end = src.indexOf("`;", after);
  return src.slice(after, end);
}

async function call(messages) {
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
      max_tokens: 16384,
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
      } catch {}
    }
  }
  return content;
}

// Planted details we'll look for in the per-step body.
const DETAILS = [
  "financial services",
  "dashboards",
  "one-pager",
  "burnout at 28",
  "Sydney",
  "Brisbane",
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
  "2 hours",
  "Splenic",
  "Projector",
  "4/6",
];

const personaContext = `===INTERVIEW_COMPLETE===

Below is the full interview transcript for Cassandra Valzacchi. Treat it as her complete questionnaire input.

HUMAN DESIGN: Type Projector. Strategy: wait for the invitation. Authority: Splenic. Profile: 4/6 — Opportunist/Role Model.

SECTION 1 — LIFE MAP:
- 8 years as a corporate exec in financial services. Built dashboards and one-pagers that became the team's go-to artefacts. Drained by the constant Zoom-call grind and being responsible for other people's deliverables.
- 2 years freelancing as a brand strategist for early-stage founders. Felt natural: small teams, real impact.
- Major life chapters: career burnout at 28 (Googling "what's wrong with me" at 2am), Sydney to Brisbane relocation at 30, two-year identity-crisis stretch.

SECTION 2 — STRUGGLE → SKILL:
- Figured out alignment via weekly journalling, tracking energy spent vs energy generated. Strategy and writing landed on the green side. Operational management landed on the red.

SECTION 3 — AUDIENCE:
- Women in their 30s, late-corporate or recently exited, who feel quietly stuck. Tired of feeling competent but invisible. Embarrassed to admit they Google their alignment at 11pm.

SECTION 6 — ENERGY:
- Aligned decision: quitting corporate at 30, body felt a quiet exhale.
- Misaligned decision: 6-month operational consulting gig in 2024, chest-clench.

SECTION 11 — VISION:
- "I think I want to build something that helps people who feel quietly stuck in their careers find the version of work that fits how they're actually wired, without quitting overnight."

Time available: 2 hours/day. Platform: Instagram (audience) + writing (natural). Income goal: replace full-time income.

===ALL_15_SECTIONS_APPROVED===`;

function divider(label) {
  console.log("\n" + "─".repeat(72));
  console.log(label);
  console.log("─".repeat(72));
}

function countDetailHits(text) {
  return DETAILS.filter((d) => text.toLowerCase().includes(d.toLowerCase()));
}

(async () => {
  await loadEnv();
  await mkdir(OUT, { recursive: true });
  const system = await loadSystemPrompt();
  console.log(`SYSTEM_PROMPT loaded: ${system.length.toLocaleString()} chars\n`);

  const results = [];

  // ── TEST A — Bridge forward-reference (Step 2 presented in full) ──
  divider("TEST A — Bridge forward-reference (Step 2)");
  {
    const reply = await call([
      { role: "system", content: system },
      {
        role: "user",
        content:
          personaContext +
          `\n\nWe have completed the interview. Present Step 2 — Identity Pattern Extraction — in full as it should appear in the final blueprint. Apply the SECTION FRAMING PROTOCOL: Rationale at the top, content in the middle, Section Bridge at the bottom. End with "Does this feel right, or would you like me to adjust anything?"`,
      },
    ]);
    await writeFile(resolve(OUT, "test-A-step2.md"), reply, "utf8");

    const feelRightIdx = reply.lastIndexOf("Does this feel right");
    const tail = feelRightIdx > 0 ? reply.slice(Math.max(0, feelRightIdx - 800), feelRightIdx) : reply.slice(-800);
    const forwardRe = /(\bstep\s*3\b|\bnext\s+step\b|leads into|opens into|sets up|pulls from|is the raw material|brings you to|becomes the foundation|carries you into|intellectual property)/i;
    const ok = forwardRe.test(tail);
    console.log(ok ? "✓ Bridge has explicit forward reference to Step 3" : "✗ Bridge missing forward reference");
    console.log("\nBridge area (last 800 chars before 'Does this feel right'):");
    console.log(tail.trim());
    results.push({ test: "A — Bridge forward-ref", ok });
  }

  // ── TEST B — Step 7 Daily Life Snapshot label ──
  divider("TEST B — Step 7 Daily Life Snapshot label");
  {
    const reply = await call([
      { role: "system", content: system },
      {
        role: "user",
        content:
          personaContext +
          `\n\nWe have completed the interview. Present Step 7 — Audience Psychology & Behavioural Intelligence — in full as it should appear in the final blueprint. Apply the SECTION FRAMING PROTOCOL and every PER-STEP DEPTH OVERRIDE that applies to Step 7. End with "Does this feel right, or would you like me to adjust anything?"`,
      },
    ]);
    await writeFile(resolve(OUT, "test-B-step7.md"), reply, "utf8");

    const okLabel = /Daily\s+Life\s+Snapshot/i.test(reply);
    const okOthers = /Internal\s+Dialogue/i.test(reply) && /Hidden\s+Fears?/i.test(reply);
    const ok = okLabel && okOthers;
    console.log(`${okLabel ? "✓" : "✗"} 'Daily Life Snapshot' label present`);
    console.log(`${okOthers ? "✓" : "✗"} 'Internal Dialogue' & 'Hidden Fears' present`);
    results.push({ test: "B — Step 7 Daily Life Snapshot", ok });
  }

  // ── TEST C — Step 11 per-pillar Hooks blocks ──
  divider("TEST C — Step 11 per-pillar 'Hooks for [Pillar]' blocks");
  {
    const reply = await call([
      { role: "system", content: system },
      {
        role: "user",
        content:
          personaContext +
          `\n\nWe have completed the interview. Present Step 11 — Content Pillars — in full as it should appear in the final blueprint. Apply the SECTION FRAMING PROTOCOL and every PER-STEP DEPTH OVERRIDE for Step 11 (per-pillar hook blocks are mandatory). End with "Does this feel right, or would you like me to adjust anything?"`,
      },
    ]);
    await writeFile(resolve(OUT, "test-C-step11.md"), reply, "utf8");

    const perPillarHookBlocks = (reply.match(/Hooks for\s+(?:Pillar\s+)?[A-Z][\w\s,'-]{1,60}/gi) || []).length;
    const totalHooksLooseEstimate = (reply.match(/^\s*(?:[-*•]|\d+\.|\d+\))\s/gm) || []).length;
    const otherBlocks = ["viral-aligned", "trust-building", "personal storytelling", "conversion", "signature series"]
      .map((label) => ({ label, has: new RegExp(label, "i").test(reply) }));
    const otherCount = otherBlocks.filter((b) => b.has).length;

    const ok = perPillarHookBlocks >= 3 && otherCount >= 4;
    console.log(`${perPillarHookBlocks >= 3 ? "✓" : "✗"} ${perPillarHookBlocks} 'Hooks for [Pillar]' blocks (need ≥3)`);
    console.log(`  ~${totalHooksLooseEstimate} list items detected across Step 11`);
    console.log(`  Other content blocks present: ${otherBlocks.filter((b) => b.has).map((b) => b.label).join(", ")}`);
    results.push({ test: "C — Step 11 per-pillar hooks", ok });
  }

  // ── TEST E — Short step (Step 9) must still open with rationale + second person ──
  divider("TEST E — Step 9 rationale + second person");
  {
    const reply = await call([
      { role: "system", content: system },
      {
        role: "user",
        content:
          personaContext +
          `\n\nWe have completed the interview. Present Step 9 — Platform Strategy — in full as it should appear in the final blueprint. Apply the SECTION FRAMING PROTOCOL (every step opens with a rationale, no exemptions for shorter steps) and the voice discipline (second person only — no "she/her"). End with "Does this feel right, or would you like me to adjust anything?"`,
      },
    ]);
    await writeFile(resolve(OUT, "test-E-step9.md"), reply, "utf8");

    // Rationale check: in the first 600 chars after the heading line, must contain "you" or "your".
    const headerEnd = reply.search(/\n/);
    const afterHeader = reply.slice(headerEnd >= 0 ? headerEnd : 0, (headerEnd >= 0 ? headerEnd : 0) + 600);
    const hasRationale = /(\byou\b|\byour\b)/i.test(afterHeader);

    // Third-person drift: count sentences using "she/her/he/him/the client" in reference to the client.
    // We allow these inside Step 7-style audience persona passages, but not in Step 9.
    const driftMatches = reply.match(/\b(she|her|he|him|the client|this person)\b/gi) || [];

    const ok = hasRationale && driftMatches.length === 0;
    console.log(`${hasRationale ? "✓" : "✗"} Step 9 opens with a second-person rationale`);
    console.log(`${driftMatches.length === 0 ? "✓" : "✗"} No third-person drift (found ${driftMatches.length} third-person references${driftMatches.length ? `: ${[...new Set(driftMatches.map((m) => m.toLowerCase()))].join(", ")}` : ""})`);
    results.push({ test: "E — Step 9 rationale + second person", ok });
  }

  // ── TEST D — Persona detail floor (Step 6, brand architecture) ──
  divider("TEST D — Persona detail floor (Step 6 body must have ≥2 details)");
  {
    const reply = await call([
      { role: "system", content: system },
      {
        role: "user",
        content:
          personaContext +
          `\n\nWe have completed the interview. Present Step 6 — Brand Architecture — in full as it should appear in the final blueprint. Apply the SECTION FRAMING PROTOCOL and the persona-specificity floor. End with "Does this feel right, or would you like me to adjust anything?"`,
      },
    ]);
    await writeFile(resolve(OUT, "test-D-step6.md"), reply, "utf8");

    const hits = countDetailHits(reply);
    const ok = hits.length >= 3;
    console.log(`${ok ? "✓" : "✗"} ${hits.length}/${DETAILS.length} planted details referenced (need ≥3 for body)`);
    console.log(`  Hits: ${hits.join(", ")}`);
    results.push({ test: "D — Persona detail floor", ok });
  }

  // ── Summary ──
  console.log("\n" + "═".repeat(72));
  console.log("SHORT TEST SUMMARY");
  console.log("═".repeat(72));
  for (const r of results) {
    console.log(`  ${r.ok ? "✓" : "✗"} ${r.test}`);
  }
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n  ${passed}/${results.length} tests passed`);
  if (passed < results.length) process.exit(1);
})().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
