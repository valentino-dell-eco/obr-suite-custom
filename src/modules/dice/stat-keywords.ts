// Stat keywords in a dice expression, resolved against a token's
// character card ("Chara") or bestiary monster ("Form").
//
//   save(dex)            → 1d20 + Dexterity save bonus
//   check(wis)           → 1d20 + Wisdom modifier
//   check(wis,perception)→ 1d20 + Wisdom modifier + proficiency part
//                          (monster: its listed Perception bonus)
//   str dex con int wis cha → ability modifier
//   prof / exp / jat     → proficiency bonus / ×2 / half (rounded down)
//
// Used by the quick roll modal (dice-quick-popup.html): the expression
// is expanded to plain dice + numbers before it's sent, so the roll
// pipeline doesn't change. Same keywords as the dice panel
// (panel-page.ts → parseExpr).
import OBR from "@owlbear-rodeo/sdk";
import { cardDataUrl } from "../characterCards/backend";

export type StatSourceKind = "chara" | "form";

export interface StatSources {
  card: any | null;
  monster: any | null;
}

const CC_BOUND_KEY = "com.character-cards/boundCardId";
const BESTIARY_SLUG_KEY = "com.bestiary/slug";
const BESTIARY_DATA_KEY = "com.bestiary/monsters";
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
type Ability = (typeof ABILITIES)[number];

const ABILITY_ALIASES: Record<string, Ability> = {
  str: "str", strength: "str", 力量: "str", 力: "str",
  dex: "dex", dexterity: "dex", 敏捷: "dex", 敏: "dex",
  con: "con", constitution: "con", 体质: "con", 体: "con",
  int: "int", intelligence: "int", 智力: "int", 智: "int",
  wis: "wis", wisdom: "wis", 感知: "wis", 感: "wis",
  cha: "cha", charisma: "cha", 魅力: "cha", 魅: "cha",
};

const SKILL_ALIASES: Record<string, string> = {
  acro: "acrobatics", 敏捷运动: "acrobatics",
  animal: "animal handling", animalhandling: "animal handling", 驯兽: "animal handling",
  ath: "athletics", 运动: "athletics",
  欺瞒: "deception", 洞悉: "insight", 恐吓: "intimidation", 威吓: "intimidation",
  调查: "investigation", 察觉: "perception", 侦查: "perception",
  sleight: "sleight of hand", sleightofhand: "sleight of hand", 巧手: "sleight of hand",
  隐匿: "stealth",
};

const ABILITY_NAMES: Record<Ability, string> = {
  str: "Strength", dex: "Dexterity", con: "Constitution",
  int: "Intelligence", wis: "Wisdom", cha: "Charisma",
};

function abilityKey(raw: string): Ability | null {
  return ABILITY_ALIASES[raw.trim().toLowerCase()] ?? null;
}

function skillKey(raw: string): string {
  const k = raw.trim().toLowerCase();
  return SKILL_ALIASES[k] ?? k;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const m = /([+-]?\s*\d+)/.exec(v);
    if (m) return parseInt(m[1].replace(/\s+/g, ""), 10);
  }
  return null;
}

function modOf(score: unknown): number {
  const n = num(score);
  return n == null ? 0 : Math.floor((n - 10) / 2);
}

// --- Character card ---------------------------------------------------------

function cardProf(card: any): number {
  return num(card?.core_stats?.proficiency_bonus) ?? 0;
}

function cardMod(card: any, ab: Ability): number {
  const a = card?.abilities?.[ab] ?? {};
  return num(a.modifier) ?? modOf(a.total);
}

function cardSave(card: any, ab: Ability): number {
  const a = card?.abilities?.[ab] ?? {};
  const bonus = num(a?.save?.bonus);
  if (bonus != null) return bonus;
  return cardMod(card, ab) + (a?.save?.proficient ? cardProf(card) : 0);
}

/** Proficiency part of a card skill (+ misc bonus), without the ability. */
function cardSkillExtra(card: any, skill: string): number {
  const skills = card?.skills;
  if (!Array.isArray(skills)) return 0;
  const s = skills.find((x: any) => typeof x?.name === "string" && skillKey(x.name) === skill);
  if (!s) return 0;
  const prof = cardProf(card);
  let part = 0;
  if (typeof s.proficiency === "number") part = s.proficiency;
  else if (s.proficiency === "proficient") part = prof;
  else if (s.proficiency === "expertise") part = prof * 2;
  else if (s.proficiency === "half") part = Math.floor(prof / 2);
  return part + (num(s.misc_bonus) ?? 0);
}

// --- Bestiary monster (5etools data) -------------------------------------------

function crNumber(cr: unknown): number {
  const raw = typeof cr === "object" && cr ? (cr as any).cr : cr;
  const s = String(raw ?? "").trim();
  const frac = /^(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** 5e proficiency bonus by challenge rating. */
function monsterProf(m: any): number {
  const cr = crNumber(m?.cr);
  return cr < 1 ? 2 : Math.floor((cr - 1) / 4) + 2;
}

function monsterMod(m: any, ab: Ability): number {
  return modOf(m?.[ab]);
}

function monsterSave(m: any, ab: Ability): number {
  return num(m?.save?.[ab]) ?? monsterMod(m, ab);
}

/** Listed skill bonus (ability included), or null. */
function monsterSkill(m: any, skill: string): number | null {
  const skills = m?.skill;
  if (!skills || typeof skills !== "object") return null;
  for (const [k, v] of Object.entries(skills)) {
    if (skillKey(k) === skill) return num(v);
  }
  return null;
}

// --- Loading ------------------------------------------------------------------

/** The character card and/or bestiary monster bound to a token. */
export async function loadStatSources(itemId: string | null): Promise<StatSources> {
  const out: StatSources = { card: null, monster: null };
  if (!itemId) return out;
  let meta: Record<string, unknown> = {};
  try {
    const [item] = await OBR.scene.items.getItems([itemId]);
    meta = (item?.metadata as Record<string, unknown>) ?? {};
  } catch {
    return out;
  }
  const cardId = typeof meta[CC_BOUND_KEY] === "string" ? (meta[CC_BOUND_KEY] as string) : "";
  const slug = typeof meta[BESTIARY_SLUG_KEY] === "string" ? (meta[BESTIARY_SLUG_KEY] as string) : "";
  await Promise.all([
    (async () => {
      if (!cardId) return;
      try {
        const roomId = (OBR.room?.id || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
        const res = await fetch(cardDataUrl(roomId, cardId));
        if (res.ok) out.card = await res.json();
      } catch {}
    })(),
    (async () => {
      if (!slug) return;
      try {
        const sceneMeta = await OBR.scene.getMetadata();
        const table = sceneMeta[BESTIARY_DATA_KEY] as Record<string, any> | undefined;
        out.monster = table?.[slug] ?? null;
      } catch {}
    })(),
  ]);
  return out;
}

// --- Expansion ----------------------------------------------------------------

const WRAP_RE = /(save|check)\s*[(（]([^()（）]*)[)）]/gi;
const WORD_RE = /([+\-]?)\s*(?<![\w])(str|dex|con|int|wis|cha|prof|exp|jat)(?![\w])/gi;

/** True when the expression uses any stat keyword. */
export function hasStatKeywords(expr: string): boolean {
  WRAP_RE.lastIndex = 0;
  WORD_RE.lastIndex = 0;
  const yes = WRAP_RE.test(expr) || WORD_RE.test(expr);
  WRAP_RE.lastIndex = 0;
  WORD_RE.lastIndex = 0;
  return yes;
}

function signed(n: number): string {
  return n < 0 ? `-${Math.abs(n)}` : `+${n}`;
}

/** Replace the stat keywords with numbers from `source` (a card when
 *  kind = "chara", a 5etools monster when kind = "form"). Returns the
 *  plain expression and a readable note ("Dexterity Save", …). */
export function expandStatKeywords(
  expr: string,
  source: any,
  kind: StatSourceKind,
): { expression: string; note: string } {
  const notes: string[] = [];
  const isCard = kind === "chara";
  const prof = isCard ? cardProf(source) : monsterProf(source);
  const mod = (ab: Ability) => (isCard ? cardMod(source, ab) : monsterMod(source, ab));

  let out = expr.replace(WRAP_RE, (_m, fn: string, inner: string) => {
    const args = inner.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    const ab = args[0] ? abilityKey(args[0]) : null;
    if (!ab) return "1d20";
    if (fn.toLowerCase() === "save") {
      notes.push(`${ABILITY_NAMES[ab]} Save`);
      return `1d20${signed(isCard ? cardSave(source, ab) : monsterSave(source, ab))}`;
    }
    const skill = args[1] ? skillKey(args[1]) : "";
    let bonus = mod(ab);
    if (skill) {
      if (isCard) bonus += cardSkillExtra(source, skill);
      else bonus = monsterSkill(source, skill) ?? bonus;
      notes.push(`${ABILITY_NAMES[ab]} (${skill.replace(/\b\w/g, (c) => c.toUpperCase())})`);
    } else {
      notes.push(`${ABILITY_NAMES[ab]} Check`);
    }
    return `1d20${signed(bonus)}`;
  });

  out = out.replace(WORD_RE, (_m, sign: string, word: string) => {
    const w = word.toLowerCase();
    let v = 0;
    if (w === "prof") v = prof;
    else if (w === "exp") v = prof * 2;
    else if (w === "jat") v = Math.floor(prof / 2);
    else v = mod(w as Ability);
    if (sign === "-") v = -v;
    return signed(v);
  });

  out = out.replace(/\s+/g, "").replace(/^\+/, "");
  return { expression: out, note: notes.join(", ") };
}
