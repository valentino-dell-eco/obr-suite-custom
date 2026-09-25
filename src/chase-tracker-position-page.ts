import OBR from "@owlbear-rodeo/sdk";
import { getLocalLang } from "./state";
import { PLUGIN_ID } from "./modules/chaseTracker/types";
import { readChases, writeChases, findChaseOfToken, normalizeChase } from "./modules/chaseTracker/storage";

const MODAL_ID = `${PLUGIN_ID}/position-edit`;
const params = new URLSearchParams(location.search);
const tokenId = params.get("token") || "";

const titleEl = document.getElementById("title")!;
const subtitleEl = document.getElementById("subtitle")!;
const input = document.getElementById("distance") as HTMLInputElement;
const decEl = document.getElementById("dec")!;
const incEl = document.getElementById("inc")!;
const cancelEl = document.getElementById("cancel")!;
const saveEl = document.getElementById("save")!;

async function close(): Promise<void> {
  try { await OBR.modal.close(MODAL_ID); } catch {}
}

async function init(): Promise<void> {
  const en = getLocalLang() === "en";
  document.documentElement.lang = en ? "en" : "zh";
  titleEl.textContent = en ? "Change Chase position" : "修改追逐战位置";
  subtitleEl.textContent = en ? "Distance travelled so far:" : "目前已移动的距离：";
  cancelEl.textContent = en ? "Cancel" : "取消";
  saveEl.textContent = en ? "Save" : "保存";

  if (!tokenId) { await close(); return; }
  const chases = await readChases();
  const chase = findChaseOfToken(chases, tokenId);
  const participant = chase?.participants.find((p) => p.tokenId === tokenId);
  input.value = String(participant?.distance ?? 0);
  input.focus();
  input.select();
}

decEl.addEventListener("click", () => {
  input.value = String(Math.max(0, (Number(input.value) || 0) - 5));
});
incEl.addEventListener("click", () => {
  input.value = String((Number(input.value) || 0) + 5);
});

async function save(): Promise<void> {
  if (!tokenId) { await close(); return; }
  const value = Number(input.value);
  const distance = Math.max(0, Number.isFinite(value) ? value : 0);
  const chases = await readChases();
  const chaseIdx = chases.findIndex((c) =>
    c.participants.some((p) => p.tokenId === tokenId),
  );
  if (chaseIdx === -1) { await close(); return; }
  const chase = chases[chaseIdx];
  chases[chaseIdx] = normalizeChase({
    ...chase,
    participants: chase.participants.map((p) =>
      p.tokenId === tokenId ? { ...p, distance } : p,
    ),
  });
  await writeChases(chases);
  await close();
}

cancelEl.addEventListener("click", () => void close());
saveEl.addEventListener("click", () => void save());
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") void save();
  if (e.key === "Escape") void close();
});

OBR.onReady(() => void init());
