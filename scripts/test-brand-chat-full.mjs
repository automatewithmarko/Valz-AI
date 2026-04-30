// End-to-end full blueprint generation + PDF render for the 3 brand-chat
// test profiles. For each profile:
//   1. Loads the brand-chat SYSTEM_PROMPT verbatim from route.ts.
//   2. Sends the synthetic completed-interview profile to Grok with
//      max_tokens=32768 (matching production) and asks for the full 15-step
//      Aligned Income Blueprint terminated by ===BRAND_DNA_COMPLETE===.
//   3. Saves the raw markdown to public/test-blueprints/<slug>.md.
//   4. Renders a PDF using the same layout logic as src/lib/brand-pdf.ts
//      (Node-adapted: logo via fs, output written via fs).
//   5. Audits the markdown for TikTok inclusion in Step 9.
//
// Usage:  node scripts/test-brand-chat-full.mjs

import { readFile, writeFile, appendFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import jsPDF from "jspdf";

// Streaming SSE solves the headers-timeout problem: we get the response
// headers back almost immediately, then chunks flow as Grok produces them.
// We also persist tokens to disk as they stream in so a mid-flight
// connection drop still leaves a usable partial blueprint behind.

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUT_DIR = resolve(ROOT, "public", "test-blueprints");

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

async function loadBrandChatSystemPrompt() {
  const src = await readFile(resolve(ROOT, "src/app/api/brand-chat/route.ts"), "utf8");
  const m = src.match(/const SYSTEM_PROMPT = `([\s\S]*?)`;/);
  if (!m) throw new Error("Could not locate SYSTEM_PROMPT in brand-chat/route.ts");
  return m[1];
}

async function callGrokFull(systemPrompt, userMessage, label, mdPath) {
  // Truncate (start fresh) the md file for this profile.
  await writeFile(mdPath, "", "utf8");

  const doRequest = async () => {
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-3-fast",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        stream: true,
        max_tokens: 32768,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`grok ${res.status}: ${await res.text()}`);

    const decoder = new TextDecoder();
    let buf = "";
    let full = "";
    let chunkCount = 0;
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      let pendingWrite = "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === "string") {
            full += delta;
            pendingWrite += delta;
            chunkCount++;
            if (chunkCount % 100 === 0) {
              process.stdout.write(`[${label}] ${full.length} chars streamed\n`);
            }
          }
        } catch {
          // ignore malformed frames
        }
      }
      // Flush this batch of deltas to disk so partial progress survives crashes
      if (pendingWrite) await appendFile(mdPath, pendingWrite, "utf8");
    }
    return full;
  };

  // Retry once on transient errors (ECONNRESET, undici terminated, etc.)
  let attempt = 0;
  while (true) {
    try {
      return await doRequest();
    } catch (err) {
      attempt++;
      const msg = String(err?.message ?? err);
      const transient = /ECONNRESET|terminated|fetch failed|socket hang up/i.test(msg);
      if (attempt < 2 && transient) {
        console.log(`[${label}] transient error (${msg}); retrying in 5s...`);
        await new Promise((r) => setTimeout(r, 5000));
        continue;
      }
      throw err;
    }
  }
}

// ---------- PDF renderer (Node port of src/lib/brand-pdf.ts) ----------
const COMPLETION_MARKER = "===BRAND_DNA_COMPLETE===";
const EDIT_COMPLETION_MARKER = "===BRAND_DNA_EDIT_COMPLETE===";

async function loadLogoDataUrl() {
  try {
    const buf = await readFile(resolve(ROOT, "public", "logo.png"));
    return `data:image/png;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

async function renderBlueprintPdf(content, outPath) {
  let clean = content
    .replace(COMPLETION_MARKER, "")
    .replace(EDIT_COMPLETION_MARKER, "")
    .replace(/===SUMMARY_START===[\s\S]*?===SUMMARY_END===/g, "")
    .trim();

  const firstHeadingIdx = clean.indexOf("\n# ");
  if (firstHeadingIdx > 0) {
    clean = clean.substring(firstHeadingIdx + 1).trim();
  } else if (!clean.startsWith("# ")) {
    const altIdx = clean.indexOf("# YOUR ALIGNED INCOME BLUEPRINT");
    if (altIdx > 0) clean = clean.substring(altIdx).trim();
  }

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const marginLeft = 20;
  const contentWidth = pageWidth - marginLeft - 20;
  let y = 0;

  const bgColor = [252, 249, 245];

  function addBackground() {
    pdf.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
    pdf.rect(0, 0, pageWidth, pageHeight, "F");
  }

  function checkPage(needed) {
    if (y + needed > pageHeight - 20) {
      pdf.addPage();
      addBackground();
      y = 25;
    }
  }

  addBackground();

  const logoData = await loadLogoDataUrl();
  if (logoData) {
    const logoW = 50;
    const logoH = 50 * (441 / 750);
    const logoX = (pageWidth - logoW) / 2;
    pdf.addImage(logoData, "PNG", logoX, 20, logoW, logoH);
    y = 20 + logoH + 8;
  } else {
    y = 25;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.setTextColor(6, 38, 78);
  const titleText = "Your Aligned Income Blueprint";
  const titleWidth = pdf.getTextWidth(titleText);
  pdf.text(titleText, (pageWidth - titleWidth) / 2, y);
  y += 6;

  pdf.setDrawColor(192, 137, 103);
  pdf.setLineWidth(0.5);
  pdf.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y);
  y += 15;

  function renderRichLine(text, x, fontSize, maxWidth) {
    pdf.setFontSize(fontSize);
    const lineH = fontSize * 0.5 + 1;

    const parts = text.split(/(\*\*.*?\*\*)/g);
    const segments = [];
    for (const part of parts) {
      if (!part) continue;
      if (part.startsWith("**") && part.endsWith("**")) {
        segments.push({ text: part.slice(2, -2), bold: true });
      } else {
        segments.push({ text: part.replace(/\*(.*?)\*/g, "$1"), bold: false });
      }
    }

    const words = [];
    for (const seg of segments) {
      const segWords = seg.text.split(/( +)/);
      for (const w of segWords) if (w) words.push({ word: w, bold: seg.bold });
    }

    let lineWords = [];
    let lineWidth = 0;

    const flushLine = () => {
      if (lineWords.length === 0) return;
      checkPage(lineH);
      let lx = x;
      for (const w of lineWords) {
        pdf.setFont("helvetica", w.bold ? "bold" : "normal");
        pdf.setFontSize(fontSize);
        pdf.text(w.word, lx, y);
        lx += pdf.getTextWidth(w.word);
      }
      y += lineH;
      lineWords = [];
      lineWidth = 0;
    };

    for (const w of words) {
      pdf.setFont("helvetica", w.bold ? "bold" : "normal");
      pdf.setFontSize(fontSize);
      const wWidth = pdf.getTextWidth(w.word);
      if (lineWidth + wWidth > maxWidth && lineWords.length > 0) flushLine();
      lineWords.push(w);
      lineWidth += wWidth;
    }
    flushLine();
    pdf.setFont("helvetica", "normal");
  }

  for (const line of clean.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("# ")) {
      checkPage(18);
      y += 6;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.setTextColor(6, 38, 78);
      const headingText = trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, "$1");
      for (const hl of pdf.splitTextToSize(headingText, contentWidth)) {
        checkPage(10);
        pdf.text(hl, marginLeft, y);
        y += 9;
      }
      pdf.setDrawColor(192, 137, 103);
      pdf.setLineWidth(0.3);
      pdf.line(marginLeft, y - 3, marginLeft + contentWidth, y - 3);
      y += 4;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      checkPage(14);
      y += 5;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(14);
      pdf.setTextColor(6, 38, 78);
      const headingText = trimmed.slice(3).replace(/\*\*(.*?)\*\*/g, "$1");
      for (const hl of pdf.splitTextToSize(headingText, contentWidth)) {
        checkPage(8);
        pdf.text(hl, marginLeft, y);
        y += 7;
      }
      y += 2;
      continue;
    }
    if (trimmed.startsWith("### ")) {
      checkPage(12);
      y += 3;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(12);
      pdf.setTextColor(6, 38, 78);
      const headingText = trimmed.slice(4).replace(/\*\*(.*?)\*\*/g, "$1");
      for (const hl of pdf.splitTextToSize(headingText, contentWidth)) {
        checkPage(7);
        pdf.text(hl, marginLeft, y);
        y += 6;
      }
      y += 1;
      continue;
    }
    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      checkPage(8);
      y += 3;
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.2);
      pdf.line(marginLeft, y, marginLeft + contentWidth, y);
      y += 5;
      continue;
    }
    if (!trimmed) {
      y += 3;
      continue;
    }
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ") || trimmed.startsWith("• ")) {
      const bulletText = trimmed.slice(2);
      pdf.setFontSize(10);
      pdf.setTextColor(40, 40, 40);
      checkPage(6);
      pdf.setTextColor(192, 137, 103);
      pdf.text("•", marginLeft + 1, y);
      pdf.setTextColor(40, 40, 40);
      renderRichLine(bulletText, marginLeft + 7, 10, contentWidth - 8);
      y += 1;
      continue;
    }
    const numberedMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
    if (numberedMatch) {
      const [, num, text] = numberedMatch;
      pdf.setFontSize(10);
      checkPage(6);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(192, 137, 103);
      pdf.text(`${num}.`, marginLeft + 1, y);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(40, 40, 40);
      renderRichLine(text, marginLeft + 10, 10, contentWidth - 10);
      y += 1;
      continue;
    }
    pdf.setTextColor(40, 40, 40);
    renderRichLine(trimmed, marginLeft, 10, contentWidth);
    y += 2;
  }

  const buf = Buffer.from(pdf.output("arraybuffer"));
  await writeFile(outPath, buf);
}

// ---------- Profiles ----------
const PROFILES = [
  {
    slug: "01-maya-generator",
    name: "Maya — Generator who already loves TikTok (control)",
    profile: `
PROFILE SUMMARY (interview is complete, ALL fields collected):
- Name: Maya
- Date of Birth: 14 March 1992, 09:45, Brisbane, Australia
- HD Type: Generator | Authority: Sacral | Profile: 2/4 Hermit/Opportunist
- Defined centers: Sacral, Throat, Spleen, Root
- Niche: Holistic nutritionist for women in their 30s recovering from burnout
- Lived experience: Burnt out herself at 29 working in corporate finance, rebuilt through nervous system work + nutrition over 18 months
- Income goal: $15,000/month within 12 months
- Current income: $4,000/month from 1:1 nutrition sessions
- Time capacity: 10-15 hrs/week on content (kids in school)
- Visibility tolerance: HIGH, comfortable on camera, has been posting casually
- Q23 (most natural platform): "TikTok, I already post there casually and it feels easy"
- Q47 (least intimidating): "TikTok"
- Helping style: warm, science-backed but plain-spoken, pattern-recognition driven
- Energy: high creative output, loves quick content, dislikes long-form writing, loves cooking and demonstrating
- Audience pain: chronically tired women in their 30s who feel like nothing they try to fix burnout actually sticks
- Audience contradiction: they obsess over wellness content but feel worse, not better
- Product (already validated in Step 5): "Reset Months" 8-week group programme, $497, runs 4x per year`,
  },
  {
    slug: "02-sarah-projector",
    name: "Sarah — Introverted Projector, hates video, prefers Pinterest",
    profile: `
PROFILE SUMMARY (interview is complete, ALL fields collected):
- Name: Sarah
- Date of Birth: 8 November 1981, 22:14, Melbourne, Australia
- HD Type: Projector | Authority: Splenic | Profile: 6/2 Role Model/Hermit
- Defined centers: Spleen, Ajna, G-Center
- Niche: Career strategist for women in their 40s feeling stuck post-corporate
- Lived experience: Quietly walked away from a director-level role at 42 after a slow-burn burnout, took a year off, rebuilt around 1:1 strategy work
- Income goal: $12,000/month within 12 months
- Current income: $7,000/month from 1:1 intensives
- Time capacity: 4-6 hrs/week on content (young child, low energy)
- Visibility tolerance: LOW, deeply uncomfortable being filmed, will refuse face-to-camera
- Q23 (most natural platform): "Pinterest, I love designing and curating visuals"
- Q47 (least intimidating): "Writing/blogging"
- Helping style: surgical, asks the question others avoid, refuses to feed empty motivation
- Energy: prefers writing and curated visuals, dislikes camera, low-energy creator who needs rest cycles
- Audience pain: women in their 40s who keep waiting for permission to leave a career that's making them sick
- Audience contradiction: they're seen as the competent ones, so no one notices they're suffocating
- Product (already validated in Step 5): "The Quiet Exit" 6-week 1:1 strategy intensive, $1,200, runs continuously`,
  },
  {
    slug: "03-jen-manifestor-writer",
    name: "Jen — Manifestor writer who explicitly picks Writing/Pinterest only",
    profile: `
PROFILE SUMMARY (interview is complete, ALL fields collected):
- Name: Jen
- Date of Birth: 22 June 1986, 04:30, Sydney, Australia
- HD Type: Manifestor | Authority: Emotional | Profile: 5/1 Heretic/Investigator
- Defined centers: Solar Plexus, Throat, Root, G-Center
- Niche: Creative writing coach for novelists who write around a day job
- Lived experience: Wrote and published two novels while working full-time in marketing, has the receipts (book covers, agent emails, publishing contract)
- Income goal: $20,000/month within 18 months
- Current income: $2,500/month from a small Substack + occasional manuscript edits
- Time capacity: 3-4 hrs/week on content (very protected, she writes fiction with the rest)
- Visibility tolerance: VERY LOW, "I'd rather not show my face at all, ever"
- Q23 (most natural platform): "Writing/blogging, anything else stresses me out"
- Q47 (least intimidating): "Pinterest"
- Helping style: structural, sharp, will tell you exactly why your second act is collapsing
- Energy: deep, slow, writing-driven, resents short-form video and chatty content
- Audience pain: novelists who have a real day job and a real manuscript and keep losing both to the other
- Audience contradiction: they tell people writing is their priority but spend zero hours on it most weeks
- Product (already validated in Step 5): "The 12-Week Novel Build" 12-week intensive, $2,400, runs 3x per year`,
  },
];

const REQUEST = `The interview is complete. The full questionnaire has been answered, all 15 sections discussed and approved by the client. You have everything you need.

Now produce the COMPLETE Aligned Income Blueprint following the BLUEPRINT STRUCTURE in your instructions. Include ALL 15 steps with full depth as specified by your depth instructions, in exactly the order Step 1 through Step 15. Do not summarise, do not abbreviate, do not skip any step. Do not include any preamble, greeting, or "here is your blueprint" text. Begin directly with the heading "# YOUR ALIGNED INCOME BLUEPRINT".

End the document with the marker on its own line:
===BRAND_DNA_COMPLETE===`;

function audit(content) {
  const tiktokCount = (content.match(/tiktok/gi) || []).length;
  const step9Match = content.match(/## Step 9: Platform Strategy[\s\S]*?(?=## Step 10:|$)/i);
  const step9 = step9Match ? step9Match[0] : "";
  const tiktokInStep9 = /tiktok/i.test(step9);
  const allSteps = [];
  for (let i = 1; i <= 15; i++) {
    if (new RegExp(`## Step ${i}:`).test(content)) allSteps.push(i);
  }
  const hasMarker = content.includes("===BRAND_DNA_COMPLETE===");
  return { tiktokCount, tiktokInStep9, allSteps, hasMarker, step9Length: step9.length };
}

(async () => {
  await loadEnv();
  const systemPrompt = await loadBrandChatSystemPrompt();
  console.log(`Loaded SYSTEM_PROMPT (${systemPrompt.length} chars)`);
  console.log(`Output dir: ${OUT_DIR}\n`);

  // Run profiles in parallel; Grok handles concurrent requests fine.
  const tasks = PROFILES.map(async ({ slug, name, profile }) => {
    const t0 = Date.now();
    console.log(`[${slug}] starting full blueprint generation...`);
    const reply = await callGrokFull(systemPrompt, `${profile}\n\n${REQUEST}`, slug);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

    const mdPath = resolve(OUT_DIR, `${slug}.md`);
    await writeFile(mdPath, reply, "utf8");

    const pdfPath = resolve(OUT_DIR, `${slug}.pdf`);
    await renderBlueprintPdf(reply, pdfPath);

    const a = audit(reply);
    console.log(`[${slug}] DONE in ${elapsed}s, ${reply.length} chars`);
    console.log(`  steps present: ${a.allSteps.join(",") || "NONE"}`);
    console.log(`  tiktok mentions total: ${a.tiktokCount}`);
    console.log(`  tiktok in Step 9: ${a.tiktokInStep9} (Step 9 length: ${a.step9Length})`);
    console.log(`  completion marker: ${a.hasMarker}`);
    console.log(`  md  → ${mdPath}`);
    console.log(`  pdf → ${pdfPath}\n`);
    return { name, slug, ...a };
  });

  const results = await Promise.all(tasks);

  console.log("=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));
  for (const r of results) {
    const passed =
      r.tiktokInStep9 && r.allSteps.length === 15 && r.hasMarker;
    console.log(`  ${passed ? "PASS" : "FAIL"}  ${r.name}`);
    console.log(`         steps=${r.allSteps.length}/15  tiktokInStep9=${r.tiktokInStep9}  marker=${r.hasMarker}`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
