// Graphic preview of what a cast / feature use will spend, drawn with
// the resource's own Resource Tracker icon instead of a bare number.
//
//   * pip resources (count / die roll / charges / hit dice / one spell
//     slot level, up to MAX_PIPS): one icon per use — available ones
//     full, the ones about to be spent highlighted, used ones dimmed.
//     Clicking an available pip spends from there to the last one
//     (amount = current − pos + 1).
//   * bar / number / very large pools: icon + "current → after / max"
//     with − / + steppers.
//
// Returns an HTML string (plain DOM page + Preact via innerHTML); the
// caller delegates clicks on [data-pip] / [data-step].

import { ICON_LIBRARY } from "../resourceTracker/icons";
import type { IconId } from "../resourceTracker/types";

const MAX_PIPS = 20;

export interface SpendVisualInput {
  type: string;
  icon?: string;
  current: number;
  max: number;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function isPipResource(r: SpendVisualInput): boolean {
  const pipType = r.type === "count" || r.type === "dieRoll" || r.type === "charges" ||
    r.type === "hitDice" || r.type === "slot";
  return pipType && r.max > 0 && r.max <= MAX_PIPS;
}

/** Largest amount that makes sense for this resource. */
export function maxSpend(r: SpendVisualInput): number {
  return Math.max(1, Math.floor(r.current));
}

export function spendVisualHtml(
  r: SpendVisualInput,
  amount: number,
  opts: { interactive?: boolean; titleSpend?: string } = {},
): string {
  const icon = ICON_LIBRARY[(r.icon ?? "gem") as IconId] ?? ICON_LIBRARY.gem;
  const cur = Math.max(0, Math.floor(r.current));
  const max = Math.max(0, Math.floor(r.max));
  const amt = Math.max(0, Math.min(cur, Math.floor(amount)));
  const after = cur - amt;
  const interactive = opts.interactive !== false;
  if (isPipResource(r)) {
    const pips: string[] = [];
    for (let i = 1; i <= max; i++) {
      const state = i <= after ? "full" : i <= cur ? "spending" : "spent";
      const click = interactive && i <= cur ? ` data-pip="${i}" role="button"` : "";
      pips.push(`<span class="sv-pip ${state}"${click}>${icon}</span>`);
    }
    return `<div class="sv sv-pips" ${opts.titleSpend ? `title="${esc(opts.titleSpend)}"` : ""}>
      <span class="sv-pips-row">${pips.join("")}</span>
      <span class="sv-count">${cur} → <b>${after}</b> / ${max}</span>
    </div>`;
  }
  return `<div class="sv sv-num">
    ${interactive ? `<button type="button" class="sv-step" data-step="-1">−</button>` : ""}
    <span class="sv-icon">${icon}</span>
    <span class="sv-amt">−${amt}</span>
    ${interactive ? `<button type="button" class="sv-step" data-step="1">+</button>` : ""}
    <span class="sv-count">${cur} → <b>${after}</b> / ${max}</span>
  </div>`;
}

/** The amount a click inside the visual asks for, or null. */
export function amountFromClick(
  target: EventTarget | null,
  r: SpendVisualInput,
  amount: number,
): number | null {
  const el = (target as HTMLElement | null)?.closest<HTMLElement>("[data-pip],[data-step]");
  if (!el) return null;
  const cur = Math.max(0, Math.floor(r.current));
  if (el.dataset.pip) {
    const pos = parseInt(el.dataset.pip, 10);
    return Math.max(1, Math.min(cur, cur - pos + 1));
  }
  const step = parseInt(el.dataset.step ?? "0", 10);
  return Math.max(1, Math.min(maxSpend(r), amount + step));
}

/** Shared CSS (each page injects it once). */
export const SPEND_VISUAL_CSS = `
.sv{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:6px;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,0.22);border:1px solid rgba(255,255,255,0.10)}
.sv-pips-row{display:flex;flex-wrap:wrap;gap:4px;align-items:center;flex:1;min-width:0}
.sv-pip{width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:5px;transition:transform .1s,filter .1s,opacity .1s}
.sv-pip svg{width:20px;height:20px;pointer-events:none}
.sv-pip.full{opacity:1}
.sv-pip.spending{box-shadow:0 0 0 2px #ff7a6b inset;background:rgba(231,76,60,0.22);opacity:.9}
.sv-pip.spent{filter:saturate(0.15) brightness(0.55);opacity:.45}
.sv-pip[data-pip]{cursor:pointer}
.sv-pip[data-pip]:hover{transform:scale(1.12)}
.sv-count{flex:none;font-size:11px;color:#9aa0b3;font-variant-numeric:tabular-nums}
.sv-count b{color:#ff9d90}
.sv-icon{width:24px;height:24px;display:inline-flex}
.sv-icon svg{width:24px;height:24px}
.sv-amt{font-size:13px;font-weight:800;color:#ff9d90;min-width:28px;text-align:center}
.sv-step{width:26px;height:26px;border-radius:6px;border:1px solid rgba(255,255,255,0.18);background:#1a2036;color:#e6e8ee;font-weight:800;cursor:pointer}
.sv-step:hover{border-color:#5dade2}
`;

let injected = false;
export function ensureSpendVisualStyles(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const st = document.createElement("style");
  st.textContent = SPEND_VISUAL_CSS;
  document.head.appendChild(st);
}
