import { NextResponse } from "next/server";
import { createAuthCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const { password } = body;

  if (password !== process.env.DASHBOARD_PASSWORD) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const { name, value, options } = createAuthCookie();
  const response = NextResponse.json({ ok: true });
  response.cookies.set(name, value, options);
  return response;
}
