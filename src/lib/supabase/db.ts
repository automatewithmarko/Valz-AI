import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "./types";

type TypedClient = SupabaseClient<Database>;

// ─── Profiles ──────────────────────────────────────────────────────
export async function getProfile(supabase: TypedClient, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

// ─── Credits ───────────────────────────────────────────────────────
export async function getCredits(supabase: TypedClient, userId: string) {
  const { data, error } = await supabase
    .from("credits")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows
  return data;
}

export async function decrementCredit(supabase: TypedClient, userId: string) {
  const { data, error } = await supabase.rpc("decrement_credit", {
    user_uuid: userId,
  });
  if (error) throw error;
  return data as number;
}

export async function addCredits(
  supabase: TypedClient,
  userId: string,
  amount: number,
  paidCents?: number,
  paymentIntentId?: string
) {
  const { data, error } = await supabase.rpc("add_credits", {
    user_uuid: userId,
    credit_amount: amount,
    paid_cents: paidCents,
    payment_intent_id: paymentIntentId,
  });
  if (error) throw error;
  return data as number;
}

// ─── Plans ─────────────────────────────────────────────────────────
export async function getPlans(supabase: TypedClient) {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("is_active", true)
    .order("price_cents", { ascending: true });
  if (error) throw error;
  return data;
}

// ─── Subscriptions ─────────────────────────────────────────────────
export async function getSubscription(supabase: TypedClient, userId: string) {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*, plans(*)")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

// ─── Brand DNAs ────────────────────────────────────────────────────
export async function getBrandDNAs(supabase: TypedClient, userId: string) {
  const { data, error } = await supabase
    .from("brand_dnas")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPrimaryBrandDNA(supabase: TypedClient, userId: string) {
  const { data, error } = await supabase
    .from("brand_dnas")
    .select("*")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function createBrandDNA(
  supabase: TypedClient,
  userId: string,
  brandName: string = ""
) {
  const { data, error } = await supabase
    .from("brand_dnas")
    .insert({ user_id: userId, brand_name: brandName, is_primary: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBrandDNA(
  supabase: TypedClient,
  brandDnaId: string,
  updates: {
    brand_name?: string;
    status?: string;
    blueprint_content?: string;
    is_primary?: boolean;
  }
) {
  const { data, error } = await supabase
    .from("brand_dnas")
    .update(updates)
    .eq("id", brandDnaId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Brand DNA Chat Messages ───────────────────────────────────────
export async function getBrandDNAChatMessages(
  supabase: TypedClient,
  brandDnaId: string
) {
  const { data, error } = await supabase
    .from("brand_dna_chat_messages")
    .select("*")
    .eq("brand_dna_id", brandDnaId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function insertBrandDNAChatMessage(
  supabase: TypedClient,
  message: {
    brand_dna_id: string;
    user_id: string;
    role: string;
    content: string;
  }
) {
  const { data, error } = await supabase
    .from("brand_dna_chat_messages")
    .insert(message)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateBrandDNAChatMessage(
  supabase: TypedClient,
  messageId: string,
  content: string
) {
  const { error } = await supabase
    .from("brand_dna_chat_messages")
    .update({ content })
    .eq("id", messageId);
  if (error) throw error;
}

// ─── Brand DNA Documents ──────────────────────────────────────────
export async function getBrandDNADocuments(
  supabase: TypedClient,
  brandDnaId: string
) {
  const { data, error } = await supabase
    .from("brand_dna_documents")
    .select("*")
    .eq("brand_dna_id", brandDnaId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

// ─── Chats ─────────────────────────────────────────────────────────
export async function getChats(supabase: TypedClient, userId: string) {
  const { data, error } = await supabase
    .from("chats")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createChat(
  supabase: TypedClient,
  userId: string,
  title: string
) {
  const { data, error } = await supabase
    .from("chats")
    .insert({ user_id: userId, title })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateChatTitle(
  supabase: TypedClient,
  chatId: string,
  title: string
) {
  const { error } = await supabase
    .from("chats")
    .update({ title })
    .eq("id", chatId);
  if (error) throw error;
}

export async function deleteChat(supabase: TypedClient, chatId: string) {
  // Delete messages first (cascade would handle this but let's be explicit)
  await supabase.from("chat_messages").delete().eq("chat_id", chatId);
  const { error } = await supabase.from("chats").delete().eq("id", chatId);
  if (error) throw error;
}

// ─── Chat Messages ─────────────────────────────────────────────────
export async function getChatMessages(
  supabase: TypedClient,
  chatId: string
) {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function insertChatMessage(
  supabase: TypedClient,
  message: {
    chat_id: string;
    user_id: string;
    role: string;
    content: string;
  }
) {
  const { data, error } = await supabase
    .from("chat_messages")
    .insert(message)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateChatMessage(
  supabase: TypedClient,
  messageId: string,
  content: string
) {
  const { error } = await supabase
    .from("chat_messages")
    .update({ content })
    .eq("id", messageId);
  if (error) throw error;
}

// ─── Brand DNA Purchases ──────────────────────────────────────────
export async function getBrandDNAPurchase(
  supabase: TypedClient,
  userId: string
) {
  const { data, error } = await supabase
    .from("brand_dna_purchases")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

/** Create a demo Brand DNA purchase (no actual payment). */
export async function createDemoBrandDNAPurchase(
  supabase: TypedClient,
  userId: string
) {
  // Use upsert to handle the UNIQUE constraint on user_id
  const { data, error } = await supabase
    .from("brand_dna_purchases")
    .upsert(
      {
        user_id: userId,
        price_cents: 9700,
        status: "active",
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}
