import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { q1 } from "@/lib/db/pool";
import { cacheGet, cacheSet } from "@/lib/db/cache";
import type { Role } from "@/lib/rbac/matrix";

export const SESSION_COOKIE = "ls_session";
const TTL_SECONDS = 8 * 60 * 60;
const SECRET = new TextEncoder().encode(
  process.env.LANDSTACK_SESSION_SECRET ?? "dev-only-landsync-sih-secret",
);

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  department: string;
  designation: string;
  issuedAt: string;
  sid: string;
}

interface Claims {
  sub: string;
  role: Role;
  name: string;
  sid: string;
  iat: number;
}

/**
 * Real stateless auth: HS256 JWT in an httpOnly cookie, 8h expiry. Redis (or the
 * in-process fallback) holds a per-session revocation flag so logout / admin
 * revoke takes effect immediately; if the cache is unavailable the JWT still
 * verifies (standard fail-open for bearer tokens).
 */
export async function createSessionToken(user: {
  id: string;
  name: string;
  role: Role;
}): Promise<string> {
  const sid = randomUUID();
  return new SignJWT({ role: user.role, name: user.name, sid })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(SECRET);
}

export async function revokeSessionToken(token: string | undefined): Promise<void> {
  const c = await verifyToken(token);
  if (c?.sid) await cacheSet(`revoked:${c.sid}`, "1", TTL_SECONDS);
}

async function verifyToken(token: string | undefined): Promise<Claims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify<Claims>(token, SECRET);
    if (!payload.sub || !payload.sid) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const claims = await verifyToken(store.get(SESSION_COOKIE)?.value);
  if (!claims) return null;

  if ((await cacheGet(`revoked:${claims.sid}`)) === "1") return null;

  const row = await q1<{
    id: string;
    name: string;
    role: Role;
    department: string;
    designation: string;
  }>(`SELECT id, name, role, department, designation FROM users WHERE id = $1`, [claims.sub]);
  if (!row) return null;

  return {
    ...row,
    issuedAt: new Date((claims.iat ?? 0) * 1000).toISOString(),
    sid: claims.sid,
  };
}

export { SECRET as SESSION_SECRET_KEY };
