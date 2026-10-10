import OBR from "@owlbear-rodeo/sdk";
import { assetUrl } from "../../asset-base";
import { getLocalLang } from "../../state";
import { IS_MOBILE } from "../../feature-flags";
import {
  GM_TOOLS_SUITE_ID,
  suiteModeFilter,
  registerSuiteItem,
  unregisterSuiteItem,
  activateHiddenMode,
} from "../toolsSuite";

const TOOL_ID = "com.obr-suite/metadata-inspector";
const MODE_DEFAULT = `${TOOL_ID}/mode-default`;
const MODE_SCENE = `${TOOL_ID}/mode-scene`;
const MODE_ROOM = `${TOOL_ID}/mode-room`;
const MODE_PERFORMANCE = `${TOOL_ID}/mode-performance`;
const POPOVER_ITEM_ID = "com.obr-suite/metadata-inspector/item";
const POPOVER_META_ID = "com.obr-suite/metadata-inspector/meta";
const ICON_URL = assetUrl("metadata-inspector-icon.svg");
const ICON_SCENE_URL = assetUrl("metadata-inspector-scene-icon.svg");
const ICON_ROOM_URL = assetUrl("metadata-inspector-room-icon.svg");
const ICON_PERFORMANCE_URL = assetUrl("metadata-inspector-room-icon.svg");
const POPOVER_URL = assetUrl("metadata-inspector.html");
const INSPECTOR_MODES = new Set([MODE_DEFAULT, MODE_SCENE, MODE_ROOM, MODE_PERFORMANCE]);

export const BC_INSPECTOR_SET_MODE = "com.obr-suite/metadata-inspector/set-mode";

const ITEM_W = 320;
const ITEM_H = 360;

const META_W = 380;
const META_TOP_INSET = 12;
const META_BOTTOM_INSET = 12;

const unsubs: Array<() => void> = [];
let activeToolNow: string | null = null;
let activeModeNow: string = MODE_DEFAULT;
let itemPopoverOpen = false;
let metaPopoverOpen = false;
let lastInspectedItemId: string | null = null;

type MetaMode = "scene" | "room" | "performance";

async function itemAnchor(itemId: string): Promise<{ left: number; top: number }> {
  let vw = 1280;
  let vh = 720;
  try { vw = await OBR.viewport.getWidth(); } catch {}
  try { vh = await OBR.viewport.getHeight(); } catch {}
  let left = 8;
  let top = 8;
  try {
    const items = await OBR.scene.items.getItems([itemId]);
    if (items.length > 0) {
      const it = items[0] as any;
      const screen = await OBR.viewport.transformPoint({ x: it.position.x, y: it.position.y });
      left = screen.x + 20;
      top = screen.y - ITEM_H / 2;
    }
  } catch {}
  if (left + ITEM_W > vw - 8) left = vw - ITEM_W - 8;
  if (top + ITEM_H > vh - 8) top = vh - ITEM_H - 8;
  if (left < 8) left = 8;
  if (top < 8) top = 8;
  return { left, top };
}

async function metaAnchorAndSize(): Promise<{ anchor: { left: number; top: number }; height: number }> {
  let vw = 1280;
  let vh = 720;
  try { vw = await OBR.viewport.getWidth(); } catch {}
  try { vh = await OBR.viewport.getHeight(); } catch {}
  return {
    anchor: { left: Math.max(8, vw - META_W - META_TOP_INSET), top: META_TOP_INSET },
    height: Math.max(240, vh - META_TOP_INSET - META_BOTTOM_INSET),
  };
}

async function closeItemInspector(): Promise<void> {
  if (!itemPopoverOpen) return;
  itemPopoverOpen = false;
  lastInspectedItemId = null;
  try { await OBR.popover.close(POPOVER_ITEM_ID); } catch {}
}

async function closeMetaInspector(): Promise<void> {
  if (!metaPopoverOpen) return;
  metaPopoverOpen = false;
  try { await OBR.popover.close(POPOVER_META_ID); } catch {}
}

async function openItemInspector(itemId: string): Promise<void> {
  if (metaPopoverOpen) await closeMetaInspector();
  if (itemPopoverOpen) {
    try { await OBR.popover.close(POPOVER_ITEM_ID); } catch {}
    itemPopoverOpen = false;
  }
  const anchor = await itemAnchor(itemId);
  const url = `${POPOVER_URL}?mode=item&id=${encodeURIComponent(itemId)}`;
  try {
    await OBR.popover.open({
      id: POPOVER_ITEM_ID,
      url,
      width: ITEM_W,
      height: ITEM_H,
      anchorReference: "POSITION",
      anchorPosition: anchor,
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      hidePaper: true,
      disableClickAway: true,
    });
    itemPopoverOpen = true;
    lastInspectedItemId = itemId;
  } catch (e) {
    console.error("[metadata-inspector] open item popover failed", e);
  }
}

async function openMetaInspector(mode: MetaMode): Promise<void> {
  if (itemPopoverOpen) await closeItemInspector();
  if (metaPopoverOpen) {
    try {
      await OBR.broadcast.sendMessage(BC_INSPECTOR_SET_MODE, { mode }, { destination: "LOCAL" });
    } catch (e) {
      console.warn("[metadata-inspector] broadcast set-mode failed", e);
    }
    return;
  }
  const { anchor, height } = await metaAnchorAndSize();
  const url = `${POPOVER_URL}?mode=${mode}`;
  try {
    await OBR.popover.open({
      id: POPOVER_META_ID,
      url,
      width: META_W,
      height,
      anchorReference: "POSITION",
      anchorPosition: anchor,
      anchorOrigin: { horizontal: "LEFT", vertical: "TOP" },
      transformOrigin: { horizontal: "LEFT", vertical: "TOP" },
      hidePaper: true,
      disableClickAway: true,
    });
    metaPopoverOpen = true;
  } catch (e) {
    console.error("[metadata-inspector] open meta popover failed", e);
  }
}

async function isOurToolActive(): Promise<boolean> {
  if (activeToolNow !== null) {
    return activeToolNow === GM_TOOLS_SUITE_ID && INSPECTOR_MODES.has(activeModeNow);
  }
  try {
    const [tool, mode] = await Promise.all([OBR.tool.getActiveTool(), OBR.tool.getActiveToolMode()]);
    return tool === GM_TOOLS_SUITE_ID && INSPECTOR_MODES.has(mode ?? "");
  } catch { return false; }
}

async function syncItemFromSelection(): Promise<void> {
  let sel: string[] = [];
  try { sel = (await OBR.player.getSelection()) ?? []; } catch {}
  if (sel.length !== 1) {
    if (itemPopoverOpen) await closeItemInspector();
    return;
  }
  const id = sel[0];
  if (id === lastInspectedItemId && itemPopoverOpen) return;
  await openItemInspector(id);
}

export async function setupMetadataInspector(): Promise<void> {
  if (IS_MOBILE) {
    console.info("[metadata-inspector] mobile client — skipping setup");
    return;
  }
  const role = await OBR.player.getRole().catch(() => "PLAYER");
  if (role !== "GM") return;
  const en = getLocalLang() === "en";

  const inspectorIconFilter = suiteModeFilter(GM_TOOLS_SUITE_ID);

  try {
    await OBR.tool.createMode({
      id: MODE_DEFAULT,
      icons: [{ icon: ICON_URL, label: en ? "Select item (default) — popover follows selection" : "选物体（默认） — 选中物体即弹出，取消选中则收起", filter: inspectorIconFilter }],
      cursors: [{ cursor: "help" }],
      onActivate: () => {
        void closeMetaInspector();
        void syncItemFromSelection();
      },
    });
  } catch (e) {
    console.warn("[metadata-inspector] createMode default failed", e);
  }

  try {
    await OBR.tool.createMode({
      id: MODE_SCENE,
      icons: [{ icon: ICON_SCENE_URL, label: en ? "Scene metadata (OBR.scene.getMetadata)" : "场景元数据 (OBR.scene.getMetadata)", filter: inspectorIconFilter }],
      cursors: [{ cursor: "help" }],
      onActivate: () => { void openMetaInspector("scene"); },
    });
  } catch (e) {
    console.warn("[metadata-inspector] createMode scene failed", e);
  }

  try {
    await OBR.tool.createMode({
      id: MODE_ROOM,
      icons: [{ icon: ICON_ROOM_URL, label: en ? "Room metadata (OBR.room.getMetadata)" : "房间元数据 (OBR.room.getMetadata)", filter: inspectorIconFilter }],
      cursors: [{ cursor: "help" }],
      onActivate: () => { void openMetaInspector("room"); },
    });
  } catch (e) {
    console.warn("[metadata-inspector] createMode room failed", e);
  }

  try {
    await OBR.tool.createMode({
      id: MODE_PERFORMANCE,
      icons: [{ icon: ICON_PERFORMANCE_URL, label: en ? "Performance (FPS & memory)" : "性能指标 (FPS 和内存)", filter: inspectorIconFilter }],
      cursors: [{ cursor: "help" }],
      onActivate: () => { void openMetaInspector("performance"); },
    });
  } catch (e) {
    console.warn("[metadata-inspector] createMode performance failed", e);
  }

  registerSuiteItem({
    id: MODE_DEFAULT,
    suite: "gm",
    label: en ? "Metadata inspector" : "元数据检查",
    icon: ICON_URL,
    hint: en ? "Scene / room / item metadata" : "场景 / 房间 / 物体",
    onPick: async () => {
      await activateHiddenMode(GM_TOOLS_SUITE_ID, MODE_DEFAULT);
      try { await openMetaInspector("scene"); } catch {}
    },
  });

  const syncInspectorFromActive = async (): Promise<void> => {
    try {
      const [tool, mode] = await Promise.all([OBR.tool.getActiveTool(), OBR.tool.getActiveToolMode()]);
      const wasUs = activeToolNow === GM_TOOLS_SUITE_ID && INSPECTOR_MODES.has(activeModeNow);
      activeToolNow = tool;
      activeModeNow = mode ?? "";
      const isUs = tool === GM_TOOLS_SUITE_ID && INSPECTOR_MODES.has(activeModeNow);
      if (wasUs && !isUs) {
        void closeItemInspector();
        void closeMetaInspector();
      }
    } catch {}
  };
  try {
    const unsub = OBR.tool.onToolChange(() => { void syncInspectorFromActive(); });
    if (typeof unsub === "function") unsubs.push(unsub);
  } catch {}
  try {
    const unsub = OBR.tool.onToolModeChange(() => { void syncInspectorFromActive(); });
    if (typeof unsub === "function") unsubs.push(unsub);
  } catch {}
  try {
    await syncInspectorFromActive();
  } catch {}

  unsubs.push(
    OBR.player.onChange(async () => {
      if (!(await isOurToolActive())) return;
      if (activeModeNow !== MODE_DEFAULT) return;
      await syncItemFromSelection();
    }),
  );
}

export function teardownMetadataInspector(): void {
  for (const fn of unsubs.splice(0)) {
    try { fn(); } catch {}
  }
  void closeItemInspector();
  void closeMetaInspector();
  try { OBR.tool.removeMode(MODE_DEFAULT); } catch {}
  unregisterSuiteItem(MODE_DEFAULT);
  try { OBR.tool.removeMode(MODE_SCENE); } catch {}
  try { OBR.tool.removeMode(MODE_ROOM); } catch {}
  try { OBR.tool.removeMode(MODE_PERFORMANCE); } catch {}
}
