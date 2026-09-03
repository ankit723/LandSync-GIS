"use client";

import Link from "next/link";
import { useSession, useStats } from "@/lib/api/hooks";
import { Card, Stat, Spinner, RiskChip } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/rbac/matrix";
import { titleCase, CLASS_COLOR } from "@/lib/format";

export default function DashboardPage() {
  const { data: session } = useSession();
  const { data, isLoading } = useStats();
  const role = session?.user?.role;

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <h1 className="text-lg font-semibold">
        {role ? ROLE_LABEL[role] : "Dashboard"}
      </h1>
      <p className="text-sm text-text-muted">
        {session?.user?.department} · role-scoped operational view
      </p>

      {isLoading && <div className="mt-4"><Spinner /></div>}

      {data && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Sample parcels" value={data.parcelsTotal} hint="Bhubaneswar, Odisha" />
            <Stat
              label="Identifiers mapped"
              value={data.identifiersMapped}
              hint="across 5 identifier types"
            />
            <Stat
              label="Adapters healthy"
              value={`${data.adapters.filter((a) => a.status === "HEALTHY").length}/${data.adapters.length}`}
              tone="ok"
            />
            <Stat
              label="GIS layers"
              value={Object.keys(data.layers).length}
              hint={`${Object.values(data.layers).reduce((a, b) => a + b, 0)} features`}
            />
          </div>

          {data.risk && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Parcels flagged" value={data.risk.flaggedTotal} tone="warn" />
              <Stat
                label="Critical"
                value={data.risk.byLevel.CRITICAL ?? 0}
                tone="danger"
              />
              <Stat label="High" value={data.risk.byLevel.HIGH ?? 0} tone="warn" />
              <Stat
                label="Awaiting verification"
                value={data.risk.requiresVerification}
                tone="danger"
              />
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-2 text-sm font-semibold">Land classification mix</h2>
              <div className="space-y-1.5">
                {Object.entries(data.byClassification)
                  .sort((a, b) => b[1] - a[1])
                  .map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <span className="w-24 text-text-muted">{titleCase(k)}</span>
                      <div className="h-3 flex-1 overflow-hidden rounded bg-surface-2">
                        <div
                          className="h-full"
                          style={{
                            width: `${(v / data.parcelsTotal) * 100}%`,
                            background: CLASS_COLOR[k] ?? "#94a3b8",
                          }}
                        />
                      </div>
                      <span className="w-8 text-right tabular-nums">{v}</span>
                    </div>
                  ))}
              </div>
            </Card>

            <Card>
              <h2 className="mb-2 text-sm font-semibold">Departmental adapters</h2>
              <div className="space-y-1.5">
                {data.adapters.map((a) => (
                  <div
                    key={a.source}
                    className="flex items-center justify-between rounded-md border border-border px-2.5 py-1.5 text-xs"
                  >
                    <span className="font-medium">{titleCase(a.source)}</span>
                    <span className="text-text-muted">
                      {a.ok} ok · {a.errors} err
                    </span>
                    <span
                      className={`chip ${
                        a.status === "HEALTHY"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {a.status}
                    </span>
                  </div>
                ))}
              </div>
              <Link
                href="/integrations"
                className="mt-2 inline-block text-xs font-medium text-primary"
              >
                View interoperability detail →
              </Link>
            </Card>
          </div>

          {data.risk && data.risk.top.length > 0 && (
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Priority anomalies</h2>
                <Link href="/anomalies" className="text-xs font-medium text-primary">
                  Full register →
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-text-muted">
                    <tr className="text-left">
                      <th className="py-1 pr-3 font-medium">Parcel</th>
                      <th className="py-1 pr-3 font-medium">Risk</th>
                      <th className="py-1 pr-3 font-medium">Confidence</th>
                      <th className="py-1 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.risk.top.map((r) => (
                      <tr key={r.parcelId} className="border-t border-border">
                        <td className="py-1.5 pr-3">
                          <Link href={`/parcel/${r.parcelId}`} className="font-mono text-primary">
                            {r.parcelId}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-3">
                          <RiskChip level={r.riskLevel} />
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {(r.confidence * 100).toFixed(0)}%
                        </td>
                        <td className="py-1.5 text-text-muted">{r.topReason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {!data.risk && (
            <Card>
              <p className="text-sm text-text-muted">
                Risk analytics are not available to the Citizen role. Sign in as a Revenue,
                Municipal or Planning officer to see cross-record inconsistency detection.
              </p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
