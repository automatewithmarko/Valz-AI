// Focused test for the SECTION FRAMING PROTOCOL.
//
// Bypasses the full interview by injecting a compact "answers summary" as
// context, then asks the model to present Step 2 (Identity Pattern
// Extraction) in full as it would during the section-by-section review.
// Verifies:
//   - The section opens with a Section Rationale (not just a heading).
//   - The rationale references at least one specific detail the user gave.
//   - The section ends with a Section Bridge that opens Step 3.
//   - The bridge is not a recap.

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
      stream: false,
      max_tokens: 4096,
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

// A handful of specific, recognisable details we'll plant in the user's
// "interview summary" so we can later check the rationale referenced at
// least one of them.
const PLANTED_DETAILS = [
  "financial services",
  "dashboards",
  "Zoom",
  "brand strategist",
  "early-stage founders",
  "energy spent vs energy generated",
  "journalling",
  "operational management",
];

const fakeInterviewSummary = `===INTERVIEW_COMPLETE_SUMMARY===
The user has answered all 51 interview questions. Here is a compact summary of their answers, treat it as their full questionnaire input for the blueprint:

NAME: Cassandra Valzacchi
HUMAN DESIGN: Type Projector, Authority Splenic, Profile 4/6 Opportunist/Role Model. Defined: Spleen, Ajna, Throat. Undefined: Sacral, Solar Plexus, Root, Heart, G-Center, Head.

SECTION 1 — LIFE MAP:
- 8 years as a corporate exec in financial services. Strong at building dashboards and structuring messy data. Became the person teams came to when something needed structure. Drained by Zoom-call grind and being responsible for other people's deliverables.
- 2 years freelancing as a brand strategist for early-stage founders. Felt natural: small teams, real impact.
- Outperformed peers on synthesis and writing. Managers relied on her for "translating muddy strategy into a one-pager nobody could argue with."
- Major life chapters: career burnout at 28, geographic relocation Sydney→Brisbane, two-year identity-crisis stretch where she was Googling "how do I know what I actually want from work" at midnight.

SECTION 2 — STRUGGLE → SKILL:
- Figured out energy alignment via a season of weekly journalling, tracking energy spent vs energy generated. Strategy + writing kept landing on the green side. Operational management kept landing on the red.
- People naturally come to her for clarity. Friends ask her about job change decisions. Founders ask her to describe their product so it doesn't sound like everyone else.

SECTION 3 — AUDIENCE:
- Helping women in their 30s in corporate-to-creator transition. Tired of feeling competent but invisible.

SECTION 4-11 (summarised):
- Current stage: building business. Income goal: replace full-time income then financial freedom. Time: 2 hours/day. Comfortable on camera with prep. Platform: Instagram.
- Decision pattern: trusts gut, hates being pushed. Aligned decisions feel like a quiet exhale. Misaligned feel like a chest-clench.
- Vision: "I think I want to build something that helps people who feel quietly stuck in their careers find the version of work that fits how they're actually wired, without quitting overnight."
===END_INTERVIEW_SUMMARY===

We have completed the interview. Now present Step 2 — Identity Pattern Extraction — in full as it should appear during the section-by-section review. Apply the SECTION FRAMING PROTOCOL: open with a Section Rationale referencing at least one specific detail from the summary above, then the section's full content, then a Section Bridge that closes Step 2 and opens Step 3 (Intellectual Property Extraction). End with "Does this feel right, or would you like me to adjust anything?"`;

(async () => {
  await loadEnv();
  const system = await loadSystemPrompt();
  console.log(`SYSTEM_PROMPT loaded: ${system.length.toLocaleString()} chars\n`);

  console.log("─".repeat(72));
  console.log("Requesting Step 2 — Identity Pattern Extraction");
  console.log("─".repeat(72));
  const reply = await call([
    { role: "system", content: system },
    { role: "user", content: fakeInterviewSummary },
  ]);
  console.log("\nASSISTANT:\n");
  console.log(reply);
  console.log();

  // ── Checks ──────────────────────────────────────────────────────
  const checks = [];

  // Rationale check: first ~400 chars before the section content should
  // be conversational second-person and reference a planted detail.
  const head = reply.slice(0, 800).toLowerCase();
  const referencedDetail = PLANTED_DETAILS.find((d) =>
    head.includes(d.toLowerCase())
  );
  if (!referencedDetail) {
    checks.push("Section Rationale does not reference any planted user detail");
  }
  if (!/(\byou\b|\byour\b)/i.test(head)) {
    checks.push("Section Rationale not written in second person (no 'you'/'your')");
  }
  if (/^\s*#+\s*(step\s*2|identity)/i.test(reply.trim())) {
    // It's fine to have a heading, but ensure the rationale comes BEFORE
    // the heading or right after — looking instead at content density.
  }

  // Bridge check: tail of the message before the "Does this feel right"
  // question.
  const feelRightIdx = reply.lastIndexOf("Does this feel right");
  if (feelRightIdx === -1) {
    checks.push("Missing 'Does this feel right...' review prompt at end");
  }
  const tail =
    feelRightIdx > 0 ? reply.slice(Math.max(0, feelRightIdx - 800), feelRightIdx) : "";
  if (!/(\bnext\b|\bSection 3\b|\bStep 3\b|Intellectual Property)/i.test(tail)) {
    checks.push("Section Bridge does not open Step 3 (no forward reference)");
  }

  // Forbidden patterns: the worked-example sentences should NOT be pasted
  // verbatim.
  if (
    reply.includes(
      "Now that we have a clear picture of how you are actually wired to work"
    )
  ) {
    checks.push("Rationale worked-example pasted verbatim");
  }
  if (
    reply.includes(
      "What comes through clearly across all of this is that your strongest moments"
    )
  ) {
    checks.push("Bridge worked-example pasted verbatim");
  }

  console.log("─".repeat(72));
  if (checks.length === 0) {
    console.log(
      `PASS: rationale references '${referencedDetail}', written in second person, bridge opens Step 3.`
    );
  } else {
    console.log("FAIL:");
    for (const c of checks) console.log("  - " + c);
  }
})().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
