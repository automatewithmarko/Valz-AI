// Shared types for the admin panel. The admin RPCs aren't part of the
// generated Supabase Database type, so we type their shapes here and the
// rpc.ts layer validates/casts the results.

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export const TICKET_STATUSES: TicketStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];

export interface AdminAuthRow {
  id: string;
  email: string;
  password_hash: string;
  is_super: boolean;
}

export interface AdminListRow {
  id: string;
  email: string;
  is_super: boolean;
  created_at: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  name: string;
  email: string;
  subject: string | null;
  message: string;
  status: TicketStatus;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanTierStat {
  name: string;
  display_name: string;
  price_cents: number;
  active_count: number;
  mrr_cents: number;
}

export interface DashboardStats {
  kpis: {
    total_users: number;
    active_subscriptions: number;
    total_subscriptions: number;
    mrr_cents: number;
    arr_cents: number;
    blueprints_sold: number;
    blueprint_revenue_cents: number;
    credit_topup_revenue_cents: number;
    credit_topup_count: number;
    one_time_revenue_cents: number;
    subscription_revenue_estimate_cents: number;
    total_revenue_cents: number;
    active_brand_dnas: number;
    total_credit_balance: number;
    open_tickets: number;
  };
  tiers: PlanTierStat[];
  sub_status: {
    active: number;
    cancelled: number;
    past_due: number;
    trialing: number;
  };
  signups_by_month: { month: string; count: number }[];
  revenue_by_month: { month: string; cents: number }[];
  recent_users: {
    id: string;
    full_name: string;
    email: string;
    created_at: string;
    plan_display_name: string | null;
    has_blueprint: boolean;
  }[];
}

export interface AdminUserRow {
  id: string;
  full_name: string;
  email: string;
  created_at: string;
  credit_balance: number | null;
  plan_display_name: string | null;
  subscription_status: string | null;
  has_blueprint: boolean;
}

export interface UsersResponse {
  total: number;
  users: AdminUserRow[];
}
