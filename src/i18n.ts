import { Language } from "./state";
export type { Language };
// Translation strings shared across all suite UI. Keep keys flat so it's
// easy to grep. Add a key once it's used in ≥2 places, or once it appears
// in user-facing copy that needs both languages.

type Dict = Record<string, { zh: string; en: string }>;

const TR: Dict = {
  // Cluster buttons
  btnTimeStop: { zh: "时停", en: "Time Stop" },
  btnFocus: { zh: "同步视口", en: "Sync Viewport" },
  btnMusic: { zh: "音乐", en: "Music" },
  btnBestiaryPopup: { zh: "怪物图鉴", en: "Bestiary" },
  btnCharCardPopup: { zh: "角色卡", en: "Character Card" },
  btnCharCardPanel: { zh: "角色卡界面", en: "Character Card Panel" },
  btnSettings: { zh: "设置", en: "Settings" },
  btnAbout: { zh: "关于", en: "About" },
  groupLabelPopups: { zh: "悬浮窗", en: "Auto Popup" },

  // Settings panel
  settingsTitle: { zh: "设置", en: "Settings" },
  settingsModules: { zh: "启用的功能", en: "Enabled Modules" },
  settingsDataVersion: { zh: "数据版本", en: "Data Version" },
  settingsLanguage: { zh: "语言", en: "Language" },
  settingsRoleNotice: {
    zh: "玩家端只读 · 由 DM 设置",
    en: "Read-only for players · Set by DM",
  },
  modTimeStop: { zh: "时停模式", en: "Time Stop" },
  modFocus: { zh: "同步视口", en: "Sync Viewport" },
  modBestiary: { zh: "怪物图鉴", en: "Bestiary" },
  modCharacterCards: { zh: "角色卡", en: "Character Cards" },
  modInitiative: { zh: "先攻追踪", en: "Initiative Tracker" },
  modSearch: { zh: "全局搜索", en: "Global Search" },
  modPortals: { zh: "传送门", en: "Portals" },
  ver2014: { zh: "2014（PHB + MM）", en: "2014 (PHB + MM)" },
  ver2024: { zh: "2024（XPHB + XMM）", en: "2024 (XPHB + XMM)" },
  verAll: { zh: "全部（2014 + 2024）", en: "All (2014 + 2024)" },
  langZh: { zh: "中文", en: "中文" },
  langEn: { zh: "English", en: "English" },
  searchAllowMonsters: {
    zh: "允许玩家查询怪物",
    en: "Players Can Search Monsters",
  },
  searchAbjuration: { zh: "防护", en: "Abjur." },
  searchConjuration: { zh: "咒法", en: "Conj." },
  searchDivination: { zh: "预言", en: "Div." },
  searchEnchantment: { zh: "附魔", en: "Ench." },
  searchEvocation: { zh: "塑能", en: "Evoc." },
  searchIllusion: { zh: "幻术", en: "Illus." },
  searchNecromancy: { zh: "死灵", en: "Necro." },
  searchTransmutation: { zh: "变化", en: "Trans." },
  searchAction: { zh: "动作", en: "1 a" },
  searchBonusAction: { zh: "附赠动作", en: "1 ba" },
  searchReaction: { zh: "反应", en: "1 rea" },
  searchMinute: { zh: "分钟", en: "1 min" },
  searchMinutes: { zh: "分钟", en: "X min" },
  searchHour: { zh: "小时", en: "1 h" },
  searchHours: { zh: "小时", en: "X h" },
  searchRound: { zh: "回合", en: "1 round" },
  searchRounds: { zh: "回合", en: "X rounds" },
  searchCategoryMonster: { zh: "怪物", en: "Monster" },
  searchCategorySpell: { zh: "法术", en: "Spell" },
  searchCategoryBackground: { zh: "背景", en: "Background" },
  searchCategoryItem: { zh: "物品", en: "Item" },
  searchCategoryClass: { zh: "职业", en: "Class" },
  searchCategoryCondition: { zh: "状态", en: "Condition" },
  searchCategoryFeat: { zh: "专长", en: "Feat" },
  searchCategoryOptionalfeature: { zh: "能力", en: "Feature" },
  searchCategoryPsionic: { zh: "灵能", en: "Psionic" },
  searchCategoryRace: { zh: "种族", en: "Race" },
  searchCategoryReward: { zh: "奖励", en: "Reward" },
  searchCategoryVariantRule: { zh: "副规则", en: "Variant Rule" },
  searchCategoryAdventure: { zh: "冒险", en: "Adventure" },
  searchCategoryDeity: { zh: "神祇", en: "Deity" },
  searchCategoryVehicle: { zh: "载具", en: "Vehicle" },
  searchCategoryTrap: { zh: "陷阱", en: "Trap" },
  searchCategoryHazard: { zh: "灾害", en: "Hazard" },
  searchCategoryBook: { zh: "整本书", en: "Book" },
  searchCategoryCult: { zh: "教派", en: "Cult" },
  searchCategoryBoon: { zh: "恩惠", en: "Boon" },
  searchCategoryDisease: { zh: "疾病", en: "Disease" },
  searchCategoryMetamagic: { zh: "超魔", en: "Metamagic" },
  searchCategoryManeuver: { zh: "招式", en: "Maneuver" },
  searchCategoryTable: { zh: "表格", en: "Table" },
  searchCategoryDeck: { zh: "牌组", en: "Deck" },
  searchCategoryArcaneShot: { zh: "奥术箭", en: "Arcane Shot" },
  searchCategoryFightingStyle: { zh: "战斗风格", en: "Fighting Style" },
  searchCategoryClassFeature: { zh: "职业能力", en: "Class Feature" },
  searchCategoryPact: { zh: "盟约", en: "Pact" },
  searchCategoryKiFeature: { zh: "武僧能力", en: "Ki Feature" },
  searchCategoryInfusion: { zh: "灌注", en: "Infusion" },
  searchCategoryVehicleUpgrade: { zh: "载具升级", en: "Vehicle Upgrade" },
  searchCategoryShipCustomization: { zh: "船定制", en: "Ship Customization" },
  searchCategoryRune: { zh: "符文", en: "Rune" },
  searchCategorySubclass: { zh: "子职业", en: "Subclass" },
  searchCategorySubclassFeature: { zh: "子职能力", en: "Subclass Feature" },
  searchCategoryAction: { zh: "动作", en: "Action" },
  searchCategoryLanguage: { zh: "语言", en: "Language" },
  searchCategoryPage: { zh: "页面", en: "Page" },
  searchCategoryMonsterLore: { zh: "怪物概述", en: "Monster Lore" },
  searchCategoryCharacterOption: { zh: "角色选项", en: "Char Option" },
  searchCategoryRecipe: { zh: "食谱", en: "Recipe" },
  searchCategoryRule: { zh: "规则", en: "Rule" },
  searchCategorySkill: { zh: "技能", en: "Skill" },
  searchCategorySense: { zh: "感官", en: "Sense" },
  searchCategoryCard: { zh: "牌内容", en: "Card" },
  searchCategoryWeaponMastery: { zh: "武器精通", en: "Weapon Mastery" },
  searchCategoryWeaponProperty: { zh: "武器属性", en: "Weapon Property" },
  searchCategoryPlace: { zh: "地点", en: "Place" },
  searchCategoryItemGroup: { zh: "物品集合", en: "Item Group" },
  searchAbilityStr: { zh: "力量", en: "Str" },
  searchAbilityDex: { zh: "敏捷", en: "Dex" },
  searchAbilityCon: { zh: "体质", en: "Con" },
  searchAbilityInt: { zh: "智力", en: "Int" },
  searchAbilityWis: { zh: "感知", en: "Wis" },
  searchAbilityCha: { zh: "魅力", en: "Cha" },
  searchAlignL: { zh: "守序", en: "Lawful" },
  searchAlignN: { zh: "中立", en: "Neutral" },
  searchAlignC: { zh: "混乱", en: "Chaotic" },
  searchAlignG: { zh: "善良", en: "Good" },
  searchAlignE: { zh: "邪恶", en: "Evil" },
  searchAlignU: { zh: "无属", en: "Unaligned" },
  searchAlignA: { zh: "任意", en: "Any" },
  searchDmgAcid: { zh: "酸", en: "Acid" },
  searchDmgBludgeoning: { zh: "钝击", en: "Bludgeoning" },
  searchDmgCold: { zh: "冷冻", en: "Cold" },
  searchDmgFire: { zh: "火焰", en: "Fire" },
  searchDmgForce: { zh: "力场", en: "Force" },
  searchDmgLightning: { zh: "闪电", en: "Lightning" },
  searchDmgNecrotic: { zh: "死灵", en: "Necrotic" },
  searchDmgPiercing: { zh: "穿刺", en: "Piercing" },
  searchDmgPoison: { zh: "毒素", en: "Poison" },
  searchDmgPsychic: { zh: "心灵", en: "Psychic" },
  searchDmgRadiant: { zh: "光耀", en: "Radiant" },
  searchDmgSlashing: { zh: "挥砍", en: "Slashing" },
  searchDmgThunder: { zh: "雷鸣", en: "Thunder" },
  searchSizeTiny: { zh: "微型", en: "Tiny" },
  searchSizeSmall: { zh: "小型", en: "Small" },
  searchSizeMedium: { zh: "中型", en: "Medium" },
  searchSizeLarge: { zh: "大型", en: "Large" },
  searchSizeHuge: { zh: "巨型", en: "Huge" },
  searchSizeGargantuan: { zh: "超巨", en: "Gargantuan" },
  searchSpellCantrip: { zh: "戏法", en: "Cantrip" },
  searchSpellLevelSuffix: { zh: " 环", en: "-level" },
  searchDistanceFeet: { zh: "尺", en: "ft." },
  searchDistanceMiles: { zh: "英里", en: "mi." },
  searchDistanceUnlimited: { zh: "无限", en: "Unlimited" },
  searchDistanceSight: { zh: "视野范围", en: "Sight" },
  searchShapeRadius: { zh: "半径", en: "Radius" },
  searchShapeCone: { zh: "锥形", en: "Cone" },
  searchShapeLine: { zh: "线状", en: "Line" },
  searchShapeSphere: { zh: "球状", en: "Sphere" },
  searchShapeCube: { zh: "立方", en: "Cube" },
  searchShapeHemisphere: { zh: "半球", en: "Hemisphere" },
  searchShapeCylinder: { zh: "圆柱", en: "Cylinder" },
  searchDurationInstant: { zh: "瞬发", en: "Instantaneous" },
  searchDurationDispelled: { zh: "永久", en: "Until Dispelled" },
  searchDurationSpecial: { zh: "特殊", en: "Special" },
  searchDurationConcentration: { zh: "专注", en: "Concentration" },
  searchDistanceSelf: { zh: "自身", en: "Self" },
  searchDistanceTouch: { zh: "触及", en: "Touch" },
  searchCost: { zh: "价值", en: "Cost" },
  searchGP: { zh: "金币", en: "gp" },
  searchGPMaterials: { zh: "金币材料", en: "gp materials" },
  searchConsumed: { zh: "消耗", en: "Consumed" },
  searchFromClass: { zh: "来源职业", en: "Available for" },
  searchPreviewIdle: {
    zh: '悬停或点击词条查看详情<br><span class="prev-empty-sub">Esc 关闭 · ↑↓ 选择</span>',
    en: 'Hover or click an entry to see details<br><span class="prev-empty-sub">Esc to close · ↑↓ to navigate</span>',
  },
  searchSkill: { zh: "技能", en: "Skills" },
  searchResist: { zh: "抗性", en: "Resistances" },
  searchImmune: { zh: "免疫", en: "Immunities" },
  searchVulnerable: { zh: "易伤", en: "Vulnerabilities" },
  searchConditionImmune: { zh: "状态免疫", en: "Condition Immunities" },
  searchSenses: { zh: "感官", en: "Senses" },
  searchPassive: { zh: "被动察觉", en: "Passive Perception" },
  searchLevelRange: { zh: "等级范围", en: "Level Range" },
  searchAuthor: { zh: "作者", en: "Author" },
  searchStoryline: { zh: "故事线", en: "Storyline" },
  searchPublished: { zh: "出版", en: "Published" },
  searchSource: { zh: "来源", en: "Source" },
  searchTrait: { zh: "特性", en: "Trait" },
  searchFeature: { zh: "能力", en: "Feature" },
  searchActions: { zh: "动作", en: "Actions" },
  searchBonus: { zh: "附赠动作", en: "Bonus Actions" },
  searchReactions: { zh: "反应", en: "Reactions" },
  searchLegendary: { zh: "传奇动作", en: "Legendary Actions" },
  searchMythic: { zh: "神话动作", en: "Mythic Actions" },
  searchLairActions: { zh: "巢穴动作", en: "Lair Actions" },
  searchRegionalEffects: { zh: "区域效应", en: "Regional Effects" },
  searchThisCreatureCan: { zh: "本怪物可执行", en: "This creature can do" },
  searchLegendaryActionText: {
    zh: "次传奇动作，从下列动作中选择，每次只能用一个传奇动作选项，且只能在另一生物的回合结束时使用。每回合开始时回复全部消耗。",
    en: " legendary actions, choosing from the options below. Only one legendary action option can be used at a time and only at the end of another creature's turn. All legendary actions refresh at the start of the creature's turn.",
  },
  searchDaily: { zh: "每日", en: "Daily" },
  searchRest: { zh: "休整", en: "Rest" },
  searchDay: { zh: "天", en: "day" },
  searchRestUsage: { zh: "次", en: "times" },
  searchSpellSlots: { zh: "个法术位", en: "spell slots" },
  searchWeaponProperties: { zh: "属性", en: "Properties" },
  searchSecondDamage: { zh: "双手", en: "Second Damage" },
  searchRange: { zh: "射程", en: "Range" },
  searchACBonus: { zh: "AC加值", en: "AC Bonus" },
  searchNoResults: { zh: "无匹配条目", en: "No matching entries" },
  searchContents: { zh: "内容", en: "Contents" },
  searchDurationRound: { zh: "回合", en: "Round" },
  searchDurationRounds: { zh: "回合", en: "Rounds" },
  searchDurationMinute: { zh: "分钟", en: "Minute" },
  searchDurationMinutes: { zh: "分钟", en: "Minutes" },
  searchDurationHour: { zh: "小时", en: "Hour" },
  searchDurationHours: { zh: "小时", en: "Hours" },
  searchDurationDay: { zh: "天", en: "Day" },
  searchDurationDays: { zh: "天", en: "Days" },
  searchDurationWeek: { zh: "周", en: "Week" },
  searchDurationWeeks: { zh: "周", en: "Weeks" },
  searchDurationMonth: { zh: "月", en: "Month" },
  searchDurationMonths: { zh: "月", en: "Months" },
  searchDurationYear: { zh: "年", en: "Year" },
  searchDurationYears: { zh: "年", en: "Years" },
  searchLibSettings: { zh: "库设置", en: "Library Settings" },
  searchPreviewReportTitle: {
    zh: "该词条没正确显示？点一下汇报，我会收集起来做适配。",
    en: "Entry not displaying correctly? Click to report, and I will gather it for adaptation.",
  },
  searchPreviewReportBtn: {
    zh: "未显示？顺手汇报",
    en: "Not showing? Report it",
  },
  searchPreviewLoading: { zh: "加载中…", en: "Loading..." },
  searchPreviewNoDetail: {
    zh: "该分类暂无内置详情",
    en: "No built-in details for this category",
  },
  searchPreviewNameSourceOnly: {
    zh: "仅显示名称与来源",
    en: "Only name and source are displayed",
  },
  searchPreviewDataMissing: {
    zh: "该来源的详情数据不在任何已启用库的镜像上",
    en: "The detailed data for this source is not on any enabled library mirror",
  },
  searchPreviewSource: { zh: "来源 ", en: "Source " },
  searchPreviewNoContentFile: {
    zh: " · 仅有搜索条目，没有对应的内容文件。",
    en: " · Only search entries exist, missing corresponding content files.",
  },
  searchPreviewSuggestDisable: {
    zh: "建议在「<b>设置 → 库设置</b>」临时关掉「<b>5etools (kiwee.top, 合作版)</b>」等收录该来源的库，或等镜像维护者补齐数据文件。",
    en: 'It is recommended to temporarily disable libraries like "5etools (kiwee.top, Partnered)" in "Settings → Library Settings", or wait for the mirror maintainer to complete the data files.',
  },
  searchPreviewNotFound: {
    zh: "未找到详情数据",
    en: "Detailed data not found",
  },
  searchPreviewNotSynced: {
    zh: " 的数据可能尚未同步",
    en: " data may not be synced yet",
  },
  searchWeaponPropertyChips: {
    zh: "轻型 / 灵巧 / 投掷 / 重型 …",
    en: "Light / Finesse / Thrown / Heavy ...",
  },
  searchDataNotSynced: { zh: "数据尚未同步", en: "Data not synced yet" },
  searchDataMissingWarning: {
    zh: "kiwee.top 合作版没收对应数据文件，建议关掉那个库",
    en: "The data file is missing from kiwee.top partnered version. It is recommended to disable that library.",
  },
  searchMissingLibraryLog: {
    zh: "数据文件丢失。临时解决方案：设置 → 库设置，临时关掉对应的第三方扩展库。",
    en: "Data file missing. Temporary workaround: Settings -> Library Settings, temporarily disable the corresponding third-party extension library.",
  },
  searchReportSending: { zh: "汇报中…", en: "Reporting..." },
  searchReportSuccess: { zh: "✓ 已汇报，谢谢", en: "✓ Reported, thanks" },
  searchReportFailure: {
    zh: "汇报失败，稍后再试",
    en: "Report failed, try later",
  },
  charCardEnWarning: {
    zh: "",
    en: "This module currently only supports the Chinese D&D community's xlsx character sheet format (悲灵 ver.). It is not useful for English players unless you create your own template.",
  },

  // About panel
  aboutTitle: { zh: "关于", en: "About" },
  tabSupport: { zh: "支持作者 / 反馈", en: "Support / Feedback" },
  tabTimeStop: { zh: "时停", en: "Time Stop" },
  tabFocus: { zh: "同步视口", en: "Sync Viewport" },
  tabBestiary: { zh: "怪物图鉴", en: "Bestiary" },
  tabCharacterCards: { zh: "角色卡", en: "Character Cards" },
  tabInitiative: { zh: "先攻追踪", en: "Initiative Tracker" },
  tabSearch: { zh: "全局搜索", en: "Global Search" },
  tabPortals: { zh: "传送门", en: "Portals" },
  supportBlurb: {
    zh: "如果这套插件对你的跑团有帮助，欢迎来支持一下作者 —— 用于服务器续费和新插件开发。",
    en: "If this suite helps your campaigns, please consider supporting the author — covers server costs and new plugin development.",
  },
  contactBlurb: {
    zh: "反馈或建议：",
    en: "Feedback / Suggestions:",
  },

  // Misc
  close: { zh: "关闭", en: "Close" },
  on: { zh: "开启", en: "On" },
  off: { zh: "关闭", en: "Off" },

  // === Dice panel ===
  diceTabRoll: { zh: "投掷", en: "Roll" },
  diceTabCombos: { zh: "组合", en: "Combos" },
  diceTabHistory: { zh: "历史", en: "History" },
  diceTabSkins: { zh: "皮肤", en: "Skins" },
  diceSectDice: { zh: "骰子", en: "Dice" },
  diceSectExpression: { zh: "表达式", en: "Expression" },
  diceHintDicePm: {
    zh: "左键 + 1，右键 − 1。优势/劣势按钮填入表达式后点击「投掷」实际投骰",
    en: "Left-click +1, right-click −1. Advantage/Disadvantage buttons fill the expression — click Roll to actually roll.",
  },
  diceTitleDicePm: {
    zh: "左键 +1，右键 −1",
    en: "Left-click +1, right-click −1",
  },
  diceBtnAdv: { zh: "优势", en: "Adv" },
  diceBtnDis: { zh: "劣势", en: "Dis" },
  diceBtnCrit: { zh: "重击", en: "Crit" },
  diceTitleAdv: {
    zh: "优势 = 投两次 d20，取较高（不会自动投掷）",
    en: "Advantage = roll d20 twice, keep higher (does not auto-roll)",
  },
  diceTitleDis: {
    zh: "劣势 = 投两次 d20，取较低（不会自动投掷）",
    en: "Disadvantage = roll d20 twice, keep lower (does not auto-roll)",
  },
  diceTitleCrit: {
    zh: "重击 = 把表达式里所有骰子数量翻倍（加值不变）。点击应用，再次点击取消。",
    en: "Critical = double every dice term in the expression (modifier unchanged). Click to apply; click again to undo.",
  },
  diceExprPlaceholder: {
    zh: "例如 2d6 + 1d20 + 5  或  adv(1d20) 等",
    en: "e.g. 2d6 + 1d20 + 5  or  adv(1d20)",
  },
  diceTitleModDec: { zh: "加值 -1", en: "Modifier -1" },
  diceTitleModInc: { zh: "加值 +1", en: "Modifier +1" },
  diceLabelPlaceholder: {
    zh: "备注（可选，例如 偷袭）",
    en: "Note (optional, e.g. Sneak Attack)",
  },
  diceBtnRoll: { zh: "投掷", en: "Roll" },
  diceBtnLast: { zh: "上一次", en: "Last" },
  diceBtnSaveCombo: { zh: "保存组合", en: "Save Combo" },
  diceBtnClear: { zh: "清空", en: "Clear" },
  diceBtnDarkRoll: { zh: "暗骰", en: "Dark Roll" },
  diceBtnDarkRollGlobalOn: { zh: "全局暗骰：开", en: "Global Dark: ON" },
  diceBtnDarkRollGlobalOff: { zh: "全局暗骰：关", en: "Global Dark: OFF" },
  diceBtnDarkRollGlobalTitle: {
    zh: "开启后，所有普通投掷都会自动变为暗骰（包括组合面板的投掷按钮）。仅 DM 可见。",
    en: "When ON, all normal rolls (including combo panel roll buttons) are auto-treated as Dark Rolls. DM only.",
  },
  diceBtnSecretRoll: { zh: "暗骰", en: "Secret Roll" },
  diceBtnSecretRollGlobalOn: { zh: "全局暗骰：开", en: "Global Secret: ON" },
  diceBtnSecretRollGlobalOff: { zh: "全局暗骰：关", en: "Global Secret: OFF" },
  diceBtnSecretRollGlobalTitle: {
    zh: "开启后，所有普通投掷都会自动变为暗骰（包括组合面板的投掷按钮）。仅 DM 可见。",
    en: "When ON, all normal rolls (including combo panel roll buttons) are auto-treated as Secret Rolls. DM and YOU only.",
  },
  diceBtnForceClr: {
    zh: "⚠ 强制结束(若动画卡住)",
    en: "⚠ Force End (if stuck)",
  },
  diceRulesTitle: { zh: "表达式说明", en: "Expression Guide" },
  diceRule1b: {
    zh: ": 如果选中了 token，可以用这些简写来引用该 token 角色的属性（DM 还可以用怪物图鉴里怪物的属性，prof 代表加值，exp 代表专家加值，jat 代表万事通）。",
    en: ": if token selected, can use these shorthands for attributes of that token's character (DMs can also use monster stats from the bestiary, prof stands for proficiency bonus; exp stands for expertise; jat stands for jack of all trades).",
  },
  diceRule1: {
    zh: "：把若干种骰子和加值组合在一起一起投。",
    en: ": combine multiple dice types + modifiers into one roll.",
  },
  diceRule2: {
    zh: "：优势 — 投两次取较高的那次。",
    en: ": advantage — roll twice, keep higher.",
  },
  diceRule3: {
    zh: "：劣势 — 投两次取较低的那次。",
    en: ": disadvantage — roll twice, keep lower.",
  },
  diceRule4: {
    zh: "：最低保底 — 骰出来低于 10 时按 10 算。",
    en: ": floor — values below 10 are clamped to 10.",
  },
  diceRule5: {
    zh: "：最高封顶 — 骰出来高于 15 时按 15 算。",
    en: ": ceiling — values above 15 are clamped to 15.",
  },
  diceRule6: {
    zh: "：投到 12 时自动重投一次（只触发一次）。",
    en: ": triggered reroll — if value equals 12, reroll once.",
  },
  diceRuleResetMin: {
    zh: "：投到 ≤5 时自动重投一次（只触发一次）。",
    en: ": triggered reroll — if value ≤ 5, reroll once.",
  },
  diceRuleResetMax: {
    zh: "：投到 ≥18 时自动重投一次（只触发一次）。",
    en: ": triggered reroll — if value ≥ 18, reroll once.",
  },
  diceRule7: {
    zh: "：重复 3 次投，每次的总数单独显示。",
    en: ": repeat 3 times, each row shows its own total.",
  },
  diceRule8: {
    zh: "：当多颗骰子点数相同时，自动给重复的高亮一下。",
    en: ": highlight duplicate values across dice.",
  },
  diceRule9: {
    zh: "：术法爆发 — 骰子掷到最大点会再追加一颗。",
    en: ": exploding dice — rolling max adds another die.",
  },
  diceRule11: {
    zh: "：保存豁免 — 自动掷 1d20，并使用选中 token 的该属性豁免加值。",
    en: ": save — automatically roll 1d20 and apply the selected token's save bonus for that ability.",
  },
  diceRule12: {
    zh: "：检定 — 自动掷 1d20，并使用选中 token 的该属性检定或指定技能加值。",
    en: ": check — automatically roll 1d20 and apply the selected token's ability check bonus or specified skill bonus.",
  },
  diceRule10: {
    zh: "支持非标骰，比如",
    en: "Non-standard dice are supported, e.g.",
  },
  diceRule10b: {
    zh: "。中文括号",
    en: ". Full-width parentheses",
  },
  diceRule10c: {
    zh: "、逗号",
    en: " and comma",
  },
  diceRule10d: {
    zh: "也能识别。",
    en: " are also recognized.",
  },
  diceExamplesTitle: {
    zh: "示例（点击填入表达式）",
    en: "Examples (click to fill expression)",
  },
  diceExampleElven: { zh: "精灵之准", en: "Elven Accuracy" },
  diceExampleBurst: { zh: "术法爆发", en: "Spell Burst" },
  diceComboEmpty: {
    zh: "还没有保存的组合<br>在「投掷」标签里组好骰子后点「保存组合」",
    en: "No saved combos yet.<br>Set up dice in the Roll tab, then click Save Combo.",
  },
  diceHistoryEmpty: { zh: "还没有掷骰记录", en: "No roll history yet" },
  diceHistoryAll: { zh: "全部", en: "All" },
  diceHistoryReplayTooltip: {
    zh: "点击：在 token 上回放气泡",
    en: "Click: replay bubble over the token",
  },
  diceComboBtnRoll: { zh: "投掷", en: "Roll" },
  diceComboBtnDark: { zh: "暗骰", en: "Dark" },
  diceComboBtnCrit: { zh: "重击", en: "Crit" },
  diceComboBtnEdit: { zh: "编辑", en: "Edit" },
  diceComboBtnDel: { zh: "删除", en: "Delete" },
  diceJustNow: { zh: "刚刚", en: "just now" },
  diceAgoS: { zh: "s 前", en: "s ago" },
  diceAgoMin: { zh: "min 前", en: "min ago" },
  diceAgoH: { zh: "h 前", en: "h ago" },
  diceAgoD: { zh: "d 前", en: "d ago" },
  diceShakeAnim: { zh: "动画进行中…", en: "Animation in progress…" },
  diceShakeParse: { zh: "表达式无法解析", en: "Cannot parse expression" },
  diceShakeEmpty: { zh: "请先输入表达式", en: "Enter an expression first" },
  diceShakeNoToken: { zh: "请先选中角色", en: "Select a token first" },
  diceComboPrompt: { zh: "组合名称：", en: "Combo name:" },
  diceComboCatPrompt: {
    zh: "分类（留空 = 未分类）：",
    en: "Category (blank = uncategorized):",
  },
  diceComboCatUncategorized: { zh: "未分类", en: "Uncategorized" },
  diceComboCatNew: { zh: "+ 新分类", en: "+ New category" },
  diceComboCatRename: { zh: "重命名分类", en: "Rename category" },
  diceComboCatDelete: {
    zh: "删除分类（组合移到未分类）",
    en: "Delete category (combos move to Uncategorized)",
  },
  diceComboCatNewPrompt: { zh: "新分类名：", en: "New category name:" },
  diceComboCatRenamePrompt: { zh: "新名称：", en: "New name:" },
  diceComboCatChangePrompt: {
    zh: "移动到哪个分类？",
    en: "Move to which category?",
  },
  diceComboCatLabel: { zh: "分类", en: "Category" },
  diceComboDragHint: {
    zh: "拖动手柄可以重新排序 / 跨分类移动",
    en: "Drag the handle to reorder / move across categories",
  },
  diceConfirmClearHistory: {
    zh: "清空所有掷骰历史？",
    en: "Clear all roll history?",
  },
  diceRollerFallback: { zh: "投骰人", en: "Roller" },

  // === Dice history popover ===
  diceHistTitle: { zh: "投骰记录", en: "Dice History" },
  diceHistDismissTitle: { zh: "隐藏到下次投骰", en: "Hide until next roll" },
  diceHistEmpty: { zh: "还没人投骰", en: "Nobody has rolled yet" },
  diceHistPlayer: { zh: "玩家", en: "Player" },
  diceHistBack: { zh: "← 返回", en: "← Back" },
  diceHistDarkTag: { zh: "暗", en: "DARK" },
  diceHistColl: { zh: "集体", en: "Group" },
  diceHistCount: { zh: "位", en: " " },
  diceHistTimes: { zh: "次", en: "rolls" },
  diceHistNoEntries: { zh: "（无记录）", en: "(no entries)" },
  diceHistEmptyDetail: {
    zh: "该玩家还没有投过",
    en: "No rolls from this player",
  },

  // === Dice replay overlay ===
  diceReplayHint: {
    zh: "点击气泡或再次点击词条关闭",
    en: "Click bubble or click row again to close",
  },

  // === Dice rollable context menu ===
  diceMenuRoll: { zh: "投掷", en: "Roll" },
  diceMenuDark: { zh: "暗骰", en: "Dark Roll" },
  diceMenuAdv: { zh: "优势", en: "Advantage" },
  diceMenuDis: { zh: "劣势", en: "Disadvantage" },
  diceMenuTray: { zh: "添加到骰盘", en: "Add to Tray" },

  // === Portals ===
  portalTitle: { zh: "传送门", en: "Portal" },
  portalToolName: { zh: "传送门", en: "Portal" },
  portalToolHint: { zh: "画圈创建传送门", en: "Drag to create a portal" },
  portalNew: { zh: "新建传送门", en: "New Portal" },
  portalEdit: { zh: "编辑传送门", en: "Edit Portal" },
  portalLblName: { zh: "名字", en: "Name" },
  portalLblTag: { zh: "标签（同标签互联）", en: "Tag (same tag = linked)" },
  portalLblNamePresets: { zh: "名字预设", en: "Name Presets" },
  portalLblTagPresets: { zh: "标签预设", en: "Tag Presets" },
  portalAdd: { zh: "+ 添加", en: "+ Add" },
  portalAddBtn: { zh: "添加", en: "Add" },
  portalNewName: { zh: "新名字", en: "New name" },
  portalNewTag: { zh: "新标签", en: "New tag" },
  portalNamePh: { zh: "例如 一楼", en: "e.g. 1F" },
  portalTagPh: { zh: "例如 001", en: "e.g. 001" },
  portalDel: { zh: "删除传送门", en: "Delete Portal" },
  portalCancel: { zh: "取消", en: "Cancel" },
  portalSave: { zh: "保存", en: "Save" },
  portalLockTitle: {
    zh: "锁定 / 解锁此传送门",
    en: "Lock / Unlock this portal",
  },
  portalConfirmDel: { zh: "确定删除该传送门？", en: "Delete this portal?" },
  portalUnnamed: { zh: "(未命名)", en: "(unnamed)" },
  portalDestSelect: { zh: "选择目的地", en: "Select destination" },
  portalDestUnits: { zh: "个单位", en: "unit(s)" },
  portalDestNoMatch: {
    zh: "没有同标签的其它传送门",
    en: "No other portals with the same tag",
  },
  portalDestHidden: { zh: "隐藏", en: "Hidden" },
  portalBlinkLabel: { zh: "传送眨眼特效", en: "Teleport Blink Effect" },
  portalBlinkDesc: {
    zh: "本机偏好。开启后传送瞬间播放闭眼/睁眼动画，闭眼时刻执行实际传送，因此略慢；关闭则直接平滑过场。",
    en: "Per-client preference. When on, picking a destination plays a close-eye / open-eye animation with the actual teleport happening at the closed moment — slightly slower. Off = immediate smooth pan.",
  },

  // === Character card bind ===
  ccRawData: { zh: "原始数据", en: "Raw Data" },
  ccStatBannerUnlocked: {
    zh: "已解锁：所有玩家可见完整 HP / AC 数值",
    en: "Unlocked: All players can see full HP / AC values",
  },
  ccStatBannerLocked: {
    zh: "已上锁：玩家在战斗准备 / 战斗中只看到血条比例（ 无数值 / AC )",
    en: "Locked: Players see only health bar ratios (no values / AC) in combat prep / combat",
  },
  ccBindTitle: { zh: "绑定角色卡", en: "Bind Character Card" },
  ccBindUnbind: { zh: "解绑", en: "Unbind" },
  ccBindLoading: { zh: "加载中…", en: "Loading…" },
  ccBindFoot: {
    zh: "选择一张卡绑定到该角色，单选该角色时自动弹出信息",
    en: "Pick a card to bind. The info popup opens when the token is selected.",
  },
  ccBindCurrent: { zh: "当前", en: "Current" },
  ccBindCardDeleted: { zh: "(卡已删除)", en: "(card deleted)" },
  ccBindNoCards: {
    zh: "这个场景还没有上传任何角色卡",
    en: "No character cards uploaded in this scene yet",
  },
  ccBindUploadHint: {
    zh: "先去右下角",
    en: "Drop a .xlsx into the right rail of the",
  },
  ccBindUploadHint2: {
    zh: "面板的右侧栏拖一张 .xlsx 上来",
    en: "panel.",
  },

  // === Character card panel ===
  ccPanelTitle: { zh: "角色卡", en: "Character Cards" },
  ccPanelDownloadTpl: { zh: "下载模板", en: "Template" },
  ccPanelDownloadTplTitle: {
    zh: "下载本插件支持的悲灵 v1.0.12 角色卡模板（xlsx）",
    en: "Download the supported xlsx character-sheet template (悲灵 v1.0.12)",
  },
  ccPanelClose: { zh: "关闭 (Esc)", en: "Close (Esc)" },
  ccPanelDragHint: {
    zh: "拖拽 xlsx 到此处上传，或",
    en: "Drag xlsx here to upload, or",
  },
  ccPanelChooseFile: { zh: "📁 选择文件", en: "📁 Choose File" },
  ccPanelChooseFileTitle: {
    zh: "打开本地文件选择器上传 xlsx",
    en: "Open local file picker to upload xlsx",
  },
  ccPanelLocalOnlyTitle: {
    zh: "仅本地 — 点击云朵图标同步到玩家",
    en: "Local only - Click to sync with the room",
  },
  ccPanelSyncedTitle: { zh: "已同步", en: "Synced with the room" },
  ccPanelDirtyTitle: {
    zh: "未同步 — 点击云朵图标同步到玩家",
    en: "Unsynced changes - Click to sync with the room",
  },
  ccPanelSyncedSuccess: { zh: "已同步到服务器", en: "Synced with server" },
  ccPanelDirtyRetry: {
    zh: "同步失败 — 点击重试",
    en: "Sync failed - Click to retry",
  },
  ccSaveFailSync: { zh: "同步失败", en: "Sync failed" },
  ccDirtySave: {
    zh: "已保存本地 — 点击云朵图标同步到玩家",
    en: "Saved locally — click the cloud icon to sync with the room",
  },
  ccPanelExportJson: { zh: "📤 导出 JSON", en: "📤 Export JSON" },
  ccPanelExportJsonTitle: {
    zh: "导出角色卡为 JSON 格式",
    en: "Export character cards as JSON",
  },
  ccPanelImportJson: { zh: "📥 导入 JSON", en: "📥 Import JSON" },
  ccPanelImportJsonTitle: {
    zh: "从 JSON 文件导入角色卡",
    en: "Import character cards from a JSON file",
  },
  ccPanelRefreshHint: {
    zh: "每张卡片旁的 ↻ 可重新选择 xlsx 覆盖更新",
    en: "Click ↻ next to a card to re-pick xlsx and overwrite",
  },
  ccPanelEmpty: {
    zh: "从右侧选择一张角色卡",
    en: "Select a character card from the right",
  },
  ccPanelEmpty2: {
    zh: "拖拽 xlsx 到右侧栏上传",
    en: "Drag xlsx onto the right rail to upload",
  },
  ccPanelMiniTitle: { zh: "角色卡面板", en: "Character Card Panel" },
  ccPanelUploading: { zh: "⏳ 上传中…", en: "⏳ Uploading…" },
  ccPanelUploaded: { zh: "已上传", en: "Uploaded" },
  ccPanelUploadFailed: { zh: "上传失败", en: "Upload failed" },
  ccPanelUploadHint: {
    zh: "请检查：① 角色卡版本是否受支持（v1.0.12 即 2024 / v1.0.12-2014mode 即 2014 悲灵卡）；② 角色卡内是否嵌入了损坏 / 超大图片（先在 Excel 里删除图片再上传）。",
    en: "Please check: (1) sheet version is supported (v1.0.12 = 2024 / v1.0.12-2014mode = 2014 悲灵 sheets); (2) no broken or oversized embedded images (remove images in Excel first, then re-upload).",
  },
  ccPanelOnlyXlsx: {
    zh: "只支持 .xlsx 文件",
    en: "Only .xlsx files are supported",
  },
  ccPanelRefreshed: { zh: "已刷新", en: "Refreshed" },
  ccPanelRefreshFailed: { zh: "刷新失败", en: "Refresh failed" },
  ccPanelEmpty3: {
    zh: "还没有角色卡\n拖拽 xlsx 到左侧上传",
    en: "No character cards yet.\nDrag xlsx to the panel to upload.",
  },
  ccPanelNoCards: { zh: "暂无角色卡", en: "No character cards" },
  ccPanelRefreshTitle: {
    zh: "从最新的 xlsx 重新加载",
    en: "Reload from the latest xlsx",
  },
  ccPanelDeleteTitle: { zh: "删除", en: "Delete" },
  ccPanelDeleteConfirm: { zh: "删除", en: "Delete" },
  ccPanelMinAgo: { zh: "分钟前", en: " min ago" },
  ccPanelHourAgo: { zh: "小时前", en: " h ago" },
  ccPanelDayAgo: { zh: "天前", en: " d ago" },
  ccPanelJustNow: { zh: "刚刚", en: "just now" },

  // === Search bar ===
  searchPlaceholder: {
    zh: "搜索 5etools…（怪物/法术/物品/职业/种族…）",
    en: "Search 5etools… (monsters/spells/items/classes/races…)",
  },
  searchClearAria: { zh: "清空", en: "Clear" },

  // === Bestiary panel (UI chrome bits) ===
  bestiaryPanelOnlyDM: { zh: "仅 DM 可用", en: "DM only" },
  bestiaryPanelHint: {
    zh: "点击下方怪物以绑定到所选 token（覆盖当前数据 / HP / AC）",
    en: "Click a monster below to bind to the selected token (overwrites data / HP / AC)",
  },
  bestiarySearchPh: {
    zh: "搜索怪物名称/类型/CR...",
    en: "Search monsters by name / type / CR…",
  },
  bestiaryClearSearch: { zh: "清空搜索", en: "Clear search" },
  bestiaryLoading: { zh: "加载中...", en: "Loading…" },
  bestiarySortByCR: { zh: "按CR排序", en: "Sort by CR" },
  bestiaryNoMatch: { zh: "未找到匹配的怪物", en: "No matching monsters" },

  // Music board (popover) — player-facing, so fully bilingual.
  mbTitle: { zh: "音乐板", en: "Music Board" },
  mbMinimize: {
    zh: "收起到小条，保留音乐和配对",
    en: "Minimize (keeps music + pairing)",
  },
  mbDragExpand: {
    zh: "拖动音乐板，点击唱片展开",
    en: "Drag to move · click the disc to expand",
  },
  mbDiscExpand: { zh: "点击唱片展开音乐板", en: "Click the disc to expand" },
  mbStatusIdle: { zh: "空闲", en: "Idle" },
  mbStatusPlaying: { zh: "正在播放", en: "Playing" },
  mbStatusPaused: { zh: "已暂停", en: "Paused" },
  mbNoBgm: { zh: "没有 BGM 在播放", en: "No BGM playing" },
  mbUnnamedBgm: { zh: "未命名 BGM", en: "Untitled BGM" },
  mbMuteSelf: { zh: "静音（仅自己）", en: "Mute (only me)" },
  mbPairTitle: { zh: "接入网页音乐板", en: "Connect to web Music Studio" },
  mbPairCodePh: {
    zh: "网页那边的 6 位配对码",
    en: "6-char pair code from the web",
  },
  mbConnect: { zh: "连接", en: "Connect" },
  mbDisconnect: { zh: "断开", en: "Disconnect" },
  mbPairHint: {
    zh: '在 <a href="https://obr.dnd.center/studio/music-studio/" target="_blank">obr.dnd.center/studio/music-studio/</a> 点「配对枭熊」拿到配对码，粘到这里。<br>连接后网页里的所有播放/暂停操作会同步到所有<b>已打开本面板</b>的玩家。<br><b>提示</b>：关闭此弹窗会停止音乐 + 断开配对。要保留请点右上角「−」收起到小条。',
    en: 'At <a href="https://obr.dnd.center/studio/music-studio/" target="_blank">obr.dnd.center/studio/music-studio/</a> click "Pair" to get a code, paste it here.<br>Once connected, every play/pause on the web syncs to all players who have <b>opened this panel</b>.<br><b>Note</b>: closing this popover stops the music + unpairs. To keep it, use the "−" minimize button.',
  },
  // pair status (dynamic)
  mbStLoadingPeer: { zh: "加载 PeerJS…", en: "Loading PeerJS…" },
  mbStSignaling: { zh: "连接信令…", en: "Connecting signal…" },
  mbStConnecting: { zh: "连接中…", en: "Connecting…" },
  mbStDialing: { zh: "拨号", en: "Dialing" },
  mbStConnectedTo: { zh: "已连接", en: "Connected" },
  mbStDisconnected: { zh: "已断开", en: "Disconnected" },
  mbStConnError: { zh: "连接错误", en: "Connection error" },
  mbStSignalError: { zh: "信令错误", en: "Signaling error" },
  mbStLoadFail: { zh: "加载失败", en: "Load failed" },
  mbStNotConnected: { zh: "未连接", en: "Not connected" },
  // toasts (dynamic; trailing-space variants are prefixes for an error detail)
  mbToastConnected: {
    zh: "已连接到网页音乐板",
    en: "Connected to the web Music Studio",
  },
  mbToastCodeShort: {
    zh: "配对码至少 4 位",
    en: "Pair code needs at least 4 characters",
  },
  mbToastAutoplay: {
    zh: "浏览器拦截了自动播放，请点击页面任意位置允许",
    en: "Browser blocked autoplay — click anywhere on the page to allow",
  },
  mbToastConnFail: { zh: "连接失败：", en: "Connection failed: " },
  mbToastPeerErr: { zh: "PeerJS：", en: "PeerJS: " },
  mbToastLoadPeerFail: {
    zh: "加载 PeerJS 失败：",
    en: "Failed to load PeerJS: ",
  },

  // Resource tracker — DM full-screen panel (GM-only).
  rtTitle: { zh: "资源追踪", en: "Resource Tracker" },
  rtTabPlayers: { zh: "玩家", en: "Players" },
  rtTabMonsters: { zh: "怪物", en: "Monsters" },
  rtUnnamed: { zh: "(未命名)", en: "(unnamed)" },
  rtOwnerCardNpc: { zh: "角色卡", en: "Card NPC" },
  rtSubTail: {
    zh: "血量 / 资源可直接增删改",
    en: "HP / resources are editable here",
  },
  rtSavePreset: { zh: "+ 存为预设", en: "+ Save preset" },
  rtSavePresetTitle: {
    zh: "把该角色当前所有资源存为一个预设",
    en: "Save this character's current resources as a preset",
  },
  rtEmptyAll: {
    zh: "没有找到要追踪的角色 token。<br>有角色卡的单位、玩家拥有的 token、或在先攻里的单位会列在这里。",
    en: "No trackable tokens found.<br>Tokens with a character card, player-owned tokens, or anything in the current initiative will be listed here.",
  },
  rtEmptyPlayers: {
    zh: "暂无玩家角色 —— 给 token 绑定角色卡后会出现在这里。",
    en: "No player characters yet — bind a character card to a token and it shows up here.",
  },
  rtEmptyMonsters: {
    zh: "暂无怪物 —— 玩家无卡 token / 先攻中的单位会出现在这里。",
    en: "No monsters — card-less player tokens / units in the current initiative appear here.",
  },
  // preset bar (HTML)
  rtPresetsLbl: { zh: "预设", en: "Presets" },
  rtPresetsEmpty: {
    zh: "还没有预设。鼠标移到某张角色卡上点「+ 存为预设」可保存其当前资源；保存后这里出现的 chip：<b>点击</b>=覆盖/叠加给全员、<b>拖到角色卡上</b>=只给那一张。",
    en: 'No presets yet. Hover a character card and click "+ Save preset" to snapshot its resources. The chip here: <b>click</b> = overwrite/merge to everyone, <b>drag onto a card</b> = apply to just that one.',
  },
  rtExport: { zh: "导出", en: "Export" },
  rtImport: { zh: "导入", en: "Import" },
  // preset dialogs (dynamic)
  rtPresetChipTitle: {
    zh: "点击：应用菜单（覆盖/叠加全员）· 拖到角色卡：仅给那一张",
    en: "Click: apply menu (overwrite/merge all) · Drag onto a card: apply to just that one",
  },
  rtPresetNoRes: {
    zh: "该角色当前没有可保存的资源。先在卡片上添加几个资源再来。",
    en: "This character has no resources to save. Add some on the card first.",
  },
  rtPresetDefaultName: { zh: "我的预设", en: "My preset" },
  rtPresetSavePrompt: {
    zh: "保存为预设（{n} 个资源）。给它起个名字：",
    en: "Save as a preset ({n} resources). Name it:",
  },
  rtPresetMenuOverwrite: {
    zh: "覆盖应用到全员（替换现有资源）",
    en: "Overwrite to everyone (replace existing)",
  },
  rtPresetMenuMerge: {
    zh: "叠加应用到全员（按 id 去重合并）",
    en: "Merge to everyone (dedupe by id)",
  },
  rtPresetMenuRename: { zh: "重命名预设", en: "Rename preset" },
  rtPresetMenuDelete: { zh: "删除预设", en: "Delete preset" },
  rtActOverwrite: { zh: "覆盖", en: "overwrote to" },
  rtActMerge: { zh: "叠加", en: "merged into" },
  rtPresetAppliedZh: {
    zh: "预设「{name}」已{act}应用到 {count} 个角色",
    en: 'Preset "{name}" {act} {count} characters',
  },
  rtPresetRenamePrompt: { zh: "新名字：", en: "New name:" },
  rtPresetDeleteConfirm: {
    zh: "删除预设「{name}」？",
    en: 'Delete preset "{name}"?',
  },
  rtPresetMergedTo: {
    zh: "预设「{name}」已合并到 {target}",
    en: 'Preset "{name}" merged into {target}',
  },
  rtThisChar: { zh: "该角色", en: "this character" },
  rtImportErrFormat: {
    zh: "JSON 格式错误：应为预设数组，或包含 { presets: [...] }。",
    en: "Bad JSON: expected a preset array or { presets: [...] }.",
  },
  rtImportErrEmpty: {
    zh: "JSON 里没有有效的预设条目。",
    en: "No valid preset entries in the JSON.",
  },
  rtImportOk: { zh: "已导入 {n} 个预设", en: "Imported {n} presets" },
  rtImportFail: { zh: "导入失败：{e}", en: "Import failed: {e}" },

  // Resource edit modal + resource panel component.
  reEditTitle: { zh: "编辑资源", en: "Edit Resource" },
  reNewTitle: { zh: "新建资源", en: "New Resource" },
  reDefaultName: { zh: "自定义", en: "Custom" },
  rePresetsEmpty: {
    zh: "没有预设。改完后点右上角「+ 保存当前为预设」即可加进来。",
    en: 'No presets. Tweak the form, then click "+ Save current as preset" to add one.',
  },
  rePresetMax: { zh: "上限", en: "max" },
  rePresetDel: { zh: "删除该预设", en: "Delete this preset" },
  reConfirmDelete: {
    zh: "删除该资源？此操作不可撤销。",
    en: "Delete this resource? This can't be undone.",
  },
  reErrNameEmpty: { zh: "名字不能为空", en: "Name can't be empty" },
  reErrNumbers: {
    zh: "当前 / 最大值需为数字",
    en: "Current / max must be numbers",
  },
  // Resource panel component (mounted in cards / cc-info)
  rpNoToken: { zh: "未选中任何 token", en: "No token selected" },
  rpNoResources: {
    zh: "该 token 还没有任何资源",
    en: "This token has no resources yet",
  },
  rpCreate: { zh: "＋ 创建资源", en: "＋ Create resource" },
  rpAdd: { zh: "＋ 新增资源", en: "＋ Add resource" },
  rpReorder: { zh: "拖动以重新排序", en: "Drag to reorder" },
  rpEdit: { zh: "编辑", en: "Edit" },
  rpMaxZero: { zh: "最大值为 0（点 ⚙ 设置）", en: "Max is 0 (click ⚙ to set)" },
  rpEditExpr: {
    zh: "点击编辑：可输入数字 / +5 -3 / current+5 / max-2 等表达式",
    en: "Click to edit: a number, +5 / -3, current+5, max-2, …",
  },
  rpDieRollLabel: { zh: "骰子投掷", en: "Die roll" },
  rpPipTitle: {
    zh: "{name} · 第 {i} 格 · 点击赋值 {i}（已为 {i} 时减 1）· 右键归满",
    en: "{name} · pip {i} · click = set to {i} (−1 if already {i}) · right-click = fill",
  },
  rpBarTitle: {
    zh: "{name} · 左键拖动设置进度，右键 +1 / 归满",
    en: "{name} · drag = set progress, right-click = +1 / fill",
  },
  rpJumpMin: { zh: "跳到最小（{min}）", en: "Jump to min ({min})" },
  rpJumpMax: { zh: "跳到最大（{max}）", en: "Jump to max ({max})" },
  // Resource edit modal — static labels (resource-edit.html)
  reLblName: { zh: "名字", en: "Name" },
  reNamePh: {
    zh: "如：一环法术槽 / 灵感",
    en: "e.g. 1st-level slot / Inspiration",
  },
  reLblType: { zh: "类型", en: "Type" },
  reTypeCount: { zh: "个数", en: "Pips" },
  reTypeBar: { zh: "进度", en: "Bar" },
  reTypeNumber: { zh: "数字", en: "Number" },
  reTypeDieRoll: { zh: "骰子", en: "Die Roll" },
  reLblDieInfo: { zh: "骰子类型", en: "Die Type" },
  reLblCurrent: { zh: "当前", en: "Current" },
  reLblMax: { zh: "最大", en: "Max" },
  reLblIcon: { zh: "图标", en: "Icon" },
  rePresetsLabel: {
    zh: "预设（名字 · 类型 · 上限 · 图标 一起存）",
    en: "Presets (name · type · max · icon, saved together)",
  },
  reAddPreset: { zh: "+ 保存当前为预设", en: "+ Save current as preset" },
  rePreview: { zh: "预览", en: "Preview" },
  reBtnDelete: { zh: "删除", en: "Delete" },
  reBtnCancel: { zh: "取消", en: "Cancel" },
  reBtnSave: { zh: "保存", en: "Save" },
  reClose: { zh: "关闭", en: "Close" },

  // Status tracker — buff edit popup + effect presets (GM-only).
  // (Buff catalog NAMES and category/group names are user data and
  // stay untranslated.)
  stFxLabel: {
    zh: "实验性 · 视觉特效（仅 GM / 桌面端）",
    en: "Experimental · visual FX (GM / desktop only)",
  },
  stFxParticleUrlPh: {
    zh: "粒子图片 URL（留空 = 默认）",
    en: "Particle image URL (blank = default)",
  },
  stFxPickFromLib: {
    zh: "从 OBR 资源库选择",
    en: "Pick from OBR asset library",
  },
  stEffectLabel: { zh: "特效", en: "Effect" },
  stWebmNone: { zh: "无", en: "None" },
  stWebmDefault: { zh: "默认特效", en: "Default FX" },
  stWebmHintBuiltin: {
    zh: "想用其它预制 webm 当特效？把 webm 拖进场景，状态追踪打开时右键它选「以此创建状态」。",
    en: 'Want a different preset webm as the FX? Drop a webm into the scene, then (with the status tool open) right-click it and choose "Create status from this".',
  },
  stWebmHintCustom: {
    zh: "自定义状态没有内置特效。想加特效？把 webm / 图片拖进场景，状态追踪打开时右键它选「以此创建状态」。",
    en: 'Custom statuses have no built-in FX. Want one? Drop a webm / image into the scene, then right-click it (status tool open) and choose "Create status from this".',
  },
  stNamePh: { zh: "名称", en: "Name" },
  stRoundsLabel: { zh: "持续轮数", en: "Rounds" },
  stRoundsUnlimited: { zh: "0=不限", en: "0 = unlimited" },
  stPreview: { zh: "预览", en: "Preview" },
  stDelete: { zh: "删除", en: "Delete" },
  stCancel: { zh: "取消", en: "Cancel" },
  stSave: { zh: "保存", en: "Save" },
  stDeleteBuffConfirm: { zh: "删除「{name}」？", en: 'Delete "{name}"?' },
  // FX preset labels + hints
  stFxDefault: { zh: "默认", en: "Default" },
  stFxDefaultHint: { zh: "静态气泡（不带特效）", en: "Static bubble (no FX)" },
  stFxFloat: { zh: "漂浮", en: "Float" },
  stFxFloatHint: {
    zh: "粒子从角色脚下随机漂浮上升",
    en: "Particles drift up from the character's feet",
  },
  stFxDrop: { zh: "下降", en: "Drop" },
  stFxDropHint: {
    zh: "粒子从角色头顶随机降落",
    en: "Particles fall from above the character",
  },
  stFxFlicker: { zh: "闪烁", en: "Flicker" },
  stFxFlickerHint: {
    zh: "随机位置闪烁淡入淡出",
    en: "Random fade-in/out flickers",
  },
  stFxCurve: { zh: "悠扬", en: "Sway" },
  stFxCurveHint: {
    zh: "曲线从角色背后散播（渲染于角色下方）",
    en: "Curving spread from behind (rendered under the character)",
  },
  stFxSpread: { zh: "扩散", en: "Spread" },
  stFxSpreadHint: {
    zh: "同心圆扩散（渲染于角色下方）",
    en: "Concentric ripples (rendered under the character)",
  },
  // segment 3b — palette presets / categories / footer hints / render modes / import.
  // NOTE: "全部" and "未分类" are DISPLAY labels only — the stored filter
  // sentinels (null filter / the UNCATEGORIZED group key) keep their
  // original values so saved catalogs / presets never break.
  stCatAll: { zh: "全部", en: "All" },
  stCatUncategorized: { zh: "未分类", en: "Uncategorized" },
  stHoverPreview: { zh: "悬停预览效果", en: "Hover to preview" },
  stPresetsLbl: { zh: "预设", en: "Presets" },
  stPresetsEmpty: {
    zh: "还没有预设。先在过滤栏选一个分组，再点右边「+ 保存当前为预设」。",
    en: 'No presets yet. Pick a group in the filter row, then click "+ Save current as preset" on the right.',
  },
  stPresetChipTitle: {
    zh: "点击：应用 / 删除 · 拖拽：拖到 token 上应用",
    en: "Click: apply / delete · Drag: drop onto a token to apply",
  },
  stPresetSave: { zh: "+ 保存当前为预设", en: "+ Save current as preset" },
  stPresetSaveTitle: {
    zh: "把当前过滤分组的所有 buffs 保存为一个新预设",
    en: "Save all buffs in the current filter group as a new preset",
  },
  stPresetOverwrite: {
    zh: "覆盖应用到所有角色卡 token",
    en: "Overwrite onto all character-card tokens",
  },
  stPresetMerge: {
    zh: "叠加应用到所有角色卡 token",
    en: "Merge onto all character-card tokens",
  },
  stPresetRename: { zh: "重命名预设", en: "Rename preset" },
  stPresetDelete: { zh: "删除预设", en: "Delete preset" },
  stPresetApplied: {
    zh: "预设「{name}」已{mode}应用到 {count} 个角色卡 token",
    en: 'Preset "{name}" {mode} onto {count} character-card token(s)',
  },
  stModeOverwrite: { zh: "覆盖", en: "overwritten" },
  stModeMerge: { zh: "叠加", en: "merged" },
  stRenamePromptNew: { zh: "新名字：", en: "New name:" },
  stPresetDeleteConfirm: {
    zh: "删除预设「{name}」？",
    en: 'Delete preset "{name}"?',
  },
  stPresetNoBuffs: {
    zh: "当前过滤分组里没有可用的 buff，无法保存为预设。",
    en: "No usable buffs in the current filter group — nothing to save as a preset.",
  },
  stPresetNamePrompt: {
    zh: "给这个预设起个名字（{count} 个 buff）：",
    en: "Name this preset ({count} buffs):",
  },
  stPresetAppliedMerge: {
    zh: "预设「{name}」已应用到 token（叠加）",
    en: 'Preset "{name}" applied to token (merged)',
  },
  stNewCatPh: { zh: "新分类名", en: "New category" },
  stAddCat: { zh: "添加分类", en: "Add category" },
  stClearAllBuffs: {
    zh: "清除该角色全部 buff",
    en: "Clear all buffs on this character",
  },
  stManageBuffs: { zh: "管理该角色 buff", en: "Manage this character's buffs" },
  stNewBuffPill: { zh: "+ 新 buff", en: "+ New buff" },
  stRenameCatPrompt: {
    zh: "重命名分类「{name}」（留空=删除）",
    en: 'Rename category "{name}" (blank = delete)',
  },
  stCatMinOne: {
    zh: "至少保留一个分组，无法删除「{name}」。",
    en: 'Keep at least one group — can\'t delete "{name}".',
  },
  stCatDeleteConfirm: {
    zh: "删除分类「{name}」？该分类下的 buff 会移到「{uncat}」。",
    en: 'Delete category "{name}"? Its buffs move to "{uncat}".',
  },
  // footer hint lines — contain <b>/<kbd> markup; {x} = the red cross SVG icon
  stFootApply1: {
    zh: "<b>左键</b>拖到目标释放 = 应用 buff",
    en: "<b>Left-drag</b> onto a target = apply buff",
  },
  stFootApply2: {
    zh: "<b>右键</b>拖过角色 = 路径切换 (有则去)",
    en: "<b>Right-drag</b> across characters = toggle (remove if present)",
  },
  stFootApply3: {
    zh: "<b>左键</b>拖红色 {x}= 单个清除",
    en: "<b>Left-drag</b> the red {x}= clear one",
  },
  stFootApply4: {
    zh: "<b>右键</b>拖红色 {x}= 路径全清",
    en: "<b>Right-drag</b> the red {x}= clear along path",
  },
  stFootApply5: { zh: "<kbd>]</kbd> 关闭面板", en: "<kbd>]</kbd> close panel" },
  stFootEdit1: {
    zh: "<b>点击</b>分类 = 重命名（清空 = 删除）",
    en: "<b>Click</b> a category = rename (clear = delete)",
  },
  stFootEdit2: {
    zh: "<b>拖</b>分类 = 排序",
    en: "<b>Drag</b> a category = reorder",
  },
  stFootEdit3: {
    zh: "<b>点击</b> buff = 颜色 / 名字 / 特效编辑",
    en: "<b>Click</b> a buff = edit color / name / FX",
  },
  stFootEdit4: {
    zh: "<b>拖</b> buff 到分类 = 切换分组",
    en: "<b>Drag</b> a buff onto a category = move group",
  },
  stFootEdit5: { zh: "<kbd>]</kbd> 退出编辑", en: "<kbd>]</kbd> exit edit" },
  // render-mode cycle button (short labels)
  stRenderEffect: { zh: "特效", en: "FX" },
  stRenderText: { zh: "文字", en: "Text" },
  stRenderAuto: { zh: "自动", en: "Auto" },
  // import
  stImportBadJson: {
    zh: "JSON 文件格式错误：应为 buff 数组或 { buffs, groupOrder } 对象。",
    en: "Bad JSON: expected a buff array or a { buffs, groupOrder } object.",
  },
  stImportFailed: { zh: "导入失败：{err}", en: "Import failed: {err}" },
  // manage popover
  stRoleFallback: { zh: "角色", en: "Character" },
  stUnknownBuff: { zh: "未知 buff", en: "Unknown buff" },
  stNoBuffsOnChar: { zh: "该角色没有 buff", en: "This character has no buffs" },
  // static palette toolbar (status-tracker.html)
  stPaletteTitle: { zh: "状态调色板", en: "Status Palette" },
  stRenderModeTitle: {
    zh: "渲染模式：循环 自动 → 特效 → 文字 → 自动 …",
    en: "Render mode: cycle Auto → FX → Text → Auto …",
  },
  stCloseTitle: { zh: "关闭 (])", en: "Close (])" },
  stEditTitle: { zh: "编辑 buff 库", en: "Edit buff library" },
  stEditLabel: { zh: "编辑", en: "Edit" },
  stExportTitle: {
    zh: "导出 buff 库为 JSON",
    en: "Export buff library as JSON",
  },
  stExportLabel: { zh: "导出", en: "Export" },
  stImportTitle: { zh: "导入 buff 库 JSON", en: "Import buff library JSON" },
  stImportLabel: { zh: "导入", en: "Import" },
  stStudioTitle: {
    zh: "打开 Buff Studio：在线制作 buff 特效（多图层合成 / GIF·视频转 WebM），导出后放进 buff 库",
    en: "Open Buff Studio: make buff FX online (multi-layer compositing, GIF / video → WebM), then drop the export into your buff library",
  },
  stStudioLabel: { zh: "特效工坊", en: "FX Studio" },
  // manage popover static HTML (status-tracker-manage.html)
  stManageTitle: { zh: "buff 管理", en: "Buff manager" },
  stClosePlain: { zh: "关闭", en: "Close" },
  stManageFootHint: {
    zh: "拖到 <b>其他角色</b> = 转移 · 拖到 <b>外面</b> = 取消",
    en: "Drag onto <b>another character</b> = transfer · Drag <b>outside</b> = cancel",
  },
  // ===== Character card v2 (fullscreen-page.tsx) — segment 4 =====
  // tabs
  ccAbbrStr: { zh: "力", en: "STR" },
  ccAbbrDex: { zh: "敏", en: "DEX" },
  ccAbbrCon: { zh: "体", en: "CON" },
  ccAbbrInt: { zh: "智", en: "INT" },
  ccAbbrWis: { zh: "感", en: "WIS" },
  ccAbbrCha: { zh: "魅", en: "CHA" },
  ccFullStr: { zh: "力量", en: "Strength" },
  ccFullDex: { zh: "敏捷", en: "Dexterity" },
  ccFullCon: { zh: "体质", en: "Constitution" },
  ccFullInt: { zh: "智力", en: "Intelligence" },
  ccFullWis: { zh: "感知", en: "Wisdom" },
  ccFullCha: { zh: "魅力", en: "Charisma" },
  ccSearchTitle: { zh: "搜索", en: "Search" },
  ccMasterySearchTitle: { zh: "搜索精通词条", en: "Search Masteries" },
  ccMasteryLabel: { zh: "精通", en: "Mastery" },
  ccTabOverview: { zh: "概览", en: "Overview" },
  ccTabSpells: { zh: "法术", en: "Spells" },
  ccTabFeatures: { zh: "特性", en: "Features" },
  ccTabBackground: { zh: "背景", en: "Background" },
  ccTabsAria: { zh: "角色卡标签", en: "Character card tabs" },
  // abilities / skills — roll-label suffixes + tooltips
  ccCheckSuffix: { zh: "检定", en: " Check" },
  ccCheckAdvSuffix: { zh: "检定（优势）", en: " Check (adv)" },
  ccSaveSuffix: { zh: "豁免", en: " Save" },
  ccSave: { zh: "豁免", en: "Save" },
  ccRollHint: {
    zh: "（左键投，右键优势）",
    en: "(left-click roll, right-click adv)",
  },
  ccTipAutoMod: {
    zh: "自动从属性值推算",
    en: "Auto-derived from ability score",
  },
  ccTipToggleSaveProf: {
    zh: "点击切换豁免熟练",
    en: "Click to toggle save proficiency",
  },
  ccTipCycleSkillProf: {
    zh: "点击循环切换：无 → 熟练 → 专精 → 无",
    en: "Click to cycle: none → proficient → expertise → none",
  },
  // header — identity meta pips
  ccUnnamed: { zh: "未命名", en: "Unnamed" },
  ccTotalLevel: { zh: "总等级", en: "Total Level" },
  ccAlignment: { zh: "阵营", en: "Alignment" },
  ccSize: { zh: "体型", en: "Size" },
  ccFaith: { zh: "信仰", en: "Faith" },
  // header — toolbar buttons + tooltips
  ccEditTitleOn: {
    zh: "退出编辑模式（再次切换回只读视图）",
    en: "Exit edit mode (back to read-only view)",
  },
  ccEditTitleOff: {
    zh: "进入编辑模式：自由修改属性、添加词条、法术、特性、装备、背景",
    en: "Enter edit mode: edit stats, add entries, spells, features, gear, background",
  },
  ccEditingLabel: { zh: "编辑中", en: "Editing" },
  ccEditLabel: { zh: "编辑", en: "Edit" },
  ccSaveTitle: {
    zh: "把当前所有改动保存到服务器（不退出编辑模式）",
    en: "Save all changes to the server (stays in edit mode)",
  },
  ccSaving: { zh: "保存中…", en: "Saving…" },
  ccSaveBtn: { zh: "保存", en: "Save" },
  ccRefreshTitle: {
    zh: "重新拉取服务器上的最新数据",
    en: "Re-fetch the latest data from the server",
  },
  ccRefresh: { zh: "刷新", en: "Refresh" },
  ccExportTitle: {
    zh: "把当前角色卡数据导出为 JSON 文件",
    en: "Export this card's data as a JSON file",
  },
  ccExportJson: { zh: "导出 JSON", en: "Export JSON" },
  ccCopyTitle: {
    zh: "仅复制：把当前角色卡 JSON 复制到剪贴板（不下载文件）",
    en: "Copy only: copy the card JSON to the clipboard (no file download)",
  },
  ccImportTitle: {
    zh: "从 JSON 文件加载角色卡",
    en: "Load a character card from a JSON file",
  },
  ccImportJson: { zh: "导入 JSON", en: "Import JSON" },
  ccPasteTitle: {
    zh: "仅粘贴：弹窗输入 JSON 文本，识别后应用为当前角色卡数据",
    en: "Paste only: enter JSON text in a dialog, apply it as the card data",
  },
  // paste-JSON modal
  ccPasteEmpty: {
    zh: "✕ 文本框为空，请粘贴角色卡 JSON",
    en: "✕ Text box is empty — paste the card JSON",
  },
  ccPasteModalTitle: { zh: "粘贴角色卡 JSON", en: "Paste character card JSON" },
  ccPasteKbdHint: {
    zh: "Ctrl+Enter 应用 · Esc 取消",
    en: "Ctrl+Enter apply · Esc cancel",
  },
  ccPastePlaceholder: {
    zh: '直接粘贴 JSON 文本，例如 {"identity": {...}, "abilities": {...}, "core_stats": {...}}',
    en: 'Paste JSON text directly, e.g. {"identity": {...}, "abilities": {...}, "core_stats": {...}}',
  },
  ccCancel: { zh: "取消", en: "Cancel" },
  ccApplying: { zh: "应用中…", en: "Applying…" },
  ccApply: { zh: "应用", en: "Apply" },
  // spell-pick modal
  ccSpellModalHint: {
    zh: "输入中文 / 英文名筛选 · Esc 取消",
    en: "Type a Chinese / English name to filter · Esc cancel",
  },
  ccSpellSearchPh: {
    zh: "法术名（中 / 英，留空浏览全部）",
    en: "Spell name (CN / EN, blank = browse all)",
  },
  ccSpellAddFree: { zh: "＋ 直接添加「{q}」", en: '＋ Add "{q}" directly' },
  ccSpellLoading: { zh: "加载法术库…", en: "Loading spell library…" },
  ccSpellLoadErr: {
    zh: "法术库加载失败 — 上方“直接添加”仍可用",
    en: 'Spell library failed to load — "Add directly" above still works',
  },
  ccSpellNoMatch: {
    zh: "库内没有匹配项 — 可用上方“直接添加”",
    en: 'No matches in the library — use "Add directly" above',
  },
  // stat banner labels (HP / AC stay as-is)
  ccTemp: { zh: "临时", en: "Temp" },
  ccInit: { zh: "先攻", en: "Init" },
  ccFullInit: { zh: "先攻", en: "Initiative" },
  ccSpeed: { zh: "速度", en: "Speed" },
  ccPassivePerception: { zh: "被动察觉", en: "Passive Perception" },
  ccProfBonus: { zh: "熟练", en: "Prof Bonus" },
  ccSaveDC: { zh: "豁免DC", en: "Save DC" },
  ccSpellcastingAbility: { zh: "施法关键属性", en: "Spellcasting Ability" },
  ccFtUnit: { zh: "尺", en: "ft" },
  ccMUnit: { zh: "米", en: "m" },
  ccItemName: { zh: "物品名", en: "Item name" },
  ccQuantity: { zh: "数量", en: "Quantity" },
  ccLocation: { zh: "位置", en: "Location" },
  ccPassivePerc: { zh: "被察", en: "Pass." },
  ccProf: { zh: "熟练", en: "Prof" },
  ccHitDice: { zh: "生命骰", en: "Hit Dice" },
  // combat section
  ccConfirmDelWeapon: {
    zh: "删除武器「{name}」？",
    en: 'Delete weapon "{name}"?',
  },
  ccNewWeapon: { zh: "新武器", en: "New weapon" },
  ccSecCombat: { zh: "战斗 · 武器 · 护甲", en: "Combat · Weapons · Armor" },
  ccAddWeaponTitle: { zh: "新增武器", en: "Add weapon" },
  ccAddWeaponBtn: { zh: "+ 武器", en: "+ Weapon" },
  ccArmor: { zh: "护甲", en: "Armor" },
  ccEquipped: { zh: "已装备", en: "Equipped" },
  ccUnequipped: { zh: "未装备", en: "Not equipped" },
  ccAttuned: { zh: "同调", en: "Attuned" },
  ccArmorAcTip: { zh: "基础 AC + 敏捷上限", en: "Base AC + Dex cap" },
  ccDexAbbr: { zh: "敏", en: "DEX" },
  ccWeight: { zh: "重量", en: "Weight" },
  ccLbUnit: { zh: "磅", en: "lb" },
  ccShield: { zh: "盾牌", en: "Shield" },
  ccNoWeaponsArmor: {
    zh: "暂未配置武器或护甲",
    en: "No weapons or armor configured",
  },
  ccWeaponNamePh: { zh: "武器名", en: "Weapon name" },
  ccDmgTypePh: { zh: "挥砍 / 穿刺 / …", en: "Slashing / Piercing / …" },
  ccDelWeaponTitle: { zh: "删除武器", en: "Delete weapon" },
  ccProfShort: { zh: "熟", en: "Prof" },
  ccHit: { zh: "命中", en: "Hit" },
  ccHitAdv: { zh: "命中（优势）", en: "Hit (adv)" },
  ccRollLR: { zh: "左键投，右键优势", en: "left-click roll, right-click adv" },
  ccDamage: { zh: "伤害", en: "Damage" },
  ccExtraDamage: { zh: "附加伤害", en: "Extra Damage" },
  ccExtraDmgDie: { zh: "附加伤害骰", en: "Extra damage dice" },
  ccAmmo: { zh: "弹药", en: "Ammo" },
  // inventory section
  ccBackpack: { zh: "背包", en: "Backpack" },
  ccConfirmDelItem: { zh: "删除「{name}」？", en: 'Delete "{name}"?' },
  ccNewItem: { zh: "新物品", en: "New item" },
  ccNewWondrous: { zh: "新奇物", en: "New wondrous item" },
  ccSecInventory: {
    zh: "装备 · 货币 · 负重",
    en: "Gear · Currency · Encumbrance",
  },
  ccTotalValue: { zh: "总值", en: "Total value" },
  ccAddItemTitle: { zh: "新增物品", en: "Add item" },
  ccAddItemBtn: { zh: "+ 物品", en: "+ Item" },
  ccCoinPP: { zh: "铂PP", en: "PP" },
  ccCoinGP: { zh: "金GP", en: "GP" },
  ccCoinEP: { zh: "银EP", en: "EP" },
  ccCoinSP: { zh: "铜SP", en: "SP" },
  ccCoinCP: { zh: "铜CP", en: "CP" },
  ccEncumbrance: { zh: "负重", en: "Encumbrance" },
  ccEquipmentWt: { zh: "装备", en: "Gear" },
  ccTotal: { zh: "总计", en: "Total" },
  ccCapacity: { zh: "上限", en: "Capacity" },
  ccWondrousTitle: { zh: "奇物 / 魔法物品", en: "Wondrous / Magic Items" },
  ccNoPackDetail: {
    zh: '（暂无背包细目，可在 xlsx 角色卡 "背包1/2" 表更新）',
    en: '(No pack details — update the "Backpack 1/2" sheets in the xlsx card)',
  },
  ccItemNamePh: { zh: "物品名", en: "Item name" },
  ccWeightPh: { zh: "重量", en: "Weight" },
  ccLocationPh: { zh: "位置", en: "Location" },
  ccDelete: { zh: "删除", en: "Delete" },
  // app-level errors
  ccErrNoParams: {
    zh: "URL 缺少 room 或 card 参数",
    en: "URL is missing the room or card parameter",
  },
  ccLoadFailedPrefix: { zh: "加载失败：", en: "Load failed: " },
  ccErrImportedMissing: {
    zh: "本地导入数据未找到",
    en: "Imported local data not found",
  },
  // spells section
  ccSpellLevelTip: { zh: "环阶（0 = 戏法）", en: "Spell level (0 = cantrip)" },
  ccSpellLevelChip: { zh: "环阶", en: "Level" },
  ccSpellSchoolChip: { zh: "学派", en: "School" },
  ccCastingTimeChip: { zh: "施法", en: "Time" },
  ccSpellNamePh: { zh: "法术名", en: "Spell name" },
  ccComponentsChip: { zh: "成分", en: "Components" },
  ccSpellExpandTip: {
    zh: "点击展开法术详情",
    en: "Click to expand spell details",
  },
  ccCantripBadge: { zh: "戏", en: "C" },
  ccRing: { zh: "环", en: "" },
  ccConcentration: { zh: "专注", en: "Conc." },
  ccRitual: { zh: "仪式", en: "Ritual" },
  ccCastingTime: { zh: "施法", en: "Cast" },
  ccRange: { zh: "距离", en: "Range" },
  ccDuration: { zh: "持续", en: "Duration" },
  ccSecSpells: { zh: "法术", en: "Spells" },
  ccSpellAbility: { zh: "关键属性", en: "Ability" },
  ccSpellAttack: { zh: "法术攻击", en: "Spell Attack" },
  ccWeaponAttack: { zh: "武器攻击", en: "Weapon Attack" },
  ccSecWeapons: { zh: "武器 / 攻击", en: "Weapons / Attacks" },
  ccMeleeRangedSpellAttack: {
    zh: "近战/远程法术攻击",
    en: "Melee/Ranged Spell Attack",
  },
  ccMaxPrepared: { zh: "最大准备", en: "Max prepared" },
  ccCantrips: { zh: "戏法", en: "Cantrips" },
  ccAddCantripTitle: {
    zh: "从法术库挑选戏法加入",
    en: "Pick a cantrip from the library",
  },
  ccAlwaysPrepared: { zh: "始终准备", en: "Always Prepared" },
  ccAddAlwaysTitle: {
    zh: "从法术库挑选始终准备法术加入",
    en: "Pick an always-prepared spell from the library",
  },
  ccPrepared: { zh: "准备法术", en: "Prepared" },
  ccAddPreparedTitle: {
    zh: "从法术库挑选准备法术加入",
    en: "Pick a prepared spell from the library",
  },
  ccGroup: { zh: "组", en: "Group" },
  ccAddCantripModal: { zh: "添加戏法", en: "Add cantrip" },
  ccAddAlwaysModal: { zh: "添加始终准备法术", en: "Add always-prepared spell" },
  ccAddPreparedModal: { zh: "添加准备法术", en: "Add prepared spell" },
  // feature block + features section
  ccAddPrefix: { zh: "新增", en: "Add " },
  ccNamePh: { zh: "名称", en: "Name" },
  ccDescPh: {
    zh: "描述（点击展开 · 此处编辑全文）",
    en: "Description (click to expand · edit full text here)",
  },
  ccToggleCollapse: { zh: "点击折叠 / 展开", en: "Click to collapse / expand" },
  ccNewEntry: { zh: "新条目", en: "New entry" },
  ccSecFeatures: { zh: "特性 · 专长", en: "Features · Feats" },
  ccClassFeatures: { zh: "职业特性", en: "Class Features" },
  ccRaceFeatures: { zh: "种族特性", en: "Race Features" },
  ccFightingStyle: { zh: "战斗风格", en: "Fighting Style" },
  ccSpecialAbilities: { zh: "特殊能力", en: "Special Abilities" },
  ccFeats: { zh: "专长", en: "Feats" },
  // background section
  ccBgAppearance: { zh: "外貌", en: "Appearance" },
  ccBgPersonality: { zh: "性格", en: "Personality" },
  ccBgTraits: { zh: "特质", en: "Traits" },
  ccBgIdeals: { zh: "理念", en: "Ideals" },
  ccBgBonds: { zh: "羁绊", en: "Bonds" },
  ccBgFlaws: { zh: "缺陷", en: "Flaws" },
  ccBgStory: { zh: "故事", en: "Story" },
  ccBgOther: { zh: "其他", en: "Other" },
  ccSecBackground: { zh: "背景 · 个人", en: "Background · Personal" },
  ccBackgroundLabel: { zh: "背景：", en: "Background: " },
  ccBackgroundNameField: { zh: "背景名", en: "Background name" },
  ccBackgroundNamePh: {
    zh: "如：哲人 / 罪犯 / 海上水手 ...",
    en: "e.g. Sage / Criminal / Sailor ...",
  },
  ccPlayer: { zh: "玩家", en: "Player" },
  ccGender: { zh: "性别", en: "Gender" },
  ccAge: { zh: "年龄", en: "Age" },
  ccHeight: { zh: "身高", en: "Height" },
  ccBodyWeight: { zh: "体重", en: "Weight" },
  ccHometown: { zh: "家乡", en: "Hometown" },
  ccNoBackground: { zh: "暂无背景信息", en: "No background info yet" },
  // abilities section header
  ccSecAbilities: {
    zh: "属性 · 豁免 · 技能",
    en: "Abilities · Saves · Skills",
  },
  ccTabAbilities: { zh: "属性", en: "Abilities" },
  ccTabResources: { zh: "资源", en: "Resources" },
  ccSecAbilitiesEditHint: {
    zh: "（编辑中 — 点击 ●/○/★ 切换熟练）",
    en: " (editing — click ●/○/★ to toggle proficiency)",
  },
  // defenses section
  ccSecDefenses: {
    zh: "防御 · 语言 · 工具",
    en: "Defenses · Languages · Tools",
  },
  ccResistances: { zh: "抗性", en: "Resistances" },
  ccImmunities: { zh: "免疫", en: "Immunities" },
  ccAdvantages: { zh: "优势", en: "Advantages" },
  ccDisadvantages: { zh: "劣势", en: "Disadvantages" },
  ccLanguages: { zh: "语言", en: "Languages" },
  ccTools: { zh: "工具", en: "Tools" },
  ccRemove: { zh: "移除", en: "Remove" },
  ccAddTagHint: {
    zh: "（用逗号分隔可一次添加多条）",
    en: " (comma-separated to add several at once)",
  },
  // import / copy / loading (app-level)
  ccCopiedAlert: {
    zh: "已复制角色卡 JSON 到剪贴板（{n} 字符）。可粘贴到另一张卡的「粘贴 JSON」或 xlsx 主要!AV1 公式里。",
    en: 'Copied the card JSON to the clipboard ({n} chars). Paste it into another card\'s "Paste JSON" or the xlsx 主要!AV1 formula.',
  },
  ccCopyFailAlert: {
    zh: "复制到剪贴板失败 — 请用「导出 JSON」下载文件后手动打开复制。",
    en: 'Clipboard copy failed — use "Export JSON" to download the file and copy it manually.',
  },
  ccNotCardJson: {
    zh: "(不像角色卡 JSON，缺少 identity / abilities 字段)",
    en: "(not character-card JSON — missing identity / abilities)",
  },
  ccSaveFailHttp: {
    zh: "(本地预览，服务器保存失败 HTTP {status}: {body})",
    en: "(local preview only — server save failed HTTP {status}: {body})",
  },
  ccRenderWarn: {
    zh: "\n  (旧版 HTML 渲染告警：{warn})",
    en: "\n  (legacy HTML render warning: {warn})",
  },
  ccSaveFail: {
    zh: "(服务器保存失败: {err})",
    en: "(server save failed: {err})",
  },
  ccSkipImported: {
    zh: "(跳过 — 已导入当前卡，多个 JSON 无法批量替换)",
    en: "(skipped — current card already imported; multiple JSONs can't batch-replace)",
  },
  ccJsonParseFail: {
    zh: "(JSON 解析失败: {err})",
    en: "(JSON parse failed: {err})",
  },
  ccXlsxFailHttp: {
    zh: "(xlsx 上传失败 HTTP {status}: {body})",
    en: "(xlsx upload failed HTTP {status}: {body})",
  },
  ccShieldReconcileFail: {
    zh: "(盾牌着装纠偏失败: {err})",
    en: "(shield-state reconcile failed: {err})",
  },
  ccNewCardArrow: { zh: '新卡 "{name}"', en: 'new card "{name}"' },
  ccXlsxFail: {
    zh: "(xlsx 上传失败: {err})",
    en: "(xlsx upload failed: {err})",
  },
  ccUnsupportedExt: {
    zh: "(不支持的扩展名 — 仅支持 .json / .xlsx)",
    en: "(unsupported extension — only .json / .xlsx)",
  },
  ccImportResultHead: {
    zh: "导入结果（{n} 个文件）：",
    en: "Import result ({n} files):",
  },
  ccImportResultNote: {
    zh: "（其他客户端会自动刷新已存在的卡片；新建的卡片需要他们刷新一下面板列表。）",
    en: "(Other clients auto-refresh existing cards; for newly created cards they need to refresh their panel list.)",
  },
  ccLoadingCard: { zh: "加载角色卡…", en: "Loading character card…" },
  ccSavedEdit: { zh: "已保存的编辑", en: "saved edits" },
  ccJsonParseFailColon: {
    zh: "✕ JSON 解析失败：{err}",
    en: "✕ JSON parse failed: {err}",
  },
  ccPasteSource: { zh: "粘贴文本", en: "pasted text" },

  // Layout editor
  layoutNoPositions: {
    zh: "未读取到任何面板的位置信息",
    en: "No panel position data found",
  },
  layoutDragHint: {
    zh: "拖动整体移动，拖右下角调整大小（虚线 = 当前未打开）",
    en: "Drag to move, drag bottom-right to resize (dashed = currently closed)",
  },
  layoutResetConfirm: {
    zh: "重置所有面板位置和大小到默认?",
    en: "Reset all panel positions and sizes to default?",
  },
  layoutResetDone: {
    zh: "已重置 · 拖动整体移动，拖右下角调整大小",
    en: "Reset · Drag to move, drag bottom-right to resize",
  },

  // Transform page
  transformPreview: { zh: "预览", en: "Preview" },
  transformCantReadDimensions: {
    zh: "无法读取尺寸",
    en: "Can't read dimensions",
  },
  transformLoadFailed: { zh: "加载失败", en: "Load failed" },
  transforming: { zh: "变身中…", en: "Transforming…" },
  layoutCluster: { zh: "快捷键按钮", en: "Floating Button" },
  layoutClusterRow: { zh: "快捷键栏", en: "Floating Button Row" },
  layoutDiceHistory: { zh: "投骰记录面板", en: "Dice History Panel" },
  layoutPerfWindow: { zh: "性能监视器", en: "Performance Monitor" },
  layoutInitiative: { zh: "先攻条", en: "Initiative Tracker" },
  layoutBestiaryPanel: { zh: "怪物图鉴", en: "Bestiary Panel" },
  layoutBestiaryInfo: { zh: "怪物详情", en: "Bestiary Info" },
  layoutCcInfo: { zh: "角色卡信息", en: "Character Card Info" },
  layoutSearch: { zh: "搜索栏", en: "Search Bar" },
  layoutPortalEdit: { zh: "传送门编辑", en: "Portal Edit" },
  layoutStatusPalette: { zh: "状态调色板", en: "Status Palette" },
  layoutHpBar: { zh: "血条组件", en: "HP Bar" },
  layoutMusicBoard: { zh: "音乐板", en: "Music Board" },
  layoutEditorTitle: { zh: "布局编辑", en: "Layout Edit" },
  layoutEditorHint: {
    zh: "拖动面板代理到任意位置",
    en: "Drag panel proxy to any position",
  },
  layoutEditorReset: { zh: "重置全部", en: "Reset All" },
  layoutEditorSave: { zh: "保存", en: "Save" },
  // HP Bar page
  hpBarPinned: {
    zh: "已置顶（取消则恢复随选择关闭）",
    en: "Pinned (uncheck to restore auto-close)",
  },
  hpBarPinTooltip: {
    zh: "置顶面板（取消选中也保持显示）",
    en: "Pin panel (remains visible even when unchecked)",
  },
  hpBarLocked: {
    zh: "已锁定：战斗外玩家看不到血条详情。点击解锁让所有人可见。",
    en: "Locked: non-combatants can't see details. Click to unlock.",
  },
  hpBarUnlocked: {
    zh: "已解锁：所有人可见血条与 AC。点击锁定恢复战斗外隐藏。",
    en: "Unlocked: everyone sees HP & AC. Click to lock.",
  },

  // Drag preview labels
  dragPreviewCluster: { zh: "悬浮按钮", en: "Floating Button" },
  dragPreviewDiceHistory: { zh: "投骰记录", en: "Dice History" },
  dragPreviewPerfWindow: { zh: "性能监视器", en: "Performance Monitor" },
  dragPreviewInitiative: { zh: "先攻条", en: "Initiative Tracker" },
  dragPreviewBestiaryPanel: { zh: "怪物图鉴", en: "Bestiary Panel" },
  dragPreviewBestiaryInfo: { zh: "怪物详情", en: "Bestiary Info" },
  dragPreviewCcInfo: { zh: "角色卡", en: "Character Card" },
  ccPanelPinned: {
    zh: "已置顶（取消则恢复随选择关闭）",
    en: "Pinned (uncheck to restore auto-close)",
  },
  ccPanelPinTooltip: {
    zh: "置顶面板（取消选中也保持显示）",
    en: "Pin panel (remains visible even when unchecked)",
  },
  ccPanelPrivateLabel: {
    zh: "仅部分人可见",
    en: "Visible to a limited number of people",
  },
  ccPanelHiddenLabel: { zh: "仅 DM 可见", en: "Visible to DM only" },
  ccPanelPublicTitle: {
    zh: "公开 — 点击改为仅 DM 可见",
    en: "Public — Click to make visible to DM only",
  },
  ccPanelHiddenTitle: {
    zh: "仅 DM 可见 — 点击改为公开",
    en: "DM only — Click to make public",
  },

  // DM Announcement panel
  announcementTitle: { zh: "Full Suite", en: "Full Suite" },
  announcementSubtitle: { zh: "公告 / Announcement", en: "Announcement" },
  announcementLoadingPlaceholder: {
    zh: "加载公告中…",
    en: "Loading announcement…",
  },
  announcementCloseBtn: { zh: "我知道了", en: "Got it" },
  announcementLangCn: { zh: "CN", en: "CN" },
  announcementLangEn: { zh: "EN", en: "EN" },
  announcementLoadFailed: {
    zh: "加载公告失败",
    en: "Failed to load announcement",
  },

  // Announcement issue tags
  announcementBugTag: { zh: "缺陷", en: "bug" },
  announcementFeatureTag: { zh: "功能", en: "feature" },
  announcementWipTag: { zh: "进行中", en: "wip" },
  announcementDoneTag: { zh: "完成", en: "done" },

  // Announcement severity tags
  announcementCriticalTag: { zh: "严重", en: "critical" },
  announcementHighTag: { zh: "高", en: "high" },
  announcementMediumTag: { zh: "中", en: "medium" },
  announcementLowTag: { zh: "低", en: "low" },

  // === Dice history panel ===
  diceHistDelTitle: { zh: "删除这条记录", en: "Delete this entry" },
  diceHistDelTitleColl: {
    zh: "删除这条记录（含 {n} 个掷骰）",
    en: "Delete this entry ({n} rolls)",
  },
  diceHistDelAriaLabel: { zh: "删除", en: "Delete" },

  // === Dice skin panel (renderSkinsTab) ===
  diceSkinWebmFallbackTitle: {
    zh: "webm 缩略图无法预览（CORS / 解码失败）",
    en: "webm thumbnail unavailable (CORS / decode error)",
  },
  diceSkinHintLocal: {
    zh: "⚠ <b>本地电脑文件不能直接用</b> — 必须先把图片 / webm <b>上传到枭熊</b>：把它拖进场景作为「附件」，再右键附件选 <b>「设为我的骰子皮肤」</b>，或在下方粘贴该附件的 URL（须为 https:// 开头的绝对地址）。",
    en: '⚠ <b>Local files don\'t work directly</b> — you must first <b>upload</b> the image/webm to OBR: drag it into the scene as an attachment, then right-click and choose <b>"Set as my dice skin"</b>, or paste the attachment URL below (must start with https://).',
  },
  diceSkinSetsTitle: { zh: "皮肤套组", en: "Skin Sets" },
  diceSkinSetSaveBtn: { zh: "+ 保存当前为套组", en: "+ Save current as set" },
  diceSkinSetSaveBtnTitle: {
    zh: "把当前 7 个骰子的活动皮肤存为一个套组",
    en: "Save the current 7 active die skins as a set",
  },
  diceSkinSetsEmpty: {
    zh: "还没有套组。配好你想要的 7 个骰子皮肤后，点上面「+ 保存当前为套组」。",
    en: "No sets yet. Configure your 7 die skins, then click '+ Save current as set'.",
  },
  diceSkinSetChipTitleLoad: {
    zh: "一键载入「{name}」（覆盖 {n}/7 个骰子）",
    en: 'Load "{name}" (overwrites {n}/7 dice)',
  },
  diceSkinSetDelTitle: { zh: "删除该套组", en: "Delete this set" },
  diceSkinDefaultActive: {
    zh: "当前正在使用默认皮肤",
    en: "Currently using default skin",
  },
  diceSkinDefaultTitle: {
    zh: "点击恢复为默认皮肤",
    en: "Click to restore default skin",
  },
  diceSkinActiveTitle: { zh: "当前活动皮肤", en: "Active skin" },
  diceSkinSetTitle: {
    zh: "点击设为当前皮肤",
    en: "Click to set as active skin",
  },
  diceSkinLibDelTitle: { zh: "从皮肤库移除", en: "Remove from skin library" },
  diceSkinLibEmpty: {
    zh: "右键场景里的附件「设为我的骰子皮肤」，或下方粘贴 URL，加入这里",
    en: 'Right-click an attachment and choose "Set as my dice skin", or paste a URL below.',
  },
  diceSkinStatusRandom: { zh: "随机 ({n})", en: "Random ({n})" },
  diceSkinStatusCustom: { zh: "自定义", en: "Custom" },
  diceSkinStatusDefault: { zh: "默认", en: "Default" },

  // === Bestiary panel ===
  bestiaryTransformForm: { zh: "变身形态", en: "Transform Form" },
  bestiaryBulkBadge: {
    zh: "（群体绑定 · {n} 个 token）",
    en: "(Bulk bind · {n} tokens)",
  },
  bestiaryDragTitle: { zh: "拖动面板", en: "Drag panel" },
  bestiaryFilterSourceHint: {
    zh: "按来源代码筛选（如 PHB / kiwee / 你的本子英文名）",
    en: "Filter by source code (e.g. PHB / kiwee / your supplement name)",
  },
  bestiaryAutoHideHint: {
    zh: "加入场景时自动隐藏新生成的怪物（仅 DM 可见，方便先布阵再揭面）",
    en: "Auto-hide newly spawned monsters (DM-only; lets you set up before reveal)",
  },
  bestiaryAutoInitHint: {
    zh: "加入场景时自动加入先攻",
    en: "Auto-add to initiative when spawned",
  },
  bestiaryAutoNameHint: {
    zh: "加入场景时自动把怪物名字写到 token 的 plainText（OBR 原生显示在 token 下方的小字标签）",
    en: "Auto-write monster name to token's plainText label (shown below token in OBR)",
  },

  // === Follow module notifications ===
  followClickHint: {
    zh: "请左键点击要跟随的目标 token（按 Esc 取消）",
    en: "Left-click the target token to follow (Esc to cancel)",
  },
  followCycleError: {
    zh: "跟随会形成循环，无法绑定",
    en: "Following would create a cycle — cannot bind",
  },
  followSource: { zh: "源", en: "Source" },
  followTarget: { zh: "目标", en: "Target" },
  followBound: {
    zh: "已绑定跟随：{source} → {target}",
    en: "Follow bound: {source} → {target}",
  },

  // === Character card info page static UI ===
  ccInfoNameSyncTitle: {
    zh: "点击 → 同步 / 清除 token 名字：{name}",
    en: "Click → sync / clear token name: {name}",
  },
  ccInfoUnnamed: { zh: "未命名", en: "Unnamed" },
  ccInfoEmpty: { zh: "无", en: "None" },
  ccInfoPinnedTitle: {
    zh: "已置顶（取消则恢复随选择关闭）",
    en: "Pinned (unpin to close on deselect)",
  },
  ccInfoPinTitle: {
    zh: "置顶面板（取消选中也保持显示）",
    en: "Pin panel (stays open after deselect)",
  },
  ccInfoSkillSuffix: { zh: "检定", en: " Check" },
  ccInfoSaveSuffix: { zh: "豁免", en: " Save" },
  ccInfoHitSuffix: { zh: " 命中", en: " Hit" },
  ccInfoDmgSuffix: { zh: " 伤害", en: " Damage" },
  ccInfoExtraDmg: { zh: " + 附加", en: " + Bonus" },
  ccInfoMasteryPrefix: { zh: "精通：", en: "Mastery: " },

  // === Character card panel timestamps ===
  ccPanelTimestampMin: { zh: "{n}分钟前", en: "{n} min ago" },
  ccPanelTimestampHour: { zh: "{n}小时前", en: "{n} h ago" },
  ccPanelTimestampDay: { zh: "{n}天前", en: "{n} d ago" },
  ccPanelDownload2014: {
    zh: "下载 5E2014（传统 5e）角色卡模板",
    en: "Download 5E2014 (Classic 5e) Character Sheet Template",
  },
  ccPanelDownload2024: {
    zh: "下载 5E2024（5e 修订）角色卡模板",
    en: "Download 5E2024 (Revised 5e) Character Sheet Template",
  },

  // Settings dialogs
  settingsDeleteLibraryConfirm: {
    zh: "删除此库？这不会影响数据本身，只会从设置里移除。",
    en: "Delete this library? This won't affect the data itself, only remove it from settings.",
  },

  // === Trickster edit panel ===
  tricksterTitle: { zh: "捣蛋鬼在哪？", en: "Where's the Trickster?" },
  tricksterFiredBadge: { zh: "已触发", en: "Triggered" },
  tricksterLblName: { zh: "名称（仅 GM 自查看）", en: "Name (GM-only)" },
  tricksterNamePh: { zh: "如：哥布林伏击点", en: "e.g. Goblin Ambush Point" },
  tricksterLblTarget: { zh: "触发对象", en: "Trigger target" },
  tricksterTargetAll: { zh: "所有角色 / 坐骑", en: "All characters / mounts" },
  tricksterTargetPlayer: { zh: "仅玩家单位", en: "Player tokens only" },
  tricksterTargetNpc: {
    zh: "仅 NPC（GM 控制）",
    en: "NPC only (GM-controlled)",
  },
  tricksterOneShot: { zh: "仅触发一次", en: "One-shot trigger" },
  tricksterOneShotDesc: {
    zh: "触发后自动锁定，再进入也不会触发，可在此处重置",
    en: "Auto-locks after triggering; entering again won't re-trigger. Reset here to re-enable.",
  },
  tricksterVisible: { zh: "玩家可见", en: "Visible to players" },
  tricksterVisibleDesc: {
    zh: "关闭后玩家看不到图标，GM 仍能看到半透明残影",
    en: "When off, players see nothing; GM still sees a faint ghost.",
  },
  tricksterLocked: { zh: "锁定", en: "Locked" },
  tricksterLockedDesc: {
    zh: "防止编辑时把触发区误拖动",
    en: "Prevents accidental dragging of the trigger zone while editing.",
  },
  tricksterDelete: { zh: "删除", en: "Delete" },
  tricksterReset: { zh: "重置已触发", en: "Reset Triggered" },
  tricksterCancel: { zh: "取消", en: "Cancel" },
  tricksterSave: { zh: "保存", en: "Save" },
  tricksterDeleteConfirm: {
    zh: "确定删除此捣蛋鬼？此操作不可撤销。",
    en: "Delete this trickster zone? This cannot be undone.",
  },

  // === Circle image panel ===
  circleImageTitle: { zh: "图片处理", en: "Image Tool" },
  circleImageTabCircle: { zh: "圆形裁剪", en: "Circle Crop" },
  circleImageTabBgRemove: { zh: "白底黑底剔除", en: "Remove Background" },
  circleImageDropHint: {
    zh: "拖入图片 / 点击选择 / Ctrl+V 粘贴",
    en: "Drop image / click to choose / Ctrl+V paste",
  },
  circleImageDropSub: {
    zh: "支持 JPG / PNG / WebP / SVG，最大 10 MB",
    en: "Supports JPG / PNG / WebP / SVG, max 10 MB",
  },
  circleImageLblSize: { zh: "大小", en: "Size" },
  circleImageLblZoom: { zh: "缩放", en: "Zoom" },
  circleImageLblRingColor: { zh: "环颜色", en: "Ring color" },
  circleImageLblBg: { zh: "背景", en: "Background" },
  circleImageBgWhite: { zh: "剔除白底", en: "Remove white" },
  circleImageBgBlack: { zh: "剔除黑底", en: "Remove black" },
  circleImageLblTolerance: { zh: "容差", en: "Tolerance" },
  circleImageLblFeather: { zh: "羽化", en: "Feather" },
  circleImageBtnReset: { zh: "换图", en: "Change image" },
  circleImageBtnUpload: { zh: "⤴ 添加到资源库", en: "⤴ Add to library" },
  circleImageUploadTitle: {
    zh: "把当前裁剪结果上传到 OBR 资源库；之后可从资源库拖到场景使用",
    en: "Upload the cropped result to the OBR asset library; drag it into the scene from there.",
  },
  circleImageErrNotImage: {
    zh: "请选择图片文件（JPG / PNG / WebP / SVG）",
    en: "Please select an image file (JPG / PNG / WebP / SVG)",
  },
  circleImageErrTooLarge: {
    zh: "图片大于 10 MB，太大了。先压缩一下吧。",
    en: "Image exceeds 10 MB. Please compress it first.",
  },
  circleImageErrLoad: { zh: "图片加载失败", en: "Failed to load image" },
  circleImageErrRead: { zh: "读取失败", en: "Read failed" },
  circleImageErrObrNotReady: {
    zh: "OBR 还在初始化，稍后再试",
    en: "OBR is still initializing, please try again shortly",
  },
  circleImageErrGenerate: {
    zh: "生成图片失败：",
    en: "Failed to generate image: ",
  },
  circleImageErrUpload: {
    zh: "上传到资源库失败：",
    en: "Upload to asset library failed: ",
  },
  circleImageUploading: { zh: "上传中…", en: "Uploading…" },
  circleImageUploaded: {
    zh: "✓ 已上传，从资源库拖入场景",
    en: "✓ Uploaded — drag from library into scene",
  },
  circleImageNameCircle: { zh: "圆形图片", en: "circle-image" },
  circleImageNameBgRemove: { zh: "去底图片", en: "bg-removed" },

  // === Dice skin picker ===
  diceSkinPickerTitle: { zh: "设为我的骰子皮肤", en: "Set as My Dice Skin" },
  diceSkinPickerHint: {
    zh: "点击下面任意骰子，把这张图设为你投出该骰子时显示的皮肤。设置后全场玩家投你的骰都能看到。",
    en: "Click any die below to set this image as your skin for that die. All players will see it when you roll.",
  },
  diceSkinPickerCancel: { zh: "取消", en: "Cancel" },
  diceSkinPickerErrPreview: {
    zh: "未能读取图片信息，请重试。",
    en: "Could not read image info, please try again.",
  },
  diceSkinPickerUnnamed: { zh: "（未命名附件）", en: "(unnamed asset)" },
  diceSkinPickerVideo: { zh: "动图 webm", en: "Animated webm" },
  diceSkinPickerStatic: { zh: "静态图片", en: "Static image" },

  // === Dice replay ===
  diceReplayHintOverlay: {
    zh: "点击气泡或再次点击词条关闭",
    en: "Click bubble or click row again to close",
  },

  // === Bestiary group saves ===
  bestiaryGroupSavesTitle: { zh: "群体豁免 / 属性", en: "Group Saves / Stats" },
  bestiaryGroupSavesTitleInit: { zh: "群体先攻", en: "Group Initiative" },
  bestiaryGroupSavesHint: {
    zh: "左键投掷 · 右键更多",
    en: "Left-click roll · Right-click more",
  },
  bestiaryGroupSavesHintInit: {
    zh: "战斗准备阶段 · 1d20 + 各自敏捷调整值",
    en: "Combat prep · 1d20 + each token's DEX mod",
  },
  bestiaryGroupSavesCountSel: { zh: "{n} 个目标", en: "{n} targets" },
  bestiaryGroupSavesIvAdv: { zh: "优势", en: "Adv" },
  bestiaryGroupSavesIvNormal: { zh: "普通", en: "Normal" },
  bestiaryGroupSavesIvDis: { zh: "劣势", en: "Dis" },

  // === Bestiary group resolve ===
  bestiaryGroupResolveTitle: {
    zh: "⚖ 群体豁免结算",
    en: "⚖ Group Save Resolve",
  },
  bestiaryGroupResolveDC: { zh: "本次豁免DC", en: "Save DC" },
  bestiaryGroupResolveFieldTitle: {
    zh: "选择要修改的字段",
    en: "Select field to modify",
  },
  bestiaryGroupResolveValuePh: { zh: "数值", en: "Value" },
  bestiaryGroupResolveBtnDmg: {
    zh: "−（失败全额 / 成功减半向下取整）",
    en: "− (fail: full / success: half, floor)",
  },
  bestiaryGroupResolveBtnOk: { zh: "好了", en: "Done" },
  bestiaryGroupResolveNoResult: {
    zh: "（暂无投掷结果，等待动画结束…）",
    en: "(No roll results yet — waiting for animation…)",
  },
  bestiaryGroupResolveErrNoValue: { zh: "请填写数值", en: "Enter a value" },
  bestiaryGroupResolveErrNoDC: {
    zh: "扣血请先填 DC",
    en: "DC required for damage",
  },
  bestiaryGroupResolveAppliedDmg: {
    zh: "已应用：失败者 −{v}，成功者 −{half}",
    en: "Applied: fail −{v}, success −{half}",
  },
  bestiaryGroupResolveAppliedAll: {
    zh: "已应用：全员 +{v}",
    en: "Applied: +{v} to all",
  },
  bestiaryGroupResolveAppliedSet: {
    zh: "已应用：全员 = {v}",
    en: "Applied: set to {v} for all",
  },
  bestiaryGroupResolveSaveSuffix: { zh: "豁免", en: " Save" },

  // === Drag preview ===
  dragPreviewFallback: { zh: "面板", en: "Panel" },

  // === HP bar hardcoded ===
  hpBarResetTitle: {
    zh: "重置画面血条 — 清掉缓存重画，修复偶发的位置漂移",
    en: "Reset on-screen HP bar — clear cache and redraw, fixes occasional drift",
  },
  hpBarDragTitle: { zh: "拖动重新定位", en: "Drag to reposition" },
  hpBarLockTitle: {
    zh: "锁定 = 战斗外向玩家隐藏血条详情；解锁 = 全员可见",
    en: "Locked = hide HP details from players outside combat; Unlocked = everyone sees",
  },

  // === Misc module labels (inline en?...: strings) ===
  circleImageContextLabel: {
    zh: "圆形图片 / 去底",
    en: "Circle Image / BG Remove",
  },
  dragPreviewGhostLabel: { zh: "面板", en: "Panel" },
  rollerFallback: { zh: "投骰人", en: "Roller" },
};

export function t(lang: Language, key: keyof typeof TR): string {
  return TR[key]?.[lang] ?? key;
}

export function applyLangAttr(lang: Language) {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
}

// Walk the document and translate every element carrying a data-i18n*
// attribute. Iframe pages call this once at startup (and again after
// language change). Supported attrs:
//   data-i18n            → element.textContent
//   data-i18n-html       → element.innerHTML (use for keys with <br> etc.)
//   data-i18n-placeholder→ input/textarea placeholder
//   data-i18n-title      → element title attribute
//   data-i18n-aria       → aria-label attribute
export function applyI18nDom(
  lang: Language,
  root: Document | HTMLElement = document,
) {
  applyLangAttr(lang);
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n as keyof typeof TR | undefined;
    if (key && TR[key]) el.textContent = t(lang, key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((el) => {
    const key = el.dataset.i18nHtml as keyof typeof TR | undefined;
    if (key && TR[key]) el.innerHTML = t(lang, key);
  });
  root
    .querySelectorAll<HTMLElement>("[data-i18n-placeholder]")
    .forEach((el) => {
      const key = el.dataset.i18nPlaceholder as keyof typeof TR | undefined;
      if (key && TR[key]) (el as HTMLInputElement).placeholder = t(lang, key);
    });
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach((el) => {
    const key = el.dataset.i18nTitle as keyof typeof TR | undefined;
    if (key && TR[key]) el.title = t(lang, key);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach((el) => {
    const key = el.dataset.i18nAria as keyof typeof TR | undefined;
    if (key && TR[key]) el.setAttribute("aria-label", t(lang, key));
  });
}
