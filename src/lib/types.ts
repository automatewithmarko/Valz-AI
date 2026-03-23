import type { Tables } from "@/lib/supabase/types";

// Re-export database row types for convenience
export type Profile = Tables<"profiles">;
export type Credits = Tables<"credits">;
export type Plan = Tables<"plans">;
export type Subscription = Tables<"subscriptions">;
export type BrandDNARow = Tables<"brand_dnas">;
export type BrandDNADocument = Tables<"brand_dna_documents">;
export type BrandDNAChatMessage = Tables<"brand_dna_chat_messages">;
export type ChatRow = Tables<"chats">;
export type ChatMessageRow = Tables<"chat_messages">;
export type CreditTransaction = Tables<"credit_transactions">;
export type BrandDNAPurchase = Tables<"brand_dna_purchases">;

// ─── App-level types used by components ────────────────────────────

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  credits: number;
  maxCredits: number;
  brandDNA: BrandDNA;
  hasActiveSubscription: boolean;
  planName: string | null;
  /** true if the user has chosen either self-serve (brand DNA) or consulting (subscription) */
  hasSelectedProgram: boolean;
  /** true if the user has purchased the Brand DNA Blueprint ($97 one-time) */
  hasBrandDNAPurchase: boolean;
}

export interface BrandDNA {
  configured: boolean;
  brandName: string;
  status: "active" | "inactive" | "not_configured";
  documents: BrandDNADocumentUI[];
}

export interface BrandDNADocumentUI {
  label: string;
  fileName: string | null;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
