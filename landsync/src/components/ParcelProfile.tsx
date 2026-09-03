"use client";

import type { ReactNode } from "react";
import type { ParcelProfileView, SectionView } from "@/lib/rbac/filter";
import type { ParcelSummary } from "@/lib/integration/summary";
import { Lock, KV } from "@/components/ui";
import { m2, inr, date, titleCase } from "@/lib/format";

function Section<T>({
  title,
  view,
  children,
}: {
  title: string;
  view: SectionView<T>;
  children: (data: T) => ReactNode;
}) {
  return (
    <section className="border-t border-border py-3 first:border-t-0">
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {title}
        </h4>
        {view.visibility !== "full" && <Lock note={view.note} />}
      </div>
      {view.visibility === "hidden" || view.data == null ? (
        <p className="text-sm text-text-muted">{view.note ?? "Not available."}</p>
      ) : (
        children(view.data)
      )}
    </section>
  );
}

export function ParcelProfile({
  summary,
  profile,
}: {
  summary: ParcelSummary;
  profile: ParcelProfileView;
}) {
  return (
    <div className="text-sm">
      <Section title="Parcel identity" view={profile.identity}>
        {(d) => (
          <div>
            <KV k="Canonical Parcel ID" v={<span className="font-mono">{d.canonicalParcelId}</span>} />
            <div className="mt-2 overflow-hidden rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-surface-2 text-text-muted">
                  <tr>
                    <th className="px-2 py-1 text-left font-medium">Source</th>
                    <th className="px-2 py-1 text-left font-medium">Identifier type</th>
                    <th className="px-2 py-1 text-left font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {d.identifiers.map((i, idx) => (
                    <tr key={idx} className="border-t border-border">
                      <td className="px-2 py-1">{titleCase(i.sourceSystem)}</td>
                      <td className="px-2 py-1">{titleCase(i.identifierType)}</td>
                      <td className="px-2 py-1 font-mono">{i.identifierValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      <Section title="Geometry & area" view={profile.geometry}>
        {(d) => (
          <div>
            <KV k="Cadastral (map) area" v={m2(d.calculatedArea)} />
            <KV k="Recorded / official area" v={m2(d.officialArea)} />
            <KV
              k="Deviation"
              v={
                <span
                  className={
                    Math.abs(d.officialArea - d.calculatedArea) / d.calculatedArea > 0.15
                      ? "text-red-600"
                      : ""
                  }
                >
                  {(
                    (Math.abs(d.officialArea - d.calculatedArea) / d.calculatedArea) *
                    100
                  ).toFixed(1)}
                  %
                </span>
              }
            />
          </div>
        )}
      </Section>

      <Section title="Classification & location" view={profile.classification}>
        {(d) => (
          <div>
            <KV k="Land classification" v={titleCase(d.landClassification)} />
            {profile.location.data && (
              <>
                <KV k="Village" v={profile.location.data.village || "—"} />
                <KV k="Ward" v={profile.location.data.ward || "—"} />
                <KV
                  k="Administrative"
                  v={`${profile.location.data.ulbOrBlock}, ${profile.location.data.district}, ${profile.location.data.state}`}
                />
              </>
            )}
          </div>
        )}
      </Section>

      <Section title="Record of Rights / ownership" view={profile.ownership}>
        {(rows) =>
          rows.length ? (
            <ul className="space-y-1.5">
              {rows.map((r, i) => (
                <li key={i} className="rounded-md border border-border p-2 text-xs">
                  <div className="font-semibold">{r.personReference}</div>
                  <div className="text-text-muted">
                    {titleCase(r.rightsType)} · share {r.ownershipShare} · since{" "}
                    {date(r.validFrom)} · src {titleCase(r.sourceSystem)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">No rights records integrated.</p>
          )
        }
      </Section>

      <Section title="Registration" view={profile.registration}>
        {(rows) =>
          rows.length ? (
            <ul className="space-y-1.5">
              {rows.map((r, i) => (
                <li key={i} className="rounded-md border border-border p-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-semibold">{titleCase(r.transactionType)}</span>
                    <span className="chip">{titleCase(r.registrationStatus)}</span>
                  </div>
                  <div className="text-text-muted">
                    {date(r.transactionDate)} · doc {r.documentNumber}
                  </div>
                  <div className="text-text-muted">
                    {r.seller} → {r.buyer}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">No registration records.</p>
          )
        }
      </Section>

      <Section title="Property tax" view={profile.tax}>
        {(rows) =>
          rows.length ? (
            <ul className="space-y-1.5">
              {rows.map((r, i) => (
                <li key={i} className="rounded-md border border-border p-2 text-xs">
                  <div className="flex justify-between">
                    <span>AY {r.assessmentYear}</span>
                    <span className="chip">{titleCase(r.paymentStatus)}</span>
                  </div>
                  <div className="text-text-muted">
                    {r.amount >= 0 ? inr(r.amount) : "•••• restricted"} · {r.taxpayer}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">No tax records.</p>
          )
        }
      </Section>

      <Section title="Zoning" view={profile.zoning}>
        {(z) =>
          z ? (
            <div>
              <KV k="Zone" v={`${z.zoneName} (${z.zoneCode})`} />
              <KV k="Permitted use" v={z.permittedLandUse.map(titleCase).join(", ") || "—"} />
              <KV k="Master plan" v={z.masterPlanReference} />
            </div>
          ) : (
            <p className="text-text-muted">No zoning information.</p>
          )
        }
      </Section>

      <Section title="Building permissions" view={profile.buildingPermissions}>
        {(rows) =>
          rows.length ? (
            <ul className="space-y-1.5">
              {rows.map((r, i) => (
                <li key={i} className="rounded-md border border-border p-2 text-xs">
                  <div className="flex justify-between">
                    <span>{r.permitNumber ?? "No permit on record"}</span>
                    <span className="chip">{titleCase(r.status)}</span>
                  </div>
                  {r.sanctionedFloors != null && (
                    <div className="text-text-muted">{r.sanctionedFloors} sanctioned floor(s)</div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">No building permission records.</p>
          )
        }
      </Section>

      <Section title="Encumbrances" view={profile.encumbrances}>
        {(rows) =>
          rows.length ? (
            <ul className="space-y-1.5">
              {rows.map((r, i) => (
                <li key={i} className="rounded-md border border-border p-2 text-xs">
                  <span className="font-semibold">{titleCase(r.type)}</span> ·{" "}
                  {titleCase(r.status)} · {r.sourceReference} · from {date(r.effectiveFrom)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">No encumbrances on record.</p>
          )
        }
      </Section>

      <Section title="Restrictions" view={profile.restrictions}>
        {(rows) =>
          rows.length ? (
            <ul className="space-y-1.5">
              {rows.map((r, i) => (
                <li
                  key={i}
                  className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700"
                >
                  <span className="font-semibold">{titleCase(r.type)}</span> — {r.description} (
                  {r.authority})
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">No public restrictions apply.</p>
          )
        }
      </Section>

      <Section title="Utility connections" view={profile.utilities}>
        {(rows) =>
          rows.length ? (
            <ul className="space-y-1.5">
              {rows.map((r, i) => (
                <li key={i} className="rounded-md border border-border p-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-semibold">{titleCase(r.utilityType)}</span>
                    <span className="chip">
                      {r.status === "IN_SERVICE" ? `~${r.distanceM} m` : titleCase(r.status)}
                    </span>
                  </div>
                  {r.operator && <div className="text-text-muted">{r.operator}</div>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-text-muted">No mapped utility mains within 40 m.</p>
          )
        }
      </Section>

      {profile.redactions.length > 0 && (
        <p className="mt-3 border-t border-border pt-2 text-[11px] text-text-muted">
          {profile.redactions.length} field group(s) filtered for role{" "}
          <b>{profile.role}</b> by the RBAC policy. Summary owner:{" "}
          {summary.recordedHolder}.
        </p>
      )}
    </div>
  );
}
