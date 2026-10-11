// Status Tester — management modal for ONE token (URL param tokenId).
//
// Lists the statuses applied to the token and lets permitted users add
// / remove them. GM: every token, can mark statuses hidden from players
// and toggle them back. Players: own tokens only, never see hidden
// statuses, and their writes leave hidden entries untouched.
//
// Every write is a single OBR.scene.items.updateItems on that token
// that re-reads the applied list INSIDE the update callback, so
// concurrent edits from other clients aren't lost.

import OBR, { type Item } from "@owlbear-rodeo/sdk";
import { getLocalLang } from "./state";
import { t } from "./i18n";
import { escapeHtml } from "./utils/html";
import {
  APPLIED_KEY,
  AppliedStatus,
  BC_REFRESH,
  MANAGE_MODAL_ID,
  StatusDef,
  canManage,
  cleanLevel,
  displayTitle,
  displayTitleHtml,
  iconUrl,
  isStatusToken,
  newId,
  parseApplied,
  readApplied,
  textColorFor,
  visibleApplied,
} from "./modules/statusTester/types";
import { onLibraryChange, readLibrary } from "./modules/statusTester/library";
import { openLibraryModal } from "./modules/statusTester/open";
import { announceStatusChange, type StatusChange } from "./modules/statusTester/announce";
import { getLocalSettings, getRoomSettings, initRoomSettings } from "./modules/statusTester/settings";
import { initStatusGridScale } from "./modules/statusTester/grid-scale";
import { levelStart, levelStep } from "./modules/statusTester/types";

const params = new URLSearchParams(location.search);
const tokenId = params.get("tokenId") ?? "";
const lang = getLocalLang();

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const titleEl = $("title");
const tokenNameEl = $("tokenName");
const noticeEl = $("notice");
const appliedEl = $("applied");
const errEl = $("err");
const addSec = $("addSec");
const addH = $("addH");
const hiddenWrap = $("hiddenWrap");
const addHidden = $<HTMLInputElement>("addHidden");
const addHiddenLbl = $("addHiddenLbl");
const searchEl = $<HTMLInputElement>("search");
const pickEl = $("pick");
const editLibBtn = $<HTMLButtonElement>("editLib");
const doneBtn = $<HTMLButtonElement>("done");
const closeBtn = $<HTMLButtonElement>("close");

const EYE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>`;
const EYE_OFF = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/><path d="M3 3l18 18"/></svg>`;

let isGM = false;
let playerId = "";
let token: Item | null = null;
let library: StatusDef[] = [];
let busy = false;

function chipHtml(def: StatusDef | undefined, opts: { hidden?: boolean; applied?: AppliedStatus } = {}): string {
  if (!def) {
    return `<span class="chip unknown"><span class="t">${escapeHtml(t(lang, "sttUnknownStatus"))}</span></span>`;
  }
  const fg = textColorFor(def.color);
  let icon = "";
  if (def.emoji) icon = `<span class="emoji">${escapeHtml(def.emoji)}</span>`;
  else if (def.icon) icon = `<img src="${escapeHtml(iconUrl(def.icon, fg !== "#ffffff"))}" alt="">`;
  const title = (opts.applied ? displayTitle(def, opts.applied) : def.title) || t(lang, "sttUntitled");
  return `<span class="chip${opts.hidden ? " is-hidden" : ""}" style="background:${escapeHtml(def.color)};color:${escapeHtml(fg)}" title="${escapeHtml(title)}">${icon}<span class="t">${opts.applied && def.levels ? displayTitleHtml(def, opts.applied, escapeHtml) : escapeHtml(title)}</span></span>`;
}

function showError(msg: string): void {
  errEl.textContent = msg;
  errEl.hidden = !msg;
}

function render(): void {
  titleEl.textContent = t(lang, "sttManageTitle");
  addH.textContent = t(lang, "sttAddStatus");
  addHiddenLbl.textContent = t(lang, "sttHiddenFromPlayers");
  searchEl.placeholder = t(lang, "sttSearch");
  editLibBtn.textContent = t(lang, "sttEditLibrary");
  doneBtn.textContent = t(lang, "sttClose");
  closeBtn.title = t(lang, "sttClose");

  if (!token || !isStatusToken(token) || (!isGM && token.visible === false)) {
    tokenNameEl.textContent = "";
    noticeEl.textContent = t(lang, "sttTokenMissing");
    noticeEl.hidden = false;
    appliedEl.innerHTML = "";
    addSec.hidden = true;
    return;
  }
  tokenNameEl.textContent = token.name || "";
  const manage = canManage(token, isGM, playerId);
  noticeEl.hidden = manage;
  noticeEl.textContent = manage
    ? ""
    : t(lang, getRoomSettings().playerPerm === "view" ? "sttPlayersViewOnly" : "sttReadOnlyToken");
  addSec.hidden = !manage;
  hiddenWrap.hidden = !isGM;

  const byId = new Map(library.map((d) => [d.id, d]));
  const applied = visibleApplied(readApplied(token), isGM);
  if (applied.length === 0) {
    appliedEl.innerHTML = `<div class="empty">${escapeHtml(t(lang, "sttNoStatuses"))}</div>`;
  } else {
    appliedEl.innerHTML = applied
      .map((a) => {
        const def = byId.get(a.defId);
        // Players never see unknown/deleted entries' controls beyond remove.
        const eye = isGM && manage
          ? `<button class="ibtn${a.hidden ? " on" : ""}" type="button" data-act="hide" data-uid="${escapeHtml(a.uid)}" title="${escapeHtml(t(lang, a.hidden ? "sttHideFromPlayersTip" : "sttShowToPlayers"))}">${a.hidden ? EYE_OFF : EYE}</button>`
          : "";
        const rm = manage
          ? `<button class="ibtn danger" type="button" data-act="rm" data-uid="${escapeHtml(a.uid)}" title="${escapeHtml(t(lang, "sttRemove"))}">✕</button>`
          : "";
        // Level stepper for statuses that have levels.
        const st = levelStep(def);
        const lv = manage && def?.levels
          ? `<span class="lv"><button type="button" data-act="lv-" data-uid="${escapeHtml(a.uid)}" aria-label="−${st}">−</button>` +
            `<input type="number" step="${st}" data-uid="${escapeHtml(a.uid)}" value="${a.level ?? levelStart(def)}" aria-label="${escapeHtml(t(lang, "sttLevel"))}">` +
            `<button type="button" data-act="lv+" data-uid="${escapeHtml(a.uid)}" aria-label="+${st}">+</button></span>`
          : "";
        return `<div class="row">${chipHtml(def, { hidden: a.hidden, applied: a })}<span class="spacer"></span>${lv}${eye}${rm}</div>`;
      })
      .join("");
  }
  renderPicker();
}

function renderPicker(): void {
  if (addSec.hidden) return;
  const q = searchEl.value.trim().toLowerCase();
  const list = library.filter((d) => !q || d.title.toLowerCase().includes(q));
  if (library.length === 0) {
    pickEl.innerHTML = `<div class="empty">${escapeHtml(t(lang, "sttLibraryEmpty"))}</div>`;
    return;
  }
  if (list.length === 0) {
    pickEl.innerHTML = `<div class="empty">${escapeHtml(t(lang, "sttNoMatches"))}</div>`;
    return;
  }
  pickEl.innerHTML = list
    .map((d) => chipHtml(d).replace('<span class="chip"', `<span class="chip" data-def="${escapeHtml(d.id)}" role="button"`))
    .join("");
}

/** Apply `fn` to the token's list; on success, announce `change` in
 *  the chat (players only — see announce.ts). */
async function mutate(fn: (cur: AppliedStatus[]) => AppliedStatus[], change?: StatusChange): Promise<void> {
  if (busy) return;
  busy = true;
  showError("");
  let ok = false;
  try {
    await OBR.scene.items.updateItems([tokenId], (drafts) => {
      for (const d of drafts) {
        if (!canManage(d, isGM, playerId)) continue;
        const meta = d.metadata as Record<string, unknown>;
        const cur = parseApplied(meta[APPLIED_KEY]);
        const next = fn(cur);
        if (next.length > 0) meta[APPLIED_KEY] = next;
        else delete meta[APPLIED_KEY];
      }
    });
    ok = true;
  } catch (e) {
    console.warn("[status-tester] update failed", e);
    showError(t(lang, "sttSaveFailed"));
  } finally {
    busy = false;
  }
  if (ok && change && token) void announceStatusChange(isGM, token.name ?? "", change);
}

function titleOf(defId: string, level?: number): string {
  const def = library.find((d) => d.id === defId);
  return def ? displayTitle(def, { level }) : t(lang, "sttUnknownStatus");
}

function addStatus(defId: string): void {
  const hidden = isGM && addHidden.checked;
  const def = library.find((d) => d.id === defId);
  if (token && readApplied(token).some((a) => a.defId === defId)) {
    // One entry per status — levelled statuses use the level instead.
    showError(t(lang, "sttAlreadyApplied"));
    return;
  }
  void mutate((cur) => {
    if (cur.some((a) => a.defId === defId)) return cur;
    const entry: AppliedStatus = { uid: newId("s"), defId };
    if (hidden) entry.hidden = true;
    if (def?.levels) entry.level = levelStart(def);
    return [...cur, entry];
  }, { kind: "add", status: titleOf(defId, levelStart(def)) });
}

function setLevel(uid: string, value: number | ((cur: number) => number)): void {
  const before = token ? readApplied(token).find((a) => a.uid === uid) : undefined;
  let change: StatusChange | undefined;
  if (before) {
    const from = before.level ?? 1;
    const to = cleanLevel(typeof value === "function" ? value(from) : value);
    if (to === undefined || to === from) return;
    const def = library.find((d) => d.id === before.defId);
    change = { kind: "level", status: def?.title || t(lang, "sttUnknownStatus"), from, to };
  }
  void mutate((cur) =>
    cur.map((a) => {
      if (a.uid !== uid || (!isGM && a.hidden)) return a;
      const now = a.level ?? 1;
      const next = cleanLevel(typeof value === "function" ? value(now) : value);
      return next === undefined ? a : { ...a, level: next };
    }),
    change,
  );
}

function removeStatus(uid: string): void {
  // Players can only remove entries they can see (non-hidden).
  const before = token ? readApplied(token).find((a) => a.uid === uid) : undefined;
  void mutate(
    (cur) => cur.filter((a) => !(a.uid === uid && (isGM || !a.hidden))),
    before ? { kind: "remove", status: titleOf(before.defId, before.level) } : undefined,
  );
}

function toggleHidden(uid: string): void {
  if (!isGM) return;
  void mutate((cur) =>
    cur.map((a) => {
      if (a.uid !== uid) return a;
      // Keep everything (level included); only flip `hidden`.
      const { hidden: _h, ...rest } = a;
      return a.hidden ? rest : { ...rest, hidden: true };
    }),
  );
}

appliedEl.addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!btn || !token || !canManage(token, isGM, playerId)) return;
  const uid = btn.dataset.uid ?? "";
  if (btn.dataset.act === "rm") removeStatus(uid);
  else if (btn.dataset.act === "hide") toggleHidden(uid);
  else if (btn.dataset.act === "lv+" || btn.dataset.act === "lv-") {
    // Grid-distance levels step by the scene's grid scale.
    const applied = readApplied(token).find((a) => a.uid === uid);
    const step = levelStep(library.find((d) => d.id === applied?.defId));
    setLevel(uid, (n) => (btn.dataset.act === "lv+" ? n + step : n - step));
  }
});

// Typed level: commit on change / Enter; non-numbers snap back.
appliedEl.addEventListener("change", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.tagName !== "INPUT" || !input.dataset.uid || !token || !canManage(token, isGM, playerId)) return;
  const lv = cleanLevel(input.value);
  if (lv === undefined) {
    render();
    return;
  }
  input.value = String(lv);
  setLevel(input.dataset.uid, lv);
});
appliedEl.addEventListener("keydown", (e) => {
  const input = e.target as HTMLInputElement;
  if (input.tagName === "INPUT" && e.key === "Enter") input.blur();
});

pickEl.addEventListener("click", (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-def]");
  if (!el || !token || !canManage(token, isGM, playerId)) return;
  const defId = el.dataset.def ?? "";
  if (library.some((d) => d.id === defId)) addStatus(defId);
});

searchEl.addEventListener("input", renderPicker);

function close(): void {
  void OBR.broadcast.sendMessage(BC_REFRESH, {}, { destination: "LOCAL" }).catch(() => {});
  void OBR.modal.close(MANAGE_MODAL_ID);
}
closeBtn.addEventListener("click", close);
doneBtn.addEventListener("click", close);
editLibBtn.addEventListener("click", () => { void openLibraryModal(); });

OBR.onReady(async () => {
  try { isGM = (await OBR.player.getRole()) === "GM"; } catch {}
  try { playerId = await OBR.player.getId(); } catch {}
  addHidden.checked = getLocalSettings().gmDefaultHidden;
  await initRoomSettings(() => render());
  await initStatusGridScale(() => render());
  library = await readLibrary();
  try { [token] = await OBR.scene.items.getItems([tokenId]); } catch {}
  render();

  const tokenKey = (it: Item | null) =>
    it ? JSON.stringify([it.metadata?.[APPLIED_KEY], it.visible, it.name, it.createdUserId, it.layer]) : "";
  OBR.scene.items.onChange((items) => {
    const next = items.find((i) => i.id === tokenId) ?? null;
    const changed = tokenKey(next) !== tokenKey(token);
    token = next;
    if (changed) render();
  });
  onLibraryChange((defs) => {
    library = defs;
    render();
  });
  OBR.player.onChange((p) => {
    const gm = p.role === "GM";
    if (gm !== isGM) {
      isGM = gm;
      render();
    }
  });
});
