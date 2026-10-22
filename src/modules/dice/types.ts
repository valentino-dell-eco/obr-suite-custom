// Shared types/constants for the dice module — kept side-effect-free
// so it can be imported by both the always-loaded background module
// (index.ts) and the popover iframes (panel-page.ts, effect-page.ts)
// without double-running any subscription code.

export type DiceType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";

export const ALL_TYPES: DiceType[] = [
  "d4", "d6", "d8", "d10", "d12", "d20", "d100",
];

export const DIE_SIDES: Record<DiceType, number> = {
  d4: 4, d6: 6, d8: 8, d10: 10, d12: 12, d20: 20, d100: 100,
};

// Size factor relative to d20 (the canonical reference). Roughly mirrors
// real-world dice proportions — d4 is the smallest tetrahedron, d20 a
// fat icosahedron, d100 a slightly bigger "boulder" die.
export const DIE_SIZE_FACTOR: Record<DiceType, number> = {
  d4:   0.78,
  d6:   0.85,
  d8:   0.90,
  d10:  0.93,
  d12:  0.96,
  d20:  1.00,
  d100: 1.06,
};

export interface DieResult {
  // Type may be a non-standard "dN" string (e.g. "d600") for custom-side
  // rolls — the receiver maps it to the d100 art via imgTypeFor().
  type: DiceType | string;
  value: number;
  // Marks dice that didn't make it into the kept set (adv/dis losers).
  // The receiver renders them at 0.3 opacity throughout the animation
  // and skips them in the total-rush sequence.
  loser?: boolean;
  // Set when max/min/reset replaced the rolled value with something
  // else (e.g. dice rolled 1, max(d, 3) bumped to 3). Used by the
  // animation to display "3(1)" — new(original).
  originalValue?: number;
  // Index of the die that triggered this one via burst() — i.e. the
  // immediately-preceding die in the burst chain. The first / parent
  // die has no burstParent. Drives the chain animation: parents pop,
  // children fly in afterwards.
  burstParent?: number;
  // Subtraction dice (e.g. the d6 in 1d20-1d6). The die rolls and
  // animates normally, but its face value is SUBTRACTED from the
  // total. Receivers render these at lower opacity and prefix their
  // chip text with "−" so the user sees what's being deducted.
  subtract?: boolean;
}

export function rollDie(type: DiceType): number {
  return Math.floor(Math.random() * DIE_SIDES[type]) + 1;
}

/** Resolve side count for any "dN" string — including non-standard
 *  sides like d7, d100, d600. Used for clamp / slot-machine cycling
 *  by every receiver / sender so non-standard dice survive intact. */
export function sidesOf(type: string): number {
  if (type in DIE_SIDES) return (DIE_SIDES as Record<string, number>)[type];
  const m = type.match(/^d(\d+)$/i);
  return m ? parseInt(m[1], 10) : 20;
}

// --- Untrusted roll payload sanitizer ---------------------------------
//
// Dice rolls arrive from OTHER players via OBR.broadcast (anyone can
// craft one from the browser console) and are persisted in
// localStorage, then rendered with innerHTML. Every entry point —
// broadcast receive AND history load — must pass through this so only
// plain numbers, a hex colour and strings ever reach the renderers.

export const DEFAULT_ROLLER_COLOR = "#5dade2";
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const DIE_TYPE_RE = /^d\d{1,4}$/i;
const MAX_SANITIZED_DICE = 500;

export function safeColor(c: unknown): string {
  return typeof c === "string" && HEX_COLOR_RE.test(c) ? c : DEFAULT_ROLLER_COLOR;
}

function finiteNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeDie(raw: unknown): DieResult | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const type = typeof d.type === "string" && DIE_TYPE_RE.test(d.type) ? d.type.toLowerCase() : null;
  if (!type) return null;
  const sides = sidesOf(type);
  const value = Math.max(1, Math.min(sides, Math.round(finiteNum(d.value, 1))));
  const out: DieResult = { type, value };
  if (d.loser) out.loser = true;
  if (d.subtract) out.subtract = true;
  if (d.originalValue != null && Number.isFinite(Number(d.originalValue))) {
    out.originalValue = Math.round(Number(d.originalValue));
  }
  if (d.burstParent != null && Number.isInteger(Number(d.burstParent))) {
    out.burstParent = Number(d.burstParent);
  }
  return out;
}

/** Sanitised shape shared by every dice-roll consumer (history,
 *  panel, replay). Unknown fields are dropped. */
export interface SanitizedRoll {
  itemId: string | null;
  dice: DieResult[];
  winnerIdx: number;
  modifier: number;
  label: string;
  total: number;
  rollerId: string;
  rollerName: string;
  rollerColor: string;
  rollId: string;
  ts: number;
  /** Name of the token the roll was made for (absent when no token). */
  tokenName?: string;
  hidden?: boolean;
  redacted?: boolean;
  rollerIsGM?: boolean;
  autoDismiss?: boolean;
  sameHighlight?: boolean;
  collectiveId?: string;
  rowStarts?: number[];
  /** Sheet used for stat keywords: character card or bestiary form. */
  statSource?: "chara" | "form";
  /** "app" = rolled from the Echo Companion phone app (via the GM's suite). */
  via?: "app";
}

/** Returns a clean copy of a roll payload, or null if it isn't one. */
export function sanitizeRollPayload(raw: unknown): SanitizedRoll | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.rollId !== "string" || !r.rollId) return null;
  if (!Array.isArray(r.dice)) return null;
  const dice = r.dice
    .slice(0, MAX_SANITIZED_DICE)
    .map(sanitizeDie)
    .filter((d): d is DieResult => !!d);
  if (!dice.length) return null;
  const out: SanitizedRoll = {
    itemId: typeof r.itemId === "string" ? r.itemId : null,
    dice,
    winnerIdx: Math.max(-1, Math.min(dice.length - 1, Math.round(finiteNum(r.winnerIdx, -1)))),
    modifier: finiteNum(r.modifier),
    label: typeof r.label === "string" ? r.label : "",
    total: finiteNum(r.total),
    rollerId: typeof r.rollerId === "string" ? r.rollerId : "",
    rollerName: typeof r.rollerName === "string" ? r.rollerName : "",
    rollerColor: safeColor(r.rollerColor),
    rollId: r.rollId,
    ts: finiteNum(r.ts, Date.now()),
  };
  if (typeof r.tokenName === "string" && r.tokenName.trim()) {
    out.tokenName = r.tokenName.trim().slice(0, 80);
  }
  if (r.hidden) out.hidden = true;
  if (r.redacted) out.redacted = true;
  if (r.rollerIsGM) out.rollerIsGM = true;
  if (r.autoDismiss) out.autoDismiss = true;
  if (r.sameHighlight) out.sameHighlight = true;
  if (typeof r.collectiveId === "string" && r.collectiveId) out.collectiveId = r.collectiveId;
  if (r.statSource === "chara" || r.statSource === "form") out.statSource = r.statSource;
  if (r.via === "app") out.via = "app";
  if (Array.isArray(r.rowStarts)) {
    out.rowStarts = r.rowStarts
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n >= 0 && n < dice.length);
  }
  return out;
}

/** Sanitise a stored history array (drops anything malformed). */
export function sanitizeRollList(raw: unknown): SanitizedRoll[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(sanitizeRollPayload).filter((x): x is SanitizedRoll => !!x);
}

/** Name shown for a roll: "Token (Player)" when the roll was made for a
 *  token, otherwise just the player's name. */
export function rollDisplayName(r: { tokenName?: string; rollerName?: string }): string {
  const player = r.rollerName || "?";
  return r.tokenName ? `${r.tokenName} (${player})` : player;
}
