// Resource Tracker — edit modal page.
//
// Loads with a payload encoded in the URL hash:
//   { itemId, resource? }
// where `resource` is undefined for "create new" and an existing
// Resource for "edit". The page is a standalone OBR modal so the
// form has the entire viewport to render its scrollable icon grid;
// the panel popover that triggered this stays open behind us.
//
// On save / delete the page broadcasts back to the popover side
// which mutates OBR scene metadata and refreshes its list. We
// don't write metadata directly here — keeps the source-of-truth
// flow simple (panel-side reads, panel-side writes).
//
// 2026-05-15 — UX rev:
//   • Click on the dimmed area outside the card → cancel-close.
//   • All boxes use square corners (border-radius:0) for a modern look.
//   • Icon grid: gap:0, square highlights that fully fill the cell.
//   • Default name on "create" = "自定义"; focus selects the whole
//     name input so the user can type-replace immediately.
//   • Per-client presets (name + type + max + icon, persisted to
//     localStorage). Pattern mirrors portal-edit's name-presets:
//     "+ 保存当前为预设" pushes the current form state in; clicking
//     a chip restores it; the × deletes that preset.

import OBR from "@owlbear-rodeo/sdk";
import {
  Resource,
  IconId,
  ResourceType,
  DieInfo,
  RecoveryType,
  PLUGIN_ID,
  SLOT_LEVELS,
  SlotLevel,
  HIT_DIE_SIZES,
  HitDiePool,
  HitDieSize,
  cleanSlots,
  cleanPools,
  hitDieSize,
  isSpecialResource,
  slotTotals,
} from "./types";
import { ICON_LIBRARY, ICON_LABELS, ICON_IDS } from "./icons";
import { applyI18nDom, t } from "../../i18n";
import { getLocalLang, onLangChange } from "../../state";

// i18n — static text via data-i18n; dynamic strings via T().
let lang = getLocalLang();
const T = (k: Parameters<typeof t>[1]) => t(lang, k);
try { applyI18nDom(lang); } catch {}

interface HashPayload {
  itemId: string;
  resource?: Resource;
}

interface ResourcePreset {
  name: string;
  type: ResourceType;
  max: number;
  icon: IconId;
  dieInfo?: DieInfo | null;
  chargesFormula?: string | null;
}

const BC_RESOURCE_SAVE = `${PLUGIN_ID}/edit-save`;
const BC_RESOURCE_DELETE = `${PLUGIN_ID}/edit-delete`;
const BC_RESOURCE_CANCEL = `${PLUGIN_ID}/edit-cancel`;
const PRESETS_KEY = `${PLUGIN_ID}/edit-presets`;

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const $i = (id: string) => document.getElementById(id) as HTMLInputElement;

const titleEl = $("title");
const inpName = $i("name");
const typeToggle = $("typeToggle");
const inpCurrent = $i("current");
const inpMax = $i("max");
const iconGrid = $("iconGrid");
const previewIconEl = $("previewIcon");
const previewLabelEl = $("previewLabel");
const dieInfoField = $("dieInfoField");
const dieInfoInput = $i("dieInfo");
const chargesFormulaField = $("chargesFormulaField");
const chargesFormulaInput = $i("chargesFormula");
const recoverySelect = $i("recovery") as unknown as HTMLSelectElement;
const typeToggleSpecial = $("typeToggleSpecial");
const slotsField = $("slotsField");
const slotsGrid = $("slotsGrid");
const hitDieField = $("hitDieField");
const poolsEl = $("pools");
const btnAddPool = $("btnAddPool");
const eligField = $("eligField");
const eligSpells = $i("eligSpells");
const eligFeatures = $i("eligFeatures");
const curMaxRow = $("curMaxRow");
const btnX = $("btnX");
const btnCancel = $("btnCancel");
const btnSave = $("btnSave");
const btnDelete = $("btnDelete");
const btnAddPreset = $("btnAddPreset");
const chipsPresets = $("chipsPresets");
const cardEl = document.querySelector<HTMLElement>(".card");

let selectedIcon: IconId = "gem";
let selectedDieInfo: DieInfo = "1d6";
let selectedRecovery: RecoveryType = "none";
let editingResourceId: string | null = null;
let itemId = "";

// Type toggle state. Lives outside the DOM so payload (re-)apply
// doesn't fight with the .on class.
let selectedType: ResourceType = "count";
// Spell slots being edited (spellSlots type only).
let slotValues: SlotLevel[] = cleanSlots([]);
// Hit die pools being edited (hitDice type only) — one row per size.
let poolValues: HitDiePool[] = [{ die: "d8", current: 1, max: 1 }];

function syncPoolTotals(): void {
  const tot = slotTotals(poolValues);
  inpCurrent.value = String(tot.current);
  inpMax.value = String(tot.max);
}

function renderPools(): void {
  const used = new Set(poolValues.map((p) => p.die));
  poolsEl.innerHTML = poolValues
    .map((p, i) => `<div class="pool-row">
      <select data-pool="${i}" data-k="die">${HIT_DIE_SIZES.map((d) =>
        `<option value="${d}" ${d === p.die ? "selected" : ""} ${d !== p.die && used.has(d) ? "disabled" : ""}>${d}</option>`).join("")}</select>
      <input type="number" min="0" max="99" step="1" data-pool="${i}" data-k="current" value="${p.current}">
      <span class="sep">/</span>
      <input type="number" min="0" max="99" step="1" data-pool="${i}" data-k="max" value="${p.max}">
      <span class="lbl2">${escHtml(T("rePoolCurMax"))}</span>
      ${poolValues.length > 1 ? `<button class="del" type="button" data-del-pool="${i}">×</button>` : ""}
    </div>`)
    .join("");
  btnAddPool.style.display = poolValues.length >= HIT_DIE_SIZES.length ? "none" : "";
  syncPoolTotals();
}
poolsEl.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  const i = Number(el.dataset.pool);
  const p = poolValues[i];
  if (!p || el.tagName !== "INPUT") return;
  const n = Math.max(0, Math.floor(Number(el.value) || 0));
  const next = { ...p, [el.dataset.k === "max" ? "max" : "current"]: n };
  if (el.dataset.k === "current" && next.current > next.max) next.max = next.current;
  if (el.dataset.k === "max" && next.current > next.max) next.current = next.max;
  poolValues[i] = next;
  syncPoolTotals();
  updatePreview();
});
poolsEl.addEventListener("change", (e) => {
  const el = e.target as HTMLElement;
  if (el.tagName === "SELECT") {
    const i = Number(el.dataset.pool);
    const die = hitDieSize((el as HTMLSelectElement).value);
    if (poolValues[i] && die) poolValues[i] = { ...poolValues[i], die };
  }
  renderPools();
  updatePreview();
});
poolsEl.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-del-pool]");
  if (!b) return;
  poolValues.splice(Number(b.dataset.delPool), 1);
  renderPools();
  updatePreview();
});
btnAddPool.addEventListener("click", () => {
  const used = new Set(poolValues.map((p) => p.die));
  const die = HIT_DIE_SIZES.find((d) => !used.has(d)) as HitDieSize | undefined;
  if (!die) return;
  poolValues.push({ die, current: 1, max: 1 });
  renderPools();
  updatePreview();
});

const ALL_TYPES: ResourceType[] = ["count", "bar", "number", "dieRoll", "charges", "spellSlots", "hitDice"];

function renderSlotsGrid(): void {
  slotsGrid.innerHTML = slotValues
    .map((s, i) => `<div class="slot-cell">
      <span class="lv">${escHtml(T("rpSlotLevel").replace("{n}", String(i + 1)))}</span>
      <input type="number" min="0" max="99" step="1" data-slot="${i}" data-k="current" value="${s.current}">
      <span class="sep">/</span>
      <input type="number" min="0" max="99" step="1" data-slot="${i}" data-k="max" value="${s.max}">
    </div>`)
    .join("");
}
slotsGrid.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  const i = Number(el.dataset.slot);
  if (!(i >= 0 && i < SLOT_LEVELS)) return;
  const n = Math.max(0, Math.floor(Number(el.value) || 0));
  const next = { ...slotValues[i], [el.dataset.k === "max" ? "max" : "current"]: n };
  // Raising "current" past max raises max with it; lowering max pulls current down.
  if (el.dataset.k === "current" && next.current > next.max) next.max = next.current;
  if (el.dataset.k === "max" && next.current > next.max) next.current = next.max;
  slotValues[i] = next;
  const tot = slotTotals(slotValues);
  inpCurrent.value = String(tot.current);
  inpMax.value = String(tot.max);
  updatePreview();
});
slotsGrid.addEventListener("change", () => renderSlotsGrid());

// ---------- presets ---------------------------------------------------------
function readPresets(): ResourcePreset[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter to entries that match the expected shape — defensive against
    // schema drift from older versions of this same key.
    return parsed.filter((p) =>
      p && typeof p.name === "string"
      && (p.type === "count" || p.type === "bar" || p.type === "number" || p.type === "dieRoll" || p.type === "charges")
      && typeof p.max === "number"
      && typeof p.icon === "string"
    );
  } catch {
    return [];
  }
}
function writePresets(arr: ResourcePreset[]): void {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(arr)); } catch {}
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

function renderPresets(): void {
  const arr = readPresets();
  if (!arr.length) {
    chipsPresets.innerHTML = `<span class="empty">${escHtml(T("rePresetsEmpty"))}</span>`;
    return;
  }
  // Each chip carries the icon SVG + name, plus a × delete button.
  // Click chip body → load this preset into the form. Click × → drop it.
  chipsPresets.innerHTML = arr.map((p, idx) => {
    const iconSvg = ICON_LIBRARY[p.icon] ?? ICON_LIBRARY.gem;
    const extra = p.type === "dieRoll" && p.dieInfo
      ? ` · ${p.dieInfo}`
      : p.type === "charges" && p.chargesFormula
        ? ` · ${p.chargesFormula}`
        : "";
    return `<span class="chip" data-idx="${idx}" title="${escHtml(p.name)} · ${p.type}${escHtml(extra)} · ${escHtml(T("rePresetMax"))} ${p.max}">
      <span class="ico">${iconSvg}</span>
      <span class="lab">${escHtml(p.name)}</span>
      <button class="del" type="button" data-del="${idx}" title="${escHtml(T("rePresetDel"))}">×</button>
    </span>`;
  }).join("");
}

function applyPresetIntoForm(p: ResourcePreset): void {
  inpName.value = p.name;
  selectedType = p.type;
  selectedIcon = p.icon;
  selectedDieInfo = p.dieInfo || "1d6";
  if (chargesFormulaInput) chargesFormulaInput.value = p.chargesFormula || "";
  inpMax.value = String(p.max);
  // For "count" type the new resource starts FULL by convention; for
  // bar/number we mirror max into current too — the user can tweak after.
  inpCurrent.value = String(p.max);
  applyTypeToggleClasses();
  renderIconGrid();
  updatePreview();
}

chipsPresets.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  const delBtn = target.closest<HTMLButtonElement>("button[data-del]");
  if (delBtn) {
    e.stopPropagation();
    const idx = Number(delBtn.dataset.del);
    const arr = readPresets();
    if (idx >= 0 && idx < arr.length) {
      arr.splice(idx, 1);
      writePresets(arr);
      renderPresets();
    }
    return;
  }
  const chip = target.closest<HTMLElement>(".chip");
  if (!chip) return;
  const idx = Number(chip.dataset.idx);
  const arr = readPresets();
  if (idx >= 0 && idx < arr.length) {
    applyPresetIntoForm(arr[idx]);
  }
});

btnAddPreset.addEventListener("click", () => {
  const name = inpName.value.trim() || T("reDefaultName");
  const max = Number(inpMax.value);
  if (!Number.isFinite(max)) return;
  const next: ResourcePreset = {
    name,
    type: selectedType,
    max,
    icon: selectedIcon,
    ...(selectedType === "dieRoll" ? { dieInfo: selectedDieInfo } : {}),
    ...(selectedType === "charges"
      ? { chargesFormula: chargesFormulaInput?.value.trim() || null }
      : {}),
  };
  const arr = readPresets();
  // Replace any existing preset with the same name + type combo so users
  // can iterate on a preset without piling up duplicates.
  const dupeIdx = arr.findIndex((p) => p.name === next.name && p.type === next.type);
  if (dupeIdx >= 0) arr[dupeIdx] = next;
  else arr.push(next);
  writePresets(arr);
  renderPresets();
});

// ---------- type toggle -----------------------------------------------------
function applyTypeToggleClasses(): void {
  if (!typeToggle) return;
  for (const b of typeToggle.querySelectorAll<HTMLButtonElement>("button[data-type]")) {
    b.classList.toggle("on", b.dataset.type === selectedType);
  }
  if (dieInfoField) {
    dieInfoField.style.display = selectedType === "dieRoll" ? "block" : "none";
  }
  if (chargesFormulaField) {
    chargesFormulaField.style.display = selectedType === "charges" ? "block" : "none";
  }
  for (const b of typeToggleSpecial.querySelectorAll<HTMLButtonElement>("button[data-type]")) {
    b.classList.toggle("on", b.dataset.type === selectedType);
  }
  const special = isSpecialResource({ type: selectedType });
  slotsField.style.display = selectedType === "spellSlots" ? "flex" : "none";
  hitDieField.style.display = selectedType === "hitDice" ? "flex" : "none";
  // Spell slots / hit dice: their own grids replace current / max.
  curMaxRow.style.display = isSpecialResource({ type: selectedType }) ? "none" : "";
  if (selectedType === "hitDice") renderPools();
  // Special resources have their own activation UI.
  eligField.style.display = special ? "none" : "";
  if (selectedType === "spellSlots") renderSlotsGrid();
}

/** Switch type; a fresh special resource gets its own default name. */
function setType(v: ResourceType): void {
  const prev = selectedType;
  selectedType = v;
  if (!editingResourceId && prev !== v) {
    const defaults = [T("reDefaultName"), T("reDefaultSlotsName"), T("reDefaultHitDiceName")];
    const name = inpName.value.trim();
    if (!name || defaults.includes(name)) {
      inpName.value = v === "spellSlots" ? T("reDefaultSlotsName")
        : v === "hitDice" ? T("reDefaultHitDiceName")
        : T("reDefaultName");
    }
    if (isSpecialResource({ type: v }) && recoverySelect && selectedRecovery === "none") {
      selectedRecovery = "LR";
      recoverySelect.value = "LR";
    }
  }
  applyTypeToggleClasses();
  updatePreview();
}
typeToggleSpecial.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>("button[data-type]");
  const v = b?.dataset.type as ResourceType | undefined;
  if (v === "spellSlots" || v === "hitDice") setType(v);
});
typeToggle?.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement | null)?.closest<HTMLButtonElement>("button[data-type]");
  if (!t) return;
  const v = t.dataset.type as ResourceType | undefined;
  if (
    !v ||
    (v !== "count" && v !== "bar" && v !== "number" && v !== "dieRoll" && v !== "charges")
  )
    return;
  setType(v);
});

function broadcast(channel: string, data: unknown): void {
  try {
    OBR.broadcast.sendMessage(channel, data, { destination: "LOCAL" });
  } catch (e) {
    console.warn("[resource-edit] broadcast failed", channel, e);
  }
}

async function close(): Promise<void> {
  broadcast(BC_RESOURCE_CANCEL, {});
}

// ---------- icon grid -------------------------------------------------------
function renderIconGrid(): void {
  iconGrid.innerHTML = ICON_IDS.map((id) => `
    <div class="icon-pick ${id === selectedIcon ? "on" : ""}"
         data-icon-id="${id}"
         title="${ICON_LABELS[id]}">
      ${ICON_LIBRARY[id]}
    </div>
  `).join("");
  iconGrid.querySelectorAll<HTMLElement>(".icon-pick").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.iconId as IconId | undefined;
      if (!id) return;
      selectedIcon = id;
      iconGrid.querySelectorAll(".icon-pick").forEach((x) => x.classList.remove("on"));
      el.classList.add("on");
      updatePreview();
    });
  });
}

function updatePreview(): void {
  previewIconEl.innerHTML = ICON_LIBRARY[selectedIcon] ?? ICON_LIBRARY.gem;
  const cur = inpCurrent.value || "0";
  const max = inpMax.value || "0";
  const name = inpName.value.trim() || T("rtUnnamed");
  let extra = "";
  if (selectedType === "dieRoll") {
    extra = ` · ${selectedDieInfo}`;
  } else if (selectedType === "charges") {
    const formula = chargesFormulaInput?.value.trim();
    extra = formula ? ` · ${formula}` : ` · ${T("reChargesFormulaEmpty")}`;
  } else if (selectedType === "hitDice") {
    extra = ` · ${poolValues.map((p) => `${p.max}${p.die}`).join(" + ")}`;
  }
  if (selectedRecovery !== "none") extra += ` · ${T(`reRecovery${selectedRecovery}` as Parameters<typeof T>[0])}`;
  previewLabelEl.textContent = `${name} · ${cur} / ${max}${extra}`;
}

// ---------- payload (initial paint) -----------------------------------------
function applyPayload(p: HashPayload): void {
  itemId = p.itemId;
  if (p.resource) {
    editingResourceId = p.resource.id;
    titleEl.textContent = T("reEditTitle");
    btnDelete.style.display = "";
    inpName.value = p.resource.name;
    selectedType = p.resource.type;
    inpCurrent.value = String(p.resource.current);
    inpMax.value = String(p.resource.max);
    selectedIcon = p.resource.icon;
    selectedDieInfo = p.resource.dieInfo || "1d6";
    if (dieInfoInput) dieInfoInput.value = selectedDieInfo;
    selectedRecovery = (p.resource.recovery as RecoveryType) || "none";
    if (recoverySelect) recoverySelect.value = selectedRecovery;
    if (chargesFormulaInput) chargesFormulaInput.value = p.resource.chargesFormula || "";
    slotValues = cleanSlots(p.resource.slots);
    poolValues = cleanPools(p.resource.pools);
    if (!poolValues.length) {
      poolValues = [{ die: hitDieSize(p.resource.dieInfo) ?? "d8", current: p.resource.current, max: p.resource.max }];
    }
    eligSpells.checked = p.resource.forSpells === true;
    eligFeatures.checked = p.resource.forFeatures === true;
  } else {
    editingResourceId = null;
    titleEl.textContent = T("reNewTitle");
    btnDelete.style.display = "none";
    // Default name "自定义" + auto-select on first focus → user can
    // start typing the real name without manually clearing the field.
    inpName.value = T("reDefaultName");
    selectedType = "count";
    inpCurrent.value = "2";
    inpMax.value = "2";
    selectedIcon = "gem";
    selectedDieInfo = "1d6";
    if (dieInfoInput) dieInfoInput.value = "1d6";
    selectedRecovery = "none";
    if (recoverySelect) recoverySelect.value = "none";
    if (chargesFormulaInput) chargesFormulaInput.value = "";
    slotValues = cleanSlots([]);
    poolValues = [{ die: "d8", current: 1, max: 1 }];
    eligSpells.checked = false;
    eligFeatures.checked = false;
  }
  if (!ALL_TYPES.includes(selectedType)) selectedType = "count";
  applyTypeToggleClasses();
  renderIconGrid();
  renderPresets();
  updatePreview();
  // Auto-focus name on first paint — saves a click for the common
  // "+ 新建资源" flow. The focus handler below selects all text, so
  // typing immediately replaces "自定义".
  setTimeout(() => inpName.focus(), 100);
}

[inpName, inpCurrent, inpMax].forEach((el) => {
  el.addEventListener("input", updatePreview);
});
if (dieInfoInput) {
  dieInfoInput.addEventListener("input", () => {
    selectedDieInfo = dieInfoInput.value as DieInfo;
    updatePreview();
  });
}
if (recoverySelect) {
  recoverySelect.addEventListener("change", () => {
    selectedRecovery = recoverySelect.value as RecoveryType;
    updatePreview();
  });
}
if (chargesFormulaInput) {
  chargesFormulaInput.addEventListener("input", updatePreview);
}


// Click-to-replace: focus on any of the three text/number inputs selects
// the whole value so a single keystroke replaces it. Mirrors OBR's HP-bar
// editor and the user's #4 spec for the name field.
[inpName, inpCurrent, inpMax].forEach((el) => {
  el.addEventListener("focus", () => {
    // requestAnimationFrame so focus-set / blur-restore cycles settle
    // before the selection paints — without this, Chrome sometimes
    // deselects right after focus.
    requestAnimationFrame(() => el.select());
  });
});

// ---------- close paths -----------------------------------------------------
btnX.addEventListener("click", () => { void close(); });
btnCancel.addEventListener("click", () => { void close(); });

// Click on the dimmed area outside the card → cancel-close. We listen on
// the body and bail out if the click landed inside the card. This matches
// the portal-edit "click backdrop to dismiss" pattern.
document.body.addEventListener("mousedown", (e) => {
  if (!cardEl) return;
  const target = e.target as Node | null;
  if (target && cardEl.contains(target)) return;
  e.preventDefault();
  void close();
});

btnDelete.addEventListener("click", () => {
  if (!editingResourceId) return;
  if (!confirm(T("reConfirmDelete"))) return;
  broadcast(BC_RESOURCE_DELETE, { itemId, resourceId: editingResourceId });
});

btnSave.addEventListener("click", () => {
  const name = inpName.value.trim();
  if (!name) {
    alert(T("reErrNameEmpty"));
    inpName.focus();
    return;
  }
  const type = selectedType;
  const slots = type === "spellSlots" ? cleanSlots(slotValues) : null;
  const pools = type === "hitDice" ? cleanPools(poolValues) : null;
  const totals = slots ? slotTotals(slots) : pools ? slotTotals(pools) : null;
  const current = totals ? totals.current : Number(inpCurrent.value);
  const max = totals ? totals.max : Number(inpMax.value);
  if (!Number.isFinite(current) || !Number.isFinite(max)) {
    alert(T("reErrNumbers"));
    return;
  }
  const resource: Resource = {
    id: editingResourceId || `r-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
    name,
    type,
    current,
    max,
    icon: selectedIcon,
    ...(type === "dieRoll" ? { dieInfo: selectedDieInfo } : {}),
    ...(pools ? { pools, dieInfo: pools[0]?.die ?? "d8" } : {}),
    ...(slots ? { slots } : {}),
    ...(type === "charges"
      ? { chargesFormula: chargesFormulaInput?.value.trim() || null }
      : {}),
    ...(!isSpecialResource({ type }) && eligSpells.checked ? { forSpells: true } : {}),
    ...(!isSpecialResource({ type }) && eligFeatures.checked ? { forFeatures: true } : {}),
    recovery: selectedRecovery,
  };
  broadcast(BC_RESOURCE_SAVE, { itemId, resource });
});

inpName.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); btnSave.click(); }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { e.preventDefault(); void close(); }
});

OBR.onReady(() => {
  try {
    const raw = location.hash.replace(/^#/, "");
    if (raw) {
      const payload = JSON.parse(decodeURIComponent(raw)) as HashPayload;
      applyPayload(payload);
    } else {
      console.warn("[resource-edit] no payload in URL hash");
    }
  } catch (e) {
    console.warn("[resource-edit] failed to parse hash payload", e);
  }
});
