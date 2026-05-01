// Thorough writing-rules audit. Pulls every rule from the KB
// (Section 1.2 cross-cutting + Section 3 story-specific + Section 5.1.1 +
// Section 6 trial-reels best practices) and checks generated content
// against all of them.
//
// Scenarios cover:
//   - Carousel (Pattern Interrupt, growth)
//   - Carousel (Proof Over Hype, sales)
//   - Carousel (Curiosity, growth — multi-slide where contrast formulas
//     historically appeared)
//   - Story sequence (Initial Sequence)
//   - Story sequence (Authority Loop, CTA-rich)
//   - Single hook (Section 2.0 Hook Formula)
//   - Trial Reels strategic question (advisory frame)

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
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
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

async function callGrok(systemPrompt, userMessage) {
  const r = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    body: JSON.stringify({
      model: "grok-4-0709",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
      stream: false,
      max_tokens: 5000,
    }),
  });
  return (await r.json()).choices[0].message.content;
}

// ── Strip structural noise so only "writing copy" gets audited.
function bodyOnly(text) {
  return text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      // Remove bold beat-marker labels in any form: Slide / Step / Beat
      // / Day / Phase / Stage N - Name (numeric or letter-indexed like
      // "Slide A", "Slide B" inside Authority Loop / Casual Conversation
      // Close sub-step expansions).
      if (/^\*\*(?:Slide|Step|Beat|Day|Phase|Stage|Story)\s*(?:\d+|[A-Z])\b/i.test(t)) return false;
      // Remove all-caps story-beat labels (RELATE / REVEAL / etc.)
      if (/^\*\*[A-Z][A-Z0-9 +\-/&'’]{1,40}\*\*\s*$/.test(t)) return false;
      // Remove "**Caption**" section header
      if (/^\*\*Caption\*\*\s*$/.test(t)) return false;
      // Remove framework intro line ("Going with the X because...")
      if (/^Going with /i.test(t)) return false;
      // Remove the trailing tweaks/visuals offer
      if (/(tweak|sketch).{0,80}\?/i.test(t)) return false;
      // Keep blockquotes and all body lines
      return true;
    })
    .join("\n");
}

// ── Audit module: every rule in Section 1.2 + story/reels-specific rules.
function auditWritingRules(text, format /* 'carousel' | 'story' | 'hook' | 'reel' | 'advisory' */) {
  const body = bodyOnly(text);
  const violations = [];
  const flag = (rule, excerpt) => violations.push({ rule, excerpt: excerpt?.replace(/\s+/g, " ").slice(0, 160).trim() });

  // 1. Em / en dashes anywhere
  const dash = body.match(/.{0,30}[—–].{0,30}/);
  if (dash) flag("em/en dash anywhere", dash[0]);

  // 2. Enumerative parallelism — three matched modifiers with comma+and
  //    pattern "X, Y, and Z" where all are short adjective/noun-ish.
  const enum_match = body.match(/[A-Za-z]+ed,\s+[A-Za-z]+ed,?\s+and\s+[A-Za-z]+ed\b|[A-Za-z]+,\s+[A-Za-z]+,?\s+and\s+(?:ready|done|exhausted|tired|overwhelmed|burnt|broken|small|seen|heard)\b/i);
  if (enum_match) flag("enumerative parallelism", enum_match[0]);

  // 3. List-stacking: "done X, done Y, done Z" / "tired of X, tired of Y, tired of Z"
  const stack_match = body.match(/\b(done|tired of|sick of|over)\s+[^,.]{1,40},\s*(done|tired of|sick of|over)\s+[^,.]{1,40},\s*(done|tired of|sick of|over)\b/i);
  if (stack_match) flag("list-stacking sentence (done X, done Y, done Z)", stack_match[0]);

  // 4. Rhetorical stacking: "What if X? What if Y? What if Z?"
  const rhetq_match = body.match(/(?:What if [^?]{5,60}\?\s*){2,}/i);
  if (rhetq_match) flag("rhetorical stacking (What if X? What if Y?)", rhetq_match[0]);

  // 5. "The X. The Y. The Z." stack
  const thex_match = body.match(/\bThe\s+[A-Za-z]{4,30}\.\s+The\s+[A-Za-z]{4,30}\.\s+The\s+[A-Za-z]{4,30}\b/);
  if (thex_match) flag("stacked 'The X. The Y. The Z.'", thex_match[0]);

  // 6. Contrast formulas — Section 1.2's primary target. Catches the
  //    full set of negation contractions (doesn't / don't / didn't /
  //    isn't / aren't / wasn't / weren't / can't / won't / hasn't /
  //    haven't / hadn't / shouldn't / wouldn't / couldn't / not / no /
  //    never) followed by an asserting clause (it's / that's / it was /
  //    that was / this is / this was / but).
  // Bare "no" and "never" produce too many false positives (quantifier
  // uses like "no real downtime" or "I never knew that"). Detection focuses
  // on "not" + the full set of negation contractions, which actually
  // index contrast-formula rhythm.
  const NEG = "(?:not|doesn'?t|does\\s+not|don'?t|do\\s+not|didn'?t|did\\s+not|isn'?t|is\\s+not|aren'?t|are\\s+not|wasn'?t|was\\s+not|weren'?t|were\\s+not|won'?t|will\\s+not|can'?t|cannot|couldn'?t|could\\s+not|shouldn'?t|should\\s+not|wouldn'?t|would\\s+not|hasn'?t|has\\s+not|haven'?t|have\\s+not|hadn'?t|had\\s+not)";
  const ASSERT = "(?:it'?s|that'?s|this is|it was|that was|this was|but)";
  const contrastPatterns = [
    // "X negation Y, ASSERT Z" — comma- or period-joined two-half pivot
    new RegExp(`\\b${NEG}\\s+[^,.;:?!\\n]{2,80}[,.]\\s*${ASSERT}\\b`, "i"),
    // "negation just X, ASSERT Y"
    new RegExp(`\\b${NEG}\\s+just\\s+[^,.;:?!\\n]{2,80},\\s*${ASSERT}\\b`, "i"),
  ];
  for (const re of contrastPatterns) {
    const m = body.match(re);
    if (m) {
      flag("contrast formula (It's not X, it's Y)", m[0]);
      break;
    }
  }

  // 7. Repeated sentence openings — same first word starting 3+ consecutive sentences.
  //    e.g. "She showed up. She built something. She did it..."
  const repeat = body.match(/(?:^|[.!?]\s+)([A-Z][a-z]{1,15})\s[^.!?]{5,80}[.!?]\s+\1\s[^.!?]{5,80}[.!?]\s+\1\s/m);
  if (repeat) flag("repeated sentence openings (3x same word)", repeat[0]);

  // 8. Rhythm-for-rhythm emphasis — three short bold sentences in a row.
  const rhythm = body.match(/^[A-Z][a-z]{2,15}\.\s+[A-Z][a-z]{2,15}\.\s+[A-Z][a-z]{2,15}\.\s*$/m);
  if (rhythm) flag("rhythm-for-rhythm (Bold. Unapologetic. Real.)", rhythm[0]);

  // 9. Rhetorical question as hook — first sentence of the deliverable
  //    is "Are you / Do you / Have you ever / What if you ... ?"
  const firstSentence = body.split("\n").map((l) => l.trim()).find((l) => l.length > 10);
  if (firstSentence && /^(?:Are you|Do you|Have you ever|What if you|Ever (?:wonder|feel))\b[^?]{5,120}\?/i.test(firstSentence)) {
    flag("rhetorical question as hook", firstSentence);
  }

  // 10. Vague empowerment language
  const empowerment = body.match(/\b(?:step\s+into\s+your\s+(?:power|truth|magic|greatness|magic)|own\s+your\s+story|tap\s+into\s+your\s+(?:power|magic|truth)|claim\s+your\s+(?:power|truth|space)|unleash\s+your\s+(?:potential|power)|live\s+your\s+(?:truth|purpose)|embrace\s+your\s+journey|believe\s+in\s+yourself)\b/i);
  if (empowerment) flag("vague empowerment language", empowerment[0]);

  // 11. Filler phrases
  const filler = body.match(/\b(?:at\s+the\s+end\s+of\s+the\s+day|authentic\s+self|do\s+the\s+work|own\s+your\s+truth)\b/i);
  if (filler) flag("filler phrase", filler[0]);

  // 12. Motivational clichés / journey-resilience framing
  const cliche = body.match(/\b(?:resilience|tough\s+times\s+shaped|what\s+doesn'?t\s+kill\s+you|she\s+persisted|never\s+give\s+up|warrior\s+queen|boss\s+babe|the\s+journey\s+(?:is|was|of)|her\s+resilience|the\s+grind|rise\s+up|chase\s+your\s+dreams)\b/i);
  if (cliche) flag("motivational cliché / journey-resilience framing", cliche[0]);

  // 13. Mic-drop endings — last 200 chars of body
  const tail = body.slice(-300);
  const mic = tail.match(/(?:meant\s+to\s+play\s+small|world\s+needs\s+what\s+only\s+you|never\s+dim\s+your\s+light|you'?re\s+destined\s+for|chosen\s+for\s+greater|you\s+are\s+enough|you'?ve\s+got\s+this,?\s+(?:queen|babe))/i);
  if (mic) flag("mic-drop ending", mic[0]);

  // 14. Australian English — common American spellings to flag
  const american = body.match(/\b(?:color(?:s|ed|ing)?|favorite|organize(?:s|d|ing)?|behavior(?:s|al)?|recognize(?:s|d|ing)?|analyze(?:s|d|ing)?|center(?:s|ed)?|honor(?:s|ed)?|labor(?:s|ed)?|customize(?:s|d|ing)?|optimize(?:s|d|ing)?|prioritize(?:s|d|ing)?|realize(?:s|d|ing)?)\b/);
  if (american) flag("American English spelling (use AU English)", american[0]);

  // ── Story-specific rules
  if (format === "story") {
    // 5.1.1 Don't start with "Hey Guys"
    const heyguys = body.match(/^\s*Hey\s+(?:guys|girls|babes|babe|y'all|everyone)\b/im);
    if (heyguys) flag("story opener uses 'Hey Guys' (Section 5.1.1)", heyguys[0]);

    // 3.3 The CTA Rules — "Clear. Singular. Direct. Do not stack CTAs."
    // If multiple CTAs in last 300 chars (e.g. "DM X" + "tap link" + "reply Y")
    const ctaTail = body.slice(-400).toLowerCase();
    const ctaCount = (ctaTail.match(/\b(?:dm me|dm '|dm "|reply ['"]|tap (?:the )?link|join the waitlist|comment ['"]|send me)\b/g) || []).length;
    if (ctaCount > 1) flag("multiple CTAs stacked (Section 3.3 violation)", ctaTail.slice(0, 200));
  }

  return violations;
}

// ── Scenarios ────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    name: "Pattern Interrupt carousel (growth)",
    format: "carousel",
    prompt:
      "Use the Pattern Interrupt Carousel. I'm a money mindset coach for female founders running service businesses around $5-15K/mo. They're drowning in 'algorithm hacks' and 'reels are dead' takes. Walk me through what each slide should say. Just the slide copy, no visuals.",
  },
  {
    name: "Curiosity carousel (growth)",
    format: "carousel",
    prompt:
      "Use the Curiosity Carousel. I'm a fitness coach for new mums going back to gyms after baby. They feel watched in the gym, but the deeper truth is the watched feeling shows up the moment a camera enters the picture. Brand voice: warm, observational. Write the carousel.",
  },
  {
    name: "Proof Over Hype carousel (sales)",
    format: "carousel",
    prompt:
      "Use the Proof Over Hype Carousel. I'm a copywriter for service-based founders, launching my $497 sales-page intensive. I have 14 case studies; my best client went $4K to $22K months. Audience: service founders. Write the carousel.",
  },
  {
    name: "Initial Sequence story selling",
    format: "story",
    prompt:
      "Use the Initial Sequence story framework. I'm launching a $97 nervous system reset workshop for burnt-out women in their 30s. Write the story sequence.",
  },
  {
    name: "Authority Loop story selling",
    format: "story",
    prompt:
      "Use the Authority Loop story framework. I'm a brand strategist for women launching their first $5K-10K offer; I'm driving bookings to my 3-month strategy intensive at $4,500. Write the story sequence.",
  },
  {
    name: "Single carousel hook (Section 2.0)",
    format: "hook",
    prompt:
      "Write me a carousel hook using the Section 2.0 Carousel Hook Formula. I'm a Pilates instructor for first-time mums.",
  },
  {
    name: "Trial Reels strategic question (advisory)",
    format: "advisory",
    prompt:
      "Should I be running trial reels right now? I'm an Instagram-first wellness coach with 8K followers, posting 3 reels a week, growth has plateaued. Tell me yes or no and how often, citing the Section 6 strategy.",
  },
];

(async () => {
  await loadEnv();
  const sys = await loadSys();
  console.log(`SYSTEM_PROMPT: ${sys.length} chars\n`);

  const summary = [];
  for (const s of SCENARIOS) {
    console.log("=".repeat(80));
    console.log(`SCENARIO: ${s.name}`);
    console.log("=".repeat(80));

    const { rules, dynamic } = await buildKb(s.prompt);
    const kbBlock = `### Writing Rules\n\n${fmt(rules)}\n\n---\n\n### Frameworks\n\n${fmt(dynamic)}`;
    const reply = await callGrok(`${sys}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${kbBlock}`, s.prompt);

    console.log("\n[Reply preview — first 600 chars]");
    console.log(reply.slice(0, 600) + (reply.length > 600 ? "…" : ""));

    const violations = auditWritingRules(reply, s.format);
    console.log(`\n[Violations] ${violations.length === 0 ? "✓ none" : `❌ ${violations.length} found`}`);
    for (const v of violations) {
      console.log(`  · ${v.rule}`);
      console.log(`      "${v.excerpt}"`);
    }
    summary.push({ name: s.name, format: s.format, count: violations.length, violations });
    console.log();
  }

  console.log("=".repeat(80));
  console.log("FINAL SUMMARY");
  console.log("=".repeat(80));
  let total = 0;
  for (const r of summary) {
    total += r.count;
    console.log(`  ${r.count === 0 ? "PASS" : "FAIL"}  [${r.format}] ${r.name}: ${r.count} violation${r.count === 1 ? "" : "s"}`);
  }
  console.log(`\n  TOTAL VIOLATIONS: ${total} across ${summary.length} scenarios`);
  console.log(`  ${total === 0 ? "✓ SHIPPING READY ON WRITING RULES" : "❌ remaining issues to address"}`);
})();
