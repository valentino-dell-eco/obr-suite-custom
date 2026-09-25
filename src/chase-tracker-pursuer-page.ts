import OBR from "@owlbear-rodeo/sdk";
import { getLocalLang } from "./state";
import { PLUGIN_ID, DEFAULT_PURSUER_GAP, ChaseEntry } from "./modules/chaseTracker/types";
import { readChases, writeChases, stampMemberFlag, normalizeChase } from "./modules/chaseTracker/storage";

const MODAL_ID = `${PLUGIN_ID}/pursuer-picker`;
const params = new URLSearchParams(location.search);
const tokenId = params.get("token") || "";

const titleEl = document.getElementById("title")!;
const subtitleEl = document.getElementById("subtitle")!;
const listEl = document.getElementById("list")!;
const cancelEl = document.getElementById("cancel")!;

async function close(): Promise<void> {
  try { await OBR.modal.close(MODAL_ID); } catch {}
}

async function render(): Promise<void> {
  const en = getLocalLang() === "en";
  document.documentElement.lang = en ? "en" : "zh";
  titleEl.textContent = en ? "Add to Chase as Pursuer" : "加入追逐战（作为追击者）";
  subtitleEl.textContent = en ? "Choose which chase to join:" : "选择要加入的追逐战：";
  cancelEl.textContent = en ? "Cancel" : "取消";

  if (!tokenId) { close(); return; }

  const chases = await readChases();
  // Already a member of one of these? Shouldn't normally happen (the
  // context menu hides once flagged) but guard anyway.
  const eligible = chases.filter(
    (c) => !c.participants.some((p) => p.tokenId === tokenId),
  );

  if (eligible.length === 0) {
    listEl.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = en ? "No chase to join." : "没有可加入的追逐战。";
    listEl.appendChild(empty);
    return;
  }

  const quarryIds = eligible
    .map((c) => c.participants.find((p) => p.role === "quarry")?.tokenId)
    .filter((id): id is string => !!id);
  let itemsById = new Map<string, any>();
  try {
    const items = await OBR.scene.items.getItems(quarryIds);
    itemsById = new Map(items.map((i) => [i.id, i]));
  } catch {}

  listEl.innerHTML = "";
  for (const chase of eligible) {
    const quarry = chase.participants.find((p) => p.role === "quarry");
    const quarryItem = quarry ? itemsById.get(quarry.tokenId) : undefined;
    const row = document.createElement("div");
    row.className = "chase-row";

    const img = document.createElement("img");
    img.src = quarryItem?.image?.url || "";
    row.appendChild(img);

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = quarryItem?.name || (en ? "Unknown quarry" : "未知猎物");
    row.appendChild(name);

    const count = document.createElement("div");
    count.className = "count";
    const pursuerCount = chase.participants.filter((p) => p.role === "pursuer").length;
    count.textContent = en
      ? `${pursuerCount} pursuer${pursuerCount === 1 ? "" : "s"}`
      : `${pursuerCount} 名追击者`;
    row.appendChild(count);

    row.addEventListener("click", () => void joinChase(chase));
    listEl.appendChild(row);
  }
}

async function joinChase(chase: ChaseEntry): Promise<void> {
  const chases = await readChases();
  const idx = chases.findIndex((c) => c.id === chase.id);
  if (idx === -1) { await close(); return; }
  const quarry = chases[idx].participants.find((p) => p.role === "quarry");
  // Quarry is always the front of the line (max distance) — a newly
  // joining pursuer starts BEHIND it by the default gap, never below
  // the fixed zero point.
  const startDistance = quarry ? Math.max(0, quarry.distance - DEFAULT_PURSUER_GAP) : 0;
  chases[idx] = normalizeChase({
    ...chases[idx],
    participants: [
      ...chases[idx].participants,
      { tokenId, role: "pursuer", distance: startDistance },
    ],
  });
  await writeChases(chases);
  await stampMemberFlag(tokenId, chase.id);
  await close();
}

cancelEl.addEventListener("click", () => void close());
OBR.onReady(() => void render());
