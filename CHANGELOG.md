# Changelog

All notable changes to this project follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Own character-card backend.** Character cards are stored by a separate project, **echo-version-backend** (Cloudflare Worker + D1), instead of obr.dnd.center: create from JSON, upload a JSON, save, delete (soft: 30-day trash, purged by a daily cron), read `data.json`; the previous version of a card is kept. The server only stores JSON (size-limited, checked to be a card, ids validated, no listing, CORS limited to the suite's origins). Cards created on obr.dnd.center are copied over the first time they're opened. The suite finds it through `VITE_CC_BACKEND` (`.env`, and the Pages build environment).
- **SRD 5.1 character sheet (xlsx).** New template `SRD-5.1-Character-Sheet.xlsx` (download from the Character Cards panel): fillable sheet with SRD 5.1 lists only (races, classes, subclasses, armor, weapons, spells, skills…), calculated modifiers / saves / skills / AC / spell DC / weapon attacks with override cells, and conversion keys — named ranges `cc.…` listed on its Keys tab. The suite converts it to the card JSON in the browser (`xlsx-import.ts`), on upload and on refresh. The old 悲灵 / GSheet sheets were parsed by obr.dnd.center and are no longer accepted (cards already made from them keep working).
- **HP bar: show token name.** New “Show token name” option in the HP Bubbles settings (DM, off by default). When on, the token's right-click menu offers “Show / Hide token name” (off by default on every token) and “Edit name tag” (the token's name + the tag colour, with presets; “Default color” = the suite dark blue; with several tokens selected only the colour). A shown name is drawn as one mask around the HP bar and AC: a rim around the bar rising into a tab with a slanted left edge, the name left-aligned in bold, and a raised corner behind the AC shield; text black or white for contrast. Renaming writes the token's OBR label when it has one, otherwise the item name. GM: any token; players: their own.
- **Secret activations.** The spell cast, feature use and short-rest hit
  dice windows have a "Secret" checkbox (remembered per browser): the chat
  card becomes a whisper only the caster and the GM see (marked "Secret"),
  any dice it rolls are secret rolls (caster + GM in the dice history) and
  the resource toast stays on the caster's screen.
- **Status levels as grid distances.** New “Level is a grid distance” option (Status library, under “Has levels”): the level starts at one grid square, − / + step by the scene's grid scale (5 ft, 1.5 m, …) and the chip shows the unit — “Flying 30 ft”. Follows the scene grid when it changes. Level limits widened to ±9999 for distances. A status level (and its unit) is shown in italics on the chip.

### Fixed

- **Status library takes ~3× less room metadata.** The library is stored packed (deflated, format v3) and image attachments live in their own map instead of inside the definitions, so linking an image to a preset no longer saves a full copy of it (its title keeps following each viewer's language). About 80 bytes per status with an image instead of ~240 (50 statuses with images ≈ 4 KB instead of ≈ 12 KB). Older rooms are converted when the GM loads the room; clients on an older version of the suite see only the presets until they update. The library page now warns above 3 KB.
- **Less room metadata for the cross-scene card list.** The room copy of the character-card list (`com.character-cards/list-room`) is stored deflated (about a quarter of the size; older rooms are converted when the GM loads the room). Room metadata is 16 KB for every extension together, and a full room made saves fail (e.g. linking an image to a status).
- **Status emojis look the same everywhere.** The map chip used the operating system's emoji font (drawn by OBR) while the library, palette, drop and hover lists used the browser's, so the same emoji looked different. All of them now show the same OpenMoji image (openmoji via jsDelivr); if an image can't be loaded the emoji text is shown as before.
- **Status hover list no longer pops up over open panels.** A status chip covered by the Room Chat, the initiative panel or the dice history (while open) gets no hover area, so moving the mouse over the panel doesn't open the token's status list on top of it.
- **“Die Roll” resources spent from a cast / use window now roll their dice.** Spending one opens the quick-roll popup with the resource's formula (multiplied by the amount spent: 2 × “1d6” → “2d6”), like spending it from the Resource Tracker; before, only the count went down.

## [2.1.0] — 2026-10-11

### Added

- **The character sheet minimizes after an action.** Casting a spell or using a feature (once the card is in chat), a roll started from the sheet (once it actually fires, not when the advantage popup opens) and a short rest that opens the hit dice window close the sheet and show a small bar with the character's name at the bottom of the screen. Clicking it reopens the sheet on the same card, tab and scroll position; ✕ hides the bar. Opening the sheet any other way hides it too.
- **Feature search in edit mode.** The “+” on Class Features, Race Features, Fighting Style, Special Abilities and Feats opens a picker like the spells' one: step-by-step browsing of the library — types → Class features → class (its features by level, then its subclasses → subclass features by level); Feats → book → feats; Fighting styles / Maneuvers / Metamagic / … → features — with a breadcrumb / Back, a search box that filters the current step, and “add as typed”. Class Features opens on the class list, Fighting Style and Feats on their own type. A “Source” select (All sources / PHB / XPHB / TCE …) filters the class list, a class's own features, a subclass's features and the optional-feature types; the class and subclass rows list the books they come from, and a class page always lists every subclass (whatever its book). Sources show their full book name (“Player's Handbook (2014) · PHB”) from the library's books.json, imported homebrew `_meta` or a built-in list. Class / subclass features of locally imported homebrew (e.g. LaserLlama's classes) are read from the imported data (class, subclass, level), so their classes appear in the class list; library class features without a “<class> <level>;” name are grouped under their source. Picking one copies its description (and level for class features) onto the card.
- **Special resources: “Spell slots” and “Hit dice”.** Two new resource types in the resource editor (one of each per token). *Spell slots* holds levels 1–9 in one resource (current / max per level, a row of pips per level in every resources panel; right-click a pip refills that level) and is restored on a long rest. *Hit dice* has a die size (d6–d12) and regains half its maximum (at least 1) on a long rest. They replace the card's own spell slots / hit dice: the first time a card is shown with a bound token, its values are copied into these resources; the sheet's spell-slot grid and hit dice cell now read them (with a “Create” button when the token has none).
- **“Eligible for Spells” / “Eligible for Features”** checkboxes in the resource editor: only flagged resources are offered in the cast / use windows' “Resource spent” select.
- **Spell slot row in the cast window.** Levelled spells list the slots left (spell level and up). Picking one sets the cast level (upcast dice scaled automatically), hides the level and resource fields, and spends that slot; the chat card says which slot was used.
- **Features can be paid with a spell slot.** The use window's “Resource spent” select always has “Use a spell slot for this feature”, then a select of the slot levels left.
- **Short rest → spend hit dice.** After SR (mini panel or full sheet) a window asks how many hit dice to roll (if the token has any left): each die heals roll + CON modifier (minimum 0 per die), the roll shows in the dice toast / history, the HP goes on the token's HP bar (capped at max HP), the dice are taken off the resource and Room Chat gets a line. More dice can be rolled before closing.
- **Spend a resource when casting a spell.** The cast window (mini panel and full sheet) has a “Resource spent” select listing the bound token's Resource Tracker resources (“Ki Points (3/5)”) plus an amount. On confirm the amount is taken off that resource (never below 0, with the usual resource toast) and the chat card says “Spent: 2 × Ki Points (1/5 left)”. Without a bound token / resources the field says why and the cast works as before.
- **Features are used like spells.** Every feature (class, race, fighting style, special abilities, feats — and wondrous items in the equipment tab) has 🔍 (search bar) and ⚡ “Use” buttons in the full sheet; in the mini panel feature chips open the same window. “Use” shows the feature's description, lets you spend a resource and posts a ⚡ card to Room Chat (feature name, list, description with clickable dice, resource spent).
- **Room Chat new-message sound.** A short synthesized “water-drop” pop (a new sound, no audio file) when someone else's message or a tool notice arrives. Personal on/off toggle in Settings → Room Chat (`obr-suite/sfx-chat`, default on). Only one suite window plays it, even when several have audio unlocked.
- **Room Chat message layouts.** Typed messages are speech bubbles: your own on the left with the tail on the left, other people's on the right with the tail on the right; whispers keep a tinted bubble (purple → GM, amber → player). Tool notices (status changes, rests) have no tail and span the width, with the tool's icon and colour (Status Tracker orange, Rest green). Spell casts keep their original layout (name + time, then the spell card). Messages carry a whitelisted `tool` tag (`status` / `rest`).
- **Rests announced in Room Chat.** SR / LR / DW / DS from a character card (info panel, full sheet or the GM's global buttons) post to the “All” channel: “🏕️ X took a short rest”, “🛌 X took a long rest”, “🌅 X saw a new dawn”, “🌇 X saw a new dusk” (the GM's global buttons list every character in one line). A long rest that also restores Dawn / Dusk resources says so on the same line (“… took a long rest and saw a new dawn”).
- **Player status changes announced in Room Chat.** When a player adds / removes a status or changes its level on their own token (manage window, palette click or drag-and-drop), a line is posted to the “All” channel, e.g. “🏷️ Goblin: added Charmed”, “🏷️ Goblin: Exhaustion 1 → 1.5”. The GM's own edits are not announced.
- **Status Tracker horizontal / vertical offset** (Settings → Status Tracker, room-wide, scene px −200 … 200), like the HP bubbles' vertical offset.
- **Status levels in steps of 0.5** (−/+ and typed values snap to the nearest half; −99 … 99).
- **Shift+C** shows / hides the Chase Tracker panel (same as Tools Suite → Chase Tracker).

### Changed

- **Feature use: the resource named like the feature is preselected** (“Wild Shape (Circle of the Moon)” → “Wild Shape”, “Channel Divinity: Turn Undead” → “Channel Divinity”); with no similar name the select starts on “None”.
- **Hit dice with several die sizes (multiclassing).** The “Hit dice” resource holds one pool per die size (e.g. 3 d8 + 1 d10), edited as rows in the resource editor (“+ Add die size”). The short-rest window has a − / + counter per die size; a long rest regains half the total, biggest dice first. Existing single-size hit dice are read as one pool.
- **Spell slots / hit dice are no longer listed among the resources** (mini panel, GM tracker, the sheet's Resources tab): the sheet shows the “Spell slots” resource at the top of the Spells section (pips per level, click to spend / refill, ⚙ to edit) and the hit dice in the Hit Dice cell (with ⚙ to edit). Reordering the list keeps them untouched.
- **No emoji in tool notices.** Rest, hit dice and status-change lines in Room Chat no longer start with an emoji (the notice already shows the tool's icon); older notices in the history are shown without it too.
- **Cast / use window layout.** “Resource spent” is now the first field (no longer “optional”): spell slots first — preselected for levelled spells when one is left — then the eligible resources, else “None”. Choosing spell slots shows the slot level select; the cast level select only appears when no slot is used. The chosen resource is drawn with its own icons (to-be-spent pips highlighted, click a pip to set the amount; − / + for bars and numbers) instead of a bare number. The spell slot row added earlier is merged into this field.
- **Edited spells show “Edited” instead of “Homebrew”.** A library spell changed on the card shows its library source + an “Edited” chip (sheet details, edit fields, chat card); “Homebrew” is kept for spells the library doesn't have. Stored data is unchanged.
- **Announcement rewritten** (`public/announcement.md`): this build is presented as Valentino dell'Eco's modified version of Full Suite, crediting FullPeople and linking the original author's support page and repository; highlights and changelog for 2.0.
- **Support tab and supporters wall disabled** (Settings opens on Important Notes; the supporter overlay behind Settings is no longer opened).

### Fixed

- **Announcement title showed the upstream dev version** (“Full Suite v1.0.138-dev”): the window read `manifest-dev.json` first, and that file ships in every build. It now reads `manifest.json` on the stable build (the dev manifest only on `/suite-dev/`) and is titled “Full Suite - Echo Version (v2.0.0)”.
- **Toggling a status hidden / visible no longer resets its level.**
- **“Hidden from players” checkbox showed for players** in the status manage window (a CSS rule overrode `hidden`); it is GM-only again.
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
