import { verify } from "@node-rs/argon2";
import { q1 } from "@/lib/db/pool";
import type { Role } from "@/lib/rbac/matrix";

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  department: string;
  designation: string;
}

interface UserRow extends AuthUser {
  password_hash: string | null;
}

async function loadUser(where: string, param: string): Promise<UserRow | null> {
  return q1<UserRow>(
    `SELECT id, name, role, department, designation, password_hash
     FROM users WHERE ${where} = $1`,
    [param],
  );
}

/** Password login. Returns the user on success, null on any failure. */
export async function verifyCredentials(
  identifier: string,
  password: string,
): Promise<AuthUser | null> {
  const row =
    (await loadUser("id", identifier)) ??
    (await loadUser("lower(name)", identifier.toLowerCase()));
  if (!row || !row.password_hash) return null;
  try {
    const ok = await verify(row.password_hash, password);
    if (!ok) return null;
  } catch {
    return null;
  }
  const { password_hash: _ignore, ...user } = row;
  void _ignore;
  return user;
}

/** Demo quick-switch: resolve a user by role with no password (dev only). */
export async function userByRole(role: Role): Promise<AuthUser | null> {
  return loadUser("role", role) as Promise<AuthUser | null>;
}

export function roleLoginAllowed(): boolean {
  return process.env.ALLOW_ROLE_LOGIN !== "false";
}
