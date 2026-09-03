/** Name-similarity utilities for entity resolution (PRD §8 FR-09, §13). */

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|smt|sri|shri|dr)\b\.?/g, "")
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const maxDist = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatch = new Array(a.length).fill(false);
  const bMatch = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - maxDist);
    const end = Math.min(i + maxDist + 1, b.length);
    for (let j = start; j < end; j++) {
      if (bMatch[j] || a[i] !== b[j]) continue;
      aMatch[i] = true;
      bMatch[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aMatch[i]) continue;
    while (!bMatch[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  t /= 2;
  return (matches / a.length + matches / b.length + (matches - t) / matches) / 3;
}

export function jaroWinkler(a: string, b: string): number {
  const j = jaro(a, b);
  let prefix = 0;
  while (prefix < 4 && a[prefix] && a[prefix] === b[prefix]) prefix++;
  return j + prefix * 0.1 * (1 - j);
}

/** Token-set similarity — order-independent, handles middle names / initials. */
export function tokenSetSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let overlap = 0;
  for (const t of ta) {
    if (tb.has(t)) {
      overlap += 1;
      continue;
    }
    // initial vs full token ("k" ~ "kumar")
    for (const u of tb) {
      if ((t.length === 1 && u.startsWith(t)) || (u.length === 1 && t.startsWith(u))) {
        overlap += 0.6;
        break;
      }
    }
  }
  return overlap / Math.max(ta.size, tb.size);
}

/** Blended score in [0,1]. */
export function nameSimilarity(a: string, b: string): number {
  const jw = jaroWinkler(normalizeName(a), normalizeName(b));
  const ts = tokenSetSimilarity(a, b);
  return Math.max(jw * 0.55 + ts * 0.45, ts);
}
