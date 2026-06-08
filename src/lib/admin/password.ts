// Password hashing for admin accounts. Uses Node's built-in scrypt (no
// extra dependency). Format: "<saltHex>:<hashHex>". Server-only — never
// import from a client component.
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, KEYLEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  const derived = scryptSync(password, Buffer.from(saltHex, "hex"), KEYLEN);
  // Lengths must match for timingSafeEqual; guard so a malformed hash can't throw.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

// Lightweight policy used by the create-admin / change-password flows.
export function passwordIssue(password: string): string | null {
  if (typeof password !== "string" || password.length < 6) {
    return "Password must be at least 6 characters.";
  }
  if (password.length > 200) return "Password is too long.";
  return null;
}
