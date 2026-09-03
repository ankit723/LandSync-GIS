import { revenueAdapter } from "@/lib/adapters/revenue";
import { registrationAdapter } from "@/lib/adapters/registration";
import { municipalAdapter } from "@/lib/adapters/municipal";
import { planningAdapter } from "@/lib/adapters/planning";
import type { DepartmentAdapter } from "@/lib/adapters/types";

/**
 * Adapter registry. Onboarding a new department or state = register another
 * adapter here. The canonical model and every downstream feature stay
 * untouched. (PRD §7E, NFR-02)
 */
export const adapters = {
  REVENUE: revenueAdapter,
  REGISTRATION: registrationAdapter,
  MUNICIPAL: municipalAdapter,
  PLANNING: planningAdapter,
} satisfies Record<string, DepartmentAdapter<never>>;

export type AdapterKey = keyof typeof adapters;

export const adapterList = Object.values(adapters);
