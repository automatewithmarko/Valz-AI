// Netlify Edge Function for the streaming chat endpoint.
//
// Why this exists: @netlify/plugin-nextjs v5.15.8 did NOT honour the
// `export const runtime = "edge"` in src/app/api/chat/route.ts on this
// project. The Next.js route kept deploying as a regular Netlify
// Function (visible as Lambda-style "Duration / Memory Usage" lines in
// the Functions log) and was killed at the wall-clock cap on long
// prompts where Mentor took 30s+ to send its first byte, producing the
// observed 504 Gateway Timeout.
//
// This file is a real Netlify Edge Function. It intercepts /api/chat
// at the CDN edge BEFORE the Next.js handler is invoked, so the
// runtime question is moot — we control the runtime directly. Edge
// functions have no wall-clock cap for streamed responses, which is
// the property we actually need.
//
// Routing is via the [[edge_functions]] block in netlify.toml. The
// Next.js route at src/app/api/chat/route.ts is kept in the repo as a
// fallback for local dev (and so type checks still pass on the
// shared imports), but in production it is unreachable for /api/chat.
//
// Carousel requests still pass through to the Next.js handler — they
// have the same architectural issue but the immediate failure is
// long streaming chat, so the carousel migration is a follow-up.

// Netlify Edge runs on Deno and flags `npm:` specifiers as experimental
// (build failed with "Support for npm modules in edge functions is an
// experimental feature"). esm.sh URL imports are Deno-native and the
// supported way to load npm packages in edge functions.
import { createServerClient } from "https://esm.sh/@supabase/ssr@0.9.0";

import { SYSTEM_PROMPT } from "../../src/lib/chat-system-prompt.ts";
import {
  isLikelyCarouselRequest,
  buildIdeationInstruction,
  parseIdeation,
  getCarouselTemplate,
  buildCarouselFillInstruction,
  parseLockedCarouselJson,
  validateLockedCarousel,
  renderLockedCarousel,
  findCarouselDuplication,
  type CarouselIdeation,
} from "../../src/lib/carousel-template-lock.ts";

// Mirror the production constants exactly so behaviour matches the
// Next.js route the user has been used to.
const CHARS_PER_CREDIT = 18_850;
const CHAT_MODEL = "atlas/deepseek-ai/deepseek-v4-pro";
const MENTOR_TIMEOUT_MS = 10 * 60 * 1000;
const STREAM_KEEPALIVE_MS = 15 * 1000;
// Carousel two-stage: DeepSeek ideates with full context, then Sonnet
// fills the locked template via Mentor's Anthropic-native endpoint.
const CAROUSEL_MODEL = "claude-sonnet-4-6";
const CAROUSEL_SYSTEM =
  "You fill the blanks of one locked Instagram carousel template using a strategist's ideation. Return only the JSON described in the user's instruction. No markdown, no commentary.";
// Sonnet costs ~13x DeepSeek per character; bill accordingly.
const SONNET_CREDIT_MULTIPLIER = 13;

const OPENAI_EMBEDDING_URL = "https://api.openai.com/v1/embeddings";
const EMBEDDING_MODEL = "text-embedding-3-large";
const EMBEDDING_DIMENSIONS = 1536;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type KbChunk = {
  id: string;
  section_path: string;
  heading: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

type BrandDnaDocMatch = {
  id: string;
  label: string;
  when_to_use: string | null;
  content_text: string | null;
  similarity: number;
};

function sanitizeUserFacingText(text: string): string {
  return text.replace(/[—–]/g, ", ").replace(/,\s+not\b/gi, " rather than");
}

function chatCompletionsUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/$/, "")}/chat/completions`;
}

function parseCookies(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    const name = pair.slice(0, eq).trim();
    const value = decodeURIComponent(pair.slice(eq + 1).trim());
    if (name) result[name] = value;
  }
  return result;
}

// Inlined embed/KB logic so this file doesn't depend on src/lib/kb-retrieval.ts
// (which reads process.env directly; safer to use Deno.env.get explicitly here).
async function embedQuery(text: string): Promise<number[] | null> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return null;
  const trimmed = text.trim().slice(0, 8000);
  if (!trimmed) return null;
  const res = await fetch(OPENAI_EMBEDDING_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: trimmed,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });
  if (!res.ok) {
    console.error("KB embed failed", res.status, (await res.text()).slice(0, 240));
    return null;
  }
  const data = await res.json();
  return data?.data?.[0]?.embedding ?? null;
}

function formatKbChunks(chunks: KbChunk[]): string {
  return chunks
    .map((c) => {
      const meta = c.metadata as { framework_name?: string; section_type?: string };
      const tag = meta.framework_name
        ? `[FRAMEWORK: ${meta.framework_name}]`
        : meta.section_type
          ? `[${String(meta.section_type).toUpperCase()}]`
          : "";
      return `### ${c.section_path} ${tag}\n\n${c.content}`;
    })
    .join("\n\n---\n\n");
}

// deno-lint-ignore no-explicit-any
async function buildKbContext(supabase: any, userQuery: string, topK = 6): Promise<string | null> {
  const embedding = await embedQuery(userQuery);
  if (!embedding) return null;
  const [matchRes, rulesRes] = await Promise.all([
    supabase.rpc("match_kb_chunks", {
      query_embedding: embedding,
      match_count: topK,
      similarity_threshold: 0.2,
      metadata_filter: {},
    }),
    supabase.rpc("match_kb_chunks", {
      query_embedding: embedding,
      match_count: 20,
      similarity_threshold: 0,
      metadata_filter: { section_type: "rules" },
    }),
  ]);
  const matched: KbChunk[] = (matchRes.data ?? []) as KbChunk[];
  const rules: KbChunk[] = (rulesRes.data ?? []) as KbChunk[];
  const ruleIds = new Set(rules.map((r) => r.id));
  const dynamic = matched.filter((m) => !ruleIds.has(m.id));
  if (rules.length === 0 && dynamic.length === 0) return null;
  const parts: string[] = [];
  if (rules.length > 0) {
    parts.push(`### Writing Rules (Section 1, ALWAYS APPLY — quote verbatim)\n\n${formatKbChunks(rules)}`);
  }
  if (dynamic.length > 0) {
    parts.push(
      `### Most relevant frameworks / strategies for this query (ranked by similarity)\n\n${formatKbChunks(dynamic)}`
    );
  }
  return parts.join("\n\n---\n\n");
}

// deno-lint-ignore no-explicit-any
async function matchBrandDnaDocs(
  supabase: any,
  userId: string,
  query: string,
  opts: { matchCount?: number; threshold?: number; brandDnaId?: string | null } = {}
): Promise<BrandDnaDocMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const embedding = await embedQuery(trimmed);
  if (!embedding) return [];
  const { data, error } = await supabase.rpc("match_brand_dna_documents", {
    p_user_id: userId,
    query_embedding: embedding,
    match_count: opts.matchCount ?? 4,
    similarity_threshold: opts.threshold ?? 0.3,
    p_brand_dna_id: opts.brandDnaId ?? null,
  });
  if (error) {
    console.warn("matchBrandDnaDocs failed", error.message);
    return [];
  }
  return (data ?? []) as BrandDnaDocMatch[];
}

function formatDocsForPrompt(docs: BrandDnaDocMatch[]): string {
  return docs
    .filter((d) => d.content_text)
    .map(
      (d) => `### ${d.label}
When to use: ${d.when_to_use ?? "(no guidance provided)"}

---
${d.content_text}
---`
    )
    .join("\n\n");
}

// Netlify Edge Function entry point.
// deno-lint-ignore no-explicit-any
export default async (req: Request, _context: any) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const reqId = crypto.randomUUID().slice(0, 8);
  const t0 = Date.now();
  const log = (stage: string, extra?: Record<string, unknown>) => {
    const elapsed = Date.now() - t0;
    const tail = extra ? ` ${JSON.stringify(extra)}` : "";
    console.log(`[chat-edge ${reqId}] +${elapsed}ms ${stage}${tail}`);
  };
  log("route_enter");

  const supabaseUrl = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const apiKey = Deno.env.get("MENTOR_API_KEY");
  const apiUrl = Deno.env.get("MENTOR_API_URL");
  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!apiKey || !apiUrl) {
    return new Response(JSON.stringify({ error: "Mentor API not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Supabase auth via cookies from the request. The custom cookies
  // handler reads from the parsed cookie header; setAll is a no-op
  // because this endpoint returns a stream, not a normal response that
  // can carry refreshed cookies.
  const cookies = parseCookies(req.headers.get("cookie") ?? "");
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return Object.entries(cookies).map(([name, value]) => ({ name, value }));
      },
      setAll() {
        /* no-op */
      },
    },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    log("auth_fail", { authError: authError?.message });
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  log("auth_ok", { user: user.id });

  const { data: credits } = await supabase
    .from("credits")
    .select("balance")
    .eq("user_id", user.id)
    .single();
  log("credits_loaded", { balance: credits?.balance });
  if (!credits || credits.balance <= 0) {
    return new Response(
      JSON.stringify({ error: "Insufficient credits", code: "INSUFFICIENT_CREDITS" }),
      { status: 402, headers: { "Content-Type": "application/json" } }
    );
  }

  const { messages } = (await req.json()) as {
    messages: { role: string; content: string }[];
  };
  const totalHistoryChars = messages.reduce(
    (sum, m) => sum + (m.content?.length ?? 0),
    0
  );
  log("body_parsed", {
    messages: messages.length,
    historyChars: totalHistoryChars,
  });

  const lastUserMessage =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
  const isCarousel = !!lastUserMessage && isLikelyCarouselRequest(lastUserMessage);
  log("intent", { isCarousel });

  const tBrandDna = Date.now();
  const { data: selectedBrand } = await supabase
    .from("brand_dnas")
    .select("id, blueprint_content, brand_name")
    .eq("user_id", user.id)
    .eq("is_primary", true)
    .maybeSingle();
  const brandDna = selectedBrand?.blueprint_content ? selectedBrand : null;
  const selectedBrandId = selectedBrand?.id ?? null;
  log("brand_dna_loaded", {
    ms: Date.now() - tBrandDna,
    blueprintChars: brandDna?.blueprint_content?.length ?? 0,
  });

  const tKb = Date.now();
  const [kbContext, matchedDocs, unembeddedDocsRes] = await Promise.all([
    lastUserMessage ? buildKbContext(supabase, lastUserMessage, 6) : Promise.resolve(null),
    lastUserMessage
      ? matchBrandDnaDocs(supabase, user.id, lastUserMessage, { brandDnaId: selectedBrandId })
      : Promise.resolve([]),
    selectedBrandId
      ? supabase
          .from("brand_dna_documents")
          .select("label, when_to_use, content_text")
          .eq("user_id", user.id)
          .eq("brand_dna_id", selectedBrandId)
          .is("when_to_use_embedding", null)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] }),
  ]);
  const unembeddedDocs =
    (unembeddedDocsRes.data ?? []) as {
      label: string;
      when_to_use: string | null;
      content_text: string | null;
    }[];
  log("kb_loaded", {
    ms: Date.now() - tKb,
    kbContextChars: kbContext?.length ?? 0,
    matchedDocs: matchedDocs.length,
    unembeddedDocs: unembeddedDocs.length,
  });

  // Assemble the full system prompt: base prompt + Blueprint + main KB + user docs.
  let systemPrompt = SYSTEM_PROMPT;
  if (brandDna?.blueprint_content) {
    systemPrompt += `

## THE USER'S ALIGNED INCOME BLUEPRINT (BRAND DNA)

The user has already completed their Aligned Income Blueprint. This is their complete brand strategy, Human Design reading, audience profile, product direction, content plan, and monetisation roadmap. You MUST use this as your knowledge base for every conversation. Do NOT ask questions about things that are already covered in the blueprint below. Reference their specific details (brand name, audience, product, Human Design type, authority, profile) naturally.

If the user asks for help with something covered in their blueprint (content strategy, brand voice, audience targeting, product development, pricing, etc.), use the specific details from their blueprint, not generic advice.

---
${brandDna.blueprint_content}
---`;
  }
  if (kbContext) {
    systemPrompt += `

## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)

${kbContext}`;
  }
  const retrievedBlock = formatDocsForPrompt(matchedDocs);
  const legacyBlock = unembeddedDocs
    .filter((d) => d.content_text)
    .map(
      (d) => `### ${d.label}
When to use: ${d.when_to_use ?? "(no guidance provided)"}

---
${d.content_text}
---`
    )
    .join("\n\n");
  const docsBlock = [retrievedBlock, legacyBlock].filter(Boolean).join("\n\n");
  if (docsBlock) {
    systemPrompt += `

## THE USER'S SUPPLEMENTARY KNOWLEDGE BASES (USER-UPLOADED)

The user has uploaded the reference documents below in addition to their Aligned Income Blueprint. They are **supplementary context for this specific user's world** — examples, swipes, brand voice samples, niche references — not framework or writing-rule sources.

Hard rules for using this block:
- The "## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)" section above remains the ground truth for every framework choice, every Plug-and-Play structure, every slide/beat label, and every writing rule. Nothing in this user-uploaded block overrides, replaces, or competes with it.
- Use the user-uploaded docs only as background context for *this user's* niche, voice, or examples — to make the framework-based deliverable feel personal and specific. Never lift slide structures, framework names, or writing-rule guidance from a user-uploaded doc.
- Each doc carries a "When to use" hint. The docs below were already filtered by similarity against that hint. Still, if a doc doesn't actually fit the live question, set it aside silently.
- Do not mention these documents unless the user asks about them directly.

${docsBlock}`;
  }

  let inputChars =
    systemPrompt.length +
    messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);
  let outputChars = 0;
  // Sonnet-attributable chars are billed at SONNET_CREDIT_MULTIPLIER
  // times the DeepSeek rate. Only the carousel Stage 2 (template fill)
  // adds to this; the streaming chat path leaves it at zero.
  let sonnetChars = 0;
  let deducted = false;

  const chatMessages: ChatMessage[] = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const completionUrl = chatCompletionsUrl(apiUrl);
  const encoder = new TextEncoder();

  const deductCredits = async () => {
    if (deducted) return;
    deducted = true;
    const totalChars =
      inputChars + outputChars + sonnetChars * SONNET_CREDIT_MULTIPLIER;
    const creditsToDeduct = totalChars / CHARS_PER_CREDIT;
    try {
      await supabase.rpc("deduct_credits", {
        user_uuid: user.id,
        credit_amount: creditsToDeduct,
      });
    } catch (err) {
      console.error("Failed to deduct credits:", err);
    }
  };

  // Anthropic-format URL for the Sonnet carousel-fill stage. The
  // legacy Next.js route used the Anthropic SDK with
  // `baseURL: apiUrl.replace(/\/v1\/?$/, "")`; the SDK then appends
  // `/v1/messages`. We replicate that exact final URL here so the
  // Mentor gateway routes to the same Anthropic-native endpoint.
  const anthropicMessagesUrl = `${apiUrl.replace(/\/v1\/?$/, "")}/v1/messages`;

  // Build a one-shot SSE frame string used by both the carousel path
  // (single rendered output) and the early-exit error messages. Counts
  // chars against the right bucket so credit billing stays accurate.
  const buildOneShotFrame = (text: string, opts?: { sonnet?: boolean }) => {
    const sanitized = sanitizeUserFacingText(text);
    if (opts?.sonnet) sonnetChars += sanitized.length;
    else outputChars += sanitized.length;
    return `data: ${JSON.stringify({
      choices: [{ delta: { content: sanitized } }],
    })}\n\n`;
  };

  let pendingText = "";
  const flushText = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    text: string
  ) => {
    const sanitizedText = sanitizeUserFacingText(text);
    if (!sanitizedText) return;
    outputChars += sanitizedText.length;
    const frame = `data: ${JSON.stringify({
      choices: [{ delta: { content: sanitizedText } }],
    })}\n\n`;
    controller.enqueue(encoder.encode(frame));
  };

  const sseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Flush a comment immediately so headers go out within ~1s. This
      // is what keeps the connection alive while Mentor is still
      // composing its (potentially slow) first byte.
      controller.enqueue(encoder.encode(": connected\n\n"));
      log("stream_start");

      const upstreamController = new AbortController();
      const upstreamTimeout = setTimeout(() => {
        upstreamController.abort("Mentor API timed out after 10 minutes.");
      }, MENTOR_TIMEOUT_MS);
      const keepalive = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, STREAM_KEEPALIVE_MS);

      const decoder = new TextDecoder();
      let buffer = "";
      let firstChunkLogged = false;
      const tFetch = Date.now();

      try {
        if (isCarousel) {
          // ---- Carousel two-stage path ----
          //
          // Stage 1: DeepSeek ideation. Reuses the full system prompt
          // (Blueprint + KB + user docs) and chat history so the model
          // picks the right framework for THIS user's situation.
          const ideationInstruction = buildIdeationInstruction();
          let ideation: CarouselIdeation | null = null;
          for (let attempt = 0; attempt < 2 && !ideation; attempt += 1) {
            inputChars += ideationInstruction.length;
            log("carousel_ideation_attempt", { attempt });
            const res = await fetch(completionUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: CHAT_MODEL,
                max_tokens: 4096,
                stream: false,
                messages: [
                  { role: "system", content: systemPrompt },
                  ...chatMessages,
                  { role: "user", content: ideationInstruction },
                ],
              }),
              signal: upstreamController.signal,
            });
            if (!res.ok) {
              const errBody = await res.text();
              log("carousel_ideation_http_error", {
                status: res.status,
                body: errBody.slice(0, 240),
              });
              throw new Error(`Mentor API ${res.status}: ${errBody}`);
            }
            const completion = await res.json();
            const raw = completion.choices?.[0]?.message?.content ?? "";
            outputChars += raw.length;
            ideation = parseIdeation(raw);
          }
          log("carousel_ideation_done", {
            framework: ideation?.framework ?? null,
          });

          if (!ideation) {
            controller.enqueue(
              encoder.encode(
                buildOneShotFrame(
                  "I need one more detail before I can draft this carousel. Tell me a bit more about the specific angle or result you'd like to feature."
                )
              )
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            return;
          }

          const template = getCarouselTemplate(ideation.framework);
          if (!template) {
            // framework === "" (model needs clarification) or unknown id.
            controller.enqueue(
              encoder.encode(
                buildOneShotFrame(
                  ideation.angle?.trim() ||
                    "Before I draft this, tell me a bit more about the specific angle or result you'd like to feature."
                )
              )
            );
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            return;
          }

          // Stage 2: Sonnet fills the locked Plug-and-Play template as
          // JSON; we render the locked wording verbatim. Validation
          // drives up to 3 attempts before falling back.
          let validationErrors: string[] = [];
          let previousJson = "";
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const fillInstruction = buildCarouselFillInstruction(
              template,
              ideation,
              lastUserMessage,
              validationErrors,
              previousJson
            );
            sonnetChars += CAROUSEL_SYSTEM.length + fillInstruction.length;
            log("carousel_fill_attempt", { attempt });
            const res = await fetch(anthropicMessagesUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                // The legacy Anthropic SDK sends x-api-key; we send
                // both x-api-key and Authorization so the Mentor
                // gateway routes correctly regardless of which header
                // it inspects.
                "x-api-key": apiKey,
                Authorization: `Bearer ${apiKey}`,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: CAROUSEL_MODEL,
                max_tokens: 2048,
                system: CAROUSEL_SYSTEM,
                messages: [{ role: "user", content: fillInstruction }],
              }),
              signal: upstreamController.signal,
            });
            if (!res.ok) {
              const errBody = await res.text();
              log("carousel_fill_http_error", {
                status: res.status,
                body: errBody.slice(0, 240),
              });
              throw new Error(
                `Mentor /v1/messages ${res.status}: ${errBody}`
              );
            }
            const completion = await res.json();
            const raw =
              (completion.content as { type: string; text?: string }[] | undefined)
                ?.find((block) => block.type === "text")?.text ?? "";
            previousJson = raw;

            try {
              const parsed = parseLockedCarouselJson(raw);
              const validation = validateLockedCarousel(parsed);
              if (validation.ok) {
                const rendered = renderLockedCarousel(parsed);
                const dup = findCarouselDuplication(rendered);
                if (!dup) {
                  log("carousel_done", { renderedChars: rendered.length });
                  controller.enqueue(
                    encoder.encode(
                      buildOneShotFrame(rendered, { sonnet: true })
                    )
                  );
                  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                  return;
                }
                validationErrors = [
                  `A blank included the template's own words and produced a repeated phrase: "${dup}". Put only the missing value in that blank.`,
                ];
              } else {
                validationErrors = validation.errors;
              }
            } catch (err) {
              validationErrors = [
                `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
              ];
            }
          }

          // Validation failed after all retries — rare.
          log("carousel_validation_exhausted");
          controller.enqueue(
            encoder.encode(
              buildOneShotFrame(
                "I couldn't fit this cleanly into the template just now. Want me to try again, or tweak the angle?"
              )
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          return;
        }

        // ---- Streaming chat path (default) ----
        log("upstream_request", { model: CHAT_MODEL });
        const streamResponse = await fetch(completionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: CHAT_MODEL,
            max_tokens: 4096,
            stream: true,
            messages: [
              { role: "system", content: systemPrompt },
              ...chatMessages,
            ],
          }),
          signal: upstreamController.signal,
        });
        log("upstream_headers", {
          ms: Date.now() - tFetch,
          status: streamResponse.status,
        });

        if (!streamResponse.ok) {
          const errBody = await streamResponse.text();
          log("upstream_error_body", {
            status: streamResponse.status,
            body: errBody.slice(0, 240),
          });
          throw new Error(`Mentor API ${streamResponse.status}: ${errBody}`);
        }
        if (!streamResponse.body) {
          throw new Error("Mentor API returned an empty stream.");
        }

        const reader = streamResponse.body.getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!firstChunkLogged) {
            log("upstream_first_chunk", { ms: Date.now() - tFetch });
            firstChunkLogged = true;
          }
          buffer += decoder.decode(value, { stream: true });
          let lineEnd: number;
          while ((lineEnd = buffer.indexOf("\n")) !== -1) {
            const line = buffer.slice(0, lineEnd).trim();
            buffer = buffer.slice(lineEnd + 1);
            if (!line.startsWith("data:")) continue;
            const data = line.slice(5).trim();
            if (!data) continue;
            if (data === "[DONE]") {
              flushText(controller, pendingText);
              pendingText = "";
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              log("stream_done", { outputChars });
              return;
            }
            const event = JSON.parse(data);
            const text = event.choices?.[0]?.delta?.content ?? "";
            if (text) {
              pendingText += text;
              if (pendingText.length > 160) {
                flushText(controller, pendingText.slice(0, -80));
                pendingText = pendingText.slice(-80);
              }
            }
          }
        }
        flushText(controller, pendingText);
        pendingText = "";
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        log("stream_done", { outputChars });
      } catch (err) {
        const msg = upstreamController.signal.aborted
          ? "Mentor API timed out after 10 minutes."
          : err instanceof Error
            ? err.message
            : String(err);
        log("stream_error", { msg: msg.slice(0, 240) });
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`)
        );
      } finally {
        clearTimeout(upstreamTimeout);
        clearInterval(keepalive);
        await deductCredits();
        controller.close();
      }
    },
    cancel() {
      log("stream_cancel");
      void deductCredits();
    },
  });

  req.signal.addEventListener("abort", () => {
    log("client_abort");
    void deductCredits();
  });

  log("response_returned", { systemPromptChars: systemPrompt.length });
  return new Response(sseBody, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
};

export const config = {
  path: "/api/chat",
};
