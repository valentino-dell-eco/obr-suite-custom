import OBR from "@owlbear-rodeo/sdk";
import { ICONS } from "../../icons";
import { applyI18nDom, t } from "../../i18n";
import { getLocalLang } from "../../state";

const lang = getLocalLang();
const tt = (k: Parameters<typeof t>[1]) => t(lang, k);

const MODAL_ID = "com.obr-suite/cc-bind-picker";
const BIND_META = "com.character-cards/boundCardId";
const SCENE_META_KEY = "com.character-cards/list";
// Initiative module's per-token DEX-modifier metadata key. Mirrored
// here so binding a card automatically populates the value the
// initiative tracker uses for its tiebreaker / final-value math.
// (Source of truth lives in `modules/initiative/utils/metadata.ts`.)
const INIT_DEXMOD_META = "com.initiative-tracker/dexMod";

interface CardEntry {
  id: string;
  name: string;
  uploader: string;
  uploaded_at: string;
  url: string;
  // 2026-07 — recovery buttons feature. The token id this card is
  // CURRENTLY bound to, if any (1:1 — binding a second token to the
  // same card auto-unbinds the first, see `bindTo` below). Kept in
  // sync here (scene-level card list) rather than derived on demand
  // so the recovery buttons (panel-page.ts global row, info-page.ts
  // per-card row) can resolve "which token do I touch for this
  // card" without a scene-wide item scan.
  boundedTokenId?: string | null;
}

const params = new URLSearchParams(location.search);
const itemId = params.get("itemId");

const listEl = document.getElementById("list") as HTMLDivElement;
const curEl = document.getElementById("cur") as HTMLDivElement;
const unbindBtn = document.getElementById("unbind") as HTMLButtonElement;

function escapeHtml(s: string) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

async function getCards(): Promise<CardEntry[]> {
  try {
    const meta = await OBR.scene.getMetadata();
    const list = meta[SCENE_META_KEY];
    return Array.isArray(list) ? (list as CardEntry[]) : [];
  } catch {
    return [];
  }
}

async function getCurrentBinding(): Promise<string | null> {
  if (!itemId) return null;
  try {
    const items = await OBR.scene.items.getItems([itemId]);
    const m = items[0]?.metadata?.[BIND_META];
    return typeof m === "string" ? m : null;
  } catch {
    return null;
  }
}

// Fetch the bound card's parsed data (core_stats / abilities / etc.)
// and pull out the initiative bonus. Server URL pattern mirrors
// `info-page.ts` — both share the same `/characters/{room}/{card}/`
// layout. Returns null on any error (network, missing field, etc.)
// so the bind path stays best-effort: binding always succeeds even
// if the dex-mod prefill can't be derived.
async function fetchCardInitiative(cardId: string): Promise<number | null> {
  try {
    const roomId = (OBR.room?.id || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
    const url = `https://obr.dnd.center/characters/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/data.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    const init = d?.core_stats?.initiative;
    const n = typeof init === "number" ? init : Number(init);
    return Number.isFinite(n) ? Math.round(n) : null;
  } catch {
    return null;
  }
}

// HP/AC bubbles seed for the bound token. Mirrors the keys the
// "Stat Bubbles for D&D" plugin (and our suite's bubbles module) reads
// to draw the HP bar + heater shield. Without this the HP bar would
// only appear after the user first edited HP via the cc-info panel.
interface BubblesSeed {
  health?: number;
  maxHealth?: number;
  ac?: number;
}
async function fetchCardBubblesSeed(
  cardId: string,
): Promise<BubblesSeed | null> {
  try {
    const roomId = (OBR.room?.id || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
    const url = `https://obr.dnd.center/characters/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/data.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    const cs = d?.core_stats || {};
    const hp = cs.hp || {};
    const seed: BubblesSeed = {};
    if (typeof hp.current === "number") seed.health = hp.current;
    if (typeof hp.max === "number") seed.maxHealth = hp.max;
    if (typeof cs.ac === "number") seed.ac = cs.ac;
    return seed;
  } catch {
    return null;
  }
}

// 2026-05-15 — auto-resource bundle from the parsed card data. The
// server builds this in `_build_auto_resources` (one entry per non-
// zero spell-slot level, sorcery points, special-resource tracker).
// Each entry has the SAME shape as an OBR Resource saved on the
// token's metadata, so we can merge it directly.
interface AutoResource {
  id?: string;
  name: string;
  type?: "count" | "bar" | "number";
  current?: number;
  max: number;
  icon?: string;
}
async function fetchCardAutoResources(
  cardId: string,
): Promise<AutoResource[] | null> {
  try {
    const roomId = (OBR.room?.id || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
    const url = `https://obr.dnd.center/characters/${encodeURIComponent(roomId)}/${encodeURIComponent(cardId)}/data.json`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d = await res.json();
    const arr = d?.auto_resources;
    if (!Array.isArray(arr)) return null;
    return arr.filter(
      (r: any): r is AutoResource =>
        r &&
        typeof r === "object" &&
        typeof r.name === "string" &&
        typeof r.max === "number",
    );
  } catch {
    return null;
  }
}

const RESOURCES_KEY = "com.obr-suite/resources/data";

const BUBBLES_META = "com.obr-suite/bubbles/data";
const EXTERNAL_BUBBLES_META = "com.owlbear-rodeo-bubbles-extension/metadata";

async function bindTo(cardId: string | null) {
  if (!itemId) return;
  // Snapshot BEFORE we touch anything: which card (if any) this
  // token was previously bound to, and — if we're binding to a NEW
  // card — which OTHER token that card was previously attached to.
  // Both are needed to keep `boundedTokenId` in sync 1:1 further
  // down, without racing the writes below.
  const [previousBoundId, cardsSnapshot] = await Promise.all([
    getCurrentBinding(),
    getCards(),
  ]);
  const staleTokenId =
    cardId != null
      ? cardsSnapshot.find((c) => c.id === cardId)?.boundedTokenId
      : null;
  // Resolve the new dex-mod + bubbles seed up front (before the bind
  // write) so we can include them in the same `updateItems` call —
  // single round-trip, and the initiative tracker / bubbles bar see
  // both fields land atomically.
  let initBonus: number | null = null;
  let bubblesSeed: BubblesSeed | null = null;
  let autoResources: AutoResource[] | null = null;
  if (cardId) {
    [initBonus, bubblesSeed, autoResources] = await Promise.all([
      fetchCardInitiative(cardId),
      fetchCardBubblesSeed(cardId),
      fetchCardAutoResources(cardId),
    ]);
  }
  try {
    await OBR.scene.items.updateItems([itemId], (drafts) => {
      const d = drafts[0];
      if (!d) return;
      if (cardId) {
        d.metadata[BIND_META] = cardId;
        // Auto-prefill the initiative bonus from the card data. We
        // only WRITE the value (don't add the token to initiative)
        // — the user adds tokens to initiative explicitly via the
        // right-click menu. Only writes when we successfully read
        // the bonus; otherwise leaves any existing value alone.
        if (initBonus != null) d.metadata[INIT_DEXMOD_META] = initBonus;
        // Seed bubbles HP/AC from the card data. Character cards
        // take priority over bestiary spawn data — if the user
        // cc-binds a token that was previously a bestiary monster,
        // we OVERWRITE the monster's HP/AC with the card's values
        // so the bar reflects the player character, not the
        // monster. Per user spec: "if both bindings exist, char
        // card data wins". Hide flag is cleared too (player chars
        // are visible to everyone by default; the new lock toggle
        // controls combat-gated visibility instead).
        if (bubblesSeed) {
          const existing =
            (d.metadata[BUBBLES_META] as Record<string, unknown>) ??
            (d.metadata[EXTERNAL_BUBBLES_META] as Record<string, unknown>) ??
            {};
          const seed: Record<string, unknown> = { ...existing };
          if (typeof bubblesSeed.health === "number")
            seed.health = bubblesSeed.health;
          if (typeof bubblesSeed.maxHealth === "number")
            seed["max health"] = bubblesSeed.maxHealth;
          if (typeof bubblesSeed.ac === "number")
            seed["armor class"] = bubblesSeed.ac;
          if (!("temporary health" in seed)) seed["temporary health"] = 0;
          // Clear legacy GM-only flag from a prior bestiary bind so
          // the new lock toggle (default true) is the active gate.
          delete seed.hide;
          d.metadata[BUBBLES_META] = seed;
          if (d.metadata[EXTERNAL_BUBBLES_META] != null)
            d.metadata[EXTERNAL_BUBBLES_META] = seed;
        }
        // 2026-05-15 — auto-resource merge. Spec: only NAME + MAX is
        // applied; if a resource with the same name already exists
        // we update ITS MAX only (preserve current). New names get a
        // full insert with current=max and the parser's icon hint.
        // This way a player who's used 2/4 spell slots keeps the
        // "2 left" state when the DM re-binds / re-parses the card.
        if (autoResources && autoResources.length > 0) {
          const cur = Array.isArray(d.metadata[RESOURCES_KEY])
            ? (d.metadata[RESOURCES_KEY] as any[]).slice()
            : [];
          const byName = new Map<string, any>(cur.map((r) => [r?.name, r]));
          for (const ar of autoResources) {
            const existing = byName.get(ar.name);
            if (existing) {
              // Only update max. Clamp `current` down if it now
              // exceeds the new max (e.g. multi-class re-level dropped
              // the slot count). Leave the rest of the entry alone.
              existing.max = ar.max;
              if (
                typeof existing.current === "number" &&
                existing.current > ar.max
              ) {
                existing.current = ar.max;
              }
            } else {
              byName.set(ar.name, {
                id:
                  ar.id ||
                  `auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                name: ar.name,
                type: ar.type || "count",
                current: typeof ar.current === "number" ? ar.current : ar.max,
                max: ar.max,
                icon: ar.icon || "gem",
              });
            }
          }
          d.metadata[RESOURCES_KEY] = [...byName.values()];
        }
      } else {
        delete d.metadata[BIND_META];
        // Unbind also clears the auto-prefilled bonus — the user
        // can re-bind to a different card or set it manually via
        // the initiative panel. Bubbles metadata is intentionally
        // LEFT as-is so the DM doesn't lose mid-session HP edits
        // when temporarily unbinding to swap cards.
        delete d.metadata[INIT_DEXMOD_META];
      }
    });

    // Enforce the 1:1 invariant: if the target card was already
    // bound to a DIFFERENT token, unbind that stale token now
    // (last bind wins). No-op if the token was already deleted.
    if (staleTokenId && staleTokenId !== itemId) {
      try {
        await OBR.scene.items.updateItems([staleTokenId], (drafts) => {
          const d = drafts[0];
          if (!d) return;
          delete d.metadata[BIND_META];
          delete d.metadata[INIT_DEXMOD_META];
        });
      } catch (e) {
        console.warn("[character-cards] stale token unbind failed", e);
      }
    }

    // Sync `boundedTokenId` on the scene-level card list: clear it
    // from whatever card this token was previously attached to (if
    // any) and set it on the new target card (bind) or leave it
    // cleared (unbind, cardId === null).
    try {
      const meta = await OBR.scene.getMetadata();
      const list = Array.isArray(meta[SCENE_META_KEY])
        ? ((meta[SCENE_META_KEY] as CardEntry[]).slice())
        : [];
      const next = list.map((c) => {
        if (
          previousBoundId &&
          c.id === previousBoundId &&
          c.boundedTokenId === itemId
        ) {
          return { ...c, boundedTokenId: null };
        }
        if (cardId && c.id === cardId) {
          return { ...c, boundedTokenId: itemId };
        }
        return c;
      });
      await OBR.scene.setMetadata({ [SCENE_META_KEY]: next });
    } catch (e) {
      console.warn("[character-cards] boundedTokenId sync failed", e);
    }

    if (cardId) {
      try {
        const items = await OBR.scene.items.getItems([itemId]);
        const token = items[0];
        const playerId = token?.createdUserId as string | undefined;
        if (playerId) {
          await OBR.broadcast.sendMessage("com.character-cards/ensure-owner", {
            cardId,
            playerId,
          });
        }
      } catch (e) {
        console.warn("[character-cards] Auto-owner broadcast failed", e);
      }
    }
    // Toast removed per user feedback — actions are visible enough on
    // the modal that closes itself.
  } catch (e) {
    console.error("[character-cards] bind failed", e);
  }
  try {
    await OBR.modal.close(MODAL_ID);
  } catch {}
}

OBR.onReady(async () => {
  applyI18nDom(lang);
  const [cards, boundId] = await Promise.all([getCards(), getCurrentBinding()]);

  if (boundId) {
    const boundCard = cards.find((c) => c.id === boundId);
    curEl.textContent = boundCard
      ? `${tt("ccBindCurrent")}: ${boundCard.name}`
      : `${tt("ccBindCurrent")}: ${tt("ccBindCardDeleted")}`;
    unbindBtn.style.display = "inline-block";
    unbindBtn.addEventListener("click", () => bindTo(null));
  }

  if (cards.length === 0) {
    listEl.innerHTML = `<div class="empty">${tt("ccBindNoCards")}<br>${tt("ccBindUploadHint")} ${ICONS.idCard} ${tt("ccBindUploadHint2")}</div>`;
    return;
  }

  listEl.innerHTML = "";
  for (const c of cards) {
    const el = document.createElement("div");
    el.className = "card" + (c.id === boundId ? " cur" : "");
    el.innerHTML = `<span class="n">${escapeHtml(c.name)}</span><span class="m">${escapeHtml(c.uploader || "")}</span>`;
    el.addEventListener("click", () => bindTo(c.id));
    listEl.appendChild(el);
  }
});

OBR.broadcast.onMessage("com.character-cards/ensure-owner", async (event) => {
  const { cardId, playerId } = event.data as {
    cardId?: string;
    playerId?: string;
  };
  if (cardId && playerId) {
    try {
      await OBR.broadcast.sendMessage(
        "com.character-cards/ensure-owner-internal",
        { cardId, playerId },
      );
    } catch {}
  }
});
