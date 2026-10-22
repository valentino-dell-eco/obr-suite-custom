// Settings → "Echo Companion" tab: QR codes for the phone app.
//
// How it works (GM side):
//   1. "Activate" claims the room on the backend. The backend answers
//      with a ROOM KEY, shown once and kept in this browser's
//      localStorage. It proves to the backend that we are the GM.
//      Another browser of the same GM can use it too (copy / paste).
//   2. The card owners of the current scene (owners_id in the scene's
//      card list) are sent to the backend, so it knows which cards
//      each player may open from the phone.
//   3. For each player: "QR code" makes a new code (the old one stops
//      working), "Revoke" turns the phone off.
//
// Players only see a short explanation: the GM gives them their code.
//
// Backend routes: echo-version-backend/src/companion.ts.

import OBR from "@owlbear-rodeo/sdk";
import qrcode from "qrcode-generator";
import { CC_ORIGIN } from "../characterCards/backend";
import type { Language } from "../../state";

const SECRET_LS = "obr-suite/companion/room-secret/";
const CARD_LIST_KEY = "com.character-cards/list";

function roomKey(): string {
  return (OBR.room?.id || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
}

function readSecret(room: string): string {
  try {
    return localStorage.getItem(SECRET_LS + room) ?? "";
  } catch {
    return "";
  }
}

function writeSecret(room: string, secret: string): void {
  try {
    if (secret) localStorage.setItem(SECRET_LS + room, secret);
    else localStorage.removeItem(SECRET_LS + room);
  } catch {}
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const TXT = {
  title: { zh: "Echo Companion（手机应用）", en: "Echo Companion (phone app)" },
  intro: {
    zh: "玩家用手机扫描二维码后，可以在手机上查看和编辑自己的角色卡、投骰。每个玩家一个二维码，可以访问分配给他的所有角色卡。",
    en: "Players scan a QR code with the phone app to view and edit their own character cards and roll dice. One code per player, giving access to every card assigned to them.",
  },
  playerNote: {
    zh: "向 DM 索取你的二维码。注意：需要登录 Owlbear Rodeo 账号（访客每次进入 ID 都会变化）。",
    en: "Ask the GM for your QR code. Note: you need to be logged in to an Owlbear Rodeo account (guests get a new id every time).",
  },
  noBackend: { zh: "未配置角色卡后端（VITE_CC_BACKEND）。", en: "Character-card backend not configured (VITE_CC_BACKEND)." },
  activate: { zh: "为此房间启用", en: "Activate for this room" },
  activateDesc: {
    zh: "第一次使用时启用一次。会生成一个“房间密钥”，保存在此浏览器中。",
    en: "Once, the first time. It creates a “room key” kept in this browser.",
  },
  claimed: {
    zh: "此房间已在另一个浏览器中启用。请粘贴那里的房间密钥：",
    en: "This room was already activated in another browser. Paste the room key from there:",
  },
  keyLabel: { zh: "房间密钥", en: "Room key" },
  keyDesc: {
    zh: "证明你是 DM。不要给玩家。换浏览器时复制过去。",
    en: "Proves you are the GM. Don't give it to players. Copy it to use another browser.",
  },
  show: { zh: "显示", en: "Show" },
  copy: { zh: "复制", en: "Copy" },
  save: { zh: "保存", en: "Save" },
  forget: { zh: "从此浏览器移除", en: "Remove from this browser" },
  players: { zh: "玩家", en: "Players" },
  noPlayers: { zh: "房间里没有其他玩家。", en: "No other players in the room." },
  makeQr: { zh: "二维码", en: "QR code" },
  newQr: { zh: "新二维码", en: "New QR code" },
  revoke: { zh: "停用", en: "Revoke" },
  active: { zh: "已连接手机", en: "phone linked" },
  lastUsed: { zh: "最近使用", en: "last used" },
  scanHint: {
    zh: "让玩家用 Echo Companion 应用扫描。旧的二维码已失效。",
    en: "Have the player scan it with the Echo Companion app. Their old code no longer works.",
  },
  copyLink: { zh: "复制链接", en: "Copy link" },
  close: { zh: "关闭", en: "Close" },
  ownersSynced: { zh: "已同步角色卡所有者", en: "Card owners synced" },
  cards: { zh: "张角色卡", en: "cards" },
  err: { zh: "错误", en: "Error" },
} as const;

type Key = keyof typeof TXT;
let lang: Language = "en";
const tx = (k: Key) => TXT[k][lang === "zh" ? "zh" : "en"];

// --- Backend calls ------------------------------------------------------------------

async function api(path: string, init: RequestInit & { secret?: string } = {}): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.secret) headers["X-Room-Secret"] = init.secret;
  const res = await fetch(`${CC_ORIGIN}/companion/${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body?.error || `HTTP ${res.status}`), { status: res.status });
  return body;
}

/** Owners of every card in the current scene's list → backend. */
async function syncOwners(room: string, secret: string): Promise<number> {
  const meta = await OBR.scene.getMetadata();
  const list = Array.isArray(meta[CARD_LIST_KEY]) ? (meta[CARD_LIST_KEY] as any[]) : [];
  const cards = list
    .filter((c) => typeof c?.id === "string" && !c.id.startsWith("imported_"))
    .map((c) => ({ card: c.id, players: Array.isArray(c.owners_id) ? c.owners_id : [] }));
  await api("owners", { method: "POST", secret, body: JSON.stringify({ room, cards }) });
  return cards.length;
}

// --- Rendering -------------------------------------------------------------------------

export function renderCompanionBody(l: Language, isGM: boolean): string {
  lang = l;
  const head = `<h3>${tx("title")}</h3><p>${tx("intro")}</p>`;
  if (!CC_ORIGIN) return `${head}<p class="role-notice">${tx("noBackend")}</p>`;
  if (!isGM) return `${head}<p class="role-notice">${tx("playerNote")}</p>`;
  // The GM part is filled in by wireCompanionBody (it needs the network).
  return `${head}<div id="companion-root"><p style="color:var(--text-dim)">…</p></div>`;
}

export function wireCompanionBody(root: HTMLElement, isGM: boolean): void {
  if (!isGM || !CC_ORIGIN) return;
  const box = root.querySelector<HTMLElement>("#companion-root");
  if (box) void drawGM(box);
}

async function drawGM(box: HTMLElement): Promise<void> {
  const room = roomKey();
  const secret = readSecret(room);
  if (!secret) {
    box.innerHTML = `
      <div class="row">
        <div class="lbl">${tx("activate")}<div class="desc">${tx("activateDesc")}</div></div>
        <button type="button" class="dl-btn" data-act="claim">${tx("activate")}</button>
      </div>
      <div data-slot="paste"></div>
      <p data-slot="msg" style="color:#e07a7a"></p>`;
    box.querySelector<HTMLButtonElement>('[data-act="claim"]')!.onclick = async () => {
      try {
        const r = await api("room/claim", { method: "POST", body: JSON.stringify({ room }) });
        writeSecret(room, r.room_secret);
        await drawGM(box);
      } catch (e: any) {
        if (e?.status === 409) drawPaste(box, room);
        else box.querySelector<HTMLElement>('[data-slot="msg"]')!.textContent = `${tx("err")}: ${e?.message ?? e}`;
      }
    };
    return;
  }

  box.innerHTML = `
    <div class="row">
      <div class="lbl">${tx("keyLabel")}<div class="desc">${tx("keyDesc")}</div></div>
      <span>
        <button type="button" class="dl-btn" data-act="show">${tx("show")}</button>
        <button type="button" class="dl-btn" data-act="copy">${tx("copy")}</button>
      </span>
    </div>
    <code data-slot="key" style="display:none;word-break:break-all;font-size:11px"></code>
    <h4 style="margin-top:14px">${tx("players")}</h4>
    <p data-slot="sync" style="color:var(--text-dim);font-size:11.5px">…</p>
    <div data-slot="players">…</div>
    <div data-slot="qr"></div>
    <p data-slot="msg" style="color:#e07a7a"></p>
    <p style="margin-top:14px"><button type="button" class="dl-btn" data-act="forget">${tx("forget")}</button></p>`;
  const msg = (t: string) => (box.querySelector<HTMLElement>('[data-slot="msg"]')!.textContent = t);
  const keyEl = box.querySelector<HTMLElement>('[data-slot="key"]')!;
  box.querySelector<HTMLButtonElement>('[data-act="show"]')!.onclick = () => {
    keyEl.textContent = secret;
    keyEl.style.display = keyEl.style.display === "none" ? "block" : "none";
  };
  box.querySelector<HTMLButtonElement>('[data-act="copy"]')!.onclick = () => void navigator.clipboard?.writeText(secret);
  box.querySelector<HTMLButtonElement>('[data-act="forget"]')!.onclick = async () => {
    writeSecret(room, "");
    await drawGM(box);
  };

  try {
    const n = await syncOwners(room, secret);
    box.querySelector<HTMLElement>('[data-slot="sync"]')!.textContent = `✓ ${tx("ownersSynced")} (${n} ${tx("cards")})`;
  } catch (e: any) {
    if (e?.status === 403) {
      // Wrong / old key: let the GM paste the right one.
      writeSecret(room, "");
      drawPaste(box, room);
      return;
    }
    msg(`${tx("err")}: ${e?.message ?? e}`);
  }
  await drawPlayers(box, room, secret);
}

function drawPaste(box: HTMLElement, room: string): void {
  box.innerHTML = `
    <p>${tx("claimed")}</p>
    <div class="row">
      <input type="text" data-slot="input" style="flex:1;min-width:0" autocomplete="off" />
      <button type="button" class="dl-btn" data-act="save">${tx("save")}</button>
    </div>`;
  box.querySelector<HTMLButtonElement>('[data-act="save"]')!.onclick = async () => {
    const v = box.querySelector<HTMLInputElement>('[data-slot="input"]')!.value.trim();
    if (!v) return;
    writeSecret(room, v);
    await drawGM(box);
  };
}

async function drawPlayers(box: HTMLElement, room: string, secret: string): Promise<void> {
  const slot = box.querySelector<HTMLElement>('[data-slot="players"]')!;
  let online: Array<{ id: string; name: string }> = [];
  try {
    online = (await OBR.party.getPlayers()).map((p) => ({ id: p.id, name: p.name }));
  } catch {}
  let linked: Array<{ player: string; player_name: string; last_used: string | null }> = [];
  try {
    linked = (await api(`tokens?room=${encodeURIComponent(room)}`, { secret })).tokens ?? [];
  } catch {}
  // Online players + players who already have a phone linked (maybe offline now).
  const byId = new Map<string, string>();
  for (const p of online) byId.set(p.id, p.name);
  for (const t of linked) if (!byId.has(t.player)) byId.set(t.player, t.player_name || t.player);
  if (!byId.size) {
    slot.innerHTML = `<p style="color:var(--text-dim)">${tx("noPlayers")}</p>`;
    return;
  }
  const linkedIds = new Map(linked.map((t) => [t.player, t]));
  slot.innerHTML = [...byId.entries()]
    .map(([id, name]) => {
      const t = linkedIds.get(id);
      const status = t
        ? `<div class="desc">✓ ${tx("active")}${t.last_used ? ` · ${tx("lastUsed")} ${esc(new Date(t.last_used).toLocaleString())}` : ""}</div>`
        : "";
      return `
        <div class="row" data-player="${esc(id)}" data-name="${esc(name)}">
          <div class="lbl">${esc(name)}${status}</div>
          <span>
            <button type="button" class="dl-btn" data-act="qr">${t ? tx("newQr") : tx("makeQr")}</button>
            ${t ? `<button type="button" class="dl-btn" data-act="revoke">${tx("revoke")}</button>` : ""}
          </span>
        </div>`;
    })
    .join("");
  const msg = (s: string) => (box.querySelector<HTMLElement>('[data-slot="msg"]')!.textContent = s);
  slot.querySelectorAll<HTMLElement>("[data-player]").forEach((row) => {
    const player = row.dataset.player!;
    const name = row.dataset.name ?? "";
    row.querySelector<HTMLButtonElement>('[data-act="qr"]')!.onclick = async () => {
      try {
        await syncOwners(room, secret).catch(() => 0);
        const r = await api("tokens", {
          method: "POST",
          secret,
          body: JSON.stringify({ room, player, player_name: name }),
        });
        showQr(box, name, r.link);
        await drawPlayers(box, room, secret);
      } catch (e: any) {
        msg(`${tx("err")}: ${e?.message ?? e}`);
      }
    };
    const rv = row.querySelector<HTMLButtonElement>('[data-act="revoke"]');
    if (rv)
      rv.onclick = async () => {
        try {
          await api(`tokens?room=${encodeURIComponent(room)}&player=${encodeURIComponent(player)}`, {
            method: "DELETE",
            secret,
          });
          box.querySelector<HTMLElement>('[data-slot="qr"]')!.innerHTML = "";
          await drawPlayers(box, room, secret);
        } catch (e: any) {
          msg(`${tx("err")}: ${e?.message ?? e}`);
        }
      };
  });
}

function showQr(box: HTMLElement, name: string, link: string): void {
  const qr = qrcode(0, "M");
  qr.addData(link);
  qr.make();
  const slot = box.querySelector<HTMLElement>('[data-slot="qr"]')!;
  slot.innerHTML = `
    <div style="margin-top:12px;padding:12px;border-radius:8px;background:#fff;color:#111;text-align:center">
      <div style="font-weight:600;margin-bottom:6px">${esc(name)}</div>
      <img alt="QR" src="${qr.createDataURL(5, 4)}" style="image-rendering:pixelated;max-width:100%" />
      <div style="font-size:11.5px;margin:6px 0">${tx("scanHint")}</div>
      <button type="button" class="dl-btn" data-act="copylink">${tx("copyLink")}</button>
      <button type="button" class="dl-btn" data-act="closeqr">${tx("close")}</button>
    </div>`;
  slot.querySelector<HTMLButtonElement>('[data-act="copylink"]')!.onclick = () => void navigator.clipboard?.writeText(link);
  slot.querySelector<HTMLButtonElement>('[data-act="closeqr"]')!.onclick = () => (slot.innerHTML = "");
}
