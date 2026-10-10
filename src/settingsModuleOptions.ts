// Settings panel — option rows for the Status Tracker and the Chase
// Tracker tabs (rendered by settings.ts through dynamicBody /
// afterRender). "Personal" options live in this browser's
// localStorage; "room" options are written to room metadata by the GM
// and read by everyone.

import type { Language } from "./state";
import {
  ROTATE_CHOICES,
  getLocalSettings as getSttLocal,
  getRoomSettings as getSttRoom,
  initRoomSettings as initSttRoom,
  setLocalSettings as setSttLocal,
  setRoomSettings as setSttRoom,
  type SttLocalSettings,
  type SttRoomSettings,
} from "./modules/statusTester/settings";
import {
  STEP_CHOICES,
  getChaseLocalSettings,
  getChaseRoomSettings,
  initChaseRoomSettings,
  setChaseLocalSettings,
  setChaseRoomSettings,
  type ChaseLocalSettings,
  type ChaseRoomSettings,
} from "./modules/chaseTracker/settings";

type L = Language;
const tr = (lang: L, zh: string, en: string) => (lang === "zh" ? zh : en);

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

// --- Building blocks -------------------------------------------------------

function row(label: string, desc: string, control: string): string {
  return `<div class="row"><div class="lbl">${esc(label)}<div class="desc"><em>${desc}</em></div></div>${control}</div>`;
}

function seg(opt: string, cur: string, options: Array<[string, string]>, disabled: boolean, lang: L): string {
  const buttons = options
    .map(([v, label], i) => {
      const on = v === cur;
      return `<button type="button" data-val="${esc(v)}" aria-pressed="${on}"
        style="background:${on ? "rgba(93,173,226,0.20)" : "transparent"};color:${on ? "#7ec8f0" : "#9aa0b3"};border:none;${i ? "border-left:1px solid rgba(255,255,255,0.12);" : ""}padding:5px 9px;cursor:pointer;font:inherit;font-weight:600;white-space:nowrap">${esc(label)}</button>`;
    })
    .join("");
  return `<div class="mode-switch" data-opt="${esc(opt)}" role="radiogroup"
    title="${disabled ? esc(tr(lang, "由 DM 控制", "Controlled by the DM")) : ""}"
    style="display:inline-flex;flex:none;border:1px solid rgba(255,255,255,0.18);border-radius:6px;overflow:hidden;font-size:11px;font-weight:600;user-select:none;align-self:center${disabled ? ";opacity:0.45;pointer-events:none" : ""}">${buttons}</div>`;
}

function tog(opt: string, on: boolean, disabled = false): string {
  return `<button type="button" class="tog ${on ? "on" : ""}" data-opt="${esc(opt)}" aria-pressed="${on}" ${disabled ? "disabled" : ""}></button>`;
}

function range(opt: string, value: number, min: number, max: number, step: number): string {
  return `<input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-opt="${esc(opt)}"
      style="flex:1 1 auto;align-self:center;max-width:140px"/>
    <span data-opt-val="${esc(opt)}" style="flex:0 0 46px;text-align:right;color:#9aa0b3;font-size:11px;font-variant-numeric:tabular-nums">${value.toFixed(2)}×</span>`;
}

const personal = (lang: L) => tr(lang, "本机偏好（仅此浏览器）。", "Personal (this browser only). ");
const roomWide = (lang: L, isGM: boolean) =>
  isGM
    ? tr(lang, "房间设置（所有人一致）。", "Room-wide (same for everyone). ")
    : tr(lang, "房间设置，由 DM 控制。", "Room-wide — controlled by the DM. ");

// --- Status Tracker --------------------------------------------------------

export function sttOptionsHtml(lang: L, isGM: boolean): string {
  const ls = getSttLocal();
  const rs = getSttRoom();
  const P = personal(lang);
  const R = roomWide(lang, isGM);
  return `
    <h3 style="margin-top:14px">${esc(tr(lang, "选项", "Options"))}</h3>
    ${row(
      tr(lang, "轮换间隔", "Rotation"),
      `${P}${tr(lang, "token 有多个状态时每个显示多久。关闭 = 只显示第一个状态并附「+N」。", "How long each status shows when a token has several. Off = first status only, with a “+N” count.")}`,
      seg("stt.rotateSec", String(ls.rotateSec), ROTATE_CHOICES.map((n) => [String(n), n === 0 ? tr(lang, "关", "Off") : `${n}s`]), false, lang),
    )}
    ${row(tr(lang, "标签大小", "Chip size"), `${P}${tr(lang, "整个状态标签的大小（相对 token）。", "Overall chip size (relative to the token).")}`, range("stt.chipScale", ls.chipScale, 0.5, 2, 0.05))}
    ${row(tr(lang, "图标大小", "Icon size"), `${P}${tr(lang, "标签内的图标 / emoji。", "Icon / emoji inside the chip.")}`, range("stt.iconScale", ls.iconScale, 0.5, 2, 0.05))}
    ${row(tr(lang, "文字大小", "Text size"), `${P}${tr(lang, "标签内的状态名称。", "Status title inside the chip.")}`, range("stt.textScale", ls.textScale, 0.5, 2, 0.05))}
    ${row(
      tr(lang, "标签位置", "Chip position"),
      `${R}${tr(lang, "状态标签显示在 token 的哪一侧。", "Which side of the token the chips sit on.")}`,
      seg("stt.position", rs.position, [
        ["top", tr(lang, "上", "Top")],
        ["bottom", tr(lang, "下", "Bottom")],
        ["left", tr(lang, "左", "Left")],
        ["right", tr(lang, "右", "Right")],
      ], !isGM, lang),
    )}
    ${row(tr(lang, "悬停列表", "Hover list"), `${P}${tr(lang, "鼠标悬停在标签上时列出该 token 的全部状态。", "Hovering a chip lists every status on that token.")}`, tog("stt.hoverList", ls.hoverList))}
    ${row(tr(lang, "附加图像", "Attachment images"), `${P}${tr(lang, "在 token 上显示状态的附加图像。", "Draw status images over tokens.")}`, tog("stt.showAttachments", ls.showAttachments))}
    ${row(
      tr(lang, "玩家权限", "Player permissions"),
      `${R}${tr(lang, "仅查看；可管理自己 token 上的状态；或同时可编辑状态库。", "View only; manage statuses on their own tokens; or also edit the library.")}`,
      seg("stt.playerPerm", rs.playerPerm, [
        ["view", tr(lang, "仅查看", "View")],
        ["apply", tr(lang, "自己的 token", "Own tokens")],
        ["library", tr(lang, "+ 状态库", "+ Library")],
      ], !isGM, lang),
    )}
    ${isGM ? row(
      tr(lang, "默认对玩家隐藏", "Hidden by default"),
      `${P}${tr(lang, "GM 新添加的状态默认对玩家隐藏（拖放时按住 Shift 反转）。", "Statuses you add start hidden from players (Shift on drop inverts it).")}`,
      tog("stt.gmDefaultHidden", ls.gmDefaultHidden),
    ) : ""}
  `;
}

const STT_LOCAL_KEYS = new Set<keyof SttLocalSettings>([
  "rotateSec", "chipScale", "iconScale", "textScale", "hoverList", "showAttachments", "gmDefaultHidden",
]);
const STT_ROOM_KEYS = new Set<keyof SttRoomSettings>(["position", "playerPerm"]);

// --- Chase Tracker ---------------------------------------------------------

export function chaseOptionsHtml(lang: L, isGM: boolean): string {
  const ls = getChaseLocalSettings();
  const rs = getChaseRoomSettings();
  const P = personal(lang);
  const R = roomWide(lang, isGM);
  return `
    <h3 style="margin-top:14px">${esc(tr(lang, "选项", "Options"))}</h3>
    ${row(
      tr(lang, "−/+ 步长", "−/+ step"),
      `${R}${tr(lang, "距离编辑器按钮每次增减的数值。网格 = 场景的网格比例。", "How much the distance buttons change per click. Grid = the scene's grid scale.")}`,
      seg("chase.step", String(rs.step), STEP_CHOICES.map((n) => [String(n), n === 0 ? tr(lang, "网格", "Grid") : String(n)]), !isGM, lang),
    )}
    ${row(
      tr(lang, "单位", "Unit"),
      `${R}${tr(lang, "距离后显示的单位（仅为标签，不做换算）。场景 = 网格比例的单位。", "Label shown after distances (a label only, no conversion). Scene = the grid scale's unit.")}`,
      seg("chase.unit", rs.unit, [
        ["scene", tr(lang, "场景", "Scene")],
        ["ft", "ft"],
        ["m", "m"],
        ["none", tr(lang, "无", "None")],
      ], !isGM, lang),
    )}
    ${row(
      tr(lang, "玩家可见", "Players see"),
      `${R}${tr(lang, "全部；只看距离（隐藏猎物身份）；或完全不显示面板。", "Everything; distances only (quarry hidden); or no panel at all.")}`,
      seg("chase.playerView", rs.playerView, [
        ["all", tr(lang, "全部", "All")],
        ["distances", tr(lang, "仅距离", "Distances")],
        ["none", tr(lang, "隐藏", "Hidden")],
      ], !isGM, lang),
    )}
    ${row(
      tr(lang, "谁能移动", "Who can move"),
      `${R}${tr(lang, "只有 GM，或玩家也能修改自己 token 的距离。", "Only the GM, or players too on their own tokens.")}`,
      seg("chase.playerMove", rs.playerMove, [
        ["gm", "GM"],
        ["owners", tr(lang, "token 所有者", "Owners")],
      ], !isGM, lang),
    )}
    ${row(tr(lang, "先攻自动选中", "Follow initiative"), `${P}${tr(lang, "轮到某 token 的先攻回合时自动选中它。", "Select the token whose initiative turn starts.")}`, tog("chase.autoSelect", ls.autoSelect))}
    ${row(tr(lang, "自动打开面板", "Open automatically"), `${P}${tr(lang, "有追逐战时自动显示面板；关闭时可从「工具套件」→「追逐战追踪器」或 Shift+C 打开。", "Show the panel when a chase is running; when off, open it from Tools Suite → Chase Tracker or Shift+C.")}`, tog("chase.autoOpen", ls.autoOpen))}
  `;
}

const CHASE_LOCAL_KEYS = new Set<keyof ChaseLocalSettings>(["autoSelect", "autoOpen"]);
const CHASE_ROOM_KEYS = new Set<keyof ChaseRoomSettings>(["step", "unit", "playerView", "playerMove"]);

// --- Wiring ----------------------------------------------------------------

type Writer = (field: string, value: unknown) => Promise<void> | void;

function writerFor(ns: string, isGM: boolean): Writer | null {
  if (ns === "stt") {
    return async (field, value) => {
      if (STT_LOCAL_KEYS.has(field as keyof SttLocalSettings)) setSttLocal({ [field]: value });
      else if (STT_ROOM_KEYS.has(field as keyof SttRoomSettings) && isGM) await setSttRoom({ [field]: value });
    };
  }
  if (ns === "chase") {
    return async (field, value) => {
      if (CHASE_LOCAL_KEYS.has(field as keyof ChaseLocalSettings)) setChaseLocalSettings({ [field]: value });
      else if (CHASE_ROOM_KEYS.has(field as keyof ChaseRoomSettings) && isGM) await setChaseRoomSettings({ [field]: value });
    };
  }
  return null;
}

/** Numbers stay numbers ("5" → 5) for numeric settings. */
function parseVal(field: string, raw: string): unknown {
  if (field === "rotateSec" || field === "step") return Number(raw);
  return raw;
}

/** Wire every [data-opt] control under `root`. `rerender` redraws the
 *  tab after a change that affects other controls' state. */
export function wireModuleOptions(root: HTMLElement, isGM: boolean, rerender: () => void): void {
  const split = (opt: string) => {
    const i = opt.indexOf(".");
    return { ns: opt.slice(0, i), field: opt.slice(i + 1) };
  };

  root.querySelectorAll<HTMLElement>(".mode-switch[data-opt]").forEach((box) => {
    const { ns, field } = split(box.dataset.opt ?? "");
    const write = writerFor(ns, isGM);
    if (!write) return;
    box.querySelectorAll<HTMLButtonElement>("button[data-val]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await write(field, parseVal(field, btn.dataset.val ?? ""));
        rerender();
      });
    });
  });

  root.querySelectorAll<HTMLButtonElement>("button.tog[data-opt]").forEach((btn) => {
    const { ns, field } = split(btn.dataset.opt ?? "");
    const write = writerFor(ns, isGM);
    if (!write) return;
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      await write(field, !btn.classList.contains("on"));
      rerender();
    });
  });

  root.querySelectorAll<HTMLInputElement>('input[type="range"][data-opt]').forEach((input) => {
    const { ns, field } = split(input.dataset.opt ?? "");
    const write = writerFor(ns, isGM);
    if (!write) return;
    const label = root.querySelector<HTMLElement>(`[data-opt-val="${input.dataset.opt}"]`);
    // Live: the map chips resize while dragging (storage event).
    input.addEventListener("input", () => {
      const n = Math.round(Number(input.value) * 20) / 20;
      if (!Number.isFinite(n)) return;
      if (label) label.textContent = `${n.toFixed(2)}×`;
      void write(field, n);
    });
  });
}

/** Load both room settings into their caches; `onChange` runs when the
 *  GM (in this or another client) changes either. */
export async function initModuleOptionSettings(onChange: () => void): Promise<void> {
  await initSttRoom(onChange);
  await initChaseRoomSettings(onChange);
}
