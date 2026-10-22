// Echo Companion — the bestiary FORM of a character (Wild Shape,
// polymorph…), shown on the phone.
//
// In the suite a form is a bestiary monster bound to the character's
// token (com.bestiary/slug, monster data in the scene's
// com.bestiary/monsters table) — what the GM's "Bind to bestiary" does
// (bestiary/panel-page.ts → bindMonsterToTokens, card-bound branch: the
// card keeps HP / AC / initiative, only the slug changes). Dice can then
// roll with the form's stats ("Form" instead of "Chara").
//
// The form is bound in the suite only (the phone can't change it: it
// just sees it in the character's state, "Show form stats"). Here the
// GM's suite also SAVES it with the card on the backend
// (/companion/forms/{card}), so it follows the character from scene to
// scene:
//   • a card-bound token appears without a form but the card has one
//     → the form is put back on it;
//   • the GM binds / changes / removes the form in the suite → the saved
//     form follows (the token is the truth once it has been seen).
// Everything needs the GM in the room (this runs in the GM's browser).

import OBR from "@owlbear-rodeo/sdk";
import { CC_ORIGIN } from "../characterCards/backend";
import { getRawMonster, loadAllMonsters } from "../bestiary/data";
import { readSecret, roomKey } from "./shared";

const SLUG_KEY = "com.bestiary/slug";
const DATA_KEY = "com.bestiary/monsters";
const OVERRIDE_KEY = "com.obr-suite/bubbles/monster-override";
const CC_BIND_KEY = "com.character-cards/boundCardId";

/** What the phone shows of a form. */
export interface FormInfo {
  slug: string;
  name: string;
  source: string;
  cr: string;
  size: string;
  type: string;
  ac: number | null;
  hp: number | null;
  speed: string;
  abilities: Record<"str" | "dex" | "con" | "int" | "wis" | "cha", number | null>;
}

const SIZES: Record<string, string> = { T: "Tiny", S: "Small", M: "Medium", L: "Large", H: "Huge", G: "Gargantuan" };

function numOr(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

/** A 5etools monster → the short summary sent to the phone. */
export function summarizeMonster(slug: string, m: any): FormInfo {
  const ac0 = Array.isArray(m?.ac) ? m.ac[0] : m?.ac;
  const ac = numOr(typeof ac0 === "object" && ac0 ? ac0.ac : ac0);
  const hp = numOr(m?.hp?.average ?? m?.hp);
  const speed = m?.speed && typeof m.speed === "object"
    ? Object.entries(m.speed as Record<string, unknown>)
        .map(([k, v]) => {
          const n = typeof v === "object" && v ? (v as any).number : v;
          return typeof n === "number" ? (k === "walk" ? `${n} ft.` : `${k} ${n} ft.`) : "";
        })
        .filter(Boolean)
        .join(", ")
    : "";
  const t = m?.type;
  const type = typeof t === "string" ? t : typeof t?.type === "string" ? t.type : "";
  const cr = typeof m?.cr === "object" && m.cr ? String(m.cr.cr ?? "") : String(m?.cr ?? "");
  const size = Array.isArray(m?.size) ? m.size.map((s: string) => SIZES[s] ?? s).join("/") : "";
  return {
    slug,
    name: String(m?.name || m?.ENG_name || slug.split("::")[1] || slug),
    source: String(m?.source ?? slug.split("::")[0] ?? ""),
    cr,
    size,
    type,
    ac,
    hp,
    speed,
    abilities: {
      str: numOr(m?.str),
      dex: numOr(m?.dex),
      con: numOr(m?.con),
      int: numOr(m?.int),
      wis: numOr(m?.wis),
      cha: numOr(m?.cha),
    },
  };
}

/** The form on a token right now, or null. */
export async function formOfToken(itemId: string): Promise<FormInfo | null> {
  try {
    const [item] = await OBR.scene.items.getItems([itemId]);
    const slug = (item?.metadata as any)?.[SLUG_KEY];
    if (typeof slug !== "string" || !slug) return null;
    const table = ((await OBR.scene.getMetadata())[DATA_KEY] as Record<string, any> | undefined) ?? {};
    const m = table[slug] ?? getRawMonster(slug);
    return m ? summarizeMonster(slug, m) : { ...summarizeMonster(slug, {}), name: slug.split("::")[1] ?? slug };
  } catch {
    return null;
  }
}

// --- Backend (saved with the card) ---------------------------------------------

interface SavedForm {
  slug: string;
  name: string;
  monster?: any;
}

/** Saved form per card: undefined = not read yet this session. */
const saved = new Map<string, SavedForm | null>();

function formsUrl(card: string): string {
  return `${CC_ORIGIN}/companion/forms/${encodeURIComponent(card)}?room=${encodeURIComponent(roomKey())}`;
}

async function readSaved(card: string): Promise<SavedForm | null> {
  if (saved.has(card)) return saved.get(card) ?? null;
  const secret = readSecret(roomKey());
  if (!secret || !CC_ORIGIN) return null;
  try {
    const res = await fetch(formsUrl(card), { headers: { "X-Room-Secret": secret }, cache: "no-store" });
    if (!res.ok) return null;
    const f = ((await res.json()) as { form?: SavedForm | null }).form ?? null;
    saved.set(card, f);
    return f;
  } catch {
    return null;
  }
}

async function writeSaved(card: string, f: SavedForm | null): Promise<void> {
  const secret = readSecret(roomKey());
  if (!secret || !CC_ORIGIN) return;
  saved.set(card, f);
  try {
    if (f) {
      await fetch(formsUrl(card), {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Room-Secret": secret },
        body: JSON.stringify(f),
      });
    } else {
      await fetch(formsUrl(card), { method: "DELETE", headers: { "X-Room-Secret": secret } });
    }
  } catch (e) {
    console.warn("[obr-suite/companion] saving the form failed", e);
  }
}

// --- On the token -------------------------------------------------------------------

/** Bind `slug` to the token like the bestiary picker does for a
 *  card-bound token: the monster goes in the scene table, the token gets
 *  the slug, the card keeps HP / AC / initiative. */
async function bindToken(itemId: string, slug: string, monster: any): Promise<void> {
  if (monster) {
    const meta = await OBR.scene.getMetadata();
    const table = { ...((meta[DATA_KEY] as Record<string, any>) || {}) };
    table[slug] = monster;
    await OBR.scene.setMetadata({ [DATA_KEY]: table });
  }
  await OBR.scene.items.updateItems([itemId], (drafts) => {
    for (const d of drafts) {
      (d.metadata as any)[SLUG_KEY] = slug;
      delete (d.metadata as any)[OVERRIDE_KEY];
    }
  });
}

/** What we last saw on each character token: tokenId → slug ("" = none). */
const seen = new Map<string, string>();

let syncing = false;
let again = false;

/** Keeps tokens and saved forms in step (called when the scene's items
 *  change and when a scene loads). See the header for the rules.
 *  Tokens are told apart by id, and every scene has its own tokens: in a
 *  new scene each character token is a "first look". */
export async function syncForms(): Promise<void> {
  if (syncing) {
    again = true; // run once more when this pass ends
    return;
  }
  if (!readSecret(roomKey())) return; // not the activated GM browser
  syncing = true;
  try {
    let ready = false;
    try {
      ready = await OBR.scene.isReady();
    } catch {}
    if (!ready) return;
    const items = await OBR.scene.items.getItems(
      (it: any) => typeof (it.metadata as any)?.[CC_BIND_KEY] === "string" && !!(it.metadata as any)[CC_BIND_KEY],
    );
    for (const it of items) {
      const card = String((it.metadata as any)[CC_BIND_KEY]);
      const slug = typeof (it.metadata as any)[SLUG_KEY] === "string" ? String((it.metadata as any)[SLUG_KEY]) : "";
      const before = seen.get(it.id);
      if (before === slug) continue;
      const rec = await readSaved(card);
      if (before === undefined) {
        // First look at this token.
        if (!slug && rec) {
          // Saved form, bare token: put the form back.
          await loadAllMonsters().catch(() => []);
          const monster = getRawMonster(rec.slug) ?? rec.monster ?? null;
          await bindToken(it.id, rec.slug, monster);
          seen.set(it.id, rec.slug);
          continue;
        }
        if (slug && rec?.slug !== slug) await saveFromToken(card, slug); // GM bound it in the suite
        seen.set(it.id, slug);
        continue;
      }
      // Changed on the token since we last looked: the suite (GM) did it.
      seen.set(it.id, slug);
      if (slug) await saveFromToken(card, slug);
      else if (rec) await writeSaved(card, null);
    }
  } catch (e) {
    console.warn("[obr-suite/companion] form sync failed", e);
  } finally {
    syncing = false;
  }
  if (again) {
    again = false;
    void syncForms();
  }
}

async function saveFromToken(card: string, slug: string): Promise<void> {
  let monster: any = null;
  try {
    const table = ((await OBR.scene.getMetadata())[DATA_KEY] as Record<string, any> | undefined) ?? {};
    monster = table[slug] ?? getRawMonster(slug);
  } catch {}
  const name = monster ? summarizeMonster(slug, monster).name : slug.split("::")[1] ?? slug;
  await writeSaved(card, { slug, name, ...(monster ? { monster } : {}) });
}

// --- Full stat block for the phone ("Show form stats") -------------------------
// Built here from the 5etools monster (the same data the suite's monster
// info panel shows), as plain text in sections, so the phone just draws it.

const SKILL_EN: Record<string, string> = {
  acrobatics: "Acrobatics", "animal handling": "Animal Handling", arcana: "Arcana", athletics: "Athletics",
  deception: "Deception", history: "History", insight: "Insight", intimidation: "Intimidation",
  investigation: "Investigation", medicine: "Medicine", nature: "Nature", perception: "Perception",
  performance: "Performance", persuasion: "Persuasion", religion: "Religion", "sleight of hand": "Sleight of Hand",
  stealth: "Stealth", survival: "Survival",
};
const ABIL = ["str", "dex", "con", "int", "wis", "cha"] as const;
const ABIL_NAME: Record<string, string> = { str: "Str", dex: "Dex", con: "Con", int: "Int", wis: "Wis", cha: "Cha" };
const ATK: Record<string, string> = {
  mw: "Melee Weapon Attack:", rw: "Ranged Weapon Attack:", "mw,rw": "Melee or Ranged Weapon Attack:",
  ms: "Melee Spell Attack:", rs: "Ranged Spell Attack:", "ms,rs": "Melee or Ranged Spell Attack:",
  m: "Melee Attack Roll:", r: "Ranged Attack Roll:", "m,r": "Melee or Ranged Attack Roll:",
};

/** 5etools {@tag …} → readable text ("{@hit 5}" → "+5", "{@h}" → "Hit: "). */
function plain(s: unknown): string {
  let out = String(s ?? "");
  for (let i = 0; i < 4 && out.includes("{@"); i++) {
    out = out.replace(/\{@(\w+)\s*([^{}]*?)\}/g, (_m, tag: string, body: string) => {
      const first = body.split("|")[0].trim();
      switch (tag) {
        case "atk":
        case "atkr":
          return ATK[first] ?? "Attack:";
        case "h":
          return "Hit: ";
        case "hom":
          return "Hit or Miss: ";
        case "m":
          return "Miss: ";
        case "hit":
          return /^[+-]/.test(first) ? first : `+${first}`;
        case "dc":
          return `DC ${first}`;
        case "recharge":
          return first ? `(Recharge ${first}–6)` : "(Recharge 6)";
        case "actSave":
          return `${first.charAt(0).toUpperCase()}${first.slice(1)} Saving Throw:`;
        case "actSaveFail":
          return "Failure:";
        case "actSaveSuccess":
          return "Success:";
        case "actTrigger":
          return "Trigger:";
        case "actResponse":
          return "Response:";
        default:
          return first;
      }
    });
  }
  return out.replace(/\s+\n/g, "\n").trim();
}

/** 5etools entries → paragraphs (lists become "• item" lines). */
function paragraphs(e: any): string {
  if (e == null) return "";
  if (typeof e === "string" || typeof e === "number") return plain(e);
  if (Array.isArray(e)) return e.map(paragraphs).filter(Boolean).join("\n");
  if (typeof e === "object") {
    if (e.type === "list" && Array.isArray(e.items)) {
      return e.items.map((it: any) => `• ${paragraphs(it).replace(/\n/g, " ")}`).join("\n");
    }
    if (e.type === "item" || e.type === "itemSub") {
      const body = paragraphs(e.entries ?? e.entry);
      return e.name ? `${plain(e.name)} ${body}` : body;
    }
    if (e.entries) {
      const body = paragraphs(e.entries);
      return e.name ? `${plain(e.name)}. ${body}` : body;
    }
    if (e.items) return paragraphs(e.items);
    if (e.entry) return paragraphs(e.entry);
    if (e.text) return paragraphs(e.text);
  }
  return "";
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function damageList(arr: any): string {
  if (!Array.isArray(arr)) return "";
  return arr
    .map((x: any) => {
      if (typeof x === "string") return x;
      if (x && typeof x === "object") {
        const inner = x.resist || x.immune || x.vulnerable || x.conditionImmune || x.special || [];
        const list = Array.isArray(inner) ? inner.map((y: any) => (typeof y === "string" ? y : y?.name ?? "")).filter(Boolean).join(", ") : String(inner);
        return [x.preNote, list, x.note || x.cond].filter(Boolean).join(" ");
      }
      return "";
    })
    .filter(Boolean)
    .join("; ");
}

export interface StatBlock {
  name: string;
  /** "Large Beast, Unaligned" */
  meta: string;
  /** Label → value lines (AC, HP, Speed, Saves, Skills, Senses…). */
  lines: Array<{ label: string; value: string }>;
  abilities: Record<string, number | null>;
  sections: Array<{ title: string; intro?: string; items: Array<{ name: string; text: string }> }>;
}

export function statBlockOf(slug: string, m: any): StatBlock {
  const s = summarizeMonster(slug, m);
  const lines: StatBlock["lines"] = [];
  const add = (label: string, value: string) => {
    if (value && value.trim()) lines.push({ label, value: plain(value) });
  };
  // AC / HP
  const acs = Array.isArray(m?.ac) ? m.ac : m?.ac != null ? [m.ac] : [];
  add(
    "Armor Class",
    acs
      .map((a: any) =>
        typeof a === "number" ? String(a) : a && typeof a === "object" ? `${a.ac ?? ""}${a.from ? ` (${a.from.map(plain).join(", ")})` : ""}${a.condition ? ` ${plain(a.condition)}` : ""}` : String(a),
      )
      .join(", "),
  );
  const hp = m?.hp;
  add("Hit Points", hp && typeof hp === "object" ? (hp.special ? String(hp.special) : `${hp.average ?? "?"}${hp.formula ? ` (${hp.formula})` : ""}`) : hp != null ? String(hp) : "");
  if (m?.speed && typeof m.speed === "object") {
    const v = (x: any) => (typeof x === "number" ? `${x} ft.` : x?.number != null ? `${x.number} ft.${x.condition ? ` ${plain(x.condition)}` : ""}` : "");
    const parts: string[] = [];
    if (m.speed.walk != null) parts.push(v(m.speed.walk));
    for (const k of ["burrow", "climb", "fly", "swim"]) if (m.speed[k] != null) parts.push(`${k} ${v(m.speed[k])}`);
    if (m.speed.canHover) parts.push("(hover)");
    add("Speed", parts.join(", "));
  }
  if (m?.save && typeof m.save === "object") {
    add("Saving Throws", Object.entries(m.save).map(([k, v]) => `${ABIL_NAME[k] ?? k} ${v}`).join(", "));
  }
  if (m?.skill && typeof m.skill === "object") {
    add("Skills", Object.entries(m.skill).filter(([k]) => k !== "other").map(([k, v]) => `${SKILL_EN[k.toLowerCase()] ?? k} ${v}`).join(", "));
  }
  add("Damage Vulnerabilities", damageList(m?.vulnerable));
  add("Damage Resistances", damageList(m?.resist));
  add("Damage Immunities", damageList(m?.immune));
  add("Condition Immunities", damageList(m?.conditionImmune));
  const senses = [...(Array.isArray(m?.senses) ? m.senses : m?.senses ? [m.senses] : [])];
  if (m?.passive != null) senses.push(`passive Perception ${m.passive}`);
  add("Senses", senses.join(", "));
  add("Languages", Array.isArray(m?.languages) ? m.languages.join(", ") : String(m?.languages ?? "") || "—");
  const cr = typeof m?.cr === "object" && m.cr ? m.cr.cr : m?.cr;
  if (cr != null) add("Challenge", String(cr));
  if (m?.pbNote) add("Proficiency Bonus", String(m.pbNote));

  const abilities: Record<string, number | null> = {};
  for (const a of ABIL) abilities[a] = typeof m?.[a] === "number" ? m[a] : null;

  const sections: StatBlock["sections"] = [];
  const named = (arr: any) =>
    (Array.isArray(arr) ? arr : [])
      .map((x: any) => ({ name: plain(x?.name ?? ""), text: paragraphs(x?.entries ?? x?.entry ?? "") }))
      .filter((x: { name: string; text: string }) => x.name || x.text);
  const push = (title: string, arr: any, intro?: any) => {
    const items = named(arr);
    if (items.length) sections.push({ title, ...(intro ? { intro: paragraphs(intro) } : {}), items });
  };

  // Spellcasting: header text + the spell lists, as one item each.
  const spellItems = (Array.isArray(m?.spellcasting) ? m.spellcasting : []).map((sc: any) => {
    const out: string[] = [];
    const head = paragraphs(sc?.headerEntries);
    if (head) out.push(head);
    const list = (a: any) => (Array.isArray(a) ? a.map(plain).join(", ") : "");
    if (sc?.will) out.push(`At will: ${list(sc.will)}`);
    if (sc?.daily && typeof sc.daily === "object") {
      for (const [k, v] of Object.entries(sc.daily)) out.push(`${k.replace("e", "")}/day${k.endsWith("e") ? " each" : ""}: ${list(v)}`);
    }
    if (sc?.spells && typeof sc.spells === "object") {
      for (const lv of Object.keys(sc.spells).sort((a, b) => Number(a) - Number(b))) {
        const x = sc.spells[lv];
        const label = lv === "0" ? "Cantrips (at will)" : `${lv}${["st", "nd", "rd"][Number(lv) - 1] ?? "th"} level${typeof x?.slots === "number" ? ` (${x.slots} slots)` : ""}`;
        out.push(`${label}: ${list(x?.spells)}`);
      }
    }
    const foot = paragraphs(sc?.footerEntries);
    if (foot) out.push(foot);
    return { name: plain(sc?.name ?? "Spellcasting"), text: out.join("\n") };
  });

  const traits = named(m?.trait);
  if (traits.length || spellItems.length) sections.push({ title: "Traits", items: [...traits, ...spellItems] });
  push("Actions", m?.action);
  push("Bonus Actions", m?.bonus);
  push("Reactions", m?.reaction);
  push(
    "Legendary Actions",
    m?.legendary,
    m?.legendaryHeader ??
      (Array.isArray(m?.legendary) && m.legendary.length
        ? `${s.name} can take ${m.legendaryActions ?? 3} legendary actions, choosing from the options below. Only one legendary action can be used at a time and only at the end of another creature's turn. ${s.name} regains spent legendary actions at the start of its turn.`
        : null),
  );
  push("Mythic Actions", m?.mythic, m?.mythicHeader);

  const align = Array.isArray(m?.alignment)
    ? m.alignment.map((a: any) => ({ L: "lawful", N: "neutral", NX: "neutral", NY: "neutral", C: "chaotic", G: "good", E: "evil", U: "unaligned", A: "any alignment" } as Record<string, string>)[a] ?? (typeof a === "string" ? a : "")).filter(Boolean).join(" ")
    : "";
  return {
    name: s.name,
    meta: [s.size, s.type, align].filter(Boolean).join(" · "),
    lines,
    abilities,
    sections,
  };
}

/** The full stat block of the form on a token, or null. */
export async function formStatBlock(itemId: string): Promise<StatBlock | null> {
  const [item] = await OBR.scene.items.getItems([itemId]);
  const slug = (item?.metadata as any)?.[SLUG_KEY];
  if (typeof slug !== "string" || !slug) return null;
  const table = ((await OBR.scene.getMetadata())[DATA_KEY] as Record<string, any> | undefined) ?? {};
  const m = table[slug] ?? getRawMonster(slug);
  return m ? statBlockOf(slug, m) : null;
}
