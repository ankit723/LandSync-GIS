/**
 * Synthetic sample world for the SIH prototype: ~200 cadastral parcels around
 * Bhubaneswar, Odisha, plus roads, buildings (2024 + 2026), zoning, POIs and a
 * flood restriction zone — and the RAW departmental records that describe them
 * in four different schemas.
 *
 * Everything is generated deterministically from a fixed seed so the demo is
 * reproducible. Replace this whole module with PostGIS-backed repositories
 * later; the exported `getWorld()` shape is the contract.
 */
import { mulberry32, pick } from "@/lib/prng";
import type {
  IdentifierMapEntry,
  MunicipalSourceRecord,
  PlanningSourceRecord,
  RegistrationSourceRecord,
  RevenueSourceRecord,
} from "@/lib/data/source-schemas";
import type { LandClassification, PolygonGeometry } from "@/lib/canonical/types";

export interface Feature<P = Record<string, unknown>> {
  type: "Feature";
  geometry:
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "LineString"; coordinates: number[][] }
    | { type: "Point"; coordinates: number[] };
  properties: P;
}
export interface FeatureCollection<P = Record<string, unknown>> {
  type: "FeatureCollection";
  features: Feature<P>[];
}

export interface ParcelSeed {
  canonicalParcelId: string;
  n: number;
  geometry: PolygonGeometry;
  centroid: [number, number];
  bbox: [number, number, number, number];
  calculatedArea: number;
  officialArea: number;
  landClassification: LandClassification;
  village: string;
  ward: string;
}

export interface World {
  parcels: ParcelSeed[];
  identifierMap: IdentifierMapEntry[];
  revenue: Record<string, RevenueSourceRecord>;
  registration: Record<string, RegistrationSourceRecord[]>;
  municipal: Record<string, MunicipalSourceRecord>;
  planning: Record<string, PlanningSourceRecord>;
  layers: {
    parcels: FeatureCollection;
    roads: FeatureCollection;
    buildings2024: FeatureCollection;
    buildings2026: FeatureCollection;
    zoning: FeatureCollection;
    poi: FeatureCollection;
    restricted: FeatureCollection;
    utilities: FeatureCollection;
  };
}

const BASE = { lon: 85.8245, lat: 20.2961 };
const COLS = 16;
const ROWS = 12;
const CELL_W_M = 60;
const CELL_H_M = 48;
const PARCEL_FILL = 0.36; // parcel occupies this fraction of the cell (~460 m²)
const ROAD_EVERY_COL = 4;
const ROAD_EVERY_ROW = 3;

const M_PER_DEG_LAT = 111_320;
const mPerDegLon = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

function mToLon(m: number) {
  return m / mPerDegLon(BASE.lat);
}
function mToLat(m: number) {
  return m / M_PER_DEG_LAT;
}

/** Shoelace area on a local equirectangular projection — good to <0.1% here. */
function ringAreaSqm(ring: number[][]): number {
  const R = 6_378_137;
  const rad = Math.PI / 180;
  const cosLat = Math.cos(BASE.lat * rad);
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    const px1 = x1 * rad * R * cosLat;
    const py1 = y1 * rad * R;
    const px2 = x2 * rad * R * cosLat;
    const py2 = y2 * rad * R;
    sum += px1 * py2 - px2 * py1;
  }
  return Math.abs(sum) / 2;
}

function rect(
  cx: number,
  cy: number,
  wLon: number,
  hLat: number,
): number[][][] {
  const x0 = cx - wLon / 2;
  const x1 = cx + wLon / 2;
  const y0 = cy - hLat / 2;
  const y1 = cy + hLat / 2;
  return [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ];
}

const FIRST_NAMES = [
  "Ankit", "Rajesh", "Rakesh", "Sunita", "Priya", "Anil", "Bijay", "Manoj",
  "Laxmi", "Sasmita", "Deepak", "Rohit", "Kavita", "Suresh", "Pramod",
  "Jyoti", "Ashok", "Nirmala", "Debashish", "Snehal",
];
const LAST_NAMES = [
  "Kumar", "Sharma", "Patra", "Sahoo", "Mohanty", "Das", "Nayak", "Behera",
  "Panda", "Rout", "Swain", "Jena", "Mishra", "Pradhan", "Singh",
];
const VILLAGES = ["Patia", "Chandrasekharpur", "Sailashree Vihar", "Nayapalli"];

// Class pools are kept consistent with each zone's permitted uses so the only
// zoning mismatches are the deliberately seeded ones (see FORCED).
const CLASS_BY_ZONE: Record<string, LandClassification[]> = {
  NORTH: ["RESIDENTIAL", "RESIDENTIAL", "RESIDENTIAL", "RESIDENTIAL", "VACANT", "GOVERNMENT"],
  CENTER: ["COMMERCIAL", "COMMERCIAL", "RESIDENTIAL", "INDUSTRIAL", "GOVERNMENT", "VACANT"],
  SOUTH: ["AGRICULTURAL", "AGRICULTURAL", "AGRICULTURAL", "AGRICULTURAL", "VACANT", "GOVERNMENT"],
};

const KIND_FROM_CLASS: Record<LandClassification, RevenueSourceRecord["land_kind"]> =
  {
    RESIDENTIAL: "ABADI",
    COMMERCIAL: "COMMERCIAL",
    AGRICULTURAL: "AGRICULTURE",
    INDUSTRIAL: "INDUSTRIAL",
    GOVERNMENT: "GOVT",
    VACANT: "VACANT",
  };

let cached: World | null = null;

export function getWorld(): World {
  if (cached) return cached;
  const rand = mulberry32(20260123);

  const parcels: ParcelSeed[] = [];
  const identifierMap: IdentifierMapEntry[] = [];
  const revenue: World["revenue"] = {};
  const registration: World["registration"] = {};
  const municipal: World["municipal"] = {};
  const planning: World["planning"] = {};

  const parcelFeatures: Feature[] = [];
  const buildings2024: Feature[] = [];
  const buildings2026: Feature[] = [];

  // total footprint width/height in metres including road gaps
  let n = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      n += 1;
      const canonicalParcelId = `LS-OD-BBSR-${String(n).padStart(6, "0")}`;

      const roadPadX =
        Math.floor(c / ROAD_EVERY_COL) * (CELL_W_M * 0.5);
      const roadPadY =
        Math.floor(r / ROAD_EVERY_ROW) * (CELL_H_M * 0.5);
      const cxM = c * CELL_W_M + roadPadX + CELL_W_M / 2;
      const cyM = r * CELL_H_M + roadPadY + CELL_H_M / 2;

      const cx = BASE.lon + mToLon(cxM) + mToLon((rand() - 0.5) * 3);
      const cy = BASE.lat + mToLat(cyM) + mToLat((rand() - 0.5) * 3);
      const wLon = mToLon(CELL_W_M * (PARCEL_FILL + rand() * 0.06));
      const hLat = mToLat(CELL_H_M * (PARCEL_FILL + rand() * 0.06));
      const coords = rect(cx, cy, wLon, hLat);
      const calculatedArea = Math.round(ringAreaSqm(coords[0]));

      const zoneBand = r < 4 ? "NORTH" : r < 8 ? "CENTER" : "SOUTH";
      let landClassification = pick(rand, CLASS_BY_ZONE[zoneBand]);

      const village = VILLAGES[Math.floor(c / (COLS / VILLAGES.length))] ?? VILLAGES[0];
      const ward = `BBSR-${String(10 + Math.floor(r / 3))}`;

      // --- forced identifiers / classification for demo parcels ---------------
      const forced = FORCED[n];
      if (forced?.landClassification) landClassification = forced.landClassification;

      let officialArea = Math.round(calculatedArea * (0.99 + rand() * 0.02));
      if (forced?.officialAreaFactor)
        officialArea = Math.round(calculatedArea * forced.officialAreaFactor);
      if (n === 123) officialArea = calculatedArea; // clean reference parcel — no deviation

      const bbox: [number, number, number, number] = [
        coords[0][0][0],
        coords[0][0][1],
        coords[0][2][0],
        coords[0][2][1],
      ];
      const seed: ParcelSeed = {
        canonicalParcelId,
        n,
        geometry: { type: "Polygon", coordinates: coords },
        centroid: [cx, cy],
        bbox,
        calculatedArea,
        officialArea,
        landClassification,
        village,
        ward,
      };
      parcels.push(seed);

      // identifiers ----------------------------------------------------------
      const plot_no = forced?.plot_no ?? String(1000 + n);
      const survey_no = `${plot_no}/${1 + (n % 4)}${pick(rand, ["A", "B", ""]) || ""}`;
      const khata_no = forced?.khata_no ?? String(40 + ((n * 7) % 90));
      const holding_id = forced?.holding_id ?? `BMC-${8000 + n}`;
      const registration_property_id =
        forced?.registration_property_id ?? `REG-${23000 + n}`;
      identifierMap.push({
        canonicalParcelId,
        plot_no,
        survey_no,
        khata_no,
        holding_id,
        registration_property_id,
      });

      // --- RAW revenue record --------------------------------------------------
      const ownerName =
        forced?.revenueHolder ??
        `${pick(rand, FIRST_NAMES)} ${pick(rand, LAST_NAMES)}`;
      revenue[canonicalParcelId] = {
        plot_no,
        survey_no,
        khata_no,
        recorded_holder: ownerName,
        co_holders:
          !forced?.clean && rand() < 0.15
            ? [`${pick(rand, FIRST_NAMES)} ${pick(rand, LAST_NAMES)}`]
            : [],
        tenancy: landClassification === "GOVERNMENT" ? "GOVT" : "SELF",
        area_acres: +(officialArea / 4046.86).toFixed(4),
        land_kind: KIND_FROM_CLASS[landClassification],
        tehsil: "Bhubaneswar",
        village,
        mutation_date: forced?.mutationDate ?? randDate(rand, 2016, 2023),
      };

      // --- RAW registration record(s) ---------------------------------------
      const regList: RegistrationSourceRecord[] = [];
      const buyer = forced?.registrationBuyer ?? ownerName;
      const seller = `${pick(rand, FIRST_NAMES)} ${pick(rand, LAST_NAMES)}`;
      regList.push({
        property_reference: registration_property_id,
        doc_no: `BBSR/${2019 + (n % 6)}/${1000 + n}`,
        deed_type: "SALE",
        buyer_name: buyer,
        seller_name: seller,
        transaction_date: forced?.registrationDate ?? randDate(rand, 2018, 2024),
        consideration_value: 800_000 + Math.round(rand() * 6_000_000),
        reg_status: forced?.regStatus ?? "RD_COMPLETE",
      });
      if (!forced?.clean && rand() < 0.2) {
        regList.push({
          property_reference: registration_property_id,
          doc_no: `BBSR/${2015 + (n % 3)}/${500 + n}`,
          deed_type: pick(rand, ["GIFT", "PARTITION"]),
          buyer_name: ownerName,
          seller_name: `${pick(rand, FIRST_NAMES)} ${pick(rand, LAST_NAMES)}`,
          transaction_date: randDate(rand, 2010, 2015),
          consideration_value: 0,
          reg_status: "RD_COMPLETE",
        });
      }
      if (forced?.mortgage || (forced?.mortgage !== false && !forced?.clean && rand() < 0.07)) {
        regList.push({
          property_reference: registration_property_id,
          doc_no: `BBSR/MTG/${2022 + (n % 3)}/${700 + n}`,
          deed_type: "MORTGAGE",
          buyer_name: pick(rand, ["State Bank of India", "HDFC Ltd", "Bank of Baroda", "LIC HFL"]),
          seller_name: ownerName,
          transaction_date: randDate(rand, 2022, 2025),
          consideration_value: 500_000 + Math.round(rand() * 4_000_000),
          reg_status: "RD_COMPLETE",
        });
      }
      registration[canonicalParcelId] = regList;

      // --- RAW municipal record -------------------------------------------------
      const plinthSqft =
        forced?.plinthSqft ?? Math.round(officialArea * 10.7639 * (0.4 + rand() * 0.4));
      const permit =
        forced?.permitState ??
        (landClassification === "AGRICULTURAL" || landClassification === "VACANT"
          ? "NONE"
          : pick(rand, ["SANCTIONED", "SANCTIONED", "SANCTIONED", "APPLIED"]));
      municipal[canonicalParcelId] = {
        holding_id,
        taxpayer: forced?.municipalTaxpayer ?? ownerName,
        ward_no: ward,
        plinth_area_sqft: plinthSqft,
        annual_tax: 1200 + Math.round(rand() * 18_000),
        tax_status:
          forced?.taxStatus ??
          pick(rand, [
            "CLEARED", "CLEARED", "CLEARED", "CLEARED", "CLEARED",
            "CLEARED", "CLEARED", "OUTSTANDING", "PART",
          ]),
        assessment_fy: "2025-26",
        building_permit_ref: permit === "SANCTIONED" ? `BP/${2020 + (n % 5)}/${300 + n}` : null,
        permit_state: permit,
        sanctioned_floors: permit === "SANCTIONED" ? 1 + (n % 3) : null,
      };

      // --- RAW planning record ----------------------------------------------
      const zoneCode = zoneBand === "NORTH" ? "R2" : zoneBand === "CENTER" ? "C1" : "A1";
      planning[canonicalParcelId] = {
        parcel_key: canonicalParcelId,
        zone_code: zoneCode,
        zone_label:
          zoneCode === "R2"
            ? "Residential Medium Density"
            : zoneCode === "C1"
              ? "Mixed Commercial"
              : "Agricultural / Green Belt",
        permitted_use_codes:
          zoneCode === "R2" ? ["R", "PSP"] : zoneCode === "C1" ? ["C", "R", "I", "PSP"] : ["A", "PSP"],
        master_plan: "BDA CDP 2030",
        overlay: forced?.overlay ?? (zoneBand === "SOUTH" && c >= COLS - 3 ? "FLOOD" : null),
      };

      // --- GIS features -------------------------------------------------------
      parcelFeatures.push({
        type: "Feature",
        geometry: seed.geometry,
        properties: {
          id: canonicalParcelId,
          n,
          plot_no,
          classification: landClassification,
          area: calculatedArea,
          village,
          ward,
          isGovernment: landClassification === "GOVERNMENT",
        },
      });

      const hasBuilding =
        forced?.building2024 ??
        (landClassification !== "AGRICULTURAL" &&
          landClassification !== "VACANT" &&
          rand() < 0.7);
      if (hasBuilding) {
        const b = buildingFootprint(cx, cy, wLon, hLat, rand);
        buildings2024.push(buildingFeature(b, canonicalParcelId, 2024, true));
        buildings2026.push(buildingFeature(b, canonicalParcelId, 2026, true));
      }
      // New construction between 2024 and 2026: the forced case plus a random
      // sprinkle. Cross-check against the permit record happens at query time.
      const addNew2026 =
        forced?.newBuilding2026 ?? (!forced?.clean && !hasBuilding && rand() < 0.06);
      if (addNew2026) {
        const b = buildingFootprint(cx, cy, wLon, hLat, rand);
        const permitted = forced?.newBuildingHasPermit ?? rand() < 0.5;
        buildings2026.push(buildingFeature(b, canonicalParcelId, 2026, permitted));
      }
    }
  }

  // --- roads --------------------------------------------------------------------
  const roads: Feature[] = [];
  const extentXm = COLS * CELL_W_M + (COLS / ROAD_EVERY_COL) * (CELL_W_M * 0.5);
  const extentYm = ROWS * CELL_H_M + (ROWS / ROAD_EVERY_ROW) * (CELL_H_M * 0.5);
  const x0 = BASE.lon - mToLon(CELL_W_M);
  const y0 = BASE.lat - mToLat(CELL_H_M);
  const x1 = BASE.lon + mToLon(extentXm);
  const y1 = BASE.lat + mToLat(extentYm);
  roads.push({
    type: "Feature",
    geometry: { type: "LineString", coordinates: [[x0, y1 + mToLat(6)], [x1, y1 + mToLat(6)]] },
    properties: { name: "NH-16 (Bhubaneswar Bypass)", ref: "NH-16", highway: true, class: "national" },
  });
  for (let c = 0; c <= COLS; c += ROAD_EVERY_COL) {
    const xm = c * CELL_W_M + Math.floor(c / ROAD_EVERY_COL) * (CELL_W_M * 0.5) - CELL_W_M * 0.25;
    const x = BASE.lon + mToLon(xm);
    roads.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[x, y0], [x, y1]] },
      properties: { name: `Sector Road ${c / ROAD_EVERY_COL + 1}`, highway: false, class: "local" },
    });
  }
  for (let r = 0; r <= ROWS; r += ROAD_EVERY_ROW) {
    const ym = r * CELL_H_M + Math.floor(r / ROAD_EVERY_ROW) * (CELL_H_M * 0.5) - CELL_H_M * 0.25;
    const y = BASE.lat + mToLat(ym);
    roads.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[x0, y], [x1, y]] },
      properties: { name: `Avenue ${r / ROAD_EVERY_ROW + 1}`, highway: false, class: "collector" },
    });
  }

  // --- zoning ----------------------------------------------------------------
  const zoning: Feature[] = [
    zoneRect(x0, y0, x1, y1, 8 / 12, 1, "R2", "Residential Medium Density", ["R", "PSP"]),
    zoneRect(x0, y0, x1, y1, 4 / 12, 8 / 12, "C1", "Mixed Commercial", ["C", "R", "I", "PSP"]),
    zoneRect(x0, y0, x1, y1, 0, 4 / 12, "A1", "Agricultural / Green Belt", ["A", "PSP"]),
  ];

  // --- POIs + river --------------------------------------------------------------
  const poi: Feature[] = [
    poiPoint(BASE.lon + mToLon(extentXm * 0.66), BASE.lat + mToLat(extentYm * 0.82), "hospital", "Capital Hospital"),
    poiPoint(BASE.lon + mToLon(extentXm * 0.86), BASE.lat + mToLat(extentYm * 0.6), "hospital", "AMRI Hospital"),
    poiPoint(BASE.lon + mToLon(extentXm * 0.1), BASE.lat + mToLat(extentYm * 0.16), "school", "Govt. High School Patia"),
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [x1 - mToLon(10), y0 - mToLat(20)],
          [x1 - mToLon(40), y0 + mToLat(extentYm * 0.35)],
          [x1 + mToLon(30), y0 + mToLat(extentYm * 0.55)],
        ],
      },
      properties: { kind: "river", name: "Kuakhai Distributary" },
    },
  ];

  // --- restricted (flood / no-construction along the river) --------------------
  const restricted: Feature[] = [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: rect(
          x1 - mToLon(CELL_W_M * 2.2),
          y0 + mToLat(extentYm * 0.28),
          mToLon(CELL_W_M * 5),
          mToLat(extentYm * 0.5),
        ),
      },
      properties: {
        type: "FLOOD_RISK_ZONE",
        description: "Kuakhai flood-risk buffer — construction restricted",
        authority: "Water Resources Dept., Odisha",
      },
    },
  ];

  // --- utility infrastructure (mains follow the road network) -----------------
  const utilities: Feature[] = [];
  for (const road of roads) {
    if (road.geometry.type !== "LineString") continue;
    const cls = (road.properties as { class?: string }).class;
    const isHighway = (road.properties as { highway?: boolean }).highway;
    // water main on every street; power on collectors/national; sewer on avenues
    utilities.push({
      type: "Feature",
      geometry: road.geometry,
      properties: {
        utility_type: "WATER",
        operator: "PH & Urban Dev. Dept., Odisha",
        status: "IN_SERVICE",
      },
    });
    if (cls === "collector" || cls === "national") {
      utilities.push({
        type: "Feature",
        geometry: offsetLine(road.geometry.coordinates, mToLat(3)),
        properties: { utility_type: "POWER", operator: "TPCODL", status: "IN_SERVICE" },
      });
    }
    if (cls === "collector") {
      utilities.push({
        type: "Feature",
        geometry: offsetLine(road.geometry.coordinates, mToLat(-3)),
        properties: {
          utility_type: "SEWER",
          operator: "Bhubaneswar Municipal Corporation",
          status: "IN_SERVICE",
        },
      });
    }
    if (isHighway) {
      utilities.push({
        type: "Feature",
        geometry: offsetLine(road.geometry.coordinates, mToLat(6)),
        properties: { utility_type: "TELECOM", operator: "BSNL / RailTel", status: "IN_SERVICE" },
      });
    }
  }
  // one out-of-service gas trunk for a realistic "status" filter
  utilities.push({
    type: "Feature",
    geometry: offsetLine(
      (roads.find((r) => (r.properties as { highway?: boolean }).highway)!
        .geometry as { coordinates: number[][] }).coordinates,
      mToLat(-10),
    ),
    properties: { utility_type: "GAS", operator: "GAIL Gas Ltd.", status: "DECOMMISSIONED" },
  });

  // --- large estate parcels (2–5 ha) for spatial-query demos -------------------
  // Placed along NH-16 (top) and the southern green belt so queries like
  // "agricultural parcels > 2 ha within 500 m of NH-16" return results.
  const BIG: {
    cls: LandClassification;
    fx: number; // fraction across extent
    top: boolean;
    wM: number;
    hM: number;
    holder: string;
  }[] = [
    { cls: "AGRICULTURAL", fx: 0.12, top: true, wM: 150, hM: 170, holder: "Gram Panchayat Patia" },
    { cls: "GOVERNMENT", fx: 0.3, top: true, wM: 200, hM: 180, holder: "Govt. of Odisha (GA Dept.)" },
    { cls: "AGRICULTURAL", fx: 0.5, top: true, wM: 160, hM: 200, holder: "Bimal Chandra Sahoo" },
    { cls: "GOVERNMENT", fx: 0.72, top: true, wM: 240, hM: 190, holder: "Industrial Infrastructure Dev. Corp." },
    { cls: "AGRICULTURAL", fx: 0.2, top: false, wM: 180, hM: 160, holder: "Rukmini Behera" },
    { cls: "GOVERNMENT", fx: 0.42, top: false, wM: 220, hM: 170, holder: "Forest Dept., Odisha" },
    { cls: "AGRICULTURAL", fx: 0.63, top: false, wM: 200, hM: 190, holder: "Prasanna Kumar Jena" },
    { cls: "VACANT", fx: 0.85, top: false, wM: 160, hM: 150, holder: "Govt. of Odisha (Revenue)" },
  ];

  BIG.forEach((b, i) => {
    n += 1;
    const canonicalParcelId = `LS-OD-BBSR-${String(n).padStart(6, "0")}`;
    const cx = x0 + (x1 - x0) * b.fx;
    const cy = b.top
      ? y1 - mToLat(b.hM / 2 + 25)
      : y0 + mToLat(b.hM / 2 + 20);
    const coords = rect(cx, cy, mToLon(b.wM), mToLat(b.hM));
    const calculatedArea = Math.round(ringAreaSqm(coords[0]));
    const officialArea = Math.round(calculatedArea * (0.97 + rand() * 0.06));
    const village = VILLAGES[i % VILLAGES.length];
    const ward = `BBSR-${20 + i}`;
    const plot_no = String(2000 + n);
    const survey_no = `${plot_no}/0`;
    const khata_no = String(300 + i);
    const holding_id = `BMC-EST-${100 + i}`;
    const registration_property_id = `REG-EST-${400 + i}`;

    parcels.push({
      canonicalParcelId,
      n,
      geometry: { type: "Polygon", coordinates: coords },
      centroid: [cx, cy],
      bbox: [coords[0][0][0], coords[0][0][1], coords[0][2][0], coords[0][2][1]],
      calculatedArea,
      officialArea,
      landClassification: b.cls,
      village,
      ward,
    });
    identifierMap.push({
      canonicalParcelId,
      plot_no,
      survey_no,
      khata_no,
      holding_id,
      registration_property_id,
    });
    revenue[canonicalParcelId] = {
      plot_no,
      survey_no,
      khata_no,
      recorded_holder: b.holder,
      co_holders: [],
      tenancy: b.cls === "GOVERNMENT" || b.cls === "VACANT" ? "GOVT" : "SELF",
      area_acres: +(officialArea / 4046.86).toFixed(4),
      land_kind: KIND_FROM_CLASS[b.cls],
      tehsil: "Bhubaneswar",
      village,
      mutation_date: randDate(rand, 2012, 2020),
    };
    registration[canonicalParcelId] = [
      {
        property_reference: registration_property_id,
        doc_no: `BBSR/EST/${2016 + (i % 4)}/${90 + n}`,
        deed_type: b.cls === "AGRICULTURAL" ? "PARTITION" : "GIFT",
        buyer_name: b.holder,
        seller_name: b.cls === "AGRICULTURAL" ? "Estate of late Gopal Sahoo" : "Govt. of Odisha",
        transaction_date: randDate(rand, 2013, 2019),
        consideration_value: 0,
        reg_status: "RD_COMPLETE",
      },
    ];
    municipal[canonicalParcelId] = {
      holding_id,
      taxpayer: b.holder,
      ward_no: ward,
      plinth_area_sqft: Math.round(calculatedArea * 10.7639 * 0.05),
      annual_tax: b.cls === "GOVERNMENT" || b.cls === "VACANT" ? 0 : 4000 + Math.round(rand() * 9000),
      tax_status: b.cls === "GOVERNMENT" || b.cls === "VACANT" ? "EXEMPTED" : "CLEARED",
      assessment_fy: "2025-26",
      building_permit_ref: null,
      permit_state: "NONE",
      sanctioned_floors: null,
    };
    const bigZoneCommercial = b.top && b.cls !== "AGRICULTURAL";
    planning[canonicalParcelId] = {
      parcel_key: canonicalParcelId,
      zone_code: bigZoneCommercial ? "C1" : "A1",
      zone_label: bigZoneCommercial ? "Mixed Commercial" : "Agricultural / Green Belt",
      permitted_use_codes: bigZoneCommercial ? ["C", "R", "I", "PSP"] : ["A", "PSP"],
      master_plan: "BDA CDP 2030",
      overlay: null,
    };
    parcelFeatures.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: coords },
      properties: {
        id: canonicalParcelId,
        n,
        plot_no,
        classification: b.cls,
        area: calculatedArea,
        village,
        ward,
        isGovernment: b.cls === "GOVERNMENT",
      },
    });
  });

  cached = {
    parcels,
    identifierMap,
    revenue,
    registration,
    municipal,
    planning,
    layers: {
      parcels: { type: "FeatureCollection", features: parcelFeatures },
      roads: { type: "FeatureCollection", features: roads },
      buildings2024: { type: "FeatureCollection", features: buildings2024 },
      buildings2026: { type: "FeatureCollection", features: buildings2026 },
      zoning: { type: "FeatureCollection", features: zoning },
      poi: { type: "FeatureCollection", features: poi },
      restricted: { type: "FeatureCollection", features: restricted },
      utilities: { type: "FeatureCollection", features: utilities },
    },
  };
  return cached;
}

// ---------------------------------------------------------------------------
function randDate(rand: () => number, y0: number, y1: number): string {
  const y = y0 + Math.floor(rand() * (y1 - y0 + 1));
  const m = 1 + Math.floor(rand() * 12);
  const d = 1 + Math.floor(rand() * 28);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Shift a polyline by a fixed latitude delta (crude parallel offset for mains). */
function offsetLine(coords: number[][], dLat: number): { type: "LineString"; coordinates: number[][] } {
  return { type: "LineString", coordinates: coords.map(([x, y]) => [x, y + dLat]) };
}

function buildingFootprint(
  cx: number,
  cy: number,
  wLon: number,
  hLat: number,
  rand: () => number,
): number[][][] {
  const bw = wLon * (0.4 + rand() * 0.25);
  const bh = hLat * (0.4 + rand() * 0.25);
  const ox = (rand() - 0.5) * wLon * 0.2;
  const oy = (rand() - 0.5) * hLat * 0.2;
  return rect(cx + ox, cy + oy, bw, bh);
}
function buildingFeature(
  coords: number[][][],
  parcelId: string,
  year: number,
  hasPermit: boolean,
): Feature {
  return {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: coords },
    properties: { parcelId, year, hasPermit, floors: 1 + (parcelId.charCodeAt(13) % 3) },
  };
}
function zoneRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fy0: number,
  fy1: number,
  code: string,
  label: string,
  uses: string[],
): Feature {
  const yy0 = y0 + (y1 - y0) * fy0;
  const yy1 = y0 + (y1 - y0) * fy1;
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [x0, yy0],
          [x1, yy0],
          [x1, yy1],
          [x0, yy1],
          [x0, yy0],
        ],
      ],
    },
    properties: { zone_code: code, zone_label: label, permitted_use_codes: uses, master_plan: "BDA CDP 2030" },
  };
}
function poiPoint(lon: number, lat: number, kind: string, name: string): Feature {
  return { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: { kind, name } };
}

// ---------------------------------------------------------------------------
// Hand-seeded parcels that carry the demo storylines (PRD §8, §18).
interface Forced {
  landClassification?: LandClassification;
  plot_no?: string;
  khata_no?: string;
  holding_id?: string;
  registration_property_id?: string;
  revenueHolder?: string;
  registrationBuyer?: string;
  municipalTaxpayer?: string;
  registrationDate?: string;
  mutationDate?: string;
  regStatus?: RegistrationSourceRecord["reg_status"];
  taxStatus?: MunicipalSourceRecord["tax_status"];
  officialAreaFactor?: number;
  plinthSqft?: number;
  permitState?: MunicipalSourceRecord["permit_state"];
  overlay?: string | null;
  building2024?: boolean;
  newBuilding2026?: boolean;
  newBuildingHasPermit?: boolean;
  mortgage?: boolean;
  clean?: boolean;
}

const FORCED: Record<number, Forced> = {
  // Clean reference parcel — matches PRD §7F unified-profile example exactly.
  123: {
    clean: true,
    mortgage: false,
    landClassification: "RESIDENTIAL",
    plot_no: "142",
    khata_no: "56",
    holding_id: "BMC-8492",
    registration_property_id: "REG-23812",
    revenueHolder: "Ankit Kumar",
    registrationBuyer: "Ankit Kumar",
    municipalTaxpayer: "Ankit Kumar",
    taxStatus: "CLEARED",
    permitState: "SANCTIONED",
    building2024: true,
  },
  // CRITICAL ownership mismatch (PRD §8 FR-08 / §18 step 5). Plot 88.
  77: {
    plot_no: "88",
    revenueHolder: "Rajesh Kumar",
    registrationBuyer: "Rakesh Sharma",
    municipalTaxpayer: "Rajesh Kumar",
    regStatus: "RD_COMPLETE",
  },
  // Area discrepancy — revenue area 22% over the map, municipal plinth exceeds
  // the plot itself (PRD §8 FR-08). Plot 210.
  45: {
    plot_no: "210",
    officialAreaFactor: 1.22,
    plinthSqft: Math.round(620 * 10.7639),
    landClassification: "COMMERCIAL",
  },
  // Fuzzy name match for entity resolution — ~91% similar (PRD §8 FR-09). Plot 305.
  88: {
    plot_no: "305",
    revenueHolder: "Anil Kumar",
    registrationBuyer: "Anil K. Kumar",
    municipalTaxpayer: "Anil Kumar",
  },
  // Missing synchronisation — 2026 registered sale not reflected in RoR. Plot 417.
  102: {
    plot_no: "417",
    revenueHolder: "Sunita Das",
    registrationBuyer: "Deepak Pradhan",
    registrationDate: "2026-02-11",
    mutationDate: "2015-06-04",
  },
  // Unauthorised construction — new 2026 structure, no permit (PRD §8 FR-11). Plot 520.
  150: {
    plot_no: "520",
    landClassification: "RESIDENTIAL",
    newBuilding2026: true,
    newBuildingHasPermit: false,
    permitState: "NONE",
  },
  // Land-use mismatch — agricultural parcel with a building inside a green belt. Plot 634.
  160: { plot_no: "634", landClassification: "AGRICULTURAL", building2024: true, permitState: "NONE" },
  // Active mortgage encumbrance + tax dues. Plot 705.
  134: { plot_no: "705", taxStatus: "OUTSTANDING", mortgage: true },
};
