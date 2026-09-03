# Land Stack — GIS Digital Public Infrastructure for Land Governance

SIH 2026 project. A **parcel-centric** platform that unifies fragmented departmental
land records through **adapters**, a **canonical land data model**, **PostGIS spatial
intelligence**, **role-based access control** and **explainable anomaly detection** —
without asking any department to replace its existing system.

This is now a **real system running on a demo dataset**, not a mock. The database is
PostgreSQL + PostGIS with spatial indexes, the departmental systems are separate HTTP
services that the adapters ingest from on a watermark-based sync, auth is JWT +
argon2, and the natural-language query layer calls a real LLM when a key is present
(deterministic rule-based fallback otherwise). Only the *contents* of the dataset are
synthetic; swapping in real cadastral data means changing the seed / sync source, not
the code.

---

## Run it

Prerequisites: Node 20+, Docker (for Postgres/PostGIS + Redis).

```bash
npm install
cp .env.example .env          # defaults work as-is for local dev

npm run db:setup              # start containers, migrate, seed PostGIS + dept.* + users
npm run dept:serve            # (separate terminal) mock departmental APIs on :4000
npm run sync -- --full        # ingest all four departments over HTTP into the canonical store

npm run dev                   # http://localhost:3000
```

`GET /api/health` reports DB / PostGIS / cache / LLM status.

Sign in: any role card (passwordless demo), or credentials — every seeded user has
password `landsync` (IDs `USR-REV-2931`, `USR-ADM-0001`, …).

### npm scripts

| script | what |
|---|---|
| `db:up` / `db:down` | start / stop the Postgres + Redis containers |
| `db:migrate` | apply `db/migrations/*.sql` |
| `db:seed` | load the synthetic world into PostGIS + `dept.*` + users |
| `db:setup` | up + migrate + seed |
| `db:reset` | wipe volumes and rebuild from scratch |
| `dept:serve` | run the mock departmental API gateway (`:4000`) |
| `sync [SOURCE] [--full]` | run the ingestion sync (all sources, or one) |
| `dev` / `build` / `start` / `lint` | Next.js |

---

## Architecture

```
┌── Next.js app (UI + /api route handlers) ───────────────────────────┐
│  app/            React (MapLibre GL) client + REST route handlers    │
│  lib/canonical/  Canonical Land Data Model — the stable contract     │
│  lib/adapters/   revenue · registration · municipal · planning       │
│                  (zod-validated transforms to the canonical model)   │
│  lib/integration/                                                    │
│    clients.ts    HTTP clients for the departmental APIs (retry/…)    │
│    sync.ts       watermark sync → validate → upsert + dead-letter    │
│    pipeline.ts   identifier resolution + canonical assembly + trace  │
│    health.ts     per-adapter processing health                       │
│  lib/repo/       PostGIS queries: parcels, identifiers, raw records, │
│                  layers (ST_AsGeoJSON), spatial (ST_DWithin/…)       │
│  lib/rbac/       permission matrix + field-level filter              │
│  lib/intelligence/  inconsistency engine · similarity · nl-query ·  │
│                     change-detection (all read from PostGIS)         │
│  lib/ai/llm.ts   provider-agnostic LLM client (OpenAI / Anthropic)  │
│  lib/auth/       JWT (jose) + argon2 + Redis session revocation      │
│  lib/db/         pg pool · Redis-or-memory cache                     │
└────────────────────────────────────────────────────────────────────┘
        │ SQL (PostGIS 3.4)            │ HTTP + x-api-key
        ▼                             ▼
  PostgreSQL 16 + PostGIS       services/dept-server.ts
   parcels, gis_*, src_*,        dept.revenue / registration /
   parcel_identifiers,           municipal / planning
   audit_events (append-only),   (their own DBs; the only thing
   sync_runs, dead_letters,      the adapters are allowed to read)
   dept.*                        + Redis 7 (cache / session revocation)
```

### From demo to real — what actually changed

| PRD component | Status |
|---|---|
| Next.js + MapLibre frontend | ✅ real |
| PostgreSQL + PostGIS, spatial indexes, `ST_DWithin` / `ST_Intersects` / `ST_Area` | ✅ real (Docker) |
| Adapter architecture ingesting from independent systems | ✅ real — 4 HTTP services, per-source keys, retry/backoff, incremental watermark sync, dead-letter queue, `sync_runs` history |
| Auth | ✅ real — HS256 JWT (jose), argon2 password hashing, Redis-backed revocation; passwordless role login kept as a dev toggle (`ALLOW_ROLE_LOGIN`) |
| Append-only audit trail | ✅ real — `audit_events` table with a trigger that blocks `UPDATE`/`DELETE` |
| Redis cache | ✅ real (falls back to an in-process map if absent) |
| AI natural-language GIS query | ✅ real LLM path (`lib/ai/llm.ts`, OpenAI/Anthropic) with schema-validated output and a deterministic executor underneath; rule-based fallback with no key |
| NestJS backend / Python FastAPI intelligence | ⏳ still Next.js route handlers + TS rule engine — mechanical port, contracts already stable |
| Real cadastral data + real department endpoints | ⏳ needs government access — the seed/sync source is the only thing to swap |

---

## Feature ↔ PRD map

| PRD | Where |
|-----|-------|
| FR-01/02 Auth + RBAC | `lib/auth/*`, `lib/rbac/*`, `lib/api/guard.ts`; matrix on Admin page |
| FR-03 Parcel search (5 id types + text + map) | `lib/repo/identifiers.ts#resolveIdentifiers` |
| FR-04 GIS map | `components/MapView.tsx`, `lib/repo/layers.ts` (PostGIS → GeoJSON) |
| FR-05 Unified parcel profile | `lib/integration/pipeline.ts`, `components/ParcelProfile.tsx` |
| FR-06 Departmental integration | `services/dept-server.ts`, `lib/integration/{clients,sync}.ts`, `lib/adapters/*` |
| FR-07 Spatial queries | `lib/repo/spatial.ts` (one PostGIS query per request) |
| FR-08 Record consistency detection | `lib/intelligence/inconsistency.ts`, `/anomalies` |
| FR-09 Entity resolution | `lib/intelligence/similarity.ts` (Jaro-Winkler + token-set) |
| FR-10 NL GIS query | `lib/intelligence/nl-query.ts` + `lib/ai/llm.ts`; interpreted filters always shown |
| FR-11 Change detection | `lib/intelligence/change-detection.ts` (`ST_Area` diff vs permits) |
| FR-12 Audit logging | `lib/audit/log.ts` + `audit_events` append-only trigger |
| NFR-02 Scalability | new department = new HTTP source + adapter + `runSync` case |
| NFR-05 Explainability | every flag carries `reasons[]` + structured `evidence` |
| §15 Never auto-modify records | `POST /api/parcels/[id]/actions` records intent as an audit event only |

---

## Sample data & demo storylines

Deterministic (seed `20260123`). ~192 grid parcels (~380–480 m²) + 8 large estate
parcels (2–5 ha) around Bhubaneswar, Odisha, plus roads (incl. NH-16), 2024/2026
buildings, zoning, hospitals, a river and a flood-risk zone.

- Plot **142** (`LS-OD-BBSR-000123`) — clean, no flags.
- Plot **88** — RoR holder ≠ latest registered buyer → **CRITICAL**.
- Plot **210** — revenue area 22 % over the map; municipal plinth exceeds the plot.
- Plot **305** — "Anil Kumar" vs "Anil K. Kumar" → ~90 % fuzzy match, manual review.
- Plot **417** — 2026 sale registered, RoR not mutated.
- Plot **520** — new 2026 structure, no approved permit.

**Integration demo:** `curl -X PATCH -H 'x-api-key: dept-dev-key' -d '{"recorded_holder":"Rajesh Kumar"}' localhost:4000/revenue/records/LS-OD-BBSR-000123`
then `npm run sync REVENUE` (picks up exactly 1 record) → the change flows through the
adapter into the canonical profile and the risk engine flags it.

---

## Known limitations

- Dataset is synthetic; no real cadastral geometry or real department endpoints.
- Intelligence layer is a deterministic rule engine (transparent, not ML). The
  `SpatialFilter` contract lets an LLM slot into NL parsing with no downstream change.
- `sync.ts` runs inline in the request/CLI — production would queue it.
- Postgres image is `postgis/postgis:16-3.4` (amd64 under emulation on Apple silicon);
  spatial queries are ~50–80 ms here, sub-10 ms on native.
- Basemap tiles come from public OpenStreetMap.
- Change detection compares two vector building layers, not satellite imagery / CV.
