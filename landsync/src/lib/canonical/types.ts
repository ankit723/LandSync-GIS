/**
 * Land Stack Canonical Land Data Model.
 *
 * This is the "common language" every departmental adapter must produce.
 * Adding a new state / department = writing a new adapter that emits these
 * shapes. The core platform never changes.  (PRD §7C, §12)
 */

export type LandClassification =
  | "RESIDENTIAL"
  | "COMMERCIAL"
  | "AGRICULTURAL"
  | "INDUSTRIAL"
  | "GOVERNMENT"
  | "VACANT";

export type SourceSystem =
  | "REVENUE"
  | "REGISTRATION"
  | "MUNICIPAL"
  | "PLANNING"
  | "LANDSTACK";

export interface AdministrativeLocation {
  state: string;
  district: string;
  ulbOrBlock: string;
  village: string;
  ward?: string;
}

/** GeoJSON Polygon geometry (WGS84). */
export interface PolygonGeometry {
  type: "Polygon";
  coordinates: number[][][];
}

export interface ParcelIdentifier {
  sourceSystem: SourceSystem;
  identifierType:
    | "PLOT_NUMBER"
    | "SURVEY_NUMBER"
    | "KHATA_NUMBER"
    | "MUNICIPAL_HOLDING_NUMBER"
    | "REGISTRATION_PROPERTY_ID";
  identifierValue: string;
}

export interface RightsRecord {
  parcelId: string;
  personReference: string;
  rightsType: "OWNER" | "CO_OWNER" | "TENANT" | "MORTGAGEE" | "GOVERNMENT";
  ownershipShare: string; // e.g. "1/1", "1/2"
  sourceSystem: SourceSystem;
  validFrom: string;
  validTo: string | null;
}

export interface RegistrationRecord {
  parcelId: string;
  documentNumber: string;
  transactionType: "SALE_DEED" | "GIFT_DEED" | "PARTITION" | "MORTGAGE" | "LEASE";
  transactionDate: string;
  seller: string;
  buyer: string;
  registrationStatus: "REGISTERED" | "PENDING" | "DISPUTED";
}

export interface TaxRecord {
  parcelId: string;
  assessmentYear: number;
  amount: number;
  paymentStatus: "PAID" | "DUE" | "PARTIALLY_PAID" | "EXEMPT";
  taxpayer: string;
  sourceSystem: SourceSystem;
}

export interface ZoningInformation {
  zoneName: string;
  zoneCode: string;
  permittedLandUse: LandClassification[];
  masterPlanReference: string;
}

export interface BuildingPermission {
  parcelId: string;
  permitNumber: string | null;
  status: "APPROVED" | "PENDING" | "REJECTED" | "NOT_FOUND";
  sanctionedUse: string;
  sanctionedFloors: number | null;
  issuedOn: string | null;
}

export interface Encumbrance {
  parcelId: string;
  type: "MORTGAGE" | "LIEN" | "COURT_ATTACHMENT" | "LEASE" | "NONE";
  status: "ACTIVE" | "CLEARED";
  sourceReference: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface Restriction {
  type:
    | "FLOOD_RISK_ZONE"
    | "NO_CONSTRUCTION_ZONE"
    | "HERITAGE_BUFFER"
    | "ROAD_WIDENING"
    | "COASTAL_REGULATION";
  description: string;
  authority: string;
}

export interface UtilityConnection {
  utilityType: "WATER" | "POWER" | "SEWER" | "TELECOM" | "GAS";
  operator: string | null;
  status: string;
  distanceM: number; // nearest distance from the parcel edge to the line
}

/** The unified parcel profile assembled by the integration layer. */
export interface CanonicalParcel {
  canonicalParcelId: string;
  geometry: PolygonGeometry;
  calculatedArea: number; // m², derived from geometry
  officialArea: number; // m², as recorded by revenue dept
  landClassification: LandClassification;
  administrativeLocation: AdministrativeLocation;
  identifiers: ParcelIdentifier[];
  ownershipRecords: RightsRecord[];
  registrationRecords: RegistrationRecord[];
  taxationRecords: TaxRecord[];
  zoningInformation: ZoningInformation | null;
  buildingPermissions: BuildingPermission[];
  encumbrances: Encumbrance[];
  restrictions: Restriction[];
  utilityConnections: UtilityConnection[];
  metadata: {
    integratedSources: SourceSystem[];
    lastIntegratedAt: string;
  };
}

export interface RiskReason {
  code: string;
  detail: string;
  sourceRecords: string[];
}

export interface RiskAssessment {
  parcelId: string;
  riskLevel: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: number; // 0..1
  reasons: RiskReason[];
  recommendedAction: string;
  requiresHumanVerification: boolean;
  generatedAt: string;
}
