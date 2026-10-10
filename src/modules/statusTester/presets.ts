// Status Tester — built-in D&D 5e (2014) presets.
//
// Seeded into the room library the first time a GM loads the module in
// a room that has no library yet (a library the GM emptied on purpose
// is NOT re-seeded). The library editor also has a "restore" button
// that re-adds any preset missing from the library. Presets are
// ordinary library entries afterwards: editable and deletable.

import type { StatusDef } from "./types";

interface Preset {
  id: string;
  en: string;
  zh: string;
  color: string;
  icon?: string;
  emoji?: string;
  levels?: boolean;
}

/** Negative: the official PHB 2014 conditions. */
const NEGATIVE: Preset[] = [
  { id: "dnd5e-blinded", en: "Blinded", zh: "目盲", color: "#5d6d7e", icon: "dnd-blinded" },
  { id: "dnd5e-charmed", en: "Charmed", zh: "魅惑", color: "#e84393", icon: "dnd-charmed" },
  { id: "dnd5e-deafened", en: "Deafened", zh: "耳聋", color: "#7f8c8d", icon: "dnd-deafened" },
  { id: "dnd5e-exhaustion", en: "Exhaustion", zh: "力竭", color: "#8e6e53", icon: "dnd-exhaustion", levels: true },
  { id: "dnd5e-frightened", en: "Frightened", zh: "恐慌", color: "#8e44ad", icon: "dnd-frightened" },
  { id: "dnd5e-grappled", en: "Grappled", zh: "受擒", color: "#d35400", icon: "dnd-grappled" },
  { id: "dnd5e-incapacitated", en: "Incapacitated", zh: "失能", color: "#95a5a6", icon: "dnd-incapacitated" },
  { id: "dnd5e-invisible", en: "Invisible", zh: "隐形", color: "#74b9ff", icon: "dnd-invisible" },
  { id: "dnd5e-paralyzed", en: "Paralyzed", zh: "麻痹", color: "#f1c40f", icon: "dnd-paralyzed" },
  { id: "dnd5e-petrified", en: "Petrified", zh: "石化", color: "#7b7d7d", icon: "dnd-petrified" },
  { id: "dnd5e-poisoned", en: "Poisoned", zh: "中毒", color: "#27ae60", icon: "dnd-poisoned" },
  { id: "dnd5e-prone", en: "Prone", zh: "倒地", color: "#a0522d", icon: "dnd-prone" },
  { id: "dnd5e-restrained", en: "Restrained", zh: "束缚", color: "#34495e", icon: "dnd-restrained" },
  { id: "dnd5e-stunned", en: "Stunned", zh: "震慑", color: "#f39c12", icon: "dnd-stunned" },
  { id: "dnd5e-unconscious", en: "Unconscious", zh: "昏迷", color: "#2c3e50", icon: "dnd-unconscious" },
];

/** Positive: common 2014 buffs / states tracked at the table. */
const POSITIVE: Preset[] = [
  { id: "dnd5e-blessed", en: "Blessed", zh: "祝福术", color: "#f6e58d", icon: "dnd-blessed" },
  { id: "dnd5e-bardic-inspiration", en: "Bardic Inspiration", zh: "诗人激励", color: "#be2edd", icon: "dnd-bardic-inspiration" },
  { id: "dnd5e-guidance", en: "Guidance", zh: "神导术", color: "#ffeaa7", icon: "dnd-guidance" },
  { id: "dnd5e-hasted", en: "Hasted", zh: "加速术", color: "#00cec9", icon: "dnd-hasted" },
  { id: "dnd5e-heroism", en: "Heroism", zh: "英雄气概", color: "#e17055", icon: "dnd-heroism" },
  { id: "dnd5e-shield-of-faith", en: "Shield of Faith", zh: "虔诚护盾", color: "#0984e3", icon: "dnd-shield-of-faith" },
  { id: "dnd5e-raging", en: "Raging", zh: "狂暴", color: "#c0392b", icon: "dnd-raging" },
  { id: "dnd5e-concentrating", en: "Concentrating", zh: "专注", color: "#6c5ce7", icon: "dnd-concentrating" },
  { id: "dnd5e-dodging", en: "Dodging", zh: "闪避", color: "#81ecec", icon: "dnd-dodging" },
  { id: "dnd5e-hidden", en: "Hidden", zh: "躲藏", color: "#2d3436", icon: "dnd-hidden" },
  { id: "dnd5e-protection-evil-good", en: "Prot. from Evil & Good", zh: "防护善恶", color: "#fdcb6e", icon: "dnd-protection-evil-good" },
  { id: "dnd5e-mage-armor", en: "Mage Armor", zh: "法师护甲", color: "#a29bfe", icon: "dnd-mage-armor" },
];

const ALL: Preset[] = [...NEGATIVE, ...POSITIVE];

/** Icon/emoji the presets were FIRST seeded with (before the dedicated
 *  D&D icon set). A library entry still carrying exactly these values
 *  was never customised, so it can be moved to the new icon safely. */
export const LEGACY_PRESET_LOOK: Record<string, { icon?: string; emoji?: string }> = {
  "dnd5e-blinded": { icon: "eye-off" },
  "dnd5e-charmed": { icon: "heart" },
  "dnd5e-deafened": { emoji: "🔇" },
  "dnd5e-exhaustion": { emoji: "😩" },
  "dnd5e-frightened": { emoji: "😱" },
  "dnd5e-grappled": { emoji: "✊" },
  "dnd5e-incapacitated": { emoji: "💫" },
  "dnd5e-invisible": { icon: "ghost" },
  "dnd5e-paralyzed": { icon: "bolt" },
  "dnd5e-petrified": { emoji: "🗿" },
  "dnd5e-poisoned": { icon: "poison" },
  "dnd5e-prone": { emoji: "⬇️" },
  "dnd5e-restrained": { icon: "chain" },
  "dnd5e-stunned": { icon: "spiral" },
  "dnd5e-unconscious": { icon: "sleep" },
  "dnd5e-blessed": { icon: "star" },
  "dnd5e-bardic-inspiration": { emoji: "🎵" },
  "dnd5e-guidance": { emoji: "🙏" },
  "dnd5e-hasted": { emoji: "⏩" },
  "dnd5e-heroism": { emoji: "🦸" },
  "dnd5e-shield-of-faith": { icon: "shield" },
  "dnd5e-raging": { icon: "flame" },
  "dnd5e-concentrating": { emoji: "🧠" },
  "dnd5e-dodging": { emoji: "💨" },
  "dnd5e-hidden": { emoji: "👤" },
  "dnd5e-protection-evil-good": { emoji: "☀️" },
  "dnd5e-mage-armor": { emoji: "🔮" },
};

/** id → current preset icon. */
export const PRESET_ICON: Record<string, string> = Object.fromEntries(
  ALL.map((p) => [p.id, p.icon ?? ""]),
);

export const PRESET_IDS: readonly string[] = ALL.map((p) => p.id);

/** Preset statuses with titles in the given UI language. */
export function presetDefs(lang: string): StatusDef[] {
  return ALL.map((p) => ({
    id: p.id,
    title: lang === "zh" ? p.zh : p.en,
    color: p.color,
    ...(p.icon ? { icon: p.icon } : {}),
    ...(p.emoji ? { emoji: p.emoji } : {}),
    ...(p.levels ? { levels: true } : {}),
  }));
}

/** Preset ids that carry levels (Exhaustion). */
export const PRESET_LEVELS: ReadonlySet<string> = new Set(ALL.filter((p) => p.levels).map((p) => p.id));
