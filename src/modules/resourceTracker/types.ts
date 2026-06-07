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
  | "dieRoll";  // discrete uses that trigger a die roll on consumption

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

export type DieInfo =
  | "D2"
  | "D4"
  | "D6"
  | "D8"
  | "D10"
  | "D12"
  | "D20"
  | "D100"

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
  /** Optional die roll configuration used only by `dieRoll` resources. */
  dieInfo?: DieInfo | null;
  /** Optional sort hint — lower values render first. Defaults to
   *  insertion order via the array index when undefined. */
  order?: number;
}

/** Default resources seeded for a token that has none yet. Empty
 *  array — users explicitly create their own. */
export const DEFAULT_RESOURCES: Resource[] = [];
