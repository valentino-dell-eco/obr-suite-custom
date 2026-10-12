// "Show token name" — the token context menu around the name plate
// drawn by the bubbles renderer (index.ts → buildNamePlate). Only
// while the scene setting is ON:
//   "Show token name" / "Hide token name" — per-token flag
//   "Edit name tag"                       — modal: token name + colour

import OBR, { type Item } from "@owlbear-rodeo/sdk";
import { assetUrl } from "../../asset-base";
import { getLocalLang } from "../../state";
import { NAME_SHOW_KEY, isShowTokenNameOn, onShowTokenNameChange } from "./index";

const PLUGIN_ID = "com.obr-suite/bubbles";
const CTX_SHOW = `${PLUGIN_ID}/name-show-menu`;
const CTX_HIDE = `${PLUGIN_ID}/name-hide-menu`;
const CTX_EDIT = `${PLUGIN_ID}/name-color-menu`;
export const NAME_COLOR_MODAL_ID = `${PLUGIN_ID}/name-color`;

let isGM = false;
let myId = "";
let menusOn = false;
const unsubs: Array<() => void> = [];

// --- Context menus -----------------------------------------------------------

/** Items this client may change: everything for the GM, own tokens
 *  for a player. */
function editable(items: Item[]): Item[] {
  return isGM ? items : items.filter((i) => (i as any).createdUserId === myId);
}

async function setShown(items: Item[], on: boolean): Promise<void> {
  const ids = editable(items).map((i) => i.id);
  if (!ids.length) return;
  try {
    await OBR.scene.items.updateItems(ids, (drafts) => {
      for (const d of drafts) {
        if (on) (d.metadata as any)[NAME_SHOW_KEY] = true;
        else delete (d.metadata as any)[NAME_SHOW_KEY];
      }
    });
  } catch (e) {
    console.warn("[bubbles/name] toggle failed", e);
  }
}

async function createMenus(): Promise<void> {
  if (menusOn) return;
  menusOn = true;
  const en = getLocalLang() === "en";
  try {
    await OBR.contextMenu.create({
      id: CTX_SHOW,
      icons: [{
        icon: assetUrl("name-tag-icon.svg"),
        label: en ? "Show token name" : "显示 token 名字",
        filter: {
          every: [{ key: "type", value: "IMAGE" }],
          some: [{ key: ["metadata", NAME_SHOW_KEY], operator: "!=", value: true }],
        },
      }],
      onClick: (ctx) => void setShown(ctx.items, true),
    });
    await OBR.contextMenu.create({
      id: CTX_HIDE,
      icons: [{
        icon: assetUrl("name-tag-icon.svg"),
        label: en ? "Hide token name" : "隐藏 token 名字",
        filter: {
          every: [{ key: "type", value: "IMAGE" }],
          some: [{ key: ["metadata", NAME_SHOW_KEY], value: true }],
        },
      }],
      onClick: (ctx) => void setShown(ctx.items, false),
    });
    await OBR.contextMenu.create({
      id: CTX_EDIT,
      icons: [{
        icon: assetUrl("name-color-icon.svg"),
        label: en ? "Edit name tag" : "编辑名字标签",
        filter: {
          every: [{ key: "type", value: "IMAGE" }],
          some: [{ key: ["metadata", NAME_SHOW_KEY], value: true }],
        },
      }],
      onClick: (ctx) => {
        const ids = editable(ctx.items)
          .filter((i) => (i.metadata as any)?.[NAME_SHOW_KEY] === true)
          .map((i) => i.id);
        if (!ids.length) return;
        void OBR.modal.open({
          id: NAME_COLOR_MODAL_ID,
          url: assetUrl(`name-color.html?ids=${encodeURIComponent(ids.join(","))}`),
          width: 320,
          height: ids.length === 1 ? 330 : 280,
        });
      },
    });
  } catch (e) {
    console.warn("[bubbles/name] context menu failed", e);
  }
}

async function removeMenus(): Promise<void> {
  if (!menusOn) return;
  menusOn = false;
  for (const id of [CTX_SHOW, CTX_HIDE, CTX_EDIT]) {
    try { await OBR.contextMenu.remove(id); } catch {}
  }
}

export async function setupNamePlate(): Promise<void> {
  try { isGM = (await OBR.player.getRole()) === "GM"; } catch {}
  try { myId = await OBR.player.getId(); } catch {}
  if (isShowTokenNameOn()) await createMenus();
  unsubs.push(onShowTokenNameChange((on) => {
    if (on) void createMenus();
    else void removeMenus();
  }));
  unsubs.push(OBR.player.onChange((p) => {
    isGM = p.role === "GM";
  }));
}

export async function teardownNamePlate(): Promise<void> {
  for (const u of unsubs.splice(0)) u();
  await removeMenus();
}
