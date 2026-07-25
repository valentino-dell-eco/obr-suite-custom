import OBR from "@owlbear-rodeo/sdk";
import { getLocalLang } from "../../state";
import { t } from "../../i18n";
import { showChargesRollModal, ChargesRow, ModalHandle } from "./recovery-ui";
import {
  rollChargeResource,
  mergeRecoveryRollItems,
  BC_RECOVERY_ROLL_UPDATE,
  BC_RECOVERY_ROLL_CLOSED,
  RecoveryTriggerItem,
} from "./recovery";

// This page is opened via OBR.modal.open() from index.ts's
// BC_RECOVERY_TRIGGER listener (which itself runs inside the hidden
// background.html document — see the comment there for why the modal
// can't be rendered directly in that context).
//
// Being a genuine top-level OBR document, THIS document's OBR SDK
// handshake completes normally (OBR.isReady === true), so it can call
// OBR.scene.items.updateItems etc. directly via rollChargeResource.
//
// 2026-07 — while this modal is open, a SECOND recovery pass (GM
// presses LR/SR/etc. again) sends another BC_RECOVERY_TRIGGER. index.ts
// merges the new items into its own accumulator and forwards them here
// via BC_RECOVERY_ROLL_UPDATE (LOCAL-only — same client, so this
// top-level document receives it directly) instead of reopening the
// modal, which would otherwise fully reload this iframe and drop
// whatever the player had already rolled visually this session.

const MODAL_ID = "com.obr-suite/cc-recovery-roll";
const lang = getLocalLang();

let items: RecoveryTriggerItem[] = [];
// Resources the player has already rolled THIS modal session, keyed
// "itemId__resourceId". A later merged-in snapshot from a second GM
// trigger can still list these (the GM's own snapshot doesn't know
// about a roll that only happened locally on this client) — filtered
// out at render time so an already-recharged row never resurfaces and
// risks a double-roll on the same resource.
const rolledKeys = new Set<string>();
let handle: ModalHandle | null = null;

function rowKey(itemId: string, resourceId: string): string {
  return `${itemId}__${resourceId}`;
}

function notifyClosed(): void {
  try {
    OBR.broadcast.sendMessage(BC_RECOVERY_ROLL_CLOSED, {}, { destination: "LOCAL" });
  } catch {}
}

function closeForReal(): void {
  notifyClosed();
  void OBR.modal.close(MODAL_ID);
}

function buildRows(): ChargesRow[] {
  return items.flatMap((it) =>
    it.resources
      .filter((r) => !rolledKeys.has(rowKey(it.itemId, r.id)))
      .map(
        (r): ChargesRow => ({
          itemId: it.itemId,
          resourceId: r.id,
          name: r.name,
          current: r.current,
          max: r.max,
          formula: r.chargesFormula,
          onRecharge: async () => {
            const result = await rollChargeResource(it.itemId, {
              id: r.id,
              name: r.name,
              type: "charges",
              current: r.current,
              max: r.max,
              chargesFormula: r.chargesFormula,
              icon: "gem",
            } as any);
            if (!result) return null;
            rolledKeys.add(rowKey(it.itemId, r.id));
            return {
              current: result.resource.current,
              max: result.resource.max,
              total: result.total,
            };
          },
        }),
      ),
  );
}

function render(): void {
  const rows = buildRows();
  if (rows.length === 0) {
    // Everything either got rolled or was merged away — no reason to
    // leave an empty frame open.
    closeForReal();
    return;
  }
  // Tear down the previous overlay WITHOUT firing onClose (silent) —
  // this is an in-place refresh, not the player closing the modal.
  handle?.close({ silent: true });
  handle = showChargesRollModal({
    title: t(lang, "rcvChargesModalTitle"),
    rechargeLabel: t(lang, "rcvBtnRecharge"),
    closeLabel: t(lang, "reClose"),
    groups: [{ rows }],
    onClose: closeForReal,
  });
}

function readInitialPayload(): RecoveryTriggerItem[] {
  const params = new URLSearchParams(location.search);
  const raw = params.get("payload");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("[cc-recovery-roll] failed to parse payload", e);
    return [];
  }
}

OBR.onReady(async () => {
  items = readInitialPayload();
  if (items.length === 0) {
    closeForReal();
    return;
  }
  render();

  OBR.broadcast.onMessage(BC_RECOVERY_ROLL_UPDATE, (event) => {
    const payload = event.data as { items?: RecoveryTriggerItem[] } | undefined;
    if (!payload?.items?.length) return;
    items = mergeRecoveryRollItems(items, payload.items);
    render();
  });

  // Fallback for OBR's own close chrome (backdrop click, native X) —
  // pagehide fires regardless of how the modal iframe goes away, same
  // pattern background.ts already relies on for PANEL_OPEN_KEY.
  window.addEventListener("pagehide", notifyClosed);
});