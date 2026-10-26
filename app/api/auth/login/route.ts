import { NextResponse } from "next/server";
import { createAuthCookie, type Role } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const { password } = body;

  let role: Role | null = null;
  if (password && password === process.env.DASHBOARD_PASSWORD) role = "owner";
  else if (password && process.env.DEMO_PASSWORD && password === process.env.DEMO_PASSWORD) role = "demo";

  if (!role) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const { name, value, options } = await createAuthCookie(role);
  const response = NextResponse.json({ ok: true, role });
  response.cookies.set(name, value, options);
  return response;
}
