import { withCache } from "@/lib/db/cache";
import { buildAllCanonicalParcels } from "@/lib/integration/pipeline";
import { adapterList } from "@/lib/adapters/registry";
import type { SourceSystem } from "@/lib/canonical/types";

export interface AdapterHealth {
  adapterId: string;
  sourceSystem: SourceSystem;
  displayName: string;
  owner: string;
  version: string;
  parcelsProcessed: number;
  ok: number;
  errors: number;
  lastRunAt: string;
  status: "HEALTHY" | "DEGRADED" | "DOWN";
}

async function compute(): Promise<AdapterHealth[]> {
  const assemblies = await buildAllCanonicalParcels();
  const tally = new Map<string, { ok: number; err: number; total: number }>();
  for (const a of adapterList) tally.set(a.meta.sourceSystem, { ok: 0, err: 0, total: 0 });

  for (const asm of assemblies) {
    for (const step of asm.trace) {
      const t = tally.get(step.sourceSystem);
      if (!t) continue;
      t.total += 1;
      if (step.status === "OK") t.ok += 1;
      else t.err += 1;
    }
  }

  return adapterList.map((a) => {
    const t = tally.get(a.meta.sourceSystem) ?? { ok: 0, err: 0, total: 0 };
    const status: AdapterHealth["status"] =
      t.err === 0 ? "HEALTHY" : t.err < t.total * 0.1 ? "DEGRADED" : "DOWN";
    return {
      adapterId: a.meta.id,
      sourceSystem: a.meta.sourceSystem,
      displayName: a.meta.displayName,
      owner: a.meta.owner,
      version: a.meta.version,
      parcelsProcessed: t.total,
      ok: t.ok,
      errors: t.err,
      lastRunAt: new Date().toISOString(),
      status,
    };
  });
}

export function integrationHealth(): Promise<AdapterHealth[]> {
  return withCache("intel:health:v1", 30, compute);
}
