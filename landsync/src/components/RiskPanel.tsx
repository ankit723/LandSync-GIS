"use client";

import type { DetectionResult } from "@/lib/intelligence/inconsistency";
import { RiskChip, KV } from "@/components/ui";
import { m2, titleCase } from "@/lib/format";

export function RiskPanel({ risk }: { risk: DetectionResult }) {
  const e = risk.evidence;
  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <RiskChip level={risk.riskLevel} />
        <span className="text-xs text-text-muted">
          confidence {(risk.confidence * 100).toFixed(0)}% · rule-based engine
        </span>
      </div>

      <p className="mt-2 text-sm font-medium">{risk.recommendedAction}</p>

      {risk.requiresHumanVerification && (
        <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
          Requires human verification — the prototype never modifies authoritative
          records from an automated detection (PRD §8 FR-08).
        </div>
      )}

      {risk.reasons.length > 0 ? (
        <div className="mt-3 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Why this was flagged
          </div>
          {risk.reasons.map((r, i) => (
            <div key={i} className="rounded-md border border-border p-2">
              <div className="text-xs font-semibold">{titleCase(r.code)}</div>
              <p className="mt-0.5 text-xs text-text-muted">{r.detail}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {r.sourceRecords.map((s, j) => (
                  <span key={j} className="chip font-mono">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-text-muted">
          No cross-record inconsistencies detected for this parcel.
        </p>
      )}

      <div className="mt-3 rounded-md border border-border bg-surface-2 p-2">
        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
          Evidence used
        </div>
        <KV k="RoR recorded holder" v={e.rorHolder ?? "—"} />
        <KV k="Latest registered buyer" v={e.latestRegisteredBuyer ?? "—"} />
        <KV
          k="Owner name similarity"
          v={e.ownerSimilarity != null ? `${(e.ownerSimilarity * 100).toFixed(0)}%` : "—"}
        />
        <KV k="Cadastral area" v={m2(e.calculatedArea)} />
        <KV k="Recorded area" v={m2(e.officialArea)} />
        <KV k="Municipal-implied area" v={e.municipalPlinthArea ? m2(e.municipalPlinthArea) : "—"} />
        <KV k="Max area deviation" v={`${e.areaDeviationPct}%`} />
        <KV k="Structure visible (2026)" v={e.has2026Building ? "yes" : "no"} />
        <KV k="Permitted land use" v={e.permittedLandUse.map(titleCase).join(", ") || "—"} />
      </div>
    </div>
  );
}
