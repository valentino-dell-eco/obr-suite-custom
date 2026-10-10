// Shared spell-cast logic, used by BOTH cast UIs:
//   - the fullscreen sheet's in-page Preact modal (fullscreen-page.tsx)
//   - the mini panel's standalone OBR modal (spell-cast-page.ts)
// so the level list and the chat payload (incl. the DC rule) can't drift
// apart between the two.

import type { ChatCast } from "../roomChat/types";
import type { SpellDetail } from "./spell-detail";

export type SlotMap = Record<string, { current?: number; max?: number } | undefined>;

/** Levels a spell can be cast at: its own level up to 9th, regardless
 *  of the slots on the card. Cantrips → [0]. */
export function castLevelOptions(spellLevel: number, _slots?: SlotMap): number[] {
  const lv0 = Math.min(9, Math.max(0, Math.floor(spellLevel || 0)));
  if (lv0 === 0) return [0];
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((lv) => lv >= lv0);
}

/** The card's own save DC as a number, or null when unset / unparsable. */
export function cardSaveDc(saveDc: unknown): number | null {
  const n = typeof saveDc === "number" ? saveDc : parseInt(String(saveDc ?? ""), 10);
  return Number.isFinite(n) ? n : null;
}

// --- Dice arithmetic for upcasting -----------------------------------

/** "2d6+1d8+3" → faces→count map + flat modifier. */
function parseDice(expr: string): { dice: Map<number, number>; flat: number } | null {
  const clean = expr.replace(/\s+/g, "");
  if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/i.test(clean)) return null;
  const dice = new Map<number, number>();
  let flat = 0;
  for (const m of clean.matchAll(/([+-]?)(\d*)d(\d+)|([+-]?)(\d+)/gi)) {
    if (m[3]) {
      const sign = m[1] === "-" ? -1 : 1;
      const n = m[2] ? parseInt(m[2], 10) : 1;
      const f = parseInt(m[3], 10);
      dice.set(f, (dice.get(f) ?? 0) + sign * n);
    } else if (m[5]) {
      flat += (m[4] === "-" ? -1 : 1) * parseInt(m[5], 10);
    }
  }
  return { dice, flat };
}

function formatDice(d: { dice: Map<number, number>; flat: number }): string {
  const parts = [...d.dice.entries()]
    .filter(([, n]) => n !== 0)
    .sort((a, b) => b[0] - a[0])
    .map(([f, n]) => `${n}d${f}`);
  if (d.flat) parts.push(String(d.flat));
  return parts.join("+").replace(/\+-/g, "-");
}

/** base + per × times, merging same-size dice ("8d6" + 2×"1d6" → "10d6"). */
export function addDice(base: string, per: string, times: number): string {
  const a = parseDice(base);
  const b = parseDice(per);
  if (!a || !b || times <= 0) return base;
  for (const [f, n] of b.dice) a.dice.set(f, (a.dice.get(f) ?? 0) + n * times);
  a.flat += b.flat * times;
  return formatDice(a);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Replace a dice expression as a whole token (not inside "18d6"). */
function replaceDice(text: string, from: string, to: string): string {
  const re = new RegExp(`(?<![\\w])${escapeRe(from)}(?![\\w])`, "g");
  return text.replace(re, to);
}

/** Apply slot-upcast and cantrip-by-character-level scaling to the
 *  spell's main text. Returns the rewritten body + what changed. */
export function scaleSpellText(
  detail: SpellDetail,
  baseLevel: number,
  castLevel: number,
  characterLevel: number | null,
): { body: string; scaled: Array<{ from: string; to: string }> } {
  let body = detail.body;
  const scaled: Array<{ from: string; to: string }> = [];
  if (detail.descOverridden) return { body, scaled };
  if (baseLevel > 0 && castLevel > baseLevel) {
    for (const r of detail.slotScaling) {
      const times = castLevel - Math.max(r.from, baseLevel);
      if (times <= 0) continue;
      const to = addDice(r.base, r.per, times);
      if (to === r.base) continue;
      const next = replaceDice(body, r.base, to);
      if (next !== body) {
        body = next;
        scaled.push({ from: r.base, to });
      }
    }
  }
  if (baseLevel === 0 && characterLevel != null && characterLevel > 0) {
    for (const steps of detail.charScaling) {
      const from = steps[0][1];
      let to = from;
      for (const [lv, expr] of steps) if (characterLevel >= lv) to = expr;
      if (to === from) continue;
      const next = replaceDice(body, from, to);
      if (next !== body) {
        body = next;
        scaled.push({ from, to });
      }
    }
  }
  return { body, scaled };
}

/** Builds the Room Chat cast payload. The DC is attached only when the
 *  spell forces a saving throw; `dcEdited` flags a value that differs
 *  from the card's own DC. */
export function buildCast(opts: {
  spellName: string;
  baseLevel: number;
  castLevel: number;
  dcInput: number | null;
  cardDc: number | null;
  detail: SpellDetail | null;
  /** Caster's total character level — scales cantrip dice. */
  characterLevel?: number | null;
}): ChatCast {
  const { spellName, baseLevel, castLevel, dcInput, cardDc, detail } = opts;
  const cast: ChatCast = {
    spellName,
    baseLevel,
    castLevel: baseLevel === 0 ? 0 : castLevel,
  };
  if (detail) {
    const { body, scaled } = scaleSpellText(
      detail,
      baseLevel,
      cast.castLevel,
      opts.characterLevel ?? null,
    );
    const description = detail.higher
      ? body + (body ? "\n\n" : "") + detail.higher
      : body;
    if (description) cast.description = description;
    if (scaled.length) cast.scaled = scaled;
    if (detail.meta) cast.meta = detail.meta;
    if (detail.source) cast.source = detail.source;
  }
  const hasSave = detail ? detail.hasSave : false;
  if (hasSave && dcInput != null && Number.isFinite(dcInput)) {
    cast.dc = dcInput;
    cast.dcEdited = cardDc == null || dcInput !== cardDc;
  }
  return cast;
}
