import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { buildKbContext } from "@/lib/kb-retrieval";
import {
  formatDocsForPrompt,
  matchBrandDnaDocs,
} from "@/lib/brand-dna-retrieval";
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
} from "@/lib/carousel-template-lock";
import { SYSTEM_PROMPT } from "@/lib/chat-system-prompt";

// Netlify's standard Node functions are capped at 26s, which kills long
// DeepSeek responses on heavy prompts (Blueprint + KB + history) and
// surfaces as a 504 Gateway Timeout → "Sorry, something went wrong" in
// the UI. The actual fix is the Netlify Edge Function at
// netlify/edge-functions/chat.ts, which intercepts /api/chat at the
// edge and bypasses this route entirely. This file is kept as a
// fallback for local dev and in case the edge function is unrouted.
export const runtime = "edge";


// 1 credit = 18,850 characters of chat content (input + output combined).
// Sized for the chat agent's Mentor gateway usage.
const CHARS_PER_CREDIT = 18_850;
const CHAT_MODEL = "atlas/deepseek-ai/deepseek-v4-pro";
// Upstream safety net so a wedged Mentor connection eventually frees up
// the edge function. 10 minutes is well past the longest legitimate
// DeepSeek completion we've seen.
const MENTOR_TIMEOUT_MS = 10 * 60 * 1000;
// Netlify Edge (and most proxies) close idle SSE connections around the
// 30s mark. We send a comment line every 15s so the connection looks
// alive while Mentor is still composing — that's what keeps long
// completions from getting 504'd mid-flight.
const STREAM_KEEPALIVE_MS = 15 * 1000;

// Carousel generation is two-stage: DeepSeek (CHAT_MODEL) ideates the substance
// of each slide with full context, then Sonnet renders that ideation into the
// locked template. Sonnet respects the template grammar reliably when it sees
// one small template; DeepSeek alone breaks the seams around literal connective
// words (e.g. "When {0} happened"). Mentor serves Anthropic models on
// /v1/messages, not /chat/completions.
const CAROUSEL_MODEL = "claude-sonnet-4-6";
const CAROUSEL_SYSTEM =
  "You fill the blanks of one locked Instagram carousel template using a strategist's ideation. Return only the JSON described in the user's instruction. No markdown, no commentary.";
// Sonnet 4.6 costs materially more than DeepSeek, so its characters bill at a
// higher rate. Each Sonnet character counts as this many credits' worth of
// characters relative to a DeepSeek character.
const SONNET_CREDIT_MULTIPLIER = 13;

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

function sanitizeUserFacingText(text: string): string {
  return text.replace(/[—–]/g, ", ").replace(/,\s+not\b/gi, " rather than");
}

function chatCompletionsUrl(apiUrl: string): string {
  return `${apiUrl.replace(/\/$/, "")}/chat/completions`;
}

export async function POST(req: NextRequest) {
  // Per-request structured logging so Netlify Functions logs show exactly
  // where the 30s+ is being spent. `reqId` correlates lines from a single
  // invocation; `elapsed` is ms since the route was entered. Grep the
  // Netlify log for "[chat <reqId>]" to read one request's full timeline.
  const reqId = crypto.randomUUID().slice(0, 8);
  const t0 = Date.now();
  const log = (stage: string, extra?: Record<string, unknown>) => {
    const elapsed = Date.now() - t0;
    const tail = extra ? ` ${JSON.stringify(extra)}` : "";
    console.log(`[chat ${reqId}] +${elapsed}ms ${stage}${tail}`);
  };
  log("route_enter");

  const supabase = await createClient();
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

  // Pre-check credit balance before making a paid upstream call
  const { data: credits } = await supabase
    .from("credits")
    .select("balance")
    .eq("user_id", user.id)
    .single();
  log("credits_loaded", { balance: credits?.balance });

  if (!credits || credits.balance <= 0) {
    return new Response(
      JSON.stringify({
        error: "Insufficient credits",
        code: "INSUFFICIENT_CREDITS",
      }),
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

  const apiKey = process.env.MENTOR_API_KEY;
  const apiUrl = process.env.MENTOR_API_URL;
  if (!apiKey || !apiUrl) {
    log("config_missing", { hasKey: !!apiKey, hasUrl: !!apiUrl });
    return new Response(JSON.stringify({ error: "Mentor API not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch the user's Brand DNA blueprint (if they've completed one) and
  // inject it into the system prompt so the AI knows their brand, audience,
  // product, Human Design, and everything from the Aligned Income Blueprint.
  let systemPrompt = SYSTEM_PROMPT;
  const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // Read the SELECTED brand profile (the single is_primary one). With
  // multi-brand support a user can have several; the chat always uses the
  // one they currently have selected in the sidebar switcher.
  const tBrandDna = Date.now();
  const { data: selectedBrand } = await supabase
    .from("brand_dnas")
    .select("id, blueprint_content, brand_name")
    .eq("user_id", user.id)
    .eq("is_primary", true)
    .maybeSingle();
  // Only treat it as a usable blueprint if it actually has content (a
  // freshly-created, not-yet-built profile has none).
  const brandDna = selectedBrand?.blueprint_content ? selectedBrand : null;
  const selectedBrandId = selectedBrand?.id ?? null;
  log("brand_dna_loaded", {
    ms: Date.now() - tBrandDna,
    blueprintChars: brandDna?.blueprint_content?.length ?? 0,
  });

  const tKb = Date.now();
  const [kbContext, matchedDocs, unembeddedDocsRes] = await Promise.all([
    lastUserMessage ? buildKbContext(supabase, lastUserMessage, 6) : Promise.resolve(null),
    // Retrieve only the user-uploaded docs whose "when_to_use" hint is
    // semantically close to the live query — that's how the hint becomes
    // load-bearing. Scoped to the selected brand so switching brands
    // changes which docs the AI consults.
    lastUserMessage
      ? matchBrandDnaDocs(supabase, user.id, lastUserMessage, { brandDnaId: selectedBrandId })
      : Promise.resolve([]),
    // Legacy fallback: any doc that hasn't been embedded yet (uploaded
    // before the embedding column existed, or upload-time embedding
    // failed). Scoped to the selected brand too.
    selectedBrandId
      ? supabase
          .from("brand_dna_documents")
          .select("label, when_to_use, content_text")
          .eq("user_id", user.id)
          .eq("brand_dna_id", selectedBrandId)
          .is("when_to_use_embedding", null)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as { label: string; when_to_use: string | null; content_text: string | null }[] }),
  ]);
  const unembeddedDocs = unembeddedDocsRes.data ?? [];
  log("kb_loaded", {
    ms: Date.now() - tKb,
    kbContextChars: kbContext?.length ?? 0,
    matchedDocs: matchedDocs.length,
    unembeddedDocs: unembeddedDocs.length,
  });

  if (brandDna?.blueprint_content) {
    systemPrompt += `

## THE USER'S ALIGNED INCOME BLUEPRINT (BRAND DNA)

The user has already completed their Aligned Income Blueprint. This is their complete brand strategy, Human Design reading, audience profile, product direction, content plan, and monetisation roadmap. You MUST use this as your knowledge base for every conversation. Do NOT ask questions about things that are already covered in the blueprint below. Reference their specific details (brand name, audience, product, Human Design type, authority, profile) naturally.

If the user asks for help with something covered in their blueprint (content strategy, brand voice, audience targeting, product development, pricing, etc.), use the specific details from their blueprint, not generic advice.

---
${brandDna.blueprint_content}
---`;
  }

  // Order matters here. On the mentor branch the system prompt went:
  //   SYSTEM_PROMPT → Blueprint → Main content-strategy KB.
  // Per-user uploaded docs were added later and got injected between the
  // Blueprint and the main KB, which pulled the model's gravity away
  // from the main KB (the canonical frameworks + writing rules every
  // user shares). Restore the original order so the main KB sits right
  // after the Blueprint, then append per-user docs at the end as a
  // supplementary block whose intro explicitly defers to the main KB.

  if (kbContext) {
    systemPrompt += `

## CONTENT STRATEGY KNOWLEDGE BASE (RETRIEVED)

${kbContext}`;
  }

  // Combine retrieval matches + legacy un-embedded docs. The matched-
  // docs block is the precise path; the legacy block is the safety net
  // until backfill runs.
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

  // Count input characters: system prompt + all user/assistant messages
  let inputChars =
    systemPrompt.length +
    messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);

  const chatMessages: ChatMessage[] = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  const completionUrl = chatCompletionsUrl(apiUrl);

  const encoder = new TextEncoder();
  let outputChars = 0;
  // Characters attributable to the Sonnet carousel call (input + output). These
  // bill at SONNET_CREDIT_MULTIPLIER times the DeepSeek rate.
  let sonnetChars = 0;
  let deducted = false;

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

  // For Sonnet-produced output (the rendered carousel), pass { sonnet: true } so
  // the deliverable bills at the Sonnet rate instead of the DeepSeek rate.
  const sseTextResponse = (text: string, opts?: { sonnet?: boolean }) => {
    const sanitizedText = sanitizeUserFacingText(text);
    if (opts?.sonnet) sonnetChars += sanitizedText.length;
    else outputChars += sanitizedText.length;
    const body = new ReadableStream({
      async start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              choices: [{ delta: { content: sanitizedText } }],
            })}\n\n`
          )
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        await deductCredits();
        controller.close();
      },
      cancel() {
        void deductCredits();
      },
    });

    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  };

  if (lastUserMessage && isLikelyCarouselRequest(lastUserMessage)) {
    // Two-stage carousel:
    //   Stage 1 — DeepSeek ideates the substance of each slide, with the FULL
    //     context (system prompt + Blueprint + KB + chat history), and names
    //     the framework it chose.
    //   Stage 2 — Sonnet fills the blanks of that ONE template as JSON (minimal
    //     payload) via Mentor's Anthropic-native endpoint; code then renders the
    //     locked wording verbatim. Validation drives up to 3 attempts.
    // The SDK appends /v1/messages itself, so the baseURL must stop at /api.
    const anthropic = new Anthropic({
      apiKey,
      baseURL: apiUrl.replace(/\/v1\/?$/, ""),
    });

    try {
      // --- Stage 1: DeepSeek ideation (full context) ---
      const ideationInstruction = buildIdeationInstruction();
      let ideation: CarouselIdeation | null = null;
      for (let attempt = 0; attempt < 2 && !ideation; attempt += 1) {
        inputChars += ideationInstruction.length;
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
        });
        if (!res.ok) {
          throw new Error(`Mentor API ${res.status}: ${await res.text()}`);
        }
        const completion = await res.json();
        const raw = completion.choices?.[0]?.message?.content ?? "";
        outputChars += raw.length;
        ideation = parseIdeation(raw);
      }

      if (!ideation) {
        return sseTextResponse(
          "I need one more detail before I can draft this carousel. Tell me a bit more about the specific angle or result you'd like to feature."
        );
      }

      const template = getCarouselTemplate(ideation.framework);
      if (!template) {
        // framework === "" (the model needs a clarification) or an unknown id.
        return sseTextResponse(
          ideation.angle?.trim() ||
            "Before I draft this, tell me a bit more about the specific angle or result you'd like to feature."
        );
      }

      // --- Stage 2: Sonnet fills blanks as JSON; code renders verbatim ---
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
        // Sonnet input bills at the Sonnet rate.
        sonnetChars += CAROUSEL_SYSTEM.length + fillInstruction.length;
        const completion = await anthropic.messages.create({
          model: CAROUSEL_MODEL,
          max_tokens: 2048,
          system: CAROUSEL_SYSTEM,
          messages: [{ role: "user", content: fillInstruction }],
        });
        const raw =
          completion.content.find((block) => block.type === "text")?.text ?? "";
        previousJson = raw;

        try {
          const parsed = parseLockedCarouselJson(raw);
          const validation = validateLockedCarousel(parsed);
          if (validation.ok) {
            const rendered = renderLockedCarousel(parsed);
            // Validation can't see a blank that spilled the template's own
            // trailing words; catch the resulting duplication and retry.
            const dup = findCarouselDuplication(rendered);
            if (!dup) {
              // The deliverable is the Sonnet carousel — bill at the Sonnet rate.
              return sseTextResponse(rendered, { sonnet: true });
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

      // The fill did not validate after retries (rare).
      return sseTextResponse(
        "I couldn't fit this cleanly into the template just now. Want me to try again, or tweak the angle?"
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return new Response(JSON.stringify({ error }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Relay the OpenAI-style Mentor SSE while preserving our writing-rule
  // sanitizer and credit accounting. Both pendingText and flushText are
  // captured by the stream's start() closure below.
  let pendingText = "";
  const flushText = (
    controller: ReadableStreamDefaultController,
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

  const sseBody = new ReadableStream({
    async start(controller) {
      // Flush a comment line immediately so the Response headers go out
      // to the client within ~1s. If we awaited the upstream Mentor
      // fetch BEFORE returning the Response (the pre-keepalive shape),
      // long prompts where Mentor takes 30s+ to send its first byte
      // would never get headers out and Netlify Edge would 504 the
      // request at ~30s.
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

  // If the client disconnects mid-stream, still deduct for what was generated
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
}
