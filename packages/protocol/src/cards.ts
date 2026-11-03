// Card data schema (GAME-004). One source of truth for engine (worker) and the
// future web CardRenderer (ADR-003). Public card facts only — no hidden state.
// Data: apps/worker/src/content/base-cards.json, validated by
// apps/worker/src/content/base-cards.ts. Exported type-only.

export type HeroClass = "bard" | "fighter" | "guardian" | "ranger" | "thief" | "wizard";

/**
 * How well a field is sourced. All sources are secondary/community (no retail
 * scan in repo); none of them makes a value `VERIFIED-RB`.
 * - corroborated: ≥2 independent sources agree
 * - single_source: only one source has the value
 * - majority: sources disagree; value = majority, dissent recorded in `notes`
 * - derived: engine annotation derived from the sourced text (e.g. target rule)
 * - UNVERIFIED: no usable source; value is null
 */
export type FieldStatus = "corroborated" | "single_source" | "majority" | "derived" | "UNVERIFIED";

export interface FieldProvenance {
  status: FieldStatus;
  /** Keys into `CardDataFile.sources`. */
  sources: string[];
  note?: string;
}

export interface CardSource {
  label: string;
  url: string;
  /** Git commit or retrieval date. */
  revision: string;
  authority: "secondary_community" | "secondary_rulebook_copy";
}

/** Who the player must pick when playing/rolling (Q-08: chosen up front, re-validated on resolve). */
export type TargetRule =
  | "none"
  | "other_player"
  | "hero_other_party"
  | "two_heroes_other_party"
  | "hero_other_party_and_own_hero"
  | "own_hero"
  | "own_hero_with_cursed_item"
  | "any_hero_with_item";

export type RollCompare = { op: "gte" | "lte"; value: number };

export type MonsterRequirementSlot = { kind: "any" } | { kind: "class"; heroClass: HeroClass };

/** Penalty kinds present in the base Monsters. */
export type MonsterPenalty =
  | { effectId: "penalty.sacrifice_hero"; count: number }
  | { effectId: "penalty.discard"; count: number };

interface CardCommon {
  definitionId: string;
  name: string;
  quantity: number;
  /** Rules text as printed (community transcription); null when not sourced. */
  text: string | null;
  /** Field name → provenance. Must cover `text` and every mechanic field. */
  provenance: Record<string, FieldProvenance>;
  notes?: string[];
}

export interface HeroCardData extends CardCommon {
  kind: "hero";
  heroClass: HeroClass;
  /** Effect succeeds when final roll ≥ rollThreshold. */
  rollThreshold: number;
  /** null only when the effect is UNVERIFIED (engine then no-ops with a log line). */
  effectId: string | null;
  target: TargetRule;
}

export interface MonsterCardData extends CardCommon {
  kind: "monster";
  requirement: MonsterRequirementSlot[];
  slay: RollCompare;
  penaltyRange: RollCompare;
  penalty: MonsterPenalty;
  penaltyText: string;
  /** Passive granted while the Monster is slain in your Party. */
  slainEffectId: string | null;
}

export interface ItemCardData extends CardCommon {
  kind: "item" | "cursed_item";
  /** Q-06: Item → own Hero; Cursed Item → any Hero. */
  equip: "own_hero" | "any_hero";
  /** Mask class (Q-04, owner 2026-11-02: replaces the equipped Hero's class). null for non-Mask. */
  maskClass: HeroClass | null;
  effectId: string | null;
}

export interface MagicCardData extends CardCommon {
  kind: "magic";
  effectId: string | null;
  target: TargetRule;
}

export interface ModifierCardData extends CardCommon {
  kind: "modifier";
  /** Values the player may choose from when playing it (e.g. [2, -2]). */
  options: number[];
}

export interface ChallengeCardData extends CardCommon {
  kind: "challenge";
}

export interface LeaderCardData extends CardCommon {
  kind: "party_leader";
  heroClass: HeroClass;
  effectId: string | null;
  /** Player counts in which this Leader may not be chosen (Shadow Claw: [2]). */
  bannedPlayerCounts: number[];
}

export type CardData =
  | HeroCardData
  | MonsterCardData
  | ItemCardData
  | MagicCardData
  | ModifierCardData
  | ChallengeCardData
  | LeaderCardData;

export interface CardDataFile {
  schema: 1;
  setId: "hts.base.v1";
  rightsStatus: "UNVERIFIED";
  sources: Record<string, CardSource>;
  cards: CardData[];
}
