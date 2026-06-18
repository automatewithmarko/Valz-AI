import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "scripts", ".test-outputs", "all-carousel-frameworks-six");

async function loadEnv() {
  const text = await readFile(resolve(ROOT, ".env.local"), "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

async function loadSystemPrompt() {
  const src = await readFile(resolve(ROOT, "src/app/api/chat/route.ts"), "utf8");
  const marker = "const SYSTEM_PROMPT = `";
  const start = src.indexOf(marker);
  if (start === -1) throw new Error("Could not find SYSTEM_PROMPT start");
  const after = start + marker.length;
  const end = src.indexOf("`;", after);
  if (end === -1) throw new Error("Could not find SYSTEM_PROMPT end");
  return src.slice(after, end);
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
      input: text.trim().slice(0, 8000),
      dimensions: 1536,
    }),
  });
  if (!res.ok) throw new Error(`embed failed ${res.status}: ${await res.text()}`);
  return (await res.json()).data[0].embedding;
}

async function rpc(fnName, args) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${fnName} failed ${res.status}: ${await res.text()}`);
  return res.json();
}

function formatChunks(chunks) {
  return chunks
    .map((chunk) => {
      const meta = chunk.metadata ?? {};
      const tag = meta.framework_name
        ? `[FRAMEWORK: ${meta.framework_name}]`
        : meta.section_type
          ? `[${String(meta.section_type).toUpperCase()}]`
          : "";
      return `### ${chunk.section_path} ${tag}\n\n${chunk.content}`;
    })
    .join("\n\n---\n\n");
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
  const ruleIds = new Set(rules.map((rule) => rule.id));
  const dynamic = matched.filter((match) => !ruleIds.has(match.id));
  const parts = [];
  if (rules.length > 0) {
    parts.push(`### Writing Rules (Section 1, ALWAYS APPLY - quote verbatim)\n\n${formatChunks(rules)}`);
  }
  if (dynamic.length > 0) {
    parts.push(`### Most relevant frameworks / strategies for this query (ranked by similarity)\n\n${formatChunks(dynamic)}`);
  }
  return { block: parts.join("\n\n---\n\n"), dynamic };
}

const FOLLOW_UP =
  "Are there any tweaks you'd like to make to the above? Alternatively, would you like a supporting caption for this carousel?";

const FRAMEWORK_NAMES = [
  "Borrow the Moment",
  "Build the Depth",
  "Pattern Interrupt",
  "Curiosity Carousel",
  "Permission Slip",
  "Small Shift",
  "Big Shift",
  "Quiet Upgrade",
  "Vetted Edit",
  "Proof Over Hype",
  "I Needed This",
  "Plug-and-Play",
  "Plug and Play",
];

const SCENARIOS = [
  {
    slug: "borrow-the-moment-build-the-depth",
    name: "Borrow the Moment, Build the Depth",
    prompt:
      "Use the Borrow the Moment, Build the Depth Carousel. I'm a corporate-exit coach for senior women who are watching the viral story about a director quitting her job to build a small consultancy from the coast. My audience keeps sharing it because it touches ambition, burnout, identity, and wanting work that feels like theirs. Write the carousel. Just the slide copy, no visuals.",
    labels: ["The Moment", "The Surface", "The Deeper Layer", "The Mirror", "The Shareable Truth", "The Encouragement"],
    starters: [
      ["Why did ", "Everyone's talking about ", "Why is "],
      ["On the surface, it looks like ", "It's easy to see it as "],
      ["What stayed with me was ", "Behind that moment was probably ", "Underneath it all was "],
      ["When something like this hits hard, it often means ", "Sometimes it shines a light on "],
      ["Watching someone ", "Awareness is often the first sign of "],
      ["If this stirred something in you, ", "You don't need to ", "Start with "],
    ],
  },
  {
    slug: "pattern-interrupt",
    name: "Pattern Interrupt",
    prompt:
      "Use the Pattern Interrupt Carousel framework. My audience is women with skills they could monetise, but they keep researching, saving reels, listening to podcasts, and taking free masterclasses instead of starting. The angle is that the research spiral looks like preparation, but underneath it is protection from the risk of being seen. Write the carousel. Just the slide copy, no visuals.",
    labels: ["The Identity Call Out", "Name the Fixations", "The Core Principle", "The Nuance", "The Sharable Wrap"],
    starters: [
      ["I don't know which "],
      ["won't automatically", "won't guarantee", "won't create"],
      ["Growth comes from ", "Momentum builds when ", "Real traction starts with "],
      ["is powerful", "can help", "They're valuable when ", "Just be careful not to "],
      ["Tools amplify ", "Clarity creates ", "Alignment sustains "],
    ],
  },
  {
    slug: "curiosity-carousel",
    name: "Curiosity Carousel",
    prompt:
      "Use the Curiosity Carousel framework. I'm a holistic nutritionist for women in their 30s recovering from burnout. They keep consuming wellness content obsessively and feel worse because they think needing rest means they're failing. Write the carousel. Just the slide copy, no visuals.",
    labels: ["The Curiosity Hook", "Expand the Personal Context", "Introduce the Concept", "Reframe the Narrative", "Validation", "Empowered Close", "Soft CTA (Optional)"],
    starters: [
      ["For a long time I thought ", "I used to believe ", "doesn't automatically mean "],
      ["I remember sitting ", "I'd just ", "From the outside, it looked like "],
      ["What I didn't understand then was ", "There's actually research around ", "I later learned that "],
      ["The story I had been telling myself was ", "I kept assuming ", "But the deeper pattern was "],
      ["That's why you might ", "That's why ", "That's why you can "],
      ["The shift for me started when ", "You don't need to ", "Maybe the real question is "],
      ["If this landed, ", "Save this for ", "Send this to "],
    ],
  },
  {
    slug: "permission-slip-post",
    name: "Permission Slip Post",
    prompt:
      "Use the Permission Slip Post framework. I'm a postnatal Pilates instructor for first-time mums who feel guilty about taking one hour away from the baby to move their body. Write the carousel. Just the slide copy, no visuals.",
    labels: ["Identity + Tension", "Real Moment", "Expand the Experience", "Name the Invisible Problem", "Cultural Expectation", "Encouragement", "Invitation"],
    starters: [
      ["I'm a ", "As a "],
      ["By ", "From the outside it looks like "],
      ["There are days when ", "Sometimes I find myself "],
      ["The part that's rarely spoken about is ", "What makes it heavy "],
      ["There's this unspoken expectation that ", "We're somehow meant to "],
      ["You're navigating ", "It makes sense that you feel this way when "],
      ["If you're a ", "Follow along for "],
    ],
  },
  {
    slug: "small-shift-big-shift",
    name: "Small Shift, Big Shift",
    prompt:
      "Use the Small Shift, Big Shift Carousel. I'm a sleep coach for founders who think the answer is grinding harder. Topic: putting your phone in another room until 9am changed how the whole day felt. Write the carousel. Just the slide copy, no visuals.",
    labels: ["Personal Entry", "Reveal the Hidden Issue", "Expand the Pattern", "The Replacement", "Integration", "Emotional Result", "Invitation"],
    starters: [
      ["I used to believe ", "For a long time I thought "],
      ["What I didn't see at the time was ", "Most people don't realise that "],
      ["It looked like ", "It felt like ", "Behind the scenes, I was "],
      ["The shift happened when ", "Instead of "],
      ["Since then, ", "My "],
      ["It feels like "],
      ["If you're currently ", "Comment "],
    ],
  },
  {
    slug: "quiet-upgrade",
    name: "Quiet Upgrade",
    prompt:
      "Use the Quiet Upgrade Carousel. I'm launching The Quiet Exit, a $1,200 6-week 1:1 intensive for senior managers ready to leave corporate without burning everything down. The vibe is calm and inevitable. Write the carousel. Just the slide copy, no visuals.",
    labels: ["Personal Realisation", "Hidden Friction", "Real Life Pattern", "The Upgrade", "Integration", "Emotional Result", "Invitation"],
    starters: [
      ["For a long time I thought ", "I used to believe "],
      ["What I didn't understand was ", "Most people don't realise that "],
      ["It looked like ", "Behind the scenes I was "],
      ["The shift happened when ", "Instead of "],
      ["Since then, ", "Now when I "],
      ["It feels like "],
      ["If you're currently ", "Comment "],
    ],
  },
  {
    slug: "vetted-edit",
    name: "Vetted Edit",
    prompt:
      "Use the Vetted Edit Carousel framework. I'm a wellness-tech reviewer selling a $47 mini-guide with the 5 nervous-system tools I actually use daily: a wearable HRV tracker, a red light panel, a breathwork app, a weighted eye mask, and a simple magnesium powder. Write the carousel with one slide for each tool. Just the slide copy, no visuals.",
    labels: ["Context", "Product or Resource", "Product or Resource", "Product or Resource", "Product or Resource", "Product or Resource", "Invitation"],
    starters: [
      ["For a while I was ", "As someone who "],
      ["This is what I use for ", "I chose it because ", "Since using it, I've noticed "],
      ["This is what I use for ", "I chose it because ", "Since using it, I've noticed "],
      ["This is what I use for ", "I chose it because ", "Since using it, I've noticed "],
      ["This is what I use for ", "I chose it because ", "Since using it, I've noticed "],
      ["This is what I use for ", "I chose it because ", "Since using it, I've noticed "],
      ["If you've been ", "Comment "],
    ],
  },
  {
    slug: "proof-over-hype",
    name: "Proof Over Hype",
    prompt:
      "Use the Proof Over Hype Carousel. I'm a copywriter for service-based founders launching my $497 sales-page intensive. I have 14 case studies, and my best client went from $4K per month to $22K per month after we rebuilt her sales page and positioning. Write the carousel. Just the slide copy, no visuals.",
    labels: ["Outcome", "Starting Point", "The Inputs", "The Shift", "The Meaning", "Invitation"],
    starters: [
      ["We achieved ", "This client went from "],
      ["At the beginning, ", "They were ", "The challenge was "],
      ["We decided to ", "Instead of "],
      ["Within ", "By "],
      ["What this shows is ", "This proves that "],
      ["If you're currently ", "Comment "],
    ],
  },
  {
    slug: "i-needed-this",
    name: "I Needed This",
    prompt:
      "Use the I Needed This Carousel. I'm a money-mindset coach launching The Pricing Reset, a $297 self-paced workshop. I built it because nothing addressed the emotional spiral service providers have around raising rates. Write the carousel. Just the slide copy, no visuals.",
    labels: ["The Moment", "Expand the Weight", "Effort", "The Gap", "The Build", "The Resource", "What's Inside", "Invitation"],
    starters: [
      ["When "],
      ["As ", "There was so much "],
      ["I tried ", "I implemented "],
      ["What I couldn't find was ", "What was missing was "],
      ["So I decided to ", "I created "],
      ["That's how "],
      ["Inside, you'll "],
      ["If you're currently ", "Comment "],
    ],
  },
];

function normalize(text) {
  return text
    .replace(/[—–]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractLabels(output) {
  const labels = [];
  const re = /^\s*\**\s*Slide\s+(\d+)\s*[-:]\s*([^\n*]+?)\s*\**\s*$/gim;
  let match;
  while ((match = re.exec(output)) !== null) {
    labels.push({ n: Number(match[1]), label: match[2].trim() });
  }
  return labels.sort((a, b) => a.n - b.n).map((item) => item.label);
}

function slideBodies(output) {
  const matches = [...output.matchAll(/^\s*\**\s*Slide\s+(\d+)\s*[-:]\s*([^\n*]+?)\s*\**\s*$/gim)];
  return matches.map((match, index) => {
    const next = matches[index + 1];
    const start = match.index + match[0].length;
    const end = next ? next.index : output.length;
    return output.slice(start, end).trim();
  });
}

function hasStarter(body, starter) {
  return normalize(body).includes(normalize(starter));
}

function audit(output, scenario) {
  const labels = extractLabels(output);
  const bodies = slideBodies(output);
  const expectedLabels = scenario.labels.map(normalize);
  const emittedLabels = labels.map(normalize);
  const labelsOk =
    emittedLabels.length === expectedLabels.length &&
    expectedLabels.every((label, index) => emittedLabels[index] === label);
  const starterHits = scenario.starters.map((starters, index) => {
    const body = bodies[index] ?? "";
    const hits = starters.filter((starter) => hasStarter(body, starter));
    return {
      slide: index + 1,
      hits: hits.length,
      total: starters.length,
      ok: hits.length > 0,
      missing: starters.filter((starter) => !hasStarter(body, starter)),
    };
  });
  const leakedFrameworkName = FRAMEWORK_NAMES.some((name) => {
    const safeName = name === scenario.name ? name : name;
    return normalize(output).includes(normalize(safeName));
  });
  return {
    labelsOk,
    labelCount: labels.length,
    expectedLabelCount: scenario.labels.length,
    starterSlidesOk: starterHits.every((hit) => hit.ok),
    weakStarterSlides: starterHits.filter((hit) => !hit.ok).map((hit) => hit.slide),
    leakedFrameworkName,
    hasFollowUp: output.includes(FOLLOW_UP),
    hasEmOrEnDash: /[—–]/.test(output),
    hasCommaNotContrast: /[A-Za-z][^.\n]{2,80},\s+not\s+[^.\n]{2,80}/i.test(output),
    hasObservedBadLine: /What actually moves things forward is|evidence,\s+not\s+information/i.test(output),
  };
}

await loadEnv();
await mkdir(OUT_DIR, { recursive: true });

const systemBase = await loadSystemPrompt();
const client = new Anthropic({
  apiKey: process.env.MENTOR_API_KEY,
  baseURL: (process.env.MENTOR_API_URL ?? "").replace(/\/v1\/?$/, ""),
});

const overall = [];

for (const scenario of SCENARIOS) {
  const scenarioDir = resolve(OUT_DIR, scenario.slug);
  await mkdir(scenarioDir, { recursive: true });
  const { block, dynamic } = await buildKbContext(scenario.prompt);
  const system = `${systemBase}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${block}`;
  const index = [
    `Framework: ${scenario.name}`,
    `Prompt:\n${scenario.prompt}`,
    "",
    "Top retrieved chunks:",
    ...dynamic.map((chunk) => `- ${Number(chunk.similarity).toFixed(3)} ${chunk.section_path}`),
    "",
  ];
  console.log(`\n=== ${scenario.name} ===`);
  for (let i = 1; i <= 6; i += 1) {
    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: scenario.prompt }],
      });
      const output = response.content[0]?.type === "text" ? response.content[0].text : "";
      const fileName = `run-${String(i).padStart(2, "0")}.md`;
      await writeFile(resolve(scenarioDir, fileName), output, "utf8");
      const summary = audit(output, scenario);
      index.push(`${fileName}: ${JSON.stringify(summary)}`);
      overall.push({ framework: scenario.name, run: i, ...summary });
      console.log(`${fileName}: ${JSON.stringify(summary)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const blocked = { framework: scenario.name, run: i, blocked: true, message };
      index.push(`run-${String(i).padStart(2, "0")}.md: ${JSON.stringify(blocked)}`);
      overall.push(blocked);
      console.error(`Blocked on ${scenario.name} run ${i}: ${message}`);
      await writeFile(resolve(scenarioDir, "index.md"), `${index.join("\n")}\n`, "utf8");
      await writeFile(
        resolve(OUT_DIR, "summary.json"),
        `${JSON.stringify({ total: overall.length, blocked }, null, 2)}\n`,
        "utf8"
      );
      process.exitCode = 1;
      break;
    }
  }
  await writeFile(resolve(scenarioDir, "index.md"), `${index.join("\n")}\n`, "utf8");
  if (process.exitCode) break;
}

const failures = overall.filter(
  (item) =>
    item.blocked ||
    !item.labelsOk ||
    !item.starterSlidesOk ||
    item.leakedFrameworkName ||
    !item.hasFollowUp ||
    item.hasEmOrEnDash ||
    item.hasCommaNotContrast ||
    item.hasObservedBadLine
);

await writeFile(
  resolve(OUT_DIR, "summary.json"),
  `${JSON.stringify({ total: overall.length, failures }, null, 2)}\n`,
  "utf8"
);

console.log(`\nSaved outputs to ${OUT_DIR}`);
console.log(`Total runs: ${overall.length}`);
console.log(`Flagged runs: ${failures.length}`);
