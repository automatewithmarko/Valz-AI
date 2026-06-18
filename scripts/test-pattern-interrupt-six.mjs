import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "scripts", ".test-outputs", "pattern-interrupt-six");

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

const USER_PROMPT =
  "Use the Pattern Interrupt Carousel framework. My audience is women with skills they could monetise, but they keep researching, saving reels, listening to podcasts, and taking free masterclasses instead of starting. The angle is that the research spiral looks like preparation, but underneath it is protection from the risk of being seen. Write the carousel. Just the slide copy, no visuals.";

const REQUIRED_SNIPPETS = [
  "Slide 1 - The Identity Call Out",
  "Slide 2 - Name the Fixations",
  "Slide 3 - The Core Principle",
  "Slide 4 - The Nuance",
  "Slide 5 - The Sharable Wrap",
  "Growth comes from",
  "Momentum builds when",
  "Real traction starts with",
  "Are there any tweaks you'd like to make to the above? Alternatively, would you like a supporting caption for this carousel?",
];

function quickSummary(output) {
  return {
    hasRequiredSnippets: REQUIRED_SNIPPETS.every((snippet) => output.includes(snippet)),
    hasBadObservedLine: /What actually moves things forward is/i.test(output),
    hasInventedEvidenceContrast: /evidence,\s+not\s+information/i.test(output),
    hasCommaNotContrast: /[A-Za-z][^.\n]{2,80},\s+not\s+[^.\n]{2,80}/i.test(output),
    hasEmOrEnDash: /[—–]/.test(output),
  };
}

await loadEnv();
await mkdir(OUT_DIR, { recursive: true });

const systemBase = await loadSystemPrompt();
const { block, dynamic } = await buildKbContext(USER_PROMPT);
const system = `${systemBase}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${block}`;

const client = new Anthropic({
  apiKey: process.env.MENTOR_API_KEY,
  baseURL: (process.env.MENTOR_API_URL ?? "").replace(/\/v1\/?$/, ""),
});

const index = [
  `Prompt:\n${USER_PROMPT}`,
  "",
  "Top retrieved chunks:",
  ...dynamic.map((chunk) => `- ${Number(chunk.similarity).toFixed(3)} ${chunk.section_path}`),
  "",
];

for (let i = 1; i <= 6; i += 1) {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: USER_PROMPT }],
  });
  const output = response.content[0]?.type === "text" ? response.content[0].text : "";
  const fileName = `run-${String(i).padStart(2, "0")}.md`;
  await writeFile(resolve(OUT_DIR, fileName), output, "utf8");
  const summary = quickSummary(output);
  index.push(`${fileName}: ${JSON.stringify(summary)}`);
  console.log(`${fileName}: ${JSON.stringify(summary)}`);
}

await writeFile(resolve(OUT_DIR, "index.md"), `${index.join("\n")}\n`, "utf8");
console.log(`\nSaved outputs to ${OUT_DIR}`);
