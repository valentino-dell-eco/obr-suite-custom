import OBR from "@owlbear-rodeo/sdk";
import { assetUrl } from "../../asset-base";
import { getLocalLang } from "../../state";
import { addResource, deleteResource, updateResource } from "./storage";
import { Resource, PLUGIN_ID } from "./types";
import {
  registerSuiteItem,
  unregisterSuiteItem,
} from "../toolsSuite";

const MODAL_ID = `${PLUGIN_ID}/edit-modal`;
const MODAL_URL = assetUrl("resource-edit.html");

const TOAST_MODAL_ID = `${PLUGIN_ID}/toast-modal`;
const TOAST_URL = assetUrl("resource-toast.html");

const BC_OPEN_EDIT = `${PLUGIN_ID}/edit-open`;
const BC_SAVE = `${PLUGIN_ID}/edit-save`;
const BC_DELETE = `${PLUGIN_ID}/edit-delete`;
const BC_CANCEL = `${PLUGIN_ID}/edit-cancel`;

const PANEL_MODAL_ID = `${PLUGIN_ID}/tracker-panel`;
const PANEL_URL = assetUrl("resource-tracker.html");
const PANEL_TOOL_ID = `${PLUGIN_ID}/tracker-tool`;
const PANEL_ICON_URL = assetUrl("resource-tracker-icon.svg");
const PANEL_OPEN_KEY = `${PLUGIN_ID}/panel-open`;
const PANEL_SIDE_GAP = 64;
const MUI_DIALOG_MARGIN = 64;

const unsubs: Array<() => void> = [];
let modalOpen = false;
let toastOpen = false;
function isPanelOpen(): boolean {
  try { return localStorage.getItem(PANEL_OPEN_KEY) === "1"; } catch { return false; }
}

async function closeModal(): Promise<void> {
  if (!modalOpen) return;
  modalOpen = false;
  try { await OBR.modal.close(MODAL_ID); } catch {}
}

async function openToastOverlay(): Promise<void> {
  if (toastOpen) return;
  try {
    try { await OBR.modal.close(TOAST_MODAL_ID); } catch {}
    await OBR.modal.open({
      id: TOAST_MODAL_ID,
      url: TOAST_URL,
      fullScreen: true,
      hidePaper: true,
      hideBackdrop: true,
      disablePointerEvents: true,
    });
    toastOpen = true;
  } catch (e) {
    console.warn("[obr-suite/resources] open toast overlay failed", e);
  }
}

async function closeToastOverlay(): Promise<void> {
  if (!toastOpen) return;
  toastOpen = false;
  try { await OBR.modal.close(TOAST_MODAL_ID); } catch {}
}

async function openResourcePanel(): Promise<void> {
  try {
    let vw = 1280;
    let vh = 800;
    try {
      [vw, vh] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
    } catch {}
    await OBR.modal.open({
      id: PANEL_MODAL_ID,
      url: PANEL_URL,
      width: Math.max(360, Math.round(vw) - PANEL_SIDE_GAP * 2),
      height: Math.max(240, Math.round(vh) - MUI_DIALOG_MARGIN),
      hideBackdrop: true,
      hidePaper: true,
    });
    try { localStorage.setItem(PANEL_OPEN_KEY, "1"); } catch {}
  } catch (e) {
    console.error("[obr-suite/resources] openResourcePanel failed", e);
  }
}

async function closeResourcePanel(): Promise<void> {
  try { await OBR.modal.close(PANEL_MODAL_ID); } catch {}
  try { localStorage.removeItem(PANEL_OPEN_KEY); } catch {}
}

async function toggleResourcePanel(): Promise<void> {
  if (isPanelOpen()) await closeResourcePanel();
  else await openResourcePanel();
}

interface OpenPayload {
  itemId: string;
  resource?: Resource;
}

async function openModal(payload: OpenPayload): Promise<void> {
  if (!payload?.itemId) return;
  if (modalOpen) await closeModal();
  const hash = encodeURIComponent(JSON.stringify(payload));
  const url = `${MODAL_URL}#${hash}`;
  try {
    await OBR.modal.open({
      id: MODAL_ID,
      url,
      fullScreen: true,
      hidePaper: true,
      hideBackdrop: true,
    });
    modalOpen = true;
  } catch (e) {
    console.error("[obr-suite/resources] openModal failed", e);
  }
}

export async function setupResourceTracker(): Promise<void> {
  const en = getLocalLang() === "en";
  let role: "GM" | "PLAYER" = "PLAYER";
  try { role = (await OBR.player.getRole()) as "GM" | "PLAYER"; } catch {}
  if (role === "GM") {
    registerSuiteItem({
      id: PANEL_TOOL_ID,
      suite: "gm",
      label: en ? "Resource tracker" : "资源追踪",
      icon: PANEL_ICON_URL,
      onPick: () => toggleResourcePanel(),
    });
  }

  unsubs.push(
    OBR.broadcast.onMessage(BC_OPEN_EDIT, async (msg) => {
      const data = msg.data as OpenPayload | undefined;
      if (!data) return;
      await openModal(data);
    }),
  );

  unsubs.push(
    OBR.broadcast.onMessage(BC_SAVE, async (msg) => {
      const data = msg.data as { itemId: string; resource: Resource } | undefined;
      if (!data?.itemId || !data.resource) {
        await closeModal();
        return;
      }
      const { itemId, resource } = data;
      try {
        const updated = await updateResource(itemId, resource.id, () => resource);
        if (!updated) {
          await addResource(itemId, resource);
        }
      } catch (e) {
        console.error("[obr-suite/resources] save failed", e);
      }
      await closeModal();
    }),
  );

  unsubs.push(
    OBR.broadcast.onMessage(BC_DELETE, async (msg) => {
      const data = msg.data as { itemId: string; resourceId: string } | undefined;
      if (!data?.itemId || !data.resourceId) {
        await closeModal();
        return;
      }
      try {
        await deleteResource(data.itemId, data.resourceId);
      } catch (e) {
        console.error("[obr-suite/resources] delete failed", e);
      }
      await closeModal();
    }),
  );

  unsubs.push(
    OBR.broadcast.onMessage(BC_CANCEL, async () => {
      await closeModal();
    }),
  );

  unsubs.push(
    OBR.scene.onReadyChange(async (ready) => {
      if (ready) await openToastOverlay();
      else await closeToastOverlay();
    }),
  );
  try {
    const ready = await OBR.scene.isReady();
    if (ready) await openToastOverlay();
  } catch {}
}

export async function teardownResourceTracker(): Promise<void> {
  await closeModal();
  await closeToastOverlay();
  await closeResourcePanel();
  unregisterSuiteItem(PANEL_TOOL_ID);
  for (const u of unsubs.splice(0)) {
    try { u(); } catch {}
  }
}
