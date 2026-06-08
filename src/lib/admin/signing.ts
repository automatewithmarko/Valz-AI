// Generic HMAC-signed token helpers, keyed off STRIPE_DB_BRIDGE_SECRET with
// a per-use context string so different cookies can't be swapped. Used by
// the impersonation cookie (the admin auth session has its own copy in
// session.ts and is intentionally left untouched).
//
// Server-only.
import { createHmac, timingSafeEqual } from "crypto";

function deriveKey(context: string): Buffer {
  const base = process.env.STRIPE_DB_BRIDGE_SECRET;
  if (!base) throw new Error("STRIPE_DB_BRIDGE_SECRET is not set");
  return createHmac("sha256", base).update(context).digest();
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

export function signPayload(payload: object, context: string): string {
  const data = b64urlEncode(JSON.stringify(payload));
  const sig = b64urlEncode(createHmac("sha256", deriveKey(context)).update(data).digest());
  return `${data}.${sig}`;
}

export function verifyPayload<T>(
  token: string | undefined | null,
  context: string
): T | null {
  if (!token) return null;
  const [data, sig] = token.split(".");
  if (!data || !sig) return null;
  const expected = createHmac("sha256", deriveKey(context)).update(data).digest();
  let provided: Buffer;
  try {
    provided = b64urlDecode(sig);
  } catch {
    return null;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  try {
    return JSON.parse(b64urlDecode(data).toString("utf8")) as T;
  } catch {
    return null;
  }
}
