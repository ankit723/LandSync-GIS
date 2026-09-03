"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiGet, apiPost, ApiError } from "@/lib/api/client";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/rbac/matrix";

const BLURB: Record<Role, string> = {
  CITIZEN: "Search parcels and view authorised public information only.",
  REVENUE: "Full Record-of-Rights access, mutation review, anomaly investigation.",
  REGISTRATION: "Transaction history, deed registration, sync triggers.",
  MUNICIPAL: "Holding tax, building permissions, tax inconsistencies.",
  PLANNING: "Zoning, master-plan overlays, spatial & natural-language queries.",
  ADMIN: "Users, adapter registry, integration health, full audit trail.",
};

export default function LoginPage() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [roleLoginAllowed, setRoleLoginAllowed] = useState(true);
  const [identifier, setIdentifier] = useState("USR-REV-2931");
  const [password, setPassword] = useState("");

  useEffect(() => {
    apiGet<{ roleLoginAllowed: boolean }>("/api/auth/login")
      .then((d) => setRoleLoginAllowed(d.roleLoginAllowed))
      .catch(() => {});
  }, []);

  async function submit(payload: Record<string, string>, key: string) {
    setBusy(key);
    setErr(null);
    try {
      await apiPost("/api/auth/login", payload);
      router.push("/map");
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Sign-in failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center px-4 py-12">
      <div className="mb-8">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-sm font-bold text-white">
            LS
          </span>
          <h1 className="text-xl font-semibold tracking-tight">Land Stack</h1>
        </div>
        <p className="mt-3 max-w-2xl text-sm text-text-muted">
          Parcel-centric GIS Digital Public Infrastructure that unifies fragmented
          departmental land records through adapters, a canonical data model, spatial
          intelligence and role-based access control.
        </p>
      </div>

      {err && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            {roleLoginAllowed ? "Quick demo access (no password)" : "Officer roles"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {ROLES.map((role) => (
              <button
                key={role}
                onClick={() => submit({ role }, role)}
                disabled={busy !== null || !roleLoginAllowed}
                className="card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5 disabled:opacity-50"
              >
                <div className="text-sm font-semibold">{ROLE_LABEL[role]}</div>
                <div className="mt-1 text-xs text-text-muted">{BLURB[role]}</div>
                <div className="mt-3 text-xs font-medium text-primary">
                  {busy === role ? "Signing in…" : "Enter as this role →"}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card h-fit p-4">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Sign in with credentials
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit({ identifier, password }, "password");
            }}
            className="space-y-2"
          >
            <label className="block">
              <span className="text-[11px] font-medium uppercase text-text-muted">
                User ID or name
              </span>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-medium uppercase text-text-muted">Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-0.5 w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm"
              />
            </label>
            <button
              disabled={busy !== null || !identifier || !password}
              className="w-full rounded-md bg-primary py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy === "password" ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-2 text-[11px] text-text-muted">
            Seeded dev password for every user: <code className="rounded bg-slate-100 px-1">landsync</code>.
            IDs: <code>USR-REV-2931</code>, <code>USR-ADM-0001</code>, …
          </p>
        </div>
      </div>

      <p className="mt-8 max-w-2xl text-xs text-text-muted">
        Sample data: ~200 synthetic parcels around Bhubaneswar, Odisha, in PostGIS. Parcel{" "}
        <code className="rounded bg-slate-100 px-1">LS-OD-BBSR-000123</code> / Plot{" "}
        <code className="rounded bg-slate-100 px-1">142</code> is clean. Seeded inconsistencies:
        Plot <code className="rounded bg-slate-100 px-1">88</code> (ownership mismatch),{" "}
        <code className="rounded bg-slate-100 px-1">210</code> (area discrepancy),{" "}
        <code className="rounded bg-slate-100 px-1">305</code> (fuzzy name match),{" "}
        <code className="rounded bg-slate-100 px-1">417</code> (RoR not synced),{" "}
        <code className="rounded bg-slate-100 px-1">520</code> (unauthorised construction).
      </p>
    </div>
  );
}
