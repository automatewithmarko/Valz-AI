// Impersonation session cookie — set when an admin "signs in as" a user, so
// the app can show an exit banner and the stop route can close the audit log
// entry. Distinct from the user's actual Supabase session (which is what
// makes the app treat them as that user).
//
// Server-only.
import { cookies } from "next/headers";
import { signPayload, verifyPayload } from "./signing";

export const IMPERSONATION_COOKIE = "valz_impersonation";
const CONTEXT = "admin-impersonation-v1";
const TTL_SECONDS = 60 * 60 * 2; // 2 hours

export interface ImpersonationSession {
  adminId: string;
  adminEmail: string;
  userId: string;
  userEmail: string;
  logId: string;
  exp: number;
}

export function signImpersonation(
  payload: Omit<ImpersonationSession, "exp"> & { exp?: number }
): string {
  const body: ImpersonationSession = {
    ...payload,
    exp: payload.exp ?? Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  return signPayload(body, CONTEXT);
}

export function verifyImpersonation(
  token: string | undefined | null
): ImpersonationSession | null {
  const parsed = verifyPayload<ImpersonationSession>(token, CONTEXT);
  if (!parsed || typeof parsed.exp !== "number") return null;
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return parsed;
}

export async function getImpersonationSession(): Promise<ImpersonationSession | null> {
  const store = await cookies();
  return verifyImpersonation(store.get(IMPERSONATION_COOKIE)?.value);
}

export async function setImpersonationCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(IMPERSONATION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function clearImpersonationCookie(): Promise<void> {
  const store = await cookies();
  store.set(IMPERSONATION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// ── Admin "return" session ───────────────────────────────────────────
// Because admin status is now the Supabase session itself, impersonating a
// user replaces the admin's session in the browser. We stash the admin's
// own tokens in a separate signed httpOnly cookie so that exiting
// impersonation can restore the admin session instead of logging them out.

export const ADMIN_RETURN_COOKIE = "valz_admin_return";
const RETURN_CONTEXT = "admin-return-session-v1";

export interface AdminReturnTokens {
  accessToken: string;
  refreshToken: string;
  exp: number;
}

export function signAdminReturn(
  tokens: Omit<AdminReturnTokens, "exp"> & { exp?: number }
): string {
  const body: AdminReturnTokens = {
    ...tokens,
    exp: tokens.exp ?? Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  return signPayload(body, RETURN_CONTEXT);
}

export async function getAdminReturn(): Promise<AdminReturnTokens | null> {
  const store = await cookies();
  const parsed = verifyPayload<AdminReturnTokens>(
    store.get(ADMIN_RETURN_COOKIE)?.value,
    RETURN_CONTEXT
  );
  if (!parsed || typeof parsed.exp !== "number") return null;
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
  return parsed;
}

export async function setAdminReturnCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_RETURN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function clearAdminReturnCookie(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_RETURN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
