// Shared library-index logic — used by the global search bar
// (src/modules/search/page.ts) AND the character card's spell picker /
// spell details (src/modules/characterCards/spell-library.ts), so both
// always see exactly the same content:
//
//   • every ENABLED library, each with its own `indexPath`
//   • each library's `disabledSources` blacklist ("Sources" button in
//     Settings → Libraries), applied per library before dedupe
//   • locally imported content (Settings → Local content) merged in
//   • all libraries disabled → empty index (no silent kiwee fallback)
//   • entries' `s` rewritten to their UPPERCASE source code
//   • synthesized weapon-property entries (c=58) from items-base.json
//   • 24h localStorage cache keyed on library config + local content
//
// Moved verbatim out of search/page.ts (2026-10). Keep this module
// free of top-level side effects: it's imported by several iframes.

import { getState, whenStateReady, type DataVersion } from "../state";
import {
  getLocalIndexFile,
  getLocalContentSignature,
  initLocalContent,
} from "./localContent";

export const DEFAULT_LIBRARY_BASE = "https://5e.kiwee.top";

export interface LibIndexEntry {
  id?: number;
  c: number;
  n: string;
  cn?: string;
  s?: number | string;
  [k: string]: any;
}
export interface LibIndexFile {
  x: LibIndexEntry[];
  m: { s: Record<string, number> };
}

export function getEnabledLibraryBases(): string[] {
  try {
    const libs = getState().libraries || [];
    const bases = libs
      .filter(
        (l) =>
          l.enabled &&
          typeof l.baseUrl === "string" &&
          l.baseUrl.trim().length > 0,
      )
      .map((l) => l.baseUrl.replace(/\/+$/, ""));
    return bases.length > 0 ? bases : [DEFAULT_LIBRARY_BASE];
  } catch {
    return [DEFAULT_LIBRARY_BASE];
  }
}

/** Like getEnabledLibraryBases but also returns each library's
 *  configured `indexPath` (defaults to `search/index.json` when
 *  unset) AND its `disabledSources` blacklist. */
export function getEnabledLibrarySources(): Array<{
  base: string;
  indexPath: string;
  disabledSources: Set<string>;
}> {
  try {
    const libs = getState().libraries || [];
    // Empty result means EMPTY — no fallback to the kiwee default base
    // when every library is disabled (local content still merges in).
    return libs
      .filter(
        (l) =>
          l.enabled &&
          typeof l.baseUrl === "string" &&
          l.baseUrl.trim().length > 0,
      )
      .map((l) => ({
        base: l.baseUrl.replace(/\/+$/, ""),
        indexPath:
          typeof l.indexPath === "string" && l.indexPath.length > 0
            ? l.indexPath.replace(/^\/+/, "")
            : "search/index.json",
        disabledSources: new Set(
          (Array.isArray(l.disabledSources) ? l.disabledSources : [])
            .map((s) => String(s).toLowerCase())
            .filter((s) => s.length > 0),
        ),
      }));
  } catch {
    return [];
  }
}

const CORE_2014 = new Set(["PHB", "MM"]);
const CORE_2024 = new Set(["XPHB", "XMM"]);

/** The 2014 / 2024 / all "Data Version" rule. Only the core books are
 *  filtered; custom / homebrew sources are "other" and always pass
 *  (mirrors bestiary/data.ts detectEdition). */
export function passesVersion(code: string, dv: DataVersion): boolean {
  if (dv === "all") return true;
  const isCore = CORE_2014.has(code) || CORE_2024.has(code);
  if (!isCore) return true;
  if (dv === "2014") return CORE_2014.has(code);
  if (dv === "2024") return CORE_2024.has(code);
  return true;
}

/** Current Data Version setting. */
export function currentDataVersion(): DataVersion {
  try {
    return (getState().dataVersion ?? "all") as DataVersion;
  } catch {
    return "all";
  }
}

// Same localStorage key the search bar always used, so existing caches
// stay valid and every consumer shares one copy.
const CACHE_KEY = "obr-suite/search-index-v3";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const memIndex = new Map<string, LibIndexFile>();
const loading = new Map<string, Promise<LibIndexFile>>();

/** Drop the in-memory copy (localStorage is keyed on the config, so a
 *  config change already misses it). */
export function invalidateLibraryIndex(): void {
  memIndex.clear();
}

/** The merged index of every enabled library + local content. */
export async function loadLibraryIndex(): Promise<LibIndexFile> {
  // In SDK-less iframes the real library settings arrive by relay —
  // don't build an index from the defaults before they're here.
  await whenStateReady();
  // Warm the IDB-backed local-content cache before reading its
  // signature / index. Idempotent.
  await initLocalContent();
  const sources = getEnabledLibrarySources();
  // Cache key encodes base + indexPath + disabledSources + local
  // content, so any change to those invalidates it.
  const cacheKey = `${CACHE_KEY}:${sources
    .map(
      (s) =>
        `${s.base}|${s.indexPath}|${[...s.disabledSources].sort().join(",")}`,
    )
    .join("||")}:${getLocalContentSignature()}`;
  const mem = memIndex.get(cacheKey);
  if (mem) return mem;
  const inflight = loading.get(cacheKey);
  if (inflight) return inflight;
  const p = (async (): Promise<LibIndexFile> => {
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { ts: number; data: LibIndexFile };
        if (Date.now() - parsed.ts < CACHE_TTL_MS && parsed.data?.x?.length) {
          return parsed.data;
        }
      }
    } catch {}
    // Fetch all libraries in parallel; carry the per-library config
    // alongside each fetched index so the merge loop below can apply
    // each lib's own `disabledSources` blacklist.
    const perLibrary = await Promise.all(
      sources.map(async (cfg) => {
        try {
          const res = await fetch(`${cfg.base}/${cfg.indexPath}`, {
            cache: "no-cache",
          });
          if (!res.ok) return null;
          return { idx: (await res.json()) as LibIndexFile, cfg };
        } catch (e) {
          console.warn(
            `[obr-suite/search] index fetch failed for ${cfg.base}/${cfg.indexPath}`,
            e,
          );
          return null;
        }
      }),
    );
    const valid = perLibrary.filter(
      (x): x is { idx: LibIndexFile; cfg: (typeof sources)[number] } =>
        !!x && Array.isArray(x.idx.x),
    );
    // Locally-imported homebrew gets synthesised into a virtual
    // index file so it merges into the same flow as URL libraries.
    // Local content has no `disabledSources` blacklist (per-source
    // toggling for local homebrew can be done by deleting the file).
    const localIdx = getLocalIndexFile();
    const allValid: Array<{
      idx: LibIndexFile;
      cfg: { disabledSources: Set<string> };
    }> =
      localIdx.x.length > 0
        ? [
            ...valid,
            {
              idx: localIdx as unknown as LibIndexFile,
              cfg: { disabledSources: new Set<string>() },
            },
          ]
        : valid;
    if (allValid.length === 0) {
      // 2026-05-10: with all libraries disabled and no local content,
      // return an empty index instead of throwing. Prevents the
      // user-visible "loading…" spinner from sticking around when the
      // user deliberately wants a clean canvas.
      const empty: LibIndexFile = { x: [], m: { s: {} } };
      return empty;
    }
    // Naive merge — primary lib's source map wins, all entries pooled.
    // dedupeKey uses `${cn}|${n}|${s ?? ""}` so the same monster from
    // two libraries collapses to one row (custom lib wins because
    // it's typically listed first).
    const merged: LibIndexFile = { x: [], m: { s: {} } };
    for (const { idx } of allValid) {
      if (idx.m?.s) {
        for (const [code, id] of Object.entries(idx.m.s)) {
          if (!(code in merged.m.s)) merged.m.s[code] = id;
        }
      }
    }
    // 2026-05-04 dedupe overhaul: the partnered kiwee library
    // overlaps significantly with the main kiwee one (same monsters
    // listed in both). The naive `s` field won't dedupe across
    // libraries because the same source can be assigned different
    // numeric ids in each lib's `m.s` map. Resolve the entry's
    // source to its CODE STRING per-library, normalise to lower-
    // case, and use that in the dedupe key. Result: identical
    // monsters from two libraries collapse to one row regardless
    // of how each lib chose to number its sources.
    //
    // 2026-05-09 ROOT-CAUSE FIX for the
    // "BOOKOFEBONTIDES override hides PHB" bug:
    //
    //   The numeric `e.s` is a per-library id. Two libraries can
    //   assign the SAME numeric id to DIFFERENT source codes —
    //   exactly what kiwee does:
    //     main  m.s  → "XPHB": 11
    //     partnered m.s  → "BookOfEbonTides": 11
    //
    //   Earlier code merged `m.s` into a single `merged.m.s` with
    //   "first-wins" on the CODE key (so both XPHB:11 and
    //   BookOfEbonTides:11 ended up in merged.m.s). The display path
    //   then built `sourceById: Map<number, string>` from
    //   merged.m.s, where the LAST iterated code-for-id wins —
    //   "BookOfEbonTides" overwrote "XPHB" at id 11. Result: every
    //   XPHB entry in main's index displayed as "BOOKOFEBONTIDES",
    //   the source data fetch went looking for the wrong filename
    //   and 404'd.
    //
    //   The fix: at merge time, rewrite each entry's `e.s` from its
    //   per-library numeric id into the resolved UPPERCASE source
    //   CODE string. After this, every entry carries a globally-
    //   unique source identity, and the display path's
    //   `srcCode(e.s)` short-circuits on the string branch — the
    //   stale `sourceById` numeric map is never consulted again.
    const resolveSourceCode = (e: LibIndexEntry, lib: LibIndexFile): string => {
      if (e.s == null) return "";
      if (typeof e.s === "string") return e.s.toLowerCase();
      const map = lib.m?.s || {};
      for (const [code, id] of Object.entries(map)) {
        if (id === e.s) return code.toLowerCase();
      }
      return String(e.s).toLowerCase();
    };
    const seen = new Set<string>();
    for (const { idx, cfg } of allValid) {
      for (const e of idx.x) {
        const cn = (e.cn || "").trim().toLowerCase();
        const n = (e.n || "").trim().toLowerCase();
        const src = resolveSourceCode(e, idx);
        // Per-library source blacklist (e.g. user disabled
        // BOOKOFEBONTIDES inside the partnered library). Apply BEFORE
        // dedupe so an entry available in another library where the
        // source is allowed still gets through under that library.
        if (cfg.disabledSources.size > 0 && src && cfg.disabledSources.has(src))
          continue;
        const key = `${cn}|${n}|${src}|${e.c ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Clone the entry with `s` rewritten to the resolved code
        // string (uppercased — display does .toUpperCase() anyway,
        // and uppercase makes it easier to grep filenames). When
        // src is empty (entry has no resolvable source), preserve
        // the original `e.s` so we don't accidentally null it out.
        const fixedEntry: LibIndexEntry = src ? { ...e, s: src.toUpperCase() } : e;
        merged.x.push(fixedEntry);
      }
    }
    // Synthesise weapon-property entries from items-base.json's
    // itemProperty array. 5etools doesn't add these to the search
    // index because they're definitional, but the cc-info weapon
    // chips need them to resolve. Best-effort — first library that
    // 200s wins.
    try {
      for (const base of sources.map((s) => s.base)) {
        try {
          const r = await fetch(`${base}/data/items-base.json`, {
            cache: "no-cache",
          });
          if (!r.ok) continue;
          const j = await r.json();
          const arr = (j.itemProperty ?? []) as any[];
          let synthId = 9_000_000;
          for (const p of arr) {
            const inner =
              Array.isArray(p.entries) &&
              p.entries[0] &&
              typeof p.entries[0] === "object"
                ? p.entries[0]
                : null;
            const cn = (p as any).name ?? inner?.name ?? "";
            const en =
              (p as any).ENG_name ??
              inner?.ENG_name ??
              (p as any).abbreviation ??
              "";
            if (!cn && !en) continue;
            const dedupeKey = `${cn}|${en}|prop`;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
            merged.x.push({
              id: synthId++,
              c: 58,
              s: (p as any).source ?? "",
              n: en,
              cn,
            } as any);
          }
          break;
        } catch {}
      }
    } catch {}
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({ ts: Date.now(), data: merged }),
      );
    } catch {}
    return merged;
  })();
  loading.set(cacheKey, p);
  try {
    const idx = await p;
    memIndex.set(cacheKey, idx);
    return idx;
  } finally {
    loading.delete(cacheKey);
  }
}

/** Fetch `paths` (relative to `<base>/data/`) from EVERY enabled
 *  library in parallel and merge `json[key]`, first row per
 *  (ENG_name|source) winning. Callers pass every filename case variant
 *  they want tried (kiwee lowercase, GitHub-hosted homebrew original /
 *  uppercase). `okCount` = how many fetches returned 200. */
export async function fetchLibraryData(
  paths: Iterable<string>,
  key: string,
  onResponse?: (url: string, status: number) => void,
): Promise<{ rows: any[]; okCount: number }> {
  const bases = getEnabledLibraryBases();
  const list = [...new Set(paths)];
  let okCount = 0;
  const responses = await Promise.all(
    bases.flatMap((base) =>
      list.map(async (path) => {
        try {
          const res = await fetch(`${base}/data/${path}`, {
            cache: "no-cache",
          });
          onResponse?.(`${base}/data/${path}`, res.status);
          if (!res.ok) return null;
          okCount++;
          const json = await res.json();
          return (json[key] ?? []) as any[];
        } catch {
          return null;
        }
      }),
    ),
  );
  const rows: any[] = [];
  const seen = new Set<string>();
  for (const arr of responses) {
    if (!arr) continue;
    for (const e of arr) {
      const k = `${(e.ENG_name || e.name || (e as any).caption || "").toLowerCase()}|${(e.source || "").toUpperCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push(e);
    }
  }
  return { rows, okCount };
}

/** Changes whenever the enabled libraries, their index paths, their
 *  disabled sources or the local content change — for callers that
 *  keep their own caches on top of this module. */
export function libraryConfigSignature(): string {
  return (
    getEnabledLibrarySources()
      .map((l) => `${l.base}|${l.indexPath}|${[...l.disabledSources].sort().join(",")}`)
      .join("||") + `#${getLocalContentSignature()}`
  );
}
