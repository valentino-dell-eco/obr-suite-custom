// Status Tester — status palette popover.
//
// Lists the library as chips. Two ways to apply a status:
//   * drag a chip onto a token — once the pointer leaves a small
//     deadzone we broadcast BC_DRAG_START and the background opens the
//     fullscreen drop modal, which owns the rest of the gesture;
//   * click a chip — adds it to the currently selected tokens the user
//     may manage.

import OBR from "@owlbear-rodeo/sdk";
import { getLocalLang } from "./state";
import { t } from "./i18n";
import { escapeHtml } from "./utils/html";
import { bindPanelDrag } from "./utils/panelDrag";
import { PANEL_IDS } from "./utils/panelLayout";
import {
  BC_DRAG_DROP,
  BC_DRAG_END,
  BC_DRAG_MOVE,
  BC_DRAG_START,
  BC_PALETTE_CLOSE,
  StatusDef,
  iconUrl,
  textColorFor,
} from "./modules/statusTester/types";
import { onLibraryChange, readLibrary } from "./modules/statusTester/library";
import { openLibraryModal } from "./modules/statusTester/open";
import { addStatusToTokens } from "./modules/statusTester/apply";
import { getLocalSettings, initRoomSettings, playersMayApply } from "./modules/statusTester/settings";

const lang = getLocalLang();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const titleEl = $("title");
const chipsEl = $("chips");
const footEl = $("foot");
const searchEl = $<HTMLInputElement>("search");
const libBtn = $<HTMLButtonElement>("lib");
const closeBtn = $<HTMLButtonElement>("close");

/** Pointer travel (px) before a press becomes a drag. */
const DEADZONE = 4;

let isGM = false;
let playerId = "";
let library: StatusDef[] = [];
let flashTimer: ReturnType<typeof setTimeout> | null = null;

function chipHtml(def: StatusDef): string {
  const fg = textColorFor(def.color);
  let icon = "";
  if (def.emoji) icon = `<span class="emoji">${escapeHtml(def.emoji)}</span>`;
  else if (def.icon) icon = `<img src="${escapeHtml(iconUrl(def.icon, fg !== "#ffffff"))}" alt="" draggable="false">`;
  const title = def.title || t(lang, "sttUntitled");
  return `<span class="chip" data-def="${escapeHtml(def.id)}" role="button" tabindex="0" aria-label="${escapeHtml(title)}" style="background:${escapeHtml(def.color)};color:${escapeHtml(fg)}">${icon}<span class="t">${escapeHtml(title)}</span></span>`;
}

/** Players restricted to viewing can browse the palette but not apply. */
function canApply(): boolean {
  return isGM || playersMayApply();
}

function hint(): string {
  if (!canApply()) return t(lang, "sttPlayersViewOnly");
  return t(lang, isGM ? "sttPaletteHintGM" : "sttPaletteHint");
}

function setFoot(text: string, cls: "" | "flash" | "warn" = ""): void {
  footEl.textContent = text;
  footEl.className = `foot${cls ? " " + cls : ""}`;
  if (flashTimer) { clearTimeout(flashTimer); flashTimer = null; }
  if (cls) {
    flashTimer = setTimeout(() => setFoot(hint()), 2200);
  }
}

function renderChips(): void {
  const q = searchEl.value.trim().toLowerCase();
  if (library.length === 0) {
    chipsEl.innerHTML = `<div class="empty">${escapeHtml(t(lang, "sttLibraryEmpty"))}</div>`;
    return;
  }
  const list = library.filter((d) => !q || d.title.toLowerCase().includes(q));
  chipsEl.innerHTML = list.length
    ? list.map(chipHtml).join("")
    : `<div class="empty">${escapeHtml(t(lang, "sttNoMatches"))}</div>`;
}

function renderStatic(): void {
  titleEl.textContent = t(lang, "sttName");
  searchEl.placeholder = t(lang, "sttSearch");
  libBtn.title = t(lang, "sttLibraryTitle");
  libBtn.setAttribute("aria-label", t(lang, "sttLibraryTitle"));
  closeBtn.title = t(lang, "sttClose");
  closeBtn.setAttribute("aria-label", t(lang, "sttClose"));
  setFoot(hint());
}

async function applyToSelection(defId: string): Promise<void> {
  let sel: string[] = [];
  try { sel = (await OBR.player.getSelection()) ?? []; } catch {}
  if (sel.length === 0) {
    setFoot(t(lang, "sttNoSelection"), "warn");
    return;
  }
  try {
    const def = library.find((d) => d.id === defId);
    const n = await addStatusToTokens(sel, defId, {
      isGM,
      playerId,
      hidden: isGM && getLocalSettings().gmDefaultHidden,
      levels: !!def?.levels,
    });
    if (n > 0) setFoot(t(lang, "sttAddedN").replace("{n}", String(n)), "flash");
    else setFoot(t(lang, "sttNothingAdded"), "warn");
  } catch (e) {
    console.warn("[status-tester] palette apply failed", e);
    setFoot(t(lang, "sttSaveFailed"), "warn");
  }
}

// --- Chip press: click vs drag --------------------------------------------
//
// The browser keeps routing the pointer to THIS frame for the whole
// press, even over the drop modal, so the palette owns the gesture:
// it forwards the cursor (converted to viewport px with its own
// origin) to the drop modal and reports the release position.

const params = new URLSearchParams(location.search);
const ORIGIN_X = Number(params.get("ox")) || 0;
const ORIGIN_Y = Number(params.get("oy")) || 0;

function bindChipGestures(): void {
  chipsEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const chip = (e.target as HTMLElement).closest<HTMLElement>(".chip[data-def]");
    if (!chip) return;
    e.preventDefault(); // no text selection / native image drag
    if (!canApply()) return;
    const defId = chip.dataset.def ?? "";
    const sx = e.clientX;
    const sy = e.clientY;
    let dragging = false;
    let raf = 0;
    let last: { x: number; y: number; shift: boolean } | null = null;

    const abs = (ev: PointerEvent) => ({
      x: ORIGIN_X + ev.clientX,
      y: ORIGIN_Y + ev.clientY,
      shift: ev.shiftKey,
    });
    const send = (type: string, data: unknown) =>
      void OBR.broadcast.sendMessage(type, data, { destination: "LOCAL" }).catch(() => {});
    const flush = () => {
      raf = 0;
      if (last) send(BC_DRAG_MOVE, last);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", onMove, true);
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onCancel, true);
      window.removeEventListener("keydown", onKey, true);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      chip.classList.remove("lifted");
    };
    const onMove = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DEADZONE) return;
        dragging = true;
        chip.classList.add("lifted");
        // Status snapshot + cursor so the drop modal can paint the ghost
        // on first paint, before its SDK handshake.
        const def = library.find((d) => d.id === defId);
        send(BC_DRAG_START, { defId, def, ...abs(ev) });
      }
      last = abs(ev);
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onUp = (ev: PointerEvent) => {
      const wasDrag = dragging;
      cleanup();
      if (wasDrag) send(BC_DRAG_DROP, abs(ev));
      else void applyToSelection(defId);
    };
    const onCancel = () => {
      const wasDrag = dragging;
      cleanup();
      if (wasDrag) send(BC_DRAG_END, {});
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onCancel();
    };
    window.addEventListener("pointermove", onMove, true);
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onCancel, true);
    window.addEventListener("keydown", onKey, true);
  });

  // Keyboard: Enter / Space on a focused chip = click.
  chipsEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const chip = (e.target as HTMLElement).closest<HTMLElement>(".chip[data-def]");
    if (!chip || !canApply()) return;
    e.preventDefault();
    void applyToSelection(chip.dataset.def ?? "");
  });
}

searchEl.addEventListener("input", renderChips);
libBtn.addEventListener("click", () => { void openLibraryModal(); });
closeBtn.addEventListener("click", () => {
  void OBR.broadcast.sendMessage(BC_PALETTE_CLOSE, {}, { destination: "LOCAL" }).catch(() => {});
});

OBR.onReady(async () => {
  try { isGM = (await OBR.player.getRole()) === "GM"; } catch {}
  try { playerId = await OBR.player.getId(); } catch {}
  await initRoomSettings(() => {
    document.body.classList.toggle("view-only", !canApply());
    setFoot(hint());
  });
  document.body.classList.toggle("view-only", !canApply());
  renderStatic();
  library = await readLibrary();
  renderChips();
  bindChipGestures();
  bindPanelDrag($("dragHandle"), PANEL_IDS.statusPalette);
  onLibraryChange((defs) => {
    library = defs;
    renderChips();
  });
  OBR.player.onChange((p) => {
    const gm = p.role === "GM";
    if (gm !== isGM) {
      isGM = gm;
      setFoot(hint());
    }
  });
});
