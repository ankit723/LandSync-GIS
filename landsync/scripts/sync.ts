import "dotenv/config";
import { runAllSyncs, runSync, type SyncSource } from "../src/lib/integration/sync";
import { deptApiReachable, deptApiBase } from "../src/lib/integration/clients";

async function main() {
  const args = process.argv.slice(2);
  const full = args.includes("--full");
  const source = args.find((a) => !a.startsWith("--"))?.toUpperCase() as SyncSource | undefined;

  if (!(await deptApiReachable())) {
    console.error(`Department API not reachable at ${deptApiBase()}. Start it with: npm run dept:serve`);
    process.exit(1);
  }

  const results = source ? [await runSync(source, { full })] : await runAllSyncs({ full });
  for (const r of results) {
    console.log(
      `${r.source.padEnd(13)} ${r.status.padEnd(8)} in=${r.recordsIn} ok=${r.recordsOk} failed=${r.recordsFailed} pages=${r.pages}` +
        (r.error ? `  error=${r.error}` : ""),
    );
  }
  process.exit(results.some((r) => r.status === "FAILED") ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
