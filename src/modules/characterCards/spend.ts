// Spending a token resource from a spell cast / feature use.
//
// Both cast UIs (the mini panel's spell-cast modal and the fullscreen
// sheet, through its host cc-panel) offer a "resource spent" select
// listing the bound token's Resource Tracker entries + an amount. On
// confirm the amount is taken off that resource (clamped at 0), the
// usual bottom-center resource toast fires, and the chat card says
// what was spent.

import OBR from "@owlbear-rodeo/sdk";
import { readResources, updateResource } from "../resourceTracker/storage";
import { broadcastChanged } from "../resourceTracker/panel";
import {
  cleanSlots,
  isSpecialResource,
  slotTotals,
  type Resource,
} from "../resourceTracker/types";
import type { ChatSpent } from "../roomChat/types";

export interface SpendChoice {
  resourceId: string;
  amount: number;
}

export type ActivationKind = "spell" | "feature";

/** Resources offered in the "resource spent" select: only the ones
 *  flagged "Eligible for Spells" / "Eligible for Features" in the
 *  resource editor (spell slots / hit dice have their own UI). */
export function eligibleResources<T extends Pick<Resource, "type" | "forSpells" | "forFeatures">>(
  list: T[],
  kind: ActivationKind,
): T[] {
  return list.filter(
    (r) => !isSpecialResource(r) && (kind === "spell" ? r.forSpells === true : r.forFeatures === true),
  );
}

function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** How much a resource name looks like a feature name (0 = not at
 *  all): same name > one contains the other > shared words. */
export function nameSimilarity(a: string, b: string): number {
  const x = normName(a);
  const y = normName(b);
  if (!x || !y) return 0;
  if (x === y) return 100;
  if (x.includes(y) || y.includes(x)) return 50 + Math.min(x.length, y.length);
  const wx = new Set(x.split(" ").filter((w) => w.length > 2));
  const wy = y.split(" ").filter((w) => w.length > 2);
  const shared = wy.filter((w) => wx.has(w)).length;
  if (!shared) return 0;
  return Math.round((shared / Math.max(wx.size, wy.length)) * 40);
}

/** The resource whose name best matches `name`, or undefined. */
export function bestNameMatch<T extends { name: string }>(list: T[], name: string): T | undefined {
  let best: T | undefined;
  let bestScore = 0;
  for (const r of list) {
    const sc = nameSimilarity(r.name ?? "", name);
    if (sc > bestScore) { best = r; bestScore = sc; }
  }
  return best;
}

export interface SlotOption {
  /** 1–9 */
  level: number;
  current: number;
  max: number;
}

/** Spell-slot levels (from the token's "Spell slots" resource) that
 *  still have a slot left, from `minLevel` up. */
export function slotOptions(
  list: Array<Pick<Resource, "type" | "slots">>,
  minLevel: number,
): SlotOption[] {
  const res = list.find((r) => r.type === "spellSlots");
  if (!res) return [];
  const from = Math.max(1, Math.floor(minLevel || 1));
  return cleanSlots(res.slots)
    .map((s, i) => ({ level: i + 1, current: s.current, max: s.max }))
    .filter((o) => o.level >= from && o.max > 0 && o.current > 0);
}

/** True when the token has a "Spell slots" resource at all. */
export function hasSpellSlots(list: Array<Pick<Resource, "type">>): boolean {
  return list.some((r) => r.type === "spellSlots");
}

/** Set one spell-slot level (0-based index) to `value` (clamped). */
export async function setSpellSlotLevel(
  itemId: string,
  resourceId: string,
  levelIndex: number,
  value: number,
): Promise<Resource | null> {
  let prev = 0;
  const updated = await updateResource(itemId, resourceId, (r) => {
    prev = r.current;
    const slots = cleanSlots(r.slots);
    const s = slots[levelIndex];
    if (!s) return r;
    slots[levelIndex] = { ...s, current: Math.max(0, Math.min(s.max, Math.floor(value))) };
    const tot = slotTotals(slots);
    return { ...r, slots, current: tot.current, max: tot.max };
  });
  if (updated && updated.current !== prev) {
    void broadcastChanged(itemId, updated, updated.current - prev, prev);
  }
  return updated;
}

/** Spend one slot of `level` (1–9) from the token's "Spell slots"
 *  resource. Returns the chat line, or null if none was left. */
export async function spendSpellSlot(itemId: string, level: number): Promise<ChatSpent | null> {
  const list = await tokenResources(itemId);
  const res = list.find((r) => r.type === "spellSlots");
  const i = Math.floor(level) - 1;
  if (!res || !(i >= 0 && i < 9)) return null;
  const s = cleanSlots(res.slots)[i];
  if (!s || s.current <= 0) return null;
  const updated = await setSpellSlotLevel(itemId, res.id, i, s.current - 1);
  if (!updated) return null;
  const after = cleanSlots(updated.slots)[i];
  return {
    name: `${res.name?.trim() || "Spell Slots"} (${level})`,
    amount: 1,
    left: after?.current ?? 0,
    max: after?.max ?? s.max,
  };
}

/** Clean an untrusted { resourceId, amount } (postMessage / UI). */
export function cleanSpend(raw: unknown): SpendChoice | null {
  const r = raw as { resourceId?: unknown; amount?: unknown } | null;
  if (!r || typeof r.resourceId !== "string" || !r.resourceId) return null;
  const n = Math.floor(Number(r.amount));
  if (!Number.isFinite(n) || n <= 0) return null;
  return { resourceId: r.resourceId, amount: Math.min(n, 999) };
}

/** "Ki Points (3/5)" — the select's option label. */
export function resourceOptionLabel(r: Pick<Resource, "name" | "current" | "max">): string {
  const name = r.name?.trim() || "?";
  return `${name} (${r.current}/${r.max})`;
}

/** The bound token's resources, [] when there's no token / no SDK. */
export async function tokenResources(itemId: string | null | undefined): Promise<Resource[]> {
  if (!itemId) return [];
  try {
    const items = await OBR.scene.items.getItems([itemId]);
    return readResources(items[0] ?? null);
  } catch {
    return [];
  }
}

/** Take `amount` off the resource (never below 0). Returns what the
 *  chat card shows, or null when the resource is gone / not writable. */
export async function spendResource(
  itemId: string,
  choice: SpendChoice,
): Promise<ChatSpent | null> {
  let prev = 0;
  let special = false;
  const updated = await updateResource(itemId, choice.resourceId, (r) => {
    prev = r.current;
    // Spell slots / hit dice are spent through their own UI.
    if (isSpecialResource(r)) { special = true; return r; }
    return { ...r, current: Math.max(0, r.current - choice.amount) };
  });
  if (!updated || special) return null;
  const delta = updated.current - prev;
  if (delta !== 0) void broadcastChanged(itemId, updated, delta, prev);
  return {
    name: updated.name?.trim() || "?",
    amount: choice.amount,
    left: updated.current,
    max: updated.max,
  };
}
