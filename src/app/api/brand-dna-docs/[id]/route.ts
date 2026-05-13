import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "brand-documents";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
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
