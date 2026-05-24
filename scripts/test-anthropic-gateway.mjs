// Smoke-test the Anthropic Messages API through the mentor gateway.
// Verifies which Claude slugs are accepted and that streaming works.

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";

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

await loadEnv();

const apiKey = process.env.MENTOR_API_KEY;
const baseURL = (process.env.MENTOR_API_URL ?? "").replace(/\/v1\/?$/, "");
console.log(`baseURL: ${baseURL}`);
console.log(`apiKey: ${apiKey ? `set (${apiKey.length} chars)` : "MISSING"}\n`);

const client = new Anthropic({ apiKey, baseURL });

async function tryModel(model) {
  console.log(`--- ${model} (non-stream) ---`);
  try {
    const t0 = performance.now();
    const res = await client.messages.create({
      model,
      max_tokens: 64,
      system: "Reply with exactly the word: pong",
      messages: [{ role: "user", content: "ping" }],
    });
    const ms = (performance.now() - t0).toFixed(0);
    const text = res.content[0]?.type === "text" ? res.content[0].text : "";
    console.log(`  ok ${ms}ms  in=${res.usage?.input_tokens} out=${res.usage?.output_tokens}`);
    console.log(`  reply: ${JSON.stringify(text)}`);
  } catch (err) {
    console.log(`  FAIL: ${err.status ?? ""} ${err.message?.slice(0, 200)}`);
  }
}

async function tryStream(model) {
  console.log(`--- ${model} (stream) ---`);
  try {
    const t0 = performance.now();
    let buf = "";
    const stream = await client.messages.stream({
      model,
      max_tokens: 64,
      system: "Reply with exactly: pong-streamed",
      messages: [{ role: "user", content: "ping" }],
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        buf += event.delta.text;
      }
    }
    const ms = (performance.now() - t0).toFixed(0);
    console.log(`  ok ${ms}ms  text=${JSON.stringify(buf)}`);
  } catch (err) {
    console.log(`  FAIL: ${err.status ?? ""} ${err.message?.slice(0, 200)}`);
  }
}

for (const m of ["claude-opus-4-6", "claude-sonnet-4-6", "claude-sonnet-4-5", "claude-haiku-4-5"]) {
  await tryModel(m);
}
await tryStream("claude-sonnet-4-6");
