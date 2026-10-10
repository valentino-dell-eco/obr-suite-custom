// Status Tester — modal openers (usable from background and pages).
import OBR from "@owlbear-rodeo/sdk";
import { assetUrl } from "../../asset-base";
import { LIBRARY_MODAL_ID, MANAGE_MODAL_ID } from "./types";

export async function openManageModal(tokenId: string): Promise<void> {
  try {
    await OBR.modal.open({
      id: MANAGE_MODAL_ID,
      url: assetUrl(`status-tester-manage.html?tokenId=${encodeURIComponent(tokenId)}`),
      width: 420,
      height: 520,
    });
  } catch (e) {
    console.warn("[status-tester] open manage modal failed", e);
  }
}

export async function openLibraryModal(): Promise<void> {
  try {
    await OBR.modal.open({
      id: LIBRARY_MODAL_ID,
      url: assetUrl("status-tester-library.html"),
      width: 520,
      height: 600,
    });
  } catch (e) {
    console.warn("[status-tester] open library modal failed", e);
  }
}
