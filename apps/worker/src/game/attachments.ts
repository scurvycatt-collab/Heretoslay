// Hero attachment rules shared by the engine, bots and projection (EX-02, E02).
// Base-only Heroes have one slot. A reviewed printed two-Item Hero has two; Cursed Items use slots;
// at most one Mask-titled Item per Hero. Capacity follows the printed definition, never the effective class.

import { cardDataOfKind } from "../content/base-cards.ts";
import { EXPANSION_FACE_DRAFTS } from "../content/expansion-drafts.ts";
import type { BaseCard } from "./base-content.ts";

export interface AttachmentHolder {
  card: BaseCard;
  attachments: BaseCard[];
}

const TWO_SLOT_DEFINITIONS: ReadonlySet<string> = new Set(
  EXPANSION_FACE_DRAFTS.filter((face) => face.twoItemSlots).map((face) => face.definitionId),
);
const EXPANSION_MASKS: ReadonlySet<string> = new Set(
  EXPANSION_FACE_DRAFTS.filter((face) => face.mask).map((face) => face.definitionId),
);

export function slotCapacity(hero: { card: BaseCard }): number {
  return TWO_SLOT_DEFINITIONS.has(hero.card.definitionId) ? 2 : 1;
}

export function isMask(card: BaseCard): boolean {
  return EXPANSION_MASKS.has(card.definitionId) || Boolean(cardDataOfKind(card.definitionId, "item")?.maskClass);
}

export function isAttachable(card: BaseCard): boolean {
  return card.kind === "item" || card.kind === "cursed_item";
}

/** Any player's eligible Hero accepts ordinary and Cursed Items alike (owner E02 override). */
export function canAttach(hero: AttachmentHolder, card: BaseCard): boolean {
  if (!isAttachable(card) || hero.attachments.length >= slotCapacity(hero)) return false;
  return !(isMask(card) && hero.attachments.some(isMask));
}

export function hasAttachment(hero: AttachmentHolder, definitionId: string): boolean {
  return hero.attachments.some((card) => card.definitionId === definitionId);
}

export function hasCursedAttachment(hero: AttachmentHolder): boolean {
  return hero.attachments.some((card) => card.kind === "cursed_item");
}

/** Removes and returns the attachment with this instance id (null if absent). */
export function detach(hero: AttachmentHolder, cardId: string): BaseCard | null {
  const index = hero.attachments.findIndex((card) => card.cardId === cardId);
  return index < 0 ? null : hero.attachments.splice(index, 1)[0];
}

/** Removes every attachment once, for a Hero that leaves the Party. */
export function detachAll(hero: AttachmentHolder): BaseCard[] {
  return hero.attachments.splice(0);
}
