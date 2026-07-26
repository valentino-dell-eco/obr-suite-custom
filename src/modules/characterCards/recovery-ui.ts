// Shared modal DOM builders for the recovery-buttons feature. Reused by
// panel-page.ts (global buttons) and info-page.ts (per-card buttons) so
// both look/behave identically instead of duplicating overlay markup.
// Visual language matches the existing "Paste JSON" overlay pattern in
// cc-panel.html (dark card #16213e, translucent border, blurred
// backdrop) — built dynamically here instead of static HTML because
// this feature needs several different body contents (confirm
// checkboxes, a per-resource recharge list, a grouped offline-owner
// list) that would otherwise mean 3+ near-duplicate static overlays.

export interface ModalButton {
  label: string;
  variant?: "primary" | "secondary";
  onClick: () => void | Promise<void>;
  /** Defaults to true — set false for a button that stays (e.g. none
   *  needed today, but keeps the helper generically reusable). */
  closesModal?: boolean;
}

export interface ModalHandle {
  /** `close({ silent: true })` removes the overlay WITHOUT calling
   *  opts.onClose — used when a caller wants to tear down and
   *  immediately rebuild the overlay in place (e.g. re-rendering with
   *  an updated row list) without signalling a real close upstream. */
  close: (opts?: { silent?: boolean }) => void;
  root: HTMLElement;
}

let zCounter = 1000;

export function showModal(opts: {
  title: string;
  bodyHtml: string;
  buttons: ModalButton[];
  /** Called once the modal's DOM exists, so the caller can wire up
   *  per-row listeners (event delegation) inside `bodyHtml`. */
  onMount?: (root: HTMLElement) => void;
  /** Width in px. Defaults to 360 (roomy enough for a resource list
   *  with a name + pips + a Recharge button per row). */
  width?: number;
  /** Called whenever this overlay closes (button, backdrop click, or
   *  handle.close()). Used by callers running in a real top-level OBR
   *  document (e.g. recovery-roll-page.ts) to also close the OBR
   *  modal chrome itself — this overlay closing on its own only
   *  removes the in-page DOM, not the surrounding OBR window. */
  onClose?: () => void;
  /** "overlay" (default) — full-viewport dark backdrop + a centered,
   *  bordered floating card. Correct for a modal drawn INSIDE a
   *  shared document that has other content around it (cc-panel.html,
   *  cc-info.html).
   *  "fullBleed" — the card fills the entire host document edge to
   *  edge, no backdrop, no centering, no border/radius. Use this when
   *  the host document IS ALREADY a single-purpose OBR modal/popover
   *  (e.g. cc-recovery-roll.html) — otherwise the player sees a
   *  floating card nested inside another modal frame, which reads as
   *  two stacked dialogs for one concept. */
  variant?: "overlay" | "fullBleed";
}): ModalHandle {
  const fullBleed = opts.variant === "fullBleed";
  const overlay = document.createElement("div");
  overlay.style.cssText = fullBleed
    ? `position: fixed; inset: 0; z-index: ${++zCounter}; display: flex;`
    : `
    position: fixed; inset: 0; z-index: ${++zCounter};
    background: rgba(0,0,0,0.6); backdrop-filter: blur(3px);
    display: flex; align-items: center; justify-content: center;
  `;
  const card = document.createElement("div");
  card.style.cssText = fullBleed
    ? `
    background: #16213e; width: 100%; height: 100%;
    padding: 18px; overflow-y: auto;
    display: flex; flex-direction: column; gap: 12px;
    font-family: inherit; color: #eee;
  `
    : `
    background: #16213e; border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px; padding: 18px; width: ${opts.width ?? 360}px;
    max-width: 90vw; max-height: 80vh; overflow-y: auto;
    display: flex; flex-direction: column; gap: 12px;
    font-family: inherit; color: #eee;
  `;
  const titleEl = document.createElement("div");
  titleEl.style.cssText = "font-size: 14px; font-weight: 700; color: #fff;";
  titleEl.textContent = opts.title;
  const bodyEl = document.createElement("div");
  bodyEl.style.cssText = "font-size: 12px; color: #ccc; display: flex; flex-direction: column; gap: 8px;";
  bodyEl.innerHTML = opts.bodyHtml;
  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display: flex; justify-content: flex-end; gap: 8px; margin-top: 4px;";

  function close(closeOpts?: { silent?: boolean }) {
    overlay.remove();
    if (!closeOpts?.silent) opts.onClose?.();
  }

  for (const b of opts.buttons) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = b.label;
    const primary = b.variant !== "secondary";
    btn.style.cssText = `
      padding: 6px 14px; border-radius: 6px; font-size: 12px; cursor: pointer;
      border: 1px solid ${primary ? "#5865f2" : "rgba(255,255,255,0.18)"};
      background: ${primary ? "#5865f2" : "transparent"};
      color: ${primary ? "#fff" : "#ccc"};
    `;
    btn.addEventListener("click", async () => {
      await b.onClick();
      if (b.closesModal !== false) close();
    });
    btnRow.appendChild(btn);
  }

  card.appendChild(titleEl);
  card.appendChild(bodyEl);
  card.appendChild(btnRow);
  overlay.appendChild(card);
  overlay.addEventListener("click", (e) => {
    if (!fullBleed && e.target === overlay) close();
  });
  document.body.appendChild(overlay);
  opts.onMount?.(card);
  return { close, root: card };
}

// --- Long Rest "also restore Dawn/Dusk?" confirm ---------------------

export function showLrExtraConfirm(opts: {
  hasDawn: boolean;
  hasDusk: boolean;
  title: string;
  bodyText: string;
  dawnLabel: string;
  duskLabel: string;
  continueLabel: string;
}): Promise<{ dawn: boolean; dusk: boolean }> {
  return new Promise((resolve) => {
    const rows: string[] = [`<div>${opts.bodyText}</div>`];
    if (opts.hasDawn) {
      rows.push(`<label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" data-extra="dawn" /> ${opts.dawnLabel}
      </label>`);
    }
    if (opts.hasDusk) {
      rows.push(`<label style="display:flex;align-items:center;gap:8px;cursor:pointer">
        <input type="checkbox" data-extra="dusk" /> ${opts.duskLabel}
      </label>`);
    }
    let dawn = false;
    let dusk = false;
    showModal({
      title: opts.title,
      bodyHtml: rows.join(""),
      width: 300,
      onMount: (root) => {
        root.querySelector<HTMLInputElement>('input[data-extra="dawn"]')
          ?.addEventListener("change", (e) => { dawn = (e.target as HTMLInputElement).checked; });
        root.querySelector<HTMLInputElement>('input[data-extra="dusk"]')
          ?.addEventListener("change", (e) => { dusk = (e.target as HTMLInputElement).checked; });
      },
      buttons: [
        {
          label: opts.continueLabel,
          onClick: () => resolve({ dawn, dusk }),
        },
      ],
    });
  });
}

// --- Charges recharge list (per-card local modal, or GM's offline-
//     owner modal — both use the same row shape, optionally grouped) ---

export interface ChargesRow {
  itemId: string;
  resourceId: string;
  name: string;
  current: number;
  max: number;
  formula: string;
  onRecharge: () => Promise<{ current: number; max: number; total: number } | null>;
}

export interface ChargesGroup {
  /** Omit for a flat (ungrouped) list — used by the per-card modal.
   *  Set (e.g. "Erika (offline)") for the GM's offline-owner modal. */
  label?: string;
  rows: ChargesRow[];
}

function rowKey(itemId: string, resourceId: string): string {
  return `${itemId}__${resourceId}`;
}

export function showChargesRollModal(opts: {
  title: string;
  rechargeLabel: string;
  closeLabel: string;
  groups: ChargesGroup[];
  onClose?: () => void;
  variant?: "overlay" | "fullBleed";
}): ModalHandle {
  const bodyParts: string[] = [];
  for (const g of opts.groups) {
    if (g.label) {
      bodyParts.push(`<div style="font-weight:600;color:#fff;margin-top:4px">${g.label}</div>`);
    }
    for (const r of g.rows) {
      const key = rowKey(r.itemId, r.resourceId);
      bodyParts.push(`
        <div class="chg-row" data-key="${key}" style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:rgba(255,255,255,0.04);border-radius:6px;padding:6px 8px;">
          <div style="min-width:0">
            <div style="color:#eee;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.name}</div>
            <div class="chg-meta" style="color:#999;font-size:11px">${r.current} / ${r.max} · ${r.formula}</div>
          </div>
          <button type="button" class="chg-recharge-btn" data-key="${key}" style="flex:none;padding:4px 10px;border-radius:5px;font-size:11px;cursor:pointer;border:1px solid #5865f2;background:#5865f2;color:#fff;">${opts.rechargeLabel}</button>
        </div>
      `);
    }
  }
  const rowByKey = new Map<string, ChargesRow>();
  for (const g of opts.groups) for (const r of g.rows) rowByKey.set(rowKey(r.itemId, r.resourceId), r);

  const handle = showModal({
    title: opts.title,
    bodyHtml: bodyParts.join(""),
    width: 340,
    buttons: [{ label: opts.closeLabel, variant: "secondary", onClick: () => {} }],
    onClose: opts.onClose,
    variant: opts.variant,
    onMount: (root) => {
      root.querySelectorAll<HTMLButtonElement>(".chg-recharge-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const key = btn.dataset.key;
          const row = key ? rowByKey.get(key) : undefined;
          if (!row || btn.disabled) return;
          btn.disabled = true;
          btn.style.opacity = "0.5";
          const result = await row.onRecharge();
          if (result) {
            const wrapper = root.querySelector<HTMLElement>(`.chg-row[data-key="${key}"]`);
            const meta = wrapper?.querySelector<HTMLElement>(".chg-meta");
            if (meta) meta.textContent = `${result.current} / ${result.max} (+${result.total})`;
          }
          btn.textContent = "✓";
        });
      });
    },
  });
  return handle;
}