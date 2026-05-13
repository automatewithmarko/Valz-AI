import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  extractTextFromFile,
  getExtension,
  isSupportedKbExtension,
  MAX_KB_FILE_BYTES,
  SUPPORTED_KB_EXTENSIONS,
} from "@/lib/extract-text";

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

  // Need the user's primary brand DNA to satisfy the FK on brand_dna_documents.
  const { data: brandDna, error: dnaErr } = await supabase
    .from("brand_dnas")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_primary", true)
    .single();

  if (dnaErr || !brandDna) {
    return json(
      { error: "You need an Aligned Income Blueprint before uploading knowledge bases." },
      400
    );
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

  const storagePath = `${user.id}/${crypto.randomUUID()}${ext}`;
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
  if (uploadErr) return json({ error: uploadErr.message }, 500);

  const { data: inserted, error: insertErr } = await supabase
    .from("brand_dna_documents")
    .insert({
      brand_dna_id: brandDna.id,
      user_id: user.id,
      label,
      when_to_use: whenToUse,
      file_name: file.name,
      file_path: storagePath,
      content_text: extracted.text,
    })
    .select("id, label, when_to_use, file_name, file_path, created_at")
    .single();

  if (insertErr) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return json({ error: insertErr.message }, 500);
  }

  return json({ document: inserted, truncated: extracted.truncated }, 200);
}
