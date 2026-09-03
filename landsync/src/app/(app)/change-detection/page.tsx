"use client";

import Link from "next/link";
import { useChangeDetection } from "@/lib/api/hooks";
import { Card, Stat, Spinner } from "@/components/ui";
import { m2, titleCase } from "@/lib/format";

const TONE: Record<string, string> = {
  POTENTIAL_UNAUTHORISED_CONSTRUCTION: "border-red-200 bg-red-50 text-red-700",
  CONSISTENT_WITH_PERMIT: "border-emerald-200 bg-emerald-50 text-emerald-700",
  REVIEW: "border-amber-200 bg-amber-50 text-amber-700",
};

export default function ChangeDetectionPage() {
  const { data, isLoading, error } = useChangeDetection();

  return (
    <div className="mx-auto max-w-5xl px-4 py-5">
      <h1 className="text-lg font-semibold">Change detection</h1>
      <p className="text-sm text-text-muted">
        Two-epoch comparison of the built-up layer ({data?.epochs.before ?? 2024} →{" "}
        {data?.epochs.after ?? 2026}), cross-checked against building-permission records
        (PRD §8 FR-11). Toggle the buildings epoch on the Map Workspace to see the
        footprints.
      </p>

      {isLoading && <div className="mt-4"><Spinner /></div>}
      {error && <p className="mt-4 text-red-600">{String(error)}</p>}

      {data && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Parcels changed" value={data.count} />
            <Stat
              label="Potentially unauthorised"
              value={data.unauthorisedCount}
              tone="danger"
            />
            <Stat
              label="Consistent with permit"
              value={data.changes.filter((c) => c.finding === "CONSISTENT_WITH_PERMIT").length}
              tone="ok"
            />
          </div>

          <div className="mt-4 space-y-2">
            {data.changes.map((c) => (
              <Card key={c.parcelId} className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <Link
                  href={`/parcel/${c.parcelId}`}
                  className="font-mono text-sm text-primary"
                >
                  {c.parcelId}
                </Link>
                <span className="text-xs text-text-muted">{titleCase(c.changeType)}</span>
                <span className="text-xs">
                  built-up {m2(c.builtAreaBefore)} → {m2(c.builtAreaAfter)}{" "}
                  <b className="text-text">(+{c.deltaArea} m²)</b>
                </span>
                <span className="text-xs text-text-muted">permit: {titleCase(c.permitStatus)}</span>
                <span className={`chip ml-auto border ${TONE[c.finding]}`}>
                  {titleCase(c.finding)}
                </span>
                <p className="w-full text-xs text-text-muted">{c.note}</p>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
