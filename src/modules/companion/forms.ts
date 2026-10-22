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
