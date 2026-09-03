import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  getLayerFeatureCollection,
  layerFeatureCounts,
  LAYER_NAMES,
  type LayerName,
} from "@/lib/repo/layers";

export async function GET(req: Request) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const name = new URL(req.url).searchParams.get("name") as LayerName | null;

  if (!name) {
    const counts = await layerFeatureCounts();
    return NextResponse.json({
      layers: LAYER_NAMES.map((n) => ({ name: n, features: counts[n] ?? 0 })),
    });
  }
  if (!LAYER_NAMES.includes(name)) {
    return NextResponse.json({ error: `Unknown layer '${name}'` }, { status: 404 });
  }
  return NextResponse.json(await getLayerFeatureCollection(name));
}
