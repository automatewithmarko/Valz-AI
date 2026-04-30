// Re-runs the production /api/chat pipeline (vector retrieval → Grok)
// against the actual SYSTEM_PROMPT extracted from chat/route.ts, then
// audits each carousel response for:
//   1. Names the framework it picked.
//   2. Outputs slides as "Slide N — [name]" + on-slide copy, NOT a
//      generic Slide/Text/Caption grid.
//   3. Body contains no visual / image / design / colour / B-roll talk.
//   4. Ends with one short offer to provide visuals separately.
//   5. Retrieval pulled framework chunks from the vector store
//      (no fallback path exists in src/lib/kb-retrieval.ts).
//
// Usage:  node scripts/test-carousel-output.mjs

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

// Mirror of src/lib/kb-retrieval.ts buildKbContext (vector-only).
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
      model: "grok-3-fast",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      stream: false,
      max_tokens: 3000,
    }),
  });
  if (!res.ok) throw new Error(`grok ${res.status}: ${await res.text()}`);
  return (await res.json()).choices[0].message.content;
}

// ── Audit helpers ───────────────────────────────────────────────────
const KNOWN_FRAMEWORKS = [
  "Pattern Interrupt",
  "Curiosity Carousel",
  "Borrow the Moment",
  "Permission Slip",
  "Small Shift, Big Shift",
  "Quiet Upgrade",
  "Vetted Edit",
  "Proof Over Hype",
  "I Needed This",
];

const VISUAL_TERMS_RE =
  /\b(visual|image|images|imagery|photo|stock\s?(?:photo|image|footage)?|design|font|color|colour|palette|graphic|graphics|b[-\s]?roll|stock\s?footage|illustration|aesthetic|backdrop|video\s?clip|transition|filter|template\s?(?:graphic|design)|overlay\s?(?:image|graphic))\b/i;

function audit(reply) {
  const lower = reply.toLowerCase();
  const namedFramework = KNOWN_FRAMEWORKS.find((f) => lower.includes(f.toLowerCase())) || null;

  const slideMarkers = [...reply.matchAll(/^\s*\*?\*?Slide\s*(\d+)/gm)].map((m) =>
    parseInt(m[1], 10)
  );
  const uniqueSlides = [...new Set(slideMarkers)].sort((a, b) => a - b);

  const hasGridTable =
    /\|\s*slide\s*\|\s*text\s*\|\s*caption\s*\|/i.test(reply) ||
    /\|\s*slide\s*\|\s*copy\s*\|\s*visual\s*\|/i.test(reply) ||
    /\|\s*slide\s*number\s*\|/i.test(reply);

  // Trailing "want me to sketch visuals?" question is allowed — strip it
  // before testing slide bodies for visual-talk leaks.
  const VISUALS_OFFER_LINE_RE =
    /\n+[^\n]*(want|would you like|happy to|should i|let me know if you'?d like|do you want)[^\n]*(visual|image|design|graphic|cover|art|aesthetic)[^\n]*\?\s*$/i;
  const replyMinusTail = reply.replace(VISUALS_OFFER_LINE_RE, "").trim();

  // Body of slides (everything from first slide marker onward, minus the offer).
  const firstSlideIdx = replyMinusTail.search(/^\s*\*?\*?Slide\s*\d+/m);
  const slideRegion = firstSlideIdx >= 0 ? replyMinusTail.slice(firstSlideIdx) : "";
  const visualMentionInBody = VISUAL_TERMS_RE.test(slideRegion);

  const subLabelInBody =
    /(\bcaption\s*[:—-]\s*\S)/i.test(slideRegion) &&
    !/^\s*\*\*caption\*\*\s*$/im.test(reply);

  const tail = reply.slice(-400).toLowerCase();
  const offersVisualsAtEnd =
    /(visual|image|design|graphic|cover|art|aesthetic).{0,80}\?/.test(tail) ||
    /(want|would you like|should i|happy to|do you want)[\s\S]{0,160}(visual|image|design|graphic)/i.test(tail);

  const usesGenericSlideTextCaptionLabels =
    /^slide\s*\d+\s*[:|-]\s*(text|copy)\s*[:|-]\s*caption/im.test(reply) ||
    /text\s*[:|-].{0,20}caption\s*[:|-]/i.test(reply);

  return {
    namedFramework,
    uniqueSlides,
    hasGridTable,
    visualMentionInBody,
    subLabelInBody,
    offersVisualsAtEnd,
    usesGenericSlideTextCaptionLabels,
  };
}

// ── Scenarios ───────────────────────────────────────────────────────
// Each scenario carries enough niche/audience/offer context that the
// consultant rule ("ask before dumping a plan") is satisfied and the
// agent should proceed to write the carousel directly.
const SCENARIOS = [
  {
    name: "Holistic nutritionist asks for a carousel (growth)",
    messages: [
      {
        role: "user",
        content:
          "I'm a holistic nutritionist for women in their 30s recovering from burnout. They're exhausted, doom-scrolling wellness content, and feel worse not better. I've already shared my own burnout-at-29 story. Pick the framework you think fits best, name it, and write the carousel for me. I just want the on-slide copy now, not visual ideas.",
      },
    ],
  },
  {
    name: "Career strategist asks to sell with a carousel",
    messages: [
      {
        role: "user",
        content:
          "I help women in their 40s leave corporate burnout and build a quieter career. I'm launching The Quiet Exit, $1,200, 6-week 1:1 intensive. My audience: directors and senior managers who've been told they're 'too sensitive' for corporate. I want a sales-focused carousel from your sales frameworks. Pick the best one, name it, write the slides. No visuals yet.",
      },
    ],
  },
  {
    name: "Coach explicitly asks for the Pattern Interrupt Carousel",
    messages: [
      {
        role: "user",
        content:
          "Use the Pattern Interrupt Carousel framework. I'm a money mindset coach for female founders running service businesses around $5-15K/mo. Walk me through what each slide should say. Just the slide copy, no visuals.",
      },
    ],
  },
  {
    name: "Vague request — should ask for context, NOT dump a carousel",
    expectClarifying: true,
    messages: [
      { role: "user", content: "Make me a carousel." },
    ],
  },
];

(async () => {
  await loadEnv();
  const systemPrompt = await loadProductionSystemPrompt();
  console.log(`Loaded production SYSTEM_PROMPT (${systemPrompt.length} chars)\n`);

  const results = [];
  for (const s of SCENARIOS) {
    console.log("=".repeat(80));
    console.log(`SCENARIO: ${s.name}`);
    console.log("=".repeat(80));

    const lastUser = [...s.messages].reverse().find((m) => m.role === "user").content;
    const { rules, dynamic } = await buildKbContext(lastUser);

    console.log(`\n[Vector retrieval] +${rules.length} rules, +${dynamic.length} dynamic chunks`);
    for (const m of dynamic) {
      console.log(`  · ${m.similarity.toFixed(3)}  ${m.section_path}`);
    }

    const kbBlock =
      `### Writing Rules (Section 1, ALWAYS APPLY — quote verbatim)\n\n${formatChunks(rules)}\n\n---\n\n` +
      `### Most relevant frameworks / strategies for this query (ranked by similarity)\n\n${formatChunks(dynamic)}`;

    const sysPrompt = `${systemPrompt}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${kbBlock}`;
    const reply = await callGrok(sysPrompt, s.messages);
    console.log("\n[Grok reply]\n" + reply);

    const a = audit(reply);
    console.log("\n[Audit]");
    console.log(`  framework named:                  ${a.namedFramework || "❌ NONE"}`);
    console.log(`  slide markers found (1..N):       ${a.uniqueSlides.join(",") || "❌ NONE"}`);
    console.log(`  has generic slide/text/caption:   ${a.hasGridTable ? "❌ YES" : "✓ no"}`);
    console.log(`  visual mention in slide body:     ${a.visualMentionInBody ? "❌ YES" : "✓ no"}`);
    console.log(`  caption/visual sub-label in body: ${a.subLabelInBody ? "❌ YES" : "✓ no"}`);
    console.log(`  uses Slide:Text:Caption labels:   ${a.usesGenericSlideTextCaptionLabels ? "❌ YES" : "✓ no"}`);
    console.log(`  offers visuals at end (?):        ${a.offersVisualsAtEnd ? "✓ yes" : "❌ NO"}`);

    let passed;
    if (s.expectClarifying) {
      // For vague asks, the consultant rule says: ask questions, don't dump.
      const askedAQuestion = /\?\s*$/.test(reply.trim()) || /\?/.test(reply);
      const didNotDumpSlides = a.uniqueSlides.length === 0;
      passed = askedAQuestion && didNotDumpSlides;
      console.log(`  expects clarifying:               ${askedAQuestion ? "✓ asked" : "❌ no question"} | ${didNotDumpSlides ? "✓ no slides dumped" : "❌ dumped slides"}`);
    } else {
      passed =
        a.namedFramework &&
        a.uniqueSlides.length >= 4 &&
        !a.hasGridTable &&
        !a.visualMentionInBody &&
        !a.subLabelInBody &&
        !a.usesGenericSlideTextCaptionLabels &&
        a.offersVisualsAtEnd;
    }
    results.push({ name: s.name, passed, audit: a });
  }

  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  for (const r of results) {
    console.log(`  ${r.passed ? "PASS" : "FAIL"}  ${r.name}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
