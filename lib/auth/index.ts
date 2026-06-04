import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "tracekit_auth";

/**
 * Signs a value using HMAC-SHA256 with DASHBOARD_PASSWORD as the secret.
 * Limitation: using the password itself as the HMAC key is acceptable for
 * single-user/solo deployments but should be replaced with a dedicated
 * secret in a multi-user setup.
 */
function sign(value: string): string {
  const secret = process.env.DASHBOARD_PASSWORD!;
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function createAuthCookie(): {
  name: string;
  value: string;
  options: Record<string, unknown>;
} {
  const payload = "authenticated";
  const signature = sign(payload);
  const value = `${payload}.${signature}`;
  return {
    name: COOKIE_NAME,
    value,
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 7, // 7 days
    },
  };
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(COOKIE_NAME);
  if (!cookie) return false;

  const [payload, signature] = cookie.value.split(".");
  if (!payload || !signature) return false;

  const expected = sign(payload);
  return crypto.timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex")
  );
}

export function hasValidIngestToken(request: Request): boolean {
  const token = request.headers.get("x-tracekit-token");
  return token === process.env.TRACEKIT_INGEST_TOKEN;
}
