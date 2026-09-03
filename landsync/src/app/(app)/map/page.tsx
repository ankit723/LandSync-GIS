"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { MapView, type Basemap, type LayerKey, type ParcelClick } from "@/components/MapView";
import { LayerControl } from "@/components/LayerControl";
import { SearchPanel } from "@/components/SearchPanel";
import { SpatialQueryPanel } from "@/components/SpatialQueryPanel";
import { ParcelProfile } from "@/components/ParcelProfile";
import { RiskPanel } from "@/components/RiskPanel";
import { IntegrationTrace } from "@/components/IntegrationTrace";
import { Spinner, RiskChip } from "@/components/ui";
import { useParcel, useParcelRisk, useSession, useSpatialQuery } from "@/lib/api/hooks";
import { titleCase } from "@/lib/format";

const ALL_VISIBLE: Record<LayerKey, boolean> = {
  parcels: true,
  roads: true,
  buildings: true,
  utilities: false,
  zoning: false,
  restricted: true,
  poi: true,
};

type Tab = "profile" | "trace" | "risk";

export default function MapWorkspace() {
  const { data: session } = useSession();
  const router = useRouter();
  const [visible, setVisible] = useState(ALL_VISIBLE);
  const [basemap, setBasemap] = useState<Basemap>("light");
  const [epoch, setEpoch] = useState<2024 | 2026>(2026);
  const [measuring, setMeasuring] = useState(false);
  const [measureM, setMeasureM] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [resultMeta, setResultMeta] = useState<{ label: string; count: number; timingMs?: number } | null>(null);
  const [focusBbox, setFocusBbox] = useState<[number, number, number, number] | null>(null);
  const [fitAll, setFitAll] = useState(0);
  const [tab, setTab] = useState<Tab>("profile");

  const canRisk = !!session?.permissions?.view_risk;
  const canNl = !!session?.permissions?.run_nl_query;

  const parcel = useParcel(selectedId);
  const risk = useParcelRisk(selectedId, canRisk && tab === "risk");
  const proximity = useSpatialQuery();

  const handleResults = useCallback(
    (
      ids: string[],
      bbox: [number, number, number, number] | null,
      meta: { label: string; count: number; timingMs?: number },
    ) => {
      setHighlightIds(ids);
      setResultMeta(meta);
      if (bbox) setFocusBbox(bbox);
    },
    [],
  );

  const pickFromSearch = useCallback((id: string) => {
    setSelectedId(id);
    setTab("profile");
  }, []);

  const pickFromMap = useCallback((c: ParcelClick) => {
    setSelectedId(c.id);
    setTab("profile");
  }, []);

  const runProximity = useCallback(
    (lngLat: [number, number], meters: number) => {
      proximity.mutate(
        { nearPoint: { lon: lngLat[0], lat: lngLat[1], withinMeters: meters } },
        {
          onSuccess: (res) => {
            const b: [number, number, number, number] = [180, 90, -180, -90];
            for (const f of res.features) {
              if (f.geometry.type !== "Polygon") continue;
              for (const [x, y] of f.geometry.coordinates[0]) {
                b[0] = Math.min(b[0], x);
                b[1] = Math.min(b[1], y);
                b[2] = Math.max(b[2], x);
                b[3] = Math.max(b[3], y);
              }
            }
            handleResults(res.parcelIds, res.count ? b : null, {
              label: `Parcels within ${meters} m of the selected point`,
              count: res.count,
              timingMs: res.timingMs,
            });
          },
        },
      );
    },
    [proximity, handleResults],
  );

  const tabs = (["profile", "trace", canRisk ? "risk" : null].filter(Boolean) as Tab[]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* left rail */}
      <aside className="w-[340px] shrink-0 space-y-3 overflow-y-auto border-r border-border bg-bg p-3 scrollbar-thin">
        <SearchPanel onPick={pickFromSearch} />
        <SpatialQueryPanel canNl={canNl} onResults={handleResults} />
        {resultMeta && (
          <div className="card p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-text-muted">
                {resultMeta.label}
              </span>
              <button
                onClick={() => {
                  setHighlightIds([]);
                  setResultMeta(null);
                }}
                className="text-xs text-primary"
              >
                clear
              </button>
            </div>
            <p className="mt-1">
              <b>{resultMeta.count}</b> parcels highlighted
              {resultMeta.timingMs != null && ` · ${resultMeta.timingMs} ms`}
            </p>
          </div>
        )}
        <LayerControl
          visible={visible}
          onToggle={(k) => setVisible((p) => ({ ...p, [k]: !p[k] }))}
          epoch={epoch}
          onEpoch={setEpoch}
          basemap={basemap}
          onBasemap={setBasemap}
        />
      </aside>

      {/* map */}
      <div className="relative flex-1">
        {/* map toolbar */}
        <div className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-lg border border-border bg-surface/95 p-1 shadow-sm backdrop-blur">
          <button
            onClick={() => setMeasuring((m) => !m)}
            className={`rounded-md px-2 py-1 text-xs font-medium ${
              measuring ? "bg-primary text-white" : "text-text-muted hover:bg-surface-2"
            }`}
          >
            📏 Measure{measuring && measureM != null ? ` · ${measureM >= 1000 ? (measureM / 1000).toFixed(2) + " km" : Math.round(measureM) + " m"}` : ""}
          </button>
          <button
            onClick={() => setFitAll((n) => n + 1)}
            className="rounded-md px-2 py-1 text-xs font-medium text-text-muted hover:bg-surface-2"
          >
            Fit all
          </button>
          {selectedId && (
            <button
              onClick={() => setSelectedId(null)}
              className="rounded-md px-2 py-1 text-xs font-medium text-text-muted hover:bg-surface-2"
            >
              Clear selection
            </button>
          )}
        </div>

        <MapView
          visible={visible}
          basemap={basemap}
          epoch={epoch}
          selectedId={selectedId}
          highlightIds={highlightIds}
          focusBbox={focusBbox}
          fitAllSignal={fitAll}
          measuring={measuring}
          canRisk={canRisk}
          onSelectParcel={pickFromMap}
          onOpenFullProfile={(id) => router.push(`/parcel/${id}`)}
          onProximityQuery={runProximity}
          onOpenRisk={(id) => {
            setSelectedId(id);
            setTab("risk");
          }}
          onMeasure={setMeasureM}
        />
      </div>

      {/* right drawer */}
      {selectedId && (
        <aside className="flex w-[430px] shrink-0 flex-col overflow-hidden border-l border-border bg-surface">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div>
              <div className="font-mono text-sm font-semibold">{selectedId}</div>
              {parcel.data && (
                <div className="text-xs text-text-muted">
                  {titleCase(parcel.data.summary.classification)} · Plot{" "}
                  {parcel.data.summary.plotNo} · {parcel.data.summary.village}
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="rounded-md border border-border px-2 py-1 text-xs text-text-muted"
            >
              Close
            </button>
          </div>

          <div className="flex gap-1 border-b border-border px-3 py-2">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                  tab === t ? "bg-primary/10 text-primary" : "text-text-muted"
                }`}
              >
                {t === "profile" ? "Unified profile" : t === "trace" ? "Interoperability" : "Risk analysis"}
              </button>
            ))}
            {parcel.data?.riskBadge && (
              <span className="ml-auto self-center">
                <RiskChip level={parcel.data.riskBadge.riskLevel} />
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2 scrollbar-thin">
            {parcel.isLoading && <Spinner />}
            {parcel.error && <p className="text-sm text-red-600">{String(parcel.error)}</p>}
            {parcel.data && tab === "profile" && (
              <>
                <div className="mb-3 flex gap-2">
                  <button
                    onClick={() => runProximity(parcel.data!.summary.centroid, 500)}
                    className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-2"
                  >
                    Neighbours ≤ 500 m
                  </button>
                  <Link
                    href={`/parcel/${selectedId}`}
                    className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-surface-2"
                  >
                    Full page ↗
                  </Link>
                </div>
                <ParcelProfile summary={parcel.data.summary} profile={parcel.data.profile} />
              </>
            )}
            {parcel.data && tab === "trace" && <IntegrationTrace trace={parcel.data.trace} />}
            {tab === "risk" && (
              <>
                {risk.isLoading && <Spinner />}
                {risk.data && <RiskPanel risk={risk.data} />}
              </>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
