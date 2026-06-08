// Admin access is derived from the logged-in Supabase user: an "admin" is a
// user whose email is on the admins allowlist. There is no separate admin
// login — they sign into the main app and get an Admin Panel button.
//
// Server-only — never import from a client component.
import { createClient } from "@/lib/supabase/server";
import { adminGetByEmail } from "./rpc";

export interface AdminUser {
  /** admins.id (allowlist row id) */
  adminId: string;
  /** auth.users id of the signed-in admin */
  userId: string;
  email: string;
  isSuper: boolean;
}

// Returns the admin record for the current request's Supabase user, or null
// if not signed in / not on the allowlist. Used to gate every /admin page
// and /api/admin route.
export async function getAdminUser(): Promise<AdminUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const admin = await adminGetByEmail(user.email);
  if (!admin) return null;

  return {
    adminId: admin.id,
    userId: user.id,
    email: admin.email,
    isSuper: admin.is_super,
  };
}
