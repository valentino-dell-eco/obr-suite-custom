// Shared recovery logic (SR / LR / DW / DS) for character-card tokens.
// Pure OBR-facing logic — no DOM here on purpose, so both panel-page.ts
// (global buttons, sidebar) and info-page.ts (per-card buttons,
// fullscreen) import the exact same behaviour instead of drifting.
//
// See the resourceTracker/storage.ts "Recovery" section for the
// low-level per-token write (`writeRecoveryPass`) and the charges-roll
// primitive (`rechargeCharges`) this module builds on top of.

import OBR from "@owlbear-rodeo/sdk";
import {
  Resource,
  RecoveryType,
  RESOURCES_KEY,
} from "../resourceTracker/types";
import { writeRecoveryPass, rechargeCharges, RechargeResult } from "../resourceTracker/storage";
import { broadcastDiceRoll } from "../dice";

export type { RecoveryType, Resource, RechargeResult };

// Broadcast channels — both LOCAL+REMOTE sent by callers (mirrors the
// dual-send pattern used everywhere else in characterCards/*.ts).
//
// BC_RECOVERY_TRIGGER: sent by the GM after a GLOBAL recovery pass, so
// every online player's own client can check "is one of MY tokens in
// here?" and open its own local charges-roll modal for just those.
// The GM never rolls on behalf of an ONLINE player — only offline ones
// (handled entirely client-side by the GM, no broadcast needed for that
// part).
export const BC_RECOVERY_TRIGGER = "com.character-cards/recovery-trigger";
// BC_RECOVERY_NOTICE: sent by a PLAYER's client after they use the
// per-card recovery buttons, purely so the GM sees an FYI modal. Never
// sent when the GM itself presses a per-card button (no one to notify).
export const BC_RECOVERY_NOTICE = "com.character-cards/recovery-notice";
// 2026-07 — cc-recovery-roll.html is a real top-level OBR modal (see
// index.ts's BC_RECOVERY_TRIGGER handler for why it can't render
// directly in background.html). These two LOCAL-only channels let
// index.ts (which owns the accumulated pending list — it's the only
// listener of BC_RECOVERY_TRIGGER) talk to that modal once it's open,
// instead of tearing it down and reopening it on every extra trigger:
//   UPDATE — a second (or third...) recovery pass added more of the
//     player's own tokens/resources to the pending list while the
//     modal was already open; push the merged list in so it appends
//     rather than resetting.
//   CLOSED — the modal notifies the opener when it actually goes away
//     (user closed it, or nothing was left to roll), so index.ts knows
//     to drop its accumulator and treat the next trigger as "modal is
//     closed, open fresh" again.
export const BC_RECOVERY_ROLL_UPDATE = "com.character-cards/recovery-roll-update";
export const BC_RECOVERY_ROLL_CLOSED = "com.character-cards/recovery-roll-closed";

export interface RecoveryTriggerItem {
  itemId: string;
  /** Charges-with-formula resources on this token that still need a
   *  roll after the GM's instant-recovery pass. Snapshot values (not
   *  re-read by the receiver) so there's no race with sync latency. */
  resources: {
    id: string;
    name: string;
    current: number;
    max: number;
    chargesFormula: string;
  }[];
}

export interface RecoveryTriggerPayload {
  types: RecoveryType[];
  /** One entry per token that has at least one charges resource still
   *  needing a roll. Receivers filter this down to tokens they own. */
  items: RecoveryTriggerItem[];
}

/** Merge a new batch of pending recovery-roll items into an existing
 *  list, keyed by (itemId, resourceId). Later values win — a resource
 *  reappearing in `incoming` (e.g. the GM pressed a second LR before
 *  the player rolled the first one) replaces the stale current/max
 *  snapshot with the fresh one, rather than duplicating the row. */
export function mergeRecoveryRollItems(
  base: RecoveryTriggerItem[],
  incoming: RecoveryTriggerItem[],
): RecoveryTriggerItem[] {
  const byItem = new Map<string, Map<string, RecoveryTriggerItem["resources"][number]>>();
  for (const it of base) {
    byItem.set(it.itemId, new Map(it.resources.map((r) => [r.id, r])));
  }
  for (const it of incoming) {
    const existing = byItem.get(it.itemId) ?? new Map();
    for (const r of it.resources) existing.set(r.id, r);
    byItem.set(it.itemId, existing);
  }
  return [...byItem.entries()]
    .map(([itemId, resources]) => ({ itemId, resources: [...resources.values()] }))
    .filter((it) => it.resources.length > 0);
}

export interface RecoveryNoticePayload {
  playerName: string;
  cardName: string;
  types: RecoveryType[];
}

// BC_REST_ANNOUNCEMENT — one per PRESSED button (never one per
// expanded type — pressing LR never also announces "made a short
// rest" even though SR resources are restored under the hood).
// Picked up by resource-toast-page.ts (the existing always-on,
// room-wide toast overlay) so every player sees it, matching the
// LOCAL+REMOTE dual-send convention every other broadcast in this
// codebase uses.
export const BC_REST_ANNOUNCEMENT = "com.character-cards/rest-announcement";

export interface RestAnnouncementPayload {
  characterName: string;
  recoveryType: RecoveryType;
}

export function announceRest(
  characterName: string,
  recoveryType: RecoveryType,
): void {
  if (recoveryType === "none") return;
  const payload: RestAnnouncementPayload = { characterName, recoveryType };
  try {
    OBR.broadcast.sendMessage(BC_REST_ANNOUNCEMENT, payload, { destination: "LOCAL" });
    OBR.broadcast.sendMessage(BC_REST_ANNOUNCEMENT, payload, { destination: "REMOTE" });
  } catch (e) {
    console.warn("[obr-suite/recovery] announceRest failed", e);
  }
}

/** Central place both pages call to turn "the user pressed LR, and (if
 *  asked) also confirmed Dawn/Dusk" into the concrete list of recovery
 *  types to apply. SR/DW/DS presses are always exactly themselves.
 */
export function expandRecoveryTypes(
  pressed: RecoveryType,
  includeDawn: boolean,
  includeDusk: boolean,
): RecoveryType[] {
  if (pressed !== "LR") return [pressed];
  const types: RecoveryType[] = ["SR", "LR"];
  if (includeDawn) types.push("DW");
  if (includeDusk) types.push("DS");
  return types;
}

/** Read-only check (no writes) — does ANY of the given tokens have at
 *  least one resource whose `recovery` is exactly `type`? Used to decide
 *  whether the "also restore Dawn/Dusk?" confirm modal is worth showing
 *  at all before a Long Rest (skip it entirely when nothing on any
 *  involved token uses that recovery type). */
export async function tokensHaveRecoveryType(
  itemIds: string[],
  type: RecoveryType,
): Promise<boolean> {
  if (itemIds.length === 0) return false;
  try {
    const items = await OBR.scene.items.getItems(itemIds);
    for (const it of items) {
      const raw = (it.metadata as any)?.[RESOURCES_KEY];
      if (!Array.isArray(raw)) continue;
      if (raw.some((r: any) => r?.recovery === type)) return true;
    }
  } catch {
    // best-effort — worst case the confirm modal shows up with
    // nothing to actually confirm, which is harmless.
  }
  return false;
}

/** Connected player ids right now (GM included). Used to split a
 *  global recovery pass's charges-with-formula resources into "notify
 *  the online owner, let THEM roll" vs "owner is offline, GM rolls in
 *  their place". */
export async function getConnectedPlayerIds(): Promise<Set<string>> {
  try {
    const players = await OBR.party.getPlayers();
    return new Set(players.map((p) => p.id));
  } catch {
    return new Set();
  }
}

/** Apply an instant recovery pass across one or more tokens. Thin
 *  re-export of the storage-layer primitive — kept here so callers
 *  only ever import from this module for anything recovery-related. */
export const writeRecoveryPassForTokens = writeRecoveryPass;

/** Roll one charges resource's recovery formula, persist the result,
 *  and relay the dice into the existing suite-wide dice-roll broadcast
 *  so it shows up in the dice toast/history exactly like every other
 *  roll (matches the `dieRoll` consumption flow's own convention of
 *  using the TOKEN's itemId as `rollerId` — the roll "belongs" to the
 *  character, not to whichever player/GM happened to click). */
export async function rollChargeResource(
  itemId: string,
  resource: Resource,
): Promise<RechargeResult | null> {
  if (!resource.chargesFormula) return null;
  const result = await rechargeCharges(itemId, resource.id, resource.chargesFormula);
  if (!result) return null;
  try {
    await broadcastDiceRoll({
      itemId,
      dice: result.dice.map((d) => ({ type: `d${d.sides}`, value: d.value })),
      winnerIdx: -1,
      modifier: result.modifier,
      label: resource.name,
      rollerId: itemId,
    });
  } catch {
    // Roll already persisted — a broadcast hiccup shouldn't roll it
    // back, the toast is a nice-to-have, not the source of truth.
  }
  return result;
}