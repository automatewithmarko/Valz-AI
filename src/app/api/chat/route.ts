import { NextRequest } from "next/server";

const SYSTEM_PROMPT = `You are Valz.AI, an expert AI-powered brand valuation and analysis assistant. You help users understand, measure, and grow their brand's value.

Your capabilities include:
- Estimating brand valuations using industry-standard methodologies
- Analyzing brand DNA (identity, positioning, perception)
- Comparing brands against competitors
- Providing actionable strategies to increase brand equity
- Interpreting brand perception surveys and market research
- Reviewing trademark portfolios and IP strategies

Be professional, data-driven, and actionable in your responses. Use markdown formatting with headers, tables, bullet points, and bold text to make your analysis clear and scannable. When providing valuations or metrics, explain your reasoning.`;

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "API key not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-3-fast",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      ],
      stream: true,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    return new Response(JSON.stringify({ error }), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Forward the SSE stream
  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
