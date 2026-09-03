"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import type { ReactNode } from "react";
import { useLogin, useLogout, useSession } from "@/lib/api/hooks";
import { ROLES, ROLE_LABEL, type Action, type Role } from "@/lib/rbac/matrix";

const NAV: { href: string; label: string; need?: Action }[] = [
  { href: "/map", label: "Map Workspace" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/anomalies", label: "Anomaly Register", need: "view_risk" },
  { href: "/change-detection", label: "Change Detection", need: "view_change_detection" },
  { href: "/integrations", label: "Interoperability" },
  { href: "/admin", label: "Administration", need: "manage_users" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data } = useSession();
  const login = useLogin();
  const logout = useLogout();

  const role = data?.user?.role;
  const perms = data?.permissions;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/95 backdrop-blur">
        <div className="flex h-14 items-center gap-4 px-4">
          <Link href="/map" className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-[13px] font-bold text-white">
              LS
            </span>
            <span className="text-sm font-semibold tracking-tight">
              Land Stack
              <span className="ml-2 hidden text-xs font-normal text-text-muted sm:inline">
                GIS DPI for Land Governance
              </span>
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.filter((n) => !n.need || perms?.[n.need]).map((n) => {
              const active = pathname === n.href || pathname.startsWith(n.href + "/");
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={clsx(
                    "rounded-md px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-text-muted hover:bg-surface-2 hover:text-text",
                  )}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <label className="hidden items-center gap-1.5 text-xs text-text-muted sm:flex">
              <span className="hidden lg:inline">Demo role</span>
              <select
                value={role ?? "CITIZEN"}
                onChange={(e) => {
                  login.mutate(e.target.value as Role, {
                    onSuccess: () => router.refresh(),
                  });
                }}
                className="rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-text"
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>
            {data?.user && (
              <div className="hidden text-right text-xs leading-tight sm:block">
                <div className="font-semibold">{data.user.name}</div>
                <div className="text-text-muted">{data.user.designation}</div>
              </div>
            )}
            <button
              onClick={() => logout.mutate(undefined, { onSuccess: () => router.push("/login") })}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-2"
            >
              Sign out
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto border-t border-border px-3 py-1.5 md:hidden">
          {NAV.filter((n) => !n.need || perms?.[n.need]).map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={clsx(
                  "whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium",
                  active ? "bg-primary/10 text-primary" : "text-text-muted",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
