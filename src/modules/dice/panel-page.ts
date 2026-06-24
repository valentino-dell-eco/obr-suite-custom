import OBR from "@owlbear-rodeo/sdk";
import { ICONS } from "../../icons";
import { applyI18nDom, t } from "../../i18n";
import { getLocalLang, onLangChange } from "../../state";
import { assetUrl } from "../../asset-base";
import { reconcileUploadedCardShieldState } from "../characterCards/xlsx-shield-state.ts";
// 2026-06-20 — same quick-pick popup info-page.ts uses for its own
// .rollable clicks. Exported specifically so this file can forward
// "cc-roll-dice" messages from the nested cc-fullscreen.html iframe,
// which has no working OBR SDK of its own (see the FULLSCREEN_MODAL_ID
// comment below) and so can't open the popup itself.
import { openQuickPopupAt } from "./context-menu";

// Mirrors fullscreen-page.tsx's own BIND_META_KEY — the token-binding
// metadata key written by characterCards' bind-page.ts. Used below to
// resolve which token (if any) is bound to the currently-open card,
// so a roll fired from the fullscreen iframe anchors/focuses on the
// right token exactly like a roll fired from info-page.ts would.
const BIND_META_KEY = "com.character-cards/boundCardId";

let lang = getLocalLang();
const tt = (k: Parameters<typeof t>[1]) => t(lang, k);

// Template file configuration per language
interface TemplateConfig {
  files: { name: string; filename: string }[];
  langCode: "zh" | "en";
}

const TEMPLATES: Record<"zh" | "en", TemplateConfig> = {
  zh: {
    langCode: "zh",
    files: [
      { name: "2014 模板", filename: "DND5E人物卡_悲灵_弗人_枭熊适配版.xlsx" },
      { name: "2024 模板", filename: "DND5R人物卡_悲灵_弗人_枭熊适配版.xlsx" },
    ],
  },
  en: {
    langCode: "en",
    files: [{ name: "Character Sheet", filename: "GSheet v2.1.xlsx" }],
  },
};

function getTemplateConfigForLang(language: string): TemplateConfig {
  return language === "zh" ? TEMPLATES.zh : TEMPLATES.en;
}

// LOCAL broadcast: when the local-file refresh succeeds, every cc
// panel instance reloads the affected card iframe so other clients
// (DM + players) see the new content without re-uploading.
const BC_CARD_UPDATED = "com.obr-suite/cc-card-updated";

// Suite-namespaced popover ID so the standalone plugin's panel doesn't
// fight with us during dual-install. Scene-metadata keys (the bound card
// list, BIND_META) stay under the original com.character-cards/* namespace
// for backward compatibility.
// Switched from popover to modal so open/close is instant (no
// fade-in/out transition). Modal is fullScreen — no need for setWidth /
// setHeight, the iframe always covers the viewport.
const PANEL_MODAL_ID = "com.obr-suite/cc-panel";
// Shared open-state key — index.ts's toolbar tool reads it to decide
// open-vs-close. Cleared by every close path here (X / Esc / backdrop,
// plus pagehide/beforeunload for OBR's click-outside close). A
// synchronous localStorage write is reliable on unload; the async OBR
// broadcast this replaced was not — the "click-twice-to-reopen" bug.
const PANEL_OPEN_KEY = "com.obr-suite/cc-panel-open";
// const API_BASE = "https://obr.dnd.center/api/character";
const API_BASE = "/api-dnd-center/api/character";
const SCENE_META_KEY = "com.character-cards/list";
const LS_PREFIX = "character-cards/";

const POPOVER_BOX = 64;

interface CardEntry {
  id: string;
  name: string;
  uploader: string;
  uploaded_at: string;
  url: string;
  /** Visibility (added 2026-05-03):
   *    - undefined / "public" → all clients see this card in the
   *      sidebar list (default).
   *    - "dm" → only the DM sees the card row. Other players don't
   *      get it in their list at all.
   *    - "owners" → DM + listed `owner_ids` see it. Useful for "this
   *      is player A's secret backup character — only A and the DM
   *      should see the card row".
   *  Soft hide: the data.json on the server isn't access-controlled
   *  (no auth layer), so a player who knows a card's URL could still
   *  open it directly. The toggle hides it from the in-app discovery
   *  flow, which covers the "DM doesn't want NPC cards in players'
   *  sidebars" use case. */
  visibility?: "public" | "dm" | "owners";
  owner_ids?: string[];
}

function canSeeCard(card: CardEntry, isGM: boolean, playerId: string): boolean {
  if (isGM) return true;
  const v = card.visibility ?? "public";
  if (v === "public") return true;
  if (v === "owners")
    return Array.isArray(card.owner_ids) && card.owner_ids.includes(playerId);
  return false; // "dm" or unknown
}

function nextVisibilityLevel(
  v: CardEntry["visibility"],
): CardEntry["visibility"] {
  // Cycle: public → dm → public.
  // (owners level is set via the owner-picker dialog; the cycle button
  // skips it to keep the one-click flow simple.)
  if (v === "dm") return "public";
  return "dm";
}

interface ResourceDef {
  slug: string;
  label: string;
  icon: string;
  url: string;
}

// 2026-05-14 — removed 不全书 (5echm.kagangtuya.top) per user request.
// Previous removal in this round dropped 5etool (5e.kiwee.top) for V8
// heap reasons; now the entire book/resource column is retired. The
// array is kept (empty) so the column wiring can re-host a future
// resource without touching the render pipeline. buildResourceColumn
// detects empty RESOURCES and hides the column entirely.
const RESOURCES: ResourceDef[] = [];

type View =
  | { type: "empty" }
  | { type: "card"; id: string }
  | { type: "resource"; slug: string };

let roomId = "";
let playerName = "anonymous";
let myPlayerId = "";
let isGM = false;
let cards: CardEntry[] = [];
let current: View = { type: "empty" };
let maximized = false;
// 2026-06 — party list fetched here (this document's OBR SDK works;
// cc-fullscreen.html's doesn't, since it's a nested iframe). Forwarded
// to the active card iframe via plain window.postMessage — see
// postPlayersToFullscreenIframe below and the matching listener added
// in fullscreen-page.tsx.
let allPlayers: any[] = [];
const resourceIframes = new Map<string, HTMLIFrameElement>();

/** Forward the current allPlayers snapshot to whichever cc-fullscreen
 *  iframe is currently mounted in .viewer, if any. Safe to call even
 *  when no card is selected (no-op) or before the iframe has finished
 *  loading (fullscreen-page.tsx's own listener buffers/ignores until
 *  it's mounted — see its useEffect for the "cc-players" message). */
function postPlayersToFullscreenIframe() {
  if (current.type !== "card") return;
  const f = viewer?.querySelector<HTMLIFrameElement>(
    'iframe[data-kind="card"]',
  );
  if (!f?.contentWindow) return;
  try {
    f.contentWindow.postMessage(
      {
        type: "cc-players",
        myId: myPlayerId,
        role: isGM ? "GM" : "PLAYER",
        players: allPlayers,
      },
      "*",
    );
  } catch (e) {
    console.warn("[cc-panel] postPlayersToFullscreenIframe failed", e);
  }
}

const viewer = document.getElementById("viewer") as HTMLDivElement;
const listEl = document.getElementById("list") as HTMLDivElement;
const errEl = document.getElementById("error") as HTMLDivElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const resCol = document.getElementById("resCol") as HTMLElement;
const emptyText = document.getElementById("emptyText") as HTMLDivElement;
// miniBtn removed in v1.1 — the cluster's "角色卡界面" button is the
// only way to open this panel.
const closeBtn = document.getElementById("closeBtn") as HTMLButtonElement;
// "About" button removed — suite's About panel covers it.
// "弹窗" toggle moved to the floating controls popover next to the main button.

function safeRoomId(s: string): string {
  return s.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64) || "default";
}

function stateKey(): string {
  return `${LS_PREFIX}state/${roomId}`;
}

function saveState() {
  try {
    let activeCardId: string | null = null;
    let activeResource: string | null = null;
    if (current.type === "card") {
      activeCardId = current.id;
      // scrollY tracking removed — cards no longer live in a nested
      // iframe inside this document (they're their own OBR.modal now),
      // so there's nothing here to read scroll position from.
    } else if (current.type === "resource") {
      activeResource = current.slug;
    }
    localStorage.setItem(
      stateKey(),
      JSON.stringify({ activeCardId, activeResource, maximized }),
    );
  } catch {}
}

function loadState(): {
  activeCardId: string | null;
  activeResource: string | null;
  scrollY: number;
  maximized: boolean;
} {
  try {
    const raw = localStorage.getItem(stateKey());
    if (raw) {
      const o = JSON.parse(raw);
      return {
        activeCardId: o.activeCardId ?? null,
        activeResource: o.activeResource ?? null,
        scrollY: o.scrollY ?? 0,
        maximized: !!o.maximized,
      };
    }
  } catch {}
  return {
    activeCardId: null,
    activeResource: null,
    scrollY: 0,
    maximized: false,
  };
}

async function setMaximized(next: boolean) {
  maximized = next;
  document.body.classList.toggle("maximized", next);
  try {
    if (next) {
      // Modal is fullScreen — no setWidth/setHeight needed.
    } else {
      // The blue circular floating button was removed — there's no longer
      // a minimized state. Close the modal entirely; the user re-opens via
      // the cluster's "角色卡界面" button.
      saveState();
      // Clear the shared open-state key so index.ts's toolbar tool
      // sees the panel as closed. A synchronous localStorage write is
      // reliable on every close path; the async OBR broadcast this
      // replaced got killed mid-unload on the click-outside path —
      // the root of the click-twice-to-reopen bug.
      try {
        localStorage.removeItem(PANEL_OPEN_KEY);
      } catch {}
      await OBR.modal.close(PANEL_MODAL_ID);
      return;
    }
  } catch (e) {
    console.error("[character-cards] setMaximized failed", e);
  }
  saveState();
}

function showError(msg: string) {
  errEl.textContent = msg;
  // pre-line so the multi-line upload-failure hint (新行分隔) renders
  // with line breaks. textContent with default white-space:normal
  // collapses \n into spaces.
  errEl.style.whiteSpace = "pre-line";
  errEl.style.display = msg ? "block" : "none";
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function showStatus(msg: string) {
  // Switched from textContent to innerHTML so SVG icons inside status
  // messages render. Callers must HTML-escape any untrusted text first.
  statusEl.innerHTML = msg;
  statusEl.style.display = msg ? "block" : "none";
  if (msg)
    setTimeout(() => {
      statusEl.style.display = "none";
    }, 3000);
}

function minimize() {
  saveState();
  setMaximized(false);
}

async function toggleCardVisibility(id: string) {
  if (!isGM) return;
  const next = cards.map((c) => {
    if (c.id !== id) return c;
    return { ...c, visibility: nextVisibilityLevel(c.visibility) };
  });
  cards = next;
  await writeCardsToScene(next);
  render();
}

async function readCardsFromScene(): Promise<CardEntry[]> {
  try {
    const meta = await OBR.scene.getMetadata();
    const list = meta[SCENE_META_KEY];
    if (Array.isArray(list)) return list as CardEntry[];
  } catch {}
  return [];
}

async function writeCardsToScene(list: CardEntry[]) {
  await OBR.scene.setMetadata({ [SCENE_META_KEY]: list });
}

async function refreshFromScene() {
  const fromScene = await readCardsFromScene();
  const importedInScene = new Set(
    fromScene.map((c) => c.id).filter((id) => id.startsWith("imported_")),
  );
  const localImported = cards.filter(
    (c) => c.id.startsWith("imported_") && !importedInScene.has(c.id),
  );
  cards = [...fromScene, ...localImported];

  // 2026-06 — cards no longer have an iframe in this document (they
  // open as their own OBR.modal via selectCard), so there's nothing
  // to clean up here either way. Just check if the current card was
  // deleted server-side.
  if (current.type === "card") {
    const curId = current.id;
    if (!curId.startsWith("imported_") && !cards.find((c) => c.id === curId)) {
      current = { type: "empty" };
    }
  }
  render();
}

async function uploadFile(file: File) {
  showError("");
  const sideEl = document.getElementById("side");
  sideEl?.classList.add("busy");
  try {
    const fd = new FormData();
    fd.append("file", file);
    const u = encodeURIComponent(playerName);
    const r = await fetch(`${API_BASE}/upload?room=${roomId}&uploader=${u}`, {
      method: "POST",
      body: fd,
    });
    if (!r.ok) {
      const err = await r.text();
      throw new Error(err || `HTTP ${r.status}`);
    }
    const entry = (await r.json()) as CardEntry;
    try {
      const corrected = await reconcileUploadedCardShieldState({
        apiBase: API_BASE,
        roomId,
        cardId: entry.id,
        xlsx: file,
      });
      if (corrected) {
        try {
          const payload = { cardId: entry.id, url: `${entry.url}data.json` };
          OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
            destination: "LOCAL",
          });
          OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
            destination: "REMOTE",
          });
        } catch {}
      }
    } catch (e) {
      console.warn(
        "[cc-panel] shield equipped reconcile after upload failed",
        e,
      );
    }
    const updated = [entry, ...cards];
    await writeCardsToScene(updated);
    cards = updated;
    current = { type: "card", id: entry.id };
    showStatus(
      `${ICONS.check} ${tt("ccPanelUploaded")}: ${escapeHtml(entry.name)}`,
    );
    render();
  } catch (e: any) {
    showError(
      `${tt("ccPanelUploadFailed")}: ${e?.message || e}\n${tt("ccPanelUploadHint")}`,
    );
  } finally {
    sideEl?.classList.remove("busy");
  }
}

// Upload an imported_ card to the server by POSTing its localStorage
// JSON as a .json file to /api/character/upload. On success, the old
// imported_ entry is replaced by the new server CardEntry in scene
// metadata and localStorage is cleaned up.
async function uploadImportedCardToServer(card: CardEntry): Promise<void> {
  if (!card.id.startsWith("imported_")) return;

  const localKey = `${LS_PREFIX}imported/${card.id}`;
  const storedData = localStorage.getItem(localKey);
  if (!storedData) {
    showError(`Dati locali non trovati per ${escapeHtml(card.name)}`);
    return;
  }

  // Find the cloud button to show spinner feedback
  const row = document.querySelector<HTMLElement>(
    `.card[data-id="${card.id}"]`,
  );
  const cloudBtn = row?.querySelector<HTMLButtonElement>(".card-cloud");
  if (cloudBtn) {
    cloudBtn.innerHTML = CLOUD_SPINNER_SVG;
    cloudBtn.className = "card-cloud is-spinning";
    cloudBtn.style.pointerEvents = "none";
  }

  try {
    // Wrap the JSON string as a File so the existing /upload endpoint
    // receives a multipart file it already knows how to handle.
    const blob = new Blob([storedData], { type: "application/json" });
    const fileName = `${card.name.replace(/[^a-zA-Z0-9_\-]/g, "_")}.json`;
    const file = new File([blob], fileName, { type: "application/json" });

    const fd = new FormData();
    fd.append("file", file);
    const u = encodeURIComponent(playerName);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const r = await fetch(`${API_BASE}/upload?room=${roomId}&uploader=${u}`, {
      method: "POST",
      body: fd,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!r.ok) {
      const errText = await r.text();
      throw new Error(errText || `HTTP ${r.status}`);
    }

    const newEntry = (await r.json()) as CardEntry;

    // Replace the imported_ entry with the new server entry in scene.
    // Preserve position in the list so the sidebar order doesn't jump.
    const updated = cards.map((c) => (c.id === card.id ? newEntry : c));
    cards = updated;
    if (current.type === "card" && current.id === card.id) {
      current = { type: "card", id: newEntry.id };
    }

    // Clean up localStorage — data now lives on the server.
    try {
      localStorage.removeItem(localKey);
    } catch {}

    await writeCardsToScene(updated);

    // Broadcast so other clients refresh their panel list.
    try {
      const payload = { cardId: newEntry.id, url: `${newEntry.url}data.json` };
      OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
        destination: "LOCAL",
      });
      OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
        destination: "REMOTE",
      });
    } catch {}

    showStatus(
      `${ICONS.check} Caricata sul server: ${escapeHtml(newEntry.name)}`,
    );
    render();
  } catch (e: any) {
    showError(`Upload fallito: ${e?.message || e}`);
    if (cloudBtn) {
      cloudBtn.innerHTML = CLOUD_LOCAL_SVG;
      cloudBtn.className = "card-cloud is-local";
      cloudBtn.style.pointerEvents = "";
    }
  }
}

// Open a native file picker dialog. Returns the chosen File or null
// if the user cancelled. We DON'T use `showOpenFilePicker()` here —
// the File System Access API is blocked in cross-origin iframes
// (which is exactly what OBR plugin frames are), so an attempt
// throws SecurityError. Plain `<input type=file>` works everywhere.
function pickXlsxFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // 'cancel' fires on modern Chromium when the user closes the
    // picker without choosing. On older browsers we fall back to
    // never resolving — the input is GC'd when the user picks again
    // anyway. Either way, no leak.
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

// 2026-05-10: multi-file picker for bulk upload. Same SecurityError
// caveat as above (no FSA in iframes), so it's just a plain
// `<input type=file multiple>`.
function pickXlsxFiles(): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx";
    input.multiple = true;
    input.onchange = () => {
      const out = input.files ? Array.from(input.files) : [];
      resolve(out);
    };
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

// "Link a local xlsx" entry point. With FSA blocked, this just opens
// a regular file picker; the resulting card behaves identically to a
// drag-drop upload. The refresh button on each row uses the same
// picker on subsequent clicks so the user can re-pick the freshly
// edited xlsx without deleting + re-uploading the card.
//
// 2026-05-10: now multi-select capable — picking N files uploads each
// one sequentially, creating N new cards. UI stays responsive because
// each uploadFile() is awaited (the side-panel busy spinner stays up
// for the whole batch).
async function linkLocalFile(): Promise<void> {
  const files = await pickXlsxFiles();
  if (files.length === 0) return;
  await uploadFilesBatch(files);
}

// Upload an array of xlsx files in series. Stops on the first failure
// so the user can see WHICH file broke and why (the side-panel error
// banner already surfaces messages from uploadFile).
async function uploadFilesBatch(files: File[]): Promise<void> {
  for (const f of files) {
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      showError(`${tt("ccPanelOnlyXlsx")} (跳过 ${f.name})`);
      continue;
    }
    await uploadFile(f);
  }
}

// Pick a JSON file from disk (for import)
function pickJsonFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

// Export the currently selected card's data as JSON
async function exportCurrentCardAsJson(): Promise<void> {
  if (current.type !== "card") {
    showError("Nessuna scheda selezionata");
    return;
  }
  const cardId = current.id;
  const card = cards.find((c) => c.id === cardId);
  if (!card) {
    showError("Scheda non trovata");
    return;
  }
  try {
    let jsonData;

    // Check if this is an imported card
    if (card.id.startsWith("imported_")) {
      const localKey = `${LS_PREFIX}imported/${card.id}`;
      const storedData = localStorage.getItem(localKey);
      if (!storedData) {
        showError("Dati della scheda non trovati");
        return;
      }
      jsonData = JSON.parse(storedData);
    } else {
      // Load from server
      const url = `${card.url}data.json`;
      const response = await fetch(url);
      if (!response.ok) {
        showError(`Errore nel caricamento dei dati: HTTP ${response.status}`);
        return;
      }
      jsonData = await response.json();
    }

    // Download the JSON file
    const dataStr = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${card.name || "character"}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showStatus(`${ICONS.check} Esportato: ${escapeHtml(card.name)}`);
  } catch (e: any) {
    showError(`Errore nell'esportazione: ${e?.message || e}`);
  }
}

// Import a JSON file as a new card.
// Prima tenta POST /create-from-json per creare la carta sul server;
// se il server non è raggiungibile o risponde con errore, salva in
// localStorage come carta "imported_" (comportamento pre-esistente).
async function importJsonAsCard(): Promise<void> {
  const file = await pickJsonFile();
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".json")) {
    showError("Solo file .json sono supportati");
    return;
  }
  try {
    const text = await file.text();

    let jsonData: any;
    try {
      jsonData = JSON.parse(text);
    } catch (parseErr: any) {
      console.error("[cc-panel] ❌ JSON.parse fallito:", parseErr);
      throw parseErr;
    }

    // Il JSON del personaggio ha identity.display_name, non name al top level
    const cardName =
      jsonData?.identity?.display_name ||
      jsonData?.identity?.character_name ||
      jsonData?.name ||
      file.name.replace(/\.json$/i, "");

    // Tenta il salvataggio sul server via create-from-json.
    const sideEl = document.getElementById("side");
    sideEl?.classList.add("busy");
    try {
      const u = encodeURIComponent(playerName);
      const r = await fetch(
        `${API_BASE}/create-from-json?room=${roomId}&uploader=${u}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: text,
        },
      );
      if (r.ok) {
        const entry = (await r.json()) as CardEntry;
        // Dopo il 200, recupera il data.json generato dal server per
        // popolare l'iframe con i dati normalizzati.
        const updated = [entry, ...cards];
        cards = updated;
        current = { type: "card", id: entry.id };
        render();
        showStatus(`${ICONS.check} Importato: ${escapeHtml(entry.name)}`);
        if (r.status! >= 300) {
          console.warn(
            "[cc-panel] render_warning:",
            r.body ? await r.text() : "no response body",
          );
        }
        // Broadcast LOCAL+REMOTE così altri client aggiornano la lista.
        try {
          const payload = { cardId: entry.id, url: `${entry.url}data.json` };
          OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
            destination: "LOCAL",
          });
          OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
            destination: "REMOTE",
          });
        } catch {}
        await writeCardsToScene(updated);
        return;
      }
      // Risposta non-ok: logga e ricade sul fallback locale.
      const errText = await r.text();
      console.warn(
        `[cc-panel] create-from-json HTTP ${r.status} — ${errText.slice(0, 120)}. Fallback a localStorage.`,
      );
    } catch (netErr) {
      console.warn(
        "[cc-panel] create-from-json non raggiungibile, fallback a localStorage:",
        netErr,
      );
    } finally {
      sideEl?.classList.remove("busy");
    }

    // Fallback: salva in localStorage come carta "imported_".
    const importedId = `imported_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const localKey = `${LS_PREFIX}imported/${importedId}`;
    localStorage.setItem(localKey, text);

    const newCard: CardEntry = {
      id: importedId,
      name: cardName,
      uploader: playerName,
      uploaded_at: new Date().toISOString(),
      url: "",
      visibility: "public",
    };
    const updated = [newCard, ...cards];
    // Aggiorna stato locale E mostra l'iframe PRIMA di scrivere in OBR,
    // così onMetadataChange non può arrivare e resettare current="empty"
    // mentre l'iframe di Preact sta ancora caricando i dati.
    cards = updated;
    current = { type: "card", id: newCard.id };
    render();
    showStatus(`${ICONS.check} Importato (locale): ${escapeHtml(cardName)}`);
    await writeCardsToScene(updated);
  } catch (e: any) {
    console.error("[cc-panel] ❌ importJsonAsCard errore:", e);
    showError(`Errore nell'importazione: ${e?.message || e}`);
  }
}

// Refresh a card by re-picking the xlsx from disk. Cross-origin
// iframes can't persist a FileSystemFileHandle, so the user has to
// confirm the file each time — but the browser remembers the last
// folder, so it's still a 2-click flow (pick + open).
async function refreshCardFromPicker(card: CardEntry): Promise<void> {
  const file = await pickXlsxFile();
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    showError(tt("ccPanelOnlyXlsx"));
    return;
  }
  const row = document.querySelector<HTMLElement>(
    `.card[data-id="${card.id}"]`,
  );
  const btn = row?.querySelector<HTMLButtonElement>(".card-refresh");
  btn?.classList.add("spinning");
  try {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(
      `${API_BASE}/refresh?room=${roomId}&card=${encodeURIComponent(card.id)}`,
      { method: "POST", body: fd },
    );
    if (!r.ok) throw new Error((await r.text()) || `HTTP ${r.status}`);
    const updated = (await r.json()) as CardEntry;
    try {
      const corrected = await reconcileUploadedCardShieldState({
        apiBase: API_BASE,
        roomId,
        cardId: updated.id,
        xlsx: file,
      });
      if (corrected) {
        try {
          // 2026-05-14 — see same LOCAL+REMOTE comment in uploadFile.
          const reconcilePayload = {
            cardId: updated.id,
            url: `${updated.url}data.json`,
          };
          OBR.broadcast.sendMessage(BC_CARD_UPDATED, reconcilePayload, {
            destination: "LOCAL",
          });
          OBR.broadcast.sendMessage(BC_CARD_UPDATED, reconcilePayload, {
            destination: "REMOTE",
          });
        } catch {}
      }
    } catch (e) {
      console.warn(
        "[cc-panel] shield equipped reconcile after refresh failed",
        e,
      );
    }
    cards = cards.map((c) => (c.id === updated.id ? { ...c, ...updated } : c));
    await writeCardsToScene(cards);
    // No iframe to refresh here anymore — cc-fullscreen.html is its own
    // OBR.modal now. If that card is currently open in its modal, the
    // BC_CARD_UPDATED broadcast sent just below makes fullscreen-page.tsx
    // reload its own data via its existing onMessage(BC_CARD_UPDATED)
    // listener.
    try {
      // 2026-05-14 — LOCAL+REMOTE so this client's background propagates
      // the refresh to bound tokens. Without LOCAL the refresher's own
      // canvas still shows stale HP/AC until they re-bind manually.
      const refreshPayload = { cardId: card.id, url: updated.url };
      OBR.broadcast.sendMessage(BC_CARD_UPDATED, refreshPayload, {
        destination: "LOCAL",
      });
      OBR.broadcast.sendMessage(BC_CARD_UPDATED, refreshPayload, {
        destination: "REMOTE",
      });
    } catch {}
    showStatus(
      `${ICONS.check} ${tt("ccPanelRefreshed")}: ${escapeHtml(updated.name)}`,
    );
    render();
  } catch (e: any) {
    showError(`${tt("ccPanelRefreshFailed")}: ${e?.message || e}`);
  } finally {
    btn?.classList.remove("spinning");
  }
}

async function deleteCard(id: string) {
  const updated = cards.filter((c) => c.id !== id);
  await writeCardsToScene(updated);
  cards = updated;
  if (current.type === "card" && current.id === id) {
    current = { type: "empty" };
    // The card's own OBR.modal is still open if the user deletes a
    // card from the sidebar while viewing it — close it too, since
    // there's nothing valid left for it to show.
    try {
      await OBR.modal.close(FULLSCREEN_MODAL_ID);
    } catch {}
  }
  render();
  try {
    await fetch(`${API_BASE}/${roomId}/${id}`, { method: "DELETE" });
  } catch {}
}

// 2026-06 fix — cc-fullscreen.html used to be embedded as a manual
// <iframe> inside this very modal's DOM (ensureCardIframe below, now
// removed). That made it a THIRD-LEVEL iframe (owlbear.rodeo →
// cc-panel.html → cc-fullscreen.html), and the OBR SDK only performs
// its postMessage handshake with the immediate window.parent. Since
// cc-panel.html doesn't relay that handshake, OBR.isReady never
// became true inside cc-fullscreen.html — every OBR.* call (broadcast,
// scene.getMetadata, etc.) failed silently or threw "not ready",
// which broke role/owner detection (isGM/canEdit) entirely.
//
// Fix: open cc-fullscreen.html as its own OBR.modal — a true direct
// child of the OBR document, exactly like this very panel is opened
// by index.ts. It now renders ON TOP of this panel (full viewport),
// with a "back to list" button (added in fullscreen-page.tsx) that
// closes it and returns here. myId/role/playerName are passed via
// query string for instant, race-free availability — no need to wait
// on any broadcast round-trip for those three values anymore.
const FULLSCREEN_MODAL_ID = "com.obr-suite/cc-fullscreen";

function selectCard(id: string) {
  const card = cards.find((c) => c.id === id);
  if (!card) return;

  current = { type: "card", id };
  saveState();

  const viewer = document.getElementById("viewer") as HTMLDivElement;
  if (!viewer) return;
  // Listener globale per richieste dal fullscreen iframe
  window.addEventListener("message", (event) => {
    if (event.data?.type === "cc-request-core-data") {
      const cardId = event.data.cardId;

      // Recupera i dati attuali (già presenti in index.ts)
      const coreData = {
        myId: myPlayerId,
        role: isGM ? "GM" : "PLAYER",
        players: allPlayers,
      };

      // Rispondi all'iframe
      const iframe = document.querySelector(
        `iframe[src*="cc-fullscreen.html"]`,
      ) as HTMLIFrameElement;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(
          {
            type: "cc-core-data-response",
            payload: coreData,
          },
          "*",
        );
      }
    }
  });

  viewer.innerHTML = "";
  viewer.classList.remove("is-empty"); // Rimuove la classe vuota
  viewer.style.display = "block";

  const iframe = document.createElement("iframe");
  iframe.src = buildCardIframeSrc(card, true);
  iframe.dataset.kind = "card";
  iframe.dataset.id = card.id;

  iframe.style.cssText = `
    width: 100% !important;
    height: 100% !important;
    border: none !important;
    background: #1c2030 !important;
    display: block !important;
    position: absolute !important;
    inset: 0 !important;
    overflow: auto !important;
    z-index: 1 !important;
  `;
  iframe.setAttribute("scrolling", "yes");

  iframe.onload = () => {
    try {
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.documentElement.style.cssText =
          "height:100% !important;width:100% !important;";
        doc.body.style.cssText =
          "height:100% !important;width:100% !important;overflow:auto !important;background:#1c2030 !important;margin:0 !important;padding:0 !important;";
      }
    } catch (e) {
      console.warn("[cc-panel] iframe onload fix", e);
    }
    // 2026-06 — forward the party list (and current myId/role, in
    // case those somehow changed since the query string was built)
    // now that the iframe's document and scripts have finished
    // loading. fullscreen-page.tsx listens for this exact message
    // type and updates its allPlayers state from it.
    postPlayersToFullscreenIframe();
  };

  viewer.appendChild(iframe);
  resourceIframes.forEach((f) => (f.style.display = "none"));

  render();
}

function selectResource(slug: string) {
  current = { type: "resource", slug };
  render();
}

/** Build the cc-fullscreen.html URL for a card. v3 (2026-06+) — opened
 *  via OBR.modal.open (see selectCard above) instead of embedded as a
 *  nested <iframe>, so it's a true direct-child OBR document and the
 *  SDK's postMessage handshake actually completes inside it. myId /
 *  role / playerName ride along in the query string — same pattern
 *  index.ts already uses for cc-panel.html's own URL — so fullscreen
 *  has them immediately on load with zero broadcast round-trip. */
function buildCardIframeSrc(card: CardEntry, cacheBust = false): string {
  const params = new URLSearchParams();
  params.set("room", roomId);
  params.set("card", card.id);
  params.set("myId", myPlayerId);
  params.set("role", isGM ? "GM" : "PLAYER");
  params.set("playerName", playerName);
  if (cacheBust) params.set("t", String(Date.now()));
  return `${assetUrl("cc-fullscreen.html")}?${params.toString()}`;
}

// Single-live-iframe policy for external resources.
// All 5e.kiwee.top iframes share one Chrome renderer process and a single
// V8 heap (~4GB ceiling). Keeping 6 heavy reference pages resident easily
// crashes that process. We only keep ONE resource iframe alive at a time —
// switching tabs unloads the previous one. Angular state loss on switch is
// an acceptable trade-off vs. crashing the whole app.
function ensureResourceIframe(def: ResourceDef): HTMLIFrameElement {
  // Unload every other resource iframe.
  for (const [slug, f] of resourceIframes) {
    if (slug !== def.slug) {
      f.remove();
      resourceIframes.delete(slug);
    }
  }
  let f = resourceIframes.get(def.slug);
  if (!f) {
    f = document.createElement("iframe");
    f.src = def.url;
    f.setAttribute("scrolling", "yes");
    f.dataset.kind = "resource";
    f.dataset.slug = def.slug;
    f.style.display = "none";
    viewer.appendChild(f);
    resourceIframes.set(def.slug, f);
  }
  return f;
}

// Render template download buttons based on current language
function renderTemplateButtons() {
  const headActions = document.getElementById("headActions") as HTMLElement;
  if (!headActions) return;

  const config = getTemplateConfigForLang(lang);

  let templateHtml = "";
  for (const file of config.files) {
    const title =
      lang === "zh"
        ? file.name.includes("2014")
          ? tt("ccPanelDownload2014")
          : tt("ccPanelDownload2024")
        : "Download Character Sheet Template";
    templateHtml += `<a class="icon-btn" href="${file.filename}"
      download="${file.filename}" target="_blank" rel="noopener"
      title="${title}">${file.name}</a>`;
  }

  headActions.innerHTML =
    templateHtml +
    `<button class="close" id="closeBtn"
       data-i18n-title="ccPanelClose" title="Close (Esc)">✕</button>`;

  headActions
    .querySelector<HTMLButtonElement>("#closeBtn")
    ?.addEventListener("click", minimize);
}

// SVG cloud icons usati sia in render() che nel listener dirty-changed.
const CLOUD_SYNCED_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
const CLOUD_DIRTY_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="16" x2="12" y2="18"/></svg>`;
const CLOUD_LOCAL_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/><line x1="4" y1="4" x2="20" y2="20"/></svg>`;
const CLOUD_SPINNER_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:cc-spin 0.8s linear infinite"><circle cx="12" cy="12" r="9" stroke-dasharray="28 56" stroke-linecap="round"/></svg>`;

// Invia al server i dati dirty salvati localmente per una carta server.
async function uploadDirtyCardToServer(card: CardEntry): Promise<void> {
  if (!card || card.id.startsWith("imported_")) return;
  const dirtyKey = `cc-dirty/${card.id}`;
  const stored = localStorage.getItem(dirtyKey);
  if (!stored) return;

  const row = document.querySelector<HTMLElement>(
    `.card[data-id="${card.id}"]`,
  );
  const cloudBtn = row?.querySelector<HTMLButtonElement>(".card-cloud");
  if (cloudBtn) {
    cloudBtn.innerHTML = CLOUD_SPINNER_SVG;
    cloudBtn.className = "card-cloud is-spinning";
    cloudBtn.style.pointerEvents = "none";
  }

  try {
    const parsed = JSON.parse(stored);
    const url = `${API_BASE}/${encodeURIComponent(roomId)}/${encodeURIComponent(card.id)}/data`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status} — ${errText.slice(0, 120)}`);
    }

    // Successo — rimuovi dirty e aggiorna nuvola a verde
    localStorage.removeItem(dirtyKey);
    try {
      localStorage.removeItem(`cc-dirty-ts/${card.id}`);
    } catch {}
    if (cloudBtn) {
      cloudBtn.innerHTML = CLOUD_SYNCED_SVG;
      cloudBtn.className = "card-cloud is-synced";
      cloudBtn.style.pointerEvents = "";
      cloudBtn.title = tt("ccPanelSyncedSuccess");
      cloudBtn.onclick = null;
    }

    // Broadcast per aggiornare altri client
    try {
      const payload = { cardId: card.id, url: `${card.url}data.json` };
      OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
        destination: "LOCAL",
      });
      OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
        destination: "REMOTE",
      });
    } catch {}

    showStatus(
      `${ICONS.check} ${tt("ccPanelSyncedSuccess")}: ${escapeHtml(card.name)}`,
    );
  } catch (e: any) {
    showError(`${tt("ccSaveFailSync")}: ${e?.message || e}`);
    // Ripristina nuvola gialla
    if (cloudBtn) {
      cloudBtn.innerHTML = CLOUD_DIRTY_SVG;
      cloudBtn.className = "card-cloud is-dirty";
      cloudBtn.style.pointerEvents = "";
      cloudBtn.title = tt("ccPanelDirtyRetry");
      cloudBtn.onclick = (ev) => {
        ev.stopPropagation();
        void uploadDirtyCardToServer(card);
      };
    }
  }
}

function render() {
  // Sidebar list — filter by visibility per requestor's role + id.
  // DM sees everything; players only see public + (owners they're in).
  const visibleCards = cards.filter((c) => canSeeCard(c, isGM, myPlayerId));
  // If the currently-active card was hidden by the DM and we're a
  // player, drop the view back to empty so the iframe doesn't keep
  // a stale reference visible.
  if (current.type === "card") {
    const currentId = current.id;
    if (!visibleCards.find((c) => c.id === currentId)) {
      current = { type: "empty" };
    }
  }
  listEl.innerHTML = "";
  if (visibleCards.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-list";
    empty.textContent = tt("ccPanelEmpty3");
    empty.style.whiteSpace = "pre-line";
    listEl.appendChild(empty);
  } else {
    for (const c of visibleCards) {
      const card = document.createElement("div");
      const isActive = current.type === "card" && current.id === c.id;
      const v = c.visibility ?? "public";
      const isHidden = v !== "public"; // DM-only flag for visual dim
      card.className =
        "card" + (isActive ? " active" : "") + (isHidden ? " is-hidden" : "");
      card.dataset.id = c.id;
      card.addEventListener("click", () => selectCard(c.id));

      const name = document.createElement("div");
      name.className = "card-name";
      // Lock prefix on hidden cards so DM can spot them at a glance.
      name.textContent = (isHidden ? "🔒 " : "") + c.name;
      const sub = document.createElement("div");
      sub.className = "card-sub";
      const visLabel = isHidden
        ? v === "dm"
          ? tt("ccPanelHiddenLabel")
          : tt("ccPanelPrivateLabel")
        : "";
      sub.textContent =
        `${c.uploader} · ${timeAgo(c.uploaded_at)}` +
        (visLabel ? ` · ${visLabel}` : "");

      // 👁 / 🔒 visibility toggle — DM only. Cycles public ↔ dm.
      // owners-mode (specific player allowlist) is set via a separate
      // dialog; the cycle button keeps the one-click flow simple.
      if (isGM) {
        const visBtn = document.createElement("button");
        visBtn.className = "card-vis";
        visBtn.textContent = isHidden ? "🔒" : "👁";
        visBtn.title = isHidden
          ? tt("ccPanelHiddenTitle")
          : tt("ccPanelPublicTitle");
        visBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await toggleCardVisibility(c.id);
        });
        card.appendChild(visBtn);
      }

      // ☁ cloud status button
      // imported_: nuvola rossa (solo locale) → click = upload server
      // server dirty: nuvola gialla con ! → click = reinvia al server
      // server synced: nuvola verde → non cliccabile
      const isImported = c.id.startsWith("imported_");
      const isDirty = !isImported && !!localStorage.getItem(`cc-dirty/${c.id}`);
      const isSyncedTitle = tt("ccPanelSyncedTitle");
      const isDirtyTitle = tt("ccPanelDirtyTitle");
      const isImportedTitle = tt("ccPanelLocalOnlyTitle");
      const cloudBtn = document.createElement("button");
      cloudBtn.className =
        "card-cloud " +
        (isImported ? "is-local" : isDirty ? "is-dirty" : "is-synced");
      cloudBtn.title = isImported
        ? isImportedTitle
        : isDirty
          ? isDirtyTitle
          : isSyncedTitle;
      cloudBtn.innerHTML = isImported
        ? CLOUD_LOCAL_SVG
        : isDirty
          ? CLOUD_DIRTY_SVG
          : CLOUD_SYNCED_SVG;
      if (isImported) {
        cloudBtn.addEventListener("click", async (e) => {
          e.stopPropagation();
          await uploadImportedCardToServer(c);
        });
      } else if (isDirty) {
        cloudBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          void uploadDirtyCardToServer(c);
        });
      }
      card.appendChild(cloudBtn);
      const refresh = document.createElement("button");
      refresh.className = "card-refresh";
      refresh.textContent = "↻";
      refresh.title = tt("ccPanelRefreshTitle");
      refresh.addEventListener("click", async (e) => {
        e.stopPropagation();
        await refreshCardFromPicker(c);
      });
      card.appendChild(refresh);

      const del = document.createElement("button");
      del.className = "card-del";
      del.textContent = "×";
      del.title = tt("ccPanelDeleteTitle");
      del.addEventListener("click", async (e) => {
        e.stopPropagation();
        const promptText =
          lang === "zh" ? `删除 "${c.name}"？` : `Delete "${c.name}"?`;
        if (confirm(promptText)) await deleteCard(c.id);
      });

      card.appendChild(name);
      card.appendChild(sub);
      card.appendChild(del);
      listEl.appendChild(card);
    }
  }

  // Resource tabs — active state
  const curView = current;
  for (const btn of resCol.querySelectorAll<HTMLButtonElement>(".res-tab")) {
    const slug = btn.dataset.slug!;
    btn.classList.toggle(
      "active",
      curView.type === "resource" && curView.slug === slug,
    );
  }

  // Viewer: only resource tabs still mount their content here. Cards
  // open as their own OBR.modal (see selectCard) — there's no card
  // iframe to ensure/show inside .viewer anymore.
  if (curView.type === "resource") {
    const def = RESOURCES.find((r) => r.slug === curView.slug);
    if (def) ensureResourceIframe(def);
  }

  // Hide every iframe except the active one (resources only now —
  // card iframes were removed from .viewer entirely).
  viewer.querySelectorAll<HTMLIFrameElement>("iframe").forEach((f) => {
    let show = false;
    if (
      curView.type === "resource" &&
      f.dataset.kind === "resource" &&
      f.dataset.slug === curView.slug
    )
      show = true;
    f.style.display = show ? "block" : "none";
  });

  // .viewer's empty-state placeholder ("从右侧选择一张角色卡") only
  // applies to resources now — a selected card opens in its own modal
  // on top of this panel instead of filling .viewer, so .viewer stays
  // visually "empty" even while a card is the active selection. This
  // is intentional: the modal covers the screen, so there's nothing
  // for .viewer to show underneath it anyway.
  const hasContent = current.type === "resource";
  viewer.classList.toggle("is-empty", !hasContent);
  viewer.classList.toggle("has-content", hasContent);
  if (!hasContent) {
    emptyText.textContent =
      cards.length > 0 ? tt("ccPanelEmpty") : tt("ccPanelNoCards");
  }
}

function buildResourceColumn() {
  resCol.innerHTML = "";
  // 2026-05-14 — empty resource list collapses the column entirely so
  // there's no zero-width sliver next to the card list.
  if (RESOURCES.length === 0) {
    resCol.style.display = "none";
    return;
  }
  for (const r of RESOURCES) {
    const btn = document.createElement("button");
    btn.className = "res-tab";
    btn.dataset.slug = r.slug;
    btn.title = r.label;
    btn.innerHTML = `<span class="ico">${r.icon}</span><span class="lbl">${r.label}</span>`;
    btn.addEventListener("click", () => selectResource(r.slug));
    resCol.appendChild(btn);
  }
  resCol.style.display = "flex";
}

function timeAgo(isoZ: string): string {
  try {
    const ts = new Date(isoZ).getTime();
    const diff = (Date.now() - ts) / 1000;
    if (diff < 60) return tt("ccPanelJustNow");
    if (lang === "zh") {
      if (diff < 3600)
        return tt("ccPanelTimestampMin").replace(
          "{n}",
          String(Math.floor(diff / 60)),
        );
      if (diff < 86400)
        return tt("ccPanelTimestampHour").replace(
          "{n}",
          String(Math.floor(diff / 3600)),
        );
      return tt("ccPanelTimestampDay").replace(
        "{n}",
        String(Math.floor(diff / 86400)),
      );
    }
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
    return `${Math.floor(diff / 86400)} d ago`;
  } catch {
    return "";
  }
}

// --- setup ---
onLangChange((next) => {
  lang = next;
  applyI18nDom(lang);
  renderTemplateButtons(); // Update template buttons for new language
  render();
});

OBR.onReady(async () => {
  applyI18nDom(lang);
  roomId = safeRoomId(OBR.room.id || "default");
  try {
    playerName = (await OBR.player.getName()) || "anonymous";
  } catch {}
  try {
    myPlayerId = await OBR.player.getId();
  } catch {}
  try {
    isGM = (await OBR.player.getRole()) === "GM";
  } catch {}
  // 2026-06 — fetch the party list HERE, because this document
  // (cc-panel.html) is a true direct-child OBR document and its SDK
  // actually completes the postMessage handshake. cc-fullscreen.html
  // is loaded as a nested <iframe> inside .viewer for layout reasons
  // (see selectCard below) — that nesting means ITS OBR SDK never
  // becomes ready (OBR.isReady stays false forever in there), so it
  // cannot call OBR.party.getPlayers() itself. Instead we fetch it
  // here and forward it via plain window.postMessage (not OBR
  // broadcast — that's the part that doesn't need a completed SDK
  // handshake) whenever the iframe is (re)created or the party
  // changes.
  try {
    allPlayers = await OBR.party.getPlayers();
  } catch (e) {
    console.warn("[cc-panel] OBR.party.getPlayers failed", e);
  }
  postPlayersToFullscreenIframe();

  // Watch for role / id changes (rare, but happens after disconnect-
  // reconnect or if the DM passes ownership). Re-render the list so
  // the visibility filter follows.
  OBR.player.onChange(async (p) => {
    const nextGM = p.role === "GM";
    let changed = false;
    if (nextGM !== isGM) {
      isGM = nextGM;
      changed = true;
    }
    if (p.id && p.id !== myPlayerId) {
      myPlayerId = p.id;
      changed = true;
    }
    if (changed) render();
  });
  // Keep the forwarded player list live — someone joining/leaving
  // mid-session should update the Manage Owners dropdown without
  // requiring the GM to close and reopen the card.
  try {
    OBR.party.onChange((players) => {
      allPlayers = players;
      postPlayersToFullscreenIframe();
    });
  } catch (e) {
    console.warn("[cc-panel] OBR.party.onChange failed to register", e);
  }
  // Resource column is visible to ALL players now (not just GM) — with only
  // 不全书 in the list it's lightweight enough to share. Pre-warm it so the
  // page is ready the moment anyone clicks the tab.
  buildResourceColumn();
  for (const r of RESOURCES) ensureResourceIframe(r);

  // Restore previous state (kept from prior popover lifetime).
  // Only restore a resource slug if it still exists in RESOURCES (handles
  // legacy saved slugs like "spells" from before we removed 5etool pages).
  const saved = loadState();
  if (
    saved.activeResource &&
    RESOURCES.some((r) => r.slug === saved.activeResource)
  ) {
    current = { type: "resource", slug: saved.activeResource };
  } else if (saved.activeCardId) {
    current = { type: "card", id: saved.activeCardId };
  }
  // The popover opens already maximized (full viewport) from the cluster's
  // "角色卡界面" button. The blue circular mini-btn was removed.
  maximized = true;
  document.body.classList.add("maximized");
  // miniBtn is hidden via CSS — no listener needed.

  // Re-trigger maximize on broadcast (idempotent — useful if the user opens
  // the panel again while it's already alive somehow).
  OBR.broadcast.onMessage("com.character-cards/panel-open", () => {
    setMaximized(true);
  });

  // Drag-drop on the right sidebar ONLY
  const sideEl = document.getElementById("side") as HTMLElement;

  sideEl.addEventListener("dragenter", (e) => {
    e.preventDefault();
    sideEl.classList.add("drag-over");
  });
  sideEl.addEventListener("dragover", (e) => {
    e.preventDefault();
    sideEl.classList.add("drag-over");
  });
  sideEl.addEventListener("dragleave", (e) => {
    if (e.relatedTarget && sideEl.contains(e.relatedTarget as Node)) return;
    sideEl.classList.remove("drag-over");
  });
  sideEl.addEventListener("drop", async (e) => {
    e.preventDefault();
    sideEl.classList.remove("drag-over");
    // 2026-05-10: drop accepts multiple xlsx files; uploadFilesBatch
    // sequences them and surfaces per-file errors without aborting
    // the whole batch on one bad file.
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length === 0) return;
    await uploadFilesBatch(files);
  });

  document.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  document.addEventListener("drop", (e) => {
    e.preventDefault();
  });

  // Render template buttons based on current language
  renderTemplateButtons();

  // 📁 选择文件 button — alternate upload path for users who don't
  // want to drag. Shown on every browser (uses plain `<input type=file>`,
  // not the FSA picker which is blocked in cross-origin iframes).
  const linkBtn = document.getElementById(
    "btnLinkLocal",
  ) as HTMLButtonElement | null;
  if (linkBtn) {
    linkBtn.style.display = "";
    linkBtn.addEventListener("click", () => {
      void linkLocalFile();
    });
  }
  // 📥 Import JSON — file picker
  const importJsonBtn = document.getElementById(
    "btnImportJson",
  ) as HTMLButtonElement | null;
  if (importJsonBtn) {
    importJsonBtn.addEventListener("click", () => {
      void importJsonAsCard();
    });
  }

  // 📋 Paste JSON — overlay
  const pasteJsonBtn = document.getElementById(
    "btnPasteJson",
  ) as HTMLButtonElement | null;
  const pasteOverlay = document.getElementById(
    "pasteJsonOverlay",
  ) as HTMLDivElement | null;
  const pasteInput = document.getElementById(
    "pasteJsonInput",
  ) as HTMLTextAreaElement | null;
  const pasteCancel = document.getElementById(
    "pasteJsonCancel",
  ) as HTMLButtonElement | null;
  const pasteConfirm = document.getElementById(
    "pasteJsonConfirm",
  ) as HTMLButtonElement | null;

  if (pasteJsonBtn && pasteOverlay) {
    pasteJsonBtn.addEventListener("click", () => {
      if (pasteInput) pasteInput.value = "";
      pasteOverlay.style.display = "flex";
      pasteInput?.focus();
    });
    pasteCancel?.addEventListener("click", () => {
      pasteOverlay.style.display = "none";
    });
    pasteOverlay.addEventListener("click", (e) => {
      if (e.target === pasteOverlay) pasteOverlay.style.display = "none";
    });
    pasteConfirm?.addEventListener("click", async () => {
      const raw = pasteInput?.value.trim() ?? "";
      if (!raw) return;
      try {
        let jsonData: any;
        try {
          jsonData = JSON.parse(raw);
        } catch (parseErr: any) {
          console.error("[cc-panel] ❌ Paste JSON.parse fallito:", parseErr);
          throw parseErr;
        }

        const cardName =
          typeof jsonData?.identity?.display_name === "string" &&
          jsonData.identity.display_name
            ? jsonData.identity.display_name
            : typeof jsonData?.identity?.character_name === "string" &&
                jsonData.identity.character_name
              ? jsonData.identity.character_name
              : typeof jsonData.name === "string" && jsonData.name
                ? jsonData.name
                : "Imported Card";

        // Tenta create-from-json sul server; fallback a localStorage.
        const sideEl = document.getElementById("side");
        sideEl?.classList.add("busy");
        let serverOk = false;
        try {
          const u = encodeURIComponent(playerName);
          const r = await fetch(
            `${API_BASE}/create-from-json?room=${roomId}&uploader=${u}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: raw,
            },
          );
          if (r.ok) {
            const entry = (await r.json()) as CardEntry;
            serverOk = true;
            const updated = [entry, ...cards];
            cards = updated;
            current = { type: "card", id: entry.id };
            pasteOverlay.style.display = "none";
            render();
            showStatus(`${ICONS.check} Imported: ${escapeHtml(entry.name)}`);
            if (r.status! >= 300) {
              console.warn(
                "[cc-panel] render_warning:",
                r.body ? await r.text() : "no response body",
              );
            }
            try {
              const payload = {
                cardId: entry.id,
                url: `${entry.url}data.json`,
              };
              OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
                destination: "LOCAL",
              });
              OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
                destination: "REMOTE",
              });
            } catch {}
            await writeCardsToScene(updated);
          } else {
            const errText = await r.text();
            console.warn(
              `[cc-panel] create-from-json HTTP ${r.status} — ${errText.slice(0, 120)}. Fallback.`,
            );
          }
        } catch (netErr) {
          console.warn(
            "[cc-panel] create-from-json non raggiungibile, fallback:",
            netErr,
          );
        } finally {
          sideEl?.classList.remove("busy");
        }

        if (!serverOk) {
          // Fallback localStorage
          const importedId = `imported_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const lsKey = `${LS_PREFIX}imported/${importedId}`;
          localStorage.setItem(lsKey, raw);

          const newCard: CardEntry = {
            id: importedId,
            name: cardName,
            uploader: playerName,
            uploaded_at: new Date().toISOString(),
            url: "",
            visibility: "public",
          };
          const updated = [newCard, ...cards];
          cards = updated;
          current = { type: "card", id: newCard.id };
          pasteOverlay.style.display = "none";
          render();
          showStatus(
            `${ICONS.check} Imported (locale): ${escapeHtml(cardName)}`,
          );
          await writeCardsToScene(updated);
        }
      } catch {
        showError("Invalid JSON — check the text and try again.");
      }
    });
  }
  // Listen for refresh broadcasts from other clients. When the DM (or
  // any other player) refreshes a linked card, we just bump our own
  // iframe's src with a cache-buster so the new index.html is fetched.
  // Smart versioning: if local dirty version is newer, don't reload yet,
  // and attempt to re-upload instead.
  OBR.broadcast.onMessage(BC_CARD_UPDATED, (event) => {
    const data = event.data as { cardId?: string; url?: string } | undefined;
    if (!data?.cardId) return;
    // Non ricaricare mai le carte importate — vivono in localStorage
    // e non hanno un server URL da cui re-fetchare. Un broadcast
    // BC_CARD_UPDATED per una imported_ viene mandato da applyJsonObject
    // solo per aggiornare il pannello info, non per ricaricare l'iframe.
    if (data.cardId.startsWith("imported_")) return;

    const card = cards.find((c) => c.id === data.cardId);
    if (!card) return;

    // Check smart versioning: compare local dirty timestamp with server
    const dirtyTs = localStorage.getItem(`cc-dirty-ts/${data.cardId}`);
    const isDirty = !!localStorage.getItem(`cc-dirty/${data.cardId}`);
    if (isDirty && dirtyTs) {
      const localTime = new Date(dirtyTs).getTime();
      const serverTime = new Date(card.uploaded_at).getTime();
      if (localTime > serverTime) {
        // Local version is newer — don't reload, attempt to re-upload
        void uploadDirtyCardToServer(card);
        return;
      }
    }

    // 2026-06 fix — no iframe.src to bump anymore: cc-fullscreen.html
    // is its own OBR.modal now, not a nested iframe in this document.
    // If the card is currently open, that modal's own
    // fullscreen-page.tsx already reloads itself via its own
    // onMessage(BC_CARD_UPDATED) listener — nothing more to do here.
  });

  // Ascolta cc-dirty-changed — quando fullscreen salva localmente per
  // fallback, aggiorna la nuvola nella sidebar senza refreshare tutta la lista.
  OBR.broadcast.onMessage("com.obr-suite/cc-dirty-changed", (event) => {
    const data = event.data as
      | { cardId?: string; render?: boolean; ts?: string }
      | undefined;
    if (!data?.cardId) return;
    const cardId = data.cardId;
    // Se richiesto un re-render completo (es. dopo save fallito dalla
    // fullscreen), ricostruiamo tutta la lista così la nuvola gialla
    // appare immediatamente senza aspettare la prossima interazione.
    if (data.render) {
      render();
      return;
    }
    // Altrimenti aggiorna solo il bottone della carta interessata.
    const row = document.querySelector<HTMLElement>(
      `.card[data-id="${cardId}"]`,
    );
    if (!row) return;
    const cloudBtn = row.querySelector<HTMLButtonElement>(".card-cloud");
    if (!cloudBtn) return;
    const isDirty = !!localStorage.getItem(`cc-dirty/${cardId}`);
    cloudBtn.className = "card-cloud " + (isDirty ? "is-dirty" : "is-synced");
    cloudBtn.title = isDirty
      ? tt("ccPanelDirtyTitle")
      : tt("ccPanelSyncedSuccess");
    cloudBtn.innerHTML = isDirty ? CLOUD_DIRTY_SVG : CLOUD_SYNCED_SVG;
    cloudBtn.onclick = isDirty
      ? (e) => {
          e.stopPropagation();
          void uploadDirtyCardToServer(cards.find((c) => c.id === cardId)!);
        }
      : null;
  });

  // Close via X button in the sidebar header, Esc, or clicking backdrop.
  // closeBtn?.addEventListener("click", minimize);

  // About handler removed — centralized in suite About panel.

  // The "弹窗" toggle now lives in the floating controls popover sitting
  // to the left of the main 角色卡 button. localStorage key + broadcast id
  // are unchanged (character-cards/auto-info, com.character-cards/auto-info-toggled),
  // so background.ts picks up changes the same way.

  document.addEventListener("keydown", (e) => {
    if (!maximized) return;
    if (e.key === "Escape") {
      e.preventDefault();
      minimize();
      return;
    }
    // CapsLock from inside the panel closes it (mirror of the OBR
    // tool-action shortcut, which doesn't fire while focus is in our
    // iframe). The bestiary uses Shift+A from-inside.
    if (e.key === "CapsLock") {
      e.preventDefault();
      try {
        OBR.broadcast.sendMessage(
          "com.obr-suite/cc-shortcut-toggle",
          {},
          { destination: "LOCAL" },
        );
      } catch {}
    }
  });

  // Click on backdrop (transparent area) to minimize
  document.body.addEventListener("click", (e) => {
    if (maximized && e.target === document.body) minimize();
  });

  // Periodic save while open
  const saveInterval = setInterval(saveState, 5000);
  // Clear the shared open-state key on EVERY unload path. OBR's
  // click-outside modal close removes this iframe — that fires
  // pagehide (reliable for iframe removal) and usually beforeunload;
  // a synchronous localStorage write lands in both. Replaces an async
  // OBR broadcast that did NOT reliably land mid-unload — the cause
  // of the click-twice-to-reopen bug.
  const onPanelUnload = () => {
    clearInterval(saveInterval);
    saveState();
    try {
      localStorage.removeItem(PANEL_OPEN_KEY);
    } catch {}
  };
  window.addEventListener("pagehide", onPanelUnload);
  window.addEventListener("beforeunload", onPanelUnload);

  // Initial load + react to scene metadata changes
  await refreshFromScene();
  OBR.scene.onMetadataChange((meta) => {
    if (SCENE_META_KEY in meta) refreshFromScene();
  });
  // Listener per tornare alla lista dal pulsante "←" nella scheda fullscreen
  // + 2026-06-20: forward "cc-roll-dice" from the SAME nested
  // cc-fullscreen.html iframe. That document is a third-level iframe
  // with no working OBR SDK (see FULLSCREEN_MODAL_ID comment above),
  // so quickRoll() inside fullscreen-page.tsx can only postMessage its
  // parent — this is that parent, and it DOES have a working SDK, so
  // it opens the exact same quick-pick popup info-page.ts uses for its
  // own .rollable clicks (劣势/普通/优势 + 重击). Without this handler
  // the postMessage had no listener and clicking an ability modifier /
  // saving throw in the fullscreen card silently did nothing.
  window.addEventListener("message", (e) => {
    if (e.data?.type === "cc-back-to-list") {
      current = { type: "empty" };
      const viewer = document.getElementById("viewer") as HTMLDivElement;
      if (viewer) viewer.innerHTML = "";
      render();
      return;
    }
    if (e.data?.type === "cc-roll-dice") {
      const payload = e.data.payload as
        | { expression?: string; label?: string }
        | undefined;
      const expression = payload?.expression?.trim();
      if (!expression) return;
      const label = payload?.label ?? "";
      void (async () => {
        // Resolve the token bound to the CURRENTLY OPEN card (if any)
        // so the roll anchors/focuses exactly like info-page.ts's
        // resolveBoundToken() would. No bound token (e.g. a card that
        // isn't linked to any scene token) just rolls un-anchored —
        // same fallback the quick-pick popup already handles.
        let itemId: string | null = null;
        if (current.type === "card") {
          try {
            const bound = await OBR.scene.items.getItems(
              (it: any) =>
                current.type === "card" &&
                it.metadata?.[BIND_META_KEY] === current.id,
            );
            itemId = bound[0]?.id ?? null;
          } catch {}
        }
        try {
          await openQuickPopupAt({ expression, label, itemId }, { x: 0, y: 0 });
        } catch (err) {
          console.error("[cc-panel] openQuickPopupAt from cc-roll-dice failed", err);
        }
      })();
    }
  });
  // Validate restored activeCardId still exists; otherwise clear
  if (current.type === "card") {
    const curId = current.id;
    if (!cards.find((c) => c.id === curId)) {
      current = { type: "empty" };
      render();
    }
  }
});