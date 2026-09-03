import { ingestEnvelopeSchema, type IngestEnvelope } from "@/lib/data/source-zod";

export type SyncSource = "REVENUE" | "REGISTRATION" | "MUNICIPAL" | "PLANNING";

const BASE = process.env.DEPT_API_BASE ?? "http://localhost:4000";

function apiKey(source: SyncSource): string {
  return (
    process.env[`DEPT_${source}_KEY`] ??
    process.env.DEPT_API_KEY ??
    "dept-dev-key"
  );
}

const PATHS: Record<SyncSource, string> = {
  REVENUE: "revenue",
  REGISTRATION: "registration",
  MUNICIPAL: "municipal",
  PLANNING: "planning",
};

const RETRY_DELAYS = [200, 600, 1500];

async function fetchWithRetry(url: string, headers: Record<string, string>): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal });
      clearTimeout(timer);
      if (res.status >= 500) throw new Error(`upstream ${res.status}`);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < RETRY_DELAYS.length) {
        await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt] + Math.random() * 150));
      }
    }
  }
  throw new Error(
    `department API ${url} failed after ${RETRY_DELAYS.length + 1} attempts: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`,
  );
}

export interface DeptPage {
  items: IngestEnvelope["items"];
  nextSince: string | null;
  count: number;
}

/** Pull one page of records from a departmental API. */
export async function deptFetch(
  source: SyncSource,
  opts: { since?: string | null; limit?: number } = {},
): Promise<DeptPage> {
  const url = new URL(`${BASE}/${PATHS[source]}/records`);
  if (opts.since) url.searchParams.set("since", opts.since);
  url.searchParams.set("limit", String(opts.limit ?? 500));

  const res = await fetchWithRetry(url.toString(), { "x-api-key": apiKey(source) });
  if (!res.ok) throw new Error(`department API ${url} → ${res.status}`);

  const json = await res.json();
  const parsed = ingestEnvelopeSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`department API ${source} returned an unrecognised envelope`);
  }
  return {
    items: parsed.data.items,
    nextSince: parsed.data.next_since,
    count: parsed.data.count,
  };
}

export async function deptApiReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

export function deptApiBase(): string {
  return BASE;
}
