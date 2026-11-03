import type { CardData } from "@here-to-slay/protocol";

/** Pure search for the card picker (tests/card-search.test.ts). */
export const KINDS = [
  { key: "all", label: "Tất cả" },
  { key: "hero", label: "Hero" },
  { key: "item", label: "Item" },
  { key: "magic", label: "Magic" },
  { key: "modifier", label: "Modifier" },
  { key: "challenge", label: "Challenge" },
  { key: "monster", label: "Monster" },
  { key: "party_leader", label: "Leader" },
] as const;
export type KindKey = (typeof KINDS)[number]["key"];
export const KIND_LABEL: Record<string, string> = { hero: "Hero", item: "Item", cursed_item: "Cursed Item", magic: "Magic", modifier: "Modifier", challenge: "Challenge", monster: "Monster", party_leader: "Party Leader" };

/** Lower-case, no Vietnamese/Latin diacritics, so "dodgy" / "Dódgy" / "dodgy dealer" all match. */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();
}
export const classOf = (card: CardData) => ("heroClass" in card && card.heroClass) || ("maskClass" in card && card.maskClass) || "";

/** Every whitespace-separated term must appear in name / kind / class / id. Name-prefix matches rank first. */
export function searchCards(cards: readonly CardData[], query: string, kind: KindKey): CardData[] {
  const terms = foldText(query).split(/\s+/).filter(Boolean);
  const pool = cards.filter((card) => kind === "all" || card.kind === kind || (kind === "item" && card.kind === "cursed_item"));
  const scored = pool.flatMap((card) => {
    const name = foldText(card.name);
    const hay = `${name} ${foldText(KIND_LABEL[card.kind] ?? card.kind)} ${foldText(String(classOf(card)))} ${card.definitionId}`;
    if (!terms.every((t) => hay.includes(t))) return [];
    const score = !terms.length ? 0 : name.startsWith(terms.join(" ")) ? 0 : terms.every((t) => name.includes(t)) ? 1 : 2;
    return [{ card, score }];
  });
  return scored.sort((a, b) => a.score - b.score || a.card.name.localeCompare(b.card.name)).map((s) => s.card);
}

