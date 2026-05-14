import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  extractTextFromFile,
  getExtension,
  isSupportedKbExtension,
  MAX_KB_FILE_BYTES,
  SUPPORTED_KB_EXTENSIONS,
} from "@/lib/extract-text";
import { embedDocHint } from "@/lib/brand-dna-retrieval";

const BUCKET = "brand-documents";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data, error } = await supabase
    .from("brand_dna_documents")
    .select("id, label, when_to_use, file_name, file_path, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return json({ error: error.message }, 500);
  return json({ documents: data ?? [] }, 200);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "Invalid form data" }, 400);
  }

  const file = form.get("file");
  const label = (form.get("label") as string | null)?.trim() ?? "";
  const whenToUse = (form.get("when_to_use") as string | null)?.trim() ?? "";

  if (!(file instanceof File)) return json({ error: "Missing file" }, 400);
  if (!label) return json({ error: "Missing name" }, 400);
  if (!whenToUse) return json({ error: "Missing 'when to use' description" }, 400);

  const ext = getExtension(file.name);
  if (!isSupportedKbExtension(ext)) {
    return json(
      { error: `Unsupported file type. Allowed: ${SUPPORTED_KB_EXTENSIONS.join(", ")}` },
      400
    );
  }
  if (file.size > MAX_KB_FILE_BYTES) {
    return json({ error: `File too large. Max ${MAX_KB_FILE_BYTES / 1024 / 1024}MB.` }, 400);
  }

  // Need a brand_dna row to satisfy the FK on brand_dna_documents, but we
  // don't require the user to have *built* the Aligned Income Blueprint —
  // knowledge bases are a subscriber feature, not gated on the $97 one-time
  // purchase. If the user doesn't have a primary brand_dna row yet, auto-
  // create an empty one (status defaults to 'not_configured') so the upload
  // still works and the existing blueprint flow can fill it in later.
  let brandDnaId: string | null = null;
  {
    const { data: existing } = await supabase
      .from("brand_dnas")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle();
    if (existing) {
      brandDnaId = existing.id;
    } else {
      const { data: created, error: createErr } = await supabase
        .from("brand_dnas")
        .insert({ user_id: user.id, is_primary: true })
        .select("id")
        .single();
      if (createErr || !created) {
        return json(
          { error: createErr?.message ?? "Could not initialise brand profile" },
          500
        );
      }
      brandDnaId = created.id;
    }
  }

  let extracted: { text: string; truncated: boolean };
  try {
    extracted = await extractTextFromFile(file);
  } catch (err) {
    return json({ error: (err as Error).message }, 400);
  }
  if (!extracted.text) {
    return json({ error: "Could not extract any text from this file." }, 400);
  }

  // Don't trust the browser's reported MIME — it's inconsistent across OSes
  // (e.g. Safari sends "text/markdown" for .md but our bucket may not accept
  // that exact variant). Map by extension to a canonical MIME the bucket
  // allows, falling back to text/plain for safety.
  const canonicalMime: Record<string, string> = {
    ".txt": "text/plain",
    ".md": "text/markdown",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  const storagePath = `${user.id}/${crypto.randomUUID()}${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: canonicalMime[ext] ?? "text/plain",
      upsert: false,
    });
  if (uploadErr) return json({ error: uploadErr.message }, 500);

  // Embed the (label + when_to_use) hint so the chat route can do
  // similarity retrieval against it. Best-effort: if the embedding API
  // fails (missing key, rate limit, etc.) we still let the upload through
  // and the chat route falls back to the legacy "include all un-embedded
  // docs" path so the doc still works, just less precisely.
  const embedding = await embedDocHint(label, whenToUse).catch(() => null);

  const { data: inserted, error: insertErr } = await supabase
    .from("brand_dna_documents")
    .insert({
      brand_dna_id: brandDnaId,
      user_id: user.id,
      label,
      when_to_use: whenToUse,
      file_name: file.name,
      file_path: storagePath,
      content_text: extracted.text,
      // pgvector wire-type is `string` in generated types but supabase-js
      // accepts a raw number[] and serialises it. Cast to silence TS.
      when_to_use_embedding: embedding as unknown as string | null,
    })
    .select("id, label, when_to_use, file_name, file_path, created_at")
    .single();

  if (insertErr) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return json({ error: insertErr.message }, 500);
  }

  return json({ document: inserted, truncated: extracted.truncated }, 200);
}
