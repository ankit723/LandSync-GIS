import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, revokeSessionToken } from "@/lib/auth/session";

export async function POST() {
  const store = await cookies();
  await revokeSessionToken(store.get(SESSION_COOKIE)?.value).catch(() => {});

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
