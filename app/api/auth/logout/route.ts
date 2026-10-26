import { NextResponse } from "next/server";
import { COOKIE_NAME } from "@/lib/auth/session";

// Same cookie for owner and demo sessions, so this signs out either
export async function GET(request: Request) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return response;
}
