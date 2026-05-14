// TikTok-focused chat test. Mirrors test-kb-chat.mjs (same retrieval, same
// SYSTEM_PROMPT loaded from src/app/api/chat/route.ts), but every scenario
// is designed to probe one section of Tiktok.md. Each scenario has an
// `expect` array of phrases / regexes the answer should hit if it's truly
// grounded in the KB. Scores are printed at the end.
//
// Usage:  node scripts/test-tiktok-chat.mjs

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
  const d = await res.json();
  return d.data[0].embedding;
}

async function rpc(fn, args) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fn}`;
  const res = await fetch(url, {
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
  const delays = [2000, 4000, 8000, 16000, 30000];
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

async function callGrok(systemPrompt, messages) {
  return withBackoff(async () => {
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
      }),
    });
    if (!res.ok) throw new Error(`grok: ${res.status} ${(await res.text()).slice(0, 200)}`);
    const d = await res.json();
    return d.choices[0].message.content;
  }, "grok-call");
}

// Each scenario:
//   probes  – the TikTok.md section it targets (for the report)
//   messages – chat history; last message is the user prompt
//   expect  – array of { name, test } predicates the reply should satisfy.
//             "test" is a regex applied case-insensitively to the reply.
//   reject  – array of { name, test } predicates the reply must NOT match.
const SCENARIOS = [
  {
    name: "Native audio: repost Instagram reel to TikTok?",
    probes: "4.1 / 4.2.1 Native Behaviour",
    messages: [
      { role: "user", content: "I'm thinking of just downloading my best Instagram reels and reuploading them to TikTok. The audios were originals I made in Reels. Will that work?" },
    ],
    expect: [
      { name: "warns against imported / original audio", test: /(imported|original audio|came from another|repurpos)/i },
      { name: "mentions native / trending audio", test: /(native|trending audio|sounds? (already )?(moving|circulating))/i },
      { name: "mentions distribution/algorithm consequence", test: /(distribution|algorithm|reach|for you page|fyp|categoris|footprint)/i },
    ],
    reject: [
      { name: "no em dash", test: /—/ },
      { name: "no en dash", test: /–/ },
    ],
  },
  {
    name: "Trends: should I just copy a trend?",
    probes: "4.2.2 Trends Only Work If You Adapt Them",
    messages: [
      { role: "user", content: "Everyone in my niche is doing the same trending TikTok dance/format right now. Should I just copy it exactly so I ride the wave?" },
    ],
    expect: [
      { name: "says adapt / twist it", test: /(adapt|twist|specific|relevance|your (niche|industry|audience))/i },
      { name: "explains familiarity vs specificity", test: /(familiar|recogni[sz]e|blend|drowned|cuts? through|invisible)/i },
    ],
    reject: [
      { name: "doesn't recommend pure copying", test: /\b(just )?copy (it )?exactly\b/i },
      { name: "no em dash", test: /—/ },
    ],
  },
  {
    name: "Talking head vs heavy edits",
    probes: "4.2.3 Talking Head Disrupts The Feed",
    messages: [
      { role: "user", content: "I hate being on camera. I'd rather just do heavily edited B-roll videos with text overlays for TikTok. Is that okay?" },
    ],
    expect: [
      { name: "values talking head / face to camera", test: /(talking head|face|eye contact|direct address|straight to camera)/i },
      { name: "explains attention / retention reason", test: /(stop scrolls?|interrupt|attention|retention|trust|human)/i },
    ],
    reject: [
      { name: "no em dash", test: /—/ },
    ],
  },
  {
    name: "Hook help",
    probes: "4.2.4 Hook Strength Determines Everything",
    messages: [
      { role: "user", content: "My TikTok views are stuck around 200. I'm a women's hormone health coach. What do I need to fix in my opening seconds?" },
    ],
    expect: [
      { name: "names the hook / first seconds", test: /(hook|first (few )?seconds|opening|front[- ]load)/i },
      { name: "talks retention / micro-tests / drop-off", test: /(retention|test|drop[- ]?off|watch time|completion|push)/i },
      { name: "gives a hook style (frustration / reframe / quiet thing)", test: /(frustration|reframe|quiet thing|tension|wait,? what)/i },
    ],
    reject: [
      { name: "no em dash", test: /—/ },
    ],
  },
  {
    name: "Post then go live",
    probes: "4.2.5 / 4.2.6 Post, Then Go Live",
    messages: [
      { role: "user", content: "Does going live on TikTok actually do anything for my regular posts, or is it a separate thing?" },
    ],
    expect: [
      { name: "links live to post distribution", test: /(post.*(then |before |and (then )?)?go(ing)? live|live after post|push.*(post|video)|entry point|momentum)/i },
      { name: "explains TikTok's incentive (gifts / monetisation / time on app)", test: /(gift|monetisation|monetization|revenue|time on (app|platform))/i },
      { name: "mentions community / trust / depth", test: /(community|trust|depth|loyal|parasocial|real[- ]time)/i },
    ],
    reject: [
      { name: "no em dash", test: /—/ },
    ],
  },
  {
    name: "Posting frequency",
    probes: "4.2.9 Posting Frequency Matters",
    messages: [
      { role: "user", content: "How often should I actually be posting on TikTok if I'm serious about growing? I'm doing about 2 a week right now." },
    ],
    expect: [
      { name: "recommends 1-3/day cadence", test: /(1[\s-]*(to|–|-)\s*3|one[\s-]*(to|-)\s*three|daily|every day|each day)/i },
      { name: "mentions data / categorisation / volume", test: /(data|volume|categoris|signal|algorithm|chances|iterat)/i },
    ],
    reject: [
      { name: "doesn't say 'once a week is fine'", test: /(once a week|one (post )?(a|per) week).{0,40}(fine|enough|plenty)/i },
      { name: "no em dash", test: /—/ },
    ],
  },
  {
    name: "Repeatable formats",
    probes: "4.2.10 Repeatable Formats Win",
    messages: [
      { role: "user", content: "Should every TikTok I make look different and fresh, or should I keep the same setup, framing and format each time?" },
    ],
    expect: [
      { name: "recommends repeatable / consistent format", test: /(repeatable|repetition|consisten|pattern recognition|same (setup|framing|angle|room))/i },
      { name: "explains why (familiarity / friction / habit)", test: /(familiar|friction|habit|train|expect|loyal|stop[- ]?scroll)/i },
    ],
    reject: [
      { name: "no em dash", test: /—/ },
    ],
  },
  {
    name: "Sound and captions",
    probes: "4.2.11 Sound Behaviour Is Different To Instagram",
    messages: [
      { role: "user", content: "On Instagram I always assume people watch on mute and add big captions. Should I do the same for TikTok?" },
    ],
    expect: [
      { name: "notes TikTok is sound-on by default", test: /(sound[- ]?on|sound is on|with sound|audio on)/i },
      { name: "contrasts with Instagram (silence first)", test: /(instagram|mute|silence)/i },
      { name: "captions are helpful but not essential", test: /(helpful|not (essential|always|required)|accessibility|clarity)/i },
    ],
    reject: [
      { name: "no em dash", test: /—/ },
    ],
  },
  {
    name: "Delete underperforming video?",
    probes: "4.2.13 Don't Delete Too Quickly",
    messages: [
      { role: "user", content: "I posted a TikTok 6 hours ago and it's only got 80 views. Should I just delete it and try again?" },
    ],
    expect: [
      { name: "tells them not to delete early", test: /(don'?t delete|leave it|let it (breathe|sit|run)|reset (the )?data|second (chance|wave))/i },
      { name: "explains delayed distribution / pockets", test: /(delay|hours|day|pocket|second (test|wave)|re[- ]?tested?)/i },
    ],
    reject: [
      { name: "doesn't recommend deleting", test: /(yes,?\s+(just\s+)?delete|delete it (and|then))/i },
      { name: "no em dash", test: /—/ },
    ],
  },
  {
    name: "Mindset / iteration",
    probes: "4.2.14 Mindset Shift",
    messages: [
      { role: "user", content: "I post a TikTok and stress for the next 24 hours about how it's performing. It's killing my motivation. Any mindset advice?" },
    ],
    expect: [
      { name: "frames TikTok as iteration / feedback loop", test: /(iterat|feedback loop|post,? learn|adjust|repeat|volume game)/i },
      { name: "decouples self-worth from one post", test: /(not perfection|one (post|video)|emotion|validation|data|signal)/i },
    ],
    reject: [
      { name: "no em dash", test: /—/ },
    ],
  },
  {
    name: "TikTok script deliverable (imposter syndrome)",
    probes: "4.2.1 + 4.2.5 + 4.2.10 — script must close with How to ship this",
    messages: [
      { role: "user", content: "Give me an idea for a TikTok reel." },
      { role: "assistant", content: "What's the goal for this TikTok, building awareness around your 'Value Unlocked' course, or driving a quick tip on overcoming imposter syndrome? And who's the audience, women in their 30s feeling stuck?" },
      { role: "user", content: "Let's do it on imposter syndrome instead. Script the full thing, 15 seconds, talking head." },
    ],
    expect: [
      { name: "delivers an actual script (quoted or beat-paced copy)", test: /(["“][^"”]{20,}["”]|0[\s-]*3\s*sec|hook[: ])/i },
      { name: "talking head / spoken VO referenced", test: /(talking head|voice ?over|spoken|to camera)/i },
      { name: "has a How to ship this block", test: /how to ship this/i },
      { name: "ship block: trending audio mention", test: /trending\s+(\w+\s+)?(audio|sound)/i },
      { name: "ship block: repeatable / series", test: /(repeatable|series|recurring|format|installment|first (of|in) a)/i },
      { name: "ship block: post then go live", test: /(go live|live (within|after)|post.*then.*live)/i },
    ],
    reject: [
      { name: "no em dash", test: /—/ },
      { name: "doesn't invent specific song names", test: /\b(taylor swift|bad bunny|olivia rodrigo|use the song ['"][^'"]+['"])/i },
    ],
  },
  {
    name: "Stories on TikTok",
    probes: "4.2.8 Use Stories Properly",
    messages: [
      { role: "user", content: "Are TikTok stories even worth bothering with? Nobody seems to use them." },
    ],
    expect: [
      { name: "says yes, they're underutilised", test: /(under[- ]?utilis|underused|worth|less (saturated|competition)|absolutely|definitely)/i },
      { name: "suggests a cadence or use case", test: /(three|3 a day|behind[- ]the[- ]scenes|real[- ]time|mid[- ]?day|present)/i },
    ],
    reject: [
      { name: "no em dash", test: /—/ },
    ],
  },
];

function audit(reply, expect = [], reject = []) {
  const passes = [];
  const fails = [];
  for (const e of expect) {
    if (e.test.test(reply)) passes.push(e.name);
    else fails.push(`MISSED: ${e.name}`);
  }
  for (const r of reject) {
    if (r.test.test(reply)) fails.push(`VIOLATED: ${r.name}`);
    else passes.push(`clean: ${r.name}`);
  }
  return { passes, fails, score: passes.length, total: expect.length + reject.length };
}

async function runScenario(systemPromptBase, sc) {
  const lastUser = [...sc.messages].reverse().find((m) => m.role === "user").content;
  console.log(`\n${"=".repeat(80)}\nSCENARIO: ${sc.name}\nDoc section: ${sc.probes}\nQuery: ${lastUser}\n${"=".repeat(80)}`);

  const { rules, dynamic } = await buildKbContext(lastUser);
  const tiktokRetrieved = dynamic.filter((d) => /tiktok/i.test(d.section_path));
  console.log(`\n[Retrieval] top ${dynamic.length} dynamic chunks, ${tiktokRetrieved.length} are TikTok-section:`);
  for (const m of dynamic) {
    const flag = /tiktok/i.test(m.section_path) ? "  ✓TK" : "     ";
    console.log(`  ${flag} ${m.similarity.toFixed(3)}  ${m.section_path}`);
  }

  const kbBlock = `### Writing Rules (Section 1, ALWAYS APPLY — quote verbatim)\n\n${formatChunks(rules)}\n\n---\n\n### Most relevant frameworks / strategies for this query\n\n${formatChunks(dynamic)}`;
  const systemPrompt = `${systemPromptBase}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${kbBlock}`;

  const reply = await callGrok(systemPrompt, sc.messages);
  console.log(`\n[Reply]\n${reply}\n`);

  const audit_ = audit(reply, sc.expect, sc.reject);
  console.log(`[Audit] score ${audit_.score}/${audit_.total}`);
  for (const p of audit_.passes) console.log(`   ✓ ${p}`);
  for (const f of audit_.fails) console.log(`   ✗ ${f}`);

  return { name: sc.name, probes: sc.probes, retrieval: { tiktok: tiktokRetrieved.length, total: dynamic.length }, ...audit_ };
}

(async () => {
  await loadEnv();
  const sys = await loadChatSystemPrompt();
  console.log(`Loaded chat SYSTEM_PROMPT (${sys.length} chars). Running ${SCENARIOS.length} TikTok scenarios…`);
  const results = [];
  let idx = 0;
  for (const sc of SCENARIOS) {
    if (idx++ > 0) await sleep(1500);
    try {
      results.push(await runScenario(sys, sc));
    } catch (err) {
      console.error(`\nScenario "${sc.name}" failed:`, err.message);
      results.push({ name: sc.name, probes: sc.probes, error: err.message });
    }
  }
  console.log(`\n${"=".repeat(80)}\nSUMMARY\n${"=".repeat(80)}`);
  for (const r of results) {
    if (r.error) {
      console.log(`  ERROR  ${r.name}  (${r.error})`);
      continue;
    }
    const tag = r.fails.length === 0 ? "PASS " : r.score >= (r.total - 1) ? "WARN " : "FAIL ";
    console.log(`  ${tag} ${r.score}/${r.total}  TK-retrieval ${r.retrieval.tiktok}/${r.retrieval.total}  ${r.probes}  — ${r.name}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
