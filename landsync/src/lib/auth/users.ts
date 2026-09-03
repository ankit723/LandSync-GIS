import type { Role } from "@/lib/rbac/matrix";

export interface DemoUser {
  id: string;
  name: string;
  role: Role;
  department: string;
  designation: string;
}

/**
 * Prototype user directory. Authentication is a role selection — no passwords.
 * Swap `verifyCredentials` for a real IdP / OAuth later; the rest of the app
 * only depends on the resolved `{ id, name, role }`.
 */
export const DEMO_USERS: DemoUser[] = [
  {
    id: "USR-CITIZEN-01",
    name: "Ankit Kumar",
    role: "CITIZEN",
    department: "Public",
    designation: "Citizen / Landholder",
  },
  {
    id: "USR-REV-2931",
    name: "S. Mohanty",
    role: "REVENUE",
    department: "Revenue & Disaster Management",
    designation: "Tahasildar, Bhubaneswar",
  },
  {
    id: "USR-REG-1187",
    name: "P. Nayak",
    role: "REGISTRATION",
    department: "Inspector General of Registration",
    designation: "Sub-Registrar, Bhubaneswar",
  },
  {
    id: "USR-MUN-5502",
    name: "R. Sahoo",
    role: "MUNICIPAL",
    department: "Bhubaneswar Municipal Corporation",
    designation: "Revenue Officer (Holding Tax)",
  },
  {
    id: "USR-PLN-3344",
    name: "D. Pattnaik",
    role: "PLANNING",
    department: "Bhubaneswar Development Authority",
    designation: "Assistant Town Planner",
  },
  {
    id: "USR-ADM-0001",
    name: "System Administrator",
    role: "ADMIN",
    department: "Land Stack Platform",
    designation: "Platform Administrator",
  },
];

export function findUser(id: string): DemoUser | undefined {
  return DEMO_USERS.find((u) => u.id === id);
}

export function findUserByRole(role: Role): DemoUser | undefined {
  return DEMO_USERS.find((u) => u.role === role);
}
