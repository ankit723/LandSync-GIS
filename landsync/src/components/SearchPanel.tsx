"use client";

import { useState } from "react";
import { useParcelSearch } from "@/lib/api/hooks";
import { Spinner } from "@/components/ui";
import { titleCase } from "@/lib/format";

export function SearchPanel({ onPick }: { onPick: (id: string) => void }) {
  const [term, setTerm] = useState("");
  const [q, setQ] = useState("");
  const { data, isFetching, error } = useParcelSearch(q, q.length > 0);

  return (
    <div className="card p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
        Find a parcel
      </h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQ(term.trim());
        }}
        className="flex gap-2"
      >
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Parcel ID, plot, khata, holding, owner…"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-primary"
        />
        <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white">
          Search
        </button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1">
        {["142", "88", "210", "520", "LS-OD-BBSR-000123", "Patia"].map((s) => (
          <button
            key={s}
            onClick={() => {
              setTerm(s);
              setQ(s);
            }}
            className="chip hover:border-primary/40 hover:text-primary"
          >
            {s}
          </button>
        ))}
      </div>

      {q && (
        <div className="mt-3 max-h-72 space-y-1.5 overflow-y-auto scrollbar-thin">
          {isFetching && <Spinner />}
          {error && <p className="text-sm text-red-600">{String(error)}</p>}
          {data && data.count === 0 && !isFetching && (
            <p className="text-sm text-text-muted">No parcels matched “{q}”.</p>
          )}
          {data?.results.map((r) => (
            <button
              key={r.canonicalParcelId}
              onClick={() => onPick(r.canonicalParcelId)}
              className="w-full rounded-md border border-border p-2 text-left text-sm hover:border-primary/40 hover:bg-primary/[0.03]"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold">{r.canonicalParcelId}</span>
                <span className="chip">{titleCase(r.classification)}</span>
              </div>
              <div className="mt-0.5 text-xs text-text-muted">
                Plot {r.plotNo} · Khata {r.khataNo} · {r.village} · {r.recordedHolder}
              </div>
              {r.matchedOn && (
                <div className="mt-0.5 text-[11px] text-primary">
                  resolved via {titleCase(r.matchedOn)}
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
