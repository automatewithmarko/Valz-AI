import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { embedDocHint } from "@/lib/brand-dna-retrieval";

const BUCKET = "brand-documents";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Edit a KB doc. Only when_to_use is mutable — the label, file, and
// content_text stay locked because changing those should be a re-upload.
// Re-embeds label + new when_to_use so retrieval picks up the new hint
// immediately. Best-effort embedding: a failure won't block the update;
// the old embedding stays in place until the next successful change.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: { when_to_use?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const whenToUse = body.when_to_use?.trim() ?? "";
  if (!whenToUse) {
    return json({ error: "Missing 'when to use' description" }, 400);
  }

  // Need the existing label to re-embed against (label + when_to_use).
  const { data: existing, error: fetchErr } = await supabase
    .from("brand_dna_documents")
    .select("id, label")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !existing) return json({ error: "Not found" }, 404);

  const embedding = await embedDocHint(existing.label, whenToUse).catch(
    () => null
  );

  const updatePayload: {
    when_to_use: string;
    when_to_use_embedding?: string | null;
  } = { when_to_use: whenToUse };
  // Only overwrite the embedding column when we successfully computed a
  // new one — otherwise we'd null out a previously-good embedding for a
  // transient API hiccup.
  if (embedding) {
    updatePayload.when_to_use_embedding = embedding as unknown as string;
  }

  const { data: updated, error: updateErr } = await supabase
    .from("brand_dna_documents")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, label, when_to_use, file_name, file_path, created_at")
    .single();

  if (updateErr) return json({ error: updateErr.message }, 500);
  return json({ document: updated }, 200);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const { data: doc, error: fetchErr } = await supabase
    .from("brand_dna_documents")
    .select("id, file_path")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (fetchErr || !doc) return json({ error: "Not found" }, 404);

  if (doc.file_path) {
    await supabase.storage.from(BUCKET).remove([doc.file_path]);
  }

  const { error: delErr } = await supabase
    .from("brand_dna_documents")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (delErr) return json({ error: delErr.message }, 500);
  return json({ success: true }, 200);
}
