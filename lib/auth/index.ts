import { cookies } from "next/headers";
import { COOKIE_NAME, SESSION_MAX_AGE_SECONDS, signSession, verifySession, type Role } from "./session";

export type { Role };

/**
 * Limitation: the session is signed with DASHBOARD_PASSWORD itself. That is
 * acceptable for a solo deployment but should be a dedicated secret in a
 * multi-user setup. Changing the password signs everyone out.
 */
export async function createAuthCookie(role: Role): Promise<{
  name: string;
  value: string;
  options: Record<string, unknown>;
}> {
  return {
    name: COOKIE_NAME,
    value: await signSession(role),
    options: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax" as const,
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  };
}

export async function getRole(): Promise<Role | null> {
  const cookieStore = await cookies();
  return verifySession(cookieStore.get(COOKIE_NAME)?.value);
}

/** Any signed-in session, owner or read-only demo. Use for reads. */
export async function isAuthenticated(): Promise<boolean> {
  return (await getRole()) !== null;
}

/** The owner session. Use for writes, so the demo stays read-only even where the proxy lets a path through. */
export async function isOwner(): Promise<boolean> {
  return (await getRole()) === "owner";
}

export function hasValidIngestToken(request: Request): boolean {
  const token = request.headers.get("x-tracekit-token");
  return token === process.env.TRACEKIT_INGEST_TOKEN;
}
