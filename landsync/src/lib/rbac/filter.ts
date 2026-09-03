import type { CanonicalParcel } from "@/lib/canonical/types";
import {
  sectionVisibility,
  type ProfileSection,
  type Role,
  type Visibility,
} from "@/lib/rbac/matrix";

const REDACTED = "•••• restricted";

export interface SectionView<T> {
  visibility: Visibility;
  /** null when hidden */
  data: T | null;
  note?: string;
}

export interface ParcelProfileView {
  canonicalParcelId: string;
  role: Role;
  identity: SectionView<{
    canonicalParcelId: string;
    identifiers: CanonicalParcel["identifiers"];
  }>;
  geometry: SectionView<{
    geometry: CanonicalParcel["geometry"];
    calculatedArea: number;
    officialArea: number;
  }>;
  classification: SectionView<{ landClassification: string }>;
  location: SectionView<CanonicalParcel["administrativeLocation"]>;
  ownership: SectionView<CanonicalParcel["ownershipRecords"]>;
  registration: SectionView<CanonicalParcel["registrationRecords"]>;
  tax: SectionView<CanonicalParcel["taxationRecords"]>;
  zoning: SectionView<CanonicalParcel["zoningInformation"]>;
  buildingPermissions: SectionView<CanonicalParcel["buildingPermissions"]>;
  encumbrances: SectionView<CanonicalParcel["encumbrances"]>;
  restrictions: SectionView<CanonicalParcel["restrictions"]>;
  utilities: SectionView<CanonicalParcel["utilityConnections"]>;
  redactions: string[];
}

function view<T>(
  role: Role,
  section: ProfileSection,
  full: () => T,
  limited: () => T,
  redactions: string[],
): SectionView<T> {
  const v = sectionVisibility(role, section);
  if (v === "hidden") {
    redactions.push(`${section}: hidden for role ${role}`);
    return { visibility: v, data: null, note: `Not available to ${role}` };
  }
  if (v === "limited") {
    redactions.push(`${section}: limited fields for role ${role}`);
    return { visibility: v, data: limited(), note: "Some fields hidden by access policy" };
  }
  return { visibility: v, data: full() };
}

/** Apply role-based access control to an assembled canonical parcel. */
export function applyRbac(parcel: CanonicalParcel, role: Role): ParcelProfileView {
  const redactions: string[] = [];

  return {
    canonicalParcelId: parcel.canonicalParcelId,
    role,
    identity: view(
      role,
      "identity",
      () => ({ canonicalParcelId: parcel.canonicalParcelId, identifiers: parcel.identifiers }),
      () => ({ canonicalParcelId: parcel.canonicalParcelId, identifiers: parcel.identifiers }),
      redactions,
    ),
    geometry: view(
      role,
      "geometry",
      () => ({
        geometry: parcel.geometry,
        calculatedArea: parcel.calculatedArea,
        officialArea: parcel.officialArea,
      }),
      () => ({
        geometry: parcel.geometry,
        calculatedArea: parcel.calculatedArea,
        officialArea: parcel.officialArea,
      }),
      redactions,
    ),
    classification: view(
      role,
      "classification",
      () => ({ landClassification: parcel.landClassification }),
      () => ({ landClassification: parcel.landClassification }),
      redactions,
    ),
    location: view(
      role,
      "location",
      () => parcel.administrativeLocation,
      () => parcel.administrativeLocation,
      redactions,
    ),
    ownership: view(
      role,
      "ownership",
      () => parcel.ownershipRecords,
      () =>
        parcel.ownershipRecords.map((r) => ({
          ...r,
          personReference: REDACTED,
        })),
      redactions,
    ),
    registration: view(
      role,
      "registration",
      () => parcel.registrationRecords,
      () =>
        parcel.registrationRecords.map((r) => ({
          ...r,
          seller: REDACTED,
          buyer: REDACTED,
          documentNumber: REDACTED,
        })),
      redactions,
    ),
    tax: view(
      role,
      "tax",
      () => parcel.taxationRecords,
      () =>
        parcel.taxationRecords.map((r) => ({
          ...r,
          amount: -1,
          taxpayer: REDACTED,
        })),
      redactions,
    ),
    zoning: view(
      role,
      "zoning",
      () => parcel.zoningInformation,
      () => parcel.zoningInformation,
      redactions,
    ),
    buildingPermissions: view(
      role,
      "buildingPermissions",
      () => parcel.buildingPermissions,
      () =>
        parcel.buildingPermissions.map((r) => ({
          ...r,
          permitNumber: r.permitNumber ? REDACTED : null,
        })),
      redactions,
    ),
    encumbrances: view(
      role,
      "encumbrances",
      () => parcel.encumbrances,
      () =>
        parcel.encumbrances.map((r) => ({
          ...r,
          sourceReference: REDACTED,
        })),
      redactions,
    ),
    restrictions: view(
      role,
      "restrictions",
      () => parcel.restrictions,
      () => parcel.restrictions,
      redactions,
    ),
    utilities: view(
      role,
      "utilities",
      () => parcel.utilityConnections,
      () => parcel.utilityConnections,
      redactions,
    ),
    redactions,
  };
}
