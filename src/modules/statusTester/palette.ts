// Status Tester — status palette popover + chip drag lifecycle
// (background side).
//
// The palette is a draggable popover that lists the library as chips.
// It is a layout-editor panel (PANEL_IDS.statusPalette): position and
// size are per-client overrides read at open time.
//
// Dragging a chip onto a token: the palette page broadcasts
// BC_DRAG_START once the pointer leaves a small deadzone; we open a
// fullscreen modal (status-tester-drop.html) that owns the rest of the
// gesture — the same hand-off the panel drag preview uses — and close
// it on BC_DRAG_END.

import OBR, { type Item } from "@owlbear-rodeo/sdk";
import { assetUrl } from "../../asset-base";
import {
  PANEL_IDS,
  getPanelOffset,
  getPanelSize,
  registerPanelBbox,
  BC_PANEL_DRAG_END,
  BC_PANEL_RESET,
} from "../../utils/panelLayout";
import { isFromSelf } from "../../utils/broadcastAuth";
import {
  BC_DRAG_DROP,
  BC_DRAG_END,
  BC_DRAG_READY,
  BC_DRAG_START,
  BC_DRAG_TARGETS,
  BC_PALETTE_CLOSE,
  DragTargetRect,
  canManage,
  isStatusToken,
  sanitizeDef,
  DROP_MODAL_ID,
  PALETTE_POPOVER_ID,
} from "./types";

const PALETTE_URL = assetUrl("status-tester-palette.html");
const DROP_URL = assetUrl("status-tester-drop.html");

const PALETTE_W = 300;
const PALETTE_H = 320;
/** Default spot: top-right, clear of OBR's right toolbar. */
const INSET_RIGHT = 72;
const INSET_TOP = 64;
const DROP_SAFETY_MS = 35_000;

let paletteOpen = false;
let dropOpen = false;
let dropSafety: ReturnType<typeof setTimeout> | null = null;
/** A release that arrived before the drop modal was listening; replayed
 *  when the modal reports ready. */
let pendingDrop: unknown = null;
/** Drop targets for the current drag, computed while the modal loads. */
let targetsP: Promise<DragTargetRect[]> | null = null;

async function computeTargets(): Promise<DragTargetRect[]> {
  let isGM = false;
  let playerId = "";
  try { isGM = (await OBR.player.getRole()) === "GM"; } catch {}
  try { playerId = await OBR.player.getId(); } catch {}
  let items: Item[] = [];
  try {
    items = await OBR.scene.items.getItems(
      (it) => isStatusToken(it) && canManage(it, isGM, playerId) && (isGM || it.visible !== false),
    );
  } catch {}
  const out: DragTargetRect[] = [];
  await Promise.all(
    items.map(async (it) => {
      try {
        const b = await OBR.scene.items.getItemBounds([it.id]);
        const [p1, p2] = await Promise.all([
          OBR.viewport.transformPoint(b.min),
          OBR.viewport.transformPoint(b.max),
        ]);
        const width = Math.abs(p2.x - p1.x);
        const height = Math.abs(p2.y - p1.y);
        if (width < 2 || height < 2) return;
        out.push({ id: it.id, left: Math.min(p1.x, p2.x), top: Math.min(p1.y, p2.y), width, height });
      } catch {}
    }),
  );
  return out;
}
const unsubs: Array<() => void> = [];

async function paletteAnchor(): Promise<{ left: number; top: number; w: number; h: number }> {
  let vw = 1280, vh = 720;
  try { vw = await OBR.viewport.getWidth(); } catch {}
  try { vh = await OBR.viewport.getHeight(); } catch {}
  const size = getPanelSize(PANEL_IDS.statusPalette);
  const w = Math.min(size?.width ?? PALETTE_W, Math.max(160, vw - 16));
  const h = Math.min(size?.height ?? PALETTE_H, Math.max(120, vh - 16));
  const off = getPanelOffset(PANEL_IDS.statusPalette);
  const left = Math.min(Math.max(8, vw - w - INSET_RIGHT + off.dx), vw - w - 8);
  const top = Math.min(Math.max(8, INSET_TOP + off.dy), vh - h - 8);
  return { left, top, w, h };
}

export async function openPalette(): Promise<void> {
  const { left, top, w, h } = await paletteAnchor();
  try {
    await OBR.popover.open({
      id: PALETTE_POPOVER_ID,
      // The palette owns the drag gesture (the browser keeps routing the
      // pointer to the frame the press started in), so it needs its own
      // viewport origin to report absolute cursor positions.
      url: `${PALETTE_URL}?ox=${Math.round(left)}&oy=${Math.round(top)}`,
      width: w,
      height: h,
      anchorReference: "POSITION",
      anchorPosition: { left, top },
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      hidePaper: true,
      disableClickAway: true,
    });
    paletteOpen = true;
  } catch (e) {
    console.warn("[status-tester] open palette failed", e);
  }
}

export async function closePalette(): Promise<void> {
  paletteOpen = false;
  try { await OBR.popover.close(PALETTE_POPOVER_ID); } catch {}
}

export async function togglePalette(): Promise<void> {
  if (paletteOpen) await closePalette();
  else await openPalette();
}

async function reanchor(): Promise<void> {
  if (!paletteOpen) return;
  try { await OBR.popover.close(PALETTE_POPOVER_ID); } catch {}
  paletteOpen = false;
  await openPalette();
}

async function closeDrop(): Promise<void> {
  pendingDrop = null;
  targetsP = null;
  if (dropSafety) { clearTimeout(dropSafety); dropSafety = null; }
  if (!dropOpen) return;
  dropOpen = false;
  try { await OBR.modal.close(DROP_MODAL_ID); } catch {}
}

export function setupPalette(): void {
  // Always report the expected bbox, open or not, so the layout editor
  // can place the panel even while it is closed.
  registerPanelBbox(PANEL_IDS.statusPalette, async () => {
    const { left, top, w, h } = await paletteAnchor();
    return { left, top, width: w, height: h };
  });
  unsubs.push(
    OBR.broadcast.onMessage(BC_PANEL_DRAG_END, (ev) => {
      const data = ev.data as { panelId?: string } | undefined;
      if (data?.panelId === PANEL_IDS.statusPalette) void reanchor();
    }),
  );
  unsubs.push(OBR.broadcast.onMessage(BC_PANEL_RESET, () => { void reanchor(); }));
  unsubs.push(
    OBR.broadcast.onMessage(BC_PALETTE_CLOSE, (ev) => {
      if (!isFromSelf(ev)) return;
      void closePalette();
    }),
  );

  unsubs.push(
    OBR.broadcast.onMessage(BC_DRAG_START, async (ev) => {
      if (!isFromSelf(ev)) return;
      const d = ev.data as { defId?: unknown; def?: unknown; x?: unknown; y?: unknown } | undefined;
      if (!d || typeof d.defId !== "string" || !d.defId) return;
      pendingDrop = null;
      // Start measuring tokens now, in parallel with the modal loading.
      targetsP = computeTargets();
      const seed: Record<string, unknown> = {};
      const def = sanitizeDef(d.def);
      if (def && def.id === d.defId) seed.def = def;
      if (typeof d.x === "number" && Number.isFinite(d.x) && typeof d.y === "number" && Number.isFinite(d.y)) {
        seed.x = d.x;
        seed.y = d.y;
      }
      const url = `${DROP_URL}?def=${encodeURIComponent(d.defId)}#${encodeURIComponent(JSON.stringify(seed))}`;
      try {
        if (dropOpen) { try { await OBR.modal.close(DROP_MODAL_ID); } catch {} }
        await OBR.modal.open({ id: DROP_MODAL_ID, url, fullScreen: true, hidePaper: true });
        dropOpen = true;
        if (dropSafety) clearTimeout(dropSafety);
        dropSafety = setTimeout(() => { void closeDrop(); }, DROP_SAFETY_MS);
      } catch (e) {
        console.warn("[status-tester] open drop modal failed", e);
      }
    }),
  );
  unsubs.push(
    OBR.broadcast.onMessage(BC_DRAG_DROP, (ev) => {
      if (!isFromSelf(ev)) return;
      // Kept even while the modal is still opening; cleared on START/END.
      pendingDrop = ev.data;
    }),
  );
  unsubs.push(
    OBR.broadcast.onMessage(BC_DRAG_READY, async (ev) => {
      if (!isFromSelf(ev)) return;
      // Targets first, then any release that beat the modal here.
      if (targetsP) {
        const targets = await targetsP;
        await OBR.broadcast.sendMessage(BC_DRAG_TARGETS, { targets }, { destination: "LOCAL" }).catch(() => {});
      }
      if (!pendingDrop) return;
      const data = pendingDrop;
      pendingDrop = null;
      void OBR.broadcast.sendMessage(BC_DRAG_DROP, data, { destination: "LOCAL" }).catch(() => {});
    }),
  );
  unsubs.push(
    OBR.broadcast.onMessage(BC_DRAG_END, (ev) => {
      if (!isFromSelf(ev)) return;
      void closeDrop();
    }),
  );
  unsubs.push(
    OBR.scene.onReadyChange((ready) => {
      if (!ready) { void closeDrop(); void closePalette(); }
    }),
  );
}

export async function teardownPalette(): Promise<void> {
  for (const u of unsubs.splice(0)) { try { u(); } catch {} }
  await closeDrop();
  await closePalette();
}
