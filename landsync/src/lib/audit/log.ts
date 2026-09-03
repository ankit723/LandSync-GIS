import { q } from "@/lib/db/pool";
import type { SessionUser } from "@/lib/auth/session";

export interface AuditEvent {
  id: string;
  timestamp: string;
  actorId: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string;
  previousData?: unknown;
  newData?: unknown;
  reason?: string;
  outcome: "SUCCESS" | "DENIED";
}

export interface AuditInput {
  action: string;
  resourceType: string;
  resourceId: string;
  previousData?: unknown;
  newData?: unknown;
  reason?: string;
  outcome: "SUCCESS" | "DENIED";
}

/** Append one event to the append-only audit trail (PRD §8 FR-12). */
export async function appendAudit(
  actor: Pick<SessionUser, "id" | "role"> | null,
  entry: AuditInput,
): Promise<AuditEvent> {
  const row = await q<{
    event_ref: string;
    ts: string;
  }>(
    `INSERT INTO audit_events
       (actor_id, actor_role, action, resource_type, resource_id,
        previous_data, new_data, reason, outcome)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING event_ref, ts::text AS ts`,
    [
      actor?.id ?? "anonymous",
      actor?.role ?? "NONE",
      entry.action,
      entry.resourceType,
      entry.resourceId,
      entry.previousData != null ? JSON.stringify(entry.previousData) : null,
      entry.newData != null ? JSON.stringify(entry.newData) : null,
      entry.reason ?? null,
      entry.outcome,
    ],
  );
  return {
    id: row[0].event_ref,
    timestamp: row[0].ts,
    actorId: actor?.id ?? "anonymous",
    actorRole: actor?.role ?? "NONE",
    ...entry,
  };
}

export async function listAudit(limit = 200): Promise<AuditEvent[]> {
  const rows = await q<{
    event_ref: string;
    ts: string;
    actor_id: string;
    actor_role: string;
    action: string;
    resource_type: string;
    resource_id: string;
    previous_data: unknown;
    new_data: unknown;
    reason: string | null;
    outcome: "SUCCESS" | "DENIED";
  }>(
    `SELECT event_ref, ts::text AS ts, actor_id, actor_role, action,
            resource_type, resource_id, previous_data, new_data, reason, outcome
     FROM audit_events
     ORDER BY id DESC
     LIMIT $1`,
    [Math.min(limit, 500)],
  );
  return rows.map((r) => ({
    id: r.event_ref,
    timestamp: r.ts,
    actorId: r.actor_id,
    actorRole: r.actor_role,
    action: r.action,
    resourceType: r.resource_type,
    resourceId: r.resource_id,
    previousData: r.previous_data ?? undefined,
    newData: r.new_data ?? undefined,
    reason: r.reason ?? undefined,
    outcome: r.outcome,
  }));
}
