// xlsx → character-card JSON, in the browser.
//
// Reads the suite's own SRD 5.1 sheet (public/SRD-5.1-Character-Sheet.xlsx): every value is reached through a workbook-level named
// range "cc.…" (the "conversion keys", listed on the sheet's Keys tab),
// so the converter doesn't depend on where the cells are. Single
// fields are one cell; table columns are column ranges, one entry per
// row with a name.
//
// Values come from the cells' cached results (Excel / LibreOffice /
// Google Sheets save them); derived numbers the sheet computes
// (modifiers, saves, skills, proficiency bonus…) are recomputed here
// when a cached value is missing.

import { readZipEntries, extractSharedStrings, xmlUnescape } from "./xlsx-shield-state";

export const SRD_TEMPLATE_ID = "KnU-SRD-5.1";

type Cell = string | number | boolean | null;

export class UnsupportedSheetError extends Error {}

function decode(b: Uint8Array | undefined): string {
  return b ? new TextDecoder("utf-8").decode(b) : "";
}

/** "AB12" → [col (1-based), row]. */
function parseRef(ref: string): [number, number] | null {
  const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(ref.trim());
  if (!m) return null;
  let c = 0;
  for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
  return [c, parseInt(m[2], 10)];
}

function colName(c: number): string {
  let s = "";
  while (c > 0) {
    const r = (c - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    c = Math.floor((c - 1) / 26);
  }
  return s;
}

interface Workbook {
  /** sheet name → (cell ref → value) */
  sheets: Map<string, Map<string, Cell>>;
  /** defined name → { sheet, refs (expanded, in order) } */
  names: Map<string, { sheet: string; refs: string[] }>;
}

function parseSheet(xml: string, shared: string[]): Map<string, Cell> {
  const out = new Map<string, Cell>();
  const re = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attr = m[1] || "";
    const body = m[2] || "";
    const ref = /\br="([A-Z]+\d+)"/.exec(attr)?.[1];
    if (!ref) continue;
    const t = /\bt="([^"]+)"/.exec(attr)?.[1] || "n";
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    let val: Cell = null;
    if (t === "s") {
      const i = Number(v);
      val = Number.isInteger(i) ? shared[i] ?? null : null;
    } else if (t === "inlineStr") {
      const parts = Array.from(body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)).map((x) => xmlUnescape(x[1]));
      val = parts.join("");
    } else if (t === "str") {
      val = v != null ? xmlUnescape(v) : null;
    } else if (t === "b") {
      val = v === "1";
    } else if (t === "e") {
      val = null;
    } else if (v != null && v !== "") {
      const n = Number(v);
      val = Number.isFinite(n) ? n : xmlUnescape(v);
    }
    out.set(ref, val);
  }
  return out;
}

function expandRange(a: string, b?: string): string[] {
  const p = parseRef(a);
  if (!p) return [];
  const q = b ? parseRef(b) : p;
  if (!q) return [];
  const refs: string[] = [];
  for (let r = Math.min(p[1], q[1]); r <= Math.max(p[1], q[1]); r++) {
    for (let c = Math.min(p[0], q[0]); c <= Math.max(p[0], q[0]); c++) refs.push(`${colName(c)}${r}`);
  }
  return refs;
}

async function readWorkbook(file: Blob | ArrayBuffer | Uint8Array): Promise<Workbook> {
  const entries = await readZipEntries(file);
  const wbXml = decode(entries.get("xl/workbook.xml"));
  if (!wbXml) throw new UnsupportedSheetError("not an xlsx workbook");
  const relsXml = decode(entries.get("xl/_rels/workbook.xml.rels"));
  const rels = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }
  const shared = extractSharedStrings(decode(entries.get("xl/sharedStrings.xml")));
  const sheets = new Map<string, Map<string, Cell>>();
  for (const m of wbXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const name = xmlUnescape(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? "");
    const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1] ?? "";
    const target = rels.get(rid);
    if (!name || !target) continue;
    sheets.set(name, parseSheet(decode(entries.get(`xl/${target}`)), shared));
  }
  const names = new Map<string, { sheet: string; refs: string[] }>();
  for (const m of wbXml.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)) {
    if (/\blocalSheetId=/.test(m[1])) continue;
    const name = /\bname="([^"]+)"/.exec(m[1])?.[1];
    if (!name || !name.startsWith("cc.")) continue;
    const text = xmlUnescape(m[2]).trim();
    const mm = /^(?:'((?:[^']|'')+)'|([^!]+))!(\$?[A-Z]+\$?\d+)(?::(\$?[A-Z]+\$?\d+))?$/.exec(text);
    if (!mm) continue;
    const sheet = (mm[1] ?? mm[2]).replace(/''/g, "'");
    names.set(name, { sheet, refs: expandRange(mm[3], mm[4]) });
  }
  return { sheets, names };
}

/** True when the file is the suite's SRD sheet (has the cc.* keys). */
export async function isSrdSheet(file: Blob | ArrayBuffer | Uint8Array): Promise<boolean> {
  try {
    const wb = await readWorkbook(file);
    return wb.names.has("cc.meta.template");
  } catch {
    return false;
  }
}

// --- value helpers -----------------------------------------------------------

function str(v: Cell): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v).trim();
}

function num(v: Cell): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const n = Number(String(v).replace(/^\+/, "").trim());
  return Number.isFinite(n) ? n : null;
}

function bool(v: Cell): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return /^(yes|y|true|1|x|✓|equipped)$/i.test(str(v));
}

function signed(n: number | null): string | undefined {
  if (n == null) return undefined;
  return n >= 0 ? `+${n}` : String(n);
}

function list(v: Cell): string[] {
  return str(v)
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const ABIL = ["str", "dex", "con", "int", "wis", "cha"] as const;
const SPELL_LEVELS = 9;

export interface ConvertOptions {
  fileName?: string;
}

/** Convert the SRD sheet to the suite's card JSON (schema 0.3). */
export async function srdSheetToCard(
  file: Blob | ArrayBuffer | Uint8Array,
  opts: ConvertOptions = {},
): Promise<Record<string, any>> {
  const wb = await readWorkbook(file);
  if (!wb.names.has("cc.meta.template")) {
    throw new UnsupportedSheetError("this xlsx is not the suite's SRD 5.1 character sheet (no cc.* keys)");
  }
  const cells = (name: string): Cell[] => {
    const n = wb.names.get(name);
    if (!n) return [];
    const sh = wb.sheets.get(n.sheet);
    return n.refs.map((r) => sh?.get(r) ?? null);
  };
  const one = (name: string): Cell => cells(name)[0] ?? null;
  /** Rows of a table: zips the given columns; keeps rows whose `key` column is filled. */
  const rows = (prefix: string, fields: string[], key = "name"): Array<Record<string, Cell>> => {
    const cols = Object.fromEntries(fields.map((f) => [f, cells(`${prefix}.${f}`)]));
    const n = cols[key]?.length ?? 0;
    const out: Array<Record<string, Cell>> = [];
    for (let i = 0; i < n; i++) {
      if (!str(cols[key][i])) continue;
      out.push(Object.fromEntries(fields.map((f) => [f, cols[f]?.[i] ?? null])));
    }
    return out;
  };

  // Identity
  const subrace = str(one("cc.identity.race.subrace"));
  const identity = {
    character_name: str(one("cc.identity.character_name")),
    display_name: str(one("cc.identity.display_name")) || str(one("cc.identity.character_name")),
    player: str(one("cc.identity.player")),
    race: { name: str(one("cc.identity.race.name")), subrace: subrace || null },
    alignment: str(one("cc.identity.alignment")),
    faith: str(one("cc.identity.faith")),
    age: num(one("cc.identity.age")) ?? (str(one("cc.identity.age")) || null),
    gender: str(one("cc.identity.gender")),
    height: str(one("cc.identity.height")),
    weight: str(one("cc.identity.weight")),
    hometown: str(one("cc.identity.hometown")),
    languages: list(one("cc.identity.languages")),
    tool_proficiencies: list(one("cc.identity.tool_proficiencies")),
  };

  // Classes / level
  const classes = rows("cc.classes", ["name", "subclass", "level"]).map((r, i) => ({
    role: i === 0 ? "main" : "multiclass",
    name: str(r.name),
    subclass: str(r.subclass) || null,
    level: num(r.level) ?? 1,
  }));
  const totalLevel = num(one("cc.total_level")) || classes.reduce((a, c) => a + c.level, 0) || 1;
  const profBonus = num(one("cc.core_stats.proficiency_bonus")) ?? Math.floor((totalLevel - 1) / 4) + 2;

  // Abilities
  const abilities: Record<string, any> = {};
  for (const k of ABIL) {
    const total = num(one(`cc.abilities.${k}.total`)) ?? 10;
    const modifier = num(one(`cc.abilities.${k}.modifier`)) ?? Math.floor((total - 10) / 2);
    const proficient = bool(one(`cc.abilities.${k}.save.proficient`));
    const bonus = num(one(`cc.abilities.${k}.save.bonus`)) ?? modifier + (proficient ? profBonus : 0);
    abilities[k] = { total, modifier, save: { proficient, bonus } };
  }
  const mod = (k: string) => abilities[k.toLowerCase()]?.modifier ?? 0;

  // Skills
  const skills = rows("cc.skills", ["name", "ability", "proficiency", "misc_bonus", "total"]).map((r) => {
    const ability = str(r.ability).toLowerCase();
    const p = str(r.proficiency).toLowerCase();
    const proficiency = p === "expertise" || p === "proficient" ? p : "none";
    const misc = num(r.misc_bonus);
    const mult = proficiency === "expertise" ? 2 : proficiency === "proficient" ? 1 : 0;
    const total = num(r.total) ?? mod(ability) + profBonus * mult + (misc ?? 0);
    return { name: str(r.name), ability, proficiency, total, ...(misc ? { misc_bonus: misc } : {}) };
  });
  const perception = skills.find((s) => s.name.toLowerCase() === "perception");

  // Spellcasting ability / DC
  const spellAbility = str(one("cc.spellcasting.spellcasting_ability")).toLowerCase();
  const dc = num(one("cc.spellcasting.save_dc")) ?? (spellAbility ? 8 + profBonus + mod(spellAbility) : null);
  const spellAttack = num(one("cc.spellcasting.attack_bonus")) ?? (spellAbility ? profBonus + mod(spellAbility) : null);

  // Core stats
  const hpMax = num(one("cc.core_stats.hp.max")) ?? 0;
  const hdMax = num(one("cc.core_stats.hit_dice.max")) ?? totalLevel;
  const core_stats: Record<string, any> = {
    proficiency_bonus: profBonus,
    initiative: num(one("cc.core_stats.initiative")) ?? mod("dex"),
    ac: num(one("cc.core_stats.ac")) ?? 10 + mod("dex"),
    ...(dc != null ? { dc, dc_ability: spellAbility } : {}),
    passive_perception: num(one("cc.core_stats.passive_perception")) ?? 10 + (perception?.total ?? mod("wis")),
    speed: num(one("cc.core_stats.speed")) ?? 30,
    size: str(one("cc.core_stats.size")) || "Medium",
    hp: {
      current: num(one("cc.core_stats.hp.current")) ?? hpMax,
      max: hpMax,
      temp: num(one("cc.core_stats.hp.temp")) ?? 0,
    },
    hit_dice: {
      current: num(one("cc.core_stats.hit_dice.current")) ?? hdMax,
      max: hdMax,
      die_size: str(one("cc.core_stats.hit_dice.die_size")) || "d8",
    },
  };

  // Combat
  const armorName = str(one("cc.combat.armor.name"));
  const combat: Record<string, any> = {
    armor: armorName
      ? {
          name: armorName,
          ac_base: num(one("cc.combat.armor.ac_base")) ?? undefined,
          equipped: bool(one("cc.combat.armor.equipped")),
          attuned: bool(one("cc.combat.armor.attuned")),
        }
      : { equipped: false, attuned: false },
    shield: {
      ac_bonus: num(one("cc.combat.shield.ac_bonus")) ?? 0,
      equipped: bool(one("cc.combat.shield.equipped")),
      attuned: bool(one("cc.combat.shield.attuned")),
    },
    weapons: rows("cc.combat.weapons", [
      "name", "proficient", "attack_bonus", "damage", "damage_type", "properties", "special_properties",
    ]).map((r) => {
      const atk = num(r.attack_bonus);
      return {
        name: str(r.name),
        proficient: bool(r.proficient),
        ...(atk != null ? { attack_bonus: signed(atk) } : str(r.attack_bonus) ? { attack_bonus: str(r.attack_bonus) } : {}),
        ...(str(r.damage) ? { damage: str(r.damage) } : {}),
        ...(str(r.damage_type) ? { damage_type: str(r.damage_type) } : {}),
        ...(str(r.properties) ? { properties: str(r.properties) } : {}),
        ...(str(r.special_properties) ? { special_properties: str(r.special_properties) } : {}),
      };
    }),
  };

  // Spells
  const slotMax = cells("cc.spellcasting.spell_slots.max");
  const slotCur = cells("cc.spellcasting.spell_slots.current");
  const spell_slots: Record<string, { current: number; max: number }> = {};
  for (let i = 0; i < SPELL_LEVELS; i++) {
    const max = num(slotMax[i] ?? null) ?? 0;
    if (max <= 0) continue;
    const cur = num(slotCur[i] ?? null);
    spell_slots[String(i + 1)] = { current: Math.max(0, Math.min(max, cur ?? max)), max };
  }
  const spellList = (key: string, fallbackLevel: number | null) =>
    rows(`cc.spellcasting.${key}`, ["name", "level"]).map((r) => ({
      name: str(r.name),
      level: num(r.level) ?? fallbackLevel ?? 1,
    }));
  const spellcasting: Record<string, any> = {
    ...(spellAbility ? { spellcasting_ability: spellAbility } : {}),
    ...(dc != null ? { save_dc: dc } : {}),
    ...(spellAttack != null ? { attack_bonus: signed(spellAttack) } : {}),
    ...(Object.keys(spell_slots).length ? { spell_slots } : {}),
    special_resources: rows("cc.spellcasting.special_resources", ["name", "max", "reset", "die"]).map((r) => ({
      name: str(r.name),
      max: num(r.max) ?? 1,
      reset: /^sr$/i.test(str(r.reset)) ? "SR" : "LR",
      ...(str(r.die) ? { die: str(r.die) } : {}),
    })),
    cantrips_known: spellList("cantrips_known", 0),
    always_known: spellList("always_known", null),
    prepared: spellList("prepared", null),
  };

  // Features
  const feat = (key: string, withLevel = true) =>
    rows(`cc.features.${key}`, withLevel ? ["name", "level", "description"] : ["name", "description"]).map((r) => ({
      name: str(r.name),
      description: str(r.description),
      ...(withLevel ? { level: num(r.level) ?? 1 } : {}),
    }));
  const features = {
    class_features: feat("class_features"),
    race_features: feat("race_features"),
    feats: feat("feats"),
    fighting_style_feats: feat("fighting_style_feats", false),
    special_abilities: feat("special_abilities"),
  };

  // Background
  const background = {
    background_name: str(one("cc.background.background_name")),
    feature: str(one("cc.background.feature")),
    traits: str(one("cc.background.traits")),
    description: str(one("cc.background.description")),
    story: str(one("cc.background.story")),
  };

  // Inventory
  const items = rows("cc.inventory.items", ["name", "quantity", "weight", "location", "description"]).map((r) => ({
    name: str(r.name),
    quantity: num(r.quantity) ?? 1,
    weight: num(r.weight) ?? 0,
    location: str(r.location) || "Backpack",
    ...(str(r.description) ? { description: str(r.description) } : {}),
  }));
  const wallet: Record<string, number> = {};
  for (const k of ["cp", "sp", "ep", "gp", "pp"]) {
    const v = num(one(`cc.inventory.currency.wallet.${k}`));
    if (v != null) wallet[k] = v;
  }
  const strScore = abilities.str.total as number;
  const inventory = {
    encumbrance: {
      total_weight:
        num(one("cc.inventory.encumbrance.total_weight")) ??
        Math.round(items.reduce((a, i) => a + i.weight * i.quantity, 0) * 100) / 100,
      max_capacity: num(one("cc.inventory.encumbrance.max_capacity")) ?? strScore * 15,
    },
    items,
    currency: { wallet },
    wondrous_items: rows("cc.inventory.wondrous_items", ["name", "description"]).map((r) => ({
      name: str(r.name),
      description: str(r.description),
    })),
  };

  const defenses: Record<string, string[]> = {};
  for (const k of ["resistances", "immunities", "advantages", "disadvantages"]) {
    const v = list(one(`cc.defenses.${k}`));
    if (v.length) defenses[k] = v;
  }

  return {
    schema_version: "0.3",
    meta: {
      template_name: str(one("cc.meta.template")) || SRD_TEMPLATE_ID,
      template_version: "1",
      layout_version: str(one("cc.meta.layout_version")),
      source_file: opts.fileName ?? "",
      parsed_at: new Date().toISOString(),
    },
    identity,
    classes,
    total_level: totalLevel,
    abilities,
    core_stats,
    skills,
    combat,
    spellcasting,
    features,
    background,
    inventory,
    defenses,
  };
}
