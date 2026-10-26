/**
 * Session cookie shared by proxy.ts and route handlers.
 * Value is `<role>.<issuedAt>.<hmac>`, signed with DASHBOARD_PASSWORD.
 * Uses WebCrypto so the same code runs in the proxy and in routes.
 */

export const COOKIE_NAME = "tracekit_auth";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type Role = "owner" | "demo";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmacSha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(process.env.DASHBOARD_PASSWORD!),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return bytesToHex(new Uint8Array(signature));
}

function constantTimeEqual(a: string, b: string): boolean {
  // A malformed cookie is just unauthenticated
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function signSession(role: Role): Promise<string> {
  const payload = `${role}.${Date.now()}`;
  return `${payload}.${await hmacSha256(payload)}`;
}

/** Returns the role for a valid, unexpired cookie value, otherwise null. */
export async function verifySession(value: string | undefined): Promise<Role | null> {
  if (!value) return null;
  const [role, issuedAt, signature] = value.split(".");
  if ((role !== "owner" && role !== "demo") || !issuedAt || !signature) return null;

  const issued = Number(issuedAt);
  if (!Number.isFinite(issued) || Date.now() - issued > SESSION_MAX_AGE_SECONDS * 1000) return null;

  try {
    const expected = await hmacSha256(`${role}.${issuedAt}`);
    return constantTimeEqual(signature, expected) ? role : null;
  } catch {
    return null;
  }
}
