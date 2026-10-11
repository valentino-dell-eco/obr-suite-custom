import OBR from "@owlbear-rodeo/sdk";
import { getLocalLang } from "./state";
import { PANEL_IDS } from "./utils/panelLayout";
import { bindPanelDrag } from "./utils/panelDrag";
import {
  BC_CHAT_UPDATED,
  BC_CHAT_CLOSE,
  BC_CHAT_CLEAR,
  BC_CHAT_CLEARED,
  ChatCast,
  ChatMessage,
  ChatRole,
  ChatScope,
  ChatTool,
  isChatMessage,
  toolOf,
} from "./modules/roomChat/types";
import { playChatMessage, primeAudio } from "./modules/dice/sfx";
import { ICONS } from "./icons";
import { loadHistory, clearHistory } from "./modules/roomChat/history";
import { sendChat } from "./modules/roomChat/send";
import { bindRollableClickPopup } from "./modules/dice/context-menu";
import { initBroadcastAuth, isFromSelf } from "./utils/broadcastAuth";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const msgsEl = $("msgs");
const titleEl = $("title");
const closeEl = $("close");
const clearEl = $("clear");
const confirmBar = $("confirmBar");
const confirmQ = $("confirmQ");
const cfCancel = $("cfCancel");
const cfLocal = $("cfLocal");
const cfAll = $("cfAll");
const dragEl = $("dragHandle");
const chAll = $("chAll");
const chGm = $("chGm");
const chPlayer = $("chPlayer");
const targetEl = $<HTMLSelectElement>("target");
const textEl = $<HTMLInputElement>("text");
const sendEl = $<HTMLButtonElement>("send");

const en = getLocalLang() === "en";
let meId = "";
let meRole: ChatRole = "PLAYER";
let channel: ChatScope = "all";
let pickable: Array<{ id: string; name: string }> = [];
let messages: ChatMessage[] = [];

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Per-message "details open" state survives re-renders (renderAll on
// history load / clear) for the lifetime of this popover.
const openCasts = new Set<string>();

function dcSuffix(cast: ChatCast): string {
  if (cast.dc == null) return "";
  return cast.dcEdited
    ? ` (DC ${cast.dc} - ${en ? "Edited" : "已修改"})`
    : ` (DC ${cast.dc})`;
}

// Dice expressions ("2d6", "1d8 + 3") in a spell description become
// clickable .rollable spans — bindRollableClickPopup (same as the
// character card mini panel) opens the dice roll modal for them.
const DICE_RE = /(?<![\w])(\d+d\d+(?:\s*[+-]\s*\d+)?)(?![\w])/g;

function appendWithDice(
  parent: HTMLElement,
  text: string,
  label: string,
  scaledTo: Set<string>,
): void {
  let last = 0;
  for (const m of text.matchAll(DICE_RE)) {
    const i = m.index ?? 0;
    if (i > last) parent.append(text.slice(last, i));
    const span = document.createElement("span");
    span.className = "rollable" + (scaledTo.has(m[1]) ? " scaled" : "");
    span.dataset.expr = m[1].replace(/\s+/g, "");
    span.dataset.label = label;
    span.title = en ? `Roll ${m[1]}` : `投掷 ${m[1]}`;
    span.textContent = m[1];
    parent.appendChild(span);
    last = i + m[0].length;
  }
  if (last < text.length) parent.append(text.slice(last));
}

function renderCast(cast: ChatCast, msgId?: string): HTMLElement {
  const c = document.createElement("div");
  c.className = "cast";

  const head = document.createElement("div");
  head.className = "cast-head";
  const s = document.createElement("div");
  s.className = "spell";
  const isFeature = cast.kind === "feature";
  s.textContent = isFeature
    ? `⚡ ${cast.spellName}`
    : `✨ ${cast.spellName}${dcSuffix(cast)}`;
  head.appendChild(s);

  const hasDetails = !!(cast.meta || cast.description);
  const body = document.createElement("div");
  body.className = "cast-body";

  if (hasDetails) {
    const tog = document.createElement("button");
    tog.className = "cast-btn cast-toggle";
    tog.textContent = "▾";
    const key = msgId ?? "";
    const setOpen = (open: boolean) => {
      body.style.display = open ? "" : "none";
      tog.classList.toggle("open", open);
      tog.title = open
        ? en ? "Hide details" : "隐藏详情"
        : en ? "Show details" : "显示详情";
    };
    setOpen(key ? openCasts.has(key) : false);
    tog.addEventListener("click", () => {
      const open = body.style.display === "none";
      if (key) { if (open) openCasts.add(key); else openCasts.delete(key); }
      setOpen(open);
    });
    head.appendChild(tog);
  }

  const srch = document.createElement("button");
  srch.className = "cast-btn";
  srch.textContent = "🔍";
  srch.title = en ? "Show in search bar" : "在搜索栏中查看";
  srch.addEventListener("click", () => {
    void OBR.broadcast.sendMessage(
      "com.obr-suite/search-query",
      { q: cast.spellName, autoPin: true },
      { destination: "LOCAL" },
    );
  });
  head.appendChild(srch);
  c.appendChild(head);

  const l = document.createElement("div");
  l.className = "lvl";
  const base = cast.baseLevel;
  const cl = cast.castLevel;
  const baseTxt = base === 0 ? (en ? "Cantrip" : "戏法") : en ? `Level ${base}` : `${base} 环`;
  if (isFeature) {
    const what = cast.featureLabel || (en ? "Feature" : "特性");
    l.textContent = en ? `${what} — used` : `${what} — 使用`;
  } else {
    l.textContent =
      cl > base
        ? en ? `${baseTxt} — cast at level ${cl}` : `${baseTxt} — 以 ${cl} 环施放`
        : en ? `${baseTxt} — cast` : `${baseTxt} — 施放`;
  }
  if (cast.source) l.textContent += ` · ${cast.source}`;
  if (cast.edited) {
    const ed = document.createElement("span");
    ed.className = "cast-edited";
    ed.textContent = ` · ${en ? "Edited" : "已修改"}`;
    l.appendChild(ed);
  }
  c.appendChild(l);

  if (cast.spent && cast.spent.name && Number.isFinite(cast.spent.amount)) {
    const sp = document.createElement("div");
    sp.className = "cast-spent";
    const { name, amount, left, max } = cast.spent;
    const rest = Number.isFinite(left) && Number.isFinite(max)
      ? en ? ` (${left}/${max} left)` : `（剩余 ${left}/${max}）`
      : "";
    sp.textContent = en
      ? `Spent: ${amount} × ${name}${rest}`
      : `消耗：${amount} × ${name}${rest}`;
    c.appendChild(sp);
  }

  if (cast.scaled?.length) {
    const sc = document.createElement("div");
    sc.className = "cast-scaled";
    const what = cast.castLevel > cast.baseLevel
      ? en ? "Upcast" : "升环"
      : en ? "Scaled" : "戏法成长";
    sc.textContent = `${what}: ${cast.scaled.map((x) => `${x.from} → ${x.to}`).join(", ")}`;
    c.appendChild(sc);
  }

  if (hasDetails) {
    if (cast.meta) {
      const meta = document.createElement("div");
      meta.className = "cast-meta";
      meta.textContent = cast.meta;
      body.appendChild(meta);
    }
    if (cast.description) {
      const desc = document.createElement("div");
      desc.className = "cast-desc";
      appendWithDice(
        desc,
        cast.description,
        cast.spellName,
        new Set((cast.scaled ?? []).map((x) => x.to)),
      );
      body.appendChild(desc);
    }
    c.appendChild(body);
  }
  return c;
}

// Tool notices: colour + icon per tool. Icons are the suite's inline
// SVGs (currentColor), tinted with the tool colour.
const CAMPFIRE_ICON =
  `<svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
  `stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-0.18em">` +
  `<path d="M12 3c2.5 3 4 4.8 4 7.2a4 4 0 0 1-8 0c0-1.6.8-2.8 1.8-3.8.2 1.4.9 2.3 2 2.6C11.5 7.5 11.4 5.4 12 3z" fill="currentColor"/>` +
  `<path d="M4 20l16-4M4 16l16 4"/></svg>`;
const TOOL_STYLE: Record<ChatTool, { color: string; icon: string; en: string; zh: string }> = {
  status: { color: "#f39c4a", icon: ICONS.statusChip, en: "Status Tracker", zh: "状态追踪" },
  rest: { color: "#4cc38a", icon: CAMPFIRE_ICON, en: "Rest", zh: "休息" },
  cast: { color: "#a98bff", icon: ICONS.sparkles, en: "Spell", zh: "施法" },
};

function scopeBadge(m: ChatMessage): HTMLElement | null {
  if (m.scope === "all") return null;
  const b = document.createElement("span");
  if (m.scope === "gm") {
    b.className = "badge gm";
    b.textContent = "→ GM";
  } else {
    b.className = "badge player";
    b.textContent = `→ ${m.toId === meId ? (en ? "you" : "你") : m.toName || "?"}`;
  }
  return b;
}

/** A tool announcement: no tail, full width, tool icon + colour. */
function renderNotice(m: ChatMessage, tool: ChatTool): HTMLElement {
  const st = TOOL_STYLE[tool];
  const el = document.createElement("div");
  el.className = `msg notice tool-${tool}`;
  el.style.setProperty("--tc", st.color);

  const ico = document.createElement("span");
  ico.className = "ico";
  ico.innerHTML = st.icon; // static, trusted markup
  el.appendChild(ico);

  const col = document.createElement("div");
  col.className = "ncol";
  const meta = document.createElement("div");
  meta.className = "meta";
  const tname = document.createElement("span");
  tname.className = "tname";
  tname.textContent = en ? st.en : st.zh;
  meta.appendChild(tname);
  const from = document.createElement("span");
  from.className = "from";
  from.textContent = m.fromId === meId ? (en ? "You" : "你") : m.fromName;
  from.style.color = m.fromColor;
  meta.appendChild(from);
  const badge = scopeBadge(m);
  if (badge) meta.appendChild(badge);
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = fmtTime(m.ts);
  meta.appendChild(time);
  col.appendChild(meta);

  if (m.cast) col.appendChild(renderCast(m.cast, m.id));
  if (m.text) {
    const body = document.createElement("div");
    body.className = "body";
    body.textContent = m.text;
    col.appendChild(body);
  }
  el.appendChild(col);
  return el;
}

/** A spell cast: the original layout (name + time, then the spell
 *  card) — no bubble, no notice frame. */
function renderCastMessage(m: ChatMessage): HTMLElement {
  const own = m.fromId === meId;
  const el = document.createElement("div");
  el.className = "msg cast-msg" + (own ? " own" : "");
  const meta = document.createElement("div");
  meta.className = "meta";
  const from = document.createElement("span");
  from.className = "from";
  from.textContent = own ? (en ? "You" : "你") : m.fromName;
  from.style.color = m.fromColor;
  meta.appendChild(from);
  const badge = scopeBadge(m);
  if (badge) meta.appendChild(badge);
  const time = document.createElement("span");
  time.textContent = fmtTime(m.ts);
  meta.appendChild(time);
  el.appendChild(meta);
  if (m.cast) el.appendChild(renderCast(m.cast, m.id));
  if (m.text) {
    const body = document.createElement("div");
    body.className = "body";
    body.textContent = m.text;
    el.appendChild(body);
  }
  return el;
}

/** A typed message: speech bubble. Mine: tail on the LEFT; someone
 *  else's: tail on the RIGHT. */
function renderMessage(m: ChatMessage): HTMLElement {
  if (m.cast) return renderCastMessage(m);
  const tool = toolOf(m);
  if (tool) return renderNotice(m, tool);
  const own = m.fromId === meId;
  const el = document.createElement("div");
  el.className = "msg bubble " + (own ? "own" : "other") +
    (m.scope === "gm" ? " whisper w-gm" : m.scope === "player" ? " whisper w-player" : "");

  const meta = document.createElement("div");
  meta.className = "meta";
  const from = document.createElement("span");
  from.className = "from";
  from.textContent = own ? (en ? "You" : "你") : m.fromName;
  from.style.color = m.fromColor;
  meta.appendChild(from);
  const badge = scopeBadge(m);
  if (badge) meta.appendChild(badge);
  const time = document.createElement("span");
  time.className = "time";
  time.textContent = fmtTime(m.ts);
  meta.appendChild(time);
  el.appendChild(meta);

  if (m.text) {
    const body = document.createElement("div");
    body.className = "body";
    body.textContent = m.text;
    el.appendChild(body);
  }
  return el;
}

function renderAll(): void {
  msgsEl.innerHTML = "";
  if (messages.length === 0) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = en ? "No messages yet." : "还没有消息。";
    msgsEl.appendChild(e);
    return;
  }
  for (const m of messages) msgsEl.appendChild(renderMessage(m));
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

function appendOne(m: ChatMessage): void {
  if (messages.some((x) => x.id === m.id)) return;
  const wasEmpty = messages.length === 0;
  const nearBottom = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 60;
  messages.push(m);
  if (wasEmpty) { renderAll(); return; }
  msgsEl.appendChild(renderMessage(m));
  if (nearBottom || m.fromId === meId) msgsEl.scrollTop = msgsEl.scrollHeight;
}

function refreshChannelUi(): void {
  chAll.textContent = en ? "All" : "所有人";
  chGm.textContent = "GM";
  chPlayer.textContent = en ? "Player" : "玩家";
  chGm.style.display = meRole === "GM" ? "none" : "";
  chPlayer.classList.toggle("disabled", pickable.length === 0);
  if (channel === "gm" && meRole === "GM") channel = "all";
  if (channel === "player" && pickable.length === 0) channel = "all";
  for (const el of [chAll, chGm, chPlayer]) {
    el.classList.toggle("active", el.dataset.ch === channel);
  }
  targetEl.style.display = channel === "player" ? "" : "none";
  const prev = targetEl.value;
  targetEl.innerHTML = "";
  for (const p of pickable) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = p.name;
    targetEl.appendChild(o);
  }
  if (pickable.some((p) => p.id === prev)) targetEl.value = prev;
  textEl.placeholder =
    channel === "all"
      ? en ? "Message everyone…" : "发送给所有人…"
      : channel === "gm"
        ? en ? "Whisper to the GM…" : "悄悄话 → GM…"
        : en ? "Whisper to a player…" : "悄悄话 → 玩家…";
  sendEl.textContent = en ? "Send" : "发送";
}

async function refreshParty(): Promise<void> {
  try {
    const players = await OBR.party.getPlayers();
    pickable = players
      .filter((p) => p.role !== "GM" && p.id !== meId)
      .map((p) => ({ id: p.id, name: p.name || "?" }));
  } catch { pickable = []; }
  refreshChannelUi();
}

async function doSend(): Promise<void> {
  const text = textEl.value.trim();
  if (!text) return;
  let ok = false;
  if (channel === "player") {
    const toId = targetEl.value;
    const toName = pickable.find((p) => p.id === toId)?.name;
    if (!toId) return;
    ok = await sendChat({ scope: "player", toId, toName, text });
  } else {
    ok = await sendChat({ scope: channel, text });
  }
  if (ok) textEl.value = "";
}

for (const el of [chAll, chGm, chPlayer]) {
  el.addEventListener("click", () => {
    if (el.classList.contains("disabled")) return;
    channel = el.dataset.ch as ChatScope;
    refreshChannelUi();
    textEl.focus();
  });
}
sendEl.addEventListener("click", () => void doSend());
textEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    void doSend();
  }
});
closeEl.addEventListener("click", () => {
  void OBR.broadcast.sendMessage(BC_CHAT_CLOSE, {}, { destination: "LOCAL" });
});

// --- Clear chat ---
function refreshConfirmUi(): void {
  clearEl.title = en ? "Clear chat" : "清空聊天";
  confirmQ.textContent =
    meRole === "GM"
      ? en ? "Clear the chat history?" : "清空聊天记录？"
      : en ? "Clear your chat history?" : "清空你的聊天记录？";
  cfCancel.textContent = en ? "Cancel" : "取消";
  cfLocal.textContent = en ? "Clear mine" : "仅清空我的";
  cfAll.textContent = en ? "Clear for everyone" : "为所有人清空";
  // Only the GM can wipe everyone's history.
  cfAll.style.display = meRole === "GM" ? "" : "none";
}
function hideConfirm(): void {
  confirmBar.classList.remove("visible");
}
clearEl.addEventListener("click", () => {
  refreshConfirmUi();
  confirmBar.classList.toggle("visible");
});
cfCancel.addEventListener("click", hideConfirm);
cfLocal.addEventListener("click", () => {
  // Same-origin localStorage, shared with the background page — clear
  // it directly and re-render; no broadcast needed for a local wipe.
  clearHistory(OBR.room.id || "room");
  messages = [];
  renderAll();
  hideConfirm();
});
cfAll.addEventListener("click", () => {
  // destination ALL → every client's background clears its own
  // history (including ours) and replies with BC_CHAT_CLEARED.
  void OBR.broadcast.sendMessage(BC_CHAT_CLEAR, {}, { destination: "ALL" });
  hideConfirm();
});

OBR.onReady(async () => {
  titleEl.textContent = en ? "Room Chat" : "房间聊天";
  const dragTitle = en ? "Drag to reposition" : "拖动重新定位";
  dragEl.title = dragTitle;
  dragEl.setAttribute("aria-label", dragTitle);
  closeEl.title = en ? "Close" : "关闭";

  await initBroadcastAuth();
  try { meId = await OBR.player.getId(); } catch {}
  try { meRole = (await OBR.player.getRole()) as ChatRole; } catch {}
  refreshConfirmUi();
  OBR.player.onChange((p) => {
    if ((p.role as ChatRole) !== meRole) {
      meRole = p.role as ChatRole;
      refreshChannelUi();
      refreshConfirmUi();
    }
  });
  OBR.party.onChange(() => { void refreshParty(); });
  await refreshParty();

  messages = loadHistory(OBR.room.id || "room");
  renderAll();

  // Both are LOCAL relays from our own background module (which has
  // already stamped the real sender identity onto the message).
  OBR.broadcast.onMessage(BC_CHAT_UPDATED, (ev) => {
    if (!isFromSelf(ev)) return;
    const m = ev.data;
    if (!isChatMessage(m)) return;
    const fresh = !messages.some((x) => x.id === m.id);
    appendOne(m);
    // This window usually has had a click / keypress, so its audio is
    // unlocked; the cluster plays it otherwise (one plays, not both).
    if (fresh && m.fromId !== meId) playChatMessage();
  });
  OBR.broadcast.onMessage(BC_CHAT_CLEARED, (ev) => {
    if (!isFromSelf(ev)) return;
    messages = [];
    renderAll();
  });
  bindPanelDrag(dragEl, PANEL_IDS.roomChat);
  for (const t of ["pointerdown", "keydown"]) document.addEventListener(t, primeAudio, { capture: true });
  // Clicks on dice in spell descriptions → dice roll modal, rolled for
  // the clicker's selected token (same default as everywhere else).
  bindRollableClickPopup(msgsEl);
  textEl.focus();
});
