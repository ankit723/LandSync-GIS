import clsx from "clsx";
import type { ReactNode } from "react";
import { RISK_TONE } from "@/lib/format";

export function Card({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return <As className={clsx("card p-4", className)}>{children}</As>;
}

export function SectionTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {children}
      </h3>
      {right}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "danger" | "warn" | "ok";
}) {
  return (
    <div className="card p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
        {label}
      </div>
      <div
        className={clsx(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "danger" && "text-red-600",
          tone === "warn" && "text-amber-600",
          tone === "ok" && "text-emerald-600",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-text-muted">{hint}</div>}
    </div>
  );
}

export function RiskChip({ level }: { level: string }) {
  return (
    <span
      className={clsx(
        "chip border",
        RISK_TONE[level] ?? "bg-slate-50 text-slate-600 border-slate-200",
      )}
    >
      {level}
    </span>
  );
}

export function Chip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={clsx("chip", className)}>{children}</span>;
}

export function Lock({ note }: { note?: string }) {
  return (
    <span
      title={note ?? "Hidden by access policy"}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-500"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M6 10V8a6 6 0 1 1 12 0v2M5 10h14v10H5z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      RBAC restricted
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-text-muted">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
      {label ?? "Loading…"}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-surface-2 p-6 text-center text-sm text-text-muted">
      {children}
    </div>
  );
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-text-muted">{k}</span>
      <span className="text-right font-medium text-text">{v}</span>
    </div>
  );
}
