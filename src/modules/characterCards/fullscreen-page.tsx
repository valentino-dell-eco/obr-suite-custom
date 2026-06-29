import { render, createContext } from "preact";
import {
  useEffect,
  useState,
  useMemo,
  useCallback,
  useContext,
  useRef,
} from "preact/hooks";
import OBR from "@owlbear-rodeo/sdk";
import { fireQuickRoll } from "../dice/tags";
import { subscribeToSfx } from "../dice/sfx-broadcast";
import { patchBubbles } from "../../utils/statEdit";
import { normalizeCombatGearFlags, readBooleanFlag } from "./data-normalize";
import { reconcileUploadedCardShieldState } from "./xlsx-shield-state";
import { t } from "../../i18n";
import { getLocalLang, onLangChange, type Language } from "../../state";

// [CC-FLOW] Module-evaluation marker for the fullscreen iframe document.
// Compare the timestamp of this log against "[CC-FLOW] index.ts module
// EVALUATED" in the main extension document's console (open BOTH
// consoles — they're separate documents/contexts). If this fires but
// you never see "[CC-FLOW] setupCharacterCards() CALLED" anywhere,
// the module is loaded but its setup function was never invoked —
// that's the actual bug, not a timing race.
console.log(
  "%c[CC-FLOW] fullscreen-page.tsx module EVALUATED",
  "color: #fa0; font-weight: bold",
  { href: location.href, time: new Date().toISOString() },
);

// i18n — this is a deeply nested Preact tree, so rather than thread a
// `lang` prop through every section we keep a module-level `_lang` that
// `T()` reads fresh. The root <App/> mirrors its `lang` state into
// `_lang` at the top of each render (parent renders before children, so
// children + module-level render helpers see the current value) and
// re-renders the whole tree on a language flip via onLangChange.
let _lang: Language = (() => {
  try {
    return (getLocalLang() as Language) ?? "en";
  } catch {
    return "en";
  }
})();
const T = (k: Parameters<typeof t>[1]) => t(_lang, k);

// Token-binding metadata key — must mirror modules/characterCards/index.ts
// so we can locate every token in the scene that's bound to the
// currently-open card. Used by the StatsBanner edit handlers to push
// HP / AC changes through to the bubbles plugin.
const BIND_META_KEY = "com.character-cards/boundCardId";

// 2026-05-14 (#14 f2) — inline SVG glyphs for the 复制 / 粘贴 micro
// sub-buttons. `currentColor` so they inherit the button text colour
// (white/ink in the modernized palette). 13×13 viewport, 2px stroke
// — reads cleanly at the button's small size without an emoji's
// platform-dependent rendering.
const ICON_COPY =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<rect x="9" y="9" width="13" height="13" rx="2"/>' +
  '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
  "</svg>";
const ICON_PASTE =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
  '<rect x="8" y="2" width="8" height="4" rx="1"/>' +
  "</svg>";

const LS_MEASURE_KEY = "obr-suite/measure-system";

type MeasureSystem = "imperial" | "metric";

function getMeasureSystem(): MeasureSystem {
  try {
    const v = localStorage.getItem(LS_MEASURE_KEY);
    return v === "metric" ? "metric" : "imperial"; // default imperial
  } catch {
    return "imperial";
  }
}

function setMeasureSystem(s: MeasureSystem): void {
  try {
    localStorage.setItem(LS_MEASURE_KEY, s);
  } catch {}
}

function quickRoll(
  expression: string,
  label: string = "",
  mode?: "adv" | "dis",
) {
  let finalExpr = expression.trim();

  if (mode === "adv") {
    finalExpr = `adv(${finalExpr})`;
  } else if (mode === "dis") {
    finalExpr = `dis(${finalExpr})`;
  }

  try {
    window.parent.postMessage(
      {
        type: "cc-roll-dice",
        payload: {
          expression: finalExpr,
          label: label.trim(),
        },
      },
      "*",
    );
  } catch (e) {
    console.error("[cc-fullscreen] quickRoll failed", e);
  }
}

// Converte un peso in lb verso l'unità corrente.
function fmtWeight(lbs: number | null | undefined, qty: number = 1): string {
  if (lbs == null || lbs === 0) return "";
  const totalLbs = lbs * qty;
  const sys = getMeasureSystem();

  if (sys === "metric") {
    const kg = totalLbs * 0.453592;
    return kg < 1 ? kg.toFixed(2) : kg.toFixed(1);
  }
  return totalLbs.toFixed(1); // mostra anche i decimali in imperial se necessario
}

// Converte una distanza in ft verso l'unità corrente.
function fmtDistance(ft: number | null | undefined): string {
  if (ft == null) return "?";
  if (ft <= 0) return "0";

  const sys = getMeasureSystem();

  if (sys === "metric") {
    const meters = ft * 0.3048;
    // Arrotonda per difetto al multiplo più vicino di 1.5 m
    const rounded = Math.floor(meters / 1.5) * 1.5;
    return rounded % 1 === 0
      ? rounded.toFixed(0) // es: 6
      : rounded.toFixed(1); // es: 4.5
  } else {
    // Imperial: arrotonda per difetto al multiplo di 5 feet
    const rounded = Math.floor(ft / 5) * 5;
    return rounded.toString();
  }
}
// Click a spell / feature / feat name → fire BC_SEARCH_QUERY so the
// global-search popover opens with that name pre-filled and auto-pins
// the first hit. LOCAL only — sending REMOTE causes every receiving
// client to also open their own search.
function fireNameSearch(q: string): void {
  const trimmed = (q || "").trim();
  if (!trimmed) return;

  if (!OBR.isReady) {
    console.warn("[fireNameSearch] OBR not ready");
    return;
  }

  try {
    OBR.broadcast.sendMessage(
      "com.obr-suite/search-query",
      { q: trimmed, autoPin: true },
      { destination: "LOCAL" },
    );
  } catch (e) {
    console.warn("[fireNameSearch] failed", e);
  }
}

// ============================================================
// Full-screen character card v2 — data-driven Preact renderer
// ============================================================
//
// Replaces the legacy server-rendered Jinja2 HTML iframe (which was
// hard to wire to live data). This component:
//
//   1. Reads /characters/<roomId>/<cardId>/data.json directly.
//   2. Renders every section the parser produces — identity, stats,
//      abilities + skills, defenses, combat (weapons/armor),
//      spellcasting (slots + spells with tooltip details), features
//      (class/race/feats/special abilities/wondrous items), background
//      story blocks, inventory (currency + encumbrance + items).
//   3. Inline-edits HP/temp HP/AC via local in-memory state and a
//      future-friendly onPatch hook (server PUT path is hooked but
//      stubbed for tonight's iteration).
//   4. Export → downloads the current data.json. Import → uploads a
//      JSON file and replaces the local cache (server persistence
//      pending a /api/character/<room>/<card>/data PUT endpoint).
//
// Palette matches the rest of the suite (cluster, settings, dice
// panel) — dark navy charcoal canvas, signature amber #f5a623 for
// character names + section headers, warm gold for stat values,
// soft red for HP, muted teal for saves, sky blue for clickable
// affordances (used sparingly). Reads as "more suite", not a
// third-party widget.

const SERVER_ORIGIN = "https://obr.dnd.center";

// Broadcast id mirrored from panel-page.ts. When any client uploads,
// refreshes, or imports a card data.json, it sends BC_CARD_UPDATED so
// every other client viewing the same cardId can re-fetch and stay in
// sync without a manual refresh.
const BC_CARD_UPDATED = "com.obr-suite/cc-card-updated";

// 2026-06 — mirrored from panel-page.ts's FULLSCREEN_MODAL_ID. This
// document is now opened as its own OBR.modal (selectCard in
// panel-page.ts) rather than a nested <iframe>; the "back to list"
// button below closes this exact modal id to return to cc-panel.html.
const FULLSCREEN_MODAL_ID = "com.obr-suite/cc-fullscreen";

// ===== Types ================================================
interface CharacterData {
  schema_version?: string;
  meta?: any;
  identity?: any;
  classes?: any[];
  total_level?: number;
  abilities?: Record<string, any>;
  core_stats?: any;
  defenses?: any;
  skills?: any[];
  combat?: any;
  spellcasting?: any;
  features?: any;
  background?: any;
  inventory?: any;
  exports?: any;
  owners_id?: string[];
}

// ===== Const tables ==========================================
const ABL_ORDER = ["str", "dex", "con", "int", "wis", "cha"] as const;
const ABL_LABEL_ZH: Record<string, string> = {
  str: "力量",
  dex: "敏捷",
  con: "体质",
  int: "智力",
  wis: "感知",
  cha: "魅力",
};
const ABL_LABEL_EN: Record<string, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};
const ABL_ABBR_ZH: Record<string, string> = {
  str: "力",
  dex: "敏",
  con: "体",
  int: "智",
  wis: "感",
  cha: "魅",
};
const ABL_ABBR_EN: Record<string, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};
const ablLabel = (k: string): string =>
  (_lang === "en" ? ABL_LABEL_EN : ABL_LABEL_ZH)[k] ?? k;
const ablAbbr = (k: string): string =>
  (_lang === "en" ? ABL_ABBR_EN : ABL_ABBR_ZH)[k] ?? k;

// 2026-05-14 (#14 follow-up) — tab structure reduced to 4 per user
// request. 战斗 (CombatSection) and 装备 (InventorySection) now live
// inside the 概览 tab below 防御 — overview becomes the
// "everything-at-a-glance" home, and only the long-form sections
// (法术 / 特性 / 背景) get their own dedicated tabs.
type TabKey = "overview" | "spells" | "features" | "background";

const TABS: { key: TabKey; labelKey: Parameters<typeof t>[1] }[] = [
  { key: "overview", labelKey: "ccTabOverview" },
  { key: "spells", labelKey: "ccTabSpells" },
  { key: "features", labelKey: "ccTabFeatures" },
  { key: "background", labelKey: "ccTabBackground" },
];

// ===== Helpers ===============================================
function fmtMod(n: unknown): string {
  if (typeof n !== "number") return "?";
  return n >= 0 ? `+${n}` : `${n}`;
}
function getQS(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

// ===== Edit-mode infrastructure (#14) =====
interface EditState {
  editing: boolean;
  data: CharacterData;
  onPatch: (patch: Partial<CharacterData>) => void;
}
const EditCtx = createContext<EditState | null>(null);
function useEdit(): EditState {
  const ctx = useContext(EditCtx);
  if (!ctx) {
    return { editing: false, data: {} as CharacterData, onPatch: () => {} };
  }
  return ctx;
}

function EditNum({
  value,
  onSet,
  fallback = "?",
  className = "",
  suffix = "",
}: {
  value: number | null | undefined;
  onSet: (n: number) => void;
  fallback?: string;
  className?: string;
  suffix?: string;
}) {
  const { editing } = useEdit();
  if (editing) {
    return (
      <input
        class={`cc-edit-num ${className}`}
        type="number"
        value={value ?? ""}
        onInput={(e: any) => {
          const v = e.target.value;
          if (v === "") return;
          const n = parseFloat(v);
          if (Number.isFinite(n)) onSet(n);
        }}
      />
    );
  }
  return (
    <span class={className}>
      {value ?? fallback}
      {suffix}
    </span>
  );
}

function smoothScrollToNewRow(
  ev: Event | undefined,
  rowSelector: string,
): void {
  const host = (ev?.currentTarget as HTMLElement | null)?.closest(
    ".sec",
  ) as HTMLElement | null;
  if (!host) return;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const rows = host.querySelectorAll(rowSelector);
      const last = rows[rows.length - 1] as HTMLElement | undefined;
      last?.scrollIntoView({ behavior: "smooth", block: "center" });
    }),
  );
}

// Spell pick modal helpers...
interface SpellEntry {
  label: string;
  en: string;
}
let _spellNamesCache: SpellEntry[] | null = null;
async function loadSpellNames(): Promise<SpellEntry[]> {
  if (_spellNamesCache) return _spellNamesCache;
  let bases: string[] = [];
  try {
    const { getState } = await import("../../state");
    const libs = ((getState() as any).libraries || []) as any[];
    bases = libs
      .filter(
        (l) =>
          l && l.enabled && typeof l.baseUrl === "string" && l.baseUrl.trim(),
      )
      .map((l) => String(l.baseUrl).replace(/\/+$/, ""));
  } catch {}
  if (bases.length === 0) bases = ["https://5e.kiwee.top"];
  const byLabel = new Map<string, string>();
  await Promise.all(
    bases.map(async (base) => {
      try {
        const res = await fetch(`${base}/search/index.json`, {
          cache: "force-cache",
        });
        if (!res.ok) return;
        const idx = await res.json();
        const arr = Array.isArray(idx?.x) ? idx.x : [];
        for (const e of arr) {
          if (!e || e.c !== 2) continue;
          const en = typeof e.n === "string" ? e.n.trim() : "";
          const cn = typeof e.cn === "string" ? e.cn.trim() : "";
          const label = cn || en;
          if (label && !byLabel.has(label)) byLabel.set(label, en);
        }
      } catch {}
    }),
  );
  _spellNamesCache = [...byLabel.entries()]
    .map(([label, en]) => ({ label, en }))
    .sort((a, b) => a.label.localeCompare(b.label, "zh"));
  return _spellNamesCache;
}

function EditText({
  value,
  onSet,
  fallback = "—",
  placeholder = "",
  className = "",
}: {
  value: string | null | undefined;
  onSet: (s: string) => void;
  fallback?: string;
  placeholder?: string;
  className?: string;
}) {
  const { editing } = useEdit();
  if (editing) {
    return (
      <input
        class={`cc-edit-text ${className}`}
        type="text"
        value={value ?? ""}
        placeholder={placeholder}
        onInput={(e: any) => onSet(e.target.value)}
      />
    );
  }
  return <span class={className}>{value || fallback}</span>;
}

function downloadJson(filename: string, data: any) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ===== Subcomponents =========================================
function Header({
  data,
  onExport,
  onCopyJson,
  onImport,
  onPasteJson,
  onRefresh,
  onBackToList,
  editing,
  onToggleEditing,
  showOwnersDropdown,
  toggleOwnersDropdown,
  checkCoreData,
  setShowOwnersModal,
  ownersLoading,
  isGM,
  onSaveEdits,
  savingEdits,
  canEdit,
}: {
  data: CharacterData;
  onExport: () => void;
  onCopyJson: () => void;
  onImport: () => void;
  onPasteJson: () => void;
  onRefresh: () => void;
  onBackToList: () => void;
  editing: boolean;
  onToggleEditing: () => void;
  onSaveEdits: () => void;
  savingEdits: boolean;
  canEdit: boolean;
  isGM: boolean;
  showOwnersDropdown: boolean;
  toggleOwnersDropdown: () => void;
  checkCoreData: () => Promise<boolean>;
  setShowOwnersModal: (boolean: any) => void;
  ownersLoading: boolean;
}) {
  const id = data.identity || {};
  const cs = data.core_stats || {};
  const name = id.display_name || id.character_name || T("ccUnnamed");
  const englishName =
    id.character_name &&
    id.display_name &&
    id.character_name !== id.display_name
      ? id.character_name
      : null;

  const cls =
    (data.classes || [])
      .filter((c) => c?.name)
      .map(
        (c) =>
          `${c.name}${c.subclass ? `（${c.subclass}）` : ""}${c.level ? ` Lv${c.level}` : ""}`,
      )
      .join(" / ") || "—";

  // 2026-06 — "back to list" button labels. T("ccBackToList"...) is
  // the long-term home for these once the central i18n dictionary
  // (../../i18n, not part of this file) gets the two new keys added.
  // Until then, this safe fallback avoids ever rendering a raw
  // "ccBackToList" key string or throwing if t() doesn't recognize it.
  const backToListLabel = (() => {
    try {
      const v = T("ccBackToList" as any);
      if (v && v !== "ccBackToList") return v;
    } catch {}
    return _lang === "zh" ? "返回列表" : "Back to list";
  })();
  const backToListTitle = (() => {
    try {
      const v = T("ccBackToListTitle" as any);
      if (v && v !== "ccBackToListTitle") return v;
    } catch {}
    return _lang === "zh" ? "返回角色卡列表" : "Return to the card list";
  })();

  const race =
    [id.race?.name, id.race?.subrace].filter(Boolean).join("·") || "—";
  const totalLv = data.total_level != null ? data.total_level : "?";
  const [measureSys, setMeasureSys] = useState<MeasureSystem>(getMeasureSystem);

  function toggleMeasure() {
    const next: MeasureSystem =
      measureSys === "imperial" ? "metric" : "imperial";
    setMeasureSystem(next);
    setMeasureSys(next);
  }

  return (
    <div class="cc-head">
      <div class="cc-head-left">
        <div class="cc-head-name">
          {name}
          {englishName && <span class="en">{englishName}</span>}
        </div>
        <div class="cc-head-meta">
          <span class="pip">
            <b>{race}</b>
          </span>
          <span class="pip">
            <b>{cls}</b>
          </span>
          <span class="pip">
            {T("ccTotalLevel")} <b>{totalLv}</b>
          </span>
          {id.alignment && (
            <span class="pip">
              {T("ccAlignment")} <b>{id.alignment}</b>
            </span>
          )}
          {cs.size && (
            <span class="pip">
              {T("ccSize")} <b>{cs.size}</b>
            </span>
          )}
          {id.faith && (
            <span class="pip">
              {T("ccFaith")} <b>{id.faith}</b>
            </span>
          )}
        </div>
      </div>
      <div class="cc-head-right">
        {/* <button
          class="cc-btn"
          onClick={onBackToList}
          title={backToListTitle}
          style={{ marginRight: "4px" }}
        >
          <span class="ic">←</span>
          {backToListLabel}
        </button> */}
        <button
          class="cc-btn"
          onClick={toggleMeasure}
          title={
            measureSys === "imperial"
              ? "Switch to Metric"
              : "Switch to Imperial"
          }
        >
          {measureSys === "imperial" ? "🇺🇸 lbs / ft" : "🌍 kg / m"}
        </button>
        {canEdit && (
          <button
            class={`cc-btn ${editing ? "primary" : ""}`}
            onClick={onToggleEditing}
            title={editing ? T("ccEditTitleOn") : T("ccEditTitleOff")}
          >
            <span class="ic">{editing ? "✎" : "🔧"}</span>
            {editing ? T("ccEditingLabel") : T("ccEditLabel")}
          </button>
        )}
        {canEdit && editing && (
          <button
            class="cc-btn primary"
            onClick={onSaveEdits}
            disabled={savingEdits}
            title={T("ccSaveTitle")}
          >
            <span class="ic">💾</span>
            {savingEdits ? T("ccSaving") : T("ccSaveBtn")}
          </button>
        )}
        {isGM && editing && (
          <button
            onClick={async () => {
              const success = await checkCoreData();
              setShowOwnersModal(true); // apri comunque (anche se fallisce)
            }}
            class="cc-btn"
            style={{
              backgroundColor: "#5c4dff",
              color: "white",
              fontWeight: "bold",
              marginLeft: "8px",
              marginRight: "8px",
              border: "2px solid #7c6eff",
            }}
            disabled={ownersLoading}
          >
            👥 {ownersLoading ? "LOADING..." : "MANAGE OWNERS"}
            {showOwnersDropdown ? "▲" : "▼"}
          </button>
        )}
        <button class="cc-btn" onClick={onRefresh} title={T("ccRefreshTitle")}>
          {T("ccRefresh")}
        </button>
        <div class="cc-btn-group">
          {canEdit && (
            <button
              class="cc-btn"
              onClick={onExport}
              title={T("ccExportTitle")}
            >
              {T("ccExportJson")}
            </button>
          )}
          {canEdit && (
            <button
              class="cc-btn cc-btn-sub"
              onClick={onCopyJson}
              title={T("ccCopyTitle")}
            >
              <span
                class="ic"
                dangerouslySetInnerHTML={{ __html: ICON_COPY }}
              />
            </button>
          )}
        </div>
        {canEdit && (
          <div class="cc-btn-group">
            <button
              class="cc-btn"
              onClick={onImport}
              title={T("ccImportTitle")}
            >
              {T("ccImportJson")}
            </button>
            <button
              class="cc-btn cc-btn-sub"
              onClick={onPasteJson}
              title={T("ccPasteTitle")}
            >
              <span
                class="ic"
                dangerouslySetInnerHTML={{ __html: ICON_PASTE }}
              />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// 2026-05-14 — paste-JSON modal. Opened from the header's 「仅粘贴」
// button. Textarea + Apply / Cancel buttons. The Apply callback
// returns a status string (null = success, close the modal; non-null
// = error/warning, keep modal open and show inline). Designed to live
// inside the fullscreen panel (which is itself an OBR.modal full-
// screen iframe) — we render an absolute-positioned overlay rather
// than nest another OBR.modal which would compete with the parent.
function PasteJsonModal({
  onCancel,
  onApply,
}: {
  onCancel: () => void;
  onApply: (text: string) => Promise<string | null>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const submit = useCallback(async () => {
    if (busy) return;
    if (!text.trim()) {
      setStatus(T("ccPasteEmpty"));
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const result = await onApply(text);
      if (result) setStatus(result);
    } finally {
      setBusy(false);
    }
  }, [text, busy, onApply]);

  // Esc to cancel, Ctrl+Enter to apply — keyboard shortcuts that match
  // common "paste then confirm" muscle memory.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void submit();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onCancel, submit]);

  // Inline styles keep this modal self-contained (we don't want to
  // wire CSS into the global cc-fullscreen.html for a transient
  // dialog). The backdrop click cancels; clicks inside the dialog
  // stop propagation so the user can drag-select text without
  // dismissing.
  return (
    <div
      style={{
        position: "fixed",
        inset: "0",
        background: "rgba(0,0,0,0.55)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--surface-2, #1e1d1a)",
          border: "1px solid var(--border-strong, #4a4640)",
          borderRadius: "8px",
          padding: "16px 18px",
          width: "min(720px, 92vw)",
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: "10px",
            justifyContent: "space-between",
          }}
        >
          <h3
            style={{
              margin: 0,
              fontSize: "15px",
              color: "var(--gold, #d4a056)",
            }}
          >
            {T("ccPasteModalTitle")}
          </h3>
          <span style={{ fontSize: "11px", color: "var(--ink-dim, #8a8479)" }}>
            {T("ccPasteKbdHint")}
          </span>
        </div>
        <textarea
          autofocus
          value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          placeholder={T("ccPastePlaceholder")}
          spellcheck={false}
          style={{
            flex: "1 1 auto",
            minHeight: "260px",
            maxHeight: "60vh",
            resize: "vertical",
            background: "var(--bg, #161513)",
            color: "var(--ink, #e8e3d8)",
            border: "1px solid var(--border, #3a352f)",
            borderRadius: "4px",
            padding: "8px 10px",
            fontFamily: "'Cascadia Code', 'Consolas', monospace",
            fontSize: "12px",
            lineHeight: "1.45",
            outline: "none",
          }}
        />
        {status && (
          <div
            style={{
              fontSize: "12px",
              padding: "8px 10px",
              background: status.startsWith("✓")
                ? "rgba(80,180,80,0.12)"
                : "rgba(220,90,80,0.12)",
              border: `1px solid ${status.startsWith("✓") ? "rgba(80,180,80,0.4)" : "rgba(220,90,80,0.4)"}`,
              borderRadius: "4px",
              whiteSpace: "pre-wrap",
              color: "var(--ink, #e8e3d8)",
            }}
          >
            {status}
          </div>
        )}
        <div
          style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}
        >
          <button class="cc-btn" onClick={onCancel} disabled={busy}>
            {T("ccCancel")}
          </button>
          <button
            class="cc-btn primary"
            onClick={submit}
            disabled={busy || !text.trim()}
          >
            {busy ? T("ccApplying") : T("ccApply")}
          </button>
        </div>
      </div>
    </div>
  );
}

// 2026-05-14 (#14 f2) — spell pick modal. Replaces the old
// window.prompt() with a proper in-panel dialog: a name input that
// live-filters the suite library's spell list, plus a "直接添加" row
// for arbitrary names not in any enabled library. Per user spec,
// spell DETAIL (description / components / range / etc.) is NOT
// stored on the card any more — the cc card just records the spell's
// name + level and leaves the lookup to the library. Picking a spell
// returns its name; SpellsSection assigns the level.
function SpellPickModal({
  title,
  onCancel,
  onPick,
}: {
  title: string;
  onCancel: () => void;
  onPick: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [spells, setSpells] = useState<SpellEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await loadSpellNames();
        if (!cancelled) {
          setSpells(list);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setLoadError(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onCancel]);

  // Match against BOTH the Chinese label and the English name so the
  // user can type either. Display is always the label (cn preferred).
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return spells.slice(0, 60);
    return spells
      .filter(
        (s) =>
          s.label.toLowerCase().includes(q) || s.en.toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [query, spells]);

  return (
    <div class="cc-modal-backdrop" onClick={onCancel}>
      <div class="cc-modal" onClick={(e) => e.stopPropagation()}>
        <div class="cc-modal-h">
          <h3>{title}</h3>
          <span class="cc-modal-hint">{T("ccSpellModalHint")}</span>
        </div>
        <input
          class="cc-edit-text"
          autofocus
          style={{
            width: "100%",
            marginBottom: "8px",
            padding: "7px 10px",
            fontSize: "13px",
          }}
          placeholder={T("ccSpellSearchPh")}
          value={query}
          onInput={(e: any) => setQuery(e.target.value)}
        />
        <div class="cc-modal-list">
          {query.trim() && (
            <button
              class="cc-modal-row cc-modal-row-free"
              onClick={() => onPick(query.trim())}
            >
              {T("ccSpellAddFree").replace("{q}", query.trim())}
            </button>
          )}
          {loading && <div class="cc-modal-msg">{T("ccSpellLoading")}</div>}
          {loadError && <div class="cc-modal-msg">{T("ccSpellLoadErr")}</div>}
          {!loading &&
            matches.map((s) => (
              <button class="cc-modal-row" onClick={() => onPick(s.label)}>
                <span>{s.label}</span>
                {s.en && s.en !== s.label && (
                  <span class="cc-modal-row-en">{s.en}</span>
                )}
              </button>
            ))}
          {!loading && !loadError && matches.length === 0 && query.trim() && (
            <div class="cc-modal-msg">{T("ccSpellNoMatch")}</div>
          )}
        </div>
        <div class="cc-modal-foot">
          <button class="cc-btn" onClick={onCancel}>
            {T("ccCancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatsBanner({
  data,
  onPatch,
}: {
  data: CharacterData;
  onPatch: (patch: Partial<CharacterData>) => void;
}) {
  const { editing } = useEdit();
  const cs = data.core_stats || {};
  const hp = cs.hp || {};
  const hd = cs.hit_dice || {};

  const setHp = (which: "current" | "max" | "temp", val: string) => {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n)) return;
    const next = { ...hp, [which]: n };
    onPatch({ core_stats: { ...cs, hp: next } });
  };
  const setAc = (val: string) => {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n)) return;
    onPatch({ core_stats: { ...cs, ac: n } });
  };
  const setHdCur = (val: string) => {
    const n = parseInt(val, 10);
    if (!Number.isFinite(n)) return;
    onPatch({ core_stats: { ...cs, hit_dice: { ...hd, current: n } } });
  };
  // 2026-05-14 (#14) — edit-mode helpers for the remaining stat cells
  // (initiative / speed / passive perception / proficiency / hit-dice
  // max + die-size). All single-field patches on core_stats.
  const setCs = (patch: Record<string, any>) =>
    onPatch({ core_stats: { ...cs, ...patch } });
  const setHd = (patch: Record<string, any>) =>
    onPatch({ core_stats: { ...cs, hit_dice: { ...hd, ...patch } } });

  return (
    <div class="cc-stats">
      <div class="stat-cell hp">
        <div class="stat-cell-label">HP</div>
        <div class="stat-cell-val">
          <input
            class="stat-input big"
            value={hp.current ?? 0}
            onChange={(e: any) => setHp("current", e.target.value)}
          />
          <span class="slash">/</span>
          <input
            class="stat-input small"
            value={hp.max ?? 0}
            onChange={(e: any) => setHp("max", e.target.value)}
          />
        </div>
      </div>
      <div class="stat-cell">
        <div class="stat-cell-label">{T("ccTemp")}</div>
        <div class="stat-cell-val">
          <input
            class="stat-input big"
            value={hp.temp ?? 0}
            onChange={(e: any) => setHp("temp", e.target.value)}
          />
        </div>
      </div>
      <div class="stat-cell ac">
        <div class="stat-cell-label">AC</div>
        <div class="stat-cell-val">
          <input
            class="stat-input big"
            value={cs.ac ?? 10}
            onChange={(e: any) => setAc(e.target.value)}
          />
        </div>
      </div>
      <div class="stat-cell init">
        <div class="stat-cell-label">{T("ccInit")}</div>
        <div class="stat-cell-val">
          {editing ? (
            <input
              class="stat-input big"
              type="number"
              value={cs.initiative ?? 0}
              onInput={(e: any) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setCs({ initiative: n });
              }}
            />
          ) : (
            <span class="big">{fmtMod(cs.initiative)}</span>
          )}
        </div>
      </div>
      <div class="stat-cell">
        <div class="stat-cell-label">{T("ccSpeed")}</div>
        <div class="stat-cell-val">
          {editing ? (
            <input
              class="stat-input big"
              type="number"
              value={cs.speed ?? 0}
              onInput={(e: any) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setCs({ speed: n });
              }}
            />
          ) : (
            <span>{fmtDistance(cs.speed)}</span>
          )}
          <span class="unit">
            {" "}
            {getMeasureSystem() === "metric" ? T("ccMUnit") : T("ccFtUnit")}
          </span>
        </div>
      </div>
      <div class="stat-cell">
        <div class="stat-cell-label">{T("ccPassivePerc")}</div>
        <div class="stat-cell-val">
          {editing ? (
            <input
              class="stat-input big"
              type="number"
              value={cs.passive_perception ?? 0}
              onInput={(e: any) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setCs({ passive_perception: n });
              }}
            />
          ) : (
            <span class="big">{cs.passive_perception ?? "?"}</span>
          )}
        </div>
      </div>
      <div class="stat-cell">
        <div class="stat-cell-label">{T("ccProf")}</div>
        <div class="stat-cell-val">
          {editing ? (
            <input
              class="stat-input big"
              type="number"
              value={cs.proficiency_bonus ?? 0}
              onInput={(e: any) => {
                const n = parseInt(e.target.value, 10);
                if (Number.isFinite(n)) setCs({ proficiency_bonus: n });
              }}
            />
          ) : (
            <span class="big">{fmtMod(cs.proficiency_bonus)}</span>
          )}
        </div>
      </div>
      <div class="stat-cell">
        <div class="stat-cell-label">{T("ccHitDice")}</div>
        <div class="stat-cell-val">
          <input
            class="stat-input big"
            value={hd.current ?? 0}
            onChange={(e: any) => setHdCur(e.target.value)}
          />
          <span class="slash">/</span>
          {editing ? (
            <>
              <input
                class="stat-input small"
                type="number"
                value={hd.max ?? 0}
                onInput={(e: any) => {
                  const n = parseInt(e.target.value, 10);
                  if (Number.isFinite(n)) setHd({ max: n });
                }}
              />
              <input
                class="stat-input small"
                type="text"
                style={{ width: "44px" }}
                placeholder="d8"
                value={hd.die_size ?? ""}
                onInput={(e: any) => setHd({ die_size: e.target.value })}
              />
            </>
          ) : (
            <span class="small">
              {hd.max ?? "?"}
              {hd.die_size ?? ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function rollExpr(label: string, expr: string, advMode?: "adv" | "dis") {
  if (!expr) return;
  fireQuickRoll({ expression: expr, label, advMode });
}

function AbilitiesAndSkills({ data }: { data: CharacterData }) {
  const { editing, onPatch } = useEdit();
  const ab = data.abilities || {};
  const cs = data.core_stats || {};
  const skills = Array.isArray(data.skills) ? data.skills : [];
  const skBy: Record<string, any[]> = {};
  for (const s of skills) (skBy[s.ability] ??= []).push(s);

  // 2026-05-14 (#14 / f3) — edit helpers. We mutate the ability or
  // skill in place via spread + index replacement, then push the
  // whole abilities / skills slice back through onPatch.
  //
  // Proficiency math (#14 f3 fix): toggling a save / skill proficiency
  // dot now RECOMPUTES the bonus / total, not just flips the flag:
  //   save bonus  = ability_mod + (proficient ? prof_bonus : 0)
  //   skill total = ability_mod + prof_bonus × {none:0, prof:1, exp:2}
  //                 (+ any misc_bonus the parser captured)
  // The user can still hand-override the number afterwards via the
  // input — the toggle just sets a correct baseline.
  const profBonus = cs.proficiency_bonus ?? 0;

  const setAbilityScore = (k: string, score: number) => {
    const cur = ab[k] || {};
    const newMod = Math.floor((score - 10) / 2);
    // Re-derive the save bonus too — it's modifier-relative, so a
    // score change should ripple into the save unless the user has
    // hand-set it. We recompute from proficiency state to keep things
    // coherent (matches the toggle behaviour below).
    const save = cur.save || {};
    const newSaveBonus = newMod + (save.proficient ? profBonus : 0);
    onPatch({
      abilities: {
        ...ab,
        [k]: {
          ...cur,
          total: score,
          modifier: newMod,
          save: { ...save, bonus: newSaveBonus },
        },
      },
    });
  };
  const toggleSaveProf = (k: string) => {
    const cur = ab[k] || {};
    const save = cur.save || {};
    const willBeProf = !save.proficient;
    const mod = typeof cur.modifier === "number" ? cur.modifier : 0;
    onPatch({
      abilities: {
        ...ab,
        [k]: {
          ...cur,
          save: {
            ...save,
            proficient: willBeProf,
            bonus: mod + (willBeProf ? profBonus : 0),
          },
        },
      },
    });
  };
  const setSaveBonus = (k: string, bonus: number) => {
    const cur = ab[k] || {};
    const save = cur.save || {};
    onPatch({
      abilities: { ...ab, [k]: { ...cur, save: { ...save, bonus } } },
    });
  };
  const setSkillTotal = (idx: number, total: number) => {
    const next = [...skills];
    next[idx] = { ...next[idx], total };
    onPatch({ skills: next });
  };
  const cycleSkillProf = (idx: number) => {
    // none → proficient → expertise → none
    const order = ["none", "proficient", "expertise"];
    const sk = skills[idx];
    if (!sk) return;
    const cur = sk.proficiency || "none";
    const nextProf = order[(order.indexOf(cur) + 1) % order.length];
    // Recompute total from the skill's ability modifier + proficiency
    // multiplier. mult: none=0, proficient=1, expertise=2.
    const abil = ab[sk.ability] || {};
    const abilMod = typeof abil.modifier === "number" ? abil.modifier : 0;
    const mult =
      nextProf === "expertise" ? 2 : nextProf === "proficient" ? 1 : 0;
    const misc = typeof sk.misc_bonus === "number" ? sk.misc_bonus : 0;
    const total = abilMod + profBonus * mult + misc;
    const next = [...skills];
    next[idx] = { ...next[idx], proficiency: nextProf, total };
    onPatch({ skills: next });
  };

  return (
    <div class="sec">
      <div class="sec-h">
        <span class="sec-h-title">
          {T("ccSecAbilities")}
          {editing ? T("ccSecAbilitiesEditHint") : ""}
        </span>
      </div>
      <div class="sec-body">
        <div class="abl-grid">
          {ABL_ORDER.map((k) => {
            const a = ab[k] || {};
            const mod = typeof a.modifier === "number" ? a.modifier : 0;
            const profBonus = cs.proficiency_bonus ?? 0;
            const saveBonus =
              typeof a.save?.bonus === "number"
                ? a.save.bonus
                : a.save?.proficient
                  ? mod + profBonus
                  : mod;
            const aExpr = `1d20${mod >= 0 ? "+" : ""}${mod}`;
            const sExpr = `1d20${saveBonus >= 0 ? "+" : ""}${saveBonus}`;
            if (editing) {
              return (
                <div class="abl">
                  <div class="abl-name">{ablLabel(k)}</div>
                  <input
                    class="abl-total cc-edit-num"
                    type="number"
                    value={a.total ?? 10}
                    onInput={(e: any) => {
                      const n = parseInt(e.target.value, 10);
                      if (Number.isFinite(n)) setAbilityScore(k, n);
                    }}
                  />
                  <div class="abl-mod" title={T("ccTipAutoMod")}>
                    {fmtMod(a.modifier)}
                  </div>
                  {/* 2026-05-14 (#14 f2) — `abl-save-edit` is a DISTINCT
                      class from `abl-save`, so the CSS ::before that
                      auto-draws a ●/○ on `.abl-save` never fires here.
                      The explicit clickable span below is the ONLY
                      proficiency dot in edit mode — earlier the :has()
                      override didn't take in OBR's iframe runtime, so
                      both the pseudo AND the span rendered (two
                      circles). A separate class is bulletproof. */}
                  <div
                    class={`abl-save-edit ${a.save?.proficient ? "is-prof" : ""}`}
                  >
                    <span
                      class="abl-save-dot"
                      onClick={() => toggleSaveProf(k)}
                      title={T("ccTipToggleSaveProf")}
                    >
                      {a.save?.proficient ? "●" : "○"}
                    </span>
                    <input
                      class="cc-edit-num"
                      type="number"
                      style={{ width: "44px" }}
                      value={a.save?.bonus ?? saveBonus}
                      onInput={(e: any) => {
                        const n = parseInt(e.target.value, 10);
                        if (Number.isFinite(n)) setSaveBonus(k, n);
                      }}
                    />
                  </div>
                </div>
              );
            }
            return (
              <div class="abl">
                <div class="abl-name">{ablLabel(k)}</div>
                <div class="abl-total">{a.total ?? "?"}</div>
                <div
                  class="abl-mod"
                  onClick={() =>
                    quickRoll(aExpr, `${ablLabel(k)}${T("ccCheckSuffix")}`)
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    quickRoll(
                      aExpr,
                      `${ablLabel(k)}${T("ccCheckAdvSuffix")}`,
                      "adv",
                    );
                  }}
                  title={`${ablLabel(k)}${T("ccCheckSuffix")} ${aExpr}\n${T("ccRollHint")}`}
                >
                  {fmtMod(a.modifier)}
                </div>

                <div
                  class={`abl-save ${a.save?.proficient ? "is-prof" : ""}`}
                  onClick={() =>
                    quickRoll(sExpr, `${ablLabel(k)}${T("ccSaveSuffix")}`)
                  }
                  title={`${ablLabel(k)}${T("ccSaveSuffix")} ${sExpr}`}
                >
                  {T("ccSave")} <b>{fmtMod(saveBonus)}</b>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: "12px" }}>
          <div class="sk-list">
            {ABL_ORDER.flatMap((k) => {
              const list = skBy[k] || [];
              return list.map((s) => {
                const idx = skills.indexOf(s);
                const total = typeof s.total === "number" ? s.total : 0;
                const expr = `1d20${total >= 0 ? "+" : ""}${total}`;
                const cls =
                  s.proficiency === "expertise"
                    ? "exp"
                    : s.proficiency === "proficient"
                      ? "prof"
                      : "";
                if (editing) {
                  return (
                    <div class={`sk ${cls}`} style={{ cursor: "default" }}>
                      <span
                        class="sk-prof"
                        style={{ cursor: "pointer" }}
                        onClick={() => cycleSkillProf(idx)}
                        title={T("ccTipCycleSkillProf")}
                      >
                        {cls === "exp" ? "★" : cls === "prof" ? "●" : "○"}
                      </span>
                      <span class="sk-name">{s.name}</span>
                      <span class="sk-abil">{ablAbbr(s.ability) || ""}</span>
                      <input
                        class="cc-edit-num sk-val"
                        type="number"
                        style={{ width: "48px" }}
                        value={s.total ?? 0}
                        onInput={(e: any) => {
                          const n = parseInt(e.target.value, 10);
                          if (Number.isFinite(n)) setSkillTotal(idx, n);
                        }}
                      />
                    </div>
                  );
                }
                return (
                  <div
                    class={`sk ${cls}`}
                    onClick={() =>
                      quickRoll(expr, `${s.name}${T("ccCheckSuffix")}`)
                    }
                    onContextMenu={(e) => {
                      e.preventDefault();
                      quickRoll(
                        expr,
                        `${s.name}${T("ccCheckAdvSuffix")}`,
                        "adv",
                      );
                    }}
                    title={`${s.name}${T("ccCheckSuffix")} ${expr}\n${T("ccRollHint")}`}
                  >
                    <span class="sk-prof">
                      {cls === "exp" ? "★" : cls === "prof" ? "●" : "○"}
                    </span>
                    <span class="sk-name">{s.name}</span>
                    <span class="sk-abil">{ablAbbr(s.ability) || ""}</span>
                    <span class="sk-val">{fmtMod(s.total)}</span>
                  </div>
                );
              });
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Defenses({ data }: { data: CharacterData }) {
  const { editing, onPatch } = useEdit();
  const d = data.defenses || {};
  const id = data.identity || {};
  const langs: string[] = Array.isArray(id.languages) ? id.languages : [];
  const tools: string[] = Array.isArray(id.tool_proficiencies)
    ? id.tool_proficiencies
    : [];

  const empty =
    !d.resistances?.length &&
    !d.immunities?.length &&
    !d.advantages?.length &&
    !d.disadvantages?.length;
  // In edit mode we always render the section (so the user can ADD
  // first entries to empty categories); in view mode we hide it
  // entirely when there's nothing to show.
  if (!editing && empty && !langs.length && !tools.length) return null;

  // 2026-05-14 (#14) — small add/remove helpers per tag category.
  const addTag = (
    cat: "resistances" | "immunities" | "advantages" | "disadvantages",
  ) => {
    const v = (
      window.prompt(
        `${T("ccAddPrefix")}${labelOf(cat)}${T("ccAddTagHint")}`,
        "",
      ) || ""
    ).trim();
    if (!v) return;
    const items = v
      .split(/[,，;；]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) return;
    const cur = Array.isArray((d as any)[cat]) ? (d as any)[cat] : [];
    onPatch({ defenses: { ...d, [cat]: [...cur, ...items] } });
  };
  const removeTag = (
    cat: "resistances" | "immunities" | "advantages" | "disadvantages",
    value: string,
  ) => {
    const cur = Array.isArray((d as any)[cat]) ? (d as any)[cat] : [];
    onPatch({
      defenses: { ...d, [cat]: cur.filter((x: string) => x !== value) },
    });
  };
  const addLangTool = (which: "languages" | "tool_proficiencies") => {
    const v = (
      window.prompt(
        `${T("ccAddPrefix")}${which === "languages" ? T("ccLanguages") : T("ccTools")}`,
        "",
      ) || ""
    ).trim();
    if (!v) return;
    const items = v
      .split(/[,，;；]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) return;
    const cur = Array.isArray((id as any)[which]) ? (id as any)[which] : [];
    onPatch({ identity: { ...id, [which]: [...cur, ...items] } });
  };
  const removeLangTool = (
    which: "languages" | "tool_proficiencies",
    value: string,
  ) => {
    const cur = Array.isArray((id as any)[which]) ? (id as any)[which] : [];
    onPatch({
      identity: { ...id, [which]: cur.filter((x: string) => x !== value) },
    });
  };
  function labelOf(cat: string): string {
    return (
      (
        {
          resistances: T("ccResistances"),
          immunities: T("ccImmunities"),
          advantages: T("ccAdvantages"),
          disadvantages: T("ccDisadvantages"),
        } as Record<string, string>
      )[cat] || cat
    );
  }

  const renderRow = (
    label: string,
    cat: "resistances" | "immunities" | "advantages" | "disadvantages",
    css: string,
  ) => {
    const list = Array.isArray((d as any)[cat]) ? (d as any)[cat] : [];
    if (!editing && list.length === 0) return null;
    return (
      <div class="def-row">
        <span class="def-label">{label}</span>
        {list.map((x: string) => (
          <span class={`def-tag ${css}`}>
            {x}
            {editing && (
              <button
                class="cc-tag-x"
                onClick={() => removeTag(cat, x)}
                title={T("ccRemove")}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {editing && (
          <button
            class="cc-add-tag"
            onClick={() => addTag(cat)}
            title={`${T("ccAddPrefix")}${label}`}
          >
            +
          </button>
        )}
      </div>
    );
  };

  return (
    <div class="sec">
      <div class="sec-h">
        <span class="sec-h-title">{T("ccSecDefenses")}</span>
      </div>
      <div class="sec-body">
        {renderRow(T("ccResistances"), "resistances", "res")}
        {renderRow(T("ccImmunities"), "immunities", "imm")}
        {renderRow(T("ccAdvantages"), "advantages", "adv")}
        {renderRow(T("ccDisadvantages"), "disadvantages", "dis")}
        {(editing || langs.length > 0) && (
          <div class="def-row">
            <span class="def-label">{T("ccLanguages")}</span>
            {langs.map((x) => (
              <span class="def-tag">
                {x}
                {editing && (
                  <button
                    class="cc-tag-x"
                    onClick={() => removeLangTool("languages", x)}
                    title={T("ccRemove")}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {editing && (
              <button
                class="cc-add-tag"
                onClick={() => addLangTool("languages")}
                title={`${T("ccAddPrefix")}${T("ccLanguages")}`}
              >
                +
              </button>
            )}
          </div>
        )}
        {(editing || tools.length > 0) && (
          <div class="def-row">
            <span class="def-label">{T("ccTools")}</span>
            {tools.map((x) => (
              <span class="def-tag">
                {x}
                {editing && (
                  <button
                    class="cc-tag-x"
                    onClick={() => removeLangTool("tool_proficiencies", x)}
                    title={T("ccRemove")}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {editing && (
              <button
                class="cc-add-tag"
                onClick={() => addLangTool("tool_proficiencies")}
                title={`${T("ccAddPrefix")}${T("ccTools")}`}
              >
                +
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CombatSection({ data }: { data: CharacterData }) {
  const { editing, onPatch } = useEdit();
  const cb = data.combat || {};
  const armor = cb.armor || {};
  const shield = cb.shield || {};
  const weapons: any[] = Array.isArray(cb.weapons) ? cb.weapons : [];
  const armorEquipped = readBooleanFlag(armor.equipped);
  const armorAttuned = readBooleanFlag(armor.attuned);
  const shieldEquipped = readBooleanFlag(shield.equipped);
  const shieldAttuned = readBooleanFlag(shield.attuned);

  // 2026-05-14 (#14) — weapon edit helpers. Each weapon is a plain
  // object with name / attack_bonus / damage / damage_type / properties
  // fields. We mutate the array via spread + index replacement.
  const updateWeapon = (idx: number, patch: Record<string, any>) => {
    const next = [...weapons];
    next[idx] = { ...next[idx], ...patch };
    onPatch({ combat: { ...cb, weapons: next } });
  };
  const removeWeapon = (idx: number) => {
    if (
      !window.confirm(
        T("ccConfirmDelWeapon").replace(
          "{name}",
          weapons[idx]?.name || T("ccUnnamed"),
        ),
      )
    )
      return;
    const next = weapons.filter((_, i) => i !== idx);
    onPatch({ combat: { ...cb, weapons: next } });
  };
  const addWeapon = (ev?: Event) => {
    const next = [
      ...weapons,
      {
        name: T("ccNewWeapon"),
        attack_bonus: "+0",
        damage: "1d6",
        damage_type: "",
      },
    ];
    onPatch({ combat: { ...cb, weapons: next } });
    smoothScrollToNewRow(ev, ".weap");
  };
  // 2026-05-14 (#14) — armor/shield edit affordances are NOT exposed
  // in this pass. The schema (ac_base / dex_bonus_cap / weight /
  // equipped / attuned / damage_resistances...) is dense and rarely
  // changes mid-session compared to weapons. For now the user edits
  // these via the paste-JSON modal or the source xlsx.

  return (
    <div class="sec">
      <div class="sec-h">
        <span class="sec-h-title">{T("ccSecCombat")}</span>
        {editing && (
          <button
            class="cc-add-tag"
            style={{ marginLeft: "auto" }}
            onClick={(e: any) => addWeapon(e)}
            title={T("ccAddWeaponTitle")}
          >
            {T("ccAddWeaponBtn")}
          </button>
        )}
      </div>
      <div class="sec-body dense">
        {(armor.name || armor.ac_base != null) && (
          <div class="weap" style={{ background: "rgba(138,111,63,0.06)" }}>
            <div class="weap-name">
              🛡 {armor.name || T("ccArmor")}
              {armorEquipped && (
                <span class="weap-prof">{T("ccEquipped")}</span>
              )}
              {armorAttuned && <span class="weap-prof">{T("ccAttuned")}</span>}
            </div>
            <div class="weap-atk" title={T("ccArmorAcTip")}>
              AC {armor.ac_base ?? "?"}
              {typeof armor.dex_bonus_cap === "number" &&
                ` (+${T("ccDexAbbr")}≤${armor.dex_bonus_cap})`}
            </div>
            <div class="weap-dmg" style={{ visibility: "hidden" }}>
              —
            </div>
            {armor.weight != null && (
              <div class="weap-props">
                {T("ccWeight")} {armor.weight} {T("ccLbUnit")}
              </div>
            )}
          </div>
        )}
        {shield.ac_bonus != null && (
          <div class="weap" style={{ background: "rgba(138,111,63,0.06)" }}>
            <div class="weap-name">
              ⛨ {T("ccShield")}
              <span class={`weap-prof${shieldEquipped ? "" : " is-off"}`}>
                {shieldEquipped ? T("ccEquipped") : T("ccUnequipped")}
              </span>
              {shieldAttuned && <span class="weap-prof">{T("ccAttuned")}</span>}
            </div>
            <div class="weap-atk">+{shield.ac_bonus} AC</div>
            <div class="weap-dmg" style={{ visibility: "hidden" }}>
              —
            </div>
          </div>
        )}
        {weapons.length === 0 && !armor.name && !shield.ac_bonus && (
          <div
            style={{
              color: "var(--ink-mute)",
              fontStyle: "italic",
              padding: "8px",
            }}
          >
            {T("ccNoWeaponsArmor")}
          </div>
        )}
        {weapons.map((w, idx) => {
          const atkMatch = /([+-]?\d+)/.exec(String(w.attack_bonus ?? ""));
          const atkBn = atkMatch ? parseInt(atkMatch[1], 10) : 0;
          const atkExpr = `1d20${atkBn >= 0 ? "+" : ""}${atkBn}`;
          const dmgRaw = String(w.damage ?? "").replace(/\s+/g, "");
          const dmgMatch = /\d*d\d+([+-]\d+)?/.exec(dmgRaw);
          const dmgExpr = dmgMatch ? dmgMatch[0] : dmgRaw;
          if (editing) {
            const extraList: Array<{ damage?: string; damage_type?: string }> =
              Array.isArray(w.extra_damages) ? w.extra_damages : [];
            const updateExtra = (
              exIdx: number,
              patch: Record<string, any>,
            ) => {
              const next = [...extraList];
              next[exIdx] = { ...next[exIdx], ...patch };
              updateWeapon(idx, { extra_damages: next });
            };
            const removeExtra = (exIdx: number) => {
              updateWeapon(idx, {
                extra_damages: extraList.filter((_, i) => i !== exIdx),
              });
            };
            const addExtra = () => {
              updateWeapon(idx, {
                extra_damages: [...extraList, { damage: "", damage_type: "" }],
              });
            };
            return (
              <div class="weap weap-edit-row">
                {/* 2026-06-21 — was a fixed 5-column inline grid
                    ("1.4fr 0.7fr 1fr 1fr auto"), which overflowed a
                    narrow character card: <input> grid items don't
                    shrink below their intrinsic content width, so the
                    fr units couldn't actually compress the row. Layout
                    now lives in CSS (.weap-edit-row / .weap-edit-grid
                    in cc-fullscreen.html) behind an @container query:
                    a tabular row above ~480px of section width, a
                    stacked mini-card with one label per field below
                    it — so every input stays legible and editable no
                    matter how narrow the panel gets. The × button sits
                    outside .weap-edit-grid so it never gets swept into
                    the responsive column set. */}
                <div class="weap-edit-top">
                <div class="weap-edit-grid">
                  <div class="weap-edit-field weap-edit-field-wide">
                    <span class="weap-edit-field-label">
                      {T("ccWeaponNamePh")}
                    </span>
                    <div class="weap-edit-name-row">
                      <input
                        class="cc-edit-text"
                        type="text"
                        value={w.name ?? ""}
                        placeholder={T("ccWeaponNamePh")}
                        onInput={(e: any) =>
                          updateWeapon(idx, { name: e.target.value })
                        }
                      />
                      {/* 2026-06-21 — proficiency checkbox. Drives the
                          "熟练" badge shown in view mode (w.proficient)
                          — no derived math here (attack_bonus / damage
                          stay manual text fields the player types
                          directly), this just records the flag. */}
                      <label
                        class="weap-prof-check"
                        title={T("ccProfShort") || "Proficient"}
                      >
                        <input
                          type="checkbox"
                          checked={!!w.proficient}
                          onChange={(e: any) =>
                            updateWeapon(idx, {
                              proficient: !!e.target.checked,
                            })
                          }
                        />
                        <span>{T("ccProfShort") || "熟练"}</span>
                      </label>
                    </div>
                  </div>
                  <div class="weap-edit-field">
                    <span class="weap-edit-field-label">
                      {T("ccHit")}
                    </span>
                    <input
                      class="cc-edit-text"
                      type="text"
                      value={w.attack_bonus ?? ""}
                      placeholder="+5"
                      onInput={(e: any) =>
                        updateWeapon(idx, { attack_bonus: e.target.value })
                      }
                    />
                  </div>
                  <div class="weap-edit-field">
                    <span class="weap-edit-field-label">
                      {T("ccDamage")}
                    </span>
                    <input
                      class="cc-edit-text"
                      type="text"
                      value={w.damage ?? ""}
                      placeholder="1d8+3"
                      onInput={(e: any) =>
                        updateWeapon(idx, { damage: e.target.value })
                      }
                    />
                  </div>
                  <div class="weap-edit-field">
                    <span class="weap-edit-field-label">
                      {T("ccDmgTypePh")}
                    </span>
                    <input
                      class="cc-edit-text"
                      type="text"
                      value={w.damage_type ?? ""}
                      placeholder={T("ccDmgTypePh")}
                      onInput={(e: any) =>
                        updateWeapon(idx, { damage_type: e.target.value })
                      }
                    />
                  </div>
                  <div class="weap-edit-field weap-edit-field-wide">
                    <span class="weap-edit-field-label">
                      {T("ccPropertiesPh") || "Properties"}
                    </span>
                    <input
                      class="cc-edit-text"
                      type="text"
                      value={w.properties ?? ""}
                      placeholder={
                        T("ccPropertiesPh") ||
                        "e.g. Versatile (1d8), Finesse"
                      }
                      onInput={(e: any) =>
                        updateWeapon(idx, { properties: e.target.value })
                      }
                    />
                  </div>
                  {/* 2026-06-21 — special_properties: a separate,
                      longer free-text field for magical effects /
                      homebrew rules / lore text on the weapon — kept
                      apart from `properties` (which holds short
                      standard tags like "Versatile (1d8)") because
                      this one can run to several sentences. textarea
                      instead of input so multi-line text doesn't get
                      clipped while typing. */}
                  <div class="weap-edit-field weap-edit-field-wide">
                    <span class="weap-edit-field-label">
                      {T("ccSpecialPropertiesPh") || "Special properties"}
                    </span>
                    <textarea
                      class="cc-edit-text weap-special-props-input"
                      value={w.special_properties ?? ""}
                      placeholder={
                        T("ccSpecialPropertiesPh") ||
                        "e.g. magical effects, custom rules, lore…"
                      }
                      onInput={(e: any) =>
                        updateWeapon(idx, {
                          special_properties: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                <button
                  class="cc-tag-x weap-edit-remove"
                  onClick={() => removeWeapon(idx)}
                  title={T("ccDelWeaponTitle")}
                >
                  ×
                </button>
                </div>
                {/* 2026-06-21 — extra damage TYPES (plural). The
                    weapon's base damage stays in `damage`/`damage_type`
                    above; `extra_damages[]` holds any ADDITIONAL damage
                    dice that land alongside the base hit (e.g. a
                    flaming weapon: 1d8 slashing + 1d6 fire). This is
                    separate from the older singular `extra_damage` /
                    `extra_damage_type` fields (still read in view mode
                    below for backward compatibility with weapons saved
                    before this existed) — new edits always write to
                    the plural array. */}
                <div class="weap-extra-list">
                  {extraList.map((ex, exIdx) => (
                    <div class="weap-extra-row">
                      <input
                        class="cc-edit-text"
                        type="text"
                        value={ex.damage ?? ""}
                        placeholder="1d6"
                        onInput={(e: any) =>
                          updateExtra(exIdx, { damage: e.target.value })
                        }
                      />
                      <input
                        class="cc-edit-text"
                        type="text"
                        value={ex.damage_type ?? ""}
                        placeholder={T("ccDmgTypePh")}
                        onInput={(e: any) =>
                          updateExtra(exIdx, { damage_type: e.target.value })
                        }
                      />
                      <button
                        class="cc-tag-x"
                        onClick={() => removeExtra(exIdx)}
                        title={T("ccDelete")}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    class="cc-add-tag weap-extra-add"
                    onClick={addExtra}
                    title={T("ccAddExtraDmgTitle") || "Add extra damage type"}
                  >
                    + {T("ccExtraDamage") || "Extra damage"}
                  </button>
                </div>
              </div>
            );
          }
          return (
            <div class="weap">
              <div class="weap-name">
                ⚔ {w.name || "?"}
                {w.proficient && (
                  <span class="weap-prof">{T("ccProfShort")}</span>
                )}
              </div>
              <div
                class="weap-atk"
                onClick={() =>
                  quickRoll(atkExpr, `${ablLabel(w.name)}${T("ccHit")}`)
                }
                // onContextMenu={(e: any) => {
                //   e.preventDefault();
                //   rollExpr(`${w.name} ${T("ccHitAdv")}`, atkExpr, "adv");
                // }}
                title={`${T("ccRollLR")} · ${atkExpr}`}
              >
                {w.attack_bonus || `${fmtMod(atkBn)}`}
              </div>
              <div
                class="weap-dmg"
                onClick={() =>
                  quickRoll(
                    dmgExpr,
                    `${w.name} ${T("ccDamage")}${w.damage_type ? `(${w.damage_type})` : ""}`,
                  )
                }
                title={`${w.damage} ${w.damage_type ?? ""}`}
              >
                {w.damage ?? "—"}{" "}
                {w.damage_type ? (
                  <span style={{ opacity: 0.7, fontSize: "10px" }}>
                    {w.damage_type}
                  </span>
                ) : (
                  ""
                )}
              </div>
              {/* 2026-06-21 — extra_damages[] (plural) is the new
                  field; extra_damage/extra_damage_type (singular) is
                  kept as a fallback so weapons saved before this
                  change still show their bonus die. We never show
                  both at once for the same weapon — if the plural
                  array has entries, it's the authoritative source. */}
              {Array.isArray(w.extra_damages) && w.extra_damages.length > 0
                ? w.extra_damages.map((ex: any, exIdx: number) => (
                    <div
                      class="weap-dmg weap-dmg-extra"
                      onClick={(e: any) => {
                        e.stopPropagation();
                        quickRoll(
                          String(ex.damage ?? "").replace(/\s+/g, ""),
                          `${w.name} ${T("ccExtraDamage")}${ex.damage_type ? `(${ex.damage_type})` : ""}`,
                        );
                      }}
                      title={`${T("ccExtraDmgDie")} ${ex.damage}${ex.damage_type ? ` · ${ex.damage_type}` : ""}`}
                    >
                      +{ex.damage}{" "}
                      {ex.damage_type ? (
                        <span style={{ opacity: 0.7, fontSize: "10px" }}>
                          {ex.damage_type}
                        </span>
                      ) : (
                        ""
                      )}
                    </div>
                  ))
                : w.extra_damage && (
                    <div
                      class="weap-dmg weap-dmg-extra"
                      onClick={(e: any) => {
                        e.stopPropagation();
                        quickRoll(
                          String(w.extra_damage).replace(/\s+/g, ""),
                          `${w.name} ${T("ccExtraDamage")}${w.extra_damage_type ? `(${w.extra_damage_type})` : ""}`,
                        );
                      }}
                      title={`${T("ccExtraDmgDie")} ${w.extra_damage}${w.extra_damage_type ? ` · ${w.extra_damage_type}` : ""}`}
                    >
                      +{w.extra_damage}{" "}
                      {w.extra_damage_type ? (
                        <span style={{ opacity: 0.7, fontSize: "10px" }}>
                          {w.extra_damage_type}
                        </span>
                      ) : (
                        ""
                      )}
                    </div>
                  )}
              {(w.properties || w.weight != null || w.ammo_type) && (
                <div class="weap-props">
                  {[
                    w.properties,
                    w.weight != null ? `${w.weight} ${T("ccLbUnit")}` : null,
                    w.ammo_type ? `${T("ccAmmo")}:${w.ammo_type}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
              {/* 2026-06-21 — special_properties view: rendered as its
                  OWN block (not folded into the .weap-props line above)
                  because this text can run long (magical effects /
                  homebrew rules / lore) — a " · "-joined single line
                  would either truncate it or blow out the row. */}
              {w.special_properties && (
                <div class="weap-props weap-special-props">
                  {w.special_properties}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SpellsSection({ data }: { data: CharacterData }) {
  const { editing, onPatch } = useEdit();
  const sp = data.spellcasting || {};
  const cs = data.core_stats || {};
  const slots = sp.spell_slots || {};
  const cantrips: any[] = Array.isArray(sp.cantrips_known)
    ? sp.cantrips_known
    : [];
  const always: any[] = Array.isArray(sp.always_known) ? sp.always_known : [];
  const prepared: any[] = Array.isArray(sp.prepared) ? sp.prepared : [];

  const [openSpell, setOpenSpell] = useState<string | null>(null);
  // 2026-05-14 (#14 f2) — which list + level the SpellPickModal is
  // currently adding into. null = modal closed.
  const [pickFor, setPickFor] = useState<{
    slot: "cantrips_known" | "always_known" | "prepared";
    level: number;
    ev?: Event;
  } | null>(null);

  // 2026-05-14 (#14 follow-up / f2) — edit helpers. SpellsSection has
  // three parallel lists (cantrips_known / always_known / prepared);
  // each uses the same add/remove/patch shape so we factor them via a
  // slot key. The "+" buttons open the SpellPickModal (replaces the
  // old window.prompt). Per user spec, spells store only { name,
  // level } now — detailed text lives in the library, not on the card.
  const openSpellPicker = (
    slot: "cantrips_known" | "always_known" | "prepared",
    level: number,
    ev?: Event,
  ) => {
    setPickFor({ slot, level, ev });
  };
  const commitSpellPick = (name: string) => {
    if (!pickFor) return;
    const { slot, level, ev } = pickFor;
    const cur = Array.isArray((sp as any)[slot]) ? (sp as any)[slot] : [];
    onPatch({ spellcasting: { ...sp, [slot]: [...cur, { name, level }] } });
    setPickFor(null);
    smoothScrollToNewRow(ev, ".spell");
  };
  const removeSpell = (
    slot: "cantrips_known" | "always_known" | "prepared",
    idx: number,
  ) => {
    const cur = Array.isArray((sp as any)[slot]) ? (sp as any)[slot] : [];
    if (
      !window.confirm(
        T("ccConfirmDelItem").replace(
          "{name}",
          cur[idx]?.name || T("ccUnnamed"),
        ),
      )
    )
      return;
    onPatch({
      spellcasting: {
        ...sp,
        [slot]: cur.filter((_: any, i: number) => i !== idx),
      },
    });
  };
  const patchSpell = (
    slot: "cantrips_known" | "always_known" | "prepared",
    idx: number,
    patch: Record<string, any>,
  ) => {
    const cur = Array.isArray((sp as any)[slot]) ? (sp as any)[slot] : [];
    const next = [...cur];
    next[idx] = { ...next[idx], ...patch };
    onPatch({ spellcasting: { ...sp, [slot]: next } });
  };
  const setSlot = (lv: number, which: "current" | "max", v: number) => {
    const cur = (slots as any)[String(lv)] || {};
    onPatch({
      spellcasting: {
        ...sp,
        spell_slots: { ...(slots || {}), [String(lv)]: { ...cur, [which]: v } },
      },
    });
  };

  if (
    !editing &&
    !cantrips.length &&
    !always.length &&
    !prepared.length &&
    !sp.attack_bonus &&
    !sp.save_dc
  ) {
    return null;
  }

  // Group prepared by group number (1/2/3) — falls back to single
  // group when group field absent.
  const groups: Record<string, any[]> = {};
  for (const s of prepared) {
    const g = String(s.group ?? "1");
    (groups[g] ??= []).push(s);
  }

  const renderSpell = (
    s: any,
    idx: number,
    prefix: string,
    slot?: "cantrips_known" | "always_known" | "prepared",
  ) => {
    const key = `${prefix}-${idx}`;
    const isOpen = openSpell === key;
    // 2026-05-14 (#14 f3) — edit-mode spell row. Per user spec spells
    // store ONLY { name, level } now — no description (the library is
    // the source of truth for spell text). Row has: level input ·
    // name input · × delete. The per-row 🔍 button was removed — it
    // broadcast to the global search popover, but the cc panel is a
    // fullScreen modal that covers it, so the user never saw the
    // result. Spell lookup happens at ADD time via SpellPickModal,
    // which searches the library inline.
    if (editing && slot) {
      return (
        <div
          class="spell"
          style={{ display: "flex", gap: "6px", alignItems: "center" }}
        >
          <input
            class="cc-edit-num"
            type="number"
            style={{ width: "48px", textAlign: "center" }}
            value={s.level ?? 0}
            onInput={(e: any) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n)) patchSpell(slot, idx, { level: n });
            }}
            title={T("ccSpellLevelTip")}
          />
          <input
            class="cc-edit-text"
            type="text"
            style={{ flex: "1" }}
            value={s.name ?? ""}
            placeholder={T("ccSpellNamePh")}
            onInput={(e: any) =>
              patchSpell(slot, idx, { name: e.target.value })
            }
          />
          <button
            class="cc-tag-x"
            onClick={() => removeSpell(slot, idx)}
            title={T("ccDelete")}
          >
            ×
          </button>
        </div>
      );
    }
    return (
      <>
        <div
          class="spell"
          onClick={() => setOpenSpell(isOpen ? null : key)}
          title={T("ccSpellExpandTip")}
        >
          <span class={`spell-lv ${(s.level ?? 0) === 0 ? "cantrip" : ""}`}>
            {(s.level ?? 0) === 0
              ? T("ccCantripBadge")
              : `${s.level}${T("ccRing")}`}
          </span>
          {/* 2026-05-15 — the spell-name used to be its own clickable
              search trigger (`onClick → fireNameSearch + stopPropagation`).
              User reported the name was blocking the row's detail toggle
              and the search alone wasn't useful enough to justify it.
              Removed the inner onClick so clicks anywhere on the row
              (including the name) open the detail panel. Players who
              still want to search can use the global search bar. */}
          <span class="spell-name">{s.name}</span>
          {s.meta?.concentration && (
            <span class="spell-tag conc">{T("ccConcentration")}</span>
          )}
          {s.meta?.ritual && (
            <span class="spell-tag ritual">{T("ccRitual")}</span>
          )}
        </div>
        {isOpen && s.description && (
          <div class="spell-detail">
            {s.meta && (
              <div class="meta">
                {s.meta.school && <span>{s.meta.school}</span>}
                {s.meta.casting_time && (
                  <span>
                    {T("ccCastingTime")} {s.meta.casting_time}
                  </span>
                )}
                {s.meta.range && (
                  <span>
                    {T("ccRange")} {s.meta.range}
                  </span>
                )}
                {s.meta.components && <span>{s.meta.components}</span>}
                {s.meta.duration && (
                  <span>
                    {T("ccDuration")} {s.meta.duration}
                  </span>
                )}
                {s.meta.source && <span>《{s.meta.source}》</span>}
              </div>
            )}
            {s.description}
          </div>
        )}
      </>
    );
  };

  return (
    <div class="sec">
      <div class="sec-h">
        <span class="sec-h-title">{T("ccSecSpells")}</span>
        {(sp.spellcasting_ability || sp.save_dc) && (
          <span class="sec-h-meta">
            {sp.spellcasting_ability &&
              `${T("ccSpellAbility")}: ${sp.spellcasting_ability}`}
            {sp.save_dc != null && `  ·  ${T("ccSaveDC")}: ${sp.save_dc}`}
            {sp.attack_bonus &&
              `  ·  ${T("ccSpellAttack")}: ${sp.attack_bonus}`}
            {sp.max_prepared != null &&
              `  ·  ${T("ccMaxPrepared")}: ${sp.max_prepared}`}
          </span>
        )}
      </div>
      <div class="sec-body">
        {/* Spell slots */}
        <div class="spell-slots">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lv) => {
            const s = slots[String(lv)];
            const has = s && (s.max ?? 0) > 0;
            if (editing) {
              // 2026-05-14 (#14 follow-up) — slot edit. Two tiny inputs
              // (current / max). Setting max=0 effectively retires the
              // level so the panel hides it in view mode again.
              return (
                <div class={`slot ${has ? "has-slots" : ""}`}>
                  <div class="slot-lv">
                    {lv}
                    {T("ccRing")}
                  </div>
                  <input
                    class="cc-edit-num"
                    type="number"
                    style={{
                      width: "100%",
                      textAlign: "center",
                      fontSize: "13px",
                    }}
                    value={s?.current ?? 0}
                    onInput={(e: any) => {
                      const n = parseInt(e.target.value, 10);
                      if (Number.isFinite(n)) setSlot(lv, "current", n);
                    }}
                  />
                  <input
                    class="cc-edit-num"
                    type="number"
                    style={{
                      width: "100%",
                      textAlign: "center",
                      fontSize: "11px",
                      opacity: 0.8,
                    }}
                    value={s?.max ?? 0}
                    onInput={(e: any) => {
                      const n = parseInt(e.target.value, 10);
                      if (Number.isFinite(n)) setSlot(lv, "max", n);
                    }}
                  />
                </div>
              );
            }
            return (
              <div class={`slot ${has ? "has-slots" : ""}`}>
                <div class="slot-lv">
                  {lv}
                  {T("ccRing")}
                </div>
                <div class="slot-cur">{has ? (s.current ?? 0) : "—"}</div>
                <div class="slot-max">{has ? `/${s.max}` : ""}</div>
              </div>
            );
          })}
        </div>

        {/* 2026-05-15 — Sorcery points block removed per user spec
            ("术法点 not used in our table"). Field stays parsed on
            the server side in case anyone wants it back later. */}

        {/* Cantrips */}
        {(editing || !!cantrips.length) && (
          <div class="spell-group">
            <div
              class="spell-group-h"
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <span>{T("ccCantrips")}</span>
              {editing && (
                <button
                  class="cc-add-tag"
                  onClick={(e: any) => openSpellPicker("cantrips_known", 0, e)}
                  title={T("ccAddCantripTitle")}
                >
                  +
                </button>
              )}
            </div>
            {cantrips.map((s, i) =>
              renderSpell(
                s,
                i,
                "cantrip",
                editing ? "cantrips_known" : undefined,
              ),
            )}
          </div>
        )}

        {/* Always known */}
        {(editing || !!always.length) && (
          <div class="spell-group">
            <div
              class="spell-group-h"
              style={{ display: "flex", alignItems: "center", gap: "6px" }}
            >
              <span>{T("ccAlwaysPrepared")}</span>
              {editing && (
                <button
                  class="cc-add-tag"
                  onClick={(e: any) => openSpellPicker("always_known", 1, e)}
                  title={T("ccAddAlwaysTitle")}
                >
                  +
                </button>
              )}
            </div>
            {always.map((s, i) =>
              renderSpell(s, i, "always", editing ? "always_known" : undefined),
            )}
          </div>
        )}

        {/* Prepared — single "准备" header. Original grouping by `group`
            field is preserved for read-only view (multi-group decks);
            in edit mode we flatten into one list to keep the add/remove
            UX simple. The group field can still be set manually via the
            paste-JSON path. */}
        {(editing || Object.keys(groups).length > 0) &&
          (editing ? (
            <div class="spell-group">
              <div
                class="spell-group-h"
                style={{ display: "flex", alignItems: "center", gap: "6px" }}
              >
                <span>{T("ccPrepared")}</span>
                <button
                  class="cc-add-tag"
                  onClick={(e: any) => openSpellPicker("prepared", 1, e)}
                  title={T("ccAddPreparedTitle")}
                >
                  +
                </button>
              </div>
              {prepared.map((s, i) => renderSpell(s, i, "p", "prepared"))}
            </div>
          ) : (
            Object.entries(groups).map(([g, list]) => (
              <div class="spell-group">
                <div class="spell-group-h">
                  {T("ccPrepared")} · {T("ccGroup")} {g}
                </div>
                {list.map((s, i) => renderSpell(s, i, `g${g}`))}
              </div>
            ))
          ))}
      </div>
      {pickFor && (
        <SpellPickModal
          title={
            pickFor.slot === "cantrips_known"
              ? T("ccAddCantripModal")
              : pickFor.slot === "always_known"
                ? T("ccAddAlwaysModal")
                : T("ccAddPreparedModal")
          }
          onCancel={() => setPickFor(null)}
          onPick={commitSpellPick}
        />
      )}
    </div>
  );
}

function FeatureBlock({
  title,
  items,
  slot,
  onAdd,
  onRemove,
  onPatchItem,
}: {
  title: string;
  items: any[];
  // 2026-05-14 (#14) — when slot is provided, edit-mode actions
  // (+ append / × remove / inline name+description edit) become
  // available. The slot key is the data.features field name (e.g.
  // "class_features"); FeaturesSection plumbs each block's slot
  // separately so the patches target the right list.
  slot?: string;
  onAdd?: (slot: string, ev?: Event) => void;
  onRemove?: (slot: string, idx: number) => void;
  onPatchItem?: (slot: string, idx: number, patch: Record<string, any>) => void;
}) {
  const { editing } = useEdit();
  // 2026-05-15 — feature details default-expanded. User reported having
  // to click each feature row to read its description was tedious;
  // they almost always want to see them all at once. `closedIdx` flips
  // the previous "openIdx" semantic: items are open by default, click
  // the row to collapse a specific one.
  const [closedIdx, setClosedIdx] = useState<Set<number>>(new Set());
  if (!editing && !items?.length) return null;
  return (
    <div style={{ marginBottom: "10px" }}>
      <div
        class="spell-group-h"
        style={{
          marginBottom: "6px",
          display: "flex",
          alignItems: "center",
          gap: "6px",
        }}
      >
        <span>{title}</span>
        {editing && slot && (
          <button
            class="cc-add-tag"
            onClick={(e: any) => onAdd?.(slot, e)}
            title={`${T("ccAddPrefix")}${title}`}
          >
            +
          </button>
        )}
      </div>
      {items.map((f, i) => {
        const isOpen = editing || !closedIdx.has(i);
        if (editing && slot) {
          return (
            <div class="feat is-open" style={{ marginBottom: "6px" }}>
              <div
                class="feat-h"
                style={{ display: "flex", gap: "6px", alignItems: "center" }}
              >
                <input
                  class="cc-edit-text"
                  type="text"
                  style={{ flex: "1" }}
                  value={f.name ?? ""}
                  placeholder={T("ccNamePh")}
                  onInput={(e: any) =>
                    onPatchItem?.(slot, i, { name: e.target.value })
                  }
                />
                <input
                  class="cc-edit-num"
                  type="number"
                  style={{ width: "54px" }}
                  value={f.level ?? ""}
                  placeholder="Lv"
                  onInput={(e: any) => {
                    const v = e.target.value;
                    const n = v === "" ? null : parseInt(v, 10);
                    onPatchItem?.(slot, i, { level: n });
                  }}
                />
                <button
                  class="cc-tag-x"
                  onClick={() => onRemove?.(slot, i)}
                  title={T("ccDelete")}
                >
                  ×
                </button>
              </div>
              <textarea
                class="cc-edit-text"
                style={{
                  width: "100%",
                  minHeight: "60px",
                  marginTop: "4px",
                  fontFamily: "inherit",
                  fontSize: "12px",
                }}
                value={f.description ?? ""}
                placeholder={T("ccDescPh")}
                onInput={(e: any) =>
                  onPatchItem?.(slot, i, { description: e.target.value })
                }
              />
            </div>
          );
        }
        return (
          <div class={`feat ${isOpen ? "is-open" : ""}`}>
            <div
              class="feat-h"
              onClick={() => {
                // Toggle: open by default, click to collapse, click
                // again to re-open.
                setClosedIdx((prev) => {
                  const next = new Set(prev);
                  if (next.has(i)) next.delete(i);
                  else next.add(i);
                  return next;
                });
              }}
              title={T("ccToggleCollapse")}
            >
              <span class="feat-name">
                {/* 2026-05-15 — dropped the inner "search by name"
                    onClick (same change as the spell rows). Clicking
                    anywhere on the header now collapses/expands. */}
                <span class="srch-name">{f.name}</span>
                {f.level != null && <span class="lv">Lv{f.level}</span>}
                {f.category && (
                  <span
                    class="lv"
                    style={{
                      borderColor: "var(--teal-soft)",
                      color: "var(--teal)",
                    }}
                  >
                    {f.category}
                  </span>
                )}
              </span>
              <span class="feat-toggle">▼</span>
            </div>
            {isOpen && f.description && (
              <div class="feat-body">{f.description}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FeaturesSection({ data }: { data: CharacterData }) {
  const { editing, onPatch } = useEdit();
  const f = data.features || {};
  const cls: any[] = Array.isArray(f.class_features) ? f.class_features : [];
  const race: any[] = Array.isArray(f.race_features) ? f.race_features : [];
  const feats: any[] = Array.isArray(f.feats) ? f.feats : [];
  // New schema fields (v0.3+, may not exist in older data):
  const fightingStyle: any[] = Array.isArray(f.fighting_style_feats)
    ? f.fighting_style_feats
    : [];
  const special: any[] = Array.isArray(f.special_abilities)
    ? f.special_abilities
    : [];

  // 2026-05-14 (#14) — edit hooks. Each block targets a different
  // slot in data.features. We expose a single add / remove / patch
  // triad that the FeatureBlock components call with their slot key.
  const addItem = (slot: string, ev?: Event) => {
    const cur = Array.isArray((f as any)[slot]) ? (f as any)[slot] : [];
    onPatch({
      features: {
        ...f,
        [slot]: [...cur, { name: T("ccNewEntry"), description: "" }],
      },
    });
    smoothScrollToNewRow(ev, ".feat");
  };
  const removeItem = (slot: string, idx: number) => {
    const cur = Array.isArray((f as any)[slot]) ? (f as any)[slot] : [];
    const name = cur[idx]?.name || T("ccUnnamed");
    if (!window.confirm(T("ccConfirmDelItem").replace("{name}", name))) return;
    onPatch({
      features: { ...f, [slot]: cur.filter((_: any, i: number) => i !== idx) },
    });
  };
  const patchItem = (slot: string, idx: number, patch: Record<string, any>) => {
    const cur = Array.isArray((f as any)[slot]) ? (f as any)[slot] : [];
    const next = [...cur];
    next[idx] = { ...next[idx], ...patch };
    onPatch({ features: { ...f, [slot]: next } });
  };

  if (
    !editing &&
    !cls.length &&
    !race.length &&
    !feats.length &&
    !fightingStyle.length &&
    !special.length
  ) {
    return null;
  }

  return (
    <div class="sec">
      <div class="sec-h">
        <span class="sec-h-title">{T("ccSecFeatures")}</span>
      </div>
      <div class="sec-body">
        <FeatureBlock
          title={T("ccClassFeatures")}
          items={cls}
          slot="class_features"
          onAdd={addItem}
          onRemove={removeItem}
          onPatchItem={patchItem}
        />
        <FeatureBlock
          title={T("ccRaceFeatures")}
          items={race}
          slot="race_features"
          onAdd={addItem}
          onRemove={removeItem}
          onPatchItem={patchItem}
        />
        <FeatureBlock
          title={T("ccFightingStyle")}
          items={fightingStyle}
          slot="fighting_style_feats"
          onAdd={addItem}
          onRemove={removeItem}
          onPatchItem={patchItem}
        />
        <FeatureBlock
          title={T("ccSpecialAbilities")}
          items={special}
          slot="special_abilities"
          onAdd={addItem}
          onRemove={removeItem}
          onPatchItem={patchItem}
        />
        <FeatureBlock
          title={T("ccFeats")}
          items={feats}
          slot="feats"
          onAdd={addItem}
          onRemove={removeItem}
          onPatchItem={patchItem}
        />
      </div>
    </div>
  );
}

function BackgroundSection({ data }: { data: CharacterData }) {
  const { editing, onPatch } = useEdit();
  const bg = data.background || {};
  const id = data.identity || {};
  // 2026-05-14 (#14) — block keys (`appearance` / `personality` /
  // ...) live on data.background. Identity-level fields (玩家 / 性别
  // / 年龄 / ...) live on data.identity. We expose both with inline
  // edits in edit mode.
  type Block = { labelKey: Parameters<typeof t>[1]; key: string; body: any };
  const blocks: Block[] = [
    { labelKey: "ccBgAppearance", key: "appearance", body: bg.appearance },
    { labelKey: "ccBgPersonality", key: "personality", body: bg.personality },
    { labelKey: "ccBgTraits", key: "traits", body: bg.traits },
    { labelKey: "ccBgIdeals", key: "ideals", body: bg.ideals },
    { labelKey: "ccBgBonds", key: "bonds", body: bg.bonds },
    { labelKey: "ccBgFlaws", key: "flaws", body: bg.flaws },
    { labelKey: "ccBgStory", key: "story", body: bg.story },
    { labelKey: "ccBgOther", key: "description", body: bg.description },
  ];
  const setBg = (k: string, v: any) =>
    onPatch({ background: { ...bg, [k]: v } });
  const setId = (k: string, v: any) => onPatch({ identity: { ...id, [k]: v } });

  const visibleBlocks = editing ? blocks : blocks.filter((b) => b.body);

  return (
    <div class="sec">
      <div class="sec-h">
        <span class="sec-h-title">{T("ccSecBackground")}</span>
        {!editing && bg.background_name && (
          <span class="sec-h-meta">
            {T("ccBackgroundLabel")}
            {bg.background_name}
          </span>
        )}
      </div>
      <div class="sec-body">
        {editing && (
          <div class="def-row" style={{ marginBottom: "10px" }}>
            <span class="def-label">{T("ccBackgroundNameField")}</span>
            <input
              class="cc-edit-text"
              type="text"
              style={{ flex: "1" }}
              value={bg.background_name ?? ""}
              placeholder={T("ccBackgroundNamePh")}
              onInput={(e: any) => setBg("background_name", e.target.value)}
            />
          </div>
        )}
        <dl class="kv" style={{ marginBottom: "12px" }}>
          {(editing || id.player) && (
            <>
              <dt>{T("ccPlayer")}</dt>
              <dd>
                {editing ? (
                  <input
                    class="cc-edit-text"
                    type="text"
                    value={id.player ?? ""}
                    onInput={(e: any) => setId("player", e.target.value)}
                  />
                ) : (
                  id.player
                )}
              </dd>
            </>
          )}
          {(editing || id.gender) && (
            <>
              <dt>{T("ccGender")}</dt>
              <dd>
                {editing ? (
                  <input
                    class="cc-edit-text"
                    type="text"
                    value={id.gender ?? ""}
                    onInput={(e: any) => setId("gender", e.target.value)}
                  />
                ) : (
                  id.gender
                )}
              </dd>
            </>
          )}
          {(editing || id.age != null) && (
            <>
              <dt>{T("ccAge")}</dt>
              <dd>
                {editing ? (
                  <input
                    class="cc-edit-num"
                    type="number"
                    value={id.age ?? ""}
                    onInput={(e: any) => {
                      const v = e.target.value;
                      setId("age", v === "" ? null : parseInt(v, 10));
                    }}
                  />
                ) : (
                  id.age
                )}
              </dd>
            </>
          )}
          {(editing || id.height) && (
            <>
              <dt>{T("ccHeight")}</dt>
              <dd>
                {editing ? (
                  <input
                    class="cc-edit-text"
                    type="text"
                    value={id.height ?? ""}
                    onInput={(e: any) => setId("height", e.target.value)}
                  />
                ) : (
                  id.height
                )}
              </dd>
            </>
          )}
          {(editing || id.weight) && (
            <>
              <dt>{T("ccBodyWeight")}</dt>
              <dd>
                {editing ? (
                  <input
                    class="cc-edit-text"
                    type="text"
                    value={id.weight ?? ""}
                    onInput={(e: any) => setId("weight", e.target.value)}
                  />
                ) : (
                  id.weight
                )}
              </dd>
            </>
          )}
          {(editing || id.hometown) && (
            <>
              <dt>{T("ccHometown")}</dt>
              <dd>
                {editing ? (
                  <input
                    class="cc-edit-text"
                    type="text"
                    value={id.hometown ?? ""}
                    onInput={(e: any) => setId("hometown", e.target.value)}
                  />
                ) : (
                  id.hometown
                )}
              </dd>
            </>
          )}
        </dl>
        {!!visibleBlocks.length && (
          <div class="bio-grid">
            {visibleBlocks.map((b) => (
              <div class="bio-block">
                <div class="bio-block-h">{T(b.labelKey)}</div>
                <div class="bio-block-body">
                  {editing ? (
                    <textarea
                      class="cc-edit-text"
                      style={{
                        width: "100%",
                        minHeight: "72px",
                        fontFamily: "inherit",
                        fontSize: "12px",
                      }}
                      value={b.body ?? ""}
                      placeholder={`${T(b.labelKey)}…`}
                      onInput={(e: any) => setBg(b.key, e.target.value)}
                    />
                  ) : (
                    b.body
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {!editing && !visibleBlocks.length && (
          <div style={{ color: "var(--ink-mute)", fontStyle: "italic" }}>
            {T("ccNoBackground")}
          </div>
        )}
      </div>
    </div>
  );
}
//old inventory section
// function InventorySection({ data }: { data: CharacterData }) {
//   const { editing, onPatch } = useEdit();
//   const inv = data.inventory || {};
//   const w = inv.currency?.wallet || {};
//   const enc = inv.encumbrance || {};
//   // 2026-05-16 — the parser puts the 4 "背包 1-4" + 2 "次元袋 1-2"
//   // backpack regions into `inv.containers`, NOT `inv.items` (the latter
//   // is always hardcoded to []). User reported "导入时并没有真的识别到
//   // 背包工作表的内容" — the panel was rendering the empty items list,
//   // ignoring the real container data. Flatten containers into a single
//   // displayable list, tagging each entry with its container label so
//   // the source 背包 1 / 次元袋 2 / etc. is visible.
//   const rawItems: any[] = Array.isArray(inv.items) ? inv.items : [];
//   const containers: any[] = Array.isArray(inv.containers) ? inv.containers : [];
//   const containerItems: any[] = containers.flatMap((c: any) => {
//     const label = String(c?.label ?? T("ccBackpack"));
//     return Array.isArray(c?.items)
//       ? c.items.map((it: any) => ({
//           name: it?.name ?? "",
//           weight: it?.weight ?? null,
//           location: label,
//           description: it?.description ?? "",
//           quantity: it?.quantity ?? null,
//         }))
//       : [];
//   });
//   // Merge: rawItems first (legacy / hand-edited extras), then container
//   // items. In EDIT mode only show rawItems so the index-based update /
//   // remove handlers stay consistent — container items are sourced
//   // from the xlsx and treated as read-only here (the user re-imports
//   // the spreadsheet to change them). In VIEW mode merge both so the
//   // user can actually see what's in their pack.
//   const items: any[] = editing ? rawItems : [...rawItems, ...containerItems];
//   // Wondrous items (奇物) — new schema field, ships when present.
//   const wondrous: any[] = Array.isArray(inv.wondrous_items)
//     ? inv.wondrous_items
//     : [];

//   // 2026-05-14 (#14) — inventory edit helpers.
//   const setWallet = (k: "pp" | "gp" | "ep" | "sp" | "cp", v: number) => {
//     const currency = inv.currency || {};
//     const wallet = { ...(currency.wallet || {}), [k]: v };
//     onPatch({ inventory: { ...inv, currency: { ...currency, wallet } } });
//   };
//   const updateItem = (idx: number, patch: Record<string, any>) => {
//     const next = [...items];
//     next[idx] = { ...next[idx], ...patch };
//     onPatch({ inventory: { ...inv, items: next } });
//   };
//   const removeItem = (idx: number) => {
//     if (
//       !window.confirm(
//         T("ccConfirmDelItem").replace(
//           "{name}",
//           items[idx]?.name || T("ccUnnamed"),
//         ),
//       )
//     )
//       return;
//     const next = items.filter((_, i) => i !== idx);
//     onPatch({ inventory: { ...inv, items: next } });
//   };
//   const addItem = (ev?: Event) => {
//     const next = [
//       ...items,
//       { name: T("ccNewItem"), weight: null, location: "", description: "" },
//     ];
//     onPatch({ inventory: { ...inv, items: next } });
//     smoothScrollToNewRow(ev, ".weap");
//   };
//   // Wondrous items reuse the FeatureBlock add/remove pattern via the
//   // same data shape (name + description). Slot is on inv directly.
//   const addWondrous = (_slot?: string, ev?: Event) => {
//     const next = [...wondrous, { name: T("ccNewWondrous"), description: "" }];
//     onPatch({ inventory: { ...inv, wondrous_items: next } });
//     smoothScrollToNewRow(ev, ".feat");
//   };
//   const removeWondrous = (_slot: string, idx: number) => {
//     if (
//       !window.confirm(
//         T("ccConfirmDelItem").replace(
//           "{name}",
//           wondrous[idx]?.name || T("ccUnnamed"),
//         ),
//       )
//     )
//       return;
//     const next = wondrous.filter((_, i) => i !== idx);
//     onPatch({ inventory: { ...inv, wondrous_items: next } });
//   };
//   const patchWondrous = (
//     _slot: string,
//     idx: number,
//     patch: Record<string, any>,
//   ) => {
//     const next = [...wondrous];
//     next[idx] = { ...next[idx], ...patch };
//     onPatch({ inventory: { ...inv, wondrous_items: next } });
//   };

//   const editNum = (
//     label: string,
//     key: "pp" | "gp" | "ep" | "sp" | "cp",
//     cls: string,
//   ) => (
//     <div class={`coin ${cls}`}>
//       <div class="coin-name">{label}</div>
//       <div class="coin-val">
//         {editing ? (
//           <input
//             class="cc-edit-num"
//             type="number"
//             style={{ width: "60px", textAlign: "center" }}
//             value={(w as any)[key] ?? 0}
//             onInput={(e: any) => {
//               const n = parseInt(e.target.value, 10);
//               if (Number.isFinite(n)) setWallet(key, n);
//             }}
//           />
//         ) : (
//           ((w as any)[key] ?? 0)
//         )}
//       </div>
//     </div>
//   );

//   return (
//     <div class="sec">
//       <div class="sec-h">
//         <span class="sec-h-title">{T("ccSecInventory")}</span>
//         {!editing && inv.currency?.total_gp_raw && (
//           <span class="sec-h-meta">
//             {T("ccTotalValue")} {inv.currency.total_gp_raw}
//           </span>
//         )}
//         {editing && (
//           <button
//             class="cc-add-tag"
//             style={{ marginLeft: "auto" }}
//             onClick={(e: any) => addItem(e)}
//             title={T("ccAddItemTitle")}
//           >
//             {T("ccAddItemBtn")}
//           </button>
//         )}
//       </div>
//       <div class="sec-body">
//         <div class="coin-row">
//           {editNum(T("ccCoinPP"), "pp", "pp")}
//           {editNum(T("ccCoinGP"), "gp", "gp")}
//           {editNum(T("ccCoinEP"), "ep", "ep")}
//           {editNum(T("ccCoinSP"), "sp", "sp")}
//           {editNum(T("ccCoinCP"), "cp", "cp")}
//         </div>

//         {(enc.equipment_weight != null || enc.total_weight != null) && (
//           <div style={{ marginBottom: "10px" }}>
//             <div class="bio-block-h" style={{ marginBottom: "5px" }}>
//               {T("ccEncumbrance")}
//             </div>
//             <div class="enc-bar">
//               <div class="enc-cell">
//                 {T("ccEquipmentWt")}{" "}
//                 <div class="v">{enc.equipment_weight ?? 0}</div>
//               </div>
//               <div class="enc-cell">
//                 {T("ccBackpack")}{" "}
//                 <div class="v">
//                   {(enc.pack1_weight ?? 0) + (enc.pack2_weight ?? 0)}
//                 </div>
//               </div>
//               <div class="enc-cell">
//                 {T("ccTotal")} <div class="v">{enc.total_weight ?? 0}</div>
//               </div>
//               <div class="enc-cell">
//                 {T("ccCapacity")} <div class="v">{enc.max_capacity ?? "?"}</div>
//               </div>
//             </div>
//           </div>
//         )}

//         {(editing || !!wondrous.length) && (
//           <FeatureBlock
//             title={T("ccWondrousTitle")}
//             items={wondrous}
//             slot={editing ? "wondrous_items" : undefined}
//             onAdd={editing ? addWondrous : undefined}
//             onRemove={editing ? removeWondrous : undefined}
//             onPatchItem={editing ? patchWondrous : undefined}
//           />
//         )}

//         {!editing && items.length === 0 && !wondrous.length && (
//           <div
//             style={{
//               color: "var(--ink-mute)",
//               fontStyle: "italic",
//               padding: "6px 0",
//             }}
//           >
//             {T("ccNoPackDetail")}
//           </div>
//         )}
//         {(editing || !!items.length) && (
//           <div style={{ marginTop: "8px" }}>
//             <div class="bio-block-h" style={{ marginBottom: "5px" }}>
//               {T("ccBackpack")}
//             </div>
//             {items.map((it: any, idx: number) => {
//               if (editing) {
//                 return (
//                   <div
//                     class="weap"
//                     style={{
//                       display: "grid",
//                       gridTemplateColumns: "1.4fr 0.6fr 0.8fr auto",
//                       gap: "6px",
//                       alignItems: "center",
//                     }}
//                   >
//                     <input
//                       class="cc-edit-text"
//                       type="text"
//                       value={it.name ?? ""}
//                       placeholder={T("ccItemNamePh")}
//                       onInput={(e: any) =>
//                         updateItem(idx, { name: e.target.value })
//                       }
//                     />
//                     <input
//                       class="cc-edit-text"
//                       type="text"
//                       value={it.weight ?? ""}
//                       placeholder={T("ccWeightPh")}
//                       onInput={(e: any) => {
//                         const v = e.target.value;
//                         updateItem(idx, {
//                           weight: v === "" ? null : parseFloat(v),
//                         });
//                       }}
//                     />
//                     <input
//                       class="cc-edit-text"
//                       type="text"
//                       value={it.location ?? ""}
//                       placeholder={T("ccLocationPh")}
//                       onInput={(e: any) =>
//                         updateItem(idx, { location: e.target.value })
//                       }
//                     />
//                     <button
//                       class="cc-tag-x"
//                       onClick={() => removeItem(idx)}
//                       title={T("ccDelete")}
//                     >
//                       ×
//                     </button>
//                   </div>
//                 );
//               }
//               // 2026-05-16 — show quantity (from container schema) +
//               // weight + container label. The quantity is the xlsx
//               // 容器 schema's qty cell; we render it inline with the
//               // name as "× N" so each row's count is immediately
//               // visible.
//               const qty =
//                 it.quantity != null && it.quantity !== 1
//                   ? ` × ${it.quantity}`
//                   : "";
//               const weightStr = fmtWeight(it.weight);
//               const loc = it.location ? `· ${it.location}` : "";
//               const meta = [weightStr, loc].filter(Boolean).join(" ");
//               return (
//                 <div class="weap">
//                   <div class="weap-name">{(it.name || "?") + qty}</div>
//                   <div class="weap-atk" style={{ visibility: "hidden" }}>
//                     —
//                   </div>
//                   <div
//                     class="weap-dmg"
//                     style={{
//                       background: "transparent",
//                       border: "0",
//                       color: "var(--ink-dim)",
//                     }}
//                   >
//                     {meta}
//                   </div>
//                   {it.description && (
//                     <div class="weap-props">{it.description}</div>
//                   )}
//                 </div>
//               );
//             })}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// }
//new inventory section
function InventorySection({ data }: { data: CharacterData }) {
  const { editing, onPatch } = useEdit();
  const inv = data.inventory || {};
  const w = inv.currency?.wallet || {};
  const enc = inv.encumbrance || {};

  const rawItems: any[] = Array.isArray(inv.items) ? inv.items : [];
  const containers: any[] = Array.isArray(inv.containers) ? inv.containers : [];

  const containerItems: any[] = containers.flatMap((c: any) => {
    const label = String(c?.label ?? T("ccBackpack"));
    return Array.isArray(c?.items)
      ? c.items.map((it: any) => ({
          ...it,
          location: label,
          quantity: typeof it?.quantity === "number" ? it.quantity : 1,
        }))
      : [];
  });

  const items: any[] = editing ? rawItems : [...rawItems, ...containerItems];
  const wondrous: any[] = Array.isArray(inv.wondrous_items)
    ? inv.wondrous_items
    : [];

  const totalCarriedWeight = items.reduce((sum, it) => {
    const wt = typeof it.weight === "number" ? it.weight : 0;
    const qty = typeof it.quantity === "number" ? it.quantity : 1;
    return sum + wt * qty;
  }, 0);

  // Stato per modifica quantità in modalità visualizzazione
  const [editingQtyIndex, setEditingQtyIndex] = useState<number | null>(null);
  const [tempQty, setTempQty] = useState<string>("");

  const setWallet = (k: "pp" | "gp" | "ep" | "sp" | "cp", v: number) => {
    const currency = inv.currency || {};
    const wallet = { ...(currency.wallet || {}), [k]: v };
    onPatch({ inventory: { ...inv, currency: { ...currency, wallet } } });
  };

  const updateItem = (idx: number, patch: Record<string, any>) => {
    const next = [...items];
    next[idx] = { ...next[idx], ...patch };
    onPatch({ inventory: { ...inv, items: next } });
  };

  const removeItem = (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    onPatch({ inventory: { ...inv, items: next } });
  };

  const handleQuantityChange = (idx: number) => {
    const currentQty =
      typeof items[idx]?.quantity === "number" ? items[idx].quantity : 1;
    setTempQty(currentQty.toString());
    setEditingQtyIndex(idx);
  };

  const confirmQuantityChange = () => {
    if (editingQtyIndex === null) return;

    let newQty = parseFloat(tempQty);
    if (isNaN(newQty)) newQty = 1;

    if (tempQty.startsWith("+") || tempQty.startsWith("-")) {
      const delta = parseFloat(tempQty);
      const current =
        typeof items[editingQtyIndex].quantity === "number"
          ? items[editingQtyIndex].quantity
          : 1;
      newQty = current + delta;
    }

    if (newQty <= 0) {
      if (
        window.confirm(
          "La quantità è diventata 0 o negativa.\nEliminare definitivamente l'oggetto?",
        )
      ) {
        removeItem(editingQtyIndex);
      }
    } else {
      updateItem(editingQtyIndex, { quantity: Math.floor(newQty) });
    }

    setEditingQtyIndex(null);
    setTempQty("");
  };

  const addItem = (ev?: Event) => {
    const next = [
      ...items,
      {
        name: T("ccNewItem"),
        weight: null,
        quantity: 1,
        location: "",
        description: "",
      },
    ];
    onPatch({ inventory: { ...inv, items: next } });
    smoothScrollToNewRow(ev, ".weap");
  };

  const addWondrous = (_slot?: string, ev?: Event) => {
    const next = [...wondrous, { name: T("ccNewWondrous"), description: "" }];
    onPatch({ inventory: { ...inv, wondrous_items: next } });
    smoothScrollToNewRow(ev, ".feat");
  };

  const removeWondrous = (_slot: string, idx: number) => {
    if (
      !window.confirm(
        T("ccConfirmDelItem").replace(
          "{name}",
          wondrous[idx]?.name || T("ccUnnamed"),
        ),
      )
    )
      return;
    const next = wondrous.filter((_, i) => i !== idx);
    onPatch({ inventory: { ...inv, wondrous_items: next } });
  };

  const patchWondrous = (
    _slot: string,
    idx: number,
    patch: Record<string, any>,
  ) => {
    const next = [...wondrous];
    next[idx] = { ...next[idx], ...patch };
    onPatch({ inventory: { ...inv, wondrous_items: next } });
  };

  const editNum = (
    label: string,
    key: "pp" | "gp" | "ep" | "sp" | "cp",
    cls: string,
  ) => (
    <div class={`coin ${cls}`}>
      <div class="coin-name">{label}</div>
      <div class="coin-val">
        {editing ? (
          <input
            class="cc-edit-num"
            type="number"
            style={{ width: "60px", textAlign: "center" }}
            value={(w as any)[key] ?? 0}
            onInput={(e: any) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n)) setWallet(key, n);
            }}
          />
        ) : (
          ((w as any)[key] ?? 0)
        )}
      </div>
    </div>
  );

  return (
    <div class="sec">
      <div class="sec-h">
        <span class="sec-h-title">{T("ccSecInventory")}</span>
        {!editing && inv.currency?.total_gp_raw && (
          <span class="sec-h-meta">
            {T("ccTotalValue")} {inv.currency.total_gp_raw}
          </span>
        )}
        {editing && (
          <button
            class="cc-add-tag"
            style={{ marginLeft: "auto" }}
            onClick={(e: any) => addItem(e)}
            title={T("ccAddItemTitle")}
          >
            {T("ccAddItemBtn")}
          </button>
        )}
      </div>
      <div class="sec-body">
        <div class="coin-row">
          {editNum(T("ccCoinPP"), "pp", "pp")}
          {editNum(T("ccCoinGP"), "gp", "gp")}
          {editNum(T("ccCoinEP"), "ep", "ep")}
          {editNum(T("ccCoinSP"), "sp", "sp")}
          {editNum(T("ccCoinCP"), "cp", "cp")}
        </div>

        <div style={{ marginBottom: "10px" }}>
          <div class="bio-block-h" style={{ marginBottom: "5px" }}>
            {T("ccEncumbrance")}
          </div>
          <div class="enc-bar">
            <div class="enc-cell">
              {T("ccEquipmentWt")}{" "}
              <div class="v">{totalCarriedWeight.toFixed(1)}</div>
            </div>
            <div class="enc-cell">
              {T("ccBackpack")}{" "}
              <div class="v">
                {(enc.pack1_weight ?? 0) + (enc.pack2_weight ?? 0)}
              </div>
            </div>
            <div class="enc-cell">
              {T("ccTotal")} <div class="v">{enc.total_weight ?? 0}</div>
            </div>
            <div class="enc-cell">
              {T("ccCapacity")} <div class="v">{enc.max_capacity ?? "?"}</div>
            </div>
          </div>
        </div>

        {(editing || !!wondrous.length) && (
          <FeatureBlock
            title={T("ccWondrousTitle")}
            items={wondrous}
            slot={editing ? "wondrous_items" : undefined}
            onAdd={editing ? addWondrous : undefined}
            onRemove={editing ? removeWondrous : undefined}
            onPatchItem={editing ? patchWondrous : undefined}
          />
        )}

        {(editing || !!items.length) && (
          <div style={{ marginTop: "12px" }}>
            <div class="bio-block-h" style={{ marginBottom: "8px" }}>
              {T("ccBackpack")}
            </div>

            {/* Header solo in edit mode — hidden under the @container
                narrow breakpoint (cc-fullscreen.html), since stacked
                mini-cards below that width carry their own per-field
                labels and a column-caption header has nothing to
                align against any more. */}
            {editing && (
              <div
                class="weap inv-edit-header"
                style={{
                  fontWeight: "bold",
                  color: "var(--gold)",
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: "6px",
                  marginBottom: "8px",
                }}
              >
                <div>{T("ccItemNamePh") || "Nome Oggetto"}</div>
                <div>{T("ccWeightPh") || "Peso"}</div>
                <div>Qtà</div>
                <div>{T("ccLocationPh") || "Posizione"}</div>
                <div></div>
              </div>
            )}

            {items.map((it: any, idx: number) => {
              const qty = typeof it.quantity === "number" ? it.quantity : 1;
              const weight = typeof it.weight === "number" ? it.weight : 0;
              const weightStr = fmtWeight(weight, qty);
              const loc = it.location ? ` · ${it.location}` : "";

              if (editing) {
                return (
                  <div class="weap inv-edit-row">
                    {/* 2026-06-21 — same fix as the weapon-edit row
                        above: fixed grid columns overflowed a narrow
                        card. Layout now lives in CSS behind the
                        @container query (.inv-edit-row / .inv-edit-
                        grid in cc-fullscreen.html) — tabular row when
                        there's room, stacked mini-card with one label
                        per field when there isn't. */}
                    <div class="inv-edit-grid">
                      <div class="inv-edit-field">
                        <span class="inv-edit-field-label">
                          {T("ccItemNamePh") || "Nome oggetto"}
                        </span>
                        <input
                          class="cc-edit-text"
                          type="text"
                          value={it.name ?? ""}
                          placeholder="Nome oggetto"
                          onInput={(e: any) =>
                            updateItem(idx, { name: e.target.value })
                          }
                        />
                      </div>
                      <div class="inv-edit-field">
                        <span class="inv-edit-field-label">
                          {T("ccWeightPh") || "Peso"}
                        </span>
                        <input
                          class="cc-edit-num"
                          type="number"
                          step="0.1"
                          value={it.weight ?? ""}
                          placeholder="0.0"
                          onInput={(e: any) => {
                            const v = e.target.value;
                            updateItem(idx, {
                              weight: v === "" ? null : parseFloat(v),
                            });
                          }}
                        />
                      </div>
                      <div class="inv-edit-field">
                        <span class="inv-edit-field-label">Qtà</span>
                        <input
                          class="cc-edit-num"
                          type="number"
                          min="1"
                          value={it.quantity ?? 1}
                          onInput={(e: any) => {
                            const n = parseInt(e.target.value, 10);
                            if (Number.isFinite(n))
                              updateItem(idx, { quantity: Math.max(1, n) });
                          }}
                        />
                      </div>
                      <div class="inv-edit-field">
                        <span class="inv-edit-field-label">
                          {T("ccLocationPh") || "Posizione"}
                        </span>
                        <input
                          class="cc-edit-text"
                          type="text"
                          value={it.location ?? ""}
                          placeholder="Posizione"
                          onInput={(e: any) =>
                            updateItem(idx, { location: e.target.value })
                          }
                        />
                      </div>
                    </div>
                    <button
                      class="cc-tag-x"
                      onClick={() => removeItem(idx)}
                      title="Elimina"
                    >
                      ×
                    </button>
                  </div>
                );
              }

              // ===================== MODALITÀ VISUALIZZAZIONE =====================
              const isEditingThisQty = editingQtyIndex === idx;

              return (
                <div
                  class="weap"
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  {/* Quadratino Quantità a sinistra */}
                  <div
                    class="qty-box"
                    onClick={() => handleQuantityChange(idx)}
                    style={{
                      width: "35px",
                      textAlign: "center",
                      background: "var(--surface-3)",
                      border: "1px solid var(--border)",
                      borderRadius: "4px",
                      padding: isEditingThisQty ? "3px" : "4px 8px",
                      fontWeight: "bold",
                      cursor: "pointer",
                      userSelect: "none",
                    }}
                  >
                    {isEditingThisQty ? (
                      <input
                        class="cc-edit-num"
                        type="text"
                        value={tempQty}
                        autoFocus
                        onChange={(e) =>
                          setTempQty(
                            (e.target as HTMLInputElement)?.value || "",
                          )
                        }
                        onBlur={confirmQuantityChange}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") confirmQuantityChange();
                          if (e.key === "Escape") {
                            setEditingQtyIndex(null);
                            setTempQty("");
                          }
                        }}
                        style={{
                          width: "30px",
                          textAlign: "center",
                        }}
                      />
                    ) : (
                      qty
                    )}
                  </div>

                  {/* Nome Oggetto */}
                  <div class="weap-name" style={{ flex: 1 }}>
                    {it.name || "?"}
                  </div>

                  {/* Peso */}
                  <div
                    class="weap-dmg"
                    style={{
                      color: "var(--ink-dim)",
                      minWidth: "110px",
                      textAlign: "right",
                    }}
                  >
                    {weightStr} {getMeasureSystem() === "metric" ? "kg" : "lbs"}
                    {loc}
                  </div>

                  {it.description && (
                    <div class="weap-props" style={{ marginLeft: "auto" }}>
                      {it.description}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ===== SAFE NORMALIZE FIX (key improvement) =====
function safeNormalize(data: any): CharacterData {
  if (!data || typeof data !== "object") {
    console.warn("[cc-fullscreen] Invalid data received");
    return {} as CharacterData;
  }
  try {
    return normalizeCombatGearFlags(data);
  } catch (e) {
    console.error("[cc-fullscreen] normalizeCombatGearFlags crashed:", e);
    return data as CharacterData; // fallback to raw
  }
}

// ===== Main app ==============================================
function App() {
  const roomId = getQS("room") || "";
  const cardId = getQS("card") || "";

  const qsMyId = getQS("myId") || "";
  const qsRole = getQS("role") || "";
  const qsPlayerName = getQS("playerName") || "";
  const qsIsGM = qsRole === "GM";

  const [data, setData] = useState<CharacterData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("overview");
  const [editing, setEditing] = useState(false);
  const [savingEdits, setSavingEdits] = useState(false);
  const [isGM, setIsGM] = useState(qsIsGM);
  const [canEdit, setCanEdit] = useState(qsIsGM);

  const [lang, setLang] = useState<Language>(_lang);
  const [, forceRender] = useState(0);
  const loadGenRef = useRef(0);
  const fetchAbortRef = useRef<AbortController | null>(null);
  _lang = lang;

  useEffect(() => onLangChange((l) => setLang((l as Language) ?? "zh")), []);

  const [showOwnersModal, setShowOwnersModal] = useState(false);

  const [obrReady, setObrReady] = useState(false);
  const [showOwnersDropdown, setShowOwnersDropdown] = useState(false);

  const [myId, setMyId] = useState(qsMyId);
  const [allPlayers, setAllPlayers] = useState<any[]>([]);
  const [ownersLoading, setOwnersLoading] = useState(false);

  // 2026-06 — receive allPlayers from parent (cc-panel.html) via plain
  // window.postMessage. OBR broadcast is unusable here (this document
  // is a nested iframe whose OBR SDK never completes its handshake),
  // but plain DOM postMessage works fine from any nesting depth.
  // panel-page.ts calls postPlayersToFullscreenIframe() after its own
  // OBR.party.getPlayers() resolves (panel-page has a working SDK),
  // and again whenever OBR.party.onChange fires.
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== "cc-players") return;
      const {
        players,
        myId: newMyId,
        role,
      } = e.data as {
        type: string;
        players: any[];
        myId: string;
        role: string;
      };
      console.log("[CC-FLOW] ✅ Received cc-players via postMessage:", {
        count: players?.length,
        myId: newMyId,
        role,
      });
      if (Array.isArray(players)) setAllPlayers(players);
      if (newMyId) setMyId(newMyId);
      if (role) {
        const gm = role === "GM";
        setIsGM(gm);
        if (gm) setCanEdit(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  console.log(
    "%c[CC-FLOW] App render — current state snapshot",
    "color: #888",
    {
      roomId,
      cardId,
      obrReady,
      myId,
      isGM,
      canEdit,
      allPlayersLength: allPlayers.length,
    },
  );

  const toggleOwnersDropdown = () => {
    setShowOwnersDropdown((v) => !v);
  };

  // Listener per ricevere core-data dal panel via postMessage
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "cc-core-data-response") {
        const payload = event.data.payload;
        console.log(
          "[cc-fullscreen DEBUG] ✅ Ricevuto core-data via postMessage!",
          payload,
        );

        if (payload?.myId) {
          setMyId(payload.myId);
          setIsGM(payload.role === "GM");
          setAllPlayers(Array.isArray(payload.players) ? payload.players : []);

          if (payload.role === "GM") {
            setCanEdit(true);
          }
        }
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // CORE DATA LISTENER — OBR.broadcast is unusable in this nested-iframe
  // context (OBR.isReady never becomes true here), so this whole mechanism
  // is now a no-op placeholder. allPlayers/myId/role arrive instead via the
  // window.addEventListener("message") handler for "cc-players" added above,
  // forwarded by panel-page.ts's postPlayersToFullscreenIframe(). Keeping
  // the empty effect avoids larger refactors to effects that depend on obrReady.
  useEffect(() => {
    // intentionally empty — data arrives via postMessage, not OBR broadcast
  }, [obrReady, cardId]);

  const checkOwnership = async (playerId: string) => {
    // ownership is already resolved from qsIsGM (GM) or will come via
    // a future cc-players message. Nothing to do here without OBR.scene.
  };

  const commitLoadedData = useCallback(
    (normalized: CharacterData, gen: number) => {
      if (gen !== loadGenRef.current) return;
      console.log(`[cc-fullscreen] Committing data for card ${cardId}`);
      setError(null);
      setData(normalized);
      const isOwner = normalized.owners_id?.indexOf(myId) ?? -1;
      setCanEdit(isOwner !== -1);
      forceRender((x) => x + 1);
    },
    [cardId],
  );

  // checkCoreData: no longer triggers OBR.broadcast (throws "not ready"
  // in a nested iframe). allPlayers are already populated via postMessage
  // from panel-page.ts on iframe load. This stub exists only so the
  // MANAGE OWNERS button's prop signature still compiles.
  const checkCoreData = async (): Promise<boolean> => {
    setOwnersLoading(true);
    console.log(
      "[cc-fullscreen DEBUG] checkCoreData → usando postMessage verso parent",
    );

    try {
      // Richiedi i dati al parent (il panel)
      window.parent.postMessage(
        {
          type: "cc-request-core-data",
          cardId,
        },
        "*",
      );

      // Aspetta risposta
      await new Promise((resolve) => setTimeout(resolve, 600));

      return true;
    } catch (e) {
      console.error("[cc-fullscreen] postMessage failed", e);
      return false;
    } finally {
      setOwnersLoading(false);
    }
  };

  const readLocalCardJson = useCallback((): any | null => {
    if (cardId.startsWith("imported_")) {
      const storedData = localStorage.getItem(
        `character-cards/imported/${cardId}`,
      );
      if (!storedData) throw new Error(T("ccErrImportedMissing"));
      return JSON.parse(storedData);
    }
    const dirtyData = localStorage.getItem(`cc-dirty/${cardId}`);
    if (!dirtyData) return null;
    try {
      return JSON.parse(dirtyData);
    } catch {
      return null;
    }
  }, [cardId]);

  const toggleOwner = async (card: CharacterData, playerId: string) => {
    if (!isGM || playerId === myId) return;

    // const meta = await OBR.scene.getMetadata();
    // let list: any[] = (meta["com.character-cards/list"] as any[]) ?? [];
    // const cardIndex = list.findIndex((c: any) => c.id === cardId);
    // if (cardIndex === -1) return;

    if (!Array.isArray(card.owners_id)) card.owners_id = [];

    if (card.owners_id.includes(playerId)) {
      card.owners_id = card.owners_id.filter((id: string) => id !== playerId);
    } else {
      card.owners_id.push(playerId);
    }
    console.log("OWNER ADDED", card);

    // list[cardIndex] = card;

    // await OBR.scene.setMetadata({
    //   ...meta,
    //   "com.character-cards/list": list,
    // });
    // await OBR.broadcast.sendMessage("com.character-cards/owners-updated", {
    //   cardId,
    // });
  };

  const loadData = useCallback(async () => {
    const gen = ++loadGenRef.current;
    fetchAbortRef.current?.abort();
    const fetchAc = new AbortController();
    fetchAbortRef.current = fetchAc;

    if (!roomId || !cardId) {
      setError(T("ccErrNoParams"));
      return;
    }

    let json: any = null;
    let source = "unknown";

    try {
      json = readLocalCardJson();
      if (json) source = cardId.startsWith("imported_") ? "imported" : "dirty";

      if (!json && !cardId.startsWith("imported_")) {
        console.log(`[cc-fullscreen] Fetching from server for ${cardId}`);
        const url = `${SERVER_ORIGIN}/characters/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/data.json`;
        const res = await fetch(url, {
          cache: "no-store",
          signal: fetchAc.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        json = await res.json();
        source = "server";
      }

      if (gen !== loadGenRef.current) return;
      if (!json) throw new Error("No data found");

      console.log(`[cc-fullscreen] Loaded from ${source} for ${cardId}`);
      const normalized = safeNormalize(json);
      commitLoadedData(normalized || json, gen);
    } catch (e: any) {
      if (e?.name === "AbortError") return;
      if (gen !== loadGenRef.current) return;

      console.error("[cc-fullscreen] loadData failed", e);

      try {
        const fallback = readLocalCardJson();
        if (fallback) {
          console.warn(`[cc-fullscreen] EMERGENCY FALLBACK for ${cardId}`);
          commitLoadedData(safeNormalize(fallback), gen);
          return;
        }
      } catch {}

      setError(`${T("ccLoadFailedPrefix")}${e?.message || String(e)}`);
    }
  }, [roomId, cardId, readLocalCardJson, commitLoadedData]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!obrReady) return;
    const repaint = () => forceRender((x) => x + 1);
    const onVis = () => {
      if (document.visibilityState === "visible") forceRender((x) => x + 1);
    };
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "cc-fullscreen-show") {
        forceRender((x) => x + 1);
        void loadData();
      }
    };
    const onDirty = OBR.broadcast.onMessage(
      "com.obr-suite/cc-dirty-changed",
      (event) => {
        const payload = event.data as { cardId?: string } | undefined;
        if (payload?.cardId && payload.cardId !== cardId) return;
        forceRender((x) => x + 1);
      },
    );

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", repaint);
    window.addEventListener("message", onMsg);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", repaint);
      window.removeEventListener("message", onMsg);
      onDirty();
    };
  }, [cardId, loadData, obrReady]);

  useEffect(() => {
    if (!cardId || !obrReady || cardId.startsWith("imported_")) return;

    const unsub = OBR.broadcast.onMessage(BC_CARD_UPDATED, (event) => {
      const payload = event.data as { cardId?: string } | undefined;
      if (payload?.cardId !== cardId) return;
      if (localStorage.getItem(`cc-dirty/${cardId}`)) return;
      void loadData();
    });

    return unsub;
  }, [cardId, loadData, obrReady]);

  const onPatch = useCallback((patch: Partial<CharacterData>) => {
    setData((prev) => (prev ? safeNormalize({ ...prev, ...patch }) : prev));
  }, []);

  const onExport = useCallback(() => {
    if (!data) return;
    const id = data.identity || {};
    const name = id.display_name || id.character_name || "character";
    downloadJson(`${name}-${cardId.slice(0, 6)}.json`, data);
  }, [data, cardId]);

  const onRefresh = useCallback(async () => {
    await loadData();
    if (cardId.startsWith("imported_")) return;
    try {
      const updatedPayload = {
        cardId,
        url: `${SERVER_ORIGIN}/characters/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/`,
      };
      OBR.broadcast.sendMessage(BC_CARD_UPDATED, updatedPayload, {
        destination: "LOCAL",
      });
      OBR.broadcast.sendMessage(BC_CARD_UPDATED, updatedPayload, {
        destination: "REMOTE",
      });
    } catch (e) {
      console.warn("[cc-fullscreen] refresh broadcast failed", e);
    }
  }, [loadData, roomId, cardId]);

  // const onBackToList = useCallback(async () => {
  //   try {
  //     await OBR.modal.close(FULLSCREEN_MODAL_ID);
  //   } catch (e) {
  //     console.warn("[cc-fullscreen] onBackToList: modal close failed", e);
  //   }
  // }, []);
  const onBackToList = useCallback(() => {
    window.parent.postMessage({ type: "cc-back-to-list" }, "*");
    // Opzionale: chiudi anche il modal se necessario
  }, []);

  const onCopyJson = useCallback(async () => {
    if (!data) return;
    const text = JSON.stringify(data, null, 2);
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {}
    if (!ok) {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        ok = document.execCommand("copy");
      } catch {}
      document.body.removeChild(ta);
    }
    if (ok) {
      window.alert(T("ccCopiedAlert").replace("{n}", String(text.length)));
    } else {
      window.alert(T("ccCopyFailAlert"));
    }
  }, [data]);

  const onImport = useCallback(() => {
    const inp = document.getElementById(
      "ccFileInput",
    ) as HTMLInputElement | null;
    if (!inp) return;
    inp.value = "";
    inp.onchange = async () => {
      const files = inp.files ? Array.from(inp.files) : [];
      if (files.length === 0) return;
      await processImportFiles(files);
    };
    inp.click();
  }, [roomId, cardId]);

  const [pasteOpen, setPasteOpen] = useState(false);
  const onPasteJson = useCallback(() => setPasteOpen(true), []);

  const applyJsonObject = useCallback(
    async (parsed: any, source: string): Promise<string> => {
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("abilities" in parsed || "identity" in parsed)
      ) {
        return `✕ ${source} ${T("ccNotCardJson")}`;
      }
      setData(safeNormalize(parsed));

      if (cardId.startsWith("imported_")) {
        try {
          localStorage.setItem(
            `character-cards/imported/${cardId}`,
            JSON.stringify(parsed),
          );
          try {
            OBR.broadcast.sendMessage(
              BC_CARD_UPDATED,
              { cardId },
              { destination: "LOCAL" },
            );
          } catch {}
          const name =
            parsed?.identity?.display_name ||
            parsed?.identity?.character_name ||
            cardId;
          return `✓ ${source} → ${name}`;
        } catch (e: any) {
          return `⚠ ${source} ${T("ccSaveFail").replace("{err}", e?.message || String(e))}`;
        }
      }

      const dirtyKey = `cc-dirty/${cardId}`;
      try {
        const url = `${SERVER_ORIGIN}/api/character/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/data`;
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
          const body = await res.text();
          localStorage.setItem(dirtyKey, JSON.stringify(parsed));
          localStorage.setItem(
            `cc-dirty-ts/${cardId}`,
            new Date().toISOString(),
          );
          try {
            OBR.broadcast.sendMessage(
              "com.obr-suite/cc-dirty-changed",
              { cardId, render: true },
              { destination: "LOCAL" },
            );
          } catch {}
          return `⚠ ${source} ${T("ccSaveFailHttp").replace("{status}", String(res.status)).replace("{body}", body.slice(0, 120))}\n💾 ${T("ccDirtySave")}`;
        }
        const result = await res.json();
        try {
          localStorage.removeItem(dirtyKey);
        } catch {}
        try {
          localStorage.removeItem(`cc-dirty-ts/${cardId}`);
        } catch {}
        try {
          OBR.broadcast.sendMessage(
            "com.obr-suite/cc-dirty-changed",
            { cardId },
            { destination: "LOCAL" },
          );
        } catch {}
        try {
          const updatedPayload = {
            cardId,
            url: `${SERVER_ORIGIN}/characters/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/`,
          };
          OBR.broadcast.sendMessage(BC_CARD_UPDATED, updatedPayload, {
            destination: "LOCAL",
          });
          OBR.broadcast.sendMessage(BC_CARD_UPDATED, updatedPayload, {
            destination: "REMOTE",
          });
        } catch {}
        let msg = `✓ ${source} → ${result.name || "current card"}`;
        if (result.render_warning)
          msg += T("ccRenderWarn").replace("{warn}", result.render_warning);
        return msg;
      } catch (e: any) {
        localStorage.setItem(dirtyKey, JSON.stringify(parsed));
        localStorage.setItem(`cc-dirty-ts/${cardId}`, new Date().toISOString());
        try {
          OBR.broadcast.sendMessage(
            "com.obr-suite/cc-dirty-changed",
            { cardId, render: true },
            { destination: "LOCAL" },
          );
        } catch {}
        return `⚠ ${source} ${T("ccSaveFail").replace("{err}", e?.message || String(e))}\n💾 ${T("ccDirtySave")}`;
      }
    },
    [roomId, cardId],
  );

  const createCardFromJson = useCallback(
    async (parsed: any, fileName: string): Promise<string> => {
      const text = JSON.stringify(parsed);
      const u = encodeURIComponent("fullscreen-import");
      try {
        const res = await fetch(
          `${SERVER_ORIGIN}/api/character/create-from-json?room=${encodeURIComponent(roomId)}&uploader=${u}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: text,
          },
        );
        if (!res.ok) {
          const body = await res.text();
          return `⚠ ${fileName} ${T("ccSaveFailHttp").replace("{status}", String(res.status)).replace("{body}", body.slice(0, 120))}`;
        }
        const entry = await res.json();
        try {
          const payload = {
            cardId: entry.id,
            url: `${SERVER_ORIGIN}/characters/${encodeURIComponent(roomId)}/${encodeURIComponent(entry.id)}/`,
          };
          OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
            destination: "LOCAL",
          });
          OBR.broadcast.sendMessage(BC_CARD_UPDATED, payload, {
            destination: "REMOTE",
          });
        } catch {}
        let msg = `✓ ${fileName} → ${T("ccNewCardArrow").replace("{name}", entry.name || parsed?.identity?.display_name || fileName)}`;
        if (entry.render_warning)
          msg +=
            "\n" + T("ccRenderWarn").replace("{warn}", entry.render_warning);
        return msg;
      } catch (e: any) {
        return `⚠ ${fileName} ${T("ccSaveFail").replace("{err}", e?.message || String(e))}`;
      }
    },
    [roomId],
  );

  const processImportFiles = useCallback(
    async (files: File[]) => {
      const summary: string[] = [];
      let currentJsonImported = false;

      for (const f of files) {
        const lower = f.name.toLowerCase();
        if (lower.endsWith(".json")) {
          try {
            const text = await f.text();
            const parsed = JSON.parse(text);

            if (currentJsonImported) {
              if (
                !parsed ||
                typeof parsed !== "object" ||
                !("abilities" in parsed || "identity" in parsed)
              ) {
                summary.push(`✕ ${f.name} ${T("ccNotCardJson")}`);
                continue;
              }
              summary.push(await createCardFromJson(parsed, f.name));
              continue;
            }

            if (cardId.startsWith("imported_")) {
              localStorage.setItem(
                `character-cards/imported/${cardId}`,
                JSON.stringify(parsed),
              );
              summary.push(
                `✓ ${f.name} → ${parsed?.identity?.display_name || "imported card"}`,
              );
              currentJsonImported = true;
              continue;
            }
            if (
              !parsed ||
              typeof parsed !== "object" ||
              !("abilities" in parsed || "identity" in parsed)
            ) {
              summary.push(`✕ ${f.name} ${T("ccNotCardJson")}`);
              continue;
            }
            setData(safeNormalize(parsed));
            try {
              const url = `${SERVER_ORIGIN}/api/character/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/data`;
              const res = await fetch(url, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(parsed),
              });
              if (!res.ok) {
                const body = await res.text();
                summary.push(
                  `⚠ ${f.name} ${T("ccSaveFailHttp").replace("{status}", String(res.status)).replace("{body}", body.slice(0, 120))}`,
                );
              } else {
                const result = await res.json();
                try {
                  const updatedPayload = {
                    cardId,
                    url: `${SERVER_ORIGIN}/characters/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/`,
                  };
                  OBR.broadcast.sendMessage(BC_CARD_UPDATED, updatedPayload, {
                    destination: "LOCAL",
                  });
                  OBR.broadcast.sendMessage(BC_CARD_UPDATED, updatedPayload, {
                    destination: "REMOTE",
                  });
                } catch {}
                summary.push(`✓ ${f.name} → ${result.name || "current card"}`);
                if (result.render_warning)
                  summary.push(
                    T("ccRenderWarn").replace("{warn}", result.render_warning),
                  );
              }
            } catch (e: any) {
              summary.push(
                `⚠ ${f.name} ${T("ccSaveFail").replace("{err}", e?.message || String(e))}`,
              );
            }
            currentJsonImported = true;
          } catch (e: any) {
            summary.push(
              `✕ ${f.name} ${T("ccJsonParseFail").replace("{err}", e?.message || String(e))}`,
            );
          }
        } else if (lower.endsWith(".xlsx")) {
          try {
            const fd = new FormData();
            fd.append("file", f);
            const u = encodeURIComponent("fullscreen-import");
            const r = await fetch(
              `${SERVER_ORIGIN}/api/character/upload?room=${encodeURIComponent(roomId)}&uploader=${u}`,
              { method: "POST", body: fd },
            );
            if (!r.ok) {
              const body = await r.text();
              summary.push(
                `✕ ${f.name} ${T("ccXlsxFailHttp").replace("{status}", String(r.status)).replace("{body}", body.slice(0, 120))}`,
              );
            } else {
              const entry = await r.json();
              try {
                const corrected = await reconcileUploadedCardShieldState({
                  apiBase: `${SERVER_ORIGIN}/api/character`,
                  roomId,
                  cardId: entry.id,
                  xlsx: f,
                });
                if (corrected) {
                  const reconcilePayload = {
                    cardId: entry.id,
                    url: `${SERVER_ORIGIN}/characters/${encodeURIComponent(roomId)}/${encodeURIComponent(entry.id)}/`,
                  };
                  OBR.broadcast.sendMessage(BC_CARD_UPDATED, reconcilePayload, {
                    destination: "LOCAL",
                  });
                  OBR.broadcast.sendMessage(BC_CARD_UPDATED, reconcilePayload, {
                    destination: "REMOTE",
                  });
                }
              } catch (e: any) {
                summary.push(
                  `⚠ ${f.name} ${T("ccShieldReconcileFail").replace("{err}", e?.message || String(e))}`,
                );
              }
              summary.push(
                `✓ ${f.name} → ${T("ccNewCardArrow").replace("{name}", entry.name)}`,
              );
            }
          } catch (e: any) {
            summary.push(
              `✕ ${f.name} ${T("ccXlsxFail").replace("{err}", e?.message || String(e))}`,
            );
          }
        } else {
          summary.push(`✕ ${f.name} ${T("ccUnsupportedExt")}`);
        }
      }

      window.alert(
        `${T("ccImportResultHead").replace("{n}", String(files.length))}\n\n${summary.join("\n")}\n\n${T("ccImportResultNote")}`,
      );
    },
    [roomId, cardId],
  );

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      const files = e.dataTransfer?.files
        ? Array.from(e.dataTransfer.files)
        : [];
      if (files.length === 0) return;
      e.preventDefault();
      await processImportFiles(files);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [processImportFiles]);

  // === STRONG FIX FOR EMBEDDED IFRAME ===
  useEffect(() => {
    const isEmbedded = window.self !== window.top;

    if (isEmbedded) {
      const handleMessage = (event: MessageEvent) => {
        if (event.data?.type === "cc-roll-dice") {
          // Inoltra il roll al parent (il panel o la suite principale)
          window.parent.postMessage(
            {
              type: "cc-roll-dice",
              payload: event.data.payload,
              cardId: cardId,
            },
            "*",
          );
        }
      };

      window.addEventListener("message", handleMessage);
      return () => window.removeEventListener("message", handleMessage);
    }
  }, [cardId]);

  // Invece di fare direttamente OBR.dice.roll(...) o simile
  const rollDice = async (diceExpression: string, label: string) => {
    if (window.self !== window.top) {
      // Siamo nell'iframe embedded → mandiamo messaggio al parent
      window.parent.postMessage(
        {
          type: "cc-roll-dice",
          payload: { expression: diceExpression, label },
        },
        "*",
      );
      return;
    }

    // Modalità normale (fullscreen)
    // ... tuo codice originale OBR.dice.roll ...
  };

  if (error) {
    return <div class="cc-error cc-translucent">{error}</div>;
  }
  if (!data) {
    return <div class="cc-loading cc-translucent">{T("ccLoadingCard")}</div>;
  }

  return (
    <EditCtx.Provider value={{ editing, data, onPatch }}>
      <Header
        data={data}
        onExport={onExport}
        onCopyJson={onCopyJson}
        onImport={onImport}
        onPasteJson={onPasteJson}
        onRefresh={onRefresh}
        onBackToList={onBackToList}
        showOwnersDropdown={showOwnersDropdown}
        toggleOwnersDropdown={toggleOwnersDropdown}
        checkCoreData={checkCoreData}
        ownersLoading={ownersLoading}
        setShowOwnersModal={setShowOwnersModal}
        canEdit={canEdit || isGM}
        isGM={isGM}
        editing={editing && (canEdit || isGM)}
        onToggleEditing={() => {
          if (canEdit || isGM) setEditing((v) => !v);
        }}
        savingEdits={savingEdits}
        onSaveEdits={async () => {
          if (savingEdits || !data) return;
          setSavingEdits(true);
          try {
            const result = await applyJsonObject(data, T("ccSavedEdit"));
            if (!result.startsWith("✓")) window.alert(result);
            const cs = data.core_stats;
            if (cs) {
              const bubblesPatch: Record<string, unknown> = {};
              const hp = cs.hp || {};
              if (typeof hp.current === "number")
                bubblesPatch["health"] = hp.current;
              if (typeof hp.max === "number")
                bubblesPatch["max health"] = hp.max;
              if (typeof hp.temp === "number")
                bubblesPatch["temporary health"] = hp.temp;
              if (typeof cs.ac === "number")
                bubblesPatch["armor class"] = cs.ac;
              if (Object.keys(bubblesPatch).length > 0) {
                try {
                  const items = await OBR.scene.items.getItems(
                    (it: any) => it.metadata?.[BIND_META_KEY] === cardId,
                  );
                  await Promise.all(
                    items.map((it) => patchBubbles(it.id, bubblesPatch)),
                  );
                } catch (e) {
                  console.warn(
                    "[cc-fullscreen] bubbles propagate on save failed",
                    e,
                  );
                }
              }
            }
          } finally {
            setSavingEdits(false);
            setEditing(false);
          }
        }}
      />
      {pasteOpen && (
        <PasteJsonModal
          onCancel={() => setPasteOpen(false)}
          onApply={async (text) => {
            let parsed: any;
            try {
              parsed = JSON.parse(text);
            } catch (e: any) {
              return T("ccJsonParseFailColon").replace(
                "{err}",
                e?.message || String(e),
              );
            }
            const result = await applyJsonObject(parsed, T("ccPasteSource"));
            if (result.startsWith("✓")) {
              setPasteOpen(false);
              window.alert(result);
              return null;
            }
            return result;
          }}
        />
      )}
      <StatsBanner data={data} onPatch={onPatch} />
      <div class="cc-tabs cc-tabs-top">
        {TABS.map((tb) => (
          <button
            class={`cc-tab ${tab === tb.key ? "is-on" : ""}`}
            onClick={() => setTab(tb.key)}
            title={T(tb.labelKey)}
          >
            {T(tb.labelKey)}
          </button>
        ))}
      </div>
      <div class="cc-body">
        <div class="cc-main">{renderTabSection(tab as TabKey, data)}</div>
        <nav class="cc-tabs-side" aria-label={T("ccTabsAria")}>
          {TABS.map((tb) => (
            <button
              class={`cc-tab cc-tab-side ${tab === tb.key ? "is-on" : ""}`}
              onClick={() => setTab(tb.key)}
              title={T(tb.labelKey)}
            >
              {T(tb.labelKey)}
            </button>
          ))}
        </nav>
      </div>
      {showOwnersModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.92)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
          }}
        >
          <div
            style={{
              backgroundColor: "#1e1e1e",
              padding: "24px",
              borderRadius: "10px",
              width: "460px",
              maxHeight: "85vh",
              overflowY: "auto",
              color: "#fff",
              boxShadow: "0 15px 40px rgba(0,0,0,0.6)",
            }}
          >
            <h3 style={{ margin: "0 0 8px 0" }}>Manage Owners</h3>
            <p style={{ fontSize: "14px", opacity: 0.8, marginBottom: "20px" }}>
              Chi può modificare questa Character Card
            </p>

            <div style={{ marginTop: "12px" }}>
              {allPlayers.length === 0 ? (
                <p>
                  Nessun giocatore trovato. Riprova a chiudere e riaprire la
                  scheda.
                </p>
              ) : (
                allPlayers.map((player: any) => {
                  const isCurrentGM = player.id === myId && isGM;
                  const isOwner = data.owners_id?.indexOf(player.id) ?? -1;
                  const isChecked = isOwner !== -1;

                  return (
                    <div
                      key={player.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "10px 0",
                        borderBottom: "1px solid #333",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={isCurrentGM}
                        onChange={() => toggleOwner(data, player.id)}
                        style={{ marginRight: "12px", transform: "scale(1.3)" }}
                      />
                      <span style={{ flex: 1, color: player.color }}>
                        {player.name || player.id}
                        {isCurrentGM && (
                          <span style={{ opacity: 0.6 }}> (GM)</span>
                        )}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <button
              onClick={() => setShowOwnersModal(false)}
              style={{
                marginTop: "24px",
                width: "100%",
                padding: "12px",
                backgroundColor: "#555",
                color: "white",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontSize: "16px",
              }}
            >
              Chiudi
            </button>
          </div>
        </div>
      )}
    </EditCtx.Provider>
  );
}

// 2026-05-15 — section dispatch helper. Extracted so both the primary
// and secondary panes can share the same switch without duplicating
// JSX between them.
function renderTabSection(key: TabKey, data: CharacterData) {
  switch (key) {
    case "overview":
      // 2026-05-14 (#14 f3) — overview layout per user spec:
      //   left column  : 属性·豁免·技能 (tall)
      //   right column : 防御·语言·工具 + 战斗·武器·护甲 (stacked)
      //   full width   : 装备·货币·负重
      return (
        <>
          <div class="cc-grid">
            <AbilitiesAndSkills data={data} />
            <div>
              <Defenses data={data} />
              <CombatSection data={data} />
            </div>
          </div>
          <InventorySection data={data} />
        </>
      );
    case "spells":
      return <SpellsSection data={data} />;
    case "features":
      return <FeaturesSection data={data} />;
    case "background":
      return <BackgroundSection data={data} />;
  }
}

const appEl = document.getElementById("app");
if (appEl) {
  // Subscribe to dice SFX broadcasts so click-to-roll plays sound
  // even though this iframe normally doesn't have audio context warmed.
  try {
    subscribeToSfx();
  } catch {}
  render(<App />, appEl);
}