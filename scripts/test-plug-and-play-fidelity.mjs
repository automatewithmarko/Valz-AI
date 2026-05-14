// Strict Plug-and-Play fidelity test for every carousel + story framework.
//
// For each framework:
//   1. Sends a real, niche-specific brief through the production
//      /api/chat pipeline (same retrieval, same SYSTEM_PROMPT, same model
//      and gateway as production — xai/grok-4-0709 via MENTOR_API_URL).
//   2. Audits the reply against the canonical Plug-and-Play labels from
//      route.ts's "Reference labels" section (which is itself transcribed
//      verbatim from the KB Plug-and-Play templates).
//
// A scenario PASSES only when:
//   - Framework is named in the opening line.
//   - Slide / beat count matches the canonical count exactly (variable
//     frameworks accept a range).
//   - Every canonical label appears in the output, in order.
//   - No em-dash or en-dash anywhere in body or labels.
//   - No visuals leak into the slide bodies.
//   - Carousels close with the mandated two-line follow-up.

import { readFile, writeFile, mkdir } from "node:fs/promises";
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

async function loadChatSystemPrompt() {
  const src = await readFile(resolve(ROOT, "src/app/api/chat/route.ts"), "utf8");
  const m = src.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
  if (!m) throw new Error("Could not locate SYSTEM_PROMPT in chat/route.ts");
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
  if (!res.ok) throw new Error(`embed: ${res.status} ${await res.text()}`);
  return (await res.json()).data[0].embedding;
}

async function rpc(fn, args) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${fn}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function buildKbContext(query) {
  const embedding = await embedQuery(query);
  const [matched, rules] = await Promise.all([
    rpc("match_kb_chunks", {
      query_embedding: embedding,
      match_count: 8,
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function isRetryable(err) {
  const msg = String(err?.message ?? err);
  return (
    /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(msg) ||
    /\b(429|500|502|503|504)\b/.test(msg)
  );
}

async function withBackoff(fn, label) {
  const delays = [2000, 4000, 8000, 16000, 30000]; // exponential, capped
  let lastErr;
  for (let i = 0; i <= delays.length; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i === delays.length || !isRetryable(err)) throw err;
      const wait = delays[i] + Math.floor(Math.random() * 500);
      console.log(`   ↺ ${label} attempt ${i + 1} failed (${String(err.message).slice(0, 80)}). Retrying in ${wait}ms…`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

async function callProduction(systemPrompt, messages) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) throw new Error("XAI_API_KEY missing");
  return withBackoff(async () => {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4-fast-reasoning",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        stream: false,
        max_tokens: 6000,
      }),
    });
    if (!res.ok) throw new Error(`xai ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const d = await res.json();
    return d.choices?.[0]?.message?.content ?? "";
  }, "xai-call");
}

// Per-framework "scaffold" definitions. Each entry corresponds to one PnP
// slide and lists the canonical fill-in frames from the KB's `Plug & Play
// Template` section. The model's output for that slide MUST contain at least
// one of the alternates (with the blanks filled in). If a slide has multiple
// bullet frames in the PnP (e.g. Pattern Interrupt's slide 2 has three
// "X won't [automatically/guarantee/create] Y" lines), we require `minHits`
// of them. This is the verbatim-template test: it fails if the model
// paraphrases the slide instead of plugging into the frame.
//
// Excluded from the audit:
//   - Curiosity Carousel slide 4 ("It wasn't that I was incapable. It was
//     that ___.") — that is the banned contrast formula per route.ts §175-§186,
//     so the model MUST rewrite it. We don't audit a scaffold the writing
//     rules forbid.
const SCAFFOLDS = {
  "Borrow the Moment, Build the Depth": [
    { slide: 1, alts: [/Everyone'?s talking about/i, /Why did .+ feel bigger/i, /Why is .+ resonating/i] },
    { slide: 2, alts: [/On the surface,? it looks like/i, /It'?s easy to see it as/i] },
    { slide: 3, alts: [/What stayed with me was/i, /Behind that moment was/i, /Underneath it all was/i] },
    { slide: 4, alts: [/When something like (this|that) hits hard/i, /Sometimes it shines a light on/i] },
    { slide: 5, alts: [/Watching someone .+ can stir/i, /Awareness is often the first sign of/i] },
    { slide: 6, alts: [/If this stirred something in you/i, /You don'?t need to/i, /Start with/i] },
  ],
  "Pattern Interrupt": [
    { slide: 1, alts: [/I don'?t know which .+ needs to hear this/i] },
    { slide: 2, minHits: 2, alts: [/won'?t automatically/i, /won'?t guarantee/i, /won'?t create/i] },
    { slide: 3, minHits: 2, alts: [/Growth comes from/i, /Momentum builds when/i, /Real traction starts with/i] },
    { slide: 4, minHits: 2, alts: [/\bis powerful\b/i, /\bcan help\b/i, /(?:are|they'?re) valuable when/i, /be careful not to/i] },
    { slide: 5, minHits: 2, alts: [/Tools amplify/i, /Clarity creates/i, /Alignment sustains/i] },
  ],
  "Curiosity Carousel": [
    { slide: 1, alts: [/For a long time I thought/i, /I used to believe/i, /doesn'?t automatically mean/i] },
    { slide: 2, alts: [/I remember sitting/i, /I'?d just/i, /From the outside,? it looked like/i] },
    { slide: 3, alts: [/What I didn'?t understand then was/i, /There'?s actually research around/i, /I later learned that/i] },
    // Slide 4 intentionally skipped — its PnP frame ("It wasn't that…. It was…") is a banned contrast formula.
    { slide: 5, alts: [/That'?s why you might/i, /That'?s why .+ feel/i, /That'?s why you can achieve .+ and still feel/i] },
    { slide: 6, alts: [/The shift for me started when/i, /You don'?t need to/i, /Maybe the real question is/i] },
    // Slide 7 is "Soft CTA (Optional)" — not required.
  ],
  "Permission Slip Post": [
    { slide: 1, alts: [/I'?m a .+,? and I'?ve been quietly/i, /As a .+,? I don'?t see many people/i] },
    { slide: 2, alts: [/By [^.]+,? I'?m/i, /From the outside it looks like .+ but internally it feels like/i] },
    { slide: 3, alts: [/There are days when/i, /Sometimes I find myself/i] },
    { slide: 4, alts: [/The part that'?s rarely spoken about is/i, /What makes it heavy isn'?t/i] },
    { slide: 5, alts: [/There'?s (?:this )?unspoken expectation that/i, /We'?re somehow meant to/i] },
    { slide: 6, alts: [/You'?re not [^.]+\. You'?re navigating/i, /It makes sense that you feel this way when/i] },
    { slide: 7, alts: [/If you'?re a .+ who'?s figuring out/i, /Follow along for/i] },
  ],
  "Small Shift, Big Shift": [
    { slide: 1, alts: [/I used to believe/i, /For a long time I thought/i] },
    { slide: 2, alts: [/What I didn'?t see at the time was/i, /Most people don'?t realise that/i] },
    { slide: 3, alts: [/It looked like/i, /It felt like/i, /Behind the scenes,? I was/i] },
    { slide: 4, alts: [/The shift happened when/i, /Instead of .+,? I chose to/i] },
    { slide: 5, alts: [/Since then,? .+ feels different/i, /My .+ has changed/i] },
    { slide: 6, alts: [/It feels like/i] },
    { slide: 7, alts: [/If you'?re currently .+,? this might be your sign/i, /Comment .+ and I'?ll/i] },
  ],
  "Quiet Upgrade": [
    { slide: 1, alts: [/For a long time I thought/i, /I used to believe/i] },
    { slide: 2, alts: [/What I didn'?t understand was/i, /Most people don'?t realise that/i] },
    { slide: 3, alts: [/It looked like/i, /Behind the scenes I was/i] },
    { slide: 4, alts: [/The shift happened when/i, /Instead of .+,? I chose to/i] },
    { slide: 5, alts: [/Since then,? .+ feels different/i, /Now when I .+,? it feels/i] },
    { slide: 6, alts: [/It feels like/i] },
    { slide: 7, alts: [/If you'?re currently .+,? this might be your starting point/i, /Comment .+ and I'?ll show you where to begin/i] },
  ],
  "Vetted Edit": [
    // Allow "As a [role] who" as a legitimate role-substitution of "As someone who".
    { slide: "context", alts: [/For a while I was/i, /As (?:someone|an?) [^,\n]+ who [^,\n]+,? I'?ve learned that/i] },
    { slide: "product", minHits: 2, alts: [/This is what I use for/i, /I chose (?:it|them|these) because/i, /Since using (?:it|them|these),? I'?ve noticed/i] },
    { slide: "invitation", alts: [/If you'?ve been .+,? start here/i, /Comment .+ and I'?ll send you the full edit/i] },
  ],
  "Proof Over Hype": [
    { slide: 1, alts: [/We achieved .+ in/i, /This client went from .+ to/i] },
    { slide: 2, alts: [/At the beginning,/i, /They were/i, /The challenge was/i] },
    { slide: 3, alts: [/We decided to/i, /Instead of .+,? we focused on/i] },
    { slide: 4, alts: [/Within .+,? we started noticing/i, /By .+,? .+ had changed/i] },
    { slide: 5, alts: [/What this shows is/i, /This proves that/i] },
    { slide: 6, alts: [/If you'?re currently .+,? this is where we start/i, /Comment .+ and I'?ll send you the next step/i] },
  ],
  "I Needed This": [
    { slide: 1, alts: [/When .+ happened,? I realised/i] },
    { slide: 2, alts: [/As .+ changed,? I felt/i, /There was so much .+,? but I still felt/i] },
    { slide: 3, alts: [/I tried/i, /I implemented/i] },
    { slide: 4, alts: [/What I couldn'?t find was/i, /What was missing was/i] },
    { slide: 5, alts: [/So I decided to/i, /I created/i] },
    { slide: 6, alts: [/That'?s how .+ was created/i] },
    { slide: 7, alts: [/Inside,? you'?ll/i] },
    { slide: 8, alts: [/If you'?re currently .+,? this is where I'?d start/i, /Comment .+ and I'?ll send it through/i] },
  ],
};

// Canonical Plug-and-Play labels (verbatim from route.ts "Reference labels").
// `count` is the exact number of slides/steps; `range` allows variable frameworks.
const CAROUSELS = [
  {
    framework: "Borrow the Moment, Build the Depth",
    aliases: ["Borrow the Moment"],
    count: 6,
    labels: [
      "The Moment",
      "The Surface",
      "The Deeper Layer",
      "The Mirror",
      "The Shareable Truth",
      "The Encouragement",
    ],
    goal: "growth",
    prompt:
      "Use the Borrow the Moment, Build the Depth Carousel. I'm a corporate-exit coach for women in their late 30s and early 40s. Right now there's a viral story of a senior product manager publicly quitting her Google job to launch a tiny B2B Substack and move coastal. My audience is engaging with it heavily. Walk me through every slide of the carousel.",
  },
  {
    framework: "Pattern Interrupt",
    aliases: ["Pattern Interrupt"],
    count: 5,
    labels: [
      "The Identity Call Out",
      "Name the Fixations",
      "The Core Principle",
      "The Nuance",
      "The Sharable Wrap",
    ],
    goal: "growth",
    prompt:
      "Use the Pattern Interrupt Carousel. My audience is female founders who are drowning in 'algorithm hacks' and 'you need another course' noise. I want a calm reset that builds my authority. Walk me through each slide.",
  },
  {
    framework: "Curiosity Carousel",
    aliases: ["Curiosity Carousel"],
    count: 7,
    labels: [
      "The Curiosity Hook",
      "Expand the Personal Context",
      "Introduce the Concept",
      "Reframe the Narrative",
      "Validation",
      "Empowered Close",
      "Soft CTA",
    ],
    goal: "growth",
    countTolerant: true, // Soft CTA is "(Optional)" in the PnP — accept 6 or 7.
    minCount: 6,
    prompt:
      "Use the Curiosity Carousel framework. I'm a holistic nutritionist for women in their 30s recovering from burnout. They consume wellness content obsessively but feel worse. Write the carousel slides.",
  },
  {
    framework: "Permission Slip Post",
    aliases: ["Permission Slip"],
    count: 7,
    labels: [
      "Identity + Tension",
      "Real Moment",
      "Expand the Experience",
      "Name the Invisible Problem",
      "Cultural Expectation",
      "Encouragement",
      "Invitation",
    ],
    goal: "growth",
    prompt:
      "Use the Permission Slip Post framework. I'm a postnatal Pilates instructor for first-time mums who feel guilty about taking any time away from the baby. Walk me through each slide.",
  },
  {
    framework: "Small Shift, Big Shift",
    aliases: ["Small Shift, Big Shift", "Small Shift Big Shift"],
    count: 7,
    labels: [
      "Personal Entry",
      "Reveal the Hidden Issue",
      "Expand the Pattern",
      "The Replacement",
      "Integration",
      "Emotional Result",
      "Invitation",
    ],
    goal: "growth",
    prompt:
      "Use the Small Shift, Big Shift Carousel. I'm a sleep coach for sleep-deprived founders who think they need to grind through it. Topic: putting your phone in another room until 9am. Walk me through each slide.",
  },
  {
    framework: "Quiet Upgrade",
    aliases: ["Quiet Upgrade"],
    count: 7,
    labels: [
      "Personal Realisation",
      "Hidden Friction",
      "Real Life Pattern",
      "The Upgrade",
      "Integration",
      "Emotional Result",
      "Invitation",
    ],
    goal: "sales",
    prompt:
      "Use the Quiet Upgrade Carousel. I'm launching The Quiet Exit, a $1,200 6-week 1:1 intensive for senior managers ready to leave corporate. The vibe is calm and inevitable, not hype. Walk me through each slide.",
  },
  {
    framework: "Vetted Edit",
    aliases: ["Vetted Edit"],
    count: 7, // 1 context + 5 products + 1 invitation for a 5-tools curation
    countTolerant: true,
    minCount: 5,
    maxCount: 9,
    labels: [
      "Context",
      "Invitation",
    ],
    goal: "sales",
    prompt:
      "Use the Vetted Edit Carousel framework. I'm a wellness-tech reviewer. I want to launch a curated list of the 5 nervous-system tools I actually use daily, priced as a $47 mini-guide. Walk me through each slide for those 5 tools.",
  },
  {
    framework: "Proof Over Hype",
    aliases: ["Proof Over Hype"],
    count: 6,
    labels: [
      "Outcome",
      "Starting Point",
      "The Inputs",
      "The Shift",
      "The Meaning",
      "Invitation",
    ],
    goal: "sales",
    prompt:
      "Use the Proof Over Hype Carousel. I'm a copywriter for service-based founders, launching my $497 sales-page intensive. I have 14 case studies and my best client went from $4K/mo to $22K/mo months after working with me. Walk me through each slide.",
  },
  {
    framework: "I Needed This",
    aliases: ["I Needed This"],
    count: 8,
    labels: [
      "The Moment",
      "Expand the Weight",
      "Effort",
      "The Gap",
      "The Build",
      "The Resource",
      "What's Inside",
      "Invitation",
    ],
    goal: "sales",
    prompt:
      "Use the I Needed This Carousel. I'm a money-mindset coach launching The Pricing Reset, a $297 self-paced workshop. I built it because nothing addressed the emotional spiral around raising rates. Walk me through each slide.",
  },
];

const STORIES = [
  {
    framework: "Initial Sequence",
    aliases: ["Initial Sequence"],
    count: 6,
    labels: ["RELATE", "REVEAL", "PROOF", "PRESENT PRODUCT", "CTA", "DEEPEN"],
    labelsCaseSensitive: true,
    prompt:
      "Use the Initial Sequence story framework (Relate, Reveal, Proof, Present Product, CTA, Deepen). I'm launching a $97 nervous system reset workshop for burnt-out women in their 30s. Write me the story sequence I can run today.",
  },
  {
    framework: "Seamless Story Sell",
    aliases: ["Seamless Story Sell"],
    count: 4,
    labels: [
      "Real-Time Hook",
      "Context + Connection",
      "Offer + Clear CTA",
      "Close the Loop",
    ],
    prompt:
      "Use the Seamless Story Sell framework. I'm a copywriter selling a $297 sales-page audit. Write the story sequence I can post today.",
  },
  {
    framework: "Conversation Close Flow",
    aliases: ["Conversation Close Flow"],
    count: 6, // 1 open + 1 curiosity + 1-3 expand + 1 segue + 1-3 sell + 1 close, baseline 6
    countTolerant: true,
    minCount: 5,
    maxCount: 10,
    labels: [
      "Open the Conversation",
      "Create Curiosity",
      "Expand with Context",
      "The Segue to Sales",
      "Sell with Clear CTA",
      "Close the Story Loop",
    ],
    prompt:
      "Use the Conversation Close Flow story framework. I'm a postnatal Pilates instructor selling a $179 6-week studio block to first-time mums. Write the story sequence.",
  },
  {
    framework: "Authority Loop",
    aliases: ["Authority Loop"],
    count: 5,
    labels: [
      "The Curiosity Hook",
      "Educate",
      "Proof",
      "Sell with Clear CTA",
      "Close the Loop",
    ],
    prompt:
      "Use the Authority Loop story framework. I'm a brand strategist for women launching their first $5K-10K offer. I want to drive bookings to my 3-month strategy intensive at $4,500. Write the story sequence.",
  },
  {
    framework: "Anticipation Arc",
    aliases: ["Anticipation Arc"],
    count: 4,
    labels: [
      "The Tease",
      "The Transformation",
      "Sneak Peek + Urgency",
      "Close the Loop",
    ],
    prompt:
      "Use the Anticipation Arc story framework. I'm doing a multi-day countdown to opening enrolment for my $1,997 group programme on aligned income for female founders. Write the story sequence across the lead-up.",
  },
  {
    framework: "Casual Conversation Close",
    aliases: ["Casual Conversation Close"],
    count: 4,
    labels: [
      "Open the Conversation",
      "Expand + Invite Feedback",
      "Drop the Offer",
      "Close the Conversation",
    ],
    prompt:
      "Use the Casual Conversation Close story framework. I'm a creative writing coach for novelists with day jobs, selling a $2,400 12-week intensive. I want a softer, conversational story sequence. Write it.",
  },
];

const CAROUSEL_FOLLOWUP =
  /are there any tweaks you'?d like to make[^?]*\?\s*Alternatively,?\s+would you like a supporting caption/i;

const VISUAL_LEAK =
  /\b(visual\s?(?:idea|treatment|direction)?|imagery|stock\s?(?:photo|image|footage)|b[-\s]?roll|illustration|aesthetic\s?(?:choice|treatment)|backdrop|transition|template\s?(?:graphic|design)|overlay\s?(?:image|graphic)|font\s?(?:choice|pair)|colour\s?(?:palette|scheme)|color\s?(?:palette|scheme))\b/i;

function findLabel(reply, label, caseSensitive = false) {
  // Substring match, normalised across casing, dashes, and ampersands.
  const norm = (s) => s.replace(/[—–]/g, "-").replace(/\s+/g, " ").trim();
  const r = norm(reply);
  const l = norm(label);
  if (caseSensitive) return r.includes(l);
  return r.toLowerCase().includes(l.toLowerCase());
}

function extractBeatCount(reply) {
  // Count "Slide N", "STEP N", "Beat N", "Day N", "Story N" headers OR
  // all-caps headed labels like **RELATE** / **REVEAL**.
  const numeric = reply.match(/^\s*\*{0,2}(?:Slide|Step|STEP|Beat|Day|Story|Stage|Phase)\s*\d+/gim) || [];
  if (numeric.length >= 3) return numeric.length;
  const caps = reply.match(/^\s*\*\*[A-Z][A-Z0-9 +\-/&'’]{1,30}[A-Z0-9]\*\*\s*$/gm) || [];
  return caps.length;
}

function auditScaffolds(reply, scaffolds) {
  if (!scaffolds) return { audited: false, results: [], allOk: true };
  const results = scaffolds.map((sc) => {
    const minHits = sc.minHits ?? 1;
    const hits = sc.alts.filter((re) => re.test(reply)).length;
    return { slide: sc.slide, minHits, hits, total: sc.alts.length, ok: hits >= minHits };
  });
  const allOk = results.every((r) => r.ok);
  return { audited: true, results, allOk };
}

function audit(scenario, reply, kind) {
  const minCount = scenario.minCount ?? scenario.count;
  const maxCount = scenario.maxCount ?? scenario.count;
  const beatCount = extractBeatCount(reply);
  const beatCountOk = scenario.countTolerant
    ? beatCount >= minCount && beatCount <= maxCount
    : beatCount === scenario.count;

  const frameworkNamed = scenario.aliases.some((a) =>
    reply.toLowerCase().includes(a.toLowerCase())
  );

  const labelHits = scenario.labels.map((l) => ({
    label: l,
    present: findLabel(reply, l, !!scenario.labelsCaseSensitive),
  }));
  const labelsOk = labelHits.every((l) => l.present);

  const hasEmDash = /—/.test(reply);
  const hasEnDash = /–/.test(reply);
  const visualLeak = VISUAL_LEAK.test(reply);
  const followUpOk = kind === "carousel" ? CAROUSEL_FOLLOWUP.test(reply) : true;

  const scaffoldAudit = auditScaffolds(reply, SCAFFOLDS[scenario.framework]);

  const passed =
    frameworkNamed && beatCountOk && labelsOk && !hasEmDash && !hasEnDash && !visualLeak && followUpOk && scaffoldAudit.allOk;
  return {
    passed,
    frameworkNamed,
    beatCount,
    beatCountOk,
    labelHits,
    labelsOk,
    hasEmDash,
    hasEnDash,
    visualLeak,
    followUpOk,
    scaffoldAudit,
  };
}

async function runOne(systemPromptBase, scenario, kind) {
  const { rules, dynamic } = await buildKbContext(scenario.prompt);
  const kbBlock =
    `### Writing Rules (Section 1, ALWAYS APPLY — quote verbatim)\n\n${formatChunks(rules)}\n\n---\n\n` +
    `### Most relevant frameworks / strategies for this query\n\n${formatChunks(dynamic)}`;
  const sys = `${systemPromptBase}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${kbBlock}`;
  const reply = await callProduction(sys, [{ role: "user", content: scenario.prompt }]);
  const a = audit(scenario, reply, kind);
  return { reply, dynamic, audit: a };
}

(async () => {
  await loadEnv();
  const systemPrompt = await loadChatSystemPrompt();
  const filter = (process.argv[2] || "all").toLowerCase(); // "carousels" | "stories" | "all"
  console.log(`Loaded SYSTEM_PROMPT (${systemPrompt.length} chars)`);
  console.log(`Filter: ${filter}`);
  console.log(`Using direct xai endpoint, model: grok-4-fast-reasoning\n`);

  const results = [];

  const blocks = [];
  if (filter === "all" || filter === "carousels" || filter === "carousel") {
    blocks.push({ kind: "carousel", scenarios: CAROUSELS, title: "CAROUSEL FRAMEWORKS" });
  }
  if (filter === "all" || filter === "stories" || filter === "story") {
    blocks.push({ kind: "story", scenarios: STORIES, title: "STORY SEQUENCE FRAMEWORKS" });
  }

  for (const block of blocks) {
    console.log(`\n${"=".repeat(80)}\n${block.title}\n${"=".repeat(80)}`);
    const outDir = resolve(ROOT, "scripts", ".test-outputs", "pnp", block.kind);
    await mkdir(outDir, { recursive: true });
    let idx = 0;
    for (const sc of block.scenarios) {
      if (idx++ > 0) await sleep(1500); // gentle spacing between scenarios
      console.log(`\n─── ${sc.framework} ───`);
      try {
        const { reply, dynamic, audit: a } = await runOne(systemPrompt, sc, block.kind);
        const safe = sc.framework.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
        await writeFile(resolve(outDir, `${safe}.md`), reply);
        console.log(`Top retrieval: ${dynamic[0]?.section_path} (${dynamic[0]?.similarity?.toFixed(3)})`);
        console.log(`Framework named in opening: ${a.frameworkNamed ? "✓" : "✗"}`);
        console.log(`Beat count: ${a.beatCount} / expected ${sc.countTolerant ? `${sc.minCount ?? sc.count}-${sc.maxCount ?? sc.count}` : sc.count} ${a.beatCountOk ? "✓" : "✗"}`);
        console.log(`Plug-and-Play labels:`);
        for (const l of a.labelHits) {
          console.log(`   ${l.present ? "✓" : "✗"} ${l.label}`);
        }
        if (a.scaffoldAudit.audited) {
          const okCount = a.scaffoldAudit.results.filter((r) => r.ok).length;
          console.log(`PnP scaffold fidelity: ${okCount}/${a.scaffoldAudit.results.length} ${a.scaffoldAudit.allOk ? "✓" : "✗"}`);
          for (const r of a.scaffoldAudit.results) {
            console.log(`   ${r.ok ? "✓" : "✗"} slide ${r.slide}: ${r.hits}/${r.total} alts matched (need ≥ ${r.minHits})`);
          }
        } else {
          console.log(`PnP scaffold fidelity: (no scaffolds defined for this framework)`);
        }
        console.log(`No em-dash: ${a.hasEmDash ? "✗ (FOUND)" : "✓"}`);
        console.log(`No en-dash: ${a.hasEnDash ? "✗ (FOUND)" : "✓"}`);
        console.log(`No visuals leak: ${a.visualLeak ? "✗ (FOUND)" : "✓"}`);
        if (block.kind === "carousel") {
          console.log(`Carousel follow-up: ${a.followUpOk ? "✓" : "✗ (missing 'Are there any tweaks…' line)"}`);
        }
        console.log(`→ ${a.passed ? "PASS" : "FAIL"}  (full reply: ${resolve(outDir, `${safe}.md`)})`);
        results.push({ kind: block.kind, name: sc.framework, passed: a.passed, audit: a });
      } catch (err) {
        console.error(`ERROR: ${err.message}`);
        results.push({ kind: block.kind, name: sc.framework, passed: false, error: err.message });
      }
    }
  }

  console.log(`\n${"=".repeat(80)}\nSUMMARY\n${"=".repeat(80)}`);
  for (const kind of ["carousel", "story"]) {
    const set = results.filter((r) => r.kind === kind);
    const ok = set.filter((r) => r.passed).length;
    console.log(`\n${kind.toUpperCase()}  ${ok}/${set.length}`);
    for (const r of set) {
      console.log(`  ${r.passed ? "PASS" : "FAIL"}  ${r.name}${r.error ? ` (${r.error})` : ""}`);
    }
  }
  const totalOk = results.filter((r) => r.passed).length;
  console.log(`\nTOTAL ${totalOk}/${results.length}`);
})().catch((e) => { console.error(e); process.exit(1); });
