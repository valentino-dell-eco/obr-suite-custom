// Resource Tracker — per-token consumable / progress / numeric
// resources. Each token can hold an arbitrary number of resources;
// the GM (or token owner) clicks the icons to consume / restore.
//
// Storage: `com.obr-suite/resources/data` on the token's metadata
// is an array of Resource entries. The whole array round-trips via
// OBR.scene.items.updateItems writes — small payload, no broadcast
// limit issues.

export const PLUGIN_ID = "com.obr-suite/resources";
export const RESOURCES_KEY = `${PLUGIN_ID}/data`;

/** Display style for a resource. */
export type ResourceType =
  | "count"     // N discrete clickable icons (e.g. spell slots: 2/2)
  | "bar"       // single icon + horizontal progress bar
  | "number"    // single icon + readable "current / max" text
  | "dieRoll"   // discrete uses that trigger a die roll on consumption
  | "charges";  // discrete uses that trigger a die-roll FORMULA on RECOVERY (see chargesFormula below)

export type IconId =
  | "gem"        // 紫水晶棱形
  | "heart"      // 红心
  | "starFour"   // 四角星
  | "starFive"   // 五芒星
  | "skull"      // 骷髅
  | "hourglass"  // 沙漏
  | "coin"       // 金币
  | "catEye"     // 猫眼石
  | "gear"       // 齿轮
  | "swords"     // 交叉双剑
  | "apple"      // 苹果
  | "drumstick"  // 鸡腿
  | "mask"       // 面具
  | "cross"      // 十字架
  | "axe"        // 斧头
  | "shield"     // 盾牌
  | "fist"       // 拳头
  | "bow"        // 弓箭
  | "note"       // 音符
  | "lute"       // 琴
  | "dagger"     // 匕首
  | "lightning"  // 闪电
  | "bloodDrop"  // 血滴
  | "leaf"       // 树叶
  | "waterDrop"  // 水滴
  | "spellbook"  // 魔法书
  | "d4"        // 四面体骰
  | "d6"        // 六面体骰
  | "d10"       // 十面体骰
  | "d8"        // 八面体骰
  | "d12"       // 十二面体骰
  | "d20"       // 二十面体骰
  | "d100";     // 百面体/百分骰

/** 2026-07 — was a fixed enum (D2..D100); dieRoll resources now carry a
 *  free-form dice formula instead (same grammar as `chargesFormula`
 *  below: "1d6", "2d4+1", etc.), edited via a text input rather than a
 *  select. Kept as a plain string alias (not removed outright) so old
 *  call sites reads like `Resource["dieInfo"]` still resolve to
 *  something sensible; the actual validation now lives in
 *  storage.ts's normaliseResource (any non-empty string, same as
 *  chargesFormula) rather than an enum check. */
export type DieInfo = string;

/** When a resource is fully restored. Undefined/"none" means no
 *  recovery button ever touches it automatically — the resource
 *  stays purely manual (pips / edit modal). */
export type RecoveryType = "none" | "SR" | "LR" | "DW" | "DS";

export interface Resource {
  /** Stable id — `${Date.now()}-${Math.random()}` works. */
  id: string;
  name: string;
  type: ResourceType;
  /** Current value. For "count" type: integer 0..max. For "bar":
   *  any number 0..max. For "number": any number (can exceed max
   *  if the user types a higher value). */
  current: number;
  max: number;
  icon: IconId;
  /** Dice formula used only by `dieRoll` resources (e.g. "1d6",
   *  "2d4+1") — rolled via the quick-roll popup on CONSUME (delta <
   *  0), never automatically. The popup pre-fills this formula and
   *  lets the player tweak it for that one roll before firing; the
   *  resource's `current` only decrements once the roll actually
   *  happens (see dice/index.ts's BC_QUICK_ROLL handler). */
  dieInfo?: DieInfo | null;
  /** When this resource gets automatically topped up. Absent/"none"
   *  = never touched by the SR/LR/DW/DS recovery buttons. */
  recovery?: RecoveryType | null;
  /** Dice-roll formula used only by `charges` resources, evaluated
   *  when the resource is recovered (NOT on consumption). Supports
   *  dice terms ("2d4", "1d6+3") and/or plain flat constants ("3").
   *  Empty string / null / undefined means "restore straight to max,
   *  no roll required" — the resource never appears in the recharge
   *  modal in that case. The rolled total is ADDED to `current` and
   *  clamped to `max`. */
  chargesFormula?: string | null;
  /** Optional sort hint — lower values render first. Defaults to
   *  insertion order via the array index when undefined. */
  order?: number;
}

/** Default resources seeded for a token that has none yet. Empty
 *  array — users explicitly create their own. */
export const DEFAULT_RESOURCES: Resource[] = [];
