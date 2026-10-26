import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_NAME, verifySession } from "@/lib/auth/session";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/ingest", "/api/experiments"];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// The demo may run the judge (it costs money, so it is capped) but write nothing else
const DEMO_JUDGE_PATH = "/api/judge/score";
const DEMO_JUDGE_LIMIT_PER_HOUR = 40;
// Raw export would hand out every conversation in bulk
const DEMO_BLOCKED_READS = ["/api/export"];

// In memory, so per server instance: a cost cap, not a guarantee
let judgeWindow = { start: 0, count: 0 };

function takeDemoJudgeSlot(): boolean {
  const now = Date.now();
  if (now - judgeWindow.start > 60 * 60 * 1000) judgeWindow = { start: now, count: 0 };
  if (judgeWindow.count >= DEMO_JUDGE_LIMIT_PER_HOUR) return false;
  judgeWindow.count++;
  return true;
}

function readOnly(message = "read-only demo") {
  return NextResponse.json({ error: message }, { status: 403 });
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    return NextResponse.next();
  }

  const role = await verifySession(request.cookies.get(COOKIE_NAME)?.value);

  // Checked before the public paths so a demo cookie can't write through /api/experiments
  if (role === "demo" && pathname.startsWith("/api/")) {
    if (DEMO_BLOCKED_READS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return readOnly();
    }
    const isWrite = !["GET", "HEAD", "OPTIONS"].includes(request.method);
    if (isWrite && pathname !== "/api/auth/login") {
      if (pathname !== DEMO_JUDGE_PATH) return readOnly();
      if (!takeDemoJudgeSlot()) return readOnly("Demo judge limit reached, try again in an hour");
    }
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!role) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
