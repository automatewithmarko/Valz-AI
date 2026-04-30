// Reads scripts/kb_chunks.seed.json and uploads chunks to Supabase via the
// kb_chunks_seed RPC (SECURITY DEFINER) using the anon key.
//
// Run after `node scripts/ingest-kb.mjs`. To re-seed in the future:
//   1. Re-create the temporary write RPC by running this SQL in the Supabase SQL editor:
//
//        create or replace function public.kb_chunks_seed(payload jsonb)
//        returns int language plpgsql security definer
//        set search_path = public, extensions as $$
//        declare inserted int;
//        begin
//          insert into public.kb_chunks
//            (section_path, heading, content, metadata, embedding, token_count)
//          select r->>'section_path', r->>'heading', r->>'content',
//                 r->'metadata', (r->>'embedding')::extensions.vector,
//                 (r->>'token_count')::int
//          from jsonb_array_elements(payload) r;
//          get diagnostics inserted = row_count;
//          return inserted;
//        end; $$;
//        grant execute on function public.kb_chunks_seed(jsonb) to anon, authenticated;
//
//   2. truncate public.kb_chunks; (if replacing)
//   3. node scripts/upsert-kb.mjs
//   4. revoke execute on function public.kb_chunks_seed(jsonb) from anon, authenticated;
//      drop function public.kb_chunks_seed(jsonb);

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SEED = resolve(ROOT, "scripts", "kb_chunks.seed.json");
const ENV_PATH = resolve(ROOT, ".env.local");
const BATCH_SIZE = 10;

async function loadEnv() {
  const text = await readFile(ENV_PATH, "utf8");
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

async function rpc(fnName, args) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/${fnName}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`RPC ${fnName} failed (${res.status}): ${err}`);
  }
  return res.json();
}

(async () => {
  await loadEnv();

  console.log("Loading seed JSON...");
  const all = JSON.parse(await readFile(SEED, "utf8"));
  // Drop the empty H1-only "ROOT" chunk
  const chunks = all.filter(
    (c) => c.content && c.content.length > 80 && c.section_path !== "CONTENT STRATEGY KNOWLEDGE BASE"
  );
  console.log(`${chunks.length} chunks to upsert`);

  // Convert embedding arrays to pgvector text form ("[1,2,3]") so the
  // JSONB ->> 'embedding' returns a parseable string.
  const payloadAll = chunks.map((c) => ({
    section_path: c.section_path,
    heading: c.heading,
    content: c.content,
    metadata: c.metadata,
    embedding: `[${c.embedding.join(",")}]`,
    token_count: c.token_count,
  }));

  let total = 0;
  for (let i = 0; i < payloadAll.length; i += BATCH_SIZE) {
    const batch = payloadAll.slice(i, i + BATCH_SIZE);
    const inserted = await rpc("kb_chunks_seed", { payload: batch });
    total += inserted;
    console.log(`  batch ${i / BATCH_SIZE + 1}: +${inserted} (total ${total})`);
  }
  console.log(`\nDone. Inserted ${total} rows into kb_chunks.`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
