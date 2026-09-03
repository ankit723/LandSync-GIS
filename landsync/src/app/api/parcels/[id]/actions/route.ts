import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { can, type Action } from "@/lib/rbac/matrix";
import { appendAudit } from "@/lib/audit/log";
import { buildCanonicalParcel } from "@/lib/integration/pipeline";

const schema = z.object({
  action: z.enum(["MODIFY_LAND_RECORD", "REGISTER_TRANSACTION", "TRIGGER_SYNC", "MARK_VERIFIED"]),
  reason: z.string().min(3).max(300),
  changes: z.record(z.string(), z.unknown()).optional(),
});

const REQUIRED: Record<z.infer<typeof schema>["action"], Action> = {
  MODIFY_LAND_RECORD: "modify_land_record",
  REGISTER_TRANSACTION: "register_transaction",
  TRIGGER_SYNC: "trigger_sync",
  MARK_VERIFIED: "view_risk",
};

/**
 * Simulated write path. The prototype never mutates authoritative records
 * (PRD §15) — it records the *intent* as an append-only audit event and echoes
 * what a downstream sync would do.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  const { action, reason, changes } = parsed.data;

  if (!can(user.role, REQUIRED[action])) {
    await appendAudit(user, {
      action: `ATTEMPT_${action}`,
      resourceType: "PARCEL",
      resourceId: id,
      reason,
      outcome: "DENIED",
    }).catch(() => {});
    return NextResponse.json(
      { error: `Role ${user.role} may not ${action}` },
      { status: 403 },
    );
  }

  const assembly = await buildCanonicalParcel(id);
  if (!assembly) return NextResponse.json({ error: "Parcel not found" }, { status: 404 });

  const event = await appendAudit(user, {
    action,
    resourceType: "PARCEL",
    resourceId: id,
    previousData: {
      owner: assembly.parcel.ownershipRecords[0]?.personReference,
      officialArea: assembly.parcel.officialArea,
    },
    newData: changes ?? {},
    reason,
    outcome: "SUCCESS",
  });

  return NextResponse.json({
    ok: true,
    simulated: true,
    note: "Recorded as an append-only audit event. Authoritative records are not modified by the prototype.",
    auditEvent: event,
  });
}
