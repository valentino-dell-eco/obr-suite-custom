// Token image used when a monster has no image of its own (no token
// image source set in Settings → Libraries, or the image didn't load):
// a pawn for its creature type, drawn for the suite
// (public/pawns/<type>.svg — coloured ring + symbol, one per 5e type).
// Unrecognised types use the generic pawn (public/monster-pawn.svg).
import { assetUrl } from "../../asset-base";

export const CREATURE_TYPES = [
  "aberration",
  "beast",
  "celestial",
  "construct",
  "dragon",
  "elemental",
  "fey",
  "fiend",
  "giant",
  "humanoid",
  "monstrosity",
  "ooze",
  "plant",
  "undead",
] as const;
export type CreatureType = (typeof CREATURE_TYPES)[number];

export const GENERIC_PAWN_URL = assetUrl("monster-pawn.svg");

/** 5etools `type` is a string ("ooze") or, after parseType, sometimes
 *  a JSON blob (`{"choose":["beast","monstrosity"]}`) or a swarm
 *  ("swarm of Tiny beasts"). Pick the first known type mentioned. */
export function creatureTypeOf(type: unknown): CreatureType | null {
  const s = String(type ?? "").toLowerCase();
  let best: { t: CreatureType; at: number } | null = null;
  for (const t of CREATURE_TYPES) {
    const at = s.indexOf(t);
    if (at >= 0 && (!best || at < best.at)) best = { t, at };
  }
  return best?.t ?? null;
}

/** Pawn image for a creature type; always returns a usable URL. */
export function pawnUrlFor(type: unknown): string {
  const t = creatureTypeOf(type);
  return t ? assetUrl(`pawns/${t}.svg`) : GENERIC_PAWN_URL;
}
