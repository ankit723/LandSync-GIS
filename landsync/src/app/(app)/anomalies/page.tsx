"use client";

import Link from "next/link";
import { useState } from "react";
import { useAnomalies } from "@/lib/api/hooks";
import { Card, Spinner, RiskChip } from "@/components/ui";
import { titleCase } from "@/lib/format";

const LEVELS = ["", "CRITICAL", "HIGH", "MEDIUM", "LOW"];

export default function AnomaliesPage() {
  const [level, setLevel] = useState("");
  const { data, isLoading, error } = useAnomalies(level || undefined);

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <h1 className="text-lg font-semibold">Anomaly register</h1>
      <p className="text-sm text-text-muted">
        Cross-departmental record-consistency findings from the rule-based engine. Every
        HIGH / CRITICAL item is marked for human verification — nothing is auto-corrected.
      </p>

      <div className="mt-3 flex gap-1">
        {LEVELS.map((l) => (
          <button
            key={l || "ALL"}
            onClick={() => setLevel(l)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
              level === l ? "bg-primary/10 text-primary" : "text-text-muted"
            }`}
          >
            {l || "All"}
          </button>
        ))}
      </div>

      {isLoading && <div className="mt-4"><Spinner /></div>}
      {error && <p className="mt-4 text-red-600">{String(error)}</p>}

      {data && (
        <Card className="mt-3 overflow-x-auto">
          <div className="mb-2 text-xs text-text-muted">{data.count} parcels flagged</div>
          <table className="w-full text-xs">
            <thead className="text-text-muted">
              <tr className="text-left">
                <th className="py-1 pr-3 font-medium">Parcel</th>
                <th className="py-1 pr-3 font-medium">Plot</th>
                <th className="py-1 pr-3 font-medium">Village</th>
                <th className="py-1 pr-3 font-medium">Risk</th>
                <th className="py-1 pr-3 font-medium">Conf.</th>
                <th className="py-1 pr-3 font-medium">Codes</th>
                <th className="py-1 font-medium">Verify</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.parcelId} className="border-t border-border align-top">
                  <td className="py-1.5 pr-3">
                    <Link href={`/parcel/${r.parcelId}`} className="font-mono text-primary">
                      {r.parcelId}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3">{r.plotNo}</td>
                  <td className="py-1.5 pr-3">{r.village}</td>
                  <td className="py-1.5 pr-3">
                    <RiskChip level={r.riskLevel} />
                  </td>
                  <td className="py-1.5 pr-3 tabular-nums">{(r.confidence * 100).toFixed(0)}%</td>
                  <td className="py-1.5 pr-3">
                    <div className="flex flex-wrap gap-1">
                      {r.reasonCodes.map((c) => (
                        <span key={c} className="chip">
                          {titleCase(c)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-1.5">{r.requiresHumanVerification ? "Yes" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
