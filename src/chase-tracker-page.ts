import OBR from "@owlbear-rodeo/sdk";
import { getLocalLang } from "./state";
import {
  PLUGIN_ID,
  ChaseEntry,
  ChaseParticipant,
} from "./modules/chaseTracker/types";
import {
  readChases,
  writeChases,
  stampMemberFlag,
  normalizeChase,
} from "./modules/chaseTracker/storage";
import { PANEL_IDS } from "./utils/panelLayout";
import { bindPanelDrag } from "./utils/panelDrag";

const INIT_METADATA_KEY = "com.initiative-tracker/data";
const INIT_COMBAT_KEY = "com.initiative-tracker/combat";

const dragHandleEl = document.getElementById("dragHandle") as HTMLElement;
const dockTitleEl = document.getElementById("dockTitle")!;
const bodyEl = document.getElementById("body")!;
const chaseIndicatorEl = document.getElementById(
  "chaseIndicator",
) as HTMLElement;
const chaseCounterEl = document.getElementById("chaseCounter") as HTMLElement;
const editorEl = document.getElementById("editor") as HTMLElement;
const editorNameEl = document.getElementById("editorName")!;
const editorDecEl = document.getElementById("editorDec")!;
const editorIncEl = document.getElementById("editorInc")!;
const editorInputEl = document.getElementById(
  "editorInput",
) as HTMLInputElement;
const editorConfirmEl = document.getElementById(
  "editorConfirm",
) as HTMLButtonElement;
const editorCancelEl = document.getElementById(
  "editorCancel",
) as HTMLButtonElement;

let isGM = false;
let selectedTokenId: string | null = null;
let lastActiveTokenId: string | null = null;
let draftDistance: number | null = null;
let gridStep = 5;
let renderQueued = false;
let scrollListenerAttached = false;

function queueRender(): void {
  if (renderQueued) return;
  renderQueued = true;
  setTimeout(() => {
    renderQueued = false;
    void render();
  }, 100);
}

async function refreshGridStep(): Promise<void> {
  try {
    const scale = await OBR.scene.grid.getScale();
    const m = Math.abs(scale?.parsed?.multiplier ?? 0);
    gridStep = m > 0 ? m : 5;
  } catch {
    gridStep = 5;
  }
}

async function deleteChase(chaseId: string): Promise<void> {
  if (!isGM) return;
  const chases = await readChases();
  const chase = chases.find((c) => c.id === chaseId);
  if (!chase) return;
  await Promise.all(
    chase.participants.map((p) => stampMemberFlag(p.tokenId, null)),
  );
  await writeChases(chases.filter((c) => c.id !== chaseId));
  if (chase.participants.some((p) => p.tokenId === selectedTokenId)) {
    selectedTokenId = null;
    draftDistance = null;
  }
}

function findSelected(
  chases: ChaseEntry[],
): { chase: ChaseEntry; participant: ChaseParticipant } | null {
  if (!selectedTokenId) return null;
  for (const chase of chases) {
    const participant = chase.participants.find(
      (p) => p.tokenId === selectedTokenId,
    );
    if (participant) return { chase, participant };
  }
  return null;
}

function findActiveParticipantId(
  chases: ChaseEntry[],
  itemsById: Map<string, any>,
  inCombat: boolean,
): string | null {
  if (!inCombat) return null;
  for (const chase of chases) {
    for (const p of chase.participants) {
      const item = itemsById.get(p.tokenId);
      if ((item?.metadata?.[INIT_METADATA_KEY] as any)?.active)
        return p.tokenId;
    }
  }
  return null;
}

async function confirmEdit(): Promise<void> {
  if (!isGM || !selectedTokenId || draftDistance === null) return;
  const chases = await readChases();
  const idx = chases.findIndex((c) =>
    c.participants.some((p) => p.tokenId === selectedTokenId),
  );
  if (idx === -1) {
    draftDistance = null;
    void render();
    return;
  }
  const distance = Math.max(0, draftDistance);
  chases[idx] = normalizeChase({
    ...chases[idx],
    participants: chases[idx].participants.map((p) =>
      p.tokenId === selectedTokenId ? { ...p, distance } : p,
    ),
  });
  await writeChases(chases);
  draftDistance = null;
  void render();
}

function cancelEdit(): void {
  draftDistance = null;
  void render();
}

function stepEdit(delta: number, currentDistance: number): void {
  const base = draftDistance ?? currentDistance;
  draftDistance = Math.max(0, base + delta);
  editorInputEl.value = String(draftDistance);
  editorConfirmEl.disabled = false;
}

/**
 * Popola l'indicatore laterale (pallini) e gestisce lo scroll listener.
 * Un pallino per ogni chase; quello attivo riflette la chase visibile.
 */
function renderChaseIndicator(chases: ChaseEntry[]): void {
  chaseIndicatorEl.innerHTML = "";

  // Contatore in header: mostra 1/N anche con una sola chase.
  if (chases.length === 0) {
    chaseCounterEl.classList.add("hidden");
    chaseIndicatorEl.classList.add("hidden");
    return;
  }
  chaseCounterEl.classList.remove("hidden");
  chaseCounterEl.textContent = `1 / ${chases.length}`;

  // Pallini laterali: solo se c'è più di una chase.
  if (chases.length < 2) {
    chaseIndicatorEl.classList.add("hidden");
  } else {
    chaseIndicatorEl.classList.remove("hidden");
    for (let i = 0; i < chases.length; i++) {
      const dot = document.createElement("div");
      dot.className = "chase-dot";
      chaseIndicatorEl.appendChild(dot);
    }
  }

  if (!scrollListenerAttached) {
    scrollListenerAttached = true;
    bodyEl.addEventListener("scroll", updateActiveIndicator, { passive: true });
  }

  requestAnimationFrame(updateActiveIndicator);
}

function updateActiveIndicator(): void {
  const dots = chaseIndicatorEl.querySelectorAll<HTMLElement>(".chase-dot");
  const chaseEls = bodyEl.querySelectorAll<HTMLElement>(".chase");
  if (chaseEls.length === 0) return;

  const paddingTop = parseFloat(getComputedStyle(bodyEl).paddingTop) || 5;
  const bodyRect = bodyEl.getBoundingClientRect();

  let activeIdx = 0;
  let minDist = Infinity;
  chaseEls.forEach((el, i) => {
    const rect = el.getBoundingClientRect();
    const dist = Math.abs(rect.top - (bodyRect.top + paddingTop));
    if (dist < minDist) {
      minDist = dist;
      activeIdx = i;
    }
  });

  // Aggiorna il contatore nell'header e il pallino attivo.
  chaseCounterEl.textContent = `${activeIdx + 1} / ${chaseEls.length}`;
  dots.forEach((d, i) => {
    d.classList.toggle("active", i === activeIdx);
  });
}

function renderEditor(
  chases: ChaseEntry[],
  itemsById: Map<string, any>,
  en: boolean,
): void {
  const found = findSelected(chases);

  // Nessuna selezione (o utente non-GM): footer visibile ma disabilitato.
  if (!found || !isGM) {
    editorEl.classList.add("disabled");
    editorNameEl.textContent = en ? "Select a token" : "Seleziona una pedina";
    editorInputEl.value = "";
    editorInputEl.disabled = true;
    editorConfirmEl.disabled = true;
    editorCancelEl.disabled = true;
    editorConfirmEl.textContent = en ? "Confirm" : "确认";
    editorCancelEl.textContent = en ? "Cancel" : "取消";
    // Rimuove gli handler precedenti per evitare click "fantasma".
    editorDecEl.onclick = null;
    editorIncEl.onclick = null;
    editorInputEl.oninput = null;
    editorConfirmEl.onclick = null;
    editorCancelEl.onclick = null;
    return;
  }

  const { participant } = found;
  const item = itemsById.get(participant.tokenId);

  editorEl.classList.remove("disabled");
  editorInputEl.disabled = false;
  editorConfirmEl.disabled = false;
  editorCancelEl.disabled = false;

  editorNameEl.textContent =
    item?.name ||
    (participant.role === "quarry"
      ? en
        ? "Quarry"
        : "猎物"
      : en
        ? "Pursuer"
        : "追击者");

  const shown = draftDistance ?? participant.distance;
  if (document.activeElement !== editorInputEl) {
    editorInputEl.value = String(shown);
  }
  editorConfirmEl.textContent = en ? "Confirm" : "确认";
  editorCancelEl.textContent = en ? "Cancel" : "取消";
  editorConfirmEl.disabled = draftDistance === null;

  editorDecEl.onclick = () => stepEdit(-gridStep, participant.distance);
  editorIncEl.onclick = () => stepEdit(gridStep, participant.distance);
  editorInputEl.oninput = () => {
    const v = Number(editorInputEl.value);
    draftDistance = Math.max(0, Number.isFinite(v) ? v : 0);
    editorConfirmEl.disabled = false;
  };
  editorConfirmEl.onclick = () => void confirmEdit();
  editorCancelEl.onclick = () => cancelEdit();
}

async function render(): Promise<void> {
  const en = getLocalLang() === "en";
  dockTitleEl.textContent = en ? "Chase Tracker" : "追逐战追踪器";
  const dragTitle = en ? "Drag to reposition" : "拖动重新定位";
  dragHandleEl.title = dragTitle;
  dragHandleEl.setAttribute("aria-label", dragTitle);

  const chases = await readChases();
  if (chases.length === 0) {
    bodyEl.innerHTML = "";
    chaseIndicatorEl.innerHTML = "";
    chaseIndicatorEl.classList.add("hidden");
    chaseCounterEl.classList.add("hidden");
    // Footer resta visibile ma disabilitato.
    renderEditor([], new Map(), en);
    return;
  }

  const allIds = Array.from(
    new Set(chases.flatMap((c) => c.participants.map((p) => p.tokenId))),
  );
  let itemsById = new Map<string, any>();
  try {
    const items = await OBR.scene.items.getItems(allIds);
    itemsById = new Map(items.map((i) => [i.id, i]));
  } catch {}

  let inCombat = false;
  try {
    const meta = await OBR.scene.getMetadata();
    inCombat = !!(meta[INIT_COMBAT_KEY] as any)?.inCombat;
  } catch {}

  // Auto-follow iniziativa: quando cambia il turno attivo, seleziona
  // la pedina e (vedi sotto) scrolla alla chase che la contiene.
  const activeId = findActiveParticipantId(chases, itemsById, inCombat);
  let shouldScrollToSelection = false;
  if (activeId !== lastActiveTokenId) {
    lastActiveTokenId = activeId;
    if (activeId) {
      selectedTokenId = activeId;
      draftDistance = null;
      shouldScrollToSelection = true;
    }
  }
  if (selectedTokenId && !findSelected(chases)) {
    selectedTokenId = null;
    draftDistance = null;
  }

  // Ricorda lo scroll per ripristinarlo dopo il re-render (così
  // l'utente non "salta" alla chase 1 ogni volta che cambia qualcosa
  // che non sia l'iniziativa).
  const prevScroll = bodyEl.scrollTop;

  bodyEl.innerHTML = "";
  chases.forEach((chase, idx) => {
    bodyEl.appendChild(renderChase(chase, idx, itemsById, inCombat, en));
  });

  renderChaseIndicator(chases);
  renderEditor(chases, itemsById, en);

  // Ripristina lo scroll (o salta alla chase della pedina attiva se
  // la selezione è appena cambiata per via dell'iniziativa).
  requestAnimationFrame(() => {
    if (shouldScrollToSelection && selectedTokenId) {
      const idx = chases.findIndex((c) =>
        c.participants.some((p) => p.tokenId === selectedTokenId),
      );
      const target =
        idx >= 0
          ? (bodyEl.children[idx] as HTMLElement | undefined)
          : undefined;
      if (target) {
        // Allinea il bordo superiore della chase al padding-top del
        // body — stessa posizione che lo scroll-snap usa come "start",
        // così il contatore e il pallino attivo restano coerenti.
        const paddingTop =
          parseFloat(getComputedStyle(bodyEl).paddingTop) || 5;
        const delta =
          target.getBoundingClientRect().top -
          bodyEl.getBoundingClientRect().top -
          paddingTop;
        bodyEl.scrollTo({ top: bodyEl.scrollTop + delta, behavior: "smooth" });
      }
    } else {
      bodyEl.scrollTop = prevScroll;
    }
    updateActiveIndicator();
  });
}

function renderChase(
  chase: ChaseEntry,
  idx: number,
  itemsById: Map<string, any>,
  inCombat: boolean,
  en: boolean,
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "chase";

  const quarry = chase.participants.find((p) => p.role === "quarry");
  const pursuers = chase.participants.filter((p) => p.role === "pursuer");
  const quarryDistance = quarry?.distance ?? 0;

  const main = document.createElement("div");
  main.className = "chase-main";

  const head = document.createElement("div");
  head.className = "chase-head";
  const title = document.createElement("div");
  title.className = "chase-title";
  title.textContent = `${en ? "Chase" : "追逐战"} ${idx + 1}`;
  head.appendChild(title);

  const gapEl = document.createElement("div");
  gapEl.className = "chase-gap";
  if (pursuers.length > 0) {
    const closest = Math.min(
      ...pursuers.map((p) => Math.max(0, quarryDistance - p.distance)),
    );
    gapEl.textContent = en ? `${closest} away` : `距离 ${closest}`;
  } else {
    gapEl.textContent = en ? "no pursuers yet" : "暂无追击者";
  }
  head.appendChild(gapEl);

  main.appendChild(head);

  const trackWrap = document.createElement("div");
  trackWrap.className = "track-wrap";
  const track = document.createElement("div");
  track.className = "track";
  trackWrap.appendChild(track);

  const trackMax = Math.max(1, quarryDistance);
  const pctFor = (distance: number): number => {
    const pct = (Math.max(0, distance) / trackMax) * 100;
    return Math.max(0, Math.min(100, pct));
  };
  const PIN_D = 24;
  const leftStyleFor = (pct: number): string => {
    const offsetPx = PIN_D / 2 - (pct / 100) * PIN_D;
    return `calc(${pct}% + ${offsetPx}px)`;
  };

  const orderedParticipants = quarry ? [...pursuers, quarry] : pursuers;

  for (const p of orderedParticipants) {
    const item = itemsById.get(p.tokenId);
    const pin = document.createElement("div");
    pin.className = `pin ${p.role}`;
    if (item?.image?.url) pin.style.backgroundImage = `url(${item.image.url})`;
    if (p.tokenId === selectedTokenId) pin.classList.add("selected");
    const active = !!(item?.metadata?.[INIT_METADATA_KEY] as any)?.active;
    if (inCombat && active) pin.classList.add("active-turn");

    pin.style.left = leftStyleFor(pctFor(p.distance));

    const label = document.createElement("div");
    label.className = "pin-label";
    if (p.role === "quarry") {
      label.textContent = item?.name || (en ? "Quarry" : "猎物");
    } else {
      const gap = Math.max(0, quarryDistance - p.distance);
      label.textContent = `${gap} ${en ? "away" : ""}`;
    }
    pin.appendChild(label);

    pin.addEventListener("click", () => {
      selectedTokenId = selectedTokenId === p.tokenId ? null : p.tokenId;
      draftDistance = null;
      void render();
    });

    trackWrap.appendChild(pin);
  }

  wrap.appendChild(main);
  main.appendChild(trackWrap);

  if (isGM) {
    const del = document.createElement("div");
    del.className = "chase-del";
    del.title = en ? "Delete this chase" : "删除这个追逐战";
    del.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
      <line x1="10" y1="11" x2="10" y2="17"/>
      <line x1="14" y1="11" x2="14" y2="17"/>
    </svg>`;
    del.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      void deleteChase(chase.id);
    });
    wrap.appendChild(del);
  }

  return wrap;
}

async function init(): Promise<void> {
  try {
    isGM = (await OBR.player.getRole()) === "GM";
  } catch {}
  OBR.player.onChange((p) => {
    const was = isGM;
    isGM = p.role === "GM";
    if (was !== isGM) void render();
  });
  await refreshGridStep();
  OBR.scene.grid.onChange(() => {
    void refreshGridStep();
  });
  OBR.scene.onMetadataChange(() => queueRender());
  OBR.scene.items.onChange(() => queueRender());
  bindPanelDrag(dragHandleEl, PANEL_IDS.chaseTracker);
  await render();
}

OBR.onReady(() => void init());
