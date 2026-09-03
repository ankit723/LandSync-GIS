"use client";

import { BASEMAP_ORDER, type Basemap, type LayerKey } from "@/components/MapView";
import { CLASS_COLOR } from "@/lib/format";

const LABELS: Record<LayerKey, string> = {
  parcels: "Parcels",
  roads: "Roads & water",
  buildings: "Buildings",
  utilities: "Utility mains",
  zoning: "Zoning",
  restricted: "Restricted zones",
  poi: "Infrastructure (POI)",
};

const BASEMAP_LABEL: Record<Basemap, string> = {
  plain: "Plain",
  light: "Light",
  streets: "Streets",
  imagery: "Imagery",
};

const UTIL_LEGEND: [string, string][] = [
  ["WATER", "#0ea5e9"],
  ["POWER", "#f59e0b"],
  ["SEWER", "#7c3aed"],
  ["TELECOM", "#10b981"],
  ["GAS", "#ef4444"],
];

export function LayerControl({
  visible,
  onToggle,
  epoch,
  onEpoch,
  basemap,
  onBasemap,
}: {
  visible: Record<LayerKey, boolean>;
  onToggle: (k: LayerKey) => void;
  epoch: 2024 | 2026;
  onEpoch: (e: 2024 | 2026) => void;
  basemap: Basemap;
  onBasemap: (b: Basemap) => void;
}) {
  return (
    <div className="card p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Basemap
      </h3>
      <div className="mb-3 flex gap-1">
        {BASEMAP_ORDER.map((b) => (
          <button
            key={b}
            onClick={() => onBasemap(b)}
            className={`flex-1 rounded-md border px-2 py-1 text-xs font-medium ${
              basemap === b
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-text-muted"
            }`}
          >
            {BASEMAP_LABEL[b]}
          </button>
        ))}
      </div>

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Layers
      </h3>
      <div className="space-y-1.5">
        {(Object.keys(LABELS) as LayerKey[]).map((k) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={visible[k]}
              onChange={() => onToggle(k)}
              className="h-3.5 w-3.5 accent-[var(--primary)]"
            />
            {LABELS[k]}
          </label>
        ))}
      </div>

      {visible.buildings && (
        <div className="mt-3 border-t border-border pt-2">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Buildings epoch
          </div>
          <div className="flex gap-1">
            {([2024, 2026] as const).map((e) => (
              <button
                key={e}
                onClick={() => onEpoch(e)}
                className={`flex-1 rounded-md border px-2 py-1 text-xs font-medium ${
                  epoch === e
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-text-muted"
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-text-muted">
            Red footprints in 2026 = new structure without an approved permit.
          </p>
        </div>
      )}

      {visible.utilities && (
        <div className="mt-3 border-t border-border pt-2">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Utility mains
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {UTIL_LEGEND.map(([k, c]) => (
              <div key={k} className="flex items-center gap-1.5 text-[11px] text-text-muted">
                <span className="inline-block h-0 w-4 border-t-2 border-dashed" style={{ borderColor: c }} />
                {k[0] + k.slice(1).toLowerCase()}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 border-t border-border pt-2">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
          Land classification
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {Object.entries(CLASS_COLOR).map(([k, c]) => (
            <div key={k} className="flex items-center gap-1.5 text-[11px] text-text-muted">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: c, opacity: 0.7 }} />
              {k[0] + k.slice(1).toLowerCase()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
