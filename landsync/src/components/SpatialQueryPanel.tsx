"use client";

import { useState } from "react";
import { useNlQuery, useSpatialQuery } from "@/lib/api/hooks";
import type { SpatialResult } from "@/lib/repo/spatial";
import { Spinner } from "@/components/ui";

const CLASSES = [
  "RESIDENTIAL",
  "COMMERCIAL",
  "AGRICULTURAL",
  "INDUSTRIAL",
  "GOVERNMENT",
  "VACANT",
] as const;

const NL_PRESETS = [
  "Show government parcels within 1 km of a hospital",
  "Agricultural parcels larger than 2 hectares within 500 m of NH-16",
  "Residential parcels intersecting the flood-risk zone",
  "Commercial parcels larger than 800 sqm near a hospital",
];

function bboxOf(features: SpatialResult["features"]): [number, number, number, number] | null {
  if (!features.length) return null;
  const b: [number, number, number, number] = [180, 90, -180, -90];
  for (const f of features) {
    if (f.geometry.type !== "Polygon") continue;
    for (const [x, y] of f.geometry.coordinates[0]) {
      b[0] = Math.min(b[0], x);
      b[1] = Math.min(b[1], y);
      b[2] = Math.max(b[2], x);
      b[3] = Math.max(b[3], y);
    }
  }
  return b;
}

export function SpatialQueryPanel({
  canNl,
  onResults,
}: {
  canNl: boolean;
  onResults: (
    ids: string[],
    bbox: [number, number, number, number] | null,
    meta: { label: string; count: number; timingMs?: number },
  ) => void;
}) {
  const [tab, setTab] = useState<"guided" | "nl">("guided");
  const [uses, setUses] = useState<string[]>([]);
  const [ownership, setOwnership] = useState("");
  const [minArea, setMinArea] = useState("");
  const [near, setNear] = useState("");
  const [withinM, setWithinM] = useState("500");
  const [flood, setFlood] = useState(false);
  const [nl, setNl] = useState(NL_PRESETS[0]);

  const guided = useSpatialQuery();
  const nlq = useNlQuery();

  function runGuided() {
    const filters: Record<string, unknown> = {};
    if (uses.length) filters.landUse = uses;
    if (ownership) filters.ownership = ownership;
    if (minArea) filters.minArea = Number(minArea);
    if (flood) filters.intersects = "FLOOD_RISK_ZONE";
    if (near === "NH-16") filters.nearRoadRef = { ref: "NH-16", withinMeters: Number(withinM) };
    else if (near) filters.nearPoi = { kind: near, withinMeters: Number(withinM) };
    guided.mutate(filters, {
      onSuccess: (res) =>
        onResults(res.parcelIds, bboxOf(res.features), {
          label: "Guided spatial query",
          count: res.count,
          timingMs: res.timingMs,
        }),
    });
  }

  return (
    <div className="card p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Spatial query
      </h3>
      <div className="mb-3 flex gap-1">
        <button
          onClick={() => setTab("guided")}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-medium ${
            tab === "guided" ? "bg-primary/10 text-primary" : "text-text-muted"
          }`}
        >
          Guided
        </button>
        <button
          onClick={() => setTab("nl")}
          disabled={!canNl}
          className={`flex-1 rounded-md px-2 py-1 text-xs font-medium disabled:opacity-40 ${
            tab === "nl" ? "bg-primary/10 text-primary" : "text-text-muted"
          }`}
        >
          Natural language
        </button>
      </div>

      {tab === "guided" ? (
        <div className="space-y-2.5 text-sm">
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase text-text-muted">Land use</div>
            <div className="grid grid-cols-2 gap-1">
              {CLASSES.map((c) => (
                <label key={c} className="flex items-center gap-1.5 text-xs">
                  <input
                    type="checkbox"
                    className="h-3 w-3 accent-[var(--primary)]"
                    checked={uses.includes(c)}
                    onChange={() =>
                      setUses((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]))
                    }
                  />
                  {c[0] + c.slice(1).toLowerCase()}
                </label>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-[11px] font-medium uppercase text-text-muted">Ownership</span>
            <select
              value={ownership}
              onChange={(e) => setOwnership(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-border bg-surface px-2 py-1 text-xs"
            >
              <option value="">Any</option>
              <option value="GOVERNMENT">Government</option>
              <option value="PRIVATE">Private</option>
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] font-medium uppercase text-text-muted">
              Min area (m²)
            </span>
            <input
              value={minArea}
              onChange={(e) => setMinArea(e.target.value)}
              inputMode="numeric"
              placeholder="e.g. 20000"
              className="mt-0.5 w-full rounded-md border border-border bg-surface px-2 py-1 text-xs"
            />
          </label>
          <div className="flex gap-2">
            <label className="flex-1">
              <span className="text-[11px] font-medium uppercase text-text-muted">Near</span>
              <select
                value={near}
                onChange={(e) => setNear(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-border bg-surface px-2 py-1 text-xs"
              >
                <option value="">—</option>
                <option value="hospital">Hospital</option>
                <option value="school">School</option>
                <option value="river">River</option>
                <option value="NH-16">NH-16</option>
              </select>
            </label>
            <label className="w-24">
              <span className="text-[11px] font-medium uppercase text-text-muted">Within m</span>
              <input
                value={withinM}
                onChange={(e) => setWithinM(e.target.value)}
                inputMode="numeric"
                className="mt-0.5 w-full rounded-md border border-border bg-surface px-2 py-1 text-xs"
              />
            </label>
          </div>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              className="h-3 w-3 accent-[var(--primary)]"
              checked={flood}
              onChange={(e) => setFlood(e.target.checked)}
            />
            Intersects flood-risk zone
          </label>
          <button
            onClick={runGuided}
            className="w-full rounded-md bg-primary py-1.5 text-sm font-medium text-white"
          >
            Run query
          </button>
          {guided.isPending && <Spinner />}
          {guided.data && (
            <p className="text-xs text-text-muted">
              {guided.data.count} parcels · {guided.data.timingMs} ms
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <textarea
            value={nl}
            onChange={(e) => setNl(e.target.value)}
            rows={3}
            className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-xs"
          />
          <div className="flex flex-wrap gap-1">
            {NL_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setNl(p)}
                className="chip hover:border-primary/40 hover:text-primary"
              >
                {p.slice(0, 22)}…
              </button>
            ))}
          </div>
          <button
            onClick={() =>
              nlq.mutate(nl, {
                onSuccess: (res) =>
                  onResults(res.result?.parcelIds ?? [], bboxOf(res.result?.features ?? []), {
                    label: "AI natural-language query",
                    count: res.result?.count ?? 0,
                    timingMs: res.result?.timingMs,
                  }),
              })
            }
            className="w-full rounded-md bg-primary py-1.5 text-sm font-medium text-white"
          >
            Interpret & run
          </button>
          {nlq.isPending && <Spinner />}
          {nlq.data && (
            <div className="rounded-md border border-border bg-surface-2 p-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase text-text-muted">
                  Interpreted filters
                </span>
                <span className="chip">
                  {nlq.data.parsed.method === "llm"
                    ? `${nlq.data.parsed.llm?.provider}/${nlq.data.parsed.llm?.model}`
                    : nlq.data.parsed.method === "llm-fallback-rule-based"
                      ? "LLM failed → rule-based"
                      : nlq.data.engine.configured
                        ? "rule-based"
                        : "rule-based (no LLM key)"}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px]">
                {nlq.data.parsed.interpretation.map((l, i) => (
                  <li key={i}>{l}</li>
                ))}
              </ul>
              {nlq.data.parsed.notes && (
                <p className="mt-1 text-[11px] text-amber-600">{nlq.data.parsed.notes}</p>
              )}
              <div className="mt-1.5 text-xs">
                {nlq.data.result
                  ? `${nlq.data.result.count} parcels · ${nlq.data.result.timingMs} ms · executed as one PostGIS query`
                  : "No structured filter could be extracted."}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
