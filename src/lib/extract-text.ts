import mammoth from "mammoth";

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

export async function extractTextFromFile(
  file: File
): Promise<{ text: string; truncated: boolean }> {
  const ext = getExtension(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  let raw: string;
  if (ext === ".docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    raw = value;
  } else if (ext === ".txt" || ext === ".md") {
    raw = buffer.toString("utf-8");
  } else {
    throw new Error(`Unsupported file type: ${ext}`);
  }

  const normalised = raw.replace(/\r\n/g, "\n").trim();
  if (normalised.length > MAX_KB_CONTENT_CHARS) {
    return { text: normalised.slice(0, MAX_KB_CONTENT_CHARS), truncated: true };
  }
  return { text: normalised, truncated: false };
}
