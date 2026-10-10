// Spells for the character card, read through the SAME library index
// and data loader the global search bar uses (src/utils/libraryIndex.ts):
// enabled libraries + their indexPath, each library's disabled sources,
// local content, no kiwee fallback, shared 24h cache. This file only
// narrows that index down to spells and looks up a spell's data row.

import {
  loadLibraryIndex,
  fetchLibraryData,
  passesVersion as passesVersionFor,
  currentDataVersion,
  libraryConfigSignature,
} from "../../utils/libraryIndex";
import { getLocalDataByKeySource } from "../../utils/localContent";

/** One spell as listed under one source. */
export interface SpellRef {
  /** English / Chinese names, lowercase ("" if missing). */
  eng: string;
  cn: string;
  /** Display names, original case. */
  engName: string;
  cnName: string;
  /** Uppercase source code (the shared index already normalizes it). */
  code: string;
}

/** Data Version rule, with the current setting. */
export function passesVersion(code: string): boolean {
  return passesVersionFor(code.toUpperCase(), currentDataVersion());
}

/** Every spell reachable under the current library settings, in index
 *  order (one row per name + source). */
export async function loadSpellRefs(): Promise<SpellRef[]> {
  const idx = await loadLibraryIndex();
  const out: SpellRef[] = [];
  for (const e of idx.x) {
    if (!e || e.c !== 2) continue;
    const code = typeof e.s === "string" ? e.s.toUpperCase() : "";
    if (!code) continue;
    const engName = String(e.n ?? "").trim();
    const cnName = String(e.cn ?? "").trim();
    if (!engName && !cnName) continue;
    out.push({
      eng: engName.toLowerCase(),
      cn: cnName.toLowerCase(),
      engName,
      cnName,
      code,
    });
  }
  return out;
}

/** All sources one spell name (English or Chinese) exists in. */
export async function findSpellRefs(name: string): Promise<SpellRef[]> {
  const t = name.trim().toLowerCase();
  if (!t) return [];
  return (await loadSpellRefs()).filter((r) => r.eng === t || r.cn === t);
}

// Per-source spell files, cached for this page's lifetime (the shared
// loader re-validates with the server on every call).
const rowsCache = new Map<string, Promise<any[]>>();
function spellRowsFor(code: string): Promise<any[]> {
  const key = `${libraryConfigSignature()}|${code}`;
  let p = rowsCache.get(key);
  if (!p) {
    p = (async () => {
      // Local content first — same priority search gives it.
      try {
        const local = getLocalDataByKeySource("spell", code);
        if (local && local.length) return local;
      } catch {}
      // Every enabled library × filename case variant, like search.
      const { rows } = await fetchLibraryData(
        [`spells/spells-${code.toLowerCase()}.json`, `spells/spells-${code}.json`],
        "spell",
      );
      return rows;
    })();
    rowsCache.set(key, p);
    void p.then((rows) => { if (!rows.length) rowsCache.delete(key); });
  }
  return p;
}

/** The data row for a ref. Library rows carry `name` (localized —
 *  Chinese on kiwee) and `ENG_name` (English); match on either. */
export async function fetchSpellRow(ref: SpellRef): Promise<any | null> {
  const rows = await spellRowsFor(ref.code);
  const sameSource = (r: any) => !r?.source || String(r.source).toUpperCase() === ref.code;
  const nameMatch = (r: any) => {
    const eng = String(r?.ENG_name ?? "").trim().toLowerCase();
    const nm = String(r?.name ?? "").trim().toLowerCase();
    return (!!ref.eng && (eng === ref.eng || nm === ref.eng)) || (!!ref.cn && nm === ref.cn);
  };
  return rows.find((r) => nameMatch(r) && sameSource(r)) ?? rows.find(nameMatch) ?? null;
}
