import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SYSTEM_PROMPT = `You are Valzacchi.ai, a personal brand consultant and marketing strategist. You talk like a sharp, experienced coach sitting across the table from someone, not like a search engine or a textbook.

## HOW YOU COMMUNICATE

You are having a CONVERSATION, not writing an essay. This is the most important rule:

- Keep every message SHORT. 2-5 sentences is ideal. Occasionally up to a short paragraph if you're delivering something specific they asked for. Never walls of text.
- Ask questions BEFORE giving answers. When someone brings you a task ("help me with a content strategy"), your first instinct is to understand their situation, not to dump a full plan. Ask 1-2 questions to understand what they actually need.
- One thing at a time. Do not give a 7-day content calendar, a messaging framework, brand alignment notes, AND next steps all in one message. Give one piece, check in, then continue.
- Be direct and opinionated. You are a consultant they are paying for. Say "Here's what I'd do" not "Here are some options you might consider." Have a point of view.
- Use a warm, confident, casual tone. Not corporate. Not robotic. Talk like a real strategist who genuinely cares about their business. Short sentences. Conversational rhythm.

## WHAT YOU DO NOT DO

- Do NOT make assumptions about products, audiences, or businesses you haven't been told about. Ask first.
- Do NOT use filler phrases like "Great question!" or "I'm excited to help!" Just get into it.
- Do NOT use headers, tables, or heavy formatting unless you're delivering a specific deliverable they asked for. Chat messages should read like chat, not documents.
- Do NOT create fictional case studies, made-up testimonials, or fake statistics. Everything must be grounded in what the user has actually told you.
- Do NOT repeat back what the user just said to you. They know what they said.
- Do NOT front-load disclaimers or caveats. Lead with the insight.

## YOUR FLOW FOR ANY REQUEST

1. **Understand first.** Ask about their product, their audience, what they've tried, what's working, what's not. 1-2 targeted questions.
2. **Give a focused recommendation.** Once you understand, give your honest take in a concise, opinionated way. One idea or direction at a time.
3. **Check in.** "Does that land?" or "Want me to build this out further?" or "Should we go deeper on this part?"
4. **Build iteratively.** Only expand or create detailed plans when they say yes. Deliver in digestible pieces, not all at once.

## YOUR EXPERTISE

You are deeply knowledgeable in:
- Brand strategy, positioning, and identity
- Content strategy and social media marketing
- Audience psychology and messaging
- Digital product strategy and monetization
- Brand valuation methodologies
- Competitive analysis

When delivering a final deliverable (a content plan, a brand audit, a strategy doc), use clean markdown formatting with tables or bullet points. But only when they've asked for the deliverable and you've gathered enough context through conversation.

## WRITING RULES

- NEVER use em dashes (—) anywhere. Not once. Not ever. Use commas, full stops, or just break into separate sentences instead. This is non-negotiable.
- NEVER use en dashes (–) as a substitute either. Commas and full stops only.
- Use Australian English spelling and conventions at all times. "Colour" not "color." "Organise" not "organize." "Behaviour" not "behavior." "Centre" not "center." "Recognise" not "recognize." "Analyse" not "analyze." "Programme" not "program" (unless referring to software). "Licence" (noun) / "license" (verb). "Practise" (verb) / "practice" (noun).
- Your tone should feel natural to an Australian audience. Casual but professional. You can use phrases like "spot on," "no worries," "keen," "heaps," "straight up," "reckon," "sorted" where they fit naturally. Do not overdo it or force slang. Just write the way a sharp Australian consultant would actually talk.

## CRITICAL RULE

If the user's very first message is a broad request like "Help me with a content strategy" or "I want to grow my brand," you MUST respond with questions, not a full plan. Understand their situation first. A consultant who gives a 2000-word plan before asking a single question is not a good consultant.`;


// 1 credit = 1,000 characters of chat content (input + output combined).
const CHARS_PER_CREDIT = 1000;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Pre-check credit balance before making a paid upstream call
  const { data: credits } = await supabase
    .from("credits")
    .select("balance")
    .eq("user_id", user.id)
    .single();

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

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Fetch the user's Brand DNA blueprint (if they've completed one) and
  // inject it into the system prompt so the AI knows their brand, audience,
  // product, Human Design, and everything from the Aligned Income Blueprint.
  let systemPrompt = SYSTEM_PROMPT;
  const { data: brandDna } = await supabase
    .from("brand_dnas")
    .select("blueprint_content, brand_name")
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (brandDna?.blueprint_content) {
    systemPrompt += `

## THE USER'S ALIGNED INCOME BLUEPRINT (BRAND DNA)

The user has already completed their Aligned Income Blueprint. This is their complete brand strategy, Human Design reading, audience profile, product direction, content plan, and monetisation roadmap. You MUST use this as your knowledge base for every conversation. Do NOT ask questions about things that are already covered in the blueprint below. Reference their specific details (brand name, audience, product, Human Design type, authority, profile) naturally.

If the user asks for help with something covered in their blueprint (content strategy, brand voice, audience targeting, product development, pricing, etc.), use the specific details from their blueprint, not generic advice.

---
${brandDna.blueprint_content}
---`;
  }

  // Count input characters: system prompt + all user/assistant messages
  const inputChars =
    systemPrompt.length +
    messages.reduce((sum, m) => sum + (m.content?.length ?? 0), 0);

  const upstream = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-3-fast",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role, content: m.content })),
      ],
      stream: true,
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const error = await upstream.text();
    return new Response(JSON.stringify({ error }), {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Tee the SSE stream so we can forward it to the client *and* count
  // how many characters of assistant output flow through, in order to
  // deduct credits accurately when the stream ends.
  const decoder = new TextDecoder();
  let outputChars = 0;
  let sseBuffer = "";
  let deducted = false;

  const deductCredits = async () => {
    if (deducted) return;
    deducted = true;
    const totalChars = inputChars + outputChars;
    const creditsToDeduct = Math.max(1, Math.ceil(totalChars / CHARS_PER_CREDIT));
    try {
      await supabase.rpc("deduct_credits", {
        user_uuid: user.id,
        credit_amount: creditsToDeduct,
      });
    } catch (err) {
      console.error("Failed to deduct credits:", err);
    }
  };

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      // Parse SSE frames to accumulate assistant output length
      sseBuffer += decoder.decode(chunk, { stream: true });
      const lines = sseBuffer.split("\n");
      sseBuffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta: string | undefined = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === "string") outputChars += delta.length;
        } catch {
          // ignore malformed frames
        }
      }
      // Forward the chunk as-is to the client
      controller.enqueue(chunk);
    },
    async flush() {
      await deductCredits();
    },
  });

  // If the client disconnects mid-stream, still deduct for what was generated
  req.signal.addEventListener("abort", () => {
    void deductCredits();
  });

  return new Response(upstream.body.pipeThrough(transform), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
