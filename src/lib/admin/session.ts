// Admin session cookie: a compact HMAC-signed token, independent from the
// Supabase user auth used by the rest of the app. The signing key is
// derived from STRIPE_DB_BRIDGE_SECRET (a server-only, high-entropy secret
// already present in the environment) so no new env var is required.
//
// Server-only — never import from a client component.
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "valz_admin_session";
const TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface AdminSession {
  sub: string; // admin id
  email: string;
  isSuper: boolean;
  exp: number; // unix seconds
}

function signingKey(): Buffer {
  const base = process.env.STRIPE_DB_BRIDGE_SECRET;
  if (!base) throw new Error("STRIPE_DB_BRIDGE_SECRET is not set");
  return createHmac("sha256", base).update("admin-session-v1").digest();
}

function b64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

export function signSession(payload: Omit<AdminSession, "exp"> & { exp?: number }): string {
  const body: AdminSession = {
    sub: payload.sub,
    email: payload.email,
    isSuper: payload.isSuper,
    exp: payload.exp ?? Math.floor(Date.now() / 1000) + TTL_SECONDS,
  };
  const data = b64urlEncode(JSON.stringify(body));
  const sig = b64urlEncode(createHmac("sha256", signingKey()).update(data).digest());
  return `${data}.${sig}`;
}

export function verifySession(token: string | undefined | null): AdminSession | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = createHmac("sha256", signingKey()).update(data).digest();
  let provided: Buffer;
  try {
    provided = b64urlDecode(sig);
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  let parsed: AdminSession;
  try {
    parsed = JSON.parse(b64urlDecode(data).toString("utf8")) as AdminSession;
  } catch {
    return null;
  }
  if (!parsed.sub || typeof parsed.exp !== "number") return null;
  if (parsed.exp < Math.floor(Date.now() / 1000)) return null; // expired
  return parsed;
}

// ── Cookie helpers (App Router) ──────────────────────────────────────

export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  return verifySession(store.get(ADMIN_COOKIE)?.value);
}

export async function setAdminCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: TTL_SECONDS,
  });
}

export async function clearAdminCookie(): Promise<void> {
  const store = await cookies();
  store.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
