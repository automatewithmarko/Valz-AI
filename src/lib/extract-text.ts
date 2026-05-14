import mammoth from "mammoth";

// mammoth ships `convertToMarkdown` at runtime but its .d.ts only declares
// convertToHtml + extractRawText. Cast to access the markdown converter.
type MammothMarkdown = {
  convertToMarkdown: (input: { buffer: Buffer }) => Promise<{ value: string }>;
};
const mammothExtended = mammoth as unknown as typeof mammoth & MammothMarkdown;

export const SUPPORTED_KB_EXTENSIONS = [".txt", ".md", ".docx"] as const;
export const MAX_KB_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_KB_CONTENT_CHARS = 100_000; // hard cap on what gets injected into prompt

export type SupportedKbExtension = (typeof SUPPORTED_KB_EXTENSIONS)[number];

export function getExtension(fileName: string): string {
  const idx = fileName.lastIndexOf(".");
  return idx === -1 ? "" : fileName.slice(idx).toLowerCase();
}

export function isSupportedKbExtension(ext: string): ext is SupportedKbExtension {
  return (SUPPORTED_KB_EXTENSIONS as readonly string[]).includes(ext);
}

// Clean up text for embedding + system-prompt injection.
//
// Goals:
//   - keep markdown structure (headings, lists, bold) intact — the
//     embedding model and the chat model both use structural cues
//   - strip noise (BOM, zero-width chars, runs of blank lines) so we
//     spend tokens on actual content
//   - normalise line endings so chunk boundaries and similarity scores
//     don't drift based on platform
function normaliseText(raw: string): string {
  return (
    raw
      // Strip UTF-8 BOM that some Windows editors prepend — it shows up
      // as an invisible char that confuses tokenisers.
      .replace(/^﻿/, "")
      // Drop zero-width spaces, joiners, and the non-breaking-space-as-
      // markdown-trick that some exporters use. Keep regular spaces.
      // ​ = ZWSP, ‌ = ZWNJ, ‍ = ZWJ, ﻿ = BOM,
      // ­ = soft hyphen.
      .replace(/[​-‍﻿­]/g, "")
      // Normalise line endings.
      .replace(/\r\n?/g, "\n")
      // Mammoth's markdown converter aggressively escapes punctuation
      // that could *theoretically* trigger markdown syntax (e.g. `1.` for
      // ordered lists). For ingestion into an LLM prompt this just adds
      // noise tokens and zero semantic value — strip back to plain text
      // for these safe punctuation chars. We deliberately leave `\*` and
      // `\_` alone in case they were legitimate literal-emphasis escapes.
      .replace(/\\([.,()!?:'\-])/g, "$1")
      // Trim trailing whitespace on each line so embeddings aren't
      // affected by invisible spaces.
      .replace(/[ \t]+(?=\n)/g, "")
      // Collapse 3+ consecutive blank lines to 2 (paragraph break is
      // enough; longer gaps just waste tokens).
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

export async function extractTextFromFile(
  file: File
): Promise<{ text: string; truncated: boolean }> {
  const ext = getExtension(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  let raw: string;
  if (ext === ".docx") {
    // convertToMarkdown preserves headings (`#`), lists (`-` / `1.`),
    // bold/italic, and links — all the structure the LLM needs to follow
    // the doc's hierarchy. extractRawText would flatten everything to
    // unformatted prose, which hurts retrieval relevance and the model's
    // ability to quote precisely.
    const md = await mammothExtended.convertToMarkdown({ buffer });
    raw = md.value;
  } else if (ext === ".txt" || ext === ".md") {
    raw = buffer.toString("utf-8");
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  const normalised = normaliseText(raw);
  if (normalised.length > MAX_KB_CONTENT_CHARS) {
    return { text: normalised.slice(0, MAX_KB_CONTENT_CHARS), truncated: true };
  }
  return { text: normalised, truncated: false };
}
