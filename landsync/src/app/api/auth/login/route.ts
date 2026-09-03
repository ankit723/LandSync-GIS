import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, createSessionToken } from "@/lib/auth/session";
import { roleLoginAllowed, userByRole, verifyCredentials } from "@/lib/auth/credentials";
import { DEMO_USERS } from "@/lib/auth/users";
import { ROLES } from "@/lib/rbac/matrix";
import { appendAudit } from "@/lib/audit/log";

const body = z
  .object({
    identifier: z.string().min(1).optional(),
    password: z.string().min(1).optional(),
    role: z.enum(ROLES).optional(),
  })
  .refine((b) => (b.identifier && b.password) || b.role, {
    message: "provide identifier+password, or role for demo login",
  });

const TTL = 8 * 60 * 60;

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { identifier, password, role } = parsed.data;

  let user = null;
  let mode: "password" | "role" = "password";

  if (identifier && password) {
    user = await verifyCredentials(identifier, password);
  } else if (role) {
    if (!roleLoginAllowed()) {
      return NextResponse.json({ error: "Role login is disabled" }, { status: 403 });
    }
    mode = "role";
    user = await userByRole(role);
  }

  if (!user) {
    await appendAudit(null, {
      action: "LOGIN",
      resourceType: "SESSION",
      resourceId: identifier ?? role ?? "-",
      outcome: "DENIED",
    }).catch(() => {});
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  await appendAudit(user, {
    action: mode === "role" ? "LOGIN_DEMO_ROLE" : "LOGIN",
    resourceType: "SESSION",
    resourceId: user.id,
    outcome: "SUCCESS",
  }).catch(() => {});

  const token = await createSessionToken(user);
  const res = NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
      department: user.department,
      designation: user.designation,
    },
  });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: TTL,
  });
  return res;
}

export function GET() {
  return NextResponse.json({ users: DEMO_USERS, roleLoginAllowed: roleLoginAllowed() });
}
