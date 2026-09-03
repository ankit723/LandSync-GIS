import { nameSimilarity } from "@/lib/intelligence/similarity";
import type { CanonicalParcel, RiskAssessment, RiskReason } from "@/lib/canonical/types";
import type { ParcelAux } from "@/lib/integration/pipeline";

const SQFT_TO_SQM = 0.092903;

const LEVEL_RANK = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 } as const;
type Level = keyof typeof LEVEL_RANK;

function maxLevel(a: Level, b: Level): Level {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

export interface DetectionResult extends RiskAssessment {
  /** structured evidence for the explainability panel (PRD NFR-05) */
  evidence: {
    rorHolder: string | null;
    latestRegisteredBuyer: string | null;
    ownerSimilarity: number | null;
    calculatedArea: number;
    officialArea: number;
    municipalPlinthArea: number | null;
    areaDeviationPct: number;
    has2026Building: boolean;
    buildingHasPermit: boolean | null;
    permittedLandUse: string[];
  };
}

export function detectInconsistencies(parcel: CanonicalParcel, aux: ParcelAux): DetectionResult {
  const id = parcel.canonicalParcelId;
  const reasons: RiskReason[] = [];
  let level: Level = "NONE";
  const confidences: number[] = [];

  /* 1. Ownership consistency -------------------------------------------------- */
  const latestRor =
    [...parcel.ownershipRecords].sort((a, b) => b.validFrom.localeCompare(a.validFrom))[0] ??
    null;
  const latestReg =
    [...parcel.registrationRecords]
      .filter((r) => r.transactionType === "SALE_DEED" || r.transactionType === "GIFT_DEED")
      .sort((a, b) => b.transactionDate.localeCompare(a.transactionDate))[0] ?? null;

  let ownerSimilarity: number | null = null;
  if (latestRor && latestReg) {
    ownerSimilarity = nameSimilarity(latestRor.personReference, latestReg.buyer);
    if (ownerSimilarity < 0.55) {
      level = maxLevel(level, "CRITICAL");
      confidences.push(0.9);
      reasons.push({
        code: "OWNER_NAME_MISMATCH",
        detail: `Recorded holder in Land Records ("${latestRor.personReference}") does not match the buyer in the latest registered deed ("${latestReg.buyer}"). Similarity ${(ownerSimilarity * 100).toFixed(0)}%.`,
        sourceRecords: [`REVENUE:khata`, `REGISTRATION:${latestReg.documentNumber}`],
      });
    } else if (ownerSimilarity < 0.86) {
      level = maxLevel(level, "MEDIUM");
      confidences.push(ownerSimilarity);
      reasons.push({
        code: "OWNER_NAME_FUZZY_MATCH",
        detail: `Recorded holder ("${latestRor.personReference}") and registered buyer ("${latestReg.buyer}") are a probable match at ${(ownerSimilarity * 100).toFixed(0)}% confidence. Likely the same person recorded differently — verify before relying on it.`,
        sourceRecords: [`REVENUE:khata`, `REGISTRATION:${latestReg.documentNumber}`],
      });
    }
  }

  /* 2. Missing synchronisation --------------------------------------------- */
  if (latestRor && latestReg && ownerSimilarity !== null && ownerSimilarity < 0.86) {
    const gapDays =
      (Date.parse(latestReg.transactionDate) - Date.parse(latestRor.validFrom)) / 86_400_000;
    if (gapDays > 180 && latestReg.registrationStatus === "REGISTERED") {
      level = maxLevel(level, "HIGH");
      confidences.push(0.82);
      reasons.push({
        code: "ROR_NOT_SYNCHRONISED",
        detail: `A sale was registered on ${latestReg.transactionDate} but the Record of Rights still shows the pre-sale holder (mutation dated ${latestRor.validFrom}). Mutation appears pending — records are out of sync by ${Math.round(gapDays)} days.`,
        sourceRecords: [`REGISTRATION:${latestReg.documentNumber}`, `REVENUE:mutation`],
      });
    }
  }

  /* 3. Area discrepancy --------------------------------------------------- */
  const areaDeviationPct =
    parcel.calculatedArea > 0
      ? Math.abs(parcel.officialArea - parcel.calculatedArea) / parcel.calculatedArea
      : 0;
  const municipalPlinthArea =
    aux.municipalPlinthSqft != null ? Math.round(aux.municipalPlinthSqft * SQFT_TO_SQM) : null;
  // Municipal plinth is a *building footprint*, so it is only inconsistent when it
  // exceeds the parcel itself. Otherwise the check is revenue area vs map area.
  const plinthOverPlot =
    municipalPlinthArea && parcel.calculatedArea > 0
      ? municipalPlinthArea / parcel.calculatedArea - 1
      : 0;
  const worstAreaDev = Math.max(areaDeviationPct, plinthOverPlot > 0.05 ? plinthOverPlot : 0);
  if (worstAreaDev >= 0.15) {
    level = maxLevel(level, "HIGH");
    confidences.push(0.75);
    reasons.push({
      code: "AREA_DISCREPANCY",
      detail: `Cadastral (map) area is ${parcel.calculatedArea} m²; revenue records state ${parcel.officialArea} m²${
        plinthOverPlot > 0.05
          ? `; the municipal plinth area (${municipalPlinthArea} m²) is larger than the plot itself`
          : ""
      }. Largest deviation ${(worstAreaDev * 100).toFixed(0)}% exceeds the 15% tolerance.`,
      sourceRecords: ["LANDSTACK:geometry", "REVENUE:area_acres", "MUNICIPAL:plinth_area_sqft"],
    });
  } else if (worstAreaDev >= 0.08) {
    level = maxLevel(level, "MEDIUM");
    confidences.push(0.6);
    reasons.push({
      code: "AREA_MINOR_DISCREPANCY",
      detail: `Revenue area (${parcel.officialArea} m²) and cadastral map area (${parcel.calculatedArea} m²) differ by ${(worstAreaDev * 100).toFixed(0)}%.`,
      sourceRecords: ["LANDSTACK:geometry", "REVENUE:area_acres"],
    });
  }

  /* 4. Unauthorised construction ---------------------------------------- */
  const has2026Building = aux.building2026Count > 0;
  const newStructure = aux.building2026Count > aux.building2024Count;
  const permit = parcel.buildingPermissions[0] ?? null;
  const buildingHasPermit = has2026Building ? aux.all2026Permitted : null;
  if (
    newStructure &&
    (!permit || permit.status === "NOT_FOUND" || permit.status === "REJECTED")
  ) {
    level = maxLevel(level, "HIGH");
    confidences.push(0.8);
    reasons.push({
      code: "UNAUTHORISED_CONSTRUCTION",
      detail: `A new structure is visible in the 2026 layer that was not present in 2024, but no approved building permission is on record (permit status: ${permit?.status ?? "NONE"}).`,
      sourceRecords: ["LANDSTACK:buildings_2024", "LANDSTACK:buildings_2026", "MUNICIPAL:permit_state"],
    });
  }

  /* 5. Land-use / zoning mismatch ------------------------------------- */
  const permitted = parcel.zoningInformation?.permittedLandUse ?? [];
  if (
    permitted.length &&
    !permitted.includes(parcel.landClassification) &&
    parcel.landClassification !== "VACANT"
  ) {
    level = maxLevel(level, "MEDIUM");
    confidences.push(0.65);
    reasons.push({
      code: "LANDUSE_ZONING_MISMATCH",
      detail: `Parcel is classified ${parcel.landClassification} but the zone "${parcel.zoningInformation?.zoneName}" permits only ${permitted.join(", ")}.`,
      sourceRecords: ["REVENUE:land_kind", "PLANNING:permitted_use_codes"],
    });
  }

  /* 6. Restriction + construction ----------------------------------- */
  if (parcel.restrictions.length && has2026Building) {
    level = maxLevel(level, "MEDIUM");
    confidences.push(0.6);
    reasons.push({
      code: "CONSTRUCTION_IN_RESTRICTED_ZONE",
      detail: `Parcel carries restriction "${parcel.restrictions[0].type}" (${parcel.restrictions[0].authority}) and has a built structure.`,
      sourceRecords: ["PLANNING:overlay", "LANDSTACK:buildings_2026"],
    });
  }

  /* 7. Active encumbrance — advisory only, not a record inconsistency ------- */
  const activeEnc = parcel.encumbrances.filter((e) => e.status === "ACTIVE");
  if (activeEnc.length) {
    level = maxLevel(level, "LOW");
    confidences.push(0.5);
    reasons.push({
      code: "ACTIVE_ENCUMBRANCE",
      detail: `${activeEnc.length} active encumbrance(s) on record: ${activeEnc.map((e) => e.type).join(", ")}. Advisory — factor into any transaction.`,
      sourceRecords: activeEnc.map((e) => `REGISTRATION:${e.sourceReference}`),
    });
  }

  /* 8. Tax dues — advisory only ---------------------------------- */
  const dueTax = parcel.taxationRecords.filter(
    (t) => t.paymentStatus === "DUE" || t.paymentStatus === "PARTIALLY_PAID",
  );
  if (dueTax.length) {
    level = maxLevel(level, "LOW");
    confidences.push(0.45);
    reasons.push({
      code: "PROPERTY_TAX_DUE",
      detail: `Property tax for ${dueTax.map((t) => t.assessmentYear).join(", ")} is ${dueTax[0].paymentStatus}. Advisory.`,
      sourceRecords: ["MUNICIPAL:tax_status"],
    });
  }

  const confidence = confidences.length
    ? confidences.reduce((a, b) => a + b, 0) / confidences.length
    : 0;
  const requiresHumanVerification = level === "HIGH" || level === "CRITICAL" || reasons.some((r) => r.code === "OWNER_NAME_FUZZY_MATCH");

  const recommendedAction =
    level === "CRITICAL" || level === "HIGH"
      ? "Manual verification required before any record update or transaction."
      : level === "MEDIUM"
        ? "Officer review recommended."
        : level === "LOW"
          ? "Informational — no blocking issues."
          : "No critical issues detected.";

  return {
    parcelId: id,
    riskLevel: level,
    confidence: Number(confidence.toFixed(2)),
    reasons,
    recommendedAction,
    requiresHumanVerification,
    generatedAt: new Date().toISOString(),
    evidence: {
      rorHolder: latestRor?.personReference ?? null,
      latestRegisteredBuyer: latestReg?.buyer ?? null,
      ownerSimilarity: ownerSimilarity !== null ? Number(ownerSimilarity.toFixed(2)) : null,
      calculatedArea: parcel.calculatedArea,
      officialArea: parcel.officialArea,
      municipalPlinthArea,
      areaDeviationPct: Number((worstAreaDev * 100).toFixed(1)),
      has2026Building,
      buildingHasPermit,
      permittedLandUse: permitted,
    },
  };
}
