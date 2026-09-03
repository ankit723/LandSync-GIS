import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "@/lib/api/guard";
import { runSpatialQuery } from "@/lib/repo/spatial";

const schema = z.object({
  landUse: z
    .array(z.enum(["RESIDENTIAL", "COMMERCIAL", "AGRICULTURAL", "INDUSTRIAL", "GOVERNMENT", "VACANT"]))
    .optional(),
  ownership: z.enum(["GOVERNMENT", "PRIVATE"]).optional(),
  minArea: z.number().optional(),
  maxArea: z.number().optional(),
  nearPoi: z.object({ kind: z.string(), withinMeters: z.number().max(50000) }).optional(),
  nearRoadRef: z.object({ ref: z.string(), withinMeters: z.number().max(50000) }).optional(),
  nearUtility: z
    .object({
      type: z.enum(["WATER", "POWER", "SEWER", "TELECOM", "GAS"]),
      withinMeters: z.number().max(50000),
    })
    .optional(),
  nearPoint: z
    .object({
      lon: z.number().min(-180).max(180),
      lat: z.number().min(-90).max(90),
      withinMeters: z.number().positive().max(50000),
    })
    .optional(),
  intersects: z.literal("FLOOD_RISK_ZONE").optional(),
  withinWard: z.string().optional(),
});

export async function POST(req: Request) {
  const g = await guard("run_spatial_query");
  if (!g.ok) return g.response;

  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }
  return NextResponse.json(await runSpatialQuery(parsed.data));
}
