# Changelog

All notable changes to this project follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Status Tracker horizontal / vertical offset** (Settings → Status Tracker, room-wide, scene px −200 … 200), like the HP bubbles' vertical offset.
- **Status levels in steps of 0.5** (−/+ and typed values snap to the nearest half; −99 … 99).
- **Shift+C** shows / hides the Chase Tracker panel (same as Tools Suite → Chase Tracker).

### Fixed

- **Status library empty / “Restore D&D 5e” failing** in rooms whose metadata (16 KB shared by every extension) was nearly full. The library is now stored as a diff against the built-in presets (`{ v: 2, c, d }`): an untouched room stores nothing, and the old full-list format is converted on the GM's next load. Preset titles follow each viewer's language. Save errors caused by a full room now say so and list the biggest room-metadata keys; the Metadata Inspector's Room tab shows the room's total size.


## [2.0.0] — 2026-10-10

Breaking: the old full-screen Status Tracker is replaced by the new Status Tracker (status chips). Buffs stored by the old tracker on tokens are no longer drawn.

### Added

- **`bubbles` module** — HP / temp-HP / AC indicators on tokens, derived from the upstream Stat Bubbles plugin. Per-client toggle in Settings → 头顶气泡.
- **Chase Tracker module.** GM right-click entries "Add to Chase as Quarry" (starts a new chase) and "Add to Chase as Pursuer" (modal listing the existing chases by quarry). Tokens in a chase carry `com.obr-suite/chase-tracker/memberOf`, which hides both entries. A draggable popover (`chase-tracker.html`, default bottom-center, part of the layout editor / reset flow) shows each chase as a 1-D track: quarry on the right, position 0 on the left, pursuers placed by their gap from the quarry. Clicking a pin — or that token's initiative turn starting — opens an inline distance editor docked in the footer. Trash icon deletes a chase, ✕ removes a participant, the list scrolls when there are many chases. Hidden on mobile clients.
- **Tools Suite / GM Tools Suite.** Two umbrella toolbar buttons replace the individual module icons. Each opens a side flyout (`suite-menu.html`) next to the right toolbar; modules add their rows with `registerSuiteItem()` / `unregisterSuiteItem()`. Canvas tools keep a hidden `createMode` that the menu activates, so drag/click handlers work unchanged. New icons: backpack (Tools Suite), GM screen (GM Tools Suite).
- **Room Chat module.** Draggable chat popover with three channels — All, GM (whisper to the GM) and Player (whisper to one chosen player). Whispers are filtered client-side. Per-room history; the trash button clears your own history, and the GM can also clear it for everyone. New icon: two speech bubbles.
- **Spell casting from character cards.** ✨ on a spell in the full sheet, or a click on a spell chip in the mini panel, opens the "Activation: Casting Spell" modal (`spell-cast.html` for the mini panel). It shows the spell, the level select (from the spell's level up to 9th) and an editable Save DC prefilled from the card. Confirming posts a cast card to Room Chat: spell name, cast level, school · casting time · range · components · duration, source, the full description, and "(DC X)" — or "(DC X - Edited)" when the DC was changed — when the spell forces a saving throw.
- **Spell details in the sheet and in chat.** A ▾ toggle shows or hides the full description; 🔍 opens the spell in the search bar. In edit mode the toggle exposes school, casting time, range, components, duration and description; editing a library spell marks it as `Homebrew`. When a spell exists in several library sources, a Source select picks which one to use.
- **Clickable dice and upcasting in chat.** Dice expressions in a cast description (`2d6`, `1d10+3`, …) open the quick-roll popup. Casting above the base level rewrites the dice from the library's `{@scaledamage}` / `{@scaledice}` tags (Fireball at 5th: 8d6 → 10d6); cantrips scale with the caster's character level via `scalingLevelDice` (Fire Bolt at level 5: 1d10 → 2d10). Rewritten dice are highlighted in gold with an "Upcast" / "Scaled" line. Hand-edited descriptions are not rescaled.
- **New Status Tracker** (module id `statusTester`, replaces the old full-screen tracker). Statuses are chips with an icon (built-in SVG or emoji), a colour and a title, with an optional image overlaid on the token. Room-wide library (Tools Suite → Status Tracker, or Shift+S — `]` needed AltGr on non-US layouts); GM edits it, players apply statuses to their own tokens via right-click. Several statuses rotate every 5 s; hovering a chip lists every status on that token, no selection needed; clicking it shows a gear that opens the per-token manager. The GM can hide a status from players. Chips pause while the camera or a token moves. Ships the 15 D&D 5e (2014) conditions and 12 common buffs as presets with dedicated icons, plus a "Restore D&D 5e" button.
- **Status palette with drag-and-drop.** Shift+S / Tools Suite → Status Tracker opens a draggable palette of the library's chips (`status-tester-palette.html`). Dragging a chip hands the gesture to a fullscreen drop modal (`status-tester-drop.html`) that outlines every token you may manage and adds the status to the one you release on (GM: Shift = hidden from players; no duplicates). Clicking a chip adds it to the selected tokens. The palette and the Chase Tracker dock are now layout-editor panels, shown even while closed.
- **Status Tracker settings** (Settings → Status Tracker). Personal: rotation interval (off / 3–12 s; off shows the first status with “+N”), chip / icon / text size, hover list, attachment images, GM “hidden by default”. Room-wide (GM): chip position (top / bottom / left / right of the token) and player permissions (view only / own tokens / + edit library).
- **Status levels.** A library status can have levels (“Has levels”); its chip reads “Exhaustion 3” and the level (whole number, negatives allowed) is edited in the token's manage window. The Exhaustion preset has levels on (existing rooms are upgraded once). A status can no longer be added twice to the same token.
- **Chase Tracker settings** (Settings → Chase Tracker). Room-wide (GM): −/+ step (grid scale or 1 / 5 / 10 / 30), unit label (scene / ft / m / none), what players see (all / distances only — quarry hidden / nothing), who moves (GM / token owners). Personal: follow initiative, open automatically. New Tools Suite row “Chase Tracker” shows / hides the panel by hand.
- **`src/utils/libraryIndex.ts`** — shared library-index loading (enabled libraries, disabled sources, data version, local content, localStorage cache) used by both the search bar and the spell picker.

### Changed

- **Old Status Tracker removed from the suite** (module no longer registered, settings tab dropped; source kept in `src/modules/statusTracker/`). Buffs stored by it on tokens are no longer drawn.
- **License changed from PolyForm Noncommercial 1.0.0 → GNU GPL-3.0.** Strong copyleft. Done deliberately so the new `bubbles` module can derive from [Stat Bubbles for D&D](https://github.com/SeamusFinlayson/Bubbles-for-Owlbear-Rodeo) (also GPL-3.0) without an incompatibility. README, store listing, settings UI, and changelog all updated to reflect the new terms.
- **Spell picker** shows English names only when the UI language is English.
- **Spell lookup follows the same library sources** as the search bar: enabled libraries, disabled sources and Data Version (2014 / 2024 / all).
- **Cast modal lists every level** from the spell's own level up to 9th, regardless of the slots recorded on the card.

### Fixed

- **Tools Suite keybinds did nothing.** OBR only fires an action shortcut while the action is available for the active tool: CapsLock (character sheet) used a never-matching filter, and Shift+A (bestiary) / `]` (status) ignored the default Move tool. All shortcuts now share `SHORTCUT_TOOLS` (Move, Select, Tools Suite, GM Tools Suite).
- **Spell descriptions shown in Chinese in the full sheet.** The nested `cc-fullscreen` iframe has no working OBR SDK and fell back to the default library settings; `cc-panel` now relays the real suite state (`cc-request-suite-state` / `cc-suite-state`), and `state.ts` gains `whenStateReady()`, `gateStateOn()`, `expectRelayedState()` and `applyRelayedState()`.
- **Library spells not found.** Rows are now matched on `ENG_name` (the `name` field is localized on some libraries).

### Security

- **Anti-cheat redaction of GM hidden rolls.** Other clients now receive only the dice count/types (for the sound), with `redacted: true` and an explicit `redactedReason`; values, total, modifier, label and token never leave the GM's client.
- **XSS hardening.** Dice history / panel / replay sanitise every received or stored roll (`sanitizeRollPayload`); search preview, monster info popover, character-card info popover and the charges-recharge modal escape all library / card / player-supplied values. New shared `src/utils/html.ts` `escapeHtml`.
- **Broadcast sender checks** (`src/utils/broadcastAuth.ts`): local-only channels (portals, trickster, transform, quick roll, dice panel toggle, chat popover relays) accept only messages from the same client; GM actions (time stop, chat clear-for-everyone, recovery trigger, camera focus, portal blink) accept only messages from a GM. Chat messages get their sender id/name/colour/role from the real connection, not from the payload.

### Fixed (review)

- **"Bulk bind to bestiary"** removed bindings instead of opening the monster picker.
- **Fullscreen character sheet** never received updates and silently overwrote concurrent edits: updates are now relayed by cc-panel (reload, or a "changed by another user" banner while editing), broadcasts from the sheet go through cc-panel, and saves check `_saved_at` on the server before overwriting.
- **Cross-scene settings sync** bounced changes and could not be turned off: the room mirror is written before the scene, and only the GM's background iframe copies it onto the scene.
- **World-pack "replace" import** deleted the scene before knowing the import would succeed: the pack is validated first, new items are added before the old ones are removed, and a partial import can be rolled back.
- **Fog walls / door markers** duplicated by overlapping syncs (stale walls blocking vision): one sync at a time, and door markers are rebuilt only when their path, openings or map transform change.

## [1.0.7] — 2026-04-29

Polish pass on the bestiary group-saves popover (introduced in 1.0.6).

### Added

- **Right-click context menu on each ability button.** Right-clicking 力量 / 敏捷 / 体质 / 智力 / 感知 / 魅力 (or Str / Dex / Con / Int / Wis / Cha in EN) opens the suite's standard rollable context menu in a new "groupSave" mode: 投掷 / 暗骰 / 优势 / 劣势 (the 添加到骰盘 entry is intentionally hidden because each token has a different per-bonus expression and a single tray entry can't represent the group). The menu broadcasts to a new `BC_GROUP_SAVE_FIRE` channel that carries `{ ability, hidden?, advMode? }`; the bestiary group-saves bg module receives the broadcast and fires per-token rolls with each monster's own save bonus, propagating the dark-roll / advantage flags through the existing `fireQuickRoll → handleQuickRoll → broadcastDiceRoll` pipeline.

### Changed

- **Full ability names instead of one-character abbreviations.** Buttons used to show a single ZH character (力 / 敏 / 体 / 智 / 感 / 魅) — the popover is wide enough to show the full word, so the labels now read 力量 / 敏捷 / 体质 / 智力 / 感知 / 魅力. EN labels stay at the standard three-letter abbreviation (Str / Dex / Con / Int / Wis / Cha) which is the canonical D&D form. The hint line changed to "左键投掷 · 右键更多" / "left-click roll · right-click more" so the new gesture is discoverable.
- **Bigger border-radius + safer corner padding to match the suite's rounded popover host.** Bumped `.box` border-radius from 10 → 16 px (cluster uses 14, the suite's host clips at ~12-14, so 16 leaves a margin on both sides), inset the box 1px so the host's own border doesn't eat our edge, and bumped `.row` padding from 6 → 8/10 px so the bottom-corner buttons sit clear of the 16px arc.

### Fixed

- **`dice-rollable-menu.html` now respects a `?groupSave=1&ability=<key>` mode.** When the URL carries those params, the menu drops the 添加到骰盘 / Add to Tray item and routes 投掷 / 暗骰 / 优势 / 劣势 clicks to `BC_GROUP_SAVE_FIRE` instead of `BC_QUICK_ROLL`. Single-roll callers (bestiary monster info, character card info, search preview) are unaffected.

## [1.0.6] — 2026-04-29

### Added

- **Bestiary group-saves popover.** When the GM selects 2+ tokens that are ALL bound to bestiary monsters, a 360×96 popover auto-shows just below the initiative tracker's collapsed position (top=95, centered) with six ability buttons (STR / DEX / CON / INT / WIS / CHA). Clicking any ability fires a collective save: each selected token rolls 1d20 + its OWN save bonus (proficient saves use the listed `m.save.<ability>`, otherwise the floor((score-10)/2) modifier). All N rolls share one collectiveId so they appear as one collective row in the dice history popover. Popover hides automatically when the selection changes to anything other than ≥2 monsters.
  - New module `src/modules/bestiary/group-saves.ts` (paired lifecycle with the bestiary module's setup/teardown).
  - New iframe `bestiary-group-saves.html` (inline ESM script, reads `localStorage["obr-suite/lang"]` for ZH / EN labels). Wired into Vite's `rollupOptions.input`.

### Changed

- **Dice panel collective camera focus skips zoom-to-fit when the bbox already fits in the viewport.** Earlier every multi-target roll called `OBR.viewport.animateToBounds(bbox)`, which yanked the GM's framing closer even when they were already zoomed wide enough to see everything. Now the focus path projects the bbox corners through the current viewport transform; if they all land inside `[0, vw] × [0, vh]` (with 2px slack), the camera stays put. Only fires `animateToBounds` when at least one target sits off-screen or partially clipped — i.e. when the user genuinely needs the camera to move.

## [1.0.5] — 2026-04-29

Redesign of the collective-roll display in the dice history popover, reverting 1.0.4's aggregate-total approach.

### Changed

- **Collective rolls now render as one independent pill per member.** 1.0.4 concatenated every member's dice into one strip with a sum-of-totals on the right. Per user feedback that's not the right mental model — each token's roll should stand on its own. Rebuilt as a `.member-strip` flex-wrap container holding one `.member-card` per token, each showing that token's own dice + modifier + total in a small bordered box. The strip wraps when there are too many cards to fit on one line. No aggregate total. Same layout used in BOTH the popover row (each player's latest collective) and the detail view's collective entry.
- **Collective entries in the detail view now use the standard `.entry` chrome** (with a green left-border `.coll-entry` modifier) instead of the bespoke `.coll-box / .coll-head / .coll-members / .entry-tight` structure. The `.entry` click-to-replay handler picks them up automatically — no special wiring needed.

### Fixed

- **Detail-view collective entries used to render as 0-height non-clickable items.** The previous `.coll-box > .coll-members > .entry-tight × N` structure had a layout interaction with the recent `.formula > .dice-list + .total` split that collapsed the inner rows. Replacing it with the unified `.entry.coll-entry > .body > .member-strip` structure both fixes the layout and routes clicks through the existing `.entry` handler so each collective is reliably clickable to fire the replay overlay.

## [1.0.4] — 2026-04-29

### Changed

- **Dice history popover row now aggregates collective rolls.** Previously a 4-token collective showed only the head token's dice on the popover row (e.g. "🎲6 = 6"), forcing the user to click into the detail view to see the other 3 tokens' results. Now collective rows concatenate every member's dice into one strip and display the sum-of-totals on the right with a "∑" prefix and green tint, so a 4-token 1d6 collective reads as "🎲6 🎲4 🎲2 🎲5 ∑ = 17" at a glance. Per-member modifiers are intentionally not shown separately — they're already baked into each member's total, and stacking "+5 +5 +5 +5" would be visual noise. Solo rolls keep the existing per-entry formula.
- **Dice chips wrap to multiple lines when crowded, total stays right-anchored.** Restructured the `.formula` row into a `.dice-list` (flex-wrapping) + `.total` (sticky right) two-column flex layout. Earlier the row used `flex-wrap:nowrap; overflow:hidden; white-space:nowrap`, which silently clipped long dice strips (e.g. a `repeat(5, 2d20)` rolled across multiple targets). Now the strip wraps to as many lines as it needs while the sum/total stays pinned to the right edge of the row.

## [1.0.3] — 2026-04-29

### Fixed

- **Dice history detail-view crash on collective rolls.** Clicking a player row whose latest roll was part of a collective threw `Cannot read properties of null (reading 'collectiveId')` and froze the slide-in detail view, leaving the user staring at the popover row's single head-token formula with no way to inspect every member of the group. Root cause was a long-standing logic bug in `renderDetail`: it tracked "already-grouped" entries by setting them to `null` in the local `entries` array, but the outer `while (i < entries.length)` loop didn't skip nullified positions, so the next iteration crashed on `entries[i].collectiveId`. Replaced with a `Set<number>` of consumed indices that both loops respect — entries array stays untouched, no null state to trip over.

## [1.0.2] — 2026-04-29

UI English-localization sweep. The cluster + Settings + Initiative panels were already bilingual since 1.0.0; this pass closes the remaining gaps so the EN-mode user no longer sees Chinese chrome in the dice / portal / character-card / search / bestiary popovers.

### Added

- ~100 new translation keys in `src/i18n.ts` covering: dice panel (tabs, dice hint, expression-rules guide × 10 lines, examples, action buttons, combo card buttons, history empty/all, formatAgo, shake reasons, prompts), dice history popover (title, dark/collective tags, player, back, empty states, formatAgo), dice rollable context menu, dice replay overlay hint, portal edit (title, name/tag inputs, presets, delete confirm), portal destination modal (title, sub line, empty, hidden tag, cancel), portal tool labels and `(unnamed)` fallback, character-card bind modal (title, unbind, loading, footer hint, current/deleted), character-card panel (download template, choose-file button, refresh hint, empty states, upload/refresh status messages, timeAgo), search-bar aria-label, bestiary panel (DM-only, picker hint, search placeholder, sort title, empty, loading).
- New `applyI18nDom(lang, root?)` helper in `i18n.ts` that walks the DOM and translates elements carrying `data-i18n` / `data-i18n-html` / `data-i18n-placeholder` / `data-i18n-title` / `data-i18n-aria` attributes. Iframes apply translations once at startup and re-apply via `onLangChange` so toggling the language in Settings updates open popovers immediately.
- HTML files annotated with `data-i18n*` attributes. Inline-script iframes (`dice-rollable-menu`, `portal-destination`, `dice-replay`) read `localStorage["obr-suite/lang"]` directly to translate before the OBR SDK boots, since they import OBR via the esm.sh CDN and can't reach the bundled `i18n.ts`.

### Fixed

- EN-mode users no longer see Chinese in: dice panel tabs ("投掷"/"组合"/"历史"), dice expression rules block, dice rollable right-click menu, dice history popover ("投骰记录" / "暗" / "集体" / "← 返回"), portal create/edit popover ("传送门" title / "新建传送门" / "删除传送门"), portal destination modal ("选择目的地（N 个单位）"), character-card bind modal, character-card panel side rail (download/upload hints, refresh tooltips), bestiary panel (search placeholder / sort / empty / picker hint), search-bar aria-label.
- Dynamic strings produced by `panel-page.ts` / `history-page.ts` / `edit-page.ts` (combo names, history filter buttons, "刚刚" / "min 前" relative timestamps, error toasts, confirm prompts) now go through `t(lang, key)` instead of hardcoded Chinese.

### Notes

- Data-layer text (5etools tag rendering, monster stat-block labels in `monster-info-page.ts`, character-card stat labels in `info-page.ts`, search category names) intentionally NOT translated — those describe game data semantics, not suite chrome.
- The default portal name presets (`一楼/二楼/三楼/地下室`) live in localStorage on first use and are user-editable, so they're left as-is rather than being i18n'd.

## [1.0.1] — 2026-04-29

Quality-of-life improvements after the public 1.0.0 launch.

### Added

- **Character card refresh** — every card row in the cc-panel side list now has a `↻` button that re-opens a file picker for the same xlsx. The server's new `/api/character/refresh` endpoint overwrites the existing card's `data.json` + rendered HTML in place, and broadcasts to other clients so all open card iframes reload simultaneously. Replaces the delete-and-re-upload workaround. (FSA-based persistent handles attempted then dropped — cross-origin iframes block the API.)
- **Bestiary "auto-add to initiative on spawn" toggle** — Settings → 怪物图鉴 now exposes `bestiaryAutoInitiative` (default ON, persisted in scene metadata). When OFF, freshly-spawned monsters skip the initiative metadata so the DM can pre-stage tokens during prep without polluting the initiative bar.
- **Token bestiary bind / replace / unbind context menus** — right-click any token to attach (or detach) a bestiary monster reference, automatically rewriting bubbles HP / AC / name / DEX modifier.
- **Backers credits block** — Support tab lists named Afdian backers as rainbow-glowing chips, animation phase staggered by index so the row ripples instead of pulsing in lockstep.

### Fixed

- Dice `refreshBadges()` was double-counting un-wrapped dice (1d20 displayed badge "2") because the backward-compat shim aliased `parsed.plain` to `outerPlain` for zero-segment expressions. Iterates `segments[*].plain` + `outerPlain` explicitly now.
- One-shot legacy portal item migration: portals created when `ICON_SIZE` was 96 are silently bumped to the current 64×64 on bestiary tool setup, killing the "content size 96 does not match image size 64" OBR warning.

### Removed

- Hidden-iframe HTTP-cache prewarm experiment for 不全书 — the site is fronted by a Cloudflare bot challenge, the prewarm iframe never finishes booting (CSP violations + 404s on the challenge's scripts), and the cache never gets primed. Reverted to honest cold-loading on every cc-panel open.

### Distribution

- Submitted to the OBR Extension Showcase via [PR owlbear-rodeo/extensions#142](https://github.com/owlbear-rodeo/extensions/pull/142). Awaiting review.

## [1.0.0] — 2026-04-28

First public release. Renamed from "枭熊插件 / Owl Suite" (working title) to **Full Suite**.

### Modules

- **Dice** — top-left action popover panel. Expression parser supporting `adv`, `dis`, `max`, `min`, `reset`, `burst`, `same`, `repeat`, with independent multi-segment parsing (`adv(1d6)+adv(1d4)` rolls two separate advantage rolls). Per-token quick rolls via 5etools tag click handlers. Right-click context menu: Roll / Dark Roll / Advantage / Disadvantage / Add to Tray. Dice history popover (bottom-left) with player rows, click-to-detail, and click-to-replay speech bubbles above involved tokens. Web Audio sample playback (`dice.mp3` per die, `cartoon.mp3` for the climax punch) plus synthesized SFX for the rest of the animation pipeline. Cross-iframe SFX broadcast so the action panel iframe can play sounds when the dice-effect modal can't.
- **Initiative Tracker** — top-anchored horizontal strip with combat start, turn cycling, automatic camera focus, owner-aware roll and end-turn for player-owned tokens, optional Dice+ integration with local-roll fallback.
- **Bestiary** — DM-only side panel with 5etools monster search and one-click spawn. Auto-popup monster info on token select. Right-click context menu on tokens: Bind Monster (no slug) / Replace Monster (has slug) / Unbind Monster, with bubbles HP/AC and name auto-rewritten on bind.
- **Character Cards** — xlsx upload, parsed to a web view via the bundled Chinese D&D community 悲灵 v1.0.12 template, owner-aware quick rolls on ability scores, skills, weapon attack and damage, and clickable Trait / Feat / Spell chips that fill the global search input.
- **Global Search** — top-right floating popover over the kiwee.top 5etools mirror. Hover-to-preview right pane, click-to-pin. Settings → Libraries supports adding custom data sources following the same `search/index.json` + `data/*.json` layout.
- **Time Stop** — DM right-click action that disables player canvas input and fades cinematic black bars in/out for everyone.
- **Sync Viewport** — DM-triggered camera pan that moves every player's view to a target point or selected token, with confirmation chime.
- **Portals** — left-rail tool. Drag-circle creates a scene portal; same-tag portals teleport multi-selected tokens in a hex spiral. Editing popover provides name and tag input with localStorage-backed presets. Token light metadata is snapshot, removed during the position update, and restored 1:1 afterward to bypass the Dynamic Fog extension's light-source rejection. Drag-end detection only — programmatic position changes from teleport itself are suppressed via a 700 ms `recentlyTeleported` window so the destination doesn't immediately re-trigger the portal panel.

### UI

- Cluster popover (bottom-right) with module toggles, language switch, and inline action shortcuts.
- Settings popover (centered, tabbed) for module enable/disable, data version (2014 / 2024 / all), language, sound, support links, and library management.
- Bilingual UI throughout (CN / EN), per-client localStorage preference.
- All Chinese-character UI icons replaced with vector SVG glyphs.

### Tooling and infrastructure

- Vite build with manualChunks-isolated `vendor` chunk to avoid circular ESM dep between the OBR SDK runtime and user code.
- Self-hosted at `obr.dnd.center` (Alibaba Cloud) with Let's Encrypt HTTPS and an nginx config that disables HTML caching to prevent stale references to old hashed JS chunks after redeploys.
- License: PolyForm Noncommercial 1.0.0.
