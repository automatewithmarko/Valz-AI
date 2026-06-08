// Typed wrappers around the admin SECURITY DEFINER RPCs. These run with
// the anon key but pass STRIPE_DB_BRIDGE_SECRET, which the functions check
// via app_secret_check — that secret (not a Supabase auth role) is the gate.
//
// Server-only — never import from a client component.
import { createClient } from "@supabase/supabase-js";
import type {
  AdminAuthRow,
  AdminListRow,
  DashboardStats,
  Ticket,
  TicketStatus,
  UsersResponse,
} from "./types";

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase environment is not configured");
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function secret(): string {
  const s = process.env.STRIPE_DB_BRIDGE_SECRET;
  if (!s) throw new Error("STRIPE_DB_BRIDGE_SECRET is not set");
  return s;
}

// These RPCs aren't in the generated Database type, so cast the client to a
// minimal rpc-capable shape. Call method-style (client.rpc) so supabase-js
// keeps its `this` binding — calling a detached `rpc` reference throws
// "Cannot read properties of undefined (reading 'rest')".
interface RpcCapable {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
  const client = sb() as unknown as RpcCapable;
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.message);
  return data as T;
}

// ── Admin accounts ───────────────────────────────────────────────────

export async function adminGetByEmail(email: string): Promise<AdminAuthRow | null> {
  const rows = await callRpc<AdminAuthRow[]>("admin_get_by_email", {
    p_secret: secret(),
    p_email: email,
  });
  return rows?.[0] ?? null;
}

export async function adminGetById(id: string): Promise<AdminAuthRow | null> {
  const rows = await callRpc<AdminAuthRow[]>("admin_get_by_id", {
    p_secret: secret(),
    p_id: id,
  });
  return rows?.[0] ?? null;
}

export async function adminList(): Promise<AdminListRow[]> {
  return (await callRpc<AdminListRow[]>("admin_list", { p_secret: secret() })) ?? [];
}

export async function adminCreate(
  email: string,
  passwordHash: string
): Promise<AdminListRow> {
  const rows = await callRpc<AdminListRow[]>("admin_create", {
    p_secret: secret(),
    p_email: email,
    p_password_hash: passwordHash,
  });
  return rows[0];
}

export async function adminDelete(id: string): Promise<boolean> {
  return callRpc<boolean>("admin_delete", { p_secret: secret(), p_id: id });
}

export async function adminUpdatePassword(id: string, newHash: string): Promise<void> {
  await callRpc<null>("admin_update_password", {
    p_secret: secret(),
    p_id: id,
    p_new_hash: newHash,
  });
}

// ── Support tickets ──────────────────────────────────────────────────

export async function supportCreateTicket(input: {
  name: string;
  email: string;
  subject?: string | null;
  message: string;
  userId?: string | null;
}): Promise<{ id: string; ticket_number: string; created_at: string }> {
  const rows = await callRpc<{ id: string; ticket_number: string; created_at: string }[]>(
    "support_create_ticket",
    {
      p_secret: secret(),
      p_name: input.name,
      p_email: input.email,
      p_subject: input.subject ?? null,
      p_message: input.message,
      p_user_id: input.userId ?? null,
    }
  );
  return rows[0];
}

export async function adminListTickets(status?: TicketStatus | null): Promise<Ticket[]> {
  return (
    (await callRpc<Ticket[]>("admin_list_tickets", {
      p_secret: secret(),
      p_status: status ?? null,
    })) ?? []
  );
}

export async function adminUpdateTicket(id: string, status: TicketStatus): Promise<void> {
  await callRpc<null>("admin_update_ticket", {
    p_secret: secret(),
    p_id: id,
    p_status: status,
  });
}

// ── Stats & users ────────────────────────────────────────────────────

export async function adminDashboardStats(): Promise<DashboardStats> {
  return callRpc<DashboardStats>("admin_dashboard_stats", { p_secret: secret() });
}

export async function adminListUsers(
  opts: { limit?: number; offset?: number; search?: string | null } = {}
): Promise<UsersResponse> {
  return callRpc<UsersResponse>("admin_list_users", {
    p_secret: secret(),
    p_limit: opts.limit ?? 50,
    p_offset: opts.offset ?? 0,
    p_search: opts.search ?? null,
  });
}
