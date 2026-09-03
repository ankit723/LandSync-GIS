import { z } from "zod";
import type { LandClassification } from "@/lib/canonical/types";
import { chat, extractJson, isLlmConfigured } from "@/lib/ai/llm";

export interface SpatialFilter {
  landUse?: LandClassification[];
  ownership?: "GOVERNMENT" | "PRIVATE";
  minArea?: number; // m²
  maxArea?: number; // m²
  nearPoi?: { kind: string; withinMeters: number };
  nearRoadRef?: { ref: string; withinMeters: number };
  nearUtility?: { type: string; withinMeters: number };
  /** proximity to an arbitrary point — used by the "parcels near here" map action */
  nearPoint?: { lon: number; lat: number; withinMeters: number };
  intersects?: "FLOOD_RISK_ZONE";
  withinWard?: string;
}

export interface ParsedQuery {
  ok: boolean;
  filters: SpatialFilter;
  interpretation: string[];
  unparsed: string[];
  method: "rule-based" | "llm" | "llm-fallback-rule-based";
  llm?: { provider: string; model: string; ms: number };
  notes?: string;
}

const CLASS_WORDS: [RegExp, LandClassification][] = [
  [/\bagricultur(e|al)\b/i, "AGRICULTURAL"],
  [/\bresidential\b/i, "RESIDENTIAL"],
  [/\bcommercial\b/i, "COMMERCIAL"],
  [/\bindustrial\b/i, "INDUSTRIAL"],
  [/\bgovernment\b|\bgovt\b/i, "GOVERNMENT"],
  [/\bvacant\b|\bempty\b/i, "VACANT"],
];

function toMetres(value: number, unit: string): number {
  const u = unit.toLowerCase();
  if (u.startsWith("km") || u.startsWith("kilomet")) return value * 1000;
  if (u.startsWith("ha") || u.startsWith("hectare")) return value * 10_000;
  if (u.startsWith("acre")) return value * 4046.86;
  return value; // m / metre / meter / sqm / m2
}

/**
 * Deterministic natural-language → structured filter translator.
 *
 * Kept rule-based so the prototype has no external dependency and the output is
 * fully transparent (PRD FR-10). To use an LLM instead, replace this function
 * with a call that returns the same `SpatialFilter` shape and feed it through
 * the identical spatial engine — the contract does not change.
 */
export function parseNlQuery(input: string): ParsedQuery {
  const text = input.trim();
  const filters: SpatialFilter = {};
  const interpretation: string[] = [];
  const consumed: string[] = [];

  // land classification
  const classes: LandClassification[] = [];
  for (const [re, cls] of CLASS_WORDS) {
    if (re.test(text) && !classes.includes(cls)) {
      classes.push(cls);
      consumed.push(re.source);
    }
  }
  if (classes.length) {
    filters.landUse = classes;
    interpretation.push(`land_use IN (${classes.join(", ")})`);
  }

  // ownership
  if (/\bgovernment\b|\bgovt\b|\bpublic land\b/i.test(text)) {
    filters.ownership = "GOVERNMENT";
    interpretation.push(`ownership = GOVERNMENT`);
  } else if (/\bprivate\b/i.test(text)) {
    filters.ownership = "PRIVATE";
    interpretation.push(`ownership = PRIVATE`);
  }

  // area comparisons
  const areaRe =
    /(larger than|greater than|bigger than|more than|over|above|smaller than|less than|under|below|at least|at most)\s+([\d.]+)\s*(hectares?|ha|acres?|sq\.?\s?m(?:etres?|eters?)?|sqm|m2|m²|metres?|meters?)/gi;
  let m: RegExpExecArray | null;
  while ((m = areaRe.exec(text))) {
    const [, cmp, num, unit] = m;
    const metres = toMetres(Number.parseFloat(num), unit);
    if (/smaller|less|under|below|at most/i.test(cmp)) {
      filters.maxArea = metres;
      interpretation.push(`area <= ${metres} m²`);
    } else {
      filters.minArea = metres;
      interpretation.push(`area >= ${metres} m²`);
    }
    consumed.push(m[0]);
  }

  // proximity to POI / road
  const nearRe =
    /(?:within|inside|under|closer than)\s+([\d.]+)\s*(km|kilometres?|kilometers?|m|metres?|meters?)\s+(?:of|from|to)\s+(?:an?\s+|the\s+)?([a-z0-9\- ]+?)(?:\.|,|$| and | with | that)/i;
  const nm = nearRe.exec(text);
  const simpleNear = /\bnear(?:by| to)?\s+(?:an?\s+|the\s+)?([a-z0-9\- ]+?)(?:\.|,|$| and | with )/i.exec(text);
  const target = nm?.[3]?.trim() ?? simpleNear?.[1]?.trim();
  const dist = nm ? toMetres(Number.parseFloat(nm[1]), nm[2]) : 500;
  if (target) {
    if (/highway|nh-?\s?\d+|national highway|expressway/i.test(target)) {
      const refM = /nh-?\s?(\d+)/i.exec(target);
      filters.nearRoadRef = { ref: refM ? `NH-${refM[1]}` : "NH-16", withinMeters: dist };
      interpretation.push(`distance(${filters.nearRoadRef.ref}) < ${dist} m`);
    } else if (/hospital|clinic|phc|health/i.test(target)) {
      filters.nearPoi = { kind: "hospital", withinMeters: dist };
      interpretation.push(`distance(hospital) < ${dist} m`);
    } else if (/school|college|education/i.test(target)) {
      filters.nearPoi = { kind: "school", withinMeters: dist };
      interpretation.push(`distance(school) < ${dist} m`);
    } else if (/river|drain|canal/i.test(target)) {
      filters.nearPoi = { kind: "river", withinMeters: dist };
      interpretation.push(`distance(river) < ${dist} m`);
    } else if (/water (main|line|supply|pipe)|water network/i.test(target)) {
      filters.nearUtility = { type: "WATER", withinMeters: dist };
      interpretation.push(`distance(utility:WATER) < ${dist} m`);
    } else if (/power (line|grid|supply)|electric|electricity|11\s?kv|33\s?kv/i.test(target)) {
      filters.nearUtility = { type: "POWER", withinMeters: dist };
      interpretation.push(`distance(utility:POWER) < ${dist} m`);
    } else if (/sewer|sewage|drainage network/i.test(target)) {
      filters.nearUtility = { type: "SEWER", withinMeters: dist };
      interpretation.push(`distance(utility:SEWER) < ${dist} m`);
    } else if (/telecom|fibre|fiber|optical/i.test(target)) {
      filters.nearUtility = { type: "TELECOM", withinMeters: dist };
      interpretation.push(`distance(utility:TELECOM) < ${dist} m`);
    }
    if (nm) consumed.push(nm[0]);
  }

  // flood / restriction intersection
  if (/flood[- ]?risk|flood zone|flood[- ]?prone/i.test(text)) {
    filters.intersects = "FLOOD_RISK_ZONE";
    interpretation.push(`intersects(FLOOD_RISK_ZONE) = true`);
  }

  // ward
  const wardRe = /\bward\s+([a-z]{2,6}-?\d{1,3})\b/i;
  const wm = wardRe.exec(text);
  if (wm) {
    filters.withinWard = wm[1].toUpperCase();
    interpretation.push(`ward = ${filters.withinWard}`);
    consumed.push(wm[0]);
  }

  const ok = interpretation.length > 0;
  const unparsed = ok ? [] : [text];
  if (!ok) interpretation.push("Could not extract any structured filter from this query.");

  return { ok, filters, interpretation, unparsed, method: "rule-based" };
}

/* -------------------------------------------------------------------------- */
/* LLM-backed interpretation (deterministic executor stays underneath)         */
/* -------------------------------------------------------------------------- */

const filterSchema = z
  .object({
    landUse: z
      .array(z.enum(["RESIDENTIAL", "COMMERCIAL", "AGRICULTURAL", "INDUSTRIAL", "GOVERNMENT", "VACANT"]))
      .optional(),
    ownership: z.enum(["GOVERNMENT", "PRIVATE"]).optional(),
    minArea: z.number().positive().optional(),
    maxArea: z.number().positive().optional(),
    nearPoi: z
      .object({
        kind: z.enum(["hospital", "school", "river"]),
        withinMeters: z.number().positive().max(20000),
      })
      .optional(),
    nearRoadRef: z
      .object({ ref: z.string().min(1).max(20), withinMeters: z.number().positive().max(20000) })
      .optional(),
    nearUtility: z
      .object({
        type: z.enum(["WATER", "POWER", "SEWER", "TELECOM", "GAS"]),
        withinMeters: z.number().positive().max(20000),
      })
      .optional(),
    intersects: z.literal("FLOOD_RISK_ZONE").optional(),
    withinWard: z.string().max(20).optional(),
  })
  .strict();

const SYSTEM_PROMPT = `You translate a user's natural-language request about land parcels into a strict JSON filter object for a GIS query engine. Output ONLY the JSON object.

Schema (all keys optional; omit keys you cannot justify from the text):
{
  "landUse": ["RESIDENTIAL"|"COMMERCIAL"|"AGRICULTURAL"|"INDUSTRIAL"|"GOVERNMENT"|"VACANT", ...],
  "ownership": "GOVERNMENT" | "PRIVATE",
  "minArea": number (square metres),
  "maxArea": number (square metres),
  "nearPoi": { "kind": "hospital"|"school"|"river", "withinMeters": number },
  "nearRoadRef": { "ref": string (e.g. "NH-16"), "withinMeters": number },
  "nearUtility": { "type": "WATER"|"POWER"|"SEWER"|"TELECOM"|"GAS", "withinMeters": number },
  "intersects": "FLOOD_RISK_ZONE",
  "withinWard": string
}

Rules:
- Convert areas to square metres: 1 hectare = 10000, 1 acre = 4046.86.
- Convert distances to metres: 1 km = 1000.
- "government land" / "public land" => ownership: "GOVERNMENT".
- "flood zone" / "flood-risk" => intersects: "FLOOD_RISK_ZONE".
- A highway like "NH-16" => nearRoadRef with that ref.
- "water line/main", "power/electricity line", "sewer", "fibre/telecom" => nearUtility with the matching type.
- If no distance is stated but proximity is implied ("near a hospital"), use 500.
- If nothing structured can be extracted, return {}.`;

const RESERVED_ROADS = /nh-?\s?\d+/i;

/**
 * Interpret an NL query. Prefers the LLM when a key is configured, validates its
 * output against the same schema the executor accepts, and falls back to the
 * deterministic parser on any failure. The interpreted filters are always shown
 * to the user before the query runs (PRD FR-10).
 */
export async function interpretNlQuery(input: string): Promise<ParsedQuery> {
  const rule = parseNlQuery(input);

  if (!isLlmConfigured()) return rule;

  try {
    const res = await chat({
      system: SYSTEM_PROMPT,
      user: input,
      json: true,
      maxTokens: 300,
      temperature: 0,
      timeoutMs: 12_000,
    });
    const parsed = filterSchema.safeParse(extractJson(res.text));
    if (!parsed.success) {
      return {
        ...rule,
        method: "llm-fallback-rule-based",
        notes: "LLM output failed schema validation; used rule-based parse.",
      };
    }
    const filters = parsed.data as SpatialFilter;
    // light sanity: a bare road ref the DB won't know about -> keep, executor returns 0
    if (filters.nearRoadRef && !RESERVED_ROADS.test(filters.nearRoadRef.ref)) {
      filters.nearRoadRef.ref = filters.nearRoadRef.ref.toUpperCase();
    }
    const interpretation = describeFilters(filters);
    return {
      ok: interpretation.length > 0,
      filters,
      interpretation:
        interpretation.length > 0
          ? interpretation
          : ["The model did not extract any structured filter from this query."],
      unparsed: interpretation.length > 0 ? [] : [input],
      method: "llm",
      llm: { provider: res.provider, model: res.model, ms: res.ms },
    };
  } catch (err) {
    return {
      ...rule,
      method: "llm-fallback-rule-based",
      notes: `LLM call failed (${err instanceof Error ? err.message : "error"}); used rule-based parse.`,
    };
  }
}

function describeFilters(f: SpatialFilter): string[] {
  const out: string[] = [];
  if (f.landUse?.length) out.push(`land_use IN (${f.landUse.join(", ")})`);
  if (f.ownership) out.push(`ownership = ${f.ownership}`);
  if (f.minArea != null) out.push(`area >= ${Math.round(f.minArea)} m²`);
  if (f.maxArea != null) out.push(`area <= ${Math.round(f.maxArea)} m²`);
  if (f.nearPoi) out.push(`distance(${f.nearPoi.kind}) < ${f.nearPoi.withinMeters} m`);
  if (f.nearRoadRef) out.push(`distance(${f.nearRoadRef.ref}) < ${f.nearRoadRef.withinMeters} m`);
  if (f.nearUtility) out.push(`distance(utility:${f.nearUtility.type}) < ${f.nearUtility.withinMeters} m`);
  if (f.nearPoint)
    out.push(
      `distance(point ${f.nearPoint.lon.toFixed(4)},${f.nearPoint.lat.toFixed(4)}) < ${f.nearPoint.withinMeters} m`,
    );
  if (f.intersects) out.push(`intersects(${f.intersects}) = true`);
  if (f.withinWard) out.push(`ward = ${f.withinWard}`);
  return out;
}
