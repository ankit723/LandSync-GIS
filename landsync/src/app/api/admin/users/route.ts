import { NextResponse } from "next/server";
import { guard } from "@/lib/api/guard";
import { DEMO_USERS } from "@/lib/auth/users";
import { PERMISSIONS } from "@/lib/rbac/matrix";

export async function GET() {
  const g = await guard("manage_users");
  if (!g.ok) return g.response;
  return NextResponse.json({ users: DEMO_USERS, permissionMatrix: PERMISSIONS });
}
