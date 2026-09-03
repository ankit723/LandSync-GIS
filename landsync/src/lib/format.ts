export function m2(v: number | null | undefined): string {
  if (v == null || v < 0) return "—";
  return `${v.toLocaleString("en-IN")} m²`;
}

export function acres(v: number): string {
  return `${(v / 4046.86).toFixed(3)} ac`;
}

export function inr(v: number | null | undefined): string {
  if (v == null || v < 0) return "—";
  return `₹${v.toLocaleString("en-IN")}`;
}

export function date(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
}

export function datetime(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleString("en-IN", {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const RISK_TONE: Record<string, string> = {
  NONE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  LOW: "bg-sky-50 text-sky-700 border-sky-200",
  MEDIUM: "bg-amber-50 text-amber-700 border-amber-200",
  HIGH: "bg-orange-50 text-orange-700 border-orange-200",
  CRITICAL: "bg-red-50 text-red-700 border-red-200",
};

export const CLASS_COLOR: Record<string, string> = {
  RESIDENTIAL: "#6366f1",
  COMMERCIAL: "#0ea5e9",
  AGRICULTURAL: "#65a30d",
  INDUSTRIAL: "#a16207",
  GOVERNMENT: "#db2777",
  VACANT: "#94a3b8",
};
