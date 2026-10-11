// Spell slots and hit dice live in two SPECIAL Resource Tracker
// resources on the character's token ("Spell slots": levels 1–9 in one
// resource; "Hit dice": current / max + die size) instead of the card's
// own `spellcasting.spell_slots` / `core_stats.hit_dice` fields.
//
// Existing cards are migrated the first time the card is shown with a
// bound token: if the token has no such resource yet and the card has
// values, the resource is created from them. The card fields are left
// as they are (the sheet now reads the resources).

import { addResource } from "../resourceTracker/storage";
import {
  HIT_DIE_SIZES,
  cleanSlots,
  hitDieSize,
  slotTotals,
  type IconId,
  type Resource,
} from "../resourceTracker/types";
import { tokenResources } from "./spend";
import { t } from "../../i18n";
import { getLocalLang } from "../../state";

export type SpecialKind = "spellSlots" | "hitDice";

function newId(): string {
  return `r-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/** Card `spell_slots` ({"1": {current, max}, …}) → 9 slot levels. */
export function slotsFromCard(spellSlots: unknown): Array<{ current: number; max: number }> {
  const src = (spellSlots && typeof spellSlots === "object" ? spellSlots : {}) as Record<
    string,
    { current?: unknown; max?: unknown } | undefined
  >;
  return cleanSlots(
    Array.from({ length: 9 }, (_, i) => {
      const s = src[String(i + 1)];
      const max = Number(s?.max) || 0;
      const cur = s?.current == null ? max : Number(s.current) || 0;
      return { current: cur, max };
    }),
  );
}

/** "d10" from the card's die_size ("d10", "1d10", "10"). */
export function dieFromCard(raw: unknown): (typeof HIT_DIE_SIZES)[number] {
  const s = String(raw ?? "").trim();
  return hitDieSize(/^\d+$/.test(s) ? `d${s}` : s) ?? "d8";
}

export function buildSpellSlotsResource(spellSlots: unknown): Resource {
  const slots = slotsFromCard(spellSlots);
  const tot = slotTotals(slots);
  return {
    id: newId(),
    name: t(getLocalLang(), "reDefaultSlotsName"),
    type: "spellSlots",
    current: tot.current,
    max: tot.max,
    icon: "starFour",
    slots,
    recovery: "LR",
    order: -2,
  };
}

export function buildHitDiceResource(hitDice: unknown): Resource {
  const hd = (hitDice && typeof hitDice === "object" ? hitDice : {}) as {
    current?: unknown;
    max?: unknown;
    die_size?: unknown;
  };
  const max = Math.max(0, Math.floor(Number(hd.max) || 0));
  const cur = hd.current == null ? max : Math.max(0, Math.min(max, Math.floor(Number(hd.current) || 0)));
  const die = dieFromCard(hd.die_size);
  return {
    id: newId(),
    name: t(getLocalLang(), "reDefaultHitDiceName"),
    type: "hitDice",
    current: cur,
    max,
    icon: die as IconId,
    dieInfo: die,
    // One pool per die size; add more in the editor when multiclassing.
    pools: [{ die, current: cur, max }],
    recovery: "LR",
    order: -1,
  };
}

const migrated = new Set<string>();

/** Create the missing special resources on `itemId` from the card
 *  data. Without `force` it runs once per token per page, and only for
 *  fields the card actually fills; `force` creates that resource even
 *  from empty card fields (the sheet's "Create" button). Returns true
 *  when something was added. */
export async function migrateSpecialResources(
  itemId: string | null | undefined,
  data: any,
  force?: SpecialKind,
): Promise<boolean> {
  if (!itemId) return false;
  if (!force) {
    if (migrated.has(itemId)) return false;
    migrated.add(itemId);
  }
  const list = await tokenResources(itemId);
  let added = false;
  const sp = data?.spellcasting?.spell_slots;
  const wantSlots =
    force === "spellSlots" || (!force && slotsFromCard(sp).some((s) => s.max > 0));
  if (wantSlots && !list.some((r) => r.type === "spellSlots")) {
    await addResource(itemId, buildSpellSlotsResource(sp));
    added = true;
  }
  const hd = data?.core_stats?.hit_dice;
  const wantHd = force === "hitDice" || (!force && Number(hd?.max) > 0);
  if (wantHd && !list.some((r) => r.type === "hitDice")) {
    await addResource(itemId, buildHitDiceResource(hd));
    added = true;
  }
  return added;
}
