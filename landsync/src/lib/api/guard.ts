import { NextResponse } from "next/server";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { can, type Action } from "@/lib/rbac/matrix";
import { appendAudit } from "@/lib/audit/log";

export type GuardResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: NextResponse };

const PRIVILEGED: Action[] = [
  "view_ror",
  "modify_land_record",
  "register_transaction",
  "trigger_sync",
  "manage_users",
  "register_adapter",
  "view_audit",
];

/** Authenticate + authorize a route handler. Logs privileged attempts. */
export async function guard(action: Action, resourceId = "-"): Promise<GuardResult> {
  const user = await getSession();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }),
    };
  }
  if (!can(user.role, action)) {
    if (PRIVILEGED.includes(action)) {
      await appendAudit(user, {
        action: `ATTEMPT_${action.toUpperCase()}`,
        resourceType: "API",
        resourceId,
        outcome: "DENIED",
      }).catch(() => {});
    }
    return {
      ok: false,
      response: NextResponse.json(
        { error: `Role ${user.role} is not permitted to ${action}` },
        { status: 403 },
      ),
    };
  }
  if (PRIVILEGED.includes(action)) {
    await appendAudit(user, {
      action: action.toUpperCase(),
      resourceType: "API",
      resourceId,
      outcome: "SUCCESS",
    }).catch(() => {});
  }
  return { ok: true, user };
}
