// Shared HP / AC editing helpers used by both cc-info (character card)
// and bestiary monster-info popovers.
//
// Both panels render four editable stat rows (HP / Max HP / Temp HP /
// AC) that read from and write to the suite-owned metadata key. Older
// scenes may still carry the upstream "Stat Bubbles for D&D" metadata;
// reads migrate from it, and writes mirror to it only when it already
// exists so existing external-plugin tables keep working.
//
// Input format (parseStatInput):
//   "20"      → absolute set
//   "+5"      → current + 5
//   "-3"      → current − 3
//   "15+5"    → 15 + 5 = 20  (calc-style)
//   "15-3"    → 15 − 3 = 12
// Anything else returns null and the caller should leave the value
// unchanged (input box reverts).

import OBR from "@owlbear-rodeo/sdk";

export const BUBBLES_META_KEY = "com.obr-suite/bubbles/data";
export const EXTERNAL_BUBBLES_META_KEY = "com.owlbear-rodeo-bubbles-extension/metadata";

// 2026-06-20 — "creature stats" namespace for a token that is BOTH
// character-card-bound AND transformed into a bestiary monster. When
// the GM's "使用角色卡数值" (use-CC-stats) toggle on monster-info is
// OFF (the default — see monster-info-page.ts), the monster popover
// reads/writes THIS key instead of BUBBLES_META_KEY, so the
// creature's HP/AC stay completely separate from the bound card's
// own HP/AC. The card's own popover (cc-info / mountStatBanner) is
// intentionally unaware of this key — it always reads/writes
// BUBBLES_META_KEY, so the card's stats are never silently masked by
// whatever the monster side is currently using. The on-canvas bubbles
// bar (modules/bubbles/index.ts) picks whichever of the two is
// "active" per the same toggle, mirrored from scene-token metadata.
export const MONSTER_OVERRIDE_META_KEY = "com.obr-suite/bubbles/monster-override";

export interface BubblesData {
  health?: number;
  "max health"?: number;
  "temporary health"?: number;
  "armor class"?: number;
  hide?: boolean;
  /** Per-token DM lock — see modules/bubbles/index.ts. Default true.
   *  When true, players see a combat-gated silhouette of the bar
   *  (no numbers, no AC). When false, full data visible to all. */
  locked?: boolean;
}

// `ownKey` defaults to BUBBLES_META_KEY (the card / legacy behaviour).
// The external-plugin fallback is ONLY consulted for the default key
// — MONSTER_OVERRIDE_META_KEY has no upstream-plugin equivalent, so a
// monster-override read with no data simply returns {} rather than
// accidentally picking up the card's (or the plugin's) values.
function readDataFromMetadata(
  meta: Record<string, unknown> | undefined,
  ownKey: string = BUBBLES_META_KEY,
): BubblesData {
  if (!meta) return {};
  const own = meta[ownKey];
  if (own && typeof own === "object") return { ...(own as BubblesData) };
  if (ownKey === BUBBLES_META_KEY) {
    const external = meta[EXTERNAL_BUBBLES_META_KEY];
    if (external && typeof external === "object") return { ...(external as BubblesData) };
  }
  return {};
}

export function parseStatInput(input: string, current: number): number | null {
  const t = String(input ?? "").trim();
  if (!t) return null;
  // Relative: "+5" / "-3"
  let m = t.match(/^([+-])\s*(\d+)$/);
  if (m) return current + (m[1] === "+" ? 1 : -1) * parseInt(m[2], 10);
  // Absolute: "20"
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  // Calc-style: "15+5" / "15-3"
  m = t.match(/^(\d+)\s*([+-])\s*(\d+)$/);
  if (m) {
    const a = parseInt(m[1], 10);
    const sign = m[2] === "+" ? 1 : -1;
    const b = parseInt(m[3], 10);
    return a + sign * b;
  }
  return null;
}

export async function readBubbles(
  itemId: string,
  metaKey: string = BUBBLES_META_KEY,
): Promise<BubblesData> {
  try {
    const items = await OBR.scene.items.getItems([itemId]);
    return readDataFromMetadata(items[0]?.metadata as Record<string, unknown> | undefined, metaKey);
  } catch (e) {
    console.warn("[statEdit] readBubbles failed", e);
  }
  return {};
}

/** Merge-write: existing bubbles fields are preserved, only the keys
 *  in `patch` are overwritten. Cross-field clamp is applied after the
 *  merge so HP never exceeds max HP — covers BOTH "HP edited above
 *  max" (clamp HP down) and "max edited below current HP" (drag HP
 *  down with it). Returns the final committed state so callers can
 *  refresh their UI to reflect the clamped values.
 *
 *  2026-05-10 — preserves the upstream "Stat Bubbles for D&D"
 *  extension's extra keys (e.g. `name`, `dm only`, `name plate`,
 *  any future fields) when a token has both metadata namespaces.
 *  Previously the EXTERNAL key was overwritten with our own merged
 *  object, dropping fields we don't track and silently flipping
 *  visibility flags on tokens managed by the upstream extension.
 *  The fix shallow-merges the patch INTO each namespace separately
 *  using that namespace's own current value as the base. */
export async function patchBubbles(
  itemId: string,
  patch: Partial<BubblesData>,
  metaKey: string = BUBBLES_META_KEY,
): Promise<BubblesData> {
  let finalState: BubblesData = {};
  try {
    await OBR.scene.items.updateItems([itemId], (drafts) => {
      for (const d of drafts) {
        // Read each namespace independently — they may carry
        // different sets of fields (esp. when the upstream extension
        // owns the token). The external/upstream namespace only
        // exists for the default (card) key — monster-override has
        // no upstream-plugin equivalent.
        const meta = (d.metadata as Record<string, unknown>) ?? {};
        const ownPrev = (meta[metaKey] as Record<string, unknown> | undefined) ?? null;
        const extPrev = metaKey === BUBBLES_META_KEY
          ? ((meta[EXTERNAL_BUBBLES_META_KEY] as Record<string, unknown> | undefined) ?? null)
          : null;

        // Determine the "current" stat snapshot for clamp math: prefer
        // own, fall back to external (default key only). Same
        // precedence as readBubbles.
        const baseForClamp: BubblesData = (ownPrev && typeof ownPrev === "object")
          ? { ...(ownPrev as BubblesData) }
          : (extPrev && typeof extPrev === "object")
            ? { ...(extPrev as BubblesData) }
            : {};
        const merged: BubblesData = { ...baseForClamp, ...patch };
        if (
          typeof merged.health === "number" &&
          typeof merged["max health"] === "number"
        ) {
          merged.health = Math.min(merged.health, merged["max health"]);
        }
        if (
          typeof merged["temporary health"] === "number" &&
          merged["temporary health"] < 0
        ) {
          merged["temporary health"] = 0;
        }
        // The clamped values that should overwrite both namespaces.
        // Only the keys we touched are forwarded; cross-field clamp
        // results (e.g. health pulled down by max edit) are also
        // included so the bar matches reality.
        const clampedPatch: Record<string, unknown> = { ...patch };
        if ("max health" in patch && typeof merged.health === "number") {
          clampedPatch.health = merged.health;
        }
        if ("temporary health" in patch) {
          clampedPatch["temporary health"] = merged["temporary health"];
        }

        // Own namespace — replace with the full merged state (we own
        // this key entirely, no foreign fields to preserve).
        d.metadata[metaKey] = merged;

        // Upstream extension namespace — only touch if it already
        // exists, and ONLY for the default (card) key. Shallow-merge
        // the clamped patch INTO the existing object so we don't drop
        // fields the upstream extension owns (e.g. `dm only`, `name`,
        // `name plate`, anything else its own UI writes there).
        if (extPrev != null) {
          d.metadata[EXTERNAL_BUBBLES_META_KEY] = { ...extPrev, ...clampedPatch };
        }

        finalState = merged;
      }
    });
  } catch (e) {
    console.warn("[statEdit] patchBubbles failed", e);
  }
  return finalState;
}

/** Clamp values to sensible ranges. Negative HP is allowed because
 *  some house rules track "below zero" damage; max HP and AC must be
 *  non-negative. */
export function clampStat(field: keyof BubblesData, value: number): number {
  if (field === "max health") return Math.max(1, Math.round(value));
  if (field === "armor class") return Math.max(0, Math.round(value));
  if (field === "temporary health") return Math.max(0, Math.round(value));
  // health: floor at -999 just to bound it
  return Math.max(-999, Math.round(value));
}