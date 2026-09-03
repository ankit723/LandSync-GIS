import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { integrationHealth } from "@/lib/integration/health";
import { tableCounts } from "@/lib/repo/parcels";
import { cacheBackend } from "@/lib/db/cache";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const [health, counts] = await Promise.all([integrationHealth(), tableCounts()]);
  return NextResponse.json({
    parcelsTotal: counts.parcels ?? 0,
    adapters: health,
    canonicalModelVersion: "1.0.0",
    cache: cacheBackend(),
    generatedAt: new Date().toISOString(),
  });
}
