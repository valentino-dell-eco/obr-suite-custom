/* Transform (变身 / polymorph) module — background side.
 *
 * Right-click a CHARACTER token you own → "变身" → opens the form
 * picker popover. On confirm the popover broadcasts BC_APPLY_FORM and
 * THIS module runs the transform on the canvas:
 *
 *   1. Snapshot the token's current {image, grid, scale, name, text,
 *      bestiary-slug} and PUSH it onto a transform stack stored in the
 *      token's own metadata (com.obr-suite/transform:stack).
 *   2. (Phase 2) play the stage-1 effect.
 *   3. At the midpoint, swap image / grid / scale / name to the new
 *      form. (Phase 2 also swaps bestiary data + bubbles HP/AC.)
 *   4. (Phase 2) play the stage-2 effect.
 *
 * "解除变身" pops the top snapshot and restores it — so nested
 * transforms (A → B → revert → A → revert → original) work.
 *
 * Ownership model: each player transforms tokens THEY created
 * (createdUserId === own id); the GM can transform anything. The image
 * swap is a real item mutation, so every client sees the new form —
 * this is polymorph, not a per-viewer illusion.
 */

import OBR, { buildImage } from "@owlbear-rodeo/sdk";
import type { Image, Item } from "@owlbear-rodeo/sdk";
import { assetUrl } from "../../asset-base";
import { getLocalLang } from "../../state";
import { initBroadcastAuth, isFromSelf } from "../../utils/broadcastAuth";

// Dev-only module; per-client language read once at init (context menus
// register at boot, so a live re-render isn't needed).
const en = getLocalLang() === "en";

// NOTE: all metadata / broadcast / popover keys are written as FULL
// literal "com.obr-suite/…" strings (not built from a PLUGIN_ID
// constant). The dev build's namespace-isolation vite plugin rewrites
// the literal substring "com.obr-suite/" → "com.obr-suite-dev/" so the
// dev install doesn't collide with stable in a shared room. A
// template-literal `${PLUGIN_ID}/…` would slip past that rewrite.
const POPOVER_ID = "com.obr-suite/transform/picker";
const PAGE_URL = assetUrl("transform.html");

// The transform stack: an ARRAY of snapshots on the token's metadata.
// Top of stack = the form most recently applied. Empty / absent =
// the token is in its original (un-transformed) state.
const META_STACK = "com.obr-suite/transform:stack";
// Reused from the bestiary module — swapping a form may also point the
// token at a monster stat-block. The dev plugin does NOT rewrite
// "com.bestiary/" (only "com.obr-suite/"), so this key is shared
// dev↔stable, exactly like the bestiary module's own usage.
const BESTIARY_SLUG_KEY = "com.bestiary/slug";

const CTX_TRANSFORM = "com.obr-suite/transform/ctx-transform";
const CTX_REVERT = "com.obr-suite/transform/ctx-revert";

// Popover → background: "apply this form to this token".
const BC_APPLY_FORM = "com.obr-suite/transform:apply";
// Bestiary picker (transform mode) → background: the user picked a
// monster to morph INTO. Carries the monster's token image + size.
const BC_TRANSFORM_PICK = "com.obr-suite/transform:pick";
// We reuse the bestiary panel as the form picker (opened as a modal
// with ?transformForItemId=). Far better UX than pasting a direct
// image URL — the user just searches the monster manual.
const PICKER_MODAL_ID = "com.obr-suite/transform/bestiary-picker";
const BESTIARY_PANEL_URL = assetUrl("bestiary-panel.html");

const ICON_URL = assetUrl("transform-icon.svg");

// ---- Form + snapshot shapes ----------------------------------------

/** A form the user wants to morph INTO. Built by the picker popover
 *  (ad-hoc: pasted image URL + size; Phase 2: preset library entries
 *  carry effect ids + bestiary slug too). */
export interface TransformForm {
  image: { url: string; width: number; height: number; mime: string };
  /** Grid-cell footprint (1 = Medium, 2 = Large, …). Maps to scale. */
  footprint: number;
  name: string;
  /** Optional bestiary slug to bind on top of the new form (Phase 2). */
  bestiarySlug?: string | null;
  /** Human label for the "解除变身 → back to <label>" affordance. */
  label?: string;
}

/** Everything we need to restore the token to how it looked BEFORE a
 *  transform. Stored (as plain JSON) on the stack. */
interface TransformSnapshot {
  image: { url: string; width: number; height: number; mime: string };
  grid: { dpi: number; offset: { x: number; y: number } };
  scale: { x: number; y: number };
  name: string;
  /** OBR-native plainText label (token name text), if any. */
  text: any | null;
  /** com.bestiary/slug at snapshot time (null if unbound). */
  bestiarySlug: string | null;
  /** Label of the form that was applied on top of this snapshot. */
  appliedLabel?: string;
  ts: number;
}

let myRole: "GM" | "PLAYER" = "PLAYER";
let myId: string | null = null;
const unsubs: Array<() => void> = [];

// ---- helpers --------------------------------------------------------

function isImage(item: Item | undefined | null): item is Image {
  return !!item && item.type === "IMAGE";
}

/** May the current user transform this token? GM = anything; player =
 *  only tokens they created. Mirrors bestiary's ownsItem check. */
function canControl(item: Item | undefined | null): boolean {
  if (!item) return false;
  if (myRole === "GM") return true;
  return !!(myId && item.createdUserId === myId);
}

function readStack(item: Item): TransformSnapshot[] {
  const raw = (item.metadata as any)?.[META_STACK];
  return Array.isArray(raw) ? (raw as TransformSnapshot[]) : [];
}

function mimeFromUrl(url: string): string {
  const u = url.split("?")[0].toLowerCase();
  if (u.endsWith(".png")) return "image/png";
  if (u.endsWith(".jpg") || u.endsWith(".jpeg")) return "image/jpeg";
  if (u.endsWith(".gif")) return "image/gif";
  if (u.endsWith(".webp")) return "image/webp";
  if (u.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

// ---- core engine ----------------------------------------------------

/** Snapshot the token's current visual state, push it on the stack,
 *  and swap to the new form. Image/grid/scale/name change for everyone
 *  (real item mutation). Effects + bestiary binding land in Phase 2. */
async function applyTransform(itemId: string, form: TransformForm): Promise<void> {
  let item: Item | undefined;
  try {
    const arr = await OBR.scene.items.getItems([itemId]);
    item = arr[0];
  } catch (e) {
    console.warn("[transform] getItems failed", e);
    return;
  }
  if (!isImage(item)) return;
  if (!canControl(item)) {
    try { await OBR.notification.show(en ? "You don't have permission to transform this token" : "你没有权限变身这个 token", "WARNING"); } catch {}
    return;
  }

  // Build the snapshot from the LIVE item before we mutate it.
  const img = item.image;
  const snap: TransformSnapshot = {
    image: {
      url: img.url,
      width: img.width,
      height: img.height,
      mime: img.mime,
    },
    grid: {
      dpi: item.grid.dpi,
      offset: { x: item.grid.offset.x, y: item.grid.offset.y },
    },
    scale: { x: item.scale.x, y: item.scale.y },
    name: item.name,
    text: (item as any).text ?? null,
    bestiarySlug:
      typeof (item.metadata as any)?.[BESTIARY_SLUG_KEY] === "string"
        ? ((item.metadata as any)[BESTIARY_SLUG_KEY] as string)
        : null,
    appliedLabel: form.label ?? form.name,
    ts: Date.now(),
  };

  // New form's grid math — pin dpi to the new image width so it
  // occupies one grid cell at footprint 1, then scale up. Mirrors
  // bestiary/spawn.ts so transformed tokens align with spawned ones.
  const newDpi = form.image.width;
  const newOffset = { x: form.image.width / 2, y: form.image.height / 2 };
  const footprint = Math.max(0.25, form.footprint || 1);

  try {
    await OBR.scene.items.updateItems([itemId], (drafts) => {
      for (const d of drafts) {
        const stack = readStack(d as Item);
        stack.push(snap);
        (d.metadata as any)[META_STACK] = stack;

        const di = d as Image;
        di.image = {
          url: form.image.url,
          width: form.image.width,
          height: form.image.height,
          mime: form.image.mime,
        };
        di.grid = { dpi: newDpi, offset: newOffset };
        di.scale = { x: footprint, y: footprint };
        d.name = form.name;
        // Keep the OBR plainText label in sync with the new name when
        // the token already shows one.
        const anyD = d as any;
        if (anyD.text && typeof anyD.text === "object") {
          anyD.text = { ...anyD.text, plainText: form.name };
        }
      }
    });
  } catch (e) {
    console.error("[transform] applyTransform updateItems failed", e);
  }
}

/** Pop the top snapshot and restore it. No-op if the stack is empty
 *  (token is already in its original form). */
async function revertTransform(itemId: string): Promise<void> {
  let item: Item | undefined;
  try {
    const arr = await OBR.scene.items.getItems([itemId]);
    item = arr[0];
  } catch (e) {
    console.warn("[transform] revert getItems failed", e);
    return;
  }
  if (!isImage(item)) return;
  if (!canControl(item)) {
    try { await OBR.notification.show(en ? "You don't have permission to revert this token" : "你没有权限解除这个 token 的变身", "WARNING"); } catch {}
    return;
  }
  const stack = readStack(item);
  if (stack.length === 0) return;

  try {
    await OBR.scene.items.updateItems([itemId], (drafts) => {
      for (const d of drafts) {
        const s = readStack(d as Item);
        const snap = s.pop();
        if (!snap) continue;
        if (s.length > 0) (d.metadata as any)[META_STACK] = s;
        else delete (d.metadata as any)[META_STACK];

        const di = d as Image;
        di.image = { ...snap.image };
        di.grid = { dpi: snap.grid.dpi, offset: { ...snap.grid.offset } };
        di.scale = { ...snap.scale };
        d.name = snap.name;
        const anyD = d as any;
        if (snap.text) anyD.text = snap.text;
        // Restore (or clear) the bestiary slug to match the snapshot.
        if (snap.bestiarySlug) {
          (d.metadata as any)[BESTIARY_SLUG_KEY] = snap.bestiarySlug;
        } else {
          delete (d.metadata as any)[BESTIARY_SLUG_KEY];
        }
      }
    });
  } catch (e) {
    console.error("[transform] revertTransform updateItems failed", e);
  }
}

// ---- monster picker (reuses the bestiary panel) ---------------------

// Open the bestiary panel as a modal in transform mode. Picking a
// monster there broadcasts BC_TRANSFORM_PICK back to us.
async function openMonsterPicker(itemId: string): Promise<void> {
  try {
    await OBR.modal.open({
      id: PICKER_MODAL_ID,
      url: `${BESTIARY_PANEL_URL}?transformForItemId=${encodeURIComponent(itemId)}`,
      width: 400,
      height: 600,
    });
  } catch (e) {
    console.warn("[transform] open monster picker failed", e);
  }
}

async function closeMonsterPicker(): Promise<void> {
  try { await OBR.modal.close(PICKER_MODAL_ID); } catch {}
}

// D&D 5e creature-size → grid-cell footprint (mirrors bestiary/spawn.ts).
function footprintForSize(size: string | undefined): number {
  const s = String(size ?? "").trim();
  const lower = s.toLowerCase();
  if (s === "L" || s === "大型" || lower === "large") return 2;
  if (s === "H" || s === "巨型" || lower === "huge") return 3;
  if (s === "G" || s === "超巨型" || lower === "gargantuan") return 4;
  return 1; // Tiny / Small / Medium (+ unknown) → 1 cell
}

// Probe an image's natural dimensions. Background iframe has a DOM, so
// `new Image()` works; crossOrigin isn't needed just to read the size.
function probeImageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth || 150, h: img.naturalHeight || 150 });
      img.onerror = () => resolve({ w: 150, h: 150 });
      img.src = url;
    } catch { resolve({ w: 150, h: 150 }); }
  });
}

// ---- setup / teardown ----------------------------------------------

export async function setupTransform(): Promise<void> {
  await initBroadcastAuth();
  try { myRole = (await OBR.player.getRole()) as "GM" | "PLAYER"; } catch {}
  try { myId = await OBR.player.getId(); } catch {}

  // "变身" — visible on any single CHARACTER image. Ownership is
  // re-checked in the handler (OBR filters can't express
  // createdUserId === self).
  try {
    await OBR.contextMenu.create({
      id: CTX_TRANSFORM,
      icons: [
        {
          icon: ICON_URL,
          label: en ? "Transform" : "变身",
          filter: {
            every: [
              { key: "type", value: "IMAGE" },
              { key: "layer", value: "CHARACTER" },
            ],
            max: 1,
          },
        },
      ],
      onClick: (ctx) => {
        const id = ctx.items[0]?.id;
        if (!id) return;
        if (!canControl(ctx.items[0] as Item)) {
          void OBR.notification.show(en ? "You can only transform your own tokens" : "只能变身你自己的 token", "WARNING");
          return;
        }
        void openMonsterPicker(id);
      },
    });
  } catch (e) {
    console.warn("[transform] create CTX_TRANSFORM failed", e);
  }

  // "解除变身" — only on tokens that actually have a transform stack.
  try {
    await OBR.contextMenu.create({
      id: CTX_REVERT,
      icons: [
        {
          icon: ICON_URL,
          label: en ? "Revert" : "解除变身",
          filter: {
            every: [
              { key: "type", value: "IMAGE" },
              { key: ["metadata", META_STACK], operator: "!=", value: undefined },
            ],
            max: 1,
          },
        },
      ],
      onClick: (ctx) => {
        const id = ctx.items[0]?.id;
        if (!id) return;
        if (!canControl(ctx.items[0] as Item)) {
          void OBR.notification.show(en ? "You can only revert your own tokens" : "只能解除你自己 token 的变身", "WARNING");
          return;
        }
        void revertTransform(id);
      },
    });
  } catch (e) {
    console.warn("[transform] create CTX_REVERT failed", e);
  }

  // Bestiary picker (transform mode) → apply the chosen monster's
  // token image + size to the token, then close the picker.
  try {
    const u = OBR.broadcast.onMessage(BC_TRANSFORM_PICK, async (event) => {
      if (!isFromSelf(event)) return; // LOCAL from our bestiary picker
      const data = event.data as {
        itemId?: string; tokenUrl?: string; size?: string; name?: string;
      } | undefined;
      if (!data?.itemId || !data.tokenUrl) return;
      const dim = await probeImageSize(data.tokenUrl);
      const form: TransformForm = {
        image: {
          url: data.tokenUrl,
          width: dim.w,
          height: dim.h,
          mime: mimeFromUrl(data.tokenUrl),
        },
        footprint: footprintForSize(data.size),
        name: data.name || (en ? "Transformed" : "变身形态"),
        label: data.name || (en ? "Transformed" : "变身形态"),
      };
      await applyTransform(data.itemId, form);
      await closeMonsterPicker();
    });
    if (typeof u === "function") unsubs.push(u);
  } catch (e) {
    console.warn("[transform] subscribe BC_TRANSFORM_PICK failed", e);
  }

  // Legacy ad-hoc URL popover path (transform.html) — kept wired so a
  // power user could still paste a direct image URL, though the
  // bestiary picker is now the primary "变身" entry point.
  try {
    const u = OBR.broadcast.onMessage(BC_APPLY_FORM, async (event) => {
      if (!isFromSelf(event)) return; // LOCAL from transform.html popover
      const data = event.data as { itemId?: string; form?: TransformForm } | undefined;
      if (!data?.itemId || !data.form?.image?.url) return;
      if (!data.form.image.mime) data.form.image.mime = mimeFromUrl(data.form.image.url);
      await applyTransform(data.itemId, data.form);
      try { await OBR.popover.close(POPOVER_ID); } catch {}
    });
    if (typeof u === "function") unsubs.push(u);
  } catch (e) {
    console.warn("[transform] subscribe BC_APPLY_FORM failed", e);
  }

  console.info("[transform] module setup complete; role =", myRole);
}

export function teardownTransform(): void {
  for (const u of unsubs.splice(0)) { try { u(); } catch {} }
  try { void OBR.contextMenu.remove(CTX_TRANSFORM); } catch {}
  try { void OBR.contextMenu.remove(CTX_REVERT); } catch {}
  void closeMonsterPicker();
  try { void OBR.popover.close(POPOVER_ID); } catch {}
}

// Silence unused warnings: buildImage is reserved for the Phase-2 form
// builder; PAGE_URL keeps the legacy transform.html popover entry on
// the books (still served + handled via BC_APPLY_FORM, just no longer
// the primary context-menu entry now that the bestiary picker is).
void buildImage;
void PAGE_URL;
