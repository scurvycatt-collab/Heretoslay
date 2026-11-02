// GAME-004 — base card data: loader + validator.
// Data file: ./base-cards.json (schema: packages/protocol/src/cards.ts).
// Every card carries per-field provenance; sources are secondary/community and
// rights are UNVERIFIED. No artwork here (ADR-003).

import type {
  CardData,
  CardDataFile,
  FieldStatus,
  HeroClass,
  MonsterCardData,
  TargetRule,
} from "@here-to-slay/protocol";
import raw from "./base-cards.json" with { type: "json" };
import { BASE_REFERENCE_DEFINITIONS } from "./base-reference.ts";

export const HERO_CLASSES: readonly HeroClass[] = [
  "bard",
  "fighter",
  "guardian",
  "ranger",
  "thief",
  "wizard",
];

const FIELD_STATUSES: readonly FieldStatus[] = [
  "corroborated",
  "single_source",
  "majority",
  "derived",
  "UNVERIFIED",
];

const TARGET_RULES: readonly TargetRule[] = [
  "none",
  "other_player",
  "hero_other_party",
  "two_heroes_other_party",
  "hero_other_party_and_own_hero",
  "own_hero",
  "own_hero_with_cursed_item",
  "any_hero_with_item",
];

/** Mechanic fields that must carry provenance, per kind (in addition to `text`). */
const REQUIRED_PROVENANCE: Record<CardData["kind"], readonly string[]> = {
  hero: ["heroClass", "rollThreshold", "effectId", "target"],
  monster: ["requirement", "slay", "penaltyRange", "penalty", "penaltyText", "slainEffectId"],
  item: ["equip", "maskClass", "effectId"],
  cursed_item: ["equip", "maskClass", "effectId"],
  magic: ["effectId", "target"],
  modifier: ["options"],
  challenge: [],
  party_leader: ["heroClass", "effectId", "bannedPlayerCounts"],
};

/** Fields where null is a real value (not "unknown"). */
const NULLABLE_FIELDS = new Set(["maskClass"]);

const isInt = (value: unknown): value is number => Number.isInteger(value);
const isRoll = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  ((value as { op?: unknown }).op === "gte" || (value as { op?: unknown }).op === "lte") &&
  isInt((value as { value?: unknown }).value);

/**
 * Validates a card data file. Returns a list of human-readable problems (empty = valid).
 * Checks shape, enums, provenance coverage, source keys, null-only-when-UNVERIFIED,
 * and consistency with the CAT-001 reference catalog (ids, kinds, copy counts).
 */
export function validateCardData(file: CardDataFile): string[] {
  const errors: string[] = [];
  if (file.schema !== 1) errors.push("schema must be 1");
  if (file.setId !== "hts.base.v1") errors.push("setId must be hts.base.v1");
  if (file.rightsStatus !== "UNVERIFIED") errors.push("rightsStatus must stay UNVERIFIED");
  const sourceKeys = new Set(Object.keys(file.sources ?? {}));
  const seen = new Set<string>();
  const effectIds = new Set<string>();
  const effectIdOk = (value: string | null, prefix: string) => value === null || value.startsWith(prefix);

  for (const card of file.cards) {
    const where = card.definitionId ?? "<missing id>";
    if (seen.has(card.definitionId)) errors.push(`${where}: duplicate definitionId`);
    seen.add(card.definitionId);
    if (typeof card.name !== "string" || card.name.length === 0) errors.push(`${where}: name`);
    if (!isInt(card.quantity) || card.quantity < 1) errors.push(`${where}: quantity`);

    const prov = card.provenance ?? {};
    for (const field of ["text", ...REQUIRED_PROVENANCE[card.kind]]) {
      const entry = prov[field];
      if (!entry) {
        errors.push(`${where}: missing provenance for ${field}`);
        continue;
      }
      if (!FIELD_STATUSES.includes(entry.status)) errors.push(`${where}: bad status for ${field}`);
      if (!Array.isArray(entry.sources)) {
        errors.push(`${where}: sources for ${field} must be an array`);
        continue;
      }
      const distinct = new Set(entry.sources);
      if (distinct.size !== entry.sources.length) errors.push(`${where}: duplicate source on ${field}`);
      for (const source of distinct) {
        if (!sourceKeys.has(source)) errors.push(`${where}: unknown source ${source} on ${field}`);
      }
      if (entry.status !== "UNVERIFIED" && entry.status !== "derived" && distinct.size === 0) {
        errors.push(`${where}: ${field} is ${entry.status} without sources`);
      }
      if ((entry.status === "corroborated" || entry.status === "majority") && distinct.size < 2) {
        errors.push(`${where}: ${field} ${entry.status} needs ≥2 distinct sources`);
      }
      const value = (card as unknown as Record<string, unknown>)[field];
      if (value === null && entry.status !== "UNVERIFIED" && !NULLABLE_FIELDS.has(field)) {
        errors.push(`${where}: ${field} is null but not UNVERIFIED`);
      }
      if (entry.status === "UNVERIFIED" && value !== null) {
        errors.push(`${where}: ${field} is UNVERIFIED but has a value`);
      }
    }
    for (const field of ["effectId", "slainEffectId"]) {
      const value = (card as unknown as Record<string, unknown>)[field];
      if (typeof value === "string") {
        if (effectIds.has(value)) errors.push(`${where}: duplicate ${field} ${value}`);
        effectIds.add(value);
      }
    }
    if (card.text !== null && typeof card.text !== "string") errors.push(`${where}: text`);

    switch (card.kind) {
      case "hero":
        if (!HERO_CLASSES.includes(card.heroClass)) errors.push(`${where}: heroClass`);
        if (!isInt(card.rollThreshold) || card.rollThreshold < 2 || card.rollThreshold > 12) {
          errors.push(`${where}: rollThreshold`);
        }
        if (!TARGET_RULES.includes(card.target)) errors.push(`${where}: target`);
        if (!effectIdOk(card.effectId, "hero.")) errors.push(`${where}: effectId`);
        break;
      case "monster":
        errors.push(...validateMonster(card));
        break;
      case "item":
      case "cursed_item":
        if (card.equip !== (card.kind === "cursed_item" ? "any_hero" : "own_hero")) {
          errors.push(`${where}: equip must follow Q-06`);
        }
        if (card.maskClass !== null && !HERO_CLASSES.includes(card.maskClass)) {
          errors.push(`${where}: maskClass`);
        }
        if ((card.maskClass !== null) !== / Mask$/.test(card.name)) {
          errors.push(`${where}: maskClass only on Mask items`);
        }
        if (!effectIdOk(card.effectId, "item.")) errors.push(`${where}: effectId`);
        break;
      case "magic":
        if (!TARGET_RULES.includes(card.target)) errors.push(`${where}: target`);
        if (!effectIdOk(card.effectId, "magic.")) errors.push(`${where}: effectId`);
        break;
      case "modifier":
        if (!Array.isArray(card.options) || card.options.length === 0 || !card.options.every(isInt)) {
          errors.push(`${where}: options`);
        }
        if (card.options?.some((value) => value === 0)) errors.push(`${where}: option 0`);
        break;
      case "challenge":
        break;
      case "party_leader":
        if (!HERO_CLASSES.includes(card.heroClass)) errors.push(`${where}: heroClass`);
        if (!effectIdOk(card.effectId, "leader.")) errors.push(`${where}: effectId`);
        if (
          !Array.isArray(card.bannedPlayerCounts) ||
          !card.bannedPlayerCounts.every((count) => isInt(count) && count >= 2 && count <= 6)
        ) {
          errors.push(`${where}: bannedPlayerCounts`);
        }
        break;
      default:
        errors.push(`${where}: unknown kind ${(card as { kind: string }).kind}`);
    }
  }

  // Catalog consistency (CAT-001 is the identity/copy-count source).
  for (const definition of BASE_REFERENCE_DEFINITIONS) {
    const card = file.cards.find((candidate) => candidate.definitionId === definition.definitionId);
    if (!card) {
      errors.push(`${definition.definitionId}: missing from card data`);
      continue;
    }
    if (card.kind !== definition.kind) errors.push(`${definition.definitionId}: kind mismatch`);
    if (card.quantity !== definition.physicalCopyCount) {
      errors.push(`${definition.definitionId}: quantity ${card.quantity} ≠ catalog ${definition.physicalCopyCount}`);
    }
  }
  for (const card of file.cards) {
    if (!BASE_REFERENCE_DEFINITIONS.some((definition) => definition.definitionId === card.definitionId)) {
      errors.push(`${card.definitionId}: not in reference catalog`);
    }
  }
  return errors;
}

function validateMonster(card: MonsterCardData): string[] {
  const errors: string[] = [];
  const where = card.definitionId;
  if (!Array.isArray(card.requirement) || card.requirement.length === 0) errors.push(`${where}: requirement`);
  for (const slot of card.requirement ?? []) {
    if (slot.kind === "class" ? !HERO_CLASSES.includes(slot.heroClass) : slot.kind !== "any") {
      errors.push(`${where}: requirement slot`);
    }
  }
  const inDiceRange = (roll: { value: number }) => roll.value >= 2 && roll.value <= 12;
  if (!isRoll(card.slay) || !isRoll(card.penaltyRange) || !inDiceRange(card.slay) || !inDiceRange(card.penaltyRange)) {
    errors.push(`${where}: roll ranges`);
  }
  else {
    // Ranges must not overlap: a final roll is SLAY, PENALTY or NONE, never two.
    const overlaps =
      card.slay.op === card.penaltyRange.op ||
      (card.slay.op === "gte" ? card.penaltyRange.value >= card.slay.value : card.penaltyRange.value <= card.slay.value);
    if (overlaps) errors.push(`${where}: slay and penalty ranges overlap`);
  }
  const penalty = card.penalty;
  if (
    !penalty ||
    !(penalty.effectId === "penalty.sacrifice_hero" || penalty.effectId === "penalty.discard") ||
    !isInt(penalty.count) ||
    penalty.count < 1
  ) {
    errors.push(`${where}: penalty`);
  }
  if (penalty && typeof card.penaltyText === "string") {
    const expected = penalty.effectId === "penalty.discard" ? `DISCARD ${penalty.count}` : "SACRIFICE";
    if (!card.penaltyText.includes(expected)) errors.push(`${where}: penaltyText does not match penalty`);
  } else errors.push(`${where}: penaltyText`);
  if (card.slainEffectId !== null && !card.slainEffectId?.startsWith("monster.")) errors.push(`${where}: slainEffectId`);
  return errors;
}

export const BASE_CARD_DATA = raw as unknown as CardDataFile;

const problems = validateCardData(BASE_CARD_DATA);
if (problems.length > 0) {
  throw new Error(`Invalid base card data:\n${problems.join("\n")}`);
}

export const BASE_CARDS_BY_ID: ReadonlyMap<string, CardData> = new Map(
  BASE_CARD_DATA.cards.map((card) => [card.definitionId, card]),
);

export function cardData(definitionId: string): CardData {
  const card = BASE_CARDS_BY_ID.get(definitionId);
  if (!card) throw new Error(`Unknown card definition ${definitionId}`);
  return card;
}

/** Narrowing helper: data for `definitionId` if it has `kind`. */
export function cardDataOfKind<K extends CardData["kind"]>(
  definitionId: string,
  kind: K,
): Extract<CardData, { kind: K }> | null {
  const card = BASE_CARDS_BY_ID.get(definitionId);
  return card && card.kind === kind ? (card as Extract<CardData, { kind: K }>) : null;
}
