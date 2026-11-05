// Static, public card facts for the CardRenderer (ADR-003: one card-data source
// shared by engine and renderer). Lookup is by definitionId only — this never
// computes game state; the server snapshot stays authoritative.
import type { BaseCardKind, CardData, CardDataFile, HeroClass } from "@here-to-slay/protocol";
import cardFile from "../../worker/src/content/base-cards.json";
import templateSpec from "../../../docs/contracts/CARD_TEMPLATE_SPEC.json";

const data = cardFile as unknown as CardDataFile;
const byId = new Map<string, CardData>(data.cards.map((card) => [card.definitionId, card]));

export const cardData = (definitionId: string): CardData | undefined => byId.get(definitionId);

export const HERO_CLASSES: readonly HeroClass[] = ["bard", "fighter", "guardian", "ranger", "thief", "wizard"];
/** Expansion classes have no icon/colour yet (EX-06); they render as classless until the UI ships them. */
export const webClass = (c: string | null | undefined): HeroClass | undefined => (HERO_CLASSES.includes(c as HeroClass) ? (c as HeroClass) : undefined);

type Rgb = readonly [number, number, number] | number[];
const rgb = (value: Rgb) => `rgb(${value[0]} ${value[1]} ${value[2]})`;
const colors = templateSpec.colors;

export const CLASS_COLOR: Record<HeroClass | "none", string> = {
  none: rgb(colors.classes.none),
  bard: rgb(colors.classes.bard),
  fighter: rgb(colors.classes.fighter),
  guardian: rgb(colors.classes.guardian),
  ranger: rgb(colors.classes.ranger),
  thief: rgb(colors.classes.thief),
  wizard: rgb(colors.classes.wizard),
};

export const PALETTE = {
  magic: rgb(colors.magic),
  itemFrame: rgb(colors.itemFrame),
  itemTitle: rgb(colors.itemTitle),
  cursedTitle: rgb(colors.cursedItemTitle),
  monsterPanel: rgb(colors.monsterBottomPanel),
  heroBonusBox: rgb(colors.monsterHeroBonusBox),
  positive: rgb(colors.modifierPositive),
  negative: rgb(colors.modifierNegative),
  text: rgb(colors.bottomText),
  textDark: rgb(colors.bottomTextDark),
};

type LayoutKey = keyof typeof templateSpec.layouts;
type Rect = { x: number; y: number; w: number; h: number };

/** Card frame size (px at native card size) from the template spec. */
export function cardSize(kind: BaseCardKind) {
  const layout = templateSpec.layouts[kind as LayoutKey] ?? templateSpec.layouts[kind === "cursed_item" ? "item" : "magic"];
  return templateSpec.cardSizes[layout.size as "tarot" | "poker"];
}

/** Layout block for a kind (cursed items share the item layout). */
export function layoutFor(kind: BaseCardKind) {
  return templateSpec.layouts[(kind === "cursed_item" ? "item" : kind) as LayoutKey];
}

/** A spec rectangle as percentage CSS box relative to the card. */
export function pct(kind: BaseCardKind, rect: Rect) {
  const size = cardSize(kind);
  return {
    left: `${(rect.x / size.width) * 100}%`,
    top: `${(rect.y / size.height) * 100}%`,
    width: `${(rect.w / size.width) * 100}%`,
    height: `${(rect.h / size.height) * 100}%`,
  };
}

/** Description area per the spec: left/right insets, bottom band, optional frame offset. */
export function descriptionBox(kind: BaseCardKind) {
  const size = cardSize(kind);
  const d = layoutFor(kind).description as { left: number; right: number; areaHeightFromBottom: number };
  // frameOffset in the spec shifts the frame image, not the text block; applying it
  // would push text under the class symbol, so the band starts at the bottom area.
  const top = size.height - d.areaHeightFromBottom;
  return {
    left: `${(d.left / size.width) * 100}%`,
    right: `${(d.right / size.width) * 100}%`,
    top: `${(top / size.height) * 100}%`,
    height: `${(d.areaHeightFromBottom / size.height) * 100}%`,
  };
}

export const titleCase = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** Leader display name; falls back to the id slug if the catalog lacks it. */
export const leaderDisplayName = (id: string) =>
  cardData(id)?.name ?? titleCase(id.replace("hts.base.v1.party-leader.", "").replaceAll("-", " "));
