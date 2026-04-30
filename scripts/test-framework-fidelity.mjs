// Comprehensive ship-readiness sweep for the chat agent.
//
// For every framework in the KB (8 carousel + 6 story + trial reels +
// marketing), this re-runs the production /api/chat pipeline against the
// real SYSTEM_PROMPT and verifies:
//   1. Vector retrieval surfaces the requested framework chunk in the top-K.
//   2. The AI names the framework in its opening line.
//   3. The slide/beat markers in the AI's output match the count and the
//      named beats in the KB chunk for that framework (fidelity check).
//   4. No visual / image / design / layout talk inside the slide body.
//   5. Ends with a single offer to provide visuals separately
//      (carousel + story scenarios).
//   6. Vague asks still trigger clarifying questions, not a dump.
//
// Usage:  node scripts/test-framework-fidelity.mjs

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
  const m = src.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
  if (!m) throw new Error("Could not extract SYSTEM_PROMPT from chat/route.ts");
  return m[1];
}

async function embedQuery(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-large",
      input: text,
      dimensions: 1536,
    }),
  });
  if (!res.ok) throw new Error(`embed ${res.status}: ${await res.text()}`);
  return (await res.json()).data[0].embedding;
}

async function rpc(fn, args) {
  const res = await fetch(
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
  if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function buildKbContext(query) {
  const embedding = await embedQuery(query);
  const [matched, rules] = await Promise.all([
    rpc("match_kb_chunks", {
      query_embedding: embedding,
      match_count: 6,
      similarity_threshold: 0.2,
      metadata_filter: {},
    }),
    rpc("match_kb_chunks", {
      query_embedding: embedding,
      match_count: 20,
      similarity_threshold: 0,
      metadata_filter: { section_type: "rules" },
    }),
  ]);
  const ruleIds = new Set(rules.map((r) => r.id));
  const dynamic = matched.filter((m) => !ruleIds.has(m.id));
  return { rules, dynamic };
}

function formatChunks(chunks) {
  return chunks
    .map((c) => {
      const meta = c.metadata || {};
      const tag = meta.framework_name
        ? `[FRAMEWORK: ${meta.framework_name}]`
        : meta.section_type
          ? `[${String(meta.section_type).toUpperCase()}]`
          : "";
      return `### ${c.section_path} ${tag}\n\n${c.content}`;
    })
    .join("\n\n---\n\n");
}

async function callGrok(systemPrompt, messages) {
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "grok-4-fast-reasoning",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: false,
      max_tokens: 6000,
    }),
  });
  if (!res.ok) throw new Error(`grok ${res.status}: ${await res.text()}`);
  return (await res.json()).choices[0].message.content;
}

// Words that indicate a visual / design / layout instruction is leaking
// into slide copy. Deliberately excludes plain "colour" / "color" because
// audience-life prose legitimately uses them ("colour coding her meal
// plans", "wears all black"). We only flag terms that signal *slide
// design* rather than *story content*.
const VISUAL_TERMS_RE =
  /\b(visual\s?(?:idea|treatment|direction)?|imagery|stock\s?(?:photo|image|footage)|graphic\s?(?:design|element|treatment)|b[-\s]?roll|illustration|aesthetic\s?(?:choice|treatment)|backdrop|video\s?clip|transition|template\s?(?:graphic|design)|overlay\s?(?:image|graphic|text)|font\s?(?:choice|pair)|colour\s?(?:palette|scheme)|color\s?(?:palette|scheme))\b/i;

const VISUALS_OFFER_LINE_RE =
  /\n+[^\n]*(want|would you like|happy to|should i|let me know if you'?d like|do you want)[^\n]*(visual|image|design|graphic|cover|art|aesthetic)[^\n]*\?\s*$/i;

// Normalize a slide name extracted from AI output for substring matching
// against the KB chunk content. Strip leading articles, em/en dashes, and
// any parenthetical annotations the agent adds (e.g. "(Tool 1 of 5)",
// "(Slide 1 of 3)", "(Part 1: The Shift)") which the KB chunk doesn't
// contain verbatim — those split a single KB beat into multi-slide
// elaborations and shouldn't break the fidelity match.
function normalizeBeatName(s) {
  return s
    .replace(/\([^)]*\)/g, " ")
    .replace(/[—–-]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(the|a|an)\s+/i, "")
    .trim()
    .toLowerCase();
}

// Audit a slide/beat-based response against the matching KB chunk.
//
// The agent labels its beats by the natural unit of the framework:
//   Carousel  → "Slide N — Name"
//   Story sequence → "Step N — Name", "Beat N — Name", "Story N — Name"
//   Multi-day campaign (e.g. Anticipation Arc) → "Day N — Name"
// All forms count as a beat.
function auditSlideResponse(reply, expected) {
  const minusTail = reply.replace(VISUALS_OFFER_LINE_RE, "").trim();

  const BEAT_PREFIX = /(?:Slide|Step|Beat|Day|Story|Stage|Phase)/i;
  // Two valid beat-marker forms in the KB Plug-and-Play templates:
  //   (a) numeric form, e.g. "**Slide 1 — The Hook**"  / "**STEP 2 — Educate**"
  //   (b) all-caps-only form, e.g. "**RELATE**" / "**REVEAL**" (Initial Sequence)
  const numericBeatRegex = new RegExp(
    `^\\s*\\*?\\*?(?:${BEAT_PREFIX.source})\\s*(\\d+)\\s*[—–\\-:]\\s*\\*?\\*?\\s*([^\\n*]+?)\\*?\\*?\\s*$`,
    "gim"
  );
  const allCapsBeatRegex =
    /^\s*\*\*([A-Z][A-Z0-9 +\-/&'’]{1,40}[A-Z0-9])\*\*\s*$/gm;
  const beats = [];
  let m;
  while ((m = numericBeatRegex.exec(reply)) !== null) {
    beats.push({ n: parseInt(m[1], 10), name: m[2].trim() });
  }
  if (beats.length === 0) {
    let i = 0;
    while ((m = allCapsBeatRegex.exec(reply)) !== null) {
      beats.push({ n: ++i, name: m[1].trim() });
    }
  }

  const firstBeatRegex = new RegExp(
    `^\\s*\\*?\\*?(?:${BEAT_PREFIX.source})\\s*\\d+|^\\s*\\*\\*[A-Z][A-Z0-9 +\\-/&'’]{1,40}[A-Z0-9]\\*\\*\\s*$`,
    "m"
  );
  const firstSlideIdx = minusTail.search(firstBeatRegex);
  const slideRegion = firstSlideIdx >= 0 ? minusTail.slice(firstSlideIdx) : "";
  const visualLeakMatch = slideRegion.match(VISUAL_TERMS_RE);
  const visualMentionInBody = !!visualLeakMatch;
  const visualLeakWord = visualLeakMatch ? visualLeakMatch[0] : null;

  const replyLower = reply.toLowerCase();
  const frameworkNamed = expected.frameworkAliases.some((alias) =>
    replyLower.includes(alias.toLowerCase())
  );

  const beatNamesInKb = beats.map((b) => {
    const norm = normalizeBeatName(b.name);
    const hit = expected.kbContent
      .toLowerCase()
      .includes(norm) || norm.split(" ").every((w) => w.length < 3 || expected.kbContent.toLowerCase().includes(w));
    return { ...b, normalized: norm, inKb: hit };
  });
  const beatsMatchingKb = beatNamesInKb.filter((b) => b.inKb).length;

  const tail = reply.slice(-400).toLowerCase();
  const offersVisualsAtEnd =
    /(visual|image|design|graphic|cover|art|aesthetic).{0,80}\?/.test(tail) ||
    /(want|would you like|should i|happy to|do you want)[\s\S]{0,160}(visual|image|design|graphic)/i.test(tail);

  return {
    frameworkNamed,
    beatCount: beats.length,
    beatsMatchingKb,
    beats: beatNamesInKb,
    visualMentionInBody,
    visualLeakWord,
    visualLeakContext: visualLeakWord
      ? slideRegion
          .slice(
            Math.max(0, slideRegion.indexOf(visualLeakWord) - 40),
            slideRegion.indexOf(visualLeakWord) + 40 + visualLeakWord.length
          )
          .replace(/\n/g, " ")
      : null,
    offersVisualsAtEnd,
  };
}

// ── Test definitions ────────────────────────────────────────────────
const CAROUSEL_TESTS = [
  {
    framework: "Borrow the Moment, Build the Depth",
    aliases: ["Borrow the Moment", "Borrow the Moment, Build the Depth"],
    expectedBeats: 6,
    requiresVisualsOffer: true,
    prompt:
      "Use the Borrow the Moment, Build the Depth Carousel. I'm a corporate-exit coach for women in their late 30s/early 40s; I help them quit middle-management roles and build location-independent income. There's a viral story right now of a senior product manager publicly quitting Google to launch a Substack about boring B2B work, and my audience is engaging with it heavily. Walk me through every slide.",
  },
  {
    framework: "Pattern Interrupt",
    aliases: ["Pattern Interrupt"],
    expectedBeats: 6,
    requiresVisualsOffer: true,
    prompt:
      "Use the Pattern Interrupt Carousel. I'm a money mindset coach for female founders running service businesses around $5-15K/mo. Walk me through what each slide should say.",
  },
  {
    framework: "Curiosity Carousel",
    aliases: ["Curiosity Carousel"],
    expectedBeats: 6,
    requiresVisualsOffer: true,
    prompt:
      "Use the Curiosity Carousel framework. I'm a holistic nutritionist for women in their 30s recovering from burnout. They obsess over wellness content but feel worse, not better. Write the carousel slides.",
  },
  {
    framework: "Permission Slip Post",
    aliases: ["Permission Slip"],
    expectedBeats: 5,
    requiresVisualsOffer: true,
    prompt:
      "Use the Permission Slip Post framework. I'm a Pilates instructor for first-time mums who feel guilty about taking time for themselves. Walk me through each slide.",
  },
  {
    framework: "Small Shift, Big Shift",
    aliases: ["Small Shift, Big Shift", "Small Shift Big Shift"],
    expectedBeats: 6,
    requiresVisualsOffer: true,
    prompt:
      "Use the Small Shift, Big Shift Carousel. I'm a sleep coach for sleep-deprived founders who think they need to grind through it. Walk me through each slide.",
  },
  {
    framework: "Quiet Upgrade Carousel",
    aliases: ["Quiet Upgrade"],
    expectedBeats: 6,
    requiresVisualsOffer: true,
    prompt:
      "Use the Quiet Upgrade Carousel. I'm launching The Quiet Exit, a $1,200 6-week 1:1 intensive for senior managers ready to leave corporate. Walk me through each slide.",
  },
  {
    framework: "Vetted Edit Carousel",
    aliases: ["Vetted Edit"],
    expectedBeats: 6,
    requiresVisualsOffer: true,
    prompt:
      "Use the Vetted Edit Carousel framework. I'm a wellness-tech reviewer for women in their 30s. I want to launch a curated list of the 5 nervous-system tools I actually use daily, priced as a $47 mini-guide. Walk me through each slide.",
  },
  {
    framework: "Proof Over Hype Carousel",
    aliases: ["Proof Over Hype"],
    expectedBeats: 6,
    requiresVisualsOffer: true,
    prompt:
      "Use the Proof Over Hype Carousel. I'm a copywriter for service-based founders, launching my $497 sales-page intensive. I have receipts: 14 case studies, my best client went from $4K to $22K months after working with me. Walk me through each slide.",
  },
  {
    framework: "I Needed This Carousel",
    aliases: ["I Needed This"],
    expectedBeats: 6,
    requiresVisualsOffer: true,
    prompt:
      "Use the I Needed This Carousel. I'm a money mindset coach launching The Pricing Reset, a $297 self-paced workshop. Built it because I couldn't find anything that addressed the emotional spiral around raising rates. Walk me through each slide.",
  },
];

const STORY_TESTS = [
  {
    framework: "Initial Sequence",
    aliases: ["Initial Sequence", "Relate", "Reveal", "Prove", "Present", "Convert", "Deepen"],
    expectedBeats: 6,
    requiresVisualsOffer: false,
    prompt:
      "Use the Initial Sequence story framework (Relate → Reveal → Prove → Present → Convert → Deepen). I'm launching a $97 nervous system reset workshop for burnt-out women in their 30s. Write me the story sequence I can run today.",
  },
  {
    framework: "Seamless Story Sell",
    aliases: ["Seamless Story Sell", "Curiosity", "Context", "Conversion Loop"],
    expectedBeats: 4,
    requiresVisualsOffer: false,
    prompt:
      "Use the Seamless Story Sell framework. I'm a copywriter selling a $297 sales-page audit. Write the story sequence I can post today.",
  },
  {
    framework: "Conversation Close Flow",
    aliases: ["Conversation Close Flow", "Conversation", "Build", "Bridge", "Buy"],
    expectedBeats: 4,
    requiresVisualsOffer: false,
    prompt:
      "Use the Conversation Close Flow story framework. I'm a postnatal Pilates instructor selling a $179 6-week studio block to first-time mums. Write the story sequence.",
  },
  {
    framework: "Authority Loop",
    aliases: ["Authority Loop", "Authority-to-Action", "Authority to Action"],
    expectedBeats: 5,
    requiresVisualsOffer: false,
    prompt:
      "Use the Authority Loop story framework for me. I'm a brand strategist for women launching their first $5K-10K offer. I want to drive bookings to my 3-month strategy intensive at $4,500. Write the story sequence.",
  },
  {
    framework: "Anticipation Arc",
    aliases: ["Anticipation Arc"],
    expectedBeats: 5,
    requiresVisualsOffer: false,
    prompt:
      "Use the Anticipation Arc story framework. I'm doing a 5-day countdown to opening enrolment for my $1,997 group programme on aligned income for female founders. Write the story sequence I can run across the lead-up.",
  },
  {
    framework: "Casual Conversation Close",
    aliases: ["Casual Conversation Close"],
    expectedBeats: 5,
    requiresVisualsOffer: false,
    prompt:
      "Use the Casual Conversation Close story framework. I'm a creative writing coach for novelists with day jobs, selling a $2,400 12-week intensive. I want a softer, conversational story sequence. Write it.",
  },
];

const OTHER_TESTS = [
  {
    name: "Trial Reels (Section 6) — strategic question",
    expectKbReference: ["trial reel", "section 6", "growth"],
    prompt:
      "Should I be using trial reels right now? I'm an Instagram-first wellness coach with 8K followers, posting 3 reels a week, growth has plateaued. Tell me yes/no and what to do, citing the relevant strategy.",
  },
  {
    name: "Lurker Audit Method (Section 7.1)",
    expectKbReference: ["lurker audit", "lurker"],
    prompt:
      "Walk me through the Lurker Audit Method for my coaching business. I'm a fitness coach for women 35+ in perimenopause, ~6K followers, conversion to my $397 monthly programme is 0.3%. Show me how to apply it.",
  },
];

const VAGUE_TESTS = [
  {
    name: "Vague — should ask clarifying questions",
    prompt: "Make me a carousel.",
  },
  {
    name: "Just say hi — should NOT dump frameworks",
    prompt: "Hey",
  },
];

// Probes whether the agent picks the RIGHT framework given a situation,
// without the user naming a framework themselves. Each scenario lists
// frameworks that are an acceptable answer (1+ may fit; we accept any).
const SELECTION_TESTS = [
  {
    name: "Trending moment — should pick Borrow the Moment",
    acceptable: ["Borrow the Moment", "Borrow the Moment, Build the Depth"],
    prompt:
      "There's a video everywhere right now of a senior product designer at a Big Tech company quitting on a livestream and announcing she's moving to a tiny coastal town to start a B2B Substack. My audience is corporate-exit-curious women in their late 30s and they're sharing it everywhere. I want a carousel that uses this moment to grow my audience. Pick the framework you think fits, name it, write it.",
  },
  {
    name: "Proof-rich sales launch — should pick Proof Over Hype",
    acceptable: ["Proof Over Hype"],
    prompt:
      "I'm launching my $497 sales-page intensive next week. I have receipts: 14 case studies on Notion, my best client went from $4K months to $22K months, my own sales pages convert at 8.4%. My audience is service founders. Write me a carousel that sells it. Pick the right framework yourself.",
  },
  {
    name: "Personal-gap origin story — should pick I Needed This",
    acceptable: ["I Needed This", "Quiet Upgrade"],
    prompt:
      "I built my $297 self-paced workshop, The Pricing Reset, because I literally couldn't find anything that addressed the emotional spiral around raising rates. Every other course just said 'charge more'. My audience is service founders feeling guilty about pricing. Write the sales carousel — pick the framework that fits.",
  },
  {
    name: "Daily-life micro-shift — should pick Small Shift, Big Shift",
    acceptable: ["Small Shift, Big Shift", "Small Shift Big Shift"],
    prompt:
      "I want to write a growth carousel about how doing one small thing differently in the morning, putting your phone in another room until 9am, completely changes the texture of the rest of the day. Audience: ambitious women feeling depleted by 11am. Pick the framework, name it, write it.",
  },
  {
    name: "Industry-fixation reset — should pick Pattern Interrupt",
    acceptable: ["Pattern Interrupt"],
    prompt:
      "My audience is wellness coaches and they're drowning in noise about 'algorithm hacks', 'reels are dead', 'you need a course'. I want a growth carousel that gently calls out the noise and lands them somewhere steadier. Pick the framework, name it, write it.",
  },
  {
    name: "Audience-curated edit — should pick Vetted Edit",
    acceptable: ["Vetted Edit"],
    prompt:
      "I want to launch a $47 mini-guide that's literally my list of the 5 nervous-system tools I personally use every day. I'm a wellness-tech reviewer with a small audience that trusts my taste. Write me a sales carousel. Pick the right framework.",
  },
  {
    name: "Audience trying to convince themselves — should pick Permission Slip Post",
    acceptable: ["Permission Slip", "Permission Slip Post"],
    prompt:
      "My audience are first-time mums who keep saying they 'should' get back to exercise but can't shake guilt about taking time away from the baby. I want a growth carousel that just lets them off the hook. Pick the framework, name it, write it.",
  },
  {
    name: "Quiet behind-the-scenes upgrade — should pick Quiet Upgrade",
    acceptable: ["Quiet Upgrade"],
    prompt:
      "I want to launch The Quiet Exit, a $1,200 6-week intensive for senior managers ready to leave corporate, but I want the carousel to feel calm and inevitable rather than hype-y. The pitch is: this is the upgrade you've already been quietly planning. Pick the right framework.",
  },
  {
    name: "Growth-vs-sales discrimination — vague growth ask must NOT pick from 2.2",
    acceptable: [
      "Borrow the Moment",
      "Borrow the Moment, Build the Depth",
      "Pattern Interrupt",
      "Curiosity Carousel",
      "Permission Slip",
      "Permission Slip Post",
      "Small Shift, Big Shift",
      "Small Shift Big Shift",
    ],
    prompt:
      "I want to grow my audience with a carousel. I'm a holistic nutritionist for women in their 30s in burnout who feel worse not better despite consuming wellness content all day. Pick the framework, name it, write it. Just slide copy, no visuals.",
  },
  {
    name: "Sales discrimination — explicit sales context must NOT pick from 2.1",
    acceptable: [
      "Quiet Upgrade",
      "Vetted Edit",
      "Proof Over Hype",
      "I Needed This",
    ],
    prompt:
      "I'm selling The Calm Hour, my $179 group-coaching block for first-time mums, opening enrolment this Friday. Audience already follows me. Write a sales carousel — pick the right framework yourself.",
  },
];

// ── Runner ──────────────────────────────────────────────────────────
async function runOne({ scenario, systemPrompt, kind }) {
  const lastUser = scenario.prompt;
  const { rules, dynamic } = await buildKbContext(lastUser);

  const kbBlock =
    `### Writing Rules (Section 1, ALWAYS APPLY — quote verbatim)\n\n${formatChunks(rules)}\n\n---\n\n` +
    `### Most relevant frameworks / strategies for this query (ranked by similarity)\n\n${formatChunks(dynamic)}`;

  const sysPrompt = `${systemPrompt}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${kbBlock}`;
  const reply = await callGrok(sysPrompt, [{ role: "user", content: lastUser }]);

  return { reply, rules, dynamic };
}

(async () => {
  await loadEnv();
  const systemPrompt = await loadProductionSystemPrompt();
  console.log(`Loaded production SYSTEM_PROMPT (${systemPrompt.length} chars)\n`);

  const results = [];

  // Carousel + story tests with strict slide/beat fidelity check
  for (const set of [
    { kind: "carousel", tests: CAROUSEL_TESTS },
    { kind: "story", tests: STORY_TESTS },
  ]) {
    console.log("\n" + "=".repeat(80));
    console.log(`${set.kind.toUpperCase()} FRAMEWORKS`);
    console.log("=".repeat(80));

    for (const t of set.tests) {
      console.log(`\n─── ${t.framework} ───`);
      const { reply, dynamic } = await runOne({
        scenario: t,
        systemPrompt,
        kind: set.kind,
      });

      // Find the matching KB chunk for fidelity audit
      const chunkForFramework =
        dynamic.find((d) =>
          (d.metadata?.framework_name ?? "")
            .toLowerCase()
            .includes(t.framework.split(",")[0].trim().toLowerCase())
        ) ??
        dynamic.find((d) =>
          t.aliases.some((a) =>
            (d.section_path ?? "")
              .toLowerCase()
              .includes(a.toLowerCase())
          )
        );

      const a = auditSlideResponse(reply, {
        frameworkAliases: t.aliases,
        kbContent: chunkForFramework?.content ?? "",
      });

      const requiredBeatHits = Math.max(2, Math.ceil(t.expectedBeats * 0.6));
      const beatCountOk = a.beatCount >= Math.max(3, t.expectedBeats - 2);
      const beatNamesOk = a.beatsMatchingKb >= requiredBeatHits;

      const passed =
        a.frameworkNamed &&
        beatCountOk &&
        beatNamesOk &&
        !a.visualMentionInBody &&
        (t.requiresVisualsOffer ? a.offersVisualsAtEnd : true);

      console.log(`  retrieval top hit:           ${dynamic[0]?.section_path ?? "—"} (${dynamic[0]?.similarity?.toFixed(3) ?? "—"})`);
      console.log(`  framework named in opening:  ${a.frameworkNamed ? "✓" : "❌"}`);
      console.log(`  beat count:                  ${a.beatCount}/${t.expectedBeats} ${beatCountOk ? "✓" : "❌"}`);
      console.log(`  beats appearing in KB chunk: ${a.beatsMatchingKb}/${a.beatCount} (need ≥ ${requiredBeatHits}) ${beatNamesOk ? "✓" : "❌"}`);
      a.beats.forEach((b) =>
        console.log(`     · Slide ${b.n}: "${b.name}"  ${b.inKb ? "✓ in-KB" : "❌ not-in-KB"}`)
      );
      console.log(
        `  no visual leak in body:      ${
          a.visualMentionInBody
            ? `❌  ("${a.visualLeakWord}" → "${a.visualLeakContext}")`
            : "✓"
        }`
      );
      if (t.requiresVisualsOffer) {
        console.log(`  ends with visuals offer:     ${a.offersVisualsAtEnd ? "✓" : "❌"}`);
      }
      console.log(`  → ${passed ? "PASS" : "FAIL"}`);

      results.push({ kind: set.kind, name: t.framework, passed });
    }
  }

  // Other framework references (KB string match in reply)
  console.log("\n" + "=".repeat(80));
  console.log("OTHER FRAMEWORK REFERENCES");
  console.log("=".repeat(80));
  for (const t of OTHER_TESTS) {
    console.log(`\n─── ${t.name} ───`);
    const { reply, dynamic } = await runOne({ scenario: t, systemPrompt, kind: "other" });
    const replyLower = reply.toLowerCase();
    const refsHit = t.expectKbReference.filter((s) => replyLower.includes(s.toLowerCase())).length;
    const passed = refsHit >= 1 && reply.length > 80;
    console.log(`  retrieval top hit:           ${dynamic[0]?.section_path ?? "—"}`);
    console.log(`  required terms hit:          ${refsHit}/${t.expectKbReference.length} ${passed ? "✓" : "❌"}`);
    console.log(`  → ${passed ? "PASS" : "FAIL"}`);
    results.push({ kind: "other", name: t.name, passed });
  }

  // Framework selection probes — verify both that the right framework is
  // picked AND that the slide labels in the resulting carousel come from
  // that framework's KB chunk verbatim (catches the "right framework name,
  // fabricated slide labels" failure mode).
  console.log("\n" + "=".repeat(80));
  console.log("FRAMEWORK SELECTION (no framework named — agent must pick the right one and use its labels)");
  console.log("=".repeat(80));
  for (const t of SELECTION_TESTS) {
    console.log(`\n─── ${t.name} ───`);
    const { reply, dynamic } = await runOne({ scenario: t, systemPrompt, kind: "selection" });
    const replyLower = reply.toLowerCase();
    const matched = t.acceptable.find((a) => replyLower.includes(a.toLowerCase()));

    // Locate the KB chunk for the picked framework so we can audit slide
    // labels against it (substring-match, paren-stripped, like the
    // carousel fidelity check does).
    let pickedChunk = null;
    if (matched) {
      pickedChunk =
        dynamic.find((d) =>
          (d.metadata?.framework_name ?? "").toLowerCase().includes(matched.toLowerCase())
        ) ??
        dynamic.find((d) => (d.section_path ?? "").toLowerCase().includes(matched.toLowerCase()));
    }

    const slideAudit = matched
      ? auditSlideResponse(reply, {
          frameworkAliases: [matched],
          kbContent: pickedChunk?.content ?? "",
        })
      : null;

    const labelsOk =
      slideAudit && slideAudit.beatCount >= 3
        ? slideAudit.beatsMatchingKb >= Math.max(2, Math.ceil(slideAudit.beatCount * 0.7))
        : false;

    const passed = !!matched && labelsOk;

    console.log(`  retrieval top hit:           ${dynamic[0]?.section_path ?? "—"}`);
    console.log(`  acceptable frameworks:       ${t.acceptable.join(" | ")}`);
    console.log(`  agent picked:                ${matched || "❌ none of the acceptable set"}`);
    if (slideAudit) {
      console.log(`  slide labels in KB chunk:    ${slideAudit.beatsMatchingKb}/${slideAudit.beatCount} ${labelsOk ? "✓" : "❌"}`);
      slideAudit.beats.forEach((b) =>
        console.log(`     · ${b.n}: "${b.name}"  ${b.inKb ? "✓" : "❌"}`)
      );
    }
    console.log(`  → ${passed ? "PASS" : "FAIL"}`);
    results.push({ kind: "selection", name: t.name, passed });
  }

  // Vague guard
  console.log("\n" + "=".repeat(80));
  console.log("CONSULTANT GUARD (vague asks must clarify, not dump)");
  console.log("=".repeat(80));
  for (const t of VAGUE_TESTS) {
    console.log(`\n─── ${t.name} ───`);
    const { reply } = await runOne({ scenario: t, systemPrompt, kind: "guard" });
    const noSlidesDumped =
      [...reply.matchAll(/^\s*\*?\*?Slide\s*\d+/gm)].length === 0;
    const askedQuestion = /\?/.test(reply);
    const passed = noSlidesDumped && askedQuestion;
    console.log(`  no slides dumped:            ${noSlidesDumped ? "✓" : "❌"}`);
    console.log(`  asked a question:            ${askedQuestion ? "✓" : "❌"}`);
    console.log(`  → ${passed ? "PASS" : "FAIL"}`);
    results.push({ kind: "guard", name: t.name, passed });
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  const groups = ["carousel", "story", "other", "selection", "guard"];
  let total = 0;
  let pass = 0;
  for (const g of groups) {
    const set = results.filter((r) => r.kind === g);
    if (set.length === 0) continue;
    const ok = set.filter((r) => r.passed).length;
    total += set.length;
    pass += ok;
    console.log(`  ${g.padEnd(10)} ${ok}/${set.length}`);
    for (const r of set) {
      console.log(`    ${r.passed ? "PASS" : "FAIL"}  ${r.name}`);
    }
  }
  console.log(`\n  TOTAL ${pass}/${total} ${pass === total ? "✓ SHIPPING READY" : "❌ has failures"}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
