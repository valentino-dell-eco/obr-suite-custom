# Full Suite — Valentino dell'Eco version

> Edit this file to change the announcement window. Each `## Heading [kind] [lang]`
> is a section; kind: [warn] [info] [issues] [highlights] [todo] [changelog] [footer].
> [zh] / [en] = shown only in that language; no tag = both.
> The megaphone blinks when the FIRST changelog line (`- X.Y.Z · …`) has a
> version the viewer hasn't opened yet — add a new line on top for each release.

## 关于这个版本 [info] [zh]

这是 **Valentino dell'Eco** 修改的 **Full Suite** 版本。
原版 Full Suite 由 **FullPeople（弗人）** 开发 —— 非常感谢原作者打下的坚实基础，这个版本的一切都建立在它之上。
如果你喜欢这个工具，请关注并支持原作者：<span style="color:#5dade2">**https://ko-fi.com/fullpeople**</span>
原版源代码：<span style="color:#5dade2">**https://github.com/FullPeople/obr-suite**</span>（GPL-3.0）

## About this version [info] [en]

This is a **modified version of Full Suite by Valentino dell'Eco**.
The original Full Suite was created by **FullPeople** — heartfelt thanks to the original author for the solid base this whole version is built on.
If you enjoy the tool, please follow and support the original author: <span style="color:#5dade2">**https://ko-fi.com/fullpeople**</span>
Original source code: <span style="color:#5dade2">**https://github.com/FullPeople/obr-suite**</span> (GPL-3.0)

## 2.1 新内容 [highlights] [zh]

- | 法术位与生命骰 | 两种特殊资源（每个 token 一个）：法术位（1–9 环）与生命骰（兼职时可有多种骰子）；角色卡中的数值会自动迁移过来
- | 激活窗口 | 施法 / 使用特性时先选择「消耗的资源」：优先法术位（自动升环），其次是勾选了「可用于法术 / 特性」的资源，用图标显示消耗多少
- | 特性像法术一样使用 | 每个特性都有 🔍 和 ⚡「使用」：可消耗资源或法术位，卡片发送到聊天；与特性同名的资源会被预选
- | 短休投生命骰 | 短休后弹出窗口选择投几个生命骰，自动计算 骰值 + 体质 的回复并加到 HP 条上
- | 角色卡 | 施法、使用特性、投骰或短休后角色卡会收成底部的小条，点击即可回到原来的页签与位置；编辑模式可按 类型 → 职业 → 特性 浏览资料库添加特性，并可按来源筛选
- | 房间聊天 | 新消息提示音、气泡布局（自己的 / 别人的 / 工具通知），休息与状态通知不再带表情

## 2.0 新内容 [highlights] [zh]

- | 全新状态追踪 | 图标 + 颜色 + 名称的状态标签，悬停查看全部状态；状态面板（Shift+S）可直接把状态拖到 token 上；内置 D&D 5e (2014) 状态与增益；支持等级（如「力竭 1.5」）
- | 追逐战追踪器 | 右键把 token 加为猎物 / 追击者，底部面板显示距离；Shift+C 显示 / 隐藏
- | 工具套件 / GM 工具套件 | 两个工具栏按钮收纳所有模块；快捷键在移动 / 选择工具下也能用
- | 房间聊天 | 所有人 / 悄悄话给 GM / 悄悄话给玩家；施法、休息、玩家的状态变化都会自动发到聊天
- | 角色卡施法 | 选择施法环阶与 DC，法术卡片发到聊天，骰子可点击，升环伤害自动计算
- | 设置 | 状态追踪与追逐战追踪器都有自己的选项（大小、位置、偏移、权限……）

## What's new in 2.1 [highlights] [en]

- | Spell slots & hit dice | Two special resources (one each per token): spell slots (levels 1–9) and hit dice (several die sizes for multiclassing); the character card's values move into them automatically
- | Activation windows | Casting a spell or using a feature starts with "Resource spent": spell slots first (automatic upcasting), then resources flagged "Eligible for Spells / Features", drawn with their own icons
- | Features work like spells | Every feature has 🔍 and ⚡ "Use": spend a resource or a spell slot and post a card to chat; a resource named like the feature is preselected
- | Short rest hit dice | After a short rest a window asks how many hit dice to roll and heals roll + CON straight onto the HP bar
- | Character sheet | After a cast, a feature use, a roll or a short rest the sheet folds into a small bar — click it to come back to the same tab and scroll position; in edit mode add features by browsing the library (type → class → feature) with a source filter
- | Room Chat | New-message sound, speech-bubble layout (yours / others / tool notices), no emoji in rest and status notices

## What's new in 2.0 [highlights] [en]

- | New Status Tracker | Status chips with icon, colour and title; hover to list every status; the status palette (Shift+S) lets you drag a status straight onto a token; D&D 5e (2014) conditions and buffs built in; levels (e.g. "Exhaustion 1.5")
- | Chase Tracker | Right-click a token to add it as quarry / pursuer; a dock shows the distances; Shift+C shows / hides it
- | Tools Suite / GM Tools Suite | Two toolbar buttons gather every module; shortcuts now work with the Move / Select tools too
- | Room Chat | All / whisper to the GM / whisper to a player; spell casts, rests and players' status changes are posted automatically
- | Spell casting from character cards | Pick the cast level and DC, the spell card goes to chat with clickable dice and automatic upcast damage
- | Settings | Status Tracker and Chase Tracker have their own options (size, position, offset, permissions…)

## 更新日志 [changelog] [zh]

- 2.1.0 · 法术位与生命骰特殊资源、激活窗口（资源 / 法术位 / 自动升环）、特性使用与资料库浏览、短休生命骰、角色卡收起为小条、聊天提示音与气泡
- 2.0.0 · 全新状态追踪（拖放、等级、预设、设置）、追逐战追踪器、工具套件、房间聊天、角色卡施法；休息与状态变化会通知到聊天；安全与稳定性修复（GM 暗骰防作弊、XSS、广播校验）

## Changelog [changelog] [en]

- 2.1.0 · Spell slot & hit dice special resources, activation windows (resources / spell slots / automatic upcasting), feature use and library browsing, short-rest hit dice, sheet folds into a bar after actions, chat sound and bubbles
- 2.0.0 · New Status Tracker (drag-and-drop, levels, presets, settings), Chase Tracker, Tools Suite, Room Chat, spell casting from character cards; rests and status changes posted to chat; security and stability fixes (GM hidden-roll anti-cheat, XSS, broadcast checks)

## 落款 [footer]

— Valentino dell'Eco · based on Full Suite by FullPeople (弗人)
