"use client";

import type { IntegrationStepTrace } from "@/lib/integration/pipeline";
import { titleCase } from "@/lib/format";

export function IntegrationTrace({ trace }: { trace: IntegrationStepTrace[] }) {
  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-text-muted">
        Each department exposes its own schema. The adapter validates, maps identifiers
        and transforms the record into the canonical land model — the core platform is
        never touched when a new source is onboarded (PRD §7E).
      </p>
      {trace.map((step) => (
        <div key={step.adapterId} className="rounded-md border border-border">
          <div className="flex items-center justify-between border-b border-border bg-surface-2 px-3 py-1.5">
            <span className="text-xs font-semibold">
              {titleCase(step.sourceSystem)} · <span className="font-mono">{step.adapterId}</span>
            </span>
            <span
              className={`chip ${
                step.status === "OK"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {step.status}
            </span>
          </div>
          <div className="grid gap-3 p-3 md:grid-cols-2">
            <div>
              <div className="text-[11px] font-semibold uppercase text-text-muted">
                Raw source record
              </div>
              <pre className="mt-1 overflow-x-auto rounded bg-slate-900 p-2 text-[11px] leading-relaxed text-slate-100">
                {JSON.stringify(step.rawSample, null, 2)}
              </pre>
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase text-text-muted">
                Field mapping → canonical
              </div>
              <ul className="mt-1 space-y-1">
                {step.mappings.map((m, i) => (
                  <li key={i} className="text-[11px]">
                    <span className="font-mono text-text">{m.sourceField}</span>
                    <span className="text-text-muted"> → </span>
                    <span className="font-mono text-primary">{m.canonicalPath}</span>
                    <div className="text-text-muted">{m.transform}</div>
                  </li>
                ))}
              </ul>
              {step.error && (
                <p className="mt-1 text-[11px] text-red-600">error: {step.error}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
