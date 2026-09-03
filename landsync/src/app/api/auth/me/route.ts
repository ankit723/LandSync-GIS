import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { PERMISSIONS, type Action } from "@/lib/rbac/matrix";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ user: null }, { status: 200 });

  const permissions = Object.fromEntries(
    (Object.keys(PERMISSIONS) as Action[]).map((a) => [a, PERMISSIONS[a][user.role]]),
  );
  return NextResponse.json({ user, permissions });
}
