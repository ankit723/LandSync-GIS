"use client";

import Link from "next/link";
import { use, useState } from "react";
import { ParcelProfile } from "@/components/ParcelProfile";
import { RiskPanel } from "@/components/RiskPanel";
import { IntegrationTrace } from "@/components/IntegrationTrace";
import { Card, Spinner, RiskChip } from "@/components/ui";
import {
  useParcel,
  useParcelRisk,
  useParcelAction,
  useSession,
} from "@/lib/api/hooks";
import { titleCase } from "@/lib/format";

export default function ParcelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: session } = useSession();
  const parcel = useParcel(id);
  const canRisk = !!session?.permissions?.view_risk;
  const risk = useParcelRisk(id, canRisk);
  const action = useParcelAction(id);
  const [reason, setReason] = useState("");

  const perms = session?.permissions;
  const availableActions = [
    perms?.modify_land_record && "MODIFY_LAND_RECORD",
    perms?.register_transaction && "REGISTER_TRANSACTION",
    perms?.trigger_sync && "TRIGGER_SYNC",
    perms?.view_risk && "MARK_VERIFIED",
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Link href="/map" className="text-xs text-primary">
            ← Map workspace
          </Link>
          <h1 className="mt-1 text-lg font-semibold">{id}</h1>
          {parcel.data && (
            <p className="text-sm text-text-muted">
              {titleCase(parcel.data.summary.classification)} · Plot{" "}
              {parcel.data.summary.plotNo} · Khata {parcel.data.summary.khataNo} · Holding{" "}
              {parcel.data.summary.holdingId} · {parcel.data.summary.village}
            </p>
          )}
        </div>
        {parcel.data?.riskBadge && <RiskChip level={parcel.data.riskBadge.riskLevel} />}
      </div>

      {parcel.isLoading && <Spinner />}
      {parcel.error && <p className="text-red-600">{String(parcel.error)}</p>}

      {parcel.data && (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <Card>
            <h2 className="mb-1 text-sm font-semibold">Unified parcel profile</h2>
            <p className="mb-2 text-xs text-text-muted">
              Assembled from {parcel.data.trace.filter((t) => t.status === "OK").length} departmental
              sources · fields filtered for role {parcel.data.profile.role}.
            </p>
            <ParcelProfile summary={parcel.data.summary} profile={parcel.data.profile} />
          </Card>

          <div className="space-y-4">
            {canRisk && (
              <Card>
                <h2 className="mb-2 text-sm font-semibold">Record-consistency analysis</h2>
                {risk.isLoading && <Spinner />}
                {risk.data && <RiskPanel risk={risk.data} />}
              </Card>
            )}

            {availableActions.length > 0 && (
              <Card>
                <h2 className="mb-1 text-sm font-semibold">Officer actions (simulated)</h2>
                <p className="mb-2 text-xs text-text-muted">
                  Records an append-only audit event. The prototype never mutates
                  authoritative records (PRD §15).
                </p>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Reason (required)"
                  className="mb-2 w-full rounded-md border border-border px-2 py-1.5 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  {availableActions.map((a) => (
                    <button
                      key={a}
                      disabled={reason.trim().length < 3 || action.isPending}
                      onClick={() => action.mutate({ action: a, reason })}
                      className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-40"
                    >
                      {titleCase(a)}
                    </button>
                  ))}
                </div>
                {action.data ? (
                  <p className="mt-2 text-xs text-emerald-700">
                    Audit event recorded — see Administration → Audit trail.
                  </p>
                ) : action.error ? (
                  <p className="mt-2 text-xs text-red-600">{String(action.error)}</p>
                ) : null}
              </Card>
            )}

            <Card>
              <h2 className="mb-2 text-sm font-semibold">Interoperability trace</h2>
              <IntegrationTrace trace={parcel.data.trace} />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
