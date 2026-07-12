// Read / write per-token resource arrays from OBR scene metadata.
//
// All resources for a token live in a single array under
// `RESOURCES_KEY`. Updates go through OBR.scene.items.updateItems
// which broadcasts to every client — small payload, no broadcast
// limit issues even with dozens of resources.

import OBR, { Item } from "@owlbear-rodeo/sdk";
import { Resource, RESOURCES_KEY, RecoveryType } from "./types";
import { evaluateFormula, RolledDie } from "../../utils/diceFormula";

/** Read the resources array from a token's metadata. Returns [] if
 *  none configured or metadata malformed. */
export function readResources(item: Item | null | undefined): Resource[] {
  if (!item) return [];
  const raw = (item.metadata as any)?.[RESOURCES_KEY];
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normaliseResource)
    .filter((r): r is Resource => r !== null);
}

function normaliseResource(raw: unknown): Resource | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as any;
  if (typeof r.id !== "string" || !r.id) return null;
  if (typeof r.name !== "string") return null;
  if (
    r.type !== "count" &&
    r.type !== "bar" &&
    r.type !== "number" &&
    r.type !== "dieRoll" &&
    r.type !== "charges"
  )
    return null;
  const cur = Number(r.current);
  const max = Number(r.max);
  if (!Number.isFinite(cur) || !Number.isFinite(max)) return null;
  const dieInfo = typeof r.dieInfo === "string" && /^(D2|D4|D6|D8|D10|D12|D20|D100)$/.test(r.dieInfo)
    ? (r.dieInfo as any)
    : undefined;
  // Older saved resources predate the recovery/chargesFormula fields —
  // both are optional and default to "untouched by SR/LR/DW/DS", which
  // is exactly the old (implicit) behaviour, so this stays backward
  // compatible with every resource ever saved before this feature.
  const recovery =
    typeof r.recovery === "string" && /^(none|SR|LR|DW|DS)$/.test(r.recovery)
      ? (r.recovery as any)
      : undefined;
  const chargesFormula =
    typeof r.chargesFormula === "string" && r.chargesFormula.trim().length > 0
      ? r.chargesFormula
      : null;
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    current: cur,
    max: max,
    icon: typeof r.icon === "string" ? r.icon : "gem",
    dieInfo,
    recovery,
    chargesFormula: r.type === "charges" ? chargesFormula : undefined,
    order: typeof r.order === "number" ? r.order : undefined,
  };
}

/** Replace the entire resources array for one token. */
export async function writeResources(
  itemId: string,
  next: Resource[],
): Promise<void> {
  try {
    await OBR.scene.items.updateItems([itemId], (drafts) => {
      const d = drafts[0];
      if (!d) return;
      (d.metadata as any)[RESOURCES_KEY] = next;
    });
  } catch (e) {
    console.error("[obr-suite/resources] writeResources failed", e);
  }
}

/** Mutate one resource and write back. The reducer receives the
 *  current resource and returns the next state; the resource is
 *  matched by id. Used by every click-to-modify action. */
export async function updateResource(
  itemId: string,
  resourceId: string,
  reducer: (cur: Resource) => Resource,
): Promise<Resource | null> {
  let next: Resource | null = null;
  try {
    await OBR.scene.items.updateItems([itemId], (drafts) => {
      const d = drafts[0];
      if (!d) return;
      const arr = (d.metadata as any)?.[RESOURCES_KEY];
      if (!Array.isArray(arr)) return;
      const i = arr.findIndex((r: any) => r?.id === resourceId);
      if (i < 0) return;
      const cur = normaliseResource(arr[i]);
      if (!cur) return;
      const upd = reducer(cur);
      arr[i] = upd;
      next = upd;
    });
  } catch (e) {
    console.error("[obr-suite/resources] updateResource failed", e);
  }
  return next;
}

/** Add a new resource to the end of the array. */
export async function addResource(
  itemId: string,
  resource: Resource,
): Promise<void> {
  try {
    await OBR.scene.items.updateItems([itemId], (drafts) => {
      const d = drafts[0];
      if (!d) return;
      const arr = (d.metadata as any)?.[RESOURCES_KEY];
      const next = Array.isArray(arr) ? [...arr] : [];
      next.push(resource);
      (d.metadata as any)[RESOURCES_KEY] = next;
    });
  } catch (e) {
    console.error("[obr-suite/resources] addResource failed", e);
  }
}

/** Remove a resource by id. */
export async function deleteResource(
  itemId: string,
  resourceId: string,
): Promise<void> {
  try {
    await OBR.scene.items.updateItems([itemId], (drafts) => {
      const d = drafts[0];
      if (!d) return;
      const arr = (d.metadata as any)?.[RESOURCES_KEY];
      if (!Array.isArray(arr)) return;
      (d.metadata as any)[RESOURCES_KEY] = arr.filter((r: any) => r?.id !== resourceId);
    });
  } catch (e) {
    console.error("[obr-suite/resources] deleteResource failed", e);
  }
}

// --- Recovery (SR / LR / DW / DS) -----------------------------------------
//
// Two-phase design, driven by the caller (panel-page.ts for the global
// button, info-page.ts for the per-card button):
//  1. `writeRecoveryPass` — one metadata write per involved token that
//     instantly tops up every matching resource EXCEPT charges-with-
//     formula ones (those need a player-facing dice roll first). Returns
//     which resources still need a roll, grouped by item id, so the
//     caller can build the recharge modal.
//  2. `rechargeCharges` — called once per charges resource when the
//     player clicks "Recharge" in that modal. Rolls the formula, adds
//     the result to `current` (clamped to `max`), and returns the dice
//     so the caller can feed them into the existing `broadcastDiceRoll`
//     (same room-wide dice-toast every other roll in the suite uses).

export type RecoveryOutcome = "instant" | "needsRoll" | null;

/** Does resource `r` get touched by a recovery pass covering `types`,
 *  and how? `null` = not covered by this pass at all (recovery field
 *  absent/"none", or set to a type not included in `types`). */
export function recoveryOutcomeFor(
  r: Resource,
  types: RecoveryType[],
): RecoveryOutcome {
  const rec = r.recovery && r.recovery !== "none" ? r.recovery : undefined;
  if (!rec || !types.includes(rec)) return null;
  if (r.type === "charges" && r.chargesFormula && r.chargesFormula.trim()) {
    return "needsRoll";
  }
  return "instant";
}

/** Pure helper — given a resources array, returns the array with every
 *  "instant" resource topped up to max, plus the list of resources that
 *  still need a manual charges roll (untouched here). Exported mainly
 *  for testability; production code should prefer `writeRecoveryPass`
 *  which also persists the result. */
export function applyInstantRecovery(
  resources: Resource[],
  types: RecoveryType[],
): { next: Resource[]; needsRoll: Resource[] } {
  const needsRoll: Resource[] = [];
  const next = resources.map((r) => {
    const outcome = recoveryOutcomeFor(r, types);
    if (outcome === "instant") return { ...r, current: r.max };
    if (outcome === "needsRoll") needsRoll.push(r);
    return r;
  });
  return { next, needsRoll };
}

/** Apply one recovery pass across one or more tokens in a single scene
 *  update (batched — one `updateItems` call for all `itemIds`, same
 *  pattern `propagateCardRefresh` in characterCards/index.ts uses for
 *  multi-token writes). Every resource whose `recovery` is included in
 *  `types` gets topped up to max, EXCEPT charges resources with a non-
 *  empty formula — those are left untouched here and returned in the
 *  result map so the caller can open the recharge modal for them.
 *
 *  Tokens that have no resources array, or none matching, are simply
 *  absent from the returned map (nothing to roll for them). */
export async function writeRecoveryPass(
  itemIds: string[],
  types: RecoveryType[],
): Promise<Map<string, Resource[]>> {
  const needsRollByItem = new Map<string, Resource[]>();
  if (itemIds.length === 0) return needsRollByItem;
  try {
    await OBR.scene.items.updateItems(itemIds, (drafts) => {
      for (const d of drafts) {
        const raw = (d.metadata as any)?.[RESOURCES_KEY];
        if (!Array.isArray(raw)) continue;
        const resources = raw
          .map(normaliseResource)
          .filter((r): r is Resource => r !== null);
        if (resources.length === 0) continue;
        const { next, needsRoll } = applyInstantRecovery(resources, types);
        (d.metadata as any)[RESOURCES_KEY] = next;
        if (needsRoll.length > 0) needsRollByItem.set(d.id, needsRoll);
      }
    });
  } catch (e) {
    console.error("[obr-suite/resources] writeRecoveryPass failed", e);
  }
  return needsRollByItem;
}

export interface RechargeResult {
  resource: Resource;
  dice: RolledDie[];
  modifier: number;
  total: number;
}

/** Roll a single charges resource's recovery formula and add the result
 *  to `current` (clamped to `max`). Returns the rolled dice (for the
 *  recharge modal to relay into `broadcastDiceRoll`) plus the resource's
 *  new state, or null if the formula couldn't be parsed (caller should
 *  leave the resource untouched and surface an error rather than
 *  silently topping it up — a malformed formula is a content bug, not
 *  a "nothing to roll" case). */
export async function rechargeCharges(
  itemId: string,
  resourceId: string,
  formula: string,
): Promise<RechargeResult | null> {
  const evaluated = evaluateFormula(formula);
  if (!evaluated) return null;
  const updated = await updateResource(itemId, resourceId, (cur) => ({
    ...cur,
    current: Math.min(cur.max, cur.current + evaluated.total),
  }));
  if (!updated) return null;
  return {
    resource: updated,
    dice: evaluated.dice,
    modifier: evaluated.modifier,
    total: evaluated.total,
  };
}
