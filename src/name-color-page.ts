// "Edit name tag" (token context menu, while "Show token name" is on):
// the token's name and the colour of its name plate. With several
// tokens selected only the colour is edited. "Default" puts the colour
// back to the suite blue. The name is written to the token's OBR label
// when it has one (that's the name the plate shows), else to the item
// name.
import OBR, { type Item } from "@owlbear-rodeo/sdk";
import { getLocalLang } from "./state";
import {
  DEFAULT_NAME_COLOR,
  NAME_COLOR_KEY,
  tokenDisplayName,
} from "./modules/bubbles/index";
import { NAME_COLOR_MODAL_ID } from "./modules/bubbles/name-plate";

const en = getLocalLang() === "en";
const ids = (new URLSearchParams(location.search).get("ids") ?? "")
  .split(",")
  .filter(Boolean);
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const SWATCHES = [
  DEFAULT_NAME_COLOR,
  "#1c2030",
  "#2e7d32",
  "#8e2c2c",
  "#6a3d9a",
  "#b8860b",
  "#c2185b",
  "#00838f",
  "#4e5566",
  "#e6e8ee",
];

const preview = $("preview");
const nameEl = $<HTMLInputElement>("name");
const picker = $<HTMLInputElement>("picker");
const hex = $<HTMLInputElement>("hex");
const swatches = $("swatches");
const nameCount = $("nameCount");
const NAME_MAX = 20;
let color = DEFAULT_NAME_COLOR;
let originalName = "";
let multi = false;

function updateNameCount(): void {
  const len = nameEl.value.length;
  nameCount.textContent = `${len}/${NAME_MAX}`;
  nameCount.classList.toggle("warn", len >= NAME_MAX - 3 && len < NAME_MAX);
  nameCount.classList.toggle("full", len >= NAME_MAX);
}

function textColorFor(c: string): string {
  const n = parseInt(c.slice(1), 16);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L =
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.05 ? "#ffffff" : "#111111";
}

function paint(): void {
  preview.style.background = color;
  preview.style.color = textColorFor(color);
  if (!multi) preview.textContent = nameEl.value.trim() || "—";
  picker.value = color;
  if (document.activeElement !== hex) hex.value = color;
  for (const el of swatches.querySelectorAll<HTMLElement>(".sw")) {
    el.classList.toggle("on", el.dataset.c === color);
  }
}

function setColor(c: string): void {
  if (!/^#[0-9a-fA-F]{6}$/.test(c)) return;
  color = c.toLowerCase();
  paint();
}

function close(): void {
  void OBR.modal.close(NAME_COLOR_MODAL_ID);
}

async function write(colorValue: string | null): Promise<void> {
  const nextName = nameEl.value.trim();
  const rename = !multi && !!nextName && nextName !== originalName;
  try {
    await OBR.scene.items.updateItems(ids, (drafts) => {
      for (const d of drafts) {
        if (colorValue) (d.metadata as any)[NAME_COLOR_KEY] = colorValue;
        else delete (d.metadata as any)[NAME_COLOR_KEY];
        if (rename) {
          const any = d as any;
          if (String(any.text?.plainText ?? "").trim()) {
            // Replace the whole text object (OBR drops some field-level
            // text mutations).
            any.text = { ...any.text, plainText: nextName };
          }
          d.name = nextName;
        }
      }
    });
  } catch (e) {
    console.warn("[name-tag] write failed", e);
  }
  close();
}

$("title").textContent = en ? "Edit name tag" : "编辑名字标签";
$("nameLbl").textContent = en ? "Token name" : "Token 名字";
$("colorLbl").textContent = en ? "Color" : "颜色";
$("reset").textContent = en ? "Default color" : "默认颜色";
$("cancel").textContent = en ? "Cancel" : "取消";
$("apply").textContent = en ? "Apply" : "应用";
swatches.innerHTML = SWATCHES.map(
  (c) =>
    `<div class="sw" data-c="${c}" style="background:${c}" title="${c}"></div>`,
).join("");

OBR.onReady(async () => {
  let items: Item[] = [];
  try {
    items = await OBR.scene.items.getItems(ids);
  } catch {}
  multi = items.length > 1;
  const first = items[0];
  const c = (first?.metadata as any)?.[NAME_COLOR_KEY];
  if (typeof c === "string") setColor(c);
  originalName = first ? tokenDisplayName(first) : "";
  nameEl.value = originalName;
  updateNameCount();
  if (multi) {
    // Several tokens: colour only.
    nameEl.hidden = true;
    $("nameLbl").hidden = true;
    $("nameCount").hidden = true;
    preview.textContent = `${tokenDisplayName(first)} +${items.length - 1}`;
  }
  paint();
  if (!multi) {
    nameEl.focus();
    nameEl.select();
  }
  nameEl.addEventListener("input", () => {
    paint();
    updateNameCount();
  });
  swatches.addEventListener("click", (e) => {
    const sw = (e.target as HTMLElement).closest<HTMLElement>(".sw")?.dataset.c;
    if (sw) setColor(sw);
  });
  picker.addEventListener("input", () => setColor(picker.value));
  hex.addEventListener("input", () => {
    const v = hex.value.trim();
    setColor(v.startsWith("#") ? v : `#${v}`);
  });
  $("close").addEventListener("click", close);
  $("cancel").addEventListener("click", close);
  $("reset").addEventListener("click", () => void write(null));
  $("apply").addEventListener("click", () => void write(color));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
    if (e.key === "Enter") void write(color);
  });
});
