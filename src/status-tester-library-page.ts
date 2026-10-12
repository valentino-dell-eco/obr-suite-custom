// Status Tester — status library editor (modal).
//
// GM: create / edit / delete statuses. Players: read-only list.
// The library lives in ROOM metadata (shared by every scene); writes
// merge by id against a fresh read (library.ts → writeLibraryChanges).

import OBR from "@owlbear-rodeo/sdk";
import { getLocalLang } from "./state";
import { t } from "./i18n";
import { escapeHtml } from "./utils/html";
import {
  COLOR_PRESETS,
  ICON_IDS,
  LIBRARY_MODAL_ID,
  LIBRARY_WARN_BYTES,
  MAX_TITLE,
  StatusAttachment,
  StatusDef,
  guessMime,
  iconUrl,
  isHexColor,
  isHttpUrl,
  newId,
  sanitizeAttachment,
  sanitizeDef,
  textColorFor,
} from "./modules/statusTester/types";
import { emojiHtml } from "./modules/statusTester/emoji";
import {
  ROOM_LIMIT_BYTES,
  encodedLibraryBytes,
  isSizeLimitError,
  onLibraryChange,
  readLibrary,
  restoreMissingPresets,
  roomMetadataUsage,
  writeLibraryChanges,
} from "./modules/statusTester/library";
import { initRoomSettings, mayEditLibrary } from "./modules/statusTester/settings";

const lang = getLocalLang();
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const titleEl = $("title");
const closeBtn = $<HTMLButtonElement>("close");
const noticeEl = $("notice");
const warnEl = $("warn");
const toolbarEl = $("toolbar");
const searchEl = $<HTMLInputElement>("search");
const newBtn = $<HTMLButtonElement>("newBtn");
const presetBtn = $<HTMLButtonElement>("presetBtn");
const listEl = $("list");
const formEl = $("form");
const previewEl = $("preview");
const fTitle = $<HTMLInputElement>("fTitle");
const fColor = $<HTMLInputElement>("fColor");
const colorsEl = $("colors");
const iconsEl = $("icons");
const fEmoji = $<HTMLInputElement>("fEmoji");
const fLevels = $<HTMLInputElement>("fLevels");
const fLevelGrid = $<HTMLInputElement>("fLevelGrid");
const attPreview = $("attPreview");
const pickAssetBtn = $<HTMLButtonElement>("pickAsset");
const removeAttBtn = $<HTMLButtonElement>("removeAtt");
const attUrl = $<HTMLInputElement>("attUrl");
const useUrlBtn = $<HTMLButtonElement>("useUrl");
const attErr = $("attErr");
const formErr = $("formErr");
const cancelBtn = $<HTMLButtonElement>("cancelBtn");
const saveBtn = $<HTMLButtonElement>("saveBtn");

let isGM = false;
/** GM, or a player when the GM allows players to edit the library. */
let canEdit = false;
let library: StatusDef[] = [];
/** The status being edited (null = list view). */
let draft: StatusDef | null = null;
let confirmDeleteId: string | null = null;
let saving = false;

// --- Static labels ---------------------------------------------------------

function applyLabels(): void {
  titleEl.textContent = t(lang, "sttLibraryTitle");
  closeBtn.title = t(lang, "sttClose");
  searchEl.placeholder = t(lang, "sttSearch");
  newBtn.textContent = `+ ${t(lang, "sttNewStatus")}`;
  presetBtn.textContent = t(lang, "sttRestorePresets");
  $("lblTitle").textContent = t(lang, "sttFieldTitle");
  $("lblColor").textContent = t(lang, "sttFieldColor");
  $("lblIcon").textContent = t(lang, "sttFieldIcon");
  $("lblEmoji").textContent = t(lang, "sttFieldEmoji");
  $("lblLevels").textContent = t(lang, "sttFieldLevels");
  $("hintLevels").textContent = t(lang, "sttFieldLevelsHint");
  $("lblLevelGrid").textContent = t(lang, "sttFieldLevelGrid");
  $("hintLevelGrid").textContent = t(lang, "sttFieldLevelGridHint");
  $("lblAtt").textContent = t(lang, "sttFieldAttachment");
  pickAssetBtn.textContent = t(lang, "sttPickAsset");
  removeAttBtn.textContent = t(lang, "sttRemoveAttachment");
  attUrl.placeholder = t(lang, "sttPasteUrl");
  useUrlBtn.textContent = t(lang, "sttUseUrl");
  cancelBtn.textContent = t(lang, "sttCancel");
  saveBtn.textContent = t(lang, "sttSave");
}

// --- Helpers ---------------------------------------------------------------

function chipHtml(def: StatusDef): string {
  const fg = textColorFor(def.color);
  let icon = "";
  if (def.emoji) icon = `<span class="emoji">${emojiHtml(def.emoji, escapeHtml)}</span>`;
  else if (def.icon) icon = `<img src="${escapeHtml(iconUrl(def.icon, fg !== "#ffffff"))}" alt="">`;
  const title = (def.levels ? `${def.title} X` : def.title) || t(lang, "sttUntitled");
  return `<span class="chip" style="background:${escapeHtml(def.color)};color:${escapeHtml(fg)}" title="${escapeHtml(title)}">${icon}<span class="t">${escapeHtml(title)}</span></span>`;
}

function setErr(el: HTMLElement, msg: string): void {
  el.textContent = msg;
  el.hidden = !msg;
}

/** A write failed because the room's metadata (shared by every
 *  extension) is full: say so, with the biggest keys, so the GM knows
 *  what to clean up. */
async function showRoomFull(): Promise<void> {
  let detail = "";
  try {
    const u = await roomMetadataUsage();
    const kb = (n: number) => (n / 1024).toFixed(1);
    detail = ` (${kb(u.total)} / ${kb(ROOM_LIMIT_BYTES)} KB) — ` +
      u.top.slice(0, 4).map((x) => `${x.key}: ${kb(x.bytes)} KB`).join(" · ");
  } catch {}
  warnEl.textContent = t(lang, "sttRoomFull") + detail;
  warnEl.hidden = false;
}

let warnSeq = 0;
function updateWarning(defs: StatusDef[]): void {
  // Measured on the packed room value (async); a newer call wins.
  const my = ++warnSeq;
  void encodedLibraryBytes(defs).then((bytes) => {
    if (my !== warnSeq) return;
    if (bytes > LIBRARY_WARN_BYTES) {
      warnEl.textContent = t(lang, "sttSizeWarning").replace("{n}", (bytes / 1024).toFixed(1));
      warnEl.hidden = false;
    } else {
      warnEl.hidden = true;
    }
  });
}

// --- List view -------------------------------------------------------------

function renderList(): void {
  noticeEl.hidden = canEdit;
  noticeEl.textContent = canEdit ? "" : t(lang, "sttReadOnlyLibrary");
  newBtn.hidden = !canEdit;
  presetBtn.hidden = !canEdit;
  updateWarning(draft ? mergedWithDraft() : library);
  if (draft) return;
  const q = searchEl.value.trim().toLowerCase();
  const list = library.filter((d) => !q || d.title.toLowerCase().includes(q));
  if (library.length === 0) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t(lang, "sttLibraryEmpty"))}</div>`;
    return;
  }
  if (list.length === 0) {
    listEl.innerHTML = `<div class="empty">${escapeHtml(t(lang, "sttNoMatches"))}</div>`;
    return;
  }
  listEl.innerHTML = list
    .map((d) => {
      const att = d.attachment ? `<span class="att-badge">IMG</span>` : "";
      const ctl = canEdit
        ? `<button class="btn sec small" type="button" data-act="edit" data-id="${escapeHtml(d.id)}">${escapeHtml(t(lang, "sttEdit"))}</button>` +
          `<button class="btn danger small${confirmDeleteId === d.id ? " confirm" : ""}" type="button" data-act="del" data-id="${escapeHtml(d.id)}">${escapeHtml(t(lang, confirmDeleteId === d.id ? "sttDeleteConfirm" : "sttDelete"))}</button>`
        : "";
      return `<div class="row">${chipHtml(d)}${att}<span class="spacer"></span>${ctl}</div>`;
    })
    .join("");
}

function mergedWithDraft(): StatusDef[] {
  if (!draft) return library;
  const d = draft;
  const i = library.findIndex((x) => x.id === d.id);
  if (i < 0) return [...library, d];
  const copy = library.slice();
  copy[i] = d;
  return copy;
}

function showList(): void {
  draft = null;
  formEl.hidden = true;
  listEl.hidden = false;
  toolbarEl.hidden = false;
  renderList();
}

// --- Form view -------------------------------------------------------------

function renderColors(): void {
  if (!draft) return;
  const d = draft;
  fColor.value = d.color;
  colorsEl.querySelectorAll(".sw").forEach((el) => el.remove());
  for (const c of COLOR_PRESETS) {
    const sw = document.createElement("div");
    sw.className = `sw${c === d.color ? " sel" : ""}`;
    sw.style.background = c;
    sw.dataset.color = c;
    sw.title = c;
    colorsEl.appendChild(sw);
  }
}

function renderIcons(): void {
  if (!draft) return;
  const d = draft;
  const fg = textColorFor(d.color);
  const dark = fg !== "#ffffff";
  const cells = [
    `<div class="ic${!d.icon ? " sel" : ""}${d.emoji ? " disabled" : ""}" data-icon="" style="background:${escapeHtml(d.color)};color:${escapeHtml(fg)}">${escapeHtml(t(lang, "sttNoIcon"))}</div>`,
    ...ICON_IDS.map(
      (id) =>
        `<div class="ic${d.icon === id ? " sel" : ""}${d.emoji ? " disabled" : ""}" data-icon="${escapeHtml(id)}" title="${escapeHtml(id)}" style="background:${escapeHtml(d.color)}"><img src="${escapeHtml(iconUrl(id, dark))}" alt=""></div>`,
    ),
  ];
  iconsEl.innerHTML = cells.join("");
}

function renderAttachment(): void {
  if (!draft) return;
  const a = draft.attachment;
  if (!a) {
    attPreview.innerHTML = escapeHtml(t(lang, "sttNoAttachment"));
    removeAttBtn.hidden = true;
    return;
  }
  removeAttBtn.hidden = false;
  if (a.mime.startsWith("video/")) {
    attPreview.innerHTML = `<video src="${escapeHtml(a.url)}" autoplay loop muted playsinline></video>`;
  } else {
    attPreview.innerHTML = `<img src="${escapeHtml(a.url)}" alt="">`;
  }
}

function renderPreview(): void {
  if (!draft) return;
  previewEl.innerHTML = chipHtml(draft);
  updateWarning(mergedWithDraft());
}

function renderForm(): void {
  if (!draft) return;
  fTitle.value = draft.title;
  fEmoji.value = draft.emoji ?? "";
  fLevels.checked = !!draft.levels;
  fLevelGrid.checked = !!draft.levelGrid;
  syncLevelGridRow();
  attUrl.value = "";
  setErr(attErr, "");
  setErr(formErr, "");
  renderColors();
  renderIcons();
  renderAttachment();
  renderPreview();
}

function openForm(def: StatusDef | null): void {
  if (!canEdit) return;
  confirmDeleteId = null;
  draft = def
    ? { ...def, attachment: def.attachment ? { ...def.attachment } : undefined }
    : { id: newId("d"), title: "", color: COLOR_PRESETS[5], icon: "star" };
  formEl.hidden = false;
  listEl.hidden = true;
  toolbarEl.hidden = true;
  renderForm();
  fTitle.focus();
}

/** Measure an image / video URL's intrinsic size. */
function measure(url: string, mime: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const done = (v: { width: number; height: number } | null) => {
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => resolve(null), 10000);
    if (mime.startsWith("video/")) {
      const v = document.createElement("video");
      v.muted = true;
      v.preload = "metadata";
      v.onloadedmetadata = () => done(v.videoWidth && v.videoHeight ? { width: v.videoWidth, height: v.videoHeight } : null);
      v.onerror = () => done(null);
      v.src = url;
    } else {
      const img = new Image();
      img.onload = () => done(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : { width: 512, height: 512 });
      img.onerror = () => done(null);
      img.src = url;
    }
  });
}

// --- Events ----------------------------------------------------------------

listEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!btn || !canEdit) return;
  const id = btn.dataset.id ?? "";
  const def = library.find((d) => d.id === id);
  if (!def) return;
  if (btn.dataset.act === "edit") {
    openForm(def);
  } else if (btn.dataset.act === "del") {
    if (confirmDeleteId !== id) {
      // Two-step confirm (window.confirm is unreliable in sandboxed iframes).
      confirmDeleteId = id;
      renderList();
      return;
    }
    confirmDeleteId = null;
    void writeLibraryChanges({ remove: [id] })
      .then((next) => { library = next; renderList(); })
      .catch(() => { noticeEl.hidden = false; noticeEl.textContent = t(lang, "sttSaveFailed"); });
  }
});

searchEl.addEventListener("input", () => renderList());
newBtn.addEventListener("click", () => openForm(null));
// GM: re-add the D&D 5e (2014) presets that are missing from the
// library (presets already there — even edited — are left untouched).
presetBtn.addEventListener("click", async () => {
  if (!canEdit || presetBtn.disabled) return;
  presetBtn.disabled = true;
  try {
    const n = await restoreMissingPresets(lang);
    library = await readLibrary();
    renderList();
    presetBtn.textContent = t(lang, "sttRestoredN").replace("{n}", String(n));
    setTimeout(() => { presetBtn.textContent = t(lang, "sttRestorePresets"); }, 2000);
  } catch (e) {
    console.warn("[status-tester] restore presets failed", e);
    if (isSizeLimitError(e)) void showRoomFull();
  } finally {
    presetBtn.disabled = false;
  }
});

fTitle.addEventListener("input", () => {
  if (!draft) return;
  draft.title = Array.from(fTitle.value).slice(0, MAX_TITLE).join("");
  renderPreview();
});
fColor.addEventListener("input", () => {
  if (!draft || !isHexColor(fColor.value)) return;
  draft.color = fColor.value.toLowerCase();
  renderColors();
  renderIcons();
  renderPreview();
});
colorsEl.addEventListener("click", (e) => {
  const sw = (e.target as HTMLElement).closest<HTMLElement>(".sw");
  if (!sw || !draft || !isHexColor(sw.dataset.color)) return;
  draft.color = sw.dataset.color!.toLowerCase();
  renderColors();
  renderIcons();
  renderPreview();
});
iconsEl.addEventListener("click", (e) => {
  const cell = (e.target as HTMLElement).closest<HTMLElement>(".ic");
  if (!cell || !draft) return;
  const id = cell.dataset.icon ?? "";
  draft.icon = id || undefined;
  if (id) {
    // Picking an icon clears the emoji (emoji would otherwise win).
    draft.emoji = undefined;
    fEmoji.value = "";
  }
  renderIcons();
  renderPreview();
});
/** "Level is a grid distance" only makes sense with levels on. */
function syncLevelGridRow(): void {
  const on = fLevels.checked;
  $("rowLevelGrid").style.display = on ? "" : "none";
  $("hintLevelGrid").style.display = on ? "" : "none";
}
fLevels.addEventListener("change", () => {
  if (!draft) return;
  draft.levels = fLevels.checked;
  if (!draft.levels) { draft.levelGrid = undefined; fLevelGrid.checked = false; }
  syncLevelGridRow();
  renderPreview();
});
fLevelGrid.addEventListener("change", () => {
  if (!draft) return;
  draft.levelGrid = fLevelGrid.checked || undefined;
  renderPreview();
});
fEmoji.addEventListener("input", () => {
  if (!draft) return;
  const v = fEmoji.value.trim();
  draft.emoji = v ? Array.from(v).slice(0, 16).join("") : undefined;
  renderIcons();
  renderPreview();
});

pickAssetBtn.addEventListener("click", async () => {
  if (!draft) return;
  setErr(attErr, "");
  try {
    const picked = await OBR.assets.downloadImages(false);
    const img = picked[0];
    if (!img || !draft) return;
    const att = sanitizeAttachment({
      url: img.image.url,
      width: img.image.width,
      height: img.image.height,
      mime: img.image.mime,
      dpi: img.grid?.dpi,
    });
    if (!att) {
      setErr(attErr, t(lang, "sttInvalidUrl"));
      return;
    }
    draft.attachment = att;
    renderAttachment();
    renderPreview();
  } catch (e) {
    console.warn("[status-tester] downloadImages failed", e);
  }
});

useUrlBtn.addEventListener("click", async () => {
  if (!draft) return;
  setErr(attErr, "");
  const url = attUrl.value.trim();
  if (!isHttpUrl(url)) {
    setErr(attErr, t(lang, "sttInvalidUrl"));
    return;
  }
  const mime = guessMime(url);
  useUrlBtn.disabled = true;
  const size = await measure(url, mime);
  useUrlBtn.disabled = false;
  if (!size) {
    setErr(attErr, t(lang, "sttImageLoadFailed"));
    return;
  }
  const att: StatusAttachment | undefined = sanitizeAttachment({ url, width: size.width, height: size.height, mime });
  if (!att || !draft) return;
  draft.attachment = att;
  attUrl.value = "";
  renderAttachment();
  renderPreview();
});

removeAttBtn.addEventListener("click", () => {
  if (!draft) return;
  draft.attachment = undefined;
  renderAttachment();
  renderPreview();
});

cancelBtn.addEventListener("click", () => showList());

saveBtn.addEventListener("click", async () => {
  if (!draft || !canEdit || saving) return;
  setErr(formErr, "");
  // Store `levels` explicitly (true / false) so preset upgrades never
  // flip a GM's choice.
  const def = sanitizeDef({ ...draft, levels: !!draft.levels, levelGrid: !!draft.levels && !!draft.levelGrid });
  if (!def || !def.title) {
    setErr(formErr, t(lang, "sttTitleRequired"));
    return;
  }
  saving = true;
  saveBtn.disabled = true;
  try {
    library = await writeLibraryChanges({ upsert: [def] });
    showList();
  } catch (e) {
    console.warn("[status-tester] save failed", e);
    setErr(formErr, t(lang, "sttSaveFailed"));
    if (isSizeLimitError(e)) void showRoomFull();
  } finally {
    saving = false;
    saveBtn.disabled = false;
  }
});

closeBtn.addEventListener("click", () => { void OBR.modal.close(LIBRARY_MODAL_ID); });

applyLabels();

OBR.onReady(async () => {
  try { isGM = (await OBR.player.getRole()) === "GM"; } catch {}
  const refreshPerm = () => {
    const next = mayEditLibrary(isGM);
    if (next === canEdit) return;
    canEdit = next;
    if (!canEdit && draft) showList();
    else renderList();
  };
  await initRoomSettings(refreshPerm);
  canEdit = mayEditLibrary(isGM);
  library = await readLibrary();
  renderList();
  onLibraryChange((defs) => {
    library = defs;
    renderList();
  });
  OBR.player.onChange((p) => {
    const gm = p.role === "GM";
    if (gm === isGM) return;
    isGM = gm;
    canEdit = !canEdit; // force refreshPerm to re-evaluate
    refreshPerm();
  });
});
