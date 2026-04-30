// Re-run just the Casual Conversation Close scenario with full reply.
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

(async () => {
  await loadEnv();
  const sys = (await readFile(resolve(ROOT, "src/app/api/chat/route.ts"), "utf8"))
    .match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/)[1];

  const prompt = "Use the Casual Conversation Close story framework. I'm a creative writing coach for novelists with day jobs, selling a $2,400 12-week intensive. I want a softer, conversational story sequence. Write it.";

  const embedRes = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({ model: "text-embedding-3-large", input: prompt, dimensions: 1536 }),
  });
  const embedding = (await embedRes.json()).data[0].embedding;

  const rpcCall = (fn, args) => fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
    body: JSON.stringify(args),
  }).then((r) => r.json());

  const [matched, rules] = await Promise.all([
    rpcCall("match_kb_chunks", { query_embedding: embedding, match_count: 6, similarity_threshold: 0.2, metadata_filter: {} }),
    rpcCall("match_kb_chunks", { query_embedding: embedding, match_count: 20, similarity_threshold: 0, metadata_filter: { section_type: "rules" } }),
  ]);
  const ruleIds = new Set(rules.map((r) => r.id));
  const dynamic = matched.filter((m) => !ruleIds.has(m.id));

  const fmt = (chunks) => chunks.map((c) => `### ${c.section_path}\n\n${c.content}`).join("\n\n---\n\n");
  const kbBlock = `### Writing Rules\n\n${fmt(rules)}\n\n---\n\n### Frameworks\n\n${fmt(dynamic)}`;

  const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.XAI_API_KEY}` },
    body: JSON.stringify({
      model: "grok-3-fast",
      messages: [
        { role: "system", content: `${sys}\n\n## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)\n\n${kbBlock}` },
        { role: "user", content: prompt },
      ],
      stream: false,
      max_tokens: 6000,
    }),
  });
  const reply = (await grokRes.json()).choices[0].message.content;
  console.log("=".repeat(80));
  console.log("REPLY");
  console.log("=".repeat(80));
  console.log(reply);
})();
