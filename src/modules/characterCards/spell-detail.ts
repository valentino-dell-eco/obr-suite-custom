// Spell detail resolution for the character card / room chat.
//
// The card itself stores only { name, level } per spell, PLUS any
// fields the user has hand-edited (school / casting_time / range /
// components / duration / description). Whenever one of those is
// edited the spell's `source` is silently flipped to "Homebrew".
// Everything the card does NOT store comes from the content library,
// looked up by name — this module does that lookup and merges the two
// (stored override wins, field by field).
//
// Which spells / sources are reachable is decided by spell-library.ts,
// which mirrors the global search bar's rules (enabled libraries,
// per-library disabled sources, local content, Data Version).

import { getState, getLocalLang, whenStateReady } from "../../state";
import { stripTagsToText } from "../dice/tags";
import {
  findSpellRefs,
  fetchSpellRow,
  passesVersion,
  type SpellRef,
} from "./spell-library";
import { libraryConfigSignature } from "../../utils/libraryIndex";


export const HOMEBREW_SOURCE = "Homebrew";

export interface SpellFields {
  school: string;
  casting_time: string;
  range: string;
  components: string;
  duration: string;
}
export const SPELL_FIELD_KEYS: Array<keyof SpellFields> = [
  "school",
  "casting_time",
  "range",
  "components",
  "duration",
];

export interface SpellDetail {
  fields: SpellFields;
  description: string;
  /** "school · time · range · components · duration", empty parts skipped. */
  meta: string;
  /** True when the spell forces a saving throw (so a DC applies). */
  hasSave: boolean;
  /** Library source code (e.g. "PHB"), or "Homebrew" once edited. */
  source: string;
  /** False when the library had nothing and only stored fields exist. */
  fromLibrary: boolean;
  /** Library source the non-edited fields came from (e.g. "PHB"). */
  libSource: string;
  /** Every library source this spell exists in (uppercase codes). */
  sources: string[];
  /** Main text and "At Higher Levels" text, separately (upcasting
   *  rewrites dice in the body only). */
  body: string;
  higher: string;
  /** The user replaced the description — scaling rules don't apply. */
  descOverridden: boolean;
  slotScaling: SlotScaling[];
  charScaling: CharScaling[];
}

// --- Plain-text entry renderer (5etools "entries" structure) ---

function entryToText(e: any): string {
  if (e == null) return "";
  if (typeof e === "string") return stripTagsToText(e);
  if (typeof e !== "object") return "";
  const type = e.type ?? "entries";
  if (type === "list") {
    return (e.items || []).map((it: any) => `• ${entryToText(it)}`).join("\n");
  }
  if (type === "entries" || type === "section") {
    const head = e.name ? `${stripTagsToText(e.name)}\n` : "";
    return head + (e.entries || []).map(entryToText).join("\n");
  }
  if (type === "item" || type === "itemSub") {
    const name = e.name ? `${stripTagsToText(e.name)}. ` : "";
    const body = e.entries
      ? (e.entries as any[]).map(entryToText).join(" ")
      : e.entry
        ? entryToText(e.entry)
        : "";
    return name + body;
  }
  if (e.entries) return (e.entries as any[]).map(entryToText).join("\n");
  return "";
}

function formatBody(spell: any): string {
  return (spell.entries || []).map(entryToText).join("\n\n");
}
function formatHigher(spell: any, en: boolean): string {
  const higher = spell.entriesHigherLevel;
  if (!Array.isArray(higher) || !higher.length) return "";
  const heading = en ? "At Higher Levels" : "升环效果";
  return `${heading}. ${higher.map(entryToText).join("\n")}`;
}
function joinDescription(body: string, higher: string): string {
  return body + (body && higher ? "\n\n" : "") + higher;
}

// --- Upcast / cantrip scaling (from the raw 5etools data) ---

/** Slot upcasting: `{@scaledamage BASE|LEVELS|PER}` / `{@scaledice …}`
 *  in entriesHigherLevel — at slot level L the expression BASE becomes
 *  BASE + PER × (L − first level of LEVELS). */
export interface SlotScaling {
  base: string;
  per: string;
  from: number;
}
/** Cantrip scaling by CHARACTER level (scalingLevelDice): sorted
 *  [minCharLevel, expression] steps; steps[0] is the base expression. */
export type CharScaling = Array<[number, string]>;

function parseSlotScaling(spell: any): SlotScaling[] {
  const out: SlotScaling[] = [];
  const raw = JSON.stringify(spell.entriesHigherLevel ?? []);
  const re = /\{@scale(?:damage|dice) ([^|{}]+)\|([^|{}]+)\|([^|{}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const base = m[1].trim();
    const per = m[3].trim();
    const levels = (m[2].match(/\d+/g) || []).map(Number);
    if (!base || !per || base.includes(";") || !levels.length) continue;
    if (!out.some((r) => r.base === base && r.per === per)) {
      out.push({ base, per, from: Math.min(...levels) });
    }
  }
  return out;
}

function parseCharScaling(spell: any): CharScaling[] {
  const src = spell.scalingLevelDice;
  const list = Array.isArray(src) ? src : src ? [src] : [];
  const out: CharScaling[] = [];
  for (const item of list) {
    const steps = Object.entries(item?.scaling ?? {})
      .map(([lv, expr]) => [parseInt(lv, 10), String(expr).trim()] as [number, string])
      .filter(([lv, expr]) => Number.isFinite(lv) && expr)
      .sort((a, b) => a[0] - b[0]);
    if (steps.length > 1) out.push(steps);
  }
  return out;
}

// --- Compact field formatters ---

const SCHOOLS_ZH: Record<string, string> = {
  A: "防护", C: "咒法", D: "预言", E: "附魔", V: "塑能",
  I: "幻术", N: "死灵", T: "变化",
};
const SCHOOLS_EN: Record<string, string> = {
  A: "Abjuration", C: "Conjuration", D: "Divination", E: "Enchantment",
  V: "Evocation", I: "Illusion", N: "Necromancy", T: "Transmutation",
};

function schoolStr(code: any, en: boolean): string {
  if (typeof code !== "string") return "";
  return (en ? SCHOOLS_EN : SCHOOLS_ZH)[code] ?? code;
}

const UNIT_EN: Record<string, string> = {
  action: "action", bonus: "bonus action", reaction: "reaction",
  round: "round", minute: "minute", hour: "hour", day: "day",
};
const UNIT_ZH: Record<string, string> = {
  action: "动作", bonus: "附赠动作", reaction: "反应",
  round: "轮", minute: "分钟", hour: "小时", day: "天",
};

// "1 minute" / "10 minutes", "2 bonus actions". Chinese has no plural.
function plural(unit: string, n: number, en: boolean): string {
  return en && n !== 1 && unit && !unit.endsWith("s") ? `${unit}s` : unit;
}

function timeStr(time: any, en: boolean): string {
  if (!Array.isArray(time)) return "";
  const units = en ? UNIT_EN : UNIT_ZH;
  return time
    .map((t: any) => {
      const n = t?.number ?? 1;
      return `${n} ${plural(units[t?.unit] ?? t?.unit ?? "", n, en)}`;
    })
    .join(en ? " or " : " 或 ");
}

function rangeStr(range: any, en: boolean): string {
  if (!range) return "";
  if (typeof range === "string") return range;
  const type = range.type;
  if (type === "point") {
    const d = range.distance;
    if (!d) return "";
    if (d.type === "self") return en ? "Self" : "自身";
    if (d.type === "touch") return en ? "Touch" : "触碰";
    if (d.type === "sight") return en ? "Sight" : "视距";
    if (d.type === "unlimited") return en ? "Unlimited" : "无限";
    if (d.type === "feet") return en ? `${d.amount} ft` : `${d.amount} 英尺`;
    if (d.type === "miles") return en ? `${d.amount} mi` : `${d.amount} 英里`;
    return "";
  }
  const shapeEn: Record<string, string> = {
    radius: "radius", sphere: "sphere", cone: "cone", line: "line",
    cube: "cube", hemisphere: "hemisphere", cylinder: "cylinder",
  };
  const shapeZh: Record<string, string> = {
    radius: "半径", sphere: "球体", cone: "锥形", line: "直线",
    cube: "立方体", hemisphere: "半球", cylinder: "圆柱",
  };
  if (type in shapeEn) {
    const d = range.distance;
    const amt = d?.amount ?? "?";
    const unit = d?.type === "miles" ? (en ? "mi" : "英里") : en ? "ft" : "英尺";
    return en ? `${amt}-${unit} ${shapeEn[type]}` : `${amt} ${unit}${shapeZh[type]}`;
  }
  return "";
}

function componentsStr(c: any): string {
  if (!c) return "";
  const parts: string[] = [];
  if (c.v) parts.push("V");
  if (c.s) parts.push("S");
  if (c.m) {
    const mat = typeof c.m === "string" ? c.m : c.m?.text;
    parts.push(mat ? `M (${stripTagsToText(String(mat))})` : "M");
  }
  return parts.join(", ");
}

function durationStr(d: any, en: boolean): string {
  if (!Array.isArray(d) || !d.length) return "";
  const x = d[0];
  const units = en ? UNIT_EN : UNIT_ZH;
  let base = "";
  if (x.type === "instant") base = en ? "Instantaneous" : "即时";
  else if (x.type === "permanent") base = en ? "Until dispelled" : "直到被驱散";
  else if (x.type === "timed" && x.duration) {
    const n = x.duration.amount ?? 1;
    base = `${n} ${plural(units[x.duration.type] ?? x.duration.type ?? "", n, en)}`;
  } else if (x.type === "special") base = en ? "Special" : "特殊";
  if (x.concentration) {
    base = en ? `Concentration, up to ${base}` : `专注，最长 ${base}`;
  }
  return base;
}

export function composeMeta(f: Partial<SpellFields>): string {
  return SPELL_FIELD_KEYS.map((k) => (f[k] || "").trim())
    .filter(Boolean)
    .join(" · ");
}

// --- Library lookup (cached per language + name) ---

interface LibSpell {
  fields: SpellFields;
  description: string;
  body: string;
  higher: string;
  slotScaling: SlotScaling[];
  charScaling: CharScaling[];
  saveFlag: boolean;
  source: string;
  sources: string[];
}


/** Library sources a spell exists in (uppercase codes), library
 *  order, honoring each library's disabled-sources blacklist. */
export async function listSpellSources(name: string): Promise<string[]> {
  try {
    return [...new Set((await findSpellRefs(name)).map((r) => r.code))];
  } catch {
    return [];
  }
}

function pickRef(refs: SpellRef[], preferred?: string): SpellRef | undefined {
  const want = (preferred || "").toUpperCase();
  return (
    (want && refs.find((r) => r.code === want)) ||
    refs.find((r) => passesVersion(r.code)) ||
    refs[0]
  );
}

async function fetchLibSpell(
  name: string,
  en: boolean,
  preferred?: string,
): Promise<LibSpell | null> {
  const refs = await findSpellRefs(name);
  if (!refs.length) {
    console.warn(`[spell-detail] "${name}" not found in any enabled library / source`);
    return null;
  }
  const codes = [...new Set(refs.map((r) => r.code))];
  const first = pickRef(refs, preferred)!;
  // Chosen source first, then the rest as fallbacks (a source may be
  // listed in the index but its data file missing on this host).
  for (const ref of [first, ...refs.filter((r) => r !== first)]) {
    const sp = await fetchSpellRow(ref);
    if (!sp) continue;
    return {
      fields: {
        school: schoolStr(sp.school, en),
        casting_time: timeStr(sp.time, en),
        range: rangeStr(sp.range, en),
        components: componentsStr(sp.components),
        duration: durationStr(sp.duration, en),
      },
      body: formatBody(sp),
      higher: formatHigher(sp, en),
      description: joinDescription(formatBody(sp), formatHigher(sp, en)),
      slotScaling: parseSlotScaling(sp),
      charScaling: parseCharScaling(sp),
      saveFlag: Array.isArray(sp.savingThrow) && sp.savingThrow.length > 0,
      source: ref.code,
      sources: codes,
    };
  }
  console.warn(`[spell-detail] "${name}": data file missing for sources ${codes.join(", ")}`);
  return null;
}

const libCache = new Map<string, Promise<LibSpell | null>>();

function lookupLib(name: string, preferred?: string): Promise<LibSpell | null> {
  const en = getLocalLang() === "en";
  let dv = "";
  try { dv = String(getState().dataVersion ?? ""); } catch {}
  const key = `${libraryConfigSignature()}|${en ? "en" : "zh"}|${dv}|${(preferred || "").toUpperCase()}|${name.trim().toLowerCase()}`;
  let p = libCache.get(key);
  if (!p) {
    p = fetchLibSpell(name, en, preferred);
    libCache.set(key, p);
    // Don't cache failures forever (offline now, online later).
    void p.then((v) => { if (!v) libCache.delete(key); });
  }
  return p;
}

/** Fields the card itself stores on a spell object. Also reads the
 *  legacy `meta{}` block older cards were saved with. */
export function readStoredSpell(spell: any): {
  fields: Partial<SpellFields>;
  description?: string;
  source?: string;
  /** Library source the user picked for this spell (edit mode). */
  libSource?: string;
} {
  const m = (spell && spell.meta) || {};
  const pick = (a: any, b: any): string | undefined => {
    const v = a ?? b;
    return typeof v === "string" && v.trim() ? v : undefined;
  };
  return {
    fields: {
      school: pick(spell?.school, m.school),
      casting_time: pick(spell?.casting_time, m.casting_time),
      range: pick(spell?.range, m.range),
      components: pick(spell?.components, m.components),
      duration: pick(spell?.duration, m.duration),
    },
    description: pick(spell?.description, undefined),
    source: pick(spell?.source, m.source),
    libSource: pick(spell?.lib_source, undefined),
  };
}

const SAVE_RE = /saving throw|豁免/i;

/** Library data merged with whatever the card stores (stored wins,
 *  field by field). Never throws; works even if the library is
 *  unreachable (then it's just the stored fields). */
export async function effectiveSpellDetail(spell: any): Promise<SpellDetail> {
  const name = String(spell?.name ?? "");
  // Cache keys below include the library config — wait for the real one.
  await whenStateReady();
  let lib: LibSpell | null = null;
  const st = readStoredSpell(spell);
  try { lib = name ? await lookupLib(name, st.libSource) : null; } catch {}
  const fields = {} as SpellFields;
  for (const k of SPELL_FIELD_KEYS) fields[k] = st.fields[k] ?? lib?.fields[k] ?? "";
  const description = st.description ?? lib?.description ?? "";
  // Library's structured flag is the reliable signal; fall back to a
  // text match only when the user replaced the description.
  // Either signal counts: the library's structured savingThrow list,
  // or the (possibly hand-edited / imported) description text.
  const hasSave = !!lib?.saveFlag || SAVE_RE.test(description);
  return {
    fields,
    description,
    meta: composeMeta(fields),
    hasSave,
    source: st.source ?? lib?.source ?? "",
    fromLibrary: !!lib,
    libSource: lib?.source ?? "",
    sources: lib?.sources ?? [],
    body: st.description ?? lib?.body ?? "",
    higher: st.description !== undefined ? "" : lib?.higher ?? "",
    descOverridden: st.description !== undefined,
    slotScaling: lib?.slotScaling ?? [],
    charScaling: lib?.charScaling ?? [],
  };
}
