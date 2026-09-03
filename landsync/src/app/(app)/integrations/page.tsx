"use client";

import { useAdapters } from "@/lib/api/hooks";
import { Card, Spinner } from "@/components/ui";
import { titleCase } from "@/lib/format";

const CANONICAL_TREE = `Parcel
├── canonicalParcelId
├── geometry              (GeoJSON Polygon, WGS84)
├── calculatedArea        (m², from geometry)
├── officialArea          (m², from revenue records)
├── landClassification
├── administrativeLocation
├── identifiers[]         (source ↔ canonical id map)
├── ownershipRecords[]    ← Revenue adapter
├── registrationRecords[] ← Registration adapter
├── taxationRecords[]     ← Municipal adapter
├── zoningInformation     ← Planning adapter
├── buildingPermissions[] ← Municipal adapter
├── encumbrances[]        ← Registration adapter
├── restrictions[]        ← Planning adapter
└── metadata`;

export default function IntegrationsPage() {
  const { data, isLoading } = useAdapters();

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <h1 className="text-lg font-semibold">Interoperability & the canonical model</h1>
      <p className="max-w-3xl text-sm text-text-muted">
        Every department keeps its own system, schema and identifiers. Land Stack connects
        them with a thin <b>adapter</b> per source that validates, maps identifiers and
        transforms records into one <b>canonical land data model</b>. Onboarding a new
        state or department means writing another adapter — the core platform and the
        canonical model do not change (PRD §7E, NFR-02).
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Canonical land data model</h2>
          <pre className="overflow-x-auto rounded bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
            {CANONICAL_TREE}
          </pre>
        </Card>

        <div className="space-y-3">
          {isLoading && <Spinner />}
          {data?.adapters.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold">{a.displayName}</h3>
                  <p className="text-xs text-text-muted">
                    {a.owner} · <span className="font-mono">{a.id}</span> · v{a.version}
                  </p>
                </div>
                {a.health && (
                  <span
                    className={`chip ${
                      a.health.status === "HEALTHY"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {a.health.status} · {a.health.ok}/{a.health.parcelsProcessed} ok
                  </span>
                )}
              </div>

              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase text-text-muted">
                    Source schema ({titleCase(a.sourceSystem)})
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {a.sampleSourceSchema.map((f) => (
                      <span key={f} className="chip font-mono">
                        {f}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 text-[11px] text-text-muted">
                    Primary identifier: {a.identifierType}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase text-text-muted">
                    Transform rules
                  </div>
                  <ul className="mt-1 space-y-1">
                    {a.fieldMappings.map((m, i) => (
                      <li key={i} className="text-[11px]">
                        <span className="font-mono">{m.sourceField}</span>
                        <span className="text-text-muted"> → </span>
                        <span className="font-mono text-primary">{m.canonicalPath}</span>
                        <div className="text-text-muted">{m.transform}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
