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
import { getLocalDataByKeySource, getLocalSourceNames } from "../../utils/localContent";
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
    const add = (ref: FeatureRef) => {
      const k = `${FEATURE_CATEGORIES[ref.c].key}|${ref.engName.toLowerCase()}|${ref.className.toLowerCase()}|${ref.level ?? ""}|${ref.code}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push(ref);
    };
    // Locally imported homebrew (e.g. LaserLlama's classes): its index
    // entries carry only the feature name, so class / subclass
    // features are read from the imported data itself (class name,
    // subclass, level) instead.
    const localClassSources = new Map<DataKey, Set<string>>();
    for (const e of idx.x) {
      if (!e || !(e.c in FEATURE_CATEGORIES)) continue;
      const code = typeof (e as any).s === "string" ? String((e as any).s).toUpperCase() : "";
      if (!code || !passesVersion(code)) continue;
      if ((e as any).__local && (e.c === 30 || e.c === 41)) {
        const key = FEATURE_CATEGORIES[e.c].key;
        if (!localClassSources.has(key)) localClassSources.set(key, new Set());
        localClassSources.get(key)!.add(code);
        continue;
      }
      const en = splitClassName(String(e.n ?? ""));
      const cn = splitClassName(String(e.cn ?? ""));
      if (!en.name && !cn.name) continue;
      add({
        c: e.c,
        engName: en.name || cn.name,
        cnName: cn.name,
        code,
        level: en.level ?? cn.level,
        // Class features whose index name has no "<class> <level>;"
        // prefix are grouped under their source.
        className: en.cls || cn.cls || ((e.c === 30 || e.c === 41) ? `(${code})` : ""),
      });
    }
    for (const [key, codes] of localClassSources) {
      const c = key === "classFeature" ? 30 : 41;
      for (const code of codes) {
        let rows: any[] = [];
        try { rows = getLocalDataByKeySource(key, code); } catch {}
        for (const r of rows) {
          const eng = String(r?.ENG_name ?? r?.name ?? "").trim();
          if (!eng) continue;
          const cls = String(r?.className ?? "").trim();
          const sub = String(r?.subclassShortName ?? "").trim();
          const lv = Number(r?.level);
          add({
            c,
            engName: eng,
            cnName: r?.ENG_name ? String(r.name ?? "").trim() : "",
            code,
            level: Number.isFinite(lv) ? lv : null,
            className: c === 41 ? `${sub} ${cls}`.trim() || `(${code})` : cls || `(${code})`,
          });
        }
      }
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

// --- Source names ("Player's Handbook · PHB") -----------------------------

const KNOWN_SOURCES: Record<string, string> = {
  PHB: "Player's Handbook (2014)",
  XPHB: "Player's Handbook (2024)",
  DMG: "Dungeon Master's Guide (2014)",
  XDMG: "Dungeon Master's Guide (2024)",
  MM: "Monster Manual (2014)",
  XMM: "Monster Manual (2025)",
  TCE: "Tasha's Cauldron of Everything",
  XGE: "Xanathar's Guide to Everything",
  SCAG: "Sword Coast Adventurer's Guide",
  EGW: "Explorer's Guide to Wildemount",
  MOT: "Mythic Odysseys of Theros",
  FTD: "Fizban's Treasury of Dragons",
  MPMM: "Mordenkainen Presents: Monsters of the Multiverse",
  BMT: "The Book of Many Things",
  EFA: "Eberron: Forge of the Artificer",
  ERLW: "Eberron: Rising from the Last War",
  TDCSR: "Tal'Dorei Campaign Setting Reborn",
  AAG: "Astral Adventurer's Guide",
  SATO: "Sigil and the Outlands",
  VRGR: "Van Richten's Guide to Ravenloft",
  GGR: "Guildmasters' Guide to Ravnica",
  AI: "Acquisitions Incorporated",
  UA: "Unearthed Arcana",
  PSA: "Plane Shift: Amonkhet",
  HB: "Homebrew",
};

let namesCache: { sig: string; en: boolean; p: Promise<Map<string, string>> } | null = null;

/** Full book names by uppercase source code: the library's books.json
 *  (English or Chinese name by `en`), imported homebrew `_meta`, then
 *  a built-in list of common books. */
export function loadSourceNames(en: boolean): Promise<Map<string, string>> {
  const sig = libraryConfigSignature();
  if (namesCache && namesCache.sig === sig && namesCache.en === en) return namesCache.p;
  const p = (async () => {
    const out = new Map<string, string>();
    try {
      for (const [k, v] of getLocalSourceNames()) out.set(k, v);
    } catch {}
    for (const base of getEnabledLibraryBases()) {
      try {
        const res = await fetch(`${base}/data/books.json`, { cache: "no-cache" });
        if (!res.ok) continue;
        const data = await res.json();
        for (const b of data.book ?? []) {
          const code = String(b?.source ?? b?.id ?? "").toUpperCase();
          const name = String((en ? b?.ENG_name ?? b?.name : b?.name ?? b?.ENG_name) ?? "").trim();
          if (code && name && !out.has(code)) out.set(code, name);
        }
      } catch {}
    }
    for (const [k, v] of Object.entries(KNOWN_SOURCES)) if (!out.has(k)) out.set(k, v);
    return out;
  })();
  namesCache = { sig, en, p };
  return p;
}
