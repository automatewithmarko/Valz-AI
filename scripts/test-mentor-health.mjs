// Health check for the production mentor API gateway.
//
// Runs a small, ramped probe:
//   1. Reachability — DNS + TLS handshake to the base URL.
//   2. Lightweight ping — one chat completion with a tiny prompt.
//   3. Realistic load — one chat completion shaped like the production
//      payload (large system prompt + KB-like preamble).
//   4. Sequential burst — five back-to-back small calls to surface
//      transient capacity / rate-limit behaviour.
//
// Reports per-call latency, HTTP status, body excerpt on error, and a
// rolling success/error tally. Exit 0 if every call returned a 2xx
// response; exit 1 if any call failed.

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

function fmtMs(ms) {
  return `${ms.toFixed(0)}ms`;
}

async function call({ name, model, messages, timeoutMs = 60_000 }) {
  const apiKey = process.env.MENTOR_API_KEY;
  const apiUrl = process.env.MENTOR_API_URL;
  if (!apiKey || !apiUrl) throw new Error("MENTOR_API_KEY / MENTOR_API_URL missing");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  const start = performance.now();
  try {
    const res = await fetch(`${apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: false, max_tokens: 200 }),
      signal: controller.signal,
    });
    const elapsed = performance.now() - start;
    const bodyText = await res.text();
    let body = null;
    try { body = JSON.parse(bodyText); } catch { /* keep as text */ }

    const ok = res.ok;
    const reply = body?.choices?.[0]?.message?.content ?? "";
    const usage = body?.usage ?? null;
    const errorBody = ok ? null : (typeof body === "object" ? JSON.stringify(body).slice(0, 240) : bodyText.slice(0, 240));

    return {
      name,
      ok,
      status: res.status,
      elapsed,
      reply: reply.slice(0, 120),
      usage,
      errorBody,
    };
  } catch (err) {
    const elapsed = performance.now() - start;
    return {
      name,
      ok: false,
      status: 0,
      elapsed,
      reply: "",
      usage: null,
      errorBody: String(err?.message ?? err).slice(0, 240),
    };
  } finally {
    clearTimeout(t);
  }
}

function report(r) {
  const tag = r.ok ? "✓" : "✗";
  console.log(`  ${tag}  ${r.name.padEnd(28)}  ${String(r.status).padStart(3)}  ${fmtMs(r.elapsed).padStart(8)}  ${r.usage ? `tokens ${r.usage.prompt_tokens}/${r.usage.completion_tokens}` : ""}`);
  if (r.ok && r.reply) {
    console.log(`        reply: ${r.reply.replace(/\s+/g, " ").trim()}…`);
  }
  if (!r.ok) {
    console.log(`        error: ${r.errorBody}`);
  }
}

(async () => {
  await loadEnv();
  const apiUrl = process.env.MENTOR_API_URL;
  const model = "xai/grok-4-0709";
  console.log(`MENTOR_API_URL: ${apiUrl}`);
  console.log(`MENTOR_API_KEY: ${process.env.MENTOR_API_KEY ? `set (${process.env.MENTOR_API_KEY.length} chars)` : "MISSING"}`);
  console.log(`Model under test: ${model}\n`);

  const results = [];

  // 1. Reachability — DNS + TLS on the bare host. Some gateways return
  // 404 on the root path; that still tells us the host is alive.
  console.log("1) Reachability");
  const start = performance.now();
  try {
    const res = await fetch(apiUrl.replace(/\/v1\/?$/, "/"), {
      method: "GET",
      signal: AbortSignal.timeout(15_000),
    });
    const elapsed = performance.now() - start;
    console.log(`  ✓  host reachable                  ${String(res.status).padStart(3)}  ${fmtMs(elapsed).padStart(8)}`);
    results.push({ name: "reachability", ok: true });
  } catch (err) {
    const elapsed = performance.now() - start;
    console.log(`  ✗  host unreachable                ---  ${fmtMs(elapsed).padStart(8)}  ${String(err.message).slice(0, 100)}`);
    results.push({ name: "reachability", ok: false });
  }
  console.log();

  // 2. Lightweight ping — minimal payload, just confirms auth + model
  // routing works.
  console.log("2) Lightweight ping (tiny prompt)");
  const ping = await call({
    name: "tiny ping",
    model,
    messages: [{ role: "user", content: "Reply with exactly the word: pong" }],
  });
  report(ping);
  results.push({ name: "tiny ping", ok: ping.ok });
  console.log();

  // 3. Realistic load — system prompt + user message of the size the
  // real chat route sends (the chat SYSTEM_PROMPT is ~31k chars; we
  // simulate a smaller-but-representative ~8k system to keep tokens
  // bounded but exercise the gateway).
  console.log("3) Realistic-size payload");
  const fatSystem =
    "You are a careful, opinionated content strategist. Follow these rules:\n" +
    Array.from({ length: 60 }, (_, i) => `- Rule ${i + 1}: Stay grounded, be concise, do not paraphrase the knowledge base.`).join("\n");
  const realistic = await call({
    name: "realistic prompt",
    model,
    messages: [
      { role: "system", content: fatSystem },
      { role: "user", content: "Summarise in 2 sentences why a clear hook matters on TikTok." },
    ],
  });
  report(realistic);
  results.push({ name: "realistic prompt", ok: realistic.ok });
  console.log();

  // 4. Sequential burst — 5 small calls back to back, ~500ms apart.
  // Surfaces transient 429 / 5xx behaviour without truly hammering.
  console.log("4) Sequential burst x5 (500ms spacing)");
  for (let i = 1; i <= 5; i++) {
    const r = await call({
      name: `burst ${i}/5`,
      model,
      messages: [{ role: "user", content: `Say the number ${i} and nothing else.` }],
    });
    report(r);
    results.push({ name: `burst ${i}`, ok: r.ok });
    if (i < 5) await new Promise((res) => setTimeout(res, 500));
  }
  console.log();

  // Summary
  const total = results.length;
  const ok = results.filter((r) => r.ok).length;
  const fail = total - ok;
  console.log("─".repeat(60));
  console.log(`Health: ${ok}/${total} checks passed, ${fail} failed`);
  if (fail === 0) {
    console.log("→ Mentor gateway is healthy.");
  } else {
    console.log("→ Mentor gateway is degraded. Review failures above.");
    process.exit(1);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
