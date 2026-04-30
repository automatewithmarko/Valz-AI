// Tests the brand-chat agent's Step 9 (Platform Strategy) output for the
// new "TikTok must always be recommended" rule. Loads the actual SYSTEM_PROMPT
// from src/app/api/brand-chat/route.ts and runs three synthetic profiles
// designed to make TikTok the *unnatural* pick:
//   1. A Generator who already loves TikTok (control)
//   2. An introverted Projector who hates video (TikTok must still appear)
//   3. A writer/blogger who explicitly picks Writing/Pinterest (TikTok still in)
//
// For each profile we ask the agent to produce ONLY Step 9 Platform Strategy
// and verify TikTok is named with starter content ideas + bio + reasoning.

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

// Extract the SYSTEM_PROMPT template literal from brand-chat/route.ts
async function loadBrandChatSystemPrompt() {
  const src = await readFile(resolve(ROOT, "src/app/api/brand-chat/route.ts"), "utf8");
  // Match: const SYSTEM_PROMPT = `...`;
  const m = src.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
  if (!m) throw new Error("Could not locate SYSTEM_PROMPT template in brand-chat/route.ts");
  return m[1];
}

async function callGrok(systemPrompt, messages) {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "grok-3-fast",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: false,
      max_tokens: 4000,
    }),
  });
  if (!res.ok) throw new Error(`grok ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.choices[0].message.content;
}

// Three profile prompts that stand in for a completed interview. The agent
// is instructed to produce ONLY Step 9 Platform Strategy in the same form
// it would inside the full blueprint generation.
const PROFILES = [
  {
    name: "1. Generator who already loves TikTok (control)",
    profile: `
PROFILE SUMMARY (interview already complete):
- Name: Maya
- Type: Generator | Authority: Sacral | Profile: 2/4 Hermit/Opportunist
- Niche: Holistic nutritionist for women in their 30s recovering from burnout
- Lived experience: Burnt out herself at 29, rebuilt through nervous system work
- Time capacity: 10-15 hrs/week on content
- Visibility tolerance: HIGH, comfortable on camera
- Q23 (most natural platform): "TikTok, I already post there casually and it feels easy"
- Q47 (least intimidating): "TikTok"
- Energy: high creative output, loves quick content, dislikes long-form writing
- Product: 8-week group programme, $497`,
  },
  {
    name: "2. Introverted Projector, hates video, prefers Pinterest",
    profile: `
PROFILE SUMMARY (interview already complete):
- Name: Sarah
- Type: Projector | Authority: Splenic | Profile: 6/2 Role Model/Hermit
- Niche: Career strategist for women in their 40s feeling stuck post-corporate
- Lived experience: Quietly walked away from a director-level role after burnout
- Time capacity: 4-6 hrs/week on content (she has a young child)
- Visibility tolerance: LOW, deeply uncomfortable being filmed
- Q23 (most natural platform): "Pinterest, I love designing and curating visuals"
- Q47 (least intimidating): "Writing/blogging"
- Energy: prefers writing and visuals, dislikes camera, low-energy creator
- Product: 1:1 strategy intensives, $1,200`,
  },
  {
    name: "3. Manifestor writer who explicitly picks Writing/Pinterest only",
    profile: `
PROFILE SUMMARY (interview already complete):
- Name: Jen
- Type: Manifestor | Authority: Emotional | Profile: 5/1 Heretic/Investigator
- Niche: Creative writing coach for novelists with day jobs
- Lived experience: Published two novels while working in marketing
- Time capacity: 3-4 hrs/week (very limited)
- Visibility tolerance: VERY LOW, "I'd rather not show my face at all"
- Q23 (most natural platform): "Writing/blogging, anything else stresses me out"
- Q47 (least intimidating): "Pinterest"
- Energy: deep, slow, writing-driven; resents short-form video
- Product: 12-week novel-writing intensive, $2,400`,
  },
];

const STEP9_REQUEST = `The interview is complete. Produce ONLY Step 9: Platform Strategy from the Aligned Income Blueprint for this person, using the exact format and depth standards from your instructions. Do not output any other steps. Do not preamble. Begin directly with the heading "## Step 9: Platform Strategy".`;

function audit(profileName, output) {
  const lower = output.toLowerCase();
  const tiktokMentioned = /\btiktok\b/i.test(output);
  const tiktokCount = (output.match(/tiktok/gi) || []).length;
  const startersForTikTok = /tiktok[\s\S]{0,2000}?(starter|idea|hook)/i.test(output);
  const bioForTikTok = /tiktok[\s\S]{0,2000}?bio/i.test(output);
  const reasoningPresent = /\b(because|reason|why|so that|since)\b/i.test(output);
  const heading = /## Step 9: Platform Strategy/.test(output);

  console.log(`\n  AUDIT for "${profileName}":`);
  console.log(`    ✓ Heading present:           ${heading}`);
  console.log(`    ✓ TikTok mentioned:          ${tiktokMentioned} (${tiktokCount} mentions)`);
  console.log(`    ✓ TikTok has starter ideas:  ${startersForTikTok}`);
  console.log(`    ✓ TikTok has bio:            ${bioForTikTok}`);
  console.log(`    ✓ Reasoning words present:   ${reasoningPresent}`);
  return tiktokMentioned && tiktokCount >= 2;
}

(async () => {
  await loadEnv();
  const systemPrompt = await loadBrandChatSystemPrompt();
  console.log(`Loaded SYSTEM_PROMPT (${systemPrompt.length} chars)\n`);

  const passes = [];
  for (const { name, profile } of PROFILES) {
    console.log(`\n${"=".repeat(80)}\nPROFILE ${name}\n${"=".repeat(80)}`);
    const messages = [
      { role: "user", content: `${profile}\n\n${STEP9_REQUEST}` },
    ];
    const reply = await callGrok(systemPrompt, messages);
    console.log(reply);
    const ok = audit(name, reply);
    passes.push({ name, ok });
  }

  console.log(`\n${"=".repeat(80)}\nSUMMARY\n${"=".repeat(80)}`);
  for (const p of passes) console.log(`  ${p.ok ? "PASS" : "FAIL"}  ${p.name}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
