// Shared dice-formula parser/evaluator — used by resourceTracker's
// "charges" resources to roll a recovery formula ("2d4+1", "1d6", or
// a plain flat constant like "3") when a SR/LR/DW/DS recovery button
// is pressed. Deliberately NOT the full expression engine the dice
// panel uses internally (that one is tightly coupled to combo-roll UI
// state and isn't exported) — this is a small, self-contained subset
// that only needs to support sums of dice terms and/or flat constants.
//
// Grammar: a formula is one or more terms separated by + or -.
// Each term is either "NdM" (N defaults to 1 when omitted, e.g. "d6"
// == "1d6") or a plain non-negative integer constant.
//   "2d6+3"   -> two d6 + a flat +3
//   "1d4-1"   -> one d4, minus a flat 1
//   "5"       -> flat +5, no dice at all
//   "d8+2d4"  -> one d8 plus two d4

export interface RolledDie {
  sides: number;
  value: number;
}

export interface FormulaRollResult {
  /** Individual dice rolled, in formula order (always positive pips —
   *  a signed dice term only affects `total`, never the die's face
   *  value shown to the player). */
  dice: RolledDie[];
  /** Sum of every flat constant term (can be negative). */
  modifier: number;
  /** Sum of every signed dice term (can be negative if a term used
   *  a leading "-", e.g. "-1d4"). */
  diceTotal: number;
  /** diceTotal + modifier — the actual number of charges recovered. */
  total: number;
}

// Matches one signed term: optional +/-, then either "NdM"/"dM" or a
// plain integer. Case-insensitive so "D6" and "d6" both work.
const TERM_RE = /([+-]?)(\d*d\d+|\d+)/gi;

/** Returns null when the formula is empty/blank (caller should treat
 *  that as "no roll required, just restore straight to max") or when
 *  it has no parseable terms at all (malformed input — caller should
 *  leave the resource untouched rather than guessing). */
export function evaluateFormula(
  formula: string | null | undefined,
): FormulaRollResult | null {
  const raw = (formula ?? "").trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\s+/g, "");
  TERM_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  let matchedAny = false;
  let modifier = 0;
  let diceTotal = 0;
  const dice: RolledDie[] = [];
  while ((match = TERM_RE.exec(cleaned))) {
    matchedAny = true;
    const sign = match[1] === "-" ? -1 : 1;
    const term = match[2];
    if (/d/i.test(term)) {
      const [countStr, sidesStr] = term.split(/d/i);
      const count = countStr ? parseInt(countStr, 10) : 1;
      const sides = parseInt(sidesStr, 10);
      if (!Number.isFinite(count) || !Number.isFinite(sides) || sides <= 0 || count <= 0) {
        continue;
      }
      // Capped so a typo like "999d6" can't hang the tab.
      const safeCount = Math.min(count, 100);
      for (let i = 0; i < safeCount; i++) {
        const value = 1 + Math.floor(Math.random() * sides);
        dice.push({ sides, value });
        diceTotal += sign * value;
      }
    } else {
      const n = parseInt(term, 10);
      if (Number.isFinite(n)) modifier += sign * n;
    }
  }
  if (!matchedAny) return null;
  return { dice, modifier, diceTotal, total: diceTotal + modifier };
}
