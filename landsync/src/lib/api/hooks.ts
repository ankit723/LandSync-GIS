"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/client";
import type { ParcelProfileView } from "@/lib/rbac/filter";
import type { Action, Role } from "@/lib/rbac/matrix";
import type { CanonicalParcel } from "@/lib/canonical/types";
import type { ParcelSummary } from "@/lib/integration/summary";
import type { IntegrationStepTrace } from "@/lib/integration/pipeline";
import type { DetectionResult } from "@/lib/intelligence/inconsistency";
import type { SpatialResult } from "@/lib/repo/spatial";
import type { ParsedQuery } from "@/lib/intelligence/nl-query";
import type { AnomalyRow } from "@/lib/intelligence/registry";
import type { AdapterHealth } from "@/lib/integration/health";
import type { AuditEvent } from "@/lib/audit/log";
import type { DemoUser } from "@/lib/auth/users";
import type { DetectedChange } from "@/lib/intelligence/change-detection";

export interface SessionInfo {
  user: {
    id: string;
    name: string;
    role: Role;
    department: string;
    designation: string;
  } | null;
  permissions?: Record<Action, boolean>;
}

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => apiGet<SessionInfo>("/api/auth/me"),
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: Role) => apiPost("/api/auth/login", { role }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost("/api/auth/logout"),
    onSuccess: () => qc.clear(),
  });
}

export interface SearchResponse {
  query: string;
  count: number;
  resolvedVia?: { id: string; matchedOn: string }[];
  results: ParcelSummary[];
}
export function useParcelSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: ["parcels", "search", q],
    queryFn: () => apiGet<SearchResponse>(`/api/parcels?q=${encodeURIComponent(q)}`),
    enabled: enabled && q.trim().length > 0,
  });
}

export interface ParcelResponse {
  summary: ParcelSummary;
  profile: ParcelProfileView;
  trace: IntegrationStepTrace[];
  canonical?: CanonicalParcel;
  riskBadge: { riskLevel: string; requiresHumanVerification: boolean } | null;
}
export function useParcel(id: string | null) {
  return useQuery({
    queryKey: ["parcel", id],
    queryFn: () => apiGet<ParcelResponse>(`/api/parcels/${id}`),
    enabled: !!id,
  });
}

export function useParcelRisk(id: string | null, enabled = true) {
  return useQuery({
    queryKey: ["parcel", id, "risk"],
    queryFn: () => apiGet<DetectionResult>(`/api/parcels/${id}/risk`),
    enabled: !!id && enabled,
  });
}

export function useLayerList() {
  return useQuery({
    queryKey: ["layers"],
    queryFn: () => apiGet<{ layers: { name: string; features: number }[] }>("/api/layers"),
  });
}

export function useSpatialQuery() {
  return useMutation({
    mutationFn: (filters: Record<string, unknown>) =>
      apiPost<SpatialResult>("/api/spatial/query", filters),
  });
}

export interface NlQueryResponse {
  input: string;
  parsed: ParsedQuery;
  result: SpatialResult | null;
  engine: { configured: boolean; provider: string | null; model: string | null };
}
export function useNlQuery() {
  return useMutation({
    mutationFn: (query: string) => apiPost<NlQueryResponse>("/api/spatial/nl-query", { query }),
  });
}

export function useAnomalies(level?: string) {
  return useQuery({
    queryKey: ["anomalies", level ?? "all"],
    queryFn: () =>
      apiGet<{ count: number; rows: AnomalyRow[] }>(
        `/api/anomalies${level ? `?level=${level}` : ""}`,
      ),
  });
}

export interface StatsResponse {
  parcelsTotal: number;
  byClassification: Record<string, number>;
  identifiersMapped: number;
  adapters: { source: string; status: string; ok: number; errors: number }[];
  layers: Record<string, number>;
  risk: {
    flaggedTotal: number;
    byLevel: Record<string, number>;
    requiresVerification: number;
    top: AnomalyRow[];
  } | null;
}
export function useStats() {
  return useQuery({ queryKey: ["stats"], queryFn: () => apiGet<StatsResponse>("/api/stats") });
}

export interface AdapterInfo {
  id: string;
  sourceSystem: string;
  displayName: string;
  owner: string;
  version: string;
  identifierType: string;
  sampleSourceSchema: string[];
  fieldMappings: { sourceField: string; canonicalPath: string; transform: string }[];
  health: AdapterHealth | null;
}
export function useAdapters() {
  return useQuery({
    queryKey: ["adapters"],
    queryFn: () => apiGet<{ adapters: AdapterInfo[] }>("/api/admin/adapters"),
  });
}

export function useAudit() {
  return useQuery({
    queryKey: ["audit"],
    queryFn: () => apiGet<{ events: AuditEvent[] }>("/api/admin/audit"),
  });
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ["admin", "users"],
    queryFn: () =>
      apiGet<{ users: DemoUser[]; permissionMatrix: Record<string, Record<string, boolean>> }>(
        "/api/admin/users",
      ),
  });
}

export function useChangeDetection() {
  return useQuery({
    queryKey: ["change-detection"],
    queryFn: () =>
      apiGet<{
        epochs: { before: number; after: number };
        count: number;
        unauthorisedCount: number;
        changes: DetectedChange[];
      }>("/api/change-detection"),
  });
}

export interface SyncRunRow {
  id: number;
  adapterId: string;
  sourceSystem: string;
  startedAt: string;
  finishedAt: string | null;
  recordsIn: number;
  recordsOk: number;
  recordsFailed: number;
  status: string;
  error: string | null;
}
export interface SyncStatus {
  departmentApi: { base: string; reachable: boolean };
  deadLetters: number;
  runs: SyncRunRow[];
}
export function useSyncStatus() {
  return useQuery({
    queryKey: ["sync", "status"],
    queryFn: () => apiGet<SyncStatus>("/api/admin/sync"),
    refetchInterval: 5000,
  });
}
export function useRunSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { source?: string; full?: boolean }) =>
      apiPost<{ results: unknown[] }>("/api/admin/sync", payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sync"] });
      qc.invalidateQueries({ queryKey: ["adapters"] });
      qc.invalidateQueries({ queryKey: ["anomalies"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useParcelAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { action: string; reason: string; changes?: Record<string, unknown> }) =>
      apiPost(`/api/parcels/${id}/actions`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["audit"] });
      qc.invalidateQueries({ queryKey: ["parcel", id] });
    },
  });
}
