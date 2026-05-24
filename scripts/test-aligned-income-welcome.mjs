// Live test for the Aligned Income Ai welcome message formatting.
//
// Loads the SYSTEM_PROMPT verbatim from the brand-chat route, hits the
// mentor gateway with the same model, and prints the assistant response
// so we can eyeball that:
//   - The "Aligned Income AI" greeting is intact.
//   - The five birth-data fields render on separate lines.
//
// Two short turns only — does NOT run the full discovery flow.

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

// Extract the SYSTEM_PROMPT template literal from the route source so this
// stays in sync with whatever is actually shipped.
async function loadSystemPrompt() {
  const src = await readFile(
    resolve(ROOT, "src/app/api/brand-chat/route.ts"),
    "utf8"
  );
  const marker = "const SYSTEM_PROMPT = `";
  const start = src.indexOf(marker);
  if (start === -1) throw new Error("SYSTEM_PROMPT not found in route.ts");
  const after = start + marker.length;
  const end = src.indexOf("`;", after);
  if (end === -1) throw new Error("SYSTEM_PROMPT closing backtick not found");
  return src.slice(after, end);
}

// Use the Anthropic SDK against the mentor gateway, mirroring the live
// /api/brand-chat route exactly. Pass the system prompt as the first
// "system" entry inside `messages` — the helper splits it back out as the
// SDK's top-level system field.
const { default: Anthropic } = await import("@anthropic-ai/sdk");
async function call(messages, { model = "claude-opus-4-6", maxTokens = 2048 } = {}) {
  const apiKey = process.env.MENTOR_API_KEY;
  const apiUrl = process.env.MENTOR_API_URL;
  if (!apiKey || !apiUrl) throw new Error("MENTOR_API_KEY / MENTOR_API_URL missing");
  const baseURL = apiUrl.replace(/\/v1\/?$/, "");
  const client = new Anthropic({ apiKey, baseURL });

  let system = "";
  const turns = [];
  for (const m of messages) {
    if (m.role === "system") system = m.content;
    else turns.push({ role: m.role, content: m.content });
  }

  const res = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: turns,
  });
  return res.content[0]?.type === "text" ? res.content[0].text : "";
}

function divider(label) {
  console.log("\n" + "─".repeat(72));
  console.log(label);
  console.log("─".repeat(72));
}

(async () => {
  await loadEnv();
  const system = await loadSystemPrompt();
  console.log(`SYSTEM_PROMPT loaded: ${system.length.toLocaleString()} chars\n`);

  // Turn 1: simulate the user signalling readiness so the AI sends the
  // mandated welcome message verbatim.
  divider("TURN 1 → user: \"I'm ready to start.\"");
  const reply1 = await call([
    { role: "system", content: system },
    { role: "user", content: "I'm ready to start." },
  ]);
  console.log("\nASSISTANT:\n");
  console.log(reply1);

  // Turn 2: respond with all 5 birth-data fields → AI should emit the
  // HD_CALCULATE marker (the system would then run the calculation).
  divider("TURN 2 → user provides birth data");
  const userTurn2 = [
    "Full Name: Cassandra Valzacchi",
    "Date of Birth (DD/MM/YYYY): 12/03/1990",
    "Exact Time of Birth: 09:47",
    "City of Birth: Sydney",
    "Country of Birth: Australia",
  ].join("\n");
  const reply2 = await call([
    { role: "system", content: system },
    { role: "user", content: "I'm ready to start." },
    { role: "assistant", content: reply1 },
    { role: "user", content: userTurn2 },
  ]);
  console.log("\nUSER:\n" + userTurn2);
  console.log("\nASSISTANT:\n");
  console.log(reply2);

  // Turn 3: simulate the HD_RESULT injection the chat page does after the
  // calculator returns. The AI should now deliver the HD reading AND
  // transition into Section 1 with NO "8." prefix and a clean section
  // header. This is what we're really testing.
  divider("TURN 3 → fake HD_RESULT injected, AI should deliver reading + Section 1 transition");
  const fakeHdResult = `===HD_RESULT===\n${JSON.stringify({
    name: "Cassandra Valzacchi",
    type: "Projector",
    strategy: "Wait for the invitation",
    authority: "Splenic",
    profile: "4/6 — Opportunist/Role Model",
    definedCenters: ["Spleen", "Ajna", "Throat"],
    undefinedCenters: ["Sacral", "Solar Plexus", "Root", "Heart", "G-Center", "Head"],
    personalitySun: "Pisces 21°",
    designSun: "Sagittarius 0°",
    approximateTime: false,
  })}`;
  const reply3 = await call([
    { role: "system", content: system },
    { role: "user", content: "I'm ready to start." },
    { role: "assistant", content: reply1 },
    { role: "user", content: userTurn2 },
    { role: "assistant", content: reply2 },
    { role: "user", content: fakeHdResult },
  ]);
  console.log("\nASSISTANT:\n");
  console.log(reply3);

  // Turn 3 expected behaviour: HD reading + verbatim bridge paragraph +
  // "Are you ready to move onto the next section?" — and STOP. Should NOT
  // include the Section 1 header or any interview question yet.
  const turn3Checks = [];
  if (!/Are you ready to move onto the next section\?/i.test(reply3)) {
    turn3Checks.push("missing 'Are you ready to move onto the next section?' question");
  }
  if (!/unique blueprint and the lens through which everything in this report is written/i.test(reply3)) {
    turn3Checks.push("bridge paragraph not delivered verbatim");
  }
  if (/Section\s*1[:\s]/i.test(reply3)) {
    turn3Checks.push("Section 1 header leaked into HD reading turn (should wait for user)");
  }
  if (/(^|\n)\s*8\.\s/m.test(reply3)) turn3Checks.push("'8.' prefix detected");
  if (/Does this feel right/i.test(reply3)) {
    turn3Checks.push("'Does this feel right' phrasing still appearing");
  }
  console.log("\n" + "─".repeat(72));
  if (turn3Checks.length === 0) {
    console.log("TURN 3 PASS: HD reading ends with bridge + readiness question and stops.");
  } else {
    console.log("TURN 3 FAIL:");
    for (const l of turn3Checks) console.log("  - " + l);
  }

  // Turn 3.5: user confirms readiness; Section 1 transition should now
  // appear, and the first Section 1 question with NO number prefix.
  divider("TURN 3.5 → user says ready; expect Section 1 transition");
  const reply35 = await call([
    { role: "system", content: system },
    { role: "user", content: "I'm ready to start." },
    { role: "assistant", content: reply1 },
    { role: "user", content: userTurn2 },
    { role: "assistant", content: reply2 },
    { role: "user", content: fakeHdResult },
    { role: "assistant", content: reply3 },
    { role: "user", content: "Yes, ready, let's go." },
  ]);
  console.log("\nASSISTANT:\n");
  console.log(reply35);

  const turn35Checks = [];
  if (!/Section\s*1/i.test(reply35)) turn35Checks.push("Section 1 header missing");
  if (/(^|\n)\s*8\.\s/m.test(reply35)) turn35Checks.push("'8.' prefix leaked");
  if (!/(job|role|industry|responsib|drain|natural)/i.test(reply35)) {
    turn35Checks.push("Section 1 question content missing (job / role / etc.)");
  }
  if (turn35Checks.length === 0) {
    console.log("\nTURN 3.5 PASS: clean Section 1 transition with no number prefix.");
  } else {
    console.log("\nTURN 3.5 FAIL:");
    for (const l of turn35Checks) console.log("  - " + l);
  }

  // Turns 4-7: play four mock answers in a row and capture each follow-up.
  // We want to see varied, warm acknowledgements — not "Got it!" / "Nice."
  // four times in a row, which is the failure mode the new prompt fixes.
  const conversation = [
    { role: "system", content: system },
    { role: "user", content: "I'm ready to start." },
    { role: "assistant", content: reply1 },
    { role: "user", content: userTurn2 },
    { role: "assistant", content: reply2 },
    { role: "user", content: fakeHdResult },
    { role: "assistant", content: reply3 },
    { role: "user", content: "Yes, ready, let's go." },
    { role: "assistant", content: reply35 },
  ];

  const mockAnswers = [
    "Worked as a corporate exec for 8 years in financial services. Was great at building dashboards and chasing down messy data, became the person teams came to when something needed structure. Loved building the systems part. Felt drained by the constant Zoom-call grind and being responsible for other people's deliverables. Then did 2 years freelancing as a brand strategist for early-stage founders, which felt natural — small teams, real impact.",
    "Mostly figured it out by stripping back and being honest about which work actually energised me. Spent a season journalling at the end of every week, marking energy spent vs energy generated. Eventually noticed strategy and writing kept showing up on the green side, and operational management kept showing up on the red.",
    "People come to me for clarity. Friends ask me to help them figure out what they actually want from a job change. Founders ask me to help them describe their product in a way that doesn't sound like everyone else.",
    "I think I want to build something that helps people who feel quietly stuck in their careers find the version of work that fits how they're actually wired, without quitting overnight.",
  ];

  const followUpReplies = [];
  for (let i = 0; i < mockAnswers.length; i++) {
    const userMsg = mockAnswers[i];
    divider(`TURN ${4 + i} → mock answer ${i + 1}`);
    console.log("\nUSER:\n" + userMsg);
    const reply = await call([...conversation, { role: "user", content: userMsg }]);
    console.log("\nASSISTANT:\n");
    console.log(reply);
    followUpReplies.push(reply);
    conversation.push({ role: "user", content: userMsg });
    conversation.push({ role: "assistant", content: reply });
  }

  // Heuristic check: count how many follow-ups open with a banned flat ack
  // and whether any two follow-ups share the same opening word.
  const banned = /^(\s*A:\s*\n*\s*)?\s*("?)(got it|nice|cool|okay great|ok great|great|awesome|perfect)("?)[\s.!,]/i;
  const openers = followUpReplies.map((r) => {
    const stripped = r.replace(/^\s*A:\s*\n*/, "").trim();
    const firstLine = stripped.split(/\n/, 1)[0];
    return firstLine.slice(0, 60).toLowerCase();
  });
  const flatHits = followUpReplies.filter((r) => banned.test(r));
  const dupes = openers.filter((o, idx) => openers.indexOf(o) !== idx);
  const numbered = followUpReplies.filter((r) => /(^|\n)\s*\d+\.\s/m.test(r));

  console.log("\n" + "─".repeat(72));
  console.log("Acknowledgement-quality summary:");
  console.log(`  - Banned flat acks ("Got it!", "Nice.", "Cool.", "Okay great."): ${flatHits.length}`);
  console.log(`  - Repeated openers across follow-ups: ${dupes.length}`);
  console.log(`  - Replies containing a numbered question line: ${numbered.length}`);
  if (flatHits.length === 0 && dupes.length === 0 && numbered.length === 0) {
    console.log("\nPASS: acks are varied, warm, and no numbered questions detected.");
  } else {
    console.log("\nFAIL: see counts above. First-line openers for inspection:");
    for (const o of openers) console.log(`  • ${o}`);
  }
})().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
