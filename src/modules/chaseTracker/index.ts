// Chase Tracker — module lifecycle.
//
// Two OBR surfaces participate:
//
//   1. Two right-click context-menu entries (GM only):
//      - "Add to Chase as Quarry"     → starts a brand-new chase with
//        this token as the quarry.
//      - "Add to Chase as Pursuer"    → opens a small modal listing
//        every existing chase (by quarry name); picking one appends
//        this token as a pursuer.
//      Both entries disappear for a token the moment it's a member
//      of some chase (com.obr-suite/chase-tracker/memberOf gets
//      stamped on it). There is no "change position" menu entry —
//      distance editing lives inline in the dock itself (see below).
//
//   2. A draggable popover (chase-tracker.html) — same panel-layout
//      mechanics as every other movable popup in the suite (status
//      palette, HP bar, ...): default-anchored bottom-center, drag
//      handle persists a user offset via panelLayout, and it
//      participates in the layout editor / "reset positions" flow.
//      Only ever shown when there's at least one chase AND the
//      client isn't a mobile/phone one (same IS_MOBILE gate the
//      Character Sheet / status palette use). The page itself reads
//      scene metadata directly and re-renders on every change, so
//      this module only has to open/close/re-anchor it. Clicking a
//      pin (or that token's initiative turn starting) selects it and
//      opens an inline distance editor docked at the bottom of the
//      popover — no separate modal.

import OBR from "@owlbear-rodeo/sdk";
import { assetUrl } from "../../asset-base";
import { IS_MOBILE } from "../../feature-flags";
import { getLocalLang } from "../../state";
import {
  PANEL_IDS,
  getPanelOffset,
  getPanelSize,
  registerPanelBbox,
  BC_PANEL_DRAG_END,
  BC_PANEL_RESET,
} from "../../utils/panelLayout";
import { PLUGIN_ID, MEMBER_KEY, ChaseEntry } from "./types";
import {
  readChases,
  writeChases,
  genChaseId,
  stampMemberFlag,
  normalizeChase,
} from "./storage";

const CTX_ADD_QUARRY = `${PLUGIN_ID}/add-quarry`;
const CTX_ADD_PURSUER = `${PLUGIN_ID}/add-pursuer`;
const ICON_URL = assetUrl("chase-tracker-icon.svg");

const POPOVER_ID = `${PLUGIN_ID}/dock`;
const OVERLAY_URL = assetUrl("chase-tracker.html");
const MODAL_PURSUER_ID = `${PLUGIN_ID}/pursuer-picker`;
const PURSUER_URL = assetUrl("chase-tracker-pursuer.html");

// Default size; the layout editor's resize handle can override this
// per-client (see PANEL_IDS.chaseTracker in layout-editor.ts). Taller
// than before to leave room for the inline distance-editor strip.
const DOCK_W = 480;
// Tall enough that a single chase row — plus the inline distance
// editor, when open — never needs scrolling to show in full (the
// row's own content is also fully contained now, see track-wrap's
// margin-top in chase-tracker.html, so this is comfort-height, not
// a clipping fix).
const DOCK_H = 300;
const DOCK_INSET_BOTTOM = 16;

const unsubs: Array<() => void> = [];
let overlayOpen = false;
let pursuerModalOpen = false;
let isGM = false;

// Bottom-center default anchor + the user's stored drag offset —
// same dx/dy convention as every other panel in the suite (plain
// pixel delta added to the base left/top; see hpBar / statusTracker).
async function dockAnchor(): Promise<{ left: number; top: number; w: number; h: number }> {
  let vw = 1280, vh = 720;
  try { vw = await OBR.viewport.getWidth(); } catch {}
  try { vh = await OBR.viewport.getHeight(); } catch {}
  const size = getPanelSize(PANEL_IDS.chaseTracker);
  const w = size?.width ?? DOCK_W;
  const h = size?.height ?? DOCK_H;
  const off = getPanelOffset(PANEL_IDS.chaseTracker);
  const baseLeft = (vw - w) / 2;
  const baseTop = vh - h - DOCK_INSET_BOTTOM;
  const left = Math.min(Math.max(8, baseLeft + off.dx), vw - w - 8);
  const top = Math.min(Math.max(8, baseTop + off.dy), vh - h - 8);
  return { left, top, w, h };
}

async function refreshOverlay(): Promise<void> {
  if (IS_MOBILE) {
    await closeOverlay();
    return;
  }
  const chases = await readChases();
  if (chases.length > 0) await openOverlay();
  else await closeOverlay();
}

async function openOverlay(): Promise<void> {
  if (overlayOpen) return;
  const { left, top, w, h } = await dockAnchor();
  try {
    await OBR.popover.open({
      id: POPOVER_ID,
      url: OVERLAY_URL,
      width: w,
      height: h,
      anchorReference: "POSITION",
      anchorPosition: { left, top },
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      hidePaper: true,
      disableClickAway: true,
    });
    overlayOpen = true;
  } catch (e) {
    console.warn("[chase-tracker] open overlay failed", e);
  }
}

async function closeOverlay(): Promise<void> {
  if (!overlayOpen) return;
  overlayOpen = false;
  try { await OBR.popover.close(POPOVER_ID); } catch {}
}

async function openPursuerPicker(tokenId: string): Promise<void> {
  if (pursuerModalOpen) { try { await OBR.modal.close(MODAL_PURSUER_ID); } catch {} }
  try {
    await OBR.modal.open({
      id: MODAL_PURSUER_ID,
      url: `${PURSUER_URL}?token=${encodeURIComponent(tokenId)}`,
      width: 360,
      height: 420,
      hidePaper: true,
      hideBackdrop: false,
    });
    pursuerModalOpen = true;
  } catch (e) {
    console.warn("[chase-tracker] open pursuer picker failed", e);
  }
}

/** GM-only housekeeping: if a token that belonged to a chase was
 *  deleted from the scene, drop it from the chase (and the whole
 *  chase if that was its last member). Cheap no-op when nothing
 *  changed. */
async function sweepMissingTokens(): Promise<void> {
  if (!isGM) return;
  const chases = await readChases();
  if (chases.length === 0) return;
  const allIds = new Set(chases.flatMap((c) => c.participants.map((p) => p.tokenId)));
  if (allIds.size === 0) return;
  let existing: Set<string>;
  try {
    const items = await OBR.scene.items.getItems([...allIds]);
    existing = new Set(items.map((i) => i.id));
  } catch { return; }
  let changed = false;
  const next: ChaseEntry[] = [];
  for (const chase of chases) {
    const participants = chase.participants.filter((p) => existing.has(p.tokenId));
    if (participants.length !== chase.participants.length) changed = true;
    // A chase needs at least a quarry to make sense; drop it entirely
    // if the quarry itself was removed, or if nobody is left.
    const stillHasQuarry = participants.some((p) => p.role === "quarry");
    if (participants.length === 0 || !stillHasQuarry) {
      changed = true;
      continue;
    }
    next.push({ ...chase, participants });
  }
  if (changed) await writeChases(next);
}

async function registerContextMenus(): Promise<void> {
  const en = getLocalLang() === "en";
  try {
    await OBR.contextMenu.create({
      id: CTX_ADD_QUARRY,
      icons: [
        {
          icon: ICON_URL,
          label: en ? "Add to Chase as Quarry" : "加入追逐战（作为猎物）",
          filter: {
            roles: ["GM"],
            every: [
              { key: "type", value: "IMAGE" },
              { key: "layer", value: "MAP", operator: "!=" },
              { key: ["metadata", MEMBER_KEY], value: undefined },
            ],
            max: 1,
          },
        },
      ],
      onClick: async (ctx) => {
        const id = ctx.items[0]?.id;
        if (!id) return;
        const chases = await readChases();
        const chase: ChaseEntry = normalizeChase({
          id: genChaseId(),
          participants: [{ tokenId: id, role: "quarry", distance: 0 }],
          createdAt: Date.now(),
        });
        chases.push(chase);
        await writeChases(chases);
        await stampMemberFlag(id, chase.id);
      },
    });

    await OBR.contextMenu.create({
      id: CTX_ADD_PURSUER,
      icons: [
        {
          icon: ICON_URL,
          label: en ? "Add to Chase as Pursuer" : "加入追逐战（作为追击者）",
          filter: {
            roles: ["GM"],
            every: [
              { key: "type", value: "IMAGE" },
              { key: "layer", value: "MAP", operator: "!=" },
              { key: ["metadata", MEMBER_KEY], value: undefined },
            ],
            max: 1,
          },
        },
      ],
      onClick: async (ctx) => {
        const id = ctx.items[0]?.id;
        if (!id) return;
        const chases = await readChases();
        if (chases.length === 0) {
          try {
            await OBR.notification.show(
              en
                ? "No chase exists yet — add a Quarry first."
                : "还没有任何追逐战 —— 请先添加一个猎物。",
              "WARNING",
            );
          } catch {}
          return;
        }
        await openPursuerPicker(id);
      },
    });
  } catch (e) {
    console.warn("[chase-tracker] registerContextMenus failed", e);
  }
}

async function removeContextMenus(): Promise<void> {
  try { await OBR.contextMenu.remove(CTX_ADD_QUARRY); } catch {}
  try { await OBR.contextMenu.remove(CTX_ADD_PURSUER); } catch {}
}

export async function setupChaseTracker(): Promise<void> {
  try { isGM = (await OBR.player.getRole()) === "GM"; } catch {}
  unsubs.push(OBR.player.onChange((p) => { isGM = p.role === "GM"; }));

  await registerContextMenus();

  unsubs.push(OBR.scene.onMetadataChange(() => { void refreshOverlay(); }));
  unsubs.push(
    OBR.scene.items.onChange(() => { void sweepMissingTokens(); }),
  );
  unsubs.push(
    OBR.scene.onReadyChange((ready) => {
      if (ready) void refreshOverlay();
      else void closeOverlay();
    }),
  );

  // Panel-layout integration — bbox for the layout editor's proxy.
  registerPanelBbox(PANEL_IDS.chaseTracker, async () => {
    if (!overlayOpen) return null; // hide from layout editor when closed
    const { left, top, w, h } = await dockAnchor();
    return { left, top, width: w, height: h };
  });

  // Panel-drag-end → re-anchor popover at the new offset (OBR popover
  // has no setAnchor, so close + reopen).
  unsubs.push(
    OBR.broadcast.onMessage(BC_PANEL_DRAG_END, async (event) => {
      const data = event.data as { panelId?: string } | undefined;
      if (data?.panelId !== PANEL_IDS.chaseTracker) return;
      if (!overlayOpen) return;
      try { await OBR.popover.close(POPOVER_ID); } catch {}
      overlayOpen = false;
      await openOverlay();
    }),
  );
  // Panel-reset → restore default position.
  unsubs.push(
    OBR.broadcast.onMessage(BC_PANEL_RESET, async () => {
      if (!overlayOpen) return;
      try { await OBR.popover.close(POPOVER_ID); } catch {}
      overlayOpen = false;
      await openOverlay();
    }),
  );

  if (await OBR.scene.isReady()) {
    await sweepMissingTokens();
    await refreshOverlay();
  }
}

export async function teardownChaseTracker(): Promise<void> {
  for (const u of unsubs.splice(0)) {
    try { u(); } catch {}
  }
  await removeContextMenus();
  overlayOpen = false;
  pursuerModalOpen = false;
  try { await OBR.popover.close(POPOVER_ID); } catch {}
  try { await OBR.modal.close(MODAL_PURSUER_ID); } catch {}
}
