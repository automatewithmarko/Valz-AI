type LineTemplate = {
  id: string;
  text: string;
  blanks: number;
};

type SlideTemplate = {
  label: string;
  lines: LineTemplate[];
  minLines?: number;
};

type CarouselTemplate = {
  id: string;
  name: string;
  slides: SlideTemplate[];
  variableProductSlides?: boolean;
};

type FilledLine = {
  id: string;
  blanks: string[];
};

type FilledSlide = {
  label: string;
  lines: FilledLine[];
};

export type LockedCarouselResult =
  | {
      mode: "clarify";
      question: string;
    }
  | {
      mode: "carousel";
      framework: string;
      angle: string;
      slides: FilledSlide[];
    };

type ValidationResult =
  | { ok: true; template: CarouselTemplate }
  | { ok: false; errors: string[] };

export function isLikelyCarouselRequest(message: string): boolean {
  const text = message.toLowerCase();
  if (/\bcaption\b/.test(text) && !/\bcarousel\b.{0,40}\b(write|draft|create|make|build)\b/.test(text)) {
    return false;
  }
  return (
    /\bcarousel\b/.test(text) &&
    /\b(write|draft|create|make|build|use|give me|walk me through)\b/.test(text)
  );
}

const FOLLOW_UP =
  "Are there any tweaks you'd like to make to the above? Alternatively, would you like a supporting caption for this carousel?";

const TEMPLATES: CarouselTemplate[] = [
  {
    id: "borrow_the_moment_build_the_depth",
    name: "Borrow the Moment, Build the Depth",
    slides: [
      {
        label: "The Moment",
        lines: [
          { id: "why_did", text: "Why did {0} feel bigger than it looked?", blanks: 1 },
          { id: "everyone_talking", text: "Everyone's talking about {0}.", blanks: 1 },
          { id: "why_resonating", text: "Why is {0} resonating so deeply right now?", blanks: 1 },
        ],
      },
      {
        label: "The Surface",
        lines: [
          { id: "surface", text: "On the surface, it looks like {0}.", blanks: 1 },
          { id: "easy_to_see", text: "It's easy to see it as {0}.", blanks: 1 },
        ],
      },
      {
        label: "The Deeper Layer",
        lines: [
          { id: "stayed_with_me", text: "What stayed with me was {0}.", blanks: 1 },
          { id: "behind_moment", text: "Behind that moment was probably {0}.", blanks: 1 },
          { id: "underneath", text: "Underneath it all was {0}.", blanks: 1 },
        ],
      },
      {
        label: "The Mirror",
        lines: [
          { id: "hits_hard", text: "When something like this hits hard, it often means {0}.", blanks: 1 },
          { id: "shines_light", text: "Sometimes it shines a light on {0}.", blanks: 1 },
        ],
      },
      {
        label: "The Shareable Truth",
        lines: [
          { id: "watching_someone", text: "Watching someone {0} can stir something in you.", blanks: 1 },
          { id: "awareness", text: "Awareness is often the first sign of {0}.", blanks: 1 },
        ],
      },
      {
        label: "The Encouragement",
        lines: [
          { id: "if_stirred", text: "If this stirred something in you, {0}.", blanks: 1 },
          { id: "you_dont_need", text: "You don't need to {0}.", blanks: 1 },
          { id: "start_with", text: "Start with {0}.", blanks: 1 },
        ],
      },
    ],
  },
  {
    id: "pattern_interrupt",
    name: "Pattern Interrupt",
    slides: [
      {
        label: "The Identity Call Out",
        lines: [{ id: "identity", text: "I don't know which {0} needs to hear this...", blanks: 1 }],
      },
      {
        label: "Name the Fixations",
        minLines: 3,
        lines: [
          { id: "wont_automatically", text: "{0} won't automatically {1}.", blanks: 2 },
          { id: "wont_guarantee", text: "{0} won't guarantee {1}.", blanks: 2 },
          { id: "wont_create", text: "{0} won't create {1}.", blanks: 2 },
        ],
      },
      {
        label: "The Core Principle",
        minLines: 3,
        lines: [
          { id: "growth", text: "Growth comes from {0}.", blanks: 1 },
          { id: "momentum", text: "Momentum builds when {0}.", blanks: 1 },
          { id: "traction", text: "Real traction starts with {0}.", blanks: 1 },
        ],
      },
      {
        label: "The Nuance",
        minLines: 4,
        lines: [
          { id: "powerful", text: "{0} is powerful.", blanks: 1 },
          { id: "can_help", text: "{0} can help.", blanks: 1 },
          { id: "valuable_when", text: "They're valuable when {0}.", blanks: 1 },
          { id: "careful_not", text: "Just be careful not to {0}.", blanks: 1 },
        ],
      },
      {
        label: "The Sharable Wrap",
        minLines: 3,
        lines: [
          { id: "tools", text: "Tools amplify {0}.", blanks: 1 },
          { id: "clarity", text: "Clarity creates {0}.", blanks: 1 },
          { id: "alignment", text: "Alignment sustains {0}.", blanks: 1 },
        ],
      },
    ],
  },
  {
    id: "curiosity_carousel",
    name: "Curiosity Carousel",
    slides: [
      {
        label: "The Curiosity Hook",
        lines: [
          { id: "long_time", text: "For a long time I thought {0}.", blanks: 1 },
          { id: "used_to_believe", text: "I used to believe that if I just {0}, everything would settle.", blanks: 1 },
          { id: "feeling_doesnt_mean", text: "Feeling {0} doesn't automatically mean {1}.", blanks: 2 },
        ],
      },
      {
        label: "Expand the Personal Context",
        lines: [
          { id: "remember_sitting", text: "I remember sitting {0}.", blanks: 1 },
          { id: "id_just", text: "I'd just {0}.", blanks: 1 },
          { id: "outside_looked", text: "From the outside, it looked like {0}.", blanks: 1 },
        ],
      },
      {
        label: "Introduce the Concept",
        lines: [
          { id: "didnt_understand", text: "What I didn't understand then was {0}.", blanks: 1 },
          { id: "research_around", text: "There's actually research around {0}.", blanks: 1 },
          { id: "later_learned", text: "I later learned that {0}.", blanks: 1 },
        ],
      },
      {
        label: "Reframe the Narrative",
        lines: [
          { id: "deeper_pattern", text: "The deeper pattern was {0}.", blanks: 1 },
          { id: "actually_happening", text: "What was actually happening was {0}.", blanks: 1 },
        ],
      },
      {
        label: "Validation",
        lines: [
          { id: "might", text: "That's why you might {0}.", blanks: 1 },
          { id: "sunday", text: "That's why Sunday nights feel {0}.", blanks: 1 },
          { id: "achieve_still", text: "That's why you can achieve {0} and still feel {1}.", blanks: 2 },
        ],
      },
      {
        label: "Empowered Close",
        lines: [
          { id: "shift_started", text: "The shift for me started when {0}.", blanks: 1 },
          { id: "dont_need", text: "You don't need to {0}.", blanks: 1 },
          { id: "real_question", text: "Maybe the real question is {0}.", blanks: 1 },
        ],
      },
      {
        label: "Soft CTA (Optional)",
        lines: [
          { id: "save", text: "Save this if it landed.", blanks: 0 },
          { id: "send", text: "Send this to the woman who keeps blaming herself.", blanks: 0 },
          { id: "honesty", text: "If this feels familiar, start with honesty.", blanks: 0 },
        ],
      },
    ],
  },
  {
    id: "permission_slip_post",
    name: "Permission Slip Post",
    slides: [
      {
        label: "Identity + Tension",
        lines: [
          { id: "im_a", text: "I'm a {0}, and I've been quietly {1}.", blanks: 2 },
          { id: "as_a", text: "As a {0}, I don't see many people talking about {1}.", blanks: 2 },
        ],
      },
      {
        label: "Real Moment",
        lines: [
          { id: "by", text: "By {0}, I'm {1}.", blanks: 2 },
          { id: "later", text: "Later, I'm {0}.", blanks: 1 },
          { id: "outside", text: "From the outside it looks like {0}, but internally it feels like {1}.", blanks: 2 },
        ],
      },
      {
        label: "Expand the Experience",
        lines: [
          { id: "days_when", text: "There are days when {0}.", blanks: 1 },
          { id: "sometimes", text: "Sometimes I find myself {0}.", blanks: 1 },
        ],
      },
      {
        label: "Name the Invisible Problem",
        lines: [
          { id: "rarely_spoken", text: "The part that's rarely spoken about is {0}.", blanks: 1 },
          { id: "heavy", text: "What makes it heavy is {0}.", blanks: 1 },
        ],
      },
      {
        label: "Cultural Expectation",
        lines: [
          { id: "unspoken", text: "There's this unspoken expectation that {0}.", blanks: 1 },
          { id: "meant_to", text: "We're somehow meant to {0}.", blanks: 1 },
        ],
      },
      {
        label: "Encouragement",
        lines: [
          { id: "navigating", text: "You're navigating {0}.", blanks: 1 },
          { id: "makes_sense", text: "It makes sense that you feel this way when {0}.", blanks: 1 },
        ],
      },
      {
        label: "Invitation",
        lines: [
          { id: "if_youre", text: "If you're a {0} who's figuring out {1}, you're in the right place.", blanks: 2 },
          { id: "follow", text: "Follow along for {0}.", blanks: 1 },
        ],
      },
    ],
  },
  {
    id: "small_shift_big_shift",
    name: "Small Shift, Big Shift",
    slides: [
      { label: "Personal Entry", lines: [{ id: "used_to", text: "I used to believe {0}.", blanks: 1 }, { id: "long_time", text: "For a long time I thought {0}.", blanks: 1 }] },
      { label: "Reveal the Hidden Issue", lines: [{ id: "didnt_see", text: "What I didn't see at the time was {0}.", blanks: 1 }, { id: "people_dont", text: "Most people don't realise that {0}.", blanks: 1 }] },
      { label: "Expand the Pattern", lines: [{ id: "looked", text: "It looked like {0}.", blanks: 1 }, { id: "felt", text: "It felt like {0}.", blanks: 1 }, { id: "behind", text: "Behind the scenes, I was {0}.", blanks: 1 }] },
      { label: "The Replacement", lines: [{ id: "shift", text: "The shift happened when {0}.", blanks: 1 }, { id: "instead", text: "Instead of {0}, I chose to {1}.", blanks: 2 }] },
      { label: "Integration", lines: [{ id: "since", text: "Since then, {0} feels different.", blanks: 1 }, { id: "my", text: "My {0} has changed.", blanks: 1 }] },
      { label: "Emotional Result", lines: [{ id: "feels_like", text: "It feels like {0}.", blanks: 1 }] },
      { label: "Invitation", lines: [{ id: "if_currently", text: "If you're currently {0}, this might be your sign.", blanks: 1 }, { id: "comment", text: "Comment {0} and I'll {1}.", blanks: 2 }] },
    ],
  },
  {
    id: "quiet_upgrade",
    name: "Quiet Upgrade",
    slides: [
      { label: "Personal Realisation", lines: [{ id: "long_time", text: "For a long time I thought {0}.", blanks: 1 }, { id: "used_to", text: "I used to believe {0}.", blanks: 1 }] },
      { label: "Hidden Friction", lines: [{ id: "didnt_understand", text: "What I didn't understand was {0}.", blanks: 1 }, { id: "people_dont", text: "Most people don't realise that {0}.", blanks: 1 }] },
      { label: "Real Life Pattern", lines: [{ id: "looked", text: "It looked like {0}.", blanks: 1 }, { id: "behind", text: "Behind the scenes I was {0}.", blanks: 1 }] },
      { label: "The Upgrade", lines: [{ id: "shift", text: "The shift happened when {0}.", blanks: 1 }, { id: "instead", text: "Instead of {0}, I chose to {1}.", blanks: 2 }] },
      { label: "Integration", lines: [{ id: "since", text: "Since then, {0} feels different.", blanks: 1 }, { id: "now_when", text: "Now when I {0}, it feels {1}.", blanks: 2 }] },
      { label: "Emotional Result", lines: [{ id: "feels_like", text: "It feels like {0}.", blanks: 1 }] },
      { label: "Invitation", lines: [{ id: "if_currently", text: "If you're currently {0}, this might be your starting point.", blanks: 1 }, { id: "comment", text: "Comment {0} and I'll show you where to begin.", blanks: 1 }] },
    ],
  },
  {
    id: "vetted_edit",
    name: "Vetted Edit",
    variableProductSlides: true,
    slides: [
      { label: "Context", lines: [{ id: "for_a_while", text: "For a while I was {0}.", blanks: 1 }, { id: "as_someone", text: "As someone who {0}, I've learned that {1}.", blanks: 2 }] },
      { label: "Product or Resource", minLines: 3, lines: [{ id: "use_for", text: "This is what I use for {0}.", blanks: 1 }, { id: "chose_because", text: "I chose it because {0}.", blanks: 1 }, { id: "noticed", text: "Since using it, I've noticed {0}.", blanks: 1 }] },
      { label: "Invitation", lines: [{ id: "start_here", text: "If you've been {0}, start here.", blanks: 1 }, { id: "comment", text: "Comment {0} and I'll send you the full edit.", blanks: 1 }] },
    ],
  },
  {
    id: "proof_over_hype",
    name: "Proof Over Hype",
    slides: [
      { label: "Outcome", lines: [{ id: "achieved", text: "We achieved {0} in {1}.", blanks: 2 }, { id: "went_from", text: "This client went from {0} to {1}.", blanks: 2 }] },
      { label: "Starting Point", minLines: 3, lines: [{ id: "beginning", text: "At the beginning, {0}.", blanks: 1 }, { id: "they_were", text: "They were {0}.", blanks: 1 }, { id: "challenge", text: "The challenge was {0}.", blanks: 1 }] },
      { label: "The Inputs", lines: [{ id: "decided", text: "We decided to {0}.", blanks: 1 }, { id: "instead", text: "Instead of {0}, we focused on {1}.", blanks: 2 }] },
      { label: "The Shift", lines: [{ id: "within", text: "Within {0}, we started noticing {1}.", blanks: 2 }, { id: "by", text: "By {0}, {1} had changed.", blanks: 2 }] },
      { label: "The Meaning", lines: [{ id: "shows", text: "What this shows is {0}.", blanks: 1 }, { id: "proves", text: "This proves that {0}.", blanks: 1 }] },
      { label: "Invitation", lines: [{ id: "if_currently", text: "If you're currently {0}, this is where we start.", blanks: 1 }, { id: "comment", text: "Comment {0} and I'll send you the next step.", blanks: 1 }] },
    ],
  },
  {
    id: "i_needed_this",
    name: "I Needed This",
    slides: [
      { label: "The Moment", lines: [{ id: "when", text: "When {0} happened, I realised {1}.", blanks: 2 }] },
      { label: "Expand the Weight", lines: [{ id: "as_changed", text: "As {0} changed, I felt {1}.", blanks: 2 }, { id: "so_much", text: "There was so much {0}, but I still felt {1}.", blanks: 2 }] },
      { label: "Effort", lines: [{ id: "tried", text: "I tried {0}.", blanks: 1 }, { id: "implemented", text: "I implemented {0}.", blanks: 1 }] },
      { label: "The Gap", lines: [{ id: "couldnt_find", text: "What I couldn't find was {0}.", blanks: 1 }, { id: "missing", text: "What was missing was {0}.", blanks: 1 }] },
      { label: "The Build", lines: [{ id: "decided", text: "So I decided to {0}.", blanks: 1 }, { id: "created", text: "I created {0}.", blanks: 1 }] },
      { label: "The Resource", lines: [{ id: "resource", text: "That's how {0} was created.", blanks: 1 }] },
      { label: "What's Inside", lines: [{ id: "inside", text: "Inside, you'll {0}.", blanks: 1 }] },
      { label: "Invitation", lines: [{ id: "if_currently", text: "If you're currently {0}, this is where I'd start.", blanks: 1 }, { id: "comment", text: "Comment {0} and I'll send it through.", blanks: 1 }] },
    ],
  },
];

const TEMPLATE_BY_ID = new Map(TEMPLATES.map((template) => [template.id, template]));

function cleanBlank(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/[—–]/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/,\s+not\b/gi, " rather than")
    .trim()
    .replace(/\.+$/, "");
}

function renderLine(template: LineTemplate, blanks: string[]): string {
  let line = template.text;
  for (let index = 0; index < template.blanks; index += 1) {
    line = line.replace(`{${index}}`, cleanBlank(blanks[index]));
  }
  const cleaned = line.replace(/\s+/g, " ").trim();
  return cleaned.replace(/^([a-z])/, (match) => match.toUpperCase());
}

function slideTemplateFor(template: CarouselTemplate, index: number, totalSlides: number): SlideTemplate | null {
  if (!template.variableProductSlides) return template.slides[index] ?? null;
  if (index === 0) return template.slides[0];
  if (index === totalSlides - 1) return template.slides[2];
  return template.slides[1];
}

export function validateLockedCarousel(result: LockedCarouselResult): ValidationResult {
  if (result.mode === "clarify") {
    if (result.question?.trim()) return { ok: true, template: TEMPLATES[0] };
    return { ok: false, errors: ["Clarify mode requires a question."] };
  }

  const errors: string[] = [];
  const template = TEMPLATE_BY_ID.get(result.framework);
  if (!template) return { ok: false, errors: [`Unknown framework: ${result.framework}`] };

  if (!result.angle?.trim()) errors.push("Carousel mode requires an angle.");

  const expectedCount = template.variableProductSlides ? null : template.slides.length;
  if (expectedCount !== null && result.slides.length !== expectedCount) {
    errors.push(`Expected ${expectedCount} slides, received ${result.slides.length}.`);
  }
  if (template.variableProductSlides && result.slides.length < 3) {
    errors.push("Vetted Edit requires context, at least one product/resource, and invitation.");
  }

  result.slides.forEach((slide, index) => {
    const slideTemplate = slideTemplateFor(template, index, result.slides.length);
    if (!slideTemplate) {
      errors.push(`Unexpected slide ${index + 1}.`);
      return;
    }
    if (slide.label !== slideTemplate.label) {
      errors.push(`Slide ${index + 1} label must be "${slideTemplate.label}", received "${slide.label}".`);
    }
    if (!Array.isArray(slide.lines) || slide.lines.length < (slideTemplate.minLines ?? 1)) {
      errors.push(`Slide ${index + 1} requires at least ${slideTemplate.minLines ?? 1} filled line(s).`);
      return;
    }
    const allowed = new Map(slideTemplate.lines.map((line) => [line.id, line]));
    slide.lines.forEach((line, lineIndex) => {
      const lineTemplate = allowed.get(line.id);
      if (!lineTemplate) {
        errors.push(`Slide ${index + 1} line ${lineIndex + 1} uses invalid id "${line.id}".`);
        return;
      }
      if (!Array.isArray(line.blanks) || line.blanks.length !== lineTemplate.blanks) {
        errors.push(`Slide ${index + 1} line "${line.id}" requires ${lineTemplate.blanks} blank(s).`);
      }
      if (line.blanks.some((blank) => typeof blank !== "string" || !blank.trim())) {
        errors.push(`Slide ${index + 1} line "${line.id}" has an empty blank.`);
      }
    });
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, template };
}

export function renderLockedCarousel(result: LockedCarouselResult): string {
  if (result.mode === "clarify") {
    return result.question.replace(/[—–]/g, ", ").replace(/\s+/g, " ").trim();
  }

  const template = TEMPLATE_BY_ID.get(result.framework);
  if (!template) throw new Error(`Unknown framework: ${result.framework}`);

  const parts: string[] = [`Here's the angle: ${cleanBlank(result.angle)}.`];

  result.slides.forEach((slide, index) => {
    const slideTemplate = slideTemplateFor(template, index, result.slides.length);
    if (!slideTemplate) return;
    const linesById = new Map(slideTemplate.lines.map((line) => [line.id, line]));
    const renderedLines = slide.lines
      .map((line) => {
        const lineTemplate = linesById.get(line.id);
        return lineTemplate ? renderLine(lineTemplate, line.blanks) : "";
      })
      .filter(Boolean);

    parts.push(`**Slide ${index + 1} - ${slideTemplate.label}**\n\n${renderedLines.join("\n")}`);
  });

  parts.push(FOLLOW_UP);
  return parts.join("\n\n");
}

export function buildLockedCarouselInstruction(validationErrors?: string[], previousJson?: string): string {
  return `CAROUSEL TEMPLATE LOCK MODE

You are not writing the final carousel. You are filling blanks for code-owned Plug-and-Play templates.

Return ONLY valid JSON. No markdown. No commentary.

JSON shape:
{
  "mode": "clarify",
  "question": "one targeted question if required input is missing"
}
OR
{
  "mode": "carousel",
  "framework": "one of the template ids below",
  "angle": "short rationale without naming the framework",
  "slides": [
    {
      "label": "exact slide label",
      "lines": [
        { "id": "line id from this slide only", "blanks": ["blank value only, not the full sentence"] }
      ]
    }
  ]
}

Hard rules:
- Fill blanks only. Never put a full finished template sentence inside a blank.
- Fill blanks with specific, textured language. Do not compress the idea into generic phrases like "taking action", "getting clarity", "building momentum", or "feeling ready" unless the user's own wording makes that unavoidable.
- Blanks may be rich clauses, not just nouns. Use concrete behaviours, time stamps, emotional texture, audience identity, and real-life details from the user/Blueprint where they fit the line. Example: for "I don't know which {0} needs to hear this...", a strong blank can be "corporate mum sitting in a role she's technically grown into, but still staring at her screen wondering why it feels heavy after the promotion".
- Make every blank grammatically fit the template line. If the template says "{0} is powerful", the blank must be a singular noun phrase like "Research" or "Planning", not a compound phrase that needs "are". If the blank starts the rendered sentence, capitalise it.
- Rotate adjectives, nouns, and sentence texture across blanks. Do not reuse the same descriptors slide after slide. If you use "quiet", "messy", "ready", "clear", "aligned", "visible", "momentum", or "clarity" once, reach for more specific language next time unless the template requires that exact word.
- Preserve detail while staying inside the template. The rendered output should feel as specific as a worked example, not like a skeletal outline.
- Use exact slide labels.
- Use only line ids listed under that slide.
- If a slide lists a minLines value, include at least that many lines.
- If the request lacks the data needed for the chosen framework's first slide, return clarify mode.
- Proof Over Hype requires a concrete created result. If no real result/case study is provided, return clarify mode asking for that result.
- Vetted Edit product/resource slides must all use label "Product or Resource"; put item names inside blanks.
- Do not include em dashes, en dashes, or the text pattern ", not" in any blank.

Available templates:
${JSON.stringify(
  TEMPLATES.map((template) => ({
    framework: template.id,
    labels: template.slides.map((slide) => slide.label),
    variableProductSlides: !!template.variableProductSlides,
    slides: template.slides.map((slide) => ({
      label: slide.label,
      minLines: slide.minLines ?? 1,
      lines: slide.lines.map((line) => ({
        id: line.id,
        text: line.text,
        blanks: line.blanks,
      })),
    })),
  })),
  null,
  2
)}
${validationErrors?.length ? `\nYour previous JSON failed validation:\n${validationErrors.join("\n")}` : ""}
${previousJson ? `\nPrevious JSON:\n${previousJson}` : ""}`;
}

export function parseLockedCarouselJson(text: string): LockedCarouselResult {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
  return JSON.parse(jsonText) as LockedCarouselResult;
}

// ---------------------------------------------------------------------------
// Two-stage carousel: DeepSeek ideates (per-slide substance, full context),
// Sonnet fills the chosen template's blanks as JSON, and the existing
// parse/validate/render functions above turn those blanks into the final
// carousel with the template wording guaranteed verbatim.
// ---------------------------------------------------------------------------

export type CarouselIdeation = {
  framework: string;
  angle: string;
  slides: { label: string; idea: string }[];
};

function ideationCatalog() {
  return TEMPLATES.map((template) => ({
    framework: template.id,
    name: template.name,
    variableProductSlides: !!template.variableProductSlides,
    slides: template.slides.map((slide) => slide.label),
  }));
}

// Stage 1 prompt — DeepSeek picks a framework and briefs each slide. Sent on
// top of the full system prompt (Blueprint + KB) and chat history, so the ideas
// are grounded in the user's brand and the conversation.
export function buildIdeationInstruction(): string {
  return `CAROUSEL IDEATION

The user wants an Instagram carousel. Pick the single best framework for their request and the conversation so far, then plan each slide. You are NOT writing final copy; you are briefing a copywriter on what each slide should contain.

Use the user's Blueprint, knowledge base, and everything in this conversation to make the ideas specific to THEIR brand, audience, voice, offer, and the topic they asked about.

Available frameworks (id, name, ordered slide labels):
${JSON.stringify(ideationCatalog(), null, 2)}

Return ONLY JSON, no markdown, no commentary:
{
  "framework": "<framework id from the list above>",
  "angle": "<one short sentence on the angle; do not name the framework>",
  "slides": [
    { "label": "<exact slide label from the chosen framework>", "idea": "<what this slide should convey: the specific substance, concrete details, examples, and emotional texture. Adequate and specific but concise, 1 to 3 sentences. Do NOT write polished final copy.>" }
  ]
}

Rules:
- Use the exact framework id and the exact slide labels of the chosen framework, in order.
- Make every idea specific and textured to this user and topic, not generic.
- "Vetted Edit" has a variable number of product slides: output one "Context" slide, then one "Product or Resource" slide per item the user is recommending (at least one), then the "Invitation" slide.
- "Proof Over Hype" needs a real, concrete result or case study. If the user has not provided one, set "framework" to "" and put a question asking for that result in "angle".
- If the request is missing data the first slide needs, set "framework" to "" and put a single clarifying question in "angle".`;
}

export function parseIdeation(text: string): CarouselIdeation | null {
  try {
    const trimmed = text.trim();
    const jsonText = trimmed.startsWith("{")
      ? trimmed
      : trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonText) as CarouselIdeation;
    if (typeof parsed.framework !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getCarouselTemplate(id: string): CarouselTemplate | undefined {
  return TEMPLATE_BY_ID.get(id);
}

function templateWithBlanksForPrompt(template: CarouselTemplate): string {
  const slides = template.slides.map((slide, index) => {
    const lines = slide.lines
      .map(
        (line) =>
          `      - id "${line.id}", ${line.blanks} blank${line.blanks > 1 ? "s" : ""}: ${line.text}`
      )
      .join("\n");
    const min = slide.minLines
      ? `  (include at least ${slide.minLines} of these lines)`
      : "";
    return `  Slide ${index + 1}, label "${slide.label}"${min}\n${lines}`;
  });
  const productNote = template.variableProductSlides
    ? `\n\nThis framework has a variable number of "Product or Resource" slides: output the Context slide, then one "Product or Resource" slide per item in the ideation (at least one), then the Invitation slide.`
    : "";
  return `Framework: ${template.name} (id: ${template.id})\n${slides.join("\n")}${productNote}`;
}

// Stage 2 prompt — Sonnet fills the blanks of the ONE chosen template using the
// ideation as substance. It returns JSON (blanks only); code renders the fixed
// template wording verbatim, so the model can never touch the locked words.
export function buildCarouselFillInstruction(
  template: CarouselTemplate,
  ideation: CarouselIdeation,
  userRequest: string,
  validationErrors?: string[],
  previousJson?: string
): string {
  const ideaText = ideation.slides
    .map((slide, index) => `  ${index + 1}. ${slide.label}: ${slide.idea}`)
    .join("\n");
  return `Fill the blanks of this ONE locked carousel template using the strategist's ideation. Return ONLY JSON.

Template (each line shows its id, blank count, and the fixed wording with {0}/{1} placeholders):
${templateWithBlanksForPrompt(template)}

Angle: ${ideation.angle}

Ideation (substance for each slide):
${ideaText}

Original user request (for tone and detail): ${userRequest}

Return ONLY this JSON shape, no markdown, no commentary:
{
  "mode": "carousel",
  "framework": "${template.id}",
  "angle": "<one short sentence; do not name the framework>",
  "slides": [
    { "label": "<exact slide label>", "lines": [ { "id": "<line id from that slide>", "blanks": ["<blank value only, not the full sentence>"] } ] }
  ]
}

Hard rules:
- Each "label" value is exactly the quoted label shown for that slide (e.g. "The Identity Call Out"). Do NOT add a "Slide 1 - " prefix or any other text.
- Output one slides entry per template slide, in order, using the exact labels and only the line ids listed under that slide. If a slide lists a minimum, include at least that many lines.
- Each "blanks" array must contain exactly the number of blanks listed for that line.
- Put ONLY the blank value in each blank. Never include any of the template's fixed words. For "Comment {0} and I'll {1}.", the {0} blank is just the keyword (e.g. "REST"), never "REST and I'll send it through".
- Choose each blank so the finished sentence (the template's fixed words plus your blank) is natural and grammatically correct, including any words AFTER the blank. For "When {0} happened, I realised {1}.", the {0} blank must be an event or noun phrase so "<blank> happened" reads correctly; it must NOT be a full clause that already contains its own verb.
- Fill blanks with specific, textured language drawn from the ideation (concrete behaviours, time stamps, emotional texture). No generic filler like "taking action" or "getting clarity".
- Make each blank grammatically fit its line. If the line needs a singular noun, use one. Capitalise a blank that starts the sentence.
- Do not include em dashes, en dashes, or the text ", not" in any blank.
${validationErrors?.length ? `\nYour previous JSON failed validation. Fix exactly these:\n${validationErrors.join("\n")}` : ""}${previousJson ? `\nPrevious JSON:\n${previousJson}` : ""}`;
}

// Structural validation guarantees blank counts and labels, but it cannot see
// when a blank spills the template's own following words (e.g. filling {0} of
// "Comment {0} and I'll send it through." with "REST and I'll send it through",
// which renders the trailing phrase twice). Catch that back-to-back repetition
// of a 4+ word phrase in the rendered output so the caller can retry.
export function findCarouselDuplication(rendered: string): string | null {
  const match = rendered.match(/\b(\w+(?:\s+\w+){3,})\s+\1\b/i);
  return match ? match[1] : null;
}
