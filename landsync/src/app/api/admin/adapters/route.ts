import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { adapterList } from "@/lib/adapters/registry";
import { integrationHealth } from "@/lib/integration/health";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const health = await integrationHealth();
  return NextResponse.json({
    adapters: adapterList.map((a) => ({
      ...a.meta,
      health: health.find((h) => h.adapterId === a.meta.id) ?? null,
    })),
  });
}
