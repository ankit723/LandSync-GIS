"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map as MlMap, MapGeoJSONFeature, StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { CLASS_COLOR } from "@/lib/format";
import type { FeatureCollection } from "@/lib/data/world";

export type LayerKey =
  | "zoning"
  | "restricted"
  | "parcels"
  | "buildings"
  | "roads"
  | "utilities"
  | "poi";

export type Basemap = "plain" | "light" | "streets" | "imagery";
export const BASEMAP_ORDER: Basemap[] = ["plain", "light", "streets", "imagery"];

const ENV = process.env as Record<string, string | undefined>;
/**
 * Basemap tiles come from env so any provider works. Precedence for "light":
 *   1. NEXT_PUBLIC_MAP_STYLE_URL  — a full vector style.json (CARTO/MapTiler/self-hosted)
 *   2. NEXT_PUBLIC_LIGHT_TILES    — a raw {z}/{x}/{y} raster template (key baked in)
 *   3. NEXT_PUBLIC_CARTO_TOKEN    — CARTO account token → authorised CARTO raster
 *   4. keyless CARTO raster       — works, but CARTO watermarks unregistered origins
 * NEXT_PUBLIC_* vars are inlined at build time, so set them before `npm run build`
 * (or restart `npm run dev`).
 */
const LIGHT_STYLE_URL = ENV.NEXT_PUBLIC_MAP_STYLE_URL || "";
const CARTO_TOKEN = ENV.NEXT_PUBLIC_CARTO_TOKEN || "";
const CARTO_STYLE = ENV.NEXT_PUBLIC_CARTO_BASEMAP || "light_all"; // voyager | dark_all | light_nolabels …
const LIGHT_TILES =
  ENV.NEXT_PUBLIC_LIGHT_TILES ||
  `https://basemaps.cartocdn.com/${CARTO_STYLE}/{z}/{x}/{y}.png` +
    (CARTO_TOKEN ? `?access_token=${CARTO_TOKEN}` : "");
const SAT_TILES =
  ENV.NEXT_PUBLIC_SATELLITE_TILES ||
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const LIGHT_ATTR = ENV.NEXT_PUBLIC_LIGHT_ATTR || "© OpenStreetMap · © CARTO";
const SAT_ATTR = ENV.NEXT_PUBLIC_SATELLITE_ATTR || "Esri, Maxar, Earthstar Geographics";

const GLYPHS = "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf";

/** Build the base style (background + optional raster) for a basemap choice. */
function baseStyleFor(bm: Basemap): StyleSpecification | string {
  if (bm === "light" && LIGHT_STYLE_URL) return LIGHT_STYLE_URL;
  const raster =
    bm === "light"
      ? { tiles: [LIGHT_TILES], attribution: LIGHT_ATTR, opacity: 0.6 }
      : bm === "streets"
        ? {
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            attribution: "© OpenStreetMap contributors",
            opacity: 0.55,
          }
        : bm === "imagery"
          ? { tiles: [SAT_TILES], attribution: SAT_ATTR, opacity: 1 }
          : null;
  const style: StyleSpecification = {
    version: 8,
    glyphs: GLYPHS,
    sources: {},
    layers: [{ id: "bg", type: "background", paint: { "background-color": "#eef2f6" } }],
  };
  if (raster) {
    style.sources.basemap = {
      type: "raster",
      tiles: raster.tiles,
      tileSize: 256,
      maxzoom: 19,
      attribution: raster.attribution,
    };
    style.layers.push({
      id: "basemap",
      type: "raster",
      source: "basemap",
      paint: { "raster-opacity": raster.opacity },
    });
  }
  return style;
}

const UTILITY_COLOR: Record<string, string> = {
  WATER: "#0ea5e9",
  POWER: "#f59e0b",
  SEWER: "#7c3aed",
  TELECOM: "#10b981",
  GAS: "#ef4444",
};

export interface ParcelClick {
  id: string;
  classification: string;
  area: number;
  village: string;
  ward: string;
  isGovernment: boolean;
  lngLat: [number, number];
}

interface Props {
  visible: Record<LayerKey, boolean>;
  basemap: Basemap;
  epoch: 2024 | 2026;
  selectedId: string | null;
  highlightIds: string[];
  focusBbox?: [number, number, number, number] | null;
  fitAllSignal?: number;
  measuring?: boolean;
  canRisk?: boolean;
  onSelectParcel: (c: ParcelClick) => void;
  onOpenFullProfile: (id: string) => void;
  onProximityQuery: (lngLat: [number, number], meters: number) => void;
  onOpenRisk: (id: string) => void;
  onMeasure?: (meters: number | null) => void;
}

function useLayers() {
  return useQuery({
    queryKey: ["map-layers-data"],
    staleTime: Infinity,
    queryFn: async () => {
      const names = [
        "parcels",
        "roads",
        "buildings2024",
        "buildings2026",
        "zoning",
        "poi",
        "restricted",
        "utilities",
      ] as const;
      const all = await Promise.all(
        names.map((n) => apiGet<FeatureCollection>(`/api/layers?name=${n}`)),
      );
      return Object.fromEntries(names.map((n, i) => [n, all[i]])) as Record<
        (typeof names)[number],
        FeatureCollection
      >;
    },
  });
}

function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function bboxOfPolygon(
  coords: number[][][],
): [number, number, number, number] {
  const b: [number, number, number, number] = [180, 90, -180, -90];
  for (const [x, y] of coords[0]) {
    b[0] = Math.min(b[0], x);
    b[1] = Math.min(b[1], y);
    b[2] = Math.max(b[2], x);
    b[3] = Math.max(b[3], y);
  }
  return b;
}

export function MapView({
  visible,
  basemap,
  epoch,
  selectedId,
  highlightIds,
  focusBbox,
  fitAllSignal = 0,
  measuring = false,
  canRisk = false,
  onSelectParcel,
  onOpenFullProfile,
  onProximityQuery,
  onOpenRisk,
  onMeasure,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const hoverIdRef = useRef<string | null>(null);
  const measurePtsRef = useRef<[number, number][]>([]);
  const allBboxRef = useRef<[number, number, number, number] | null>(null);
  const handlersBoundRef = useRef(false);
  const measuringRef = useRef(measuring);
  measuringRef.current = measuring;
  const [ready, setReady] = useState(false);
  const [styleNonce, setStyleNonce] = useState(0);
  const [popup, setPopup] = useState<ParcelClick | null>(null);
  const [, forceTick] = useState(0);
  const initialBasemap = useRef(basemap);
  const { data } = useLayers();

  const handleParcel = useCallback(
    (c: ParcelClick) => {
      setPopup(c);
      onSelectParcel(c);
    },
    [onSelectParcel],
  );

  // --- init ---------------------------------------------------------------
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: ref.current,
      style: baseStyleFor(initialBasemap.current),
      center: [85.826, 20.298],
      zoom: 14.4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    map.on("load", () => setReady(true));
    map.on("move", () => forceTick((t) => (t + 1) % 1_000_000));
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // --- basemap switch: swap the base style, then re-install overlays -----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || basemap === initialBasemap.current) {
      initialBasemap.current = basemap; // keep in sync after first apply
      return;
    }
    map.setStyle(baseStyleFor(basemap), { diff: false });
    const onData = () => {
      if (!map.isStyleLoaded()) return;
      map.off("styledata", onData);
      setStyleNonce((n) => n + 1);
    };
    map.on("styledata", onData);
    initialBasemap.current = basemap;
  }, [basemap, ready]);

  // --- (re)build overlay sources + layers ------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !data || map.getSource("parcels")) return;

    map.addSource("zoning", { type: "geojson", data: data.zoning });
    map.addSource("restricted", { type: "geojson", data: data.restricted });
    map.addSource("utilities", { type: "geojson", data: data.utilities });
    map.addSource("parcels", { type: "geojson", data: data.parcels, promoteId: "id" });
    map.addSource("buildings", { type: "geojson", data: data.buildings2026 });
    map.addSource("roads", { type: "geojson", data: data.roads });
    map.addSource("poi", { type: "geojson", data: data.poi });
    map.addSource("results", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addSource("measure", { type: "geojson", data: { type: "FeatureCollection", features: [] } });

    map.addLayer({
      id: "zoning-fill",
      type: "fill",
      source: "zoning",
      paint: {
        "fill-color": [
          "match",
          ["get", "zone_code"],
          "R2", "#6366f1",
          "C1", "#0ea5e9",
          "A1", "#65a30d",
          "#94a3b8",
        ],
        "fill-opacity": 0.1,
      },
    });
    map.addLayer({
      id: "zoning-line",
      type: "line",
      source: "zoning",
      paint: { "line-color": "#475569", "line-dasharray": [3, 2], "line-width": 1 },
    });

    map.addLayer({
      id: "restricted-fill",
      type: "fill",
      source: "restricted",
      paint: { "fill-color": "#dc2626", "fill-opacity": 0.16 },
    });
    map.addLayer({
      id: "restricted-line",
      type: "line",
      source: "restricted",
      paint: { "line-color": "#b91c1c", "line-width": 1.6, "line-dasharray": [2, 1] },
    });

    // parcels — bold, hover-aware
    map.addLayer({
      id: "parcels-fill",
      type: "fill",
      source: "parcels",
      paint: {
        "fill-color": [
          "match",
          ["get", "classification"],
          ...Object.entries(CLASS_COLOR).flat(),
          "#94a3b8",
        ] as unknown as string,
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.55,
          0.32,
        ],
      },
    });
    map.addLayer({
      id: "parcels-line",
      type: "line",
      source: "parcels",
      paint: {
        "line-color": "#1e293b",
        "line-width": ["case", ["boolean", ["feature-state", "hover"], false], 2, 0.9],
        "line-opacity": 0.75,
      },
    });
    // selected parcel: light tint fill + soft halo + dotted white casing + dotted border
    map.addLayer({
      id: "parcels-selected-fill",
      type: "fill",
      source: "parcels",
      filter: ["==", ["get", "id"], "__none__"],
      paint: { "fill-color": "#60a5fa", "fill-opacity": 0.15 },
    });
    map.addLayer({
      id: "parcels-selected-halo",
      type: "line",
      source: "parcels",
      filter: ["==", ["get", "id"], "__none__"],
      paint: { "line-color": "#1d4ed8", "line-width": 12, "line-opacity": 0.14, "line-blur": 4 },
    });
    map.addLayer({
      id: "parcels-selected-casing",
      type: "line",
      source: "parcels",
      filter: ["==", ["get", "id"], "__none__"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 5, "line-dasharray": [0, 2] },
    });
    map.addLayer({
      id: "parcels-selected",
      type: "line",
      source: "parcels",
      filter: ["==", ["get", "id"], "__none__"],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#1d4ed8", "line-width": 2.6, "line-dasharray": [0, 2] },
    });
    map.addLayer({
      id: "parcels-label",
      type: "symbol",
      source: "parcels",
      minzoom: 16.3,
      layout: {
        "text-field": ["get", "plot_no"],
        "text-size": 10,
        "text-allow-overlap": false,
      },
      paint: { "text-color": "#0f172a", "text-halo-color": "#ffffff", "text-halo-width": 1.4 },
    });

    map.addLayer({
      id: "results-fill",
      type: "fill",
      source: "results",
      paint: { "fill-color": "#f97316", "fill-opacity": 0.28 },
    });
    map.addLayer({
      id: "results-line",
      type: "line",
      source: "results",
      paint: { "line-color": "#ea580c", "line-width": 2.4 },
    });

    map.addLayer({
      id: "roads-casing",
      type: "line",
      source: "roads",
      paint: { "line-color": "#ffffff", "line-width": ["case", ["get", "highway"], 6, 3] },
    });
    map.addLayer({
      id: "roads-line",
      type: "line",
      source: "roads",
      paint: {
        "line-color": ["case", ["get", "highway"], "#b45309", "#94a3b8"],
        "line-width": ["case", ["get", "highway"], 3, 1.4],
      },
    });

    map.addLayer({
      id: "utilities-line",
      type: "line",
      source: "utilities",
      paint: {
        "line-color": [
          "match",
          ["get", "utility_type"],
          ...Object.entries(UTILITY_COLOR).flat(),
          "#64748b",
        ] as unknown as string,
        "line-width": 1.6,
        "line-dasharray": [2, 1.5],
        "line-opacity": ["case", ["==", ["get", "status"], "IN_SERVICE"], 0.9, 0.35],
      },
    });

    map.addLayer({
      id: "buildings-fill",
      type: "fill",
      source: "buildings",
      paint: {
        "fill-color": ["case", ["==", ["get", "hasPermit"], false], "#dc2626", "#64748b"],
        "fill-opacity": 0.85,
      },
    });

    map.addLayer({
      id: "poi-dot",
      type: "circle",
      source: "poi",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": [
          "match",
          ["get", "kind"],
          "hospital", "#dc2626",
          "school", "#7c3aed",
          "#0ea5e9",
        ],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
      },
    });
    map.addLayer({
      id: "poi-label",
      type: "symbol",
      source: "poi",
      filter: ["==", ["geometry-type"], "Point"],
      layout: {
        "text-field": ["get", "name"],
        "text-size": 11,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
      },
      paint: { "text-color": "#0f172a", "text-halo-color": "#ffffff", "text-halo-width": 1.5 },
    });
    map.addLayer({
      id: "river-line",
      type: "line",
      source: "poi",
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": "#0284c7", "line-width": 3 },
    });

    // measure overlay
    map.addLayer({
      id: "measure-line",
      type: "line",
      source: "measure",
      paint: { "line-color": "#0f172a", "line-width": 2, "line-dasharray": [1.5, 1] },
    });
    map.addLayer({
      id: "measure-pts",
      type: "circle",
      source: "measure",
      filter: ["==", ["geometry-type"], "Point"],
      paint: { "circle-radius": 4, "circle-color": "#0f172a", "circle-stroke-color": "#fff", "circle-stroke-width": 2 },
    });

    // keep the selected-parcel outline above roads / buildings / POI so it always reads
    for (const id of ["parcels-selected-halo", "parcels-selected-casing", "parcels-selected", "parcels-label"]) {
      if (map.getLayer(id)) map.moveLayer(id);
    }

    // interactions — bind once (survive basemap style swaps)
    if (!handlersBoundRef.current) {
      handlersBoundRef.current = true;
      map.on("mousemove", "parcels-fill", (e) => {
        if (measuringRef.current) return;
        map.getCanvas().style.cursor = "pointer";
        const f = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!f) return;
        const id = String(f.properties?.id);
        if (hoverIdRef.current && hoverIdRef.current !== id) {
          map.setFeatureState({ source: "parcels", id: hoverIdRef.current }, { hover: false });
        }
        hoverIdRef.current = id;
        map.setFeatureState({ source: "parcels", id }, { hover: true });
      });
      map.on("mouseleave", "parcels-fill", () => {
        map.getCanvas().style.cursor = "";
        if (hoverIdRef.current) {
          map.setFeatureState({ source: "parcels", id: hoverIdRef.current }, { hover: false });
          hoverIdRef.current = null;
        }
      });
      map.on("click", (e) => {
        if (measuringRef.current) {
          measurePtsRef.current.push([e.lngLat.lng, e.lngLat.lat]);
          renderMeasure();
          return;
        }
        const hits = map.queryRenderedFeatures(e.point, { layers: ["parcels-fill"] });
        const f = hits[0];
        if (!f?.properties) {
          setPopup(null);
          return;
        }
        const p = f.properties;
        handleParcel({
        id: String(p.id),
        classification: String(p.classification),
        area: Number(p.area),
        village: String(p.village ?? ""),
        ward: String(p.ward ?? ""),
        isGovernment: p.isGovernment === true || p.isGovernment === "true",
        lngLat: [e.lngLat.lng, e.lngLat.lat],
      });
    });

    function renderMeasure() {
      const m = mapRef.current;
      if (!m) return;
      const pts = measurePtsRef.current;
      const feats: FeatureCollection["features"] = pts.map((c) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: c },
        properties: {},
      }));
      if (pts.length >= 2) {
        feats.push({
          type: "Feature",
          geometry: { type: "LineString", coordinates: pts },
          properties: {},
        });
      }
      (m.getSource("measure") as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: feats,
      });
      let total = 0;
      for (let i = 1; i < pts.length; i++) total += haversine(pts[i - 1], pts[i]);
      onMeasure?.(pts.length >= 2 ? total : null);
    }
    } // end bind-once

    // fit to all parcels
    const all: [number, number, number, number] = [180, 90, -180, -90];
    for (const f of data.parcels.features) {
      if (f.geometry.type !== "Polygon") continue;
      const b = bboxOfPolygon(f.geometry.coordinates);
      all[0] = Math.min(all[0], b[0]);
      all[1] = Math.min(all[1], b[1]);
      all[2] = Math.max(all[2], b[2]);
      all[3] = Math.max(all[3], b[3]);
    }
    allBboxRef.current = all;
    if (styleNonce === 0) {
      map.fitBounds([all[0], all[1], all[2], all[3]], { padding: 36, duration: 0 });
    }
  }, [ready, data, styleNonce, handleParcel, onMeasure]);

  // fit-all trigger
  useEffect(() => {
    const map = mapRef.current;
    const b = allBboxRef.current;
    if (!map || !ready || !b || fitAllSignal === 0) return;
    map.fitBounds([b[0], b[1], b[2], b[3]], { padding: 36, duration: 500 });
  }, [fitAllSignal, ready]);

  // --- layer visibility -------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getSource("parcels")) return;
    const groups: Record<LayerKey, string[]> = {
      zoning: ["zoning-fill", "zoning-line"],
      restricted: ["restricted-fill", "restricted-line"],
      parcels: ["parcels-fill", "parcels-line", "parcels-label"],
      buildings: ["buildings-fill"],
      roads: ["roads-casing", "roads-line", "river-line"],
      utilities: ["utilities-line"],
      poi: ["poi-dot", "poi-label"],
    };
    for (const [key, ids] of Object.entries(groups) as [LayerKey, string[]][]) {
      for (const id of ids) {
        if (map.getLayer(id)) {
          map.setLayoutProperty(id, "visibility", visible[key] ? "visible" : "none");
        }
      }
    }
  }, [visible, ready, styleNonce]);

  // --- epoch swap -----------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("buildings") as maplibregl.GeoJSONSource | undefined;
    if (!src || !data) return;
    src.setData(epoch === 2024 ? data.buildings2024 : data.buildings2026);
  }, [epoch, data, styleNonce]);

  // --- selected parcel: outline + fly to it -----------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("parcels-selected") || !data) return;
    const f = ["==", ["get", "id"], selectedId ?? "__none__"] as maplibregl.FilterSpecification;
    for (const id of [
      "parcels-selected-fill",
      "parcels-selected-halo",
      "parcels-selected-casing",
      "parcels-selected",
    ]) {
      if (map.getLayer(id)) map.setFilter(id, f);
    }
    if (!selectedId) {
      setPopup(null);
      return;
    }
    setPopup((prev) => (prev && prev.id !== selectedId ? null : prev));
    const feat = data.parcels.features.find(
      (x) => (x.properties as { id?: string }).id === selectedId,
    );
    if (feat && feat.geometry.type === "Polygon") {
      const b = bboxOfPolygon(feat.geometry.coordinates);
      map.fitBounds([b[0], b[1], b[2], b[3]], { padding: 220, maxZoom: 18.5, duration: 650 });
    }
  }, [selectedId, ready, data, styleNonce]);

  // --- spatial results ------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    const src = map?.getSource("results") as maplibregl.GeoJSONSource | undefined;
    if (!src || !data) return;
    const set = new Set(highlightIds);
    src.setData({
      type: "FeatureCollection",
      features: data.parcels.features.filter((f) =>
        set.has(String((f.properties as { id?: string }).id)),
      ),
    });
  }, [highlightIds, data, styleNonce]);

  // --- external focus -----------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !focusBbox) return;
    map.fitBounds([focusBbox[0], focusBbox[1], focusBbox[2], focusBbox[3]], {
      padding: 110,
      maxZoom: 17.5,
      duration: 700,
    });
  }, [focusBbox, ready]);

  // clear measure when tool turned off
  const clearMeasure = useCallback(() => {
    const map = mapRef.current;
    measurePtsRef.current = [];
    (map?.getSource("measure") as maplibregl.GeoJSONSource | undefined)?.setData({
      type: "FeatureCollection",
      features: [],
    });
    onMeasure?.(null);
  }, [onMeasure]);
  useEffect(() => {
    if (!measuring) clearMeasure();
  }, [measuring, clearMeasure]);

  // popup screen position
  const map = mapRef.current;
  const screen =
    popup && map ? map.project(popup.lngLat as [number, number]) : null;

  return (
    <div className="relative h-full w-full">
      <div ref={ref} className="h-full w-full" />

      {popup && screen && (
        <div
          className="pointer-events-auto absolute z-20 w-64 -translate-x-1/2 -translate-y-full"
          style={{ left: screen.x, top: screen.y - 14 }}
        >
          <div className="card overflow-hidden p-0 shadow-lg">
            <div className="flex items-start justify-between gap-2 border-b border-border bg-surface-2 px-3 py-2">
              <div>
                <div className="font-mono text-[12px] font-semibold">{popup.id}</div>
                <div className="text-[11px] text-text-muted">
                  {popup.classification[0] + popup.classification.slice(1).toLowerCase()} ·{" "}
                  {popup.area} m² · {popup.village || "—"}
                </div>
              </div>
              <button
                onClick={() => setPopup(null)}
                className="rounded p-0.5 text-text-muted hover:bg-border"
                aria-label="Close"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1 p-2">
              <button
                onClick={() => onOpenFullProfile(popup.id)}
                className="col-span-2 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-white"
              >
                Open full parcel profile →
              </button>
              <button
                onClick={() => onProximityQuery(popup.lngLat, 500)}
                className="rounded-md border border-border px-2 py-1.5 text-[11px] font-medium hover:bg-surface-2"
              >
                Parcels ≤ 500 m
              </button>
              {canRisk ? (
                <button
                  onClick={() => onOpenRisk(popup.id)}
                  className="rounded-md border border-border px-2 py-1.5 text-[11px] font-medium hover:bg-surface-2"
                >
                  Risk analysis
                </button>
              ) : (
                <span className="rounded-md border border-dashed border-border px-2 py-1.5 text-center text-[11px] text-text-muted">
                  Risk: officer only
                </span>
              )}
            </div>
          </div>
          <div className="mx-auto h-3 w-3 -translate-y-1.5 rotate-45 border-b border-r border-border bg-surface" />
        </div>
      )}

      {measuring && (
        <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-md bg-slate-900/90 px-3 py-1.5 text-xs font-medium text-white">
          Click points to measure · press the tool again to clear
        </div>
      )}
    </div>
  );
}
