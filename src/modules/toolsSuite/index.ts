// Tools Suite — two umbrella toolbar buttons that open a SIDE flyout
// menu (popover) anchored to the right-hand toolbar icon — NOT the
// native OBR top tool-mode bar.
//
// Why a popover instead of createMode/createAction:
//   1. OBR hides the top bar when a tool has only one mode.
//   2. Toggle buttons (character cards, resources) are not real modes.
//   3. The user wants the submenu beside the right sidebar, not on top.
//
// Flow:
//   click suite icon → open suite-menu.html popover (left of icon)
//   click a row → broadcast BC_SUITE_PICK → handler runs → close menu
//
// Canvas tools still register a HIDDEN createMode (icons filtered so
// they never appear in the top bar). Picking them from the menu calls
// activateMode(suiteId, modeId) so drag/click handlers keep working.
//
// Modules call registerSuiteItem() during setup.

import OBR from "@owlbear-rodeo/sdk";
import { assetUrl } from "../../asset-base";
import { getLocalLang } from "../../state";

export const TOOLS_SUITE_ID = "com.obr-suite/tools-suite";
export const GM_TOOLS_SUITE_ID = "com.obr-suite/gm-tools-suite";

/** Associate a mode with a suite tool so `activateMode(suiteId, modeId)`
 *  actually works. OBR ignores modes whose icon filter does not list
 *  the tool being activated — that was why GM menu clicks did nothing.
 *
 *  Side effect: while the suite tool is active, those modes appear on
 *  OBR's top bar. The suite icon itself still only opens the side
 *  menu (`return false`), so the top bar only shows after a pick. */
export function suiteModeFilter(suiteId: string) {
  return { activeTools: [suiteId] };
}

/** Tools on which suite keyboard shortcuts (tool actions) are live.
 *  OBR only fires an action's `shortcut` while the action is available
 *  for the ACTIVE tool, so the filter must list every tool the user is
 *  likely to be on — otherwise the keybind silently does nothing
 *  (the old filters missed the default Move tool, and CharacterCards
 *  used a never-matching id). Side effect: the action icon shows in
 *  the top bar of these tools. */
export const SHORTCUT_TOOLS: string[] = [
  "rodeo.owlbear.tool/move",
  "rodeo.owlbear.tool/select",
  TOOLS_SUITE_ID,
  GM_TOOLS_SUITE_ID,
];

/** @deprecated use suiteModeFilter(suiteId) — kept so old imports compile */
export const HIDDEN_MODE_FILTER = {
  activeTools: [GM_TOOLS_SUITE_ID],
} as const;

export const BC_SUITE_MENU_REQ = "com.obr-suite/suite-menu/req";
export const BC_SUITE_MENU_RES = "com.obr-suite/suite-menu/res";
export const BC_SUITE_PICK = "com.obr-suite/suite-menu/pick";
export const BC_SUITE_CLOSE = "com.obr-suite/suite-menu/close";

const MENU_POPOVER_SHARED = "com.obr-suite/tools-suite/menu";
const MENU_POPOVER_GM = "com.obr-suite/gm-tools-suite/menu";
const MENU_URL = assetUrl("suite-menu.html");

const ICON_SHARED = assetUrl("tools-suite-icon.svg");
const ICON_GM = assetUrl("gm-tools-suite-icon.svg");

export type SuiteKind = "shared" | "gm";

export type SuiteMenuItem = {
  id: string;
  suite: SuiteKind;
  label: string;
  icon: string;
  /** Optional short hint under the label */
  hint?: string;
  /** Called when the user picks this row in the flyout */
  onPick: () => void | Promise<void>;
};

const registry = new Map<string, SuiteMenuItem>();

/** Register (or replace) a row in the side flyout. Call from module setup. */
export function registerSuiteItem(item: SuiteMenuItem): void {
  registry.set(item.id, item);
}

export function unregisterSuiteItem(id: string): void {
  registry.delete(id);
}

/** Activate a suite tool + one of its modes (canvas / panel sync). */
export async function activateHiddenMode(
  suiteId: string,
  modeId: string,
): Promise<void> {
  try {
    await OBR.tool.activateTool(suiteId);
  } catch (e) {
    console.warn("[tools-suite] activateTool failed", suiteId, e);
  }
  try {
    await OBR.tool.activateMode(suiteId, modeId);
  } catch (e) {
    console.warn("[tools-suite] activateMode failed", suiteId, modeId, e);
  }
  try {
    const [tool, mode] = await Promise.all([
      OBR.tool.getActiveTool(),
      OBR.tool.getActiveToolMode(),
    ]);
    if (tool !== suiteId || mode !== modeId) {
      console.warn("[tools-suite] activation mismatch", {
        want: [suiteId, modeId],
        got: [tool, mode],
      });
    }
  } catch {}
}

export async function isSuiteModeActive(
  suiteId: string,
  modeId: string,
): Promise<boolean> {
  try {
    const [tool, mode] = await Promise.all([
      OBR.tool.getActiveTool(),
      OBR.tool.getActiveToolMode(),
    ]);
    return tool === suiteId && mode === modeId;
  } catch {
    return false;
  }
}

function itemsFor(suite: SuiteKind): Array<{
  id: string;
  label: string;
  icon: string;
  hint?: string;
}> {
  return [...registry.values()]
    .filter((i) => i.suite === suite)
    .map(({ id, label, icon, hint }) => ({ id, label, icon, hint }));
}

async function openMenu(
  suite: SuiteKind,
  elementId: string,
): Promise<void> {
  const id = suite === "gm" ? MENU_POPOVER_GM : MENU_POPOVER_SHARED;
  try {
    await OBR.popover.close(
      suite === "gm" ? MENU_POPOVER_SHARED : MENU_POPOVER_GM,
    );
  } catch {}
  try {
    await OBR.popover.close(id);
  } catch {}

  const count = itemsFor(suite).length;
  const height = Math.min(520, Math.max(120, 16 + count * 48));
  const width = 240;

  try {
    await OBR.popover.open({
      id,
      url: `${MENU_URL}?suite=${suite}`,
      width,
      height,
      anchorElementId: elementId,
      anchorOrigin: { horizontal: "LEFT", vertical: "CENTER" },
      transformOrigin: { horizontal: "RIGHT", vertical: "CENTER" },
      hidePaper: true,
      disableClickAway: false,
    });
  } catch (e) {
    console.warn("[tools-suite] open menu failed", e);
  }
}

async function closeMenus(): Promise<void> {
  try { await OBR.popover.close(MENU_POPOVER_SHARED); } catch {}
  try { await OBR.popover.close(MENU_POPOVER_GM); } catch {}
}

export async function setupToolsSuite(): Promise<void> {
  const en = getLocalLang() === "en";

  try {
    await OBR.tool.create({
      id: TOOLS_SUITE_ID,
      icons: [
        { icon: ICON_SHARED, label: en ? "Tools Suite" : "工具套件" },
      ],
      onClick: (_ctx, elementId) => {
        void openMenu("shared", elementId);
        return false;
      },
    });
  } catch (e) {
    console.warn("[tools-suite] create shared failed", e);
  }

  try {
    await OBR.tool.create({
      id: GM_TOOLS_SUITE_ID,
      icons: [
        {
          icon: ICON_GM,
          label: en ? "GM Tools Suite" : "GM 工具套件",
          filter: { roles: ["GM"] },
        },
      ],
      onClick: (_ctx, elementId) => {
        void openMenu("gm", elementId);
        return false;
      },
    });
  } catch (e) {
    console.warn("[tools-suite] create GM failed", e);
  }

  OBR.broadcast.onMessage(BC_SUITE_MENU_REQ, (event) => {
    const suite = (event.data as { suite?: SuiteKind } | undefined)?.suite;
    if (suite !== "shared" && suite !== "gm") return;
    void OBR.broadcast.sendMessage(
      BC_SUITE_MENU_RES,
      { suite, items: itemsFor(suite) },
      { destination: "LOCAL" },
    );
  });

  OBR.broadcast.onMessage(BC_SUITE_PICK, (event) => {
    const id = (event.data as { id?: string } | undefined)?.id;
    if (!id) return;
    const item = registry.get(id);
    if (!item) return;
    void (async () => {
      try {
        await item.onPick();
      } catch (e) {
        console.warn("[tools-suite] onPick failed", id, e);
      }
      await closeMenus();
    })();
  });

  OBR.broadcast.onMessage(BC_SUITE_CLOSE, () => {
    void closeMenus();
  });
}

export async function teardownToolsSuite(): Promise<void> {
  await closeMenus();
  registry.clear();
  try { await OBR.tool.remove(TOOLS_SUITE_ID); } catch {}
  try { await OBR.tool.remove(GM_TOOLS_SUITE_ID); } catch {}
}
