"use client";

import { useState } from "react";
import {
  useAdapters,
  useAdminUsers,
  useAudit,
  useRunSync,
  useSession,
  useSyncStatus,
} from "@/lib/api/hooks";
import { Card, Spinner } from "@/components/ui";
import { datetime, titleCase } from "@/lib/format";
import { ROLES } from "@/lib/rbac/matrix";

type Tab = "users" | "adapters" | "sync" | "audit";

export default function AdminPage() {
  const { data: session } = useSession();
  const [tab, setTab] = useState<Tab>("users");
  const users = useAdminUsers();
  const audit = useAudit();
  const adapters = useAdapters();
  const sync = useSyncStatus();
  const runSync = useRunSync();

  if (session && session.user && session.user.role !== "ADMIN") {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Card>
          <h1 className="text-sm font-semibold">Administrator role required</h1>
          <p className="mt-1 text-sm text-text-muted">
            Your role ({session.user.role}) cannot access user management, the adapter
            registry or the audit trail. Switch to the System Administrator role using the
            selector in the header.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <h1 className="text-lg font-semibold">Administration</h1>
      <div className="mt-3 flex gap-1">
        {(["users", "adapters", "sync", "audit"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              tab === t ? "bg-primary/10 text-primary" : "text-text-muted"
            }`}
          >
            {t === "users"
              ? "Users & RBAC"
              : t === "adapters"
                ? "Adapter registry"
                : t === "sync"
                  ? "Ingestion & sync"
                  : "Audit trail"}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <div className="mt-3 space-y-4">
          {users.isLoading && <Spinner />}
          {users.data && (
            <>
              <Card className="overflow-x-auto">
                <h2 className="mb-2 text-sm font-semibold">Users</h2>
                <table className="w-full text-xs">
                  <thead className="text-text-muted">
                    <tr className="text-left">
                      <th className="py-1 pr-3 font-medium">ID</th>
                      <th className="py-1 pr-3 font-medium">Name</th>
                      <th className="py-1 pr-3 font-medium">Role</th>
                      <th className="py-1 pr-3 font-medium">Department</th>
                      <th className="py-1 font-medium">Designation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.data.users.map((u) => (
                      <tr key={u.id} className="border-t border-border">
                        <td className="py-1.5 pr-3 font-mono">{u.id}</td>
                        <td className="py-1.5 pr-3">{u.name}</td>
                        <td className="py-1.5 pr-3">
                          <span className="chip">{u.role}</span>
                        </td>
                        <td className="py-1.5 pr-3">{u.department}</td>
                        <td className="py-1.5">{u.designation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>

              <Card className="overflow-x-auto">
                <h2 className="mb-2 text-sm font-semibold">Permission matrix</h2>
                <table className="w-full text-xs">
                  <thead className="text-text-muted">
                    <tr className="text-left">
                      <th className="py-1 pr-3 font-medium">Action</th>
                      {ROLES.map((r) => (
                        <th key={r} className="py-1 pr-3 font-medium">
                          {r}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(users.data.permissionMatrix).map(([action, grants]) => (
                      <tr key={action} className="border-t border-border">
                        <td className="py-1.5 pr-3 font-mono">{action}</td>
                        {ROLES.map((r) => (
                          <td key={r} className="py-1.5 pr-3">
                            {grants[r] ? (
                              <span className="text-emerald-600">✓</span>
                            ) : (
                              <span className="text-slate-300">·</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === "adapters" && (
        <Card className="mt-3 overflow-x-auto">
          {adapters.isLoading && <Spinner />}
          <table className="w-full text-xs">
            <thead className="text-text-muted">
              <tr className="text-left">
                <th className="py-1 pr-3 font-medium">Adapter</th>
                <th className="py-1 pr-3 font-medium">Source</th>
                <th className="py-1 pr-3 font-medium">Owner</th>
                <th className="py-1 pr-3 font-medium">Version</th>
                <th className="py-1 pr-3 font-medium">Processed</th>
                <th className="py-1 pr-3 font-medium">OK / Err</th>
                <th className="py-1 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {adapters.data?.adapters.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="py-1.5 pr-3 font-mono">{a.id}</td>
                  <td className="py-1.5 pr-3">{titleCase(a.sourceSystem)}</td>
                  <td className="py-1.5 pr-3">{a.owner}</td>
                  <td className="py-1.5 pr-3">v{a.version}</td>
                  <td className="py-1.5 pr-3">{a.health?.parcelsProcessed ?? "—"}</td>
                  <td className="py-1.5 pr-3">
                    {a.health ? `${a.health.ok} / ${a.health.errors}` : "—"}
                  </td>
                  <td className="py-1.5">
                    <span
                      className={`chip ${
                        a.health?.status === "HEALTHY"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                    >
                      {a.health?.status ?? "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "sync" && (
        <div className="mt-3 space-y-4">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Departmental ingestion</h2>
                <p className="text-xs text-text-muted">
                  Adapters pull from the department APIs at{" "}
                  <span className="font-mono">{sync.data?.departmentApi.base ?? "—"}</span> and
                  ingest into the canonical store.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`chip ${
                    sync.data?.departmentApi.reachable
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {sync.data?.departmentApi.reachable ? "API reachable" : "API unreachable"}
                </span>
                <button
                  disabled={runSync.isPending || !sync.data?.departmentApi.reachable}
                  onClick={() => runSync.mutate({})}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                >
                  {runSync.isPending ? "Syncing…" : "Run incremental sync"}
                </button>
                <button
                  disabled={runSync.isPending || !sync.data?.departmentApi.reachable}
                  onClick={() => runSync.mutate({ full: true })}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium disabled:opacity-40"
                >
                  Full re-sync
                </button>
              </div>
            </div>
            {!sync.data?.departmentApi.reachable && (
              <p className="mt-2 text-xs text-amber-600">
                Start the mock department APIs with <code>npm run dept:serve</code>.
              </p>
            )}
            {sync.data && sync.data.deadLetters > 0 && (
              <p className="mt-2 text-xs text-red-600">
                {sync.data.deadLetters} record(s) in the dead-letter queue (failed validation).
              </p>
            )}
          </Card>

          <Card className="overflow-x-auto">
            <h2 className="mb-2 text-sm font-semibold">Sync run history</h2>
            {sync.isLoading && <Spinner />}
            <table className="w-full text-xs">
              <thead className="text-text-muted">
                <tr className="text-left">
                  <th className="py-1 pr-3 font-medium">#</th>
                  <th className="py-1 pr-3 font-medium">Source</th>
                  <th className="py-1 pr-3 font-medium">Started</th>
                  <th className="py-1 pr-3 font-medium">In / OK / Failed</th>
                  <th className="py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {sync.data?.runs.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-1.5 pr-3">{r.id}</td>
                    <td className="py-1.5 pr-3">{titleCase(r.sourceSystem)}</td>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{datetime(r.startedAt)}</td>
                    <td className="py-1.5 pr-3 tabular-nums">
                      {r.recordsIn} / {r.recordsOk} / {r.recordsFailed}
                    </td>
                    <td className="py-1.5">
                      <span
                        className={`chip ${
                          r.status === "SUCCESS"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : r.status === "PARTIAL"
                              ? "border-amber-200 bg-amber-50 text-amber-700"
                              : r.status === "RUNNING"
                                ? "border-sky-200 bg-sky-50 text-sky-700"
                                : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === "audit" && (
        <Card className="mt-3 overflow-x-auto">
          <h2 className="mb-2 text-sm font-semibold">Append-only audit trail</h2>
          {audit.isLoading && <Spinner />}
          <table className="w-full text-xs">
            <thead className="text-text-muted">
              <tr className="text-left">
                <th className="py-1 pr-3 font-medium">Time</th>
                <th className="py-1 pr-3 font-medium">Actor</th>
                <th className="py-1 pr-3 font-medium">Action</th>
                <th className="py-1 pr-3 font-medium">Resource</th>
                <th className="py-1 pr-3 font-medium">Reason</th>
                <th className="py-1 font-medium">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {audit.data?.events.map((e) => (
                <tr key={e.id} className="border-t border-border align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{datetime(e.timestamp)}</td>
                  <td className="py-1.5 pr-3">
                    {e.actorId}
                    <div className="text-text-muted">{e.actorRole}</div>
                  </td>
                  <td className="py-1.5 pr-3 font-mono">{e.action}</td>
                  <td className="py-1.5 pr-3">
                    {e.resourceType}
                    <div className="font-mono text-text-muted">{e.resourceId}</div>
                  </td>
                  <td className="py-1.5 pr-3 text-text-muted">{e.reason ?? "—"}</td>
                  <td className="py-1.5">
                    <span
                      className={`chip ${
                        e.outcome === "SUCCESS"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-red-200 bg-red-50 text-red-700"
                      }`}
                    >
                      {e.outcome}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
