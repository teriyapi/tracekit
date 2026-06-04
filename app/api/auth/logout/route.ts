import { NextResponse } from "next/server";

export async function GET() {
  const response = NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
  response.cookies.set("tracekit_auth", "", { maxAge: 0, path: "/" });
  return response;
}
