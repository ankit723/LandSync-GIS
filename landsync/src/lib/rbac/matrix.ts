export const ROLES = [
  "CITIZEN",
  "REVENUE",
  "REGISTRATION",
  "MUNICIPAL",
  "PLANNING",
  "ADMIN",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  CITIZEN: "Citizen",
  REVENUE: "Revenue / Land Records Officer",
  REGISTRATION: "Registration Officer",
  MUNICIPAL: "Municipal Officer",
  PLANNING: "Planning Officer",
  ADMIN: "System Administrator",
};

export type Action =
  | "search_parcel"
  | "view_public_data"
  | "view_ror"
  | "modify_land_record"
  | "register_transaction"
  | "view_tax_details"
  | "run_spatial_query"
  | "run_nl_query"
  | "view_risk"
  | "view_change_detection"
  | "trigger_sync"
  | "manage_users"
  | "register_adapter"
  | "view_audit";

type Grant = true | false;

/** PRD §8 FR-02 permission matrix, extended for prototype features. */
export const PERMISSIONS: Record<Action, Record<Role, Grant>> = {
  search_parcel:        { CITIZEN: true,  REVENUE: true,  REGISTRATION: true,  MUNICIPAL: true,  PLANNING: true,  ADMIN: true },
  view_public_data:     { CITIZEN: true,  REVENUE: true,  REGISTRATION: true,  MUNICIPAL: true,  PLANNING: true,  ADMIN: true },
  view_ror:             { CITIZEN: false, REVENUE: true,  REGISTRATION: true,  MUNICIPAL: false, PLANNING: false, ADMIN: true },
  modify_land_record:   { CITIZEN: false, REVENUE: true,  REGISTRATION: false, MUNICIPAL: false, PLANNING: false, ADMIN: true },
  register_transaction: { CITIZEN: false, REVENUE: false, REGISTRATION: true,  MUNICIPAL: false, PLANNING: false, ADMIN: true },
  view_tax_details:     { CITIZEN: false, REVENUE: true,  REGISTRATION: true,  MUNICIPAL: true,  PLANNING: false, ADMIN: true },
  run_spatial_query:    { CITIZEN: true,  REVENUE: true,  REGISTRATION: true,  MUNICIPAL: true,  PLANNING: true,  ADMIN: true },
  run_nl_query:         { CITIZEN: false, REVENUE: true,  REGISTRATION: true,  MUNICIPAL: true,  PLANNING: true,  ADMIN: true },
  view_risk:            { CITIZEN: false, REVENUE: true,  REGISTRATION: true,  MUNICIPAL: true,  PLANNING: true,  ADMIN: true },
  view_change_detection:{ CITIZEN: false, REVENUE: true,  REGISTRATION: false, MUNICIPAL: true,  PLANNING: true,  ADMIN: true },
  trigger_sync:         { CITIZEN: false, REVENUE: true,  REGISTRATION: true,  MUNICIPAL: false, PLANNING: false, ADMIN: true },
  manage_users:         { CITIZEN: false, REVENUE: false, REGISTRATION: false, MUNICIPAL: false, PLANNING: false, ADMIN: true },
  register_adapter:     { CITIZEN: false, REVENUE: false, REGISTRATION: false, MUNICIPAL: false, PLANNING: false, ADMIN: true },
  view_audit:           { CITIZEN: false, REVENUE: false, REGISTRATION: false, MUNICIPAL: false, PLANNING: false, ADMIN: true },
};

export function can(role: Role, action: Action): boolean {
  return PERMISSIONS[action]?.[role] ?? false;
}

/* -------------------------------------------------------------------------- */
/* Field-level visibility for the unified parcel profile                       */
/* -------------------------------------------------------------------------- */

export type Visibility = "full" | "limited" | "hidden";

export type ProfileSection =
  | "identity"
  | "geometry"
  | "classification"
  | "location"
  | "ownership"
  | "registration"
  | "tax"
  | "zoning"
  | "buildingPermissions"
  | "encumbrances"
  | "restrictions"
  | "utilities"
  | "risk";

const F: Visibility = "full";
const L: Visibility = "limited";
const H: Visibility = "hidden";

export const SECTION_VISIBILITY: Record<ProfileSection, Record<Role, Visibility>> = {
  identity:            { CITIZEN: F, REVENUE: F, REGISTRATION: F, MUNICIPAL: F, PLANNING: F, ADMIN: F },
  geometry:            { CITIZEN: F, REVENUE: F, REGISTRATION: F, MUNICIPAL: F, PLANNING: F, ADMIN: F },
  classification:      { CITIZEN: F, REVENUE: F, REGISTRATION: F, MUNICIPAL: F, PLANNING: F, ADMIN: F },
  location:            { CITIZEN: F, REVENUE: F, REGISTRATION: F, MUNICIPAL: F, PLANNING: F, ADMIN: F },
  ownership:           { CITIZEN: L, REVENUE: F, REGISTRATION: F, MUNICIPAL: L, PLANNING: L, ADMIN: F },
  registration:        { CITIZEN: L, REVENUE: F, REGISTRATION: F, MUNICIPAL: L, PLANNING: H, ADMIN: F },
  tax:                 { CITIZEN: L, REVENUE: F, REGISTRATION: F, MUNICIPAL: F, PLANNING: H, ADMIN: F },
  zoning:              { CITIZEN: F, REVENUE: F, REGISTRATION: F, MUNICIPAL: F, PLANNING: F, ADMIN: F },
  buildingPermissions: { CITIZEN: L, REVENUE: F, REGISTRATION: L, MUNICIPAL: F, PLANNING: F, ADMIN: F },
  encumbrances:        { CITIZEN: L, REVENUE: F, REGISTRATION: F, MUNICIPAL: L, PLANNING: H, ADMIN: F },
  restrictions:        { CITIZEN: F, REVENUE: F, REGISTRATION: F, MUNICIPAL: F, PLANNING: F, ADMIN: F },
  utilities:           { CITIZEN: F, REVENUE: F, REGISTRATION: F, MUNICIPAL: F, PLANNING: F, ADMIN: F },
  risk:                { CITIZEN: H, REVENUE: F, REGISTRATION: F, MUNICIPAL: F, PLANNING: F, ADMIN: F },
};

export function sectionVisibility(role: Role, section: ProfileSection): Visibility {
  return SECTION_VISIBILITY[section][role];
}
