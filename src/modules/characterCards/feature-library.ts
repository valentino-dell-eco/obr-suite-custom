// Features for the character card's feature picker, read through the
// SAME library index the global search bar and the spell picker use
// (src/utils/libraryIndex.ts: enabled libraries, disabled sources,
// Data Version). Covers feats, optional features (fighting styles,
// maneuvers, metamagic, invocations…) and class / subclass features.
//
// Unlike spells, a feature's text is stored ON the card (the sheet
// shows it and Room Chat posts it), so picking one also fetches its
// description from the library and converts it to plain text.

import {
  loadLibraryIndex,
  fetchLibraryData,
  getEnabledLibraryBases,
  libraryConfigSignature,
} from "../../utils/libraryIndex";
import { getLocalDataByKeySource } from "../../utils/localContent";
import { passesVersion } from "./spell-library";
import { entriesToText } from "./spell-detail";

type DataKey = "feat" | "optionalfeature" | "classFeature" | "subclassFeature";

/** Index category → where its data lives + the i18n label key. */
export const FEATURE_CATEGORIES: Record<number, { key: DataKey; file?: string; label: string }> = {
  7: { key: "feat", file: "feats.json", label: "searchCategoryFeat" },
  8: { key: "optionalfeature", file: "optionalfeatures.json", label: "searchCategoryOptionalfeature" },
  22: { key: "optionalfeature", file: "optionalfeatures.json", label: "searchCategoryMetamagic" },
  23: { key: "optionalfeature", file: "optionalfeatures.json", label: "searchCategoryManeuver" },
  27: { key: "optionalfeature", file: "optionalfeatures.json", label: "searchCategoryArcaneShot" },
  29: { key: "optionalfeature", file: "optionalfeatures.json", label: "searchCategoryFightingStyle" },
  32: { key: "optionalfeature", file: "optionalfeatures.json", label: "searchCategoryPact" },
  33: { key: "optionalfeature", file: "optionalfeatures.json", label: "searchCategoryKiFeature" },
  34: { key: "optionalfeature", file: "optionalfeatures.json", label: "searchCategoryInfusion" },
  37: { key: "optionalfeature", file: "optionalfeatures.json", label: "searchCategoryRune" },
  30: { key: "classFeature", label: "searchCategoryClassFeature" },
  41: { key: "subclassFeature", label: "searchCategorySubclassFeature" },
};

export interface FeatureRef {
  /** Index category (see FEATURE_CATEGORIES). */
  c: number;
  /** Feature name, English / Chinese (Chinese may be ""). */
  engName: string;
  cnName: string;
  /** Uppercase source code. */
  code: string;
  /** Class features: level and class ("Druid 2; Wild Shape"). */
  level: number | null;
  className: string;
}

/** "<class> <level>; <feature>" → parts (class / subclass features). */
function splitClassName(raw: string): { cls: string; level: number | null; name: string } {
  const s = raw.replace(/\}+$/, "").trim();
  const m = /^(.+?)\s+(\d+);\s*(.+)$/.exec(s);
  return m ? { cls: m[1].trim(), level: parseInt(m[2], 10), name: m[3].trim() } : { cls: "", level: null, name: s };
}

let refsCache: { sig: string; p: Promise<FeatureRef[]> } | null = null;

/** Every feature reachable under the current library settings. */
export function loadFeatureRefs(): Promise<FeatureRef[]> {
  const sig = libraryConfigSignature();
  if (refsCache && refsCache.sig === sig) return refsCache.p;
  const p = (async () => {
    const idx = await loadLibraryIndex();
    const out: FeatureRef[] = [];
    const seen = new Set<string>();
    for (const e of idx.x) {
      if (!e || !(e.c in FEATURE_CATEGORIES)) continue;
      const code = typeof (e as any).s === "string" ? String((e as any).s).toUpperCase() : "";
      if (!code || !passesVersion(code)) continue;
      const en = splitClassName(String(e.n ?? ""));
      const cn = splitClassName(String(e.cn ?? ""));
      if (!en.name && !cn.name) continue;
      const ref: FeatureRef = {
        c: e.c,
        engName: en.name || cn.name,
        cnName: cn.name,
        code,
        level: en.level ?? cn.level,
        className: en.cls || cn.cls,
      };
      const k = `${FEATURE_CATEGORIES[e.c].key}|${ref.engName.toLowerCase()}|${ref.className.toLowerCase()}|${ref.level ?? ""}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(ref);
    }
    return out;
  })();
  refsCache = { sig, p };
  void p.catch(() => { refsCache = null; });
  return p;
}

// --- Data rows (for the description) --------------------------------------

const rowsCache = new Map<string, Promise<any[]>>();

function fileRows(file: string, key: string, code: string): Promise<any[]> {
  const ck = `${libraryConfigSignature()}|${file}|${key}|${code}`;
  let p = rowsCache.get(ck);
  if (!p) {
    p = (async () => {
      try {
        const local = getLocalDataByKeySource(key, code);
        if (local && local.length) return local;
      } catch {}
      return (await fetchLibraryData([file], key)).rows;
    })();
    rowsCache.set(ck, p);
    void p.then((r) => { if (!r.length) rowsCache.delete(ck); });
  }
  return p;
}

/** class / subclass features live in every class/*.json file. */
function classRows(key: string, code: string): Promise<any[]> {
  const ck = `${libraryConfigSignature()}|class|${key}|${code}`;
  let p = rowsCache.get(ck);
  if (!p) {
    p = (async () => {
      try {
        const local = getLocalDataByKeySource(key, code);
        if (local && local.length) return local;
      } catch {}
      const rows: any[] = [];
      for (const base of getEnabledLibraryBases()) {
        let index: Record<string, string> | null = null;
        try {
          const res = await fetch(`${base}/data/class/index.json`, { cache: "no-cache" });
          if (res.ok) index = await res.json();
        } catch {}
        if (!index) continue;
        const arrays = await Promise.all(
          Object.values(index).map(async (fn) => {
            try {
              const r = await fetch(`${base}/data/class/${fn}`, { cache: "no-cache" });
              if (!r.ok) return [];
              return ((await r.json())[key] ?? []) as any[];
            } catch {
              return [];
            }
          }),
        );
        for (const a of arrays) rows.push(...a);
      }
      return rows;
    })();
    rowsCache.set(ck, p);
    void p.then((r) => { if (!r.length) rowsCache.delete(ck); });
  }
  return p;
}

/** The feature's text from the library ("" when not found). */
export async function fetchFeatureDescription(ref: FeatureRef): Promise<string> {
  const cat = FEATURE_CATEGORIES[ref.c];
  if (!cat) return "";
  const rows = cat.file ? await fileRows(cat.file, cat.key, ref.code) : await classRows(cat.key, ref.code);
  const eng = ref.engName.toLowerCase();
  const cn = ref.cnName.toLowerCase();
  const nameOk = (r: any) => {
    const e = String(r?.ENG_name ?? "").trim().toLowerCase();
    const n = String(r?.name ?? "").trim().toLowerCase();
    return (!!eng && (e === eng || n === eng)) || (!!cn && n === cn);
  };
  const srcOk = (r: any) => !r?.source || String(r.source).toUpperCase() === ref.code;
  const lvlOk = (r: any) => ref.level == null || r?.level == null || Number(r.level) === ref.level;
  const clsOk = (r: any) =>
    !ref.className || !r?.className ||
    String(r.className).toLowerCase() === ref.className.toLowerCase();
  const row =
    rows.find((r) => nameOk(r) && srcOk(r) && lvlOk(r) && clsOk(r)) ??
    rows.find((r) => nameOk(r) && lvlOk(r) && clsOk(r)) ??
    rows.find((r) => nameOk(r) && srcOk(r)) ??
    rows.find(nameOk);
  if (!row) return "";
  return entriesToText(row.entries).trim();
}
