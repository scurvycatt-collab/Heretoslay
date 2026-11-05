import { BASE_CARDS_BY_ID } from "./base-cards.ts";
import { BASE_REFERENCE_PHYSICAL_COPIES } from "./base-reference.ts";
import type { BaseReferenceKind } from "./types.ts";

export const BASE_SET_ID = "hts.base.v1";
export const EXPANSION_SET_IDS = {
  warriorsDruids: "hts.warriors-druids.v1",
  berserkersNecromancers: "hts.berserkers-necromancers.v1",
  dragonSorcerer: "hts.dragon-sorcerer.v2",
} as const;

export interface CatalogCopy {
  readonly setId: string;
  readonly definitionId: string;
  readonly instanceId: string;
  readonly kind: BaseReferenceKind;
}

export interface ExpansionDefinition {
  readonly definitionId: string;
  readonly kind: BaseReferenceKind;
  readonly canonicalName: string;
  readonly physicalCopyCount: number;
  readonly inventorySource: string;
  readonly cardSource: string;
  readonly bannedPlayerCounts?: readonly number[];
}

/**
 * The engine supplies Rules and dispatches those bindings. Register a pack only
 * once all of its definitions, verified quantities and handlers are complete.
 */
export interface ExpansionModule<Rules extends object> {
  readonly setId: string;
  readonly definitions: readonly ExpansionDefinition[];
  readonly rulesByDefinition: ReadonlyMap<string, Rules>;
}

interface Leader {
  readonly definitionId: string;
  readonly bannedPlayerCounts: readonly number[];
}

interface SetContent<Rules extends object> {
  readonly main: readonly CatalogCopy[];
  readonly monster: readonly CatalogCopy[];
  readonly leaders: readonly Leader[];
  readonly cards: ReadonlyMap<string, { readonly definition: ExpansionDefinition; readonly rules: Rules }>;
}

const CARD_KINDS: ReadonlySet<string> = new Set([
  "challenge", "cursed_item", "hero", "item", "magic", "modifier", "monster", "party_leader",
]);

function isSourceUrl(source: string): boolean {
  const url = URL.parse(source);
  return url?.protocol === "https:" || url?.protocol === "http:";
}

function loadExpansion<Rules extends object>(module: ExpansionModule<Rules>): SetContent<Rules> {
  const { setId, definitions, rulesByDefinition } = module;
  if (!/^hts\.[a-z0-9]+(?:-[a-z0-9]+)*\.v[1-9]\d*$/.test(setId) || definitions.length === 0) {
    throw new Error(`Invalid expansion manifest: ${setId}`);
  }
  const main: CatalogCopy[] = [];
  const monster: CatalogCopy[] = [];
  const leaders: Leader[] = [];
  const cards = new Map<string, { definition: ExpansionDefinition; rules: Rules }>();
  for (const definition of definitions) {
    const { definitionId, kind, physicalCopyCount, bannedPlayerCounts = [] } = definition;
    const prefix = `${setId}.`;
    if (
      !definitionId.startsWith(prefix) ||
      !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(definitionId.slice(prefix.length)) ||
      cards.has(definitionId) ||
      !CARD_KINDS.has(kind) ||
      !definition.canonicalName.trim() ||
      !Number.isSafeInteger(physicalCopyCount) ||
      physicalCopyCount < 1 ||
      !isSourceUrl(definition.inventorySource) ||
      !isSourceUrl(definition.cardSource)
    ) {
      throw new Error(`Invalid expansion definition: ${definitionId}`);
    }
    const binding = rulesByDefinition.get(definitionId);
    if (!binding || typeof binding !== "object") {
      throw new Error(`Missing rules binding: ${definitionId}`);
    }
    cards.set(definitionId, {
      definition: Object.freeze({ ...definition, bannedPlayerCounts: Object.freeze([...bannedPlayerCounts]) }),
      rules: binding,
    });

    if (kind === "party_leader") {
      if (physicalCopyCount !== 1 || bannedPlayerCounts.some(
        (count) => !Number.isInteger(count) || count < 2 || count > 8,
      )) {
        throw new Error(`Invalid Party Leader: ${definitionId}`);
      }
      leaders.push({ definitionId, bannedPlayerCounts: [...bannedPlayerCounts] });
      continue;
    }
    if (bannedPlayerCounts.length) {
      throw new Error(`Only Party Leaders can restrict player count: ${definitionId}`);
    }
    const deck = kind === "monster" ? monster : main;
    for (let index = 1; index <= physicalCopyCount; index++) {
      deck.push(Object.freeze({
        setId,
        definitionId,
        kind,
        instanceId: `${definitionId}#${String(index).padStart(2, "0")}`,
      }));
    }
  }
  if (cards.size !== rulesByDefinition.size) {
    throw new Error(`Unknown rules binding in expansion: ${setId}`);
  }
  return { main, monster, leaders, cards };
}

export function createSetCatalog<Rules extends object>(modules: readonly ExpansionModule<Rules>[]) {
  const base: SetContent<Rules> = {
    main: BASE_REFERENCE_PHYSICAL_COPIES.main.map((copy) => Object.freeze({ ...copy })),
    monster: BASE_REFERENCE_PHYSICAL_COPIES.monster.map((copy) => Object.freeze({ ...copy })),
    leaders: BASE_REFERENCE_PHYSICAL_COPIES.partyLeader.map(({ definitionId }) => {
      const card = BASE_CARDS_BY_ID.get(definitionId);
      return {
        definitionId,
        bannedPlayerCounts: card?.kind === "party_leader" ? [...card.bannedPlayerCounts] : [],
      };
    }),
    cards: new Map(),
  };
  const registered = new Map([[BASE_SET_ID as string, base]]);
  for (const module of modules) {
    if (registered.has(module.setId)) throw new Error(`Duplicate set: ${module.setId}`);
    registered.set(module.setId, loadExpansion(module));
  }

  return {
    compose(enabledExpansionIds: readonly string[] = []) {
      const selection = new Set(enabledExpansionIds);
      if (selection.size !== enabledExpansionIds.length || selection.has(BASE_SET_ID)) {
        throw new Error("Invalid expansion selection");
      }
      // Registry order keeps physical deck order independent of UI toggle order.
      for (const id of selection) {
        if (!registered.has(id)) throw new Error(`Unsupported expansion: ${id}`);
      }
      const sets = [...registered].filter(([id]) => id === BASE_SET_ID || selection.has(id));
      const leaders = sets.flatMap(([, set]) => set.leaders);
      const partyHeroLimit = selection.size ? 7 : 6;
      const maxPlayers = Math.min(selection.size ? 8 : 6, leaders.length);
      function leadersForPlayerCount(playerCount: number): string[] {
        if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > maxPlayers) {
          throw new Error(`Invalid player count: ${playerCount}`);
        }
        const eligible = leaders.filter((leader) => !leader.bannedPlayerCounts.includes(playerCount));
        if (eligible.length < playerCount) {
          throw new Error(`Insufficient eligible Party Leaders for ${playerCount} players`);
        }
        return eligible.map((leader) => leader.definitionId);
      }
      const cards = new Map(sets.flatMap(([, set]) => [...set.cards]));
      return {
        setIds: sets.map(([id]) => id),
        main: sets.flatMap(([, set]) => set.main),
        monster: sets.flatMap(([, set]) => set.monster),
        leaderPool: leaders.map((leader) => leader.definitionId),
        maxPlayers,
        partyHeroLimit,
        classWinThreshold: partyHeroLimit,
        monsterWinThreshold: 3,
        leadersForPlayerCount,
        expansionCard: (definitionId: string) => cards.get(definitionId),
      };
    },
  };
}

// Expansion IDs are known, but the live worker registers only verified content.
export const GAME_SET_CATALOG = createSetCatalog([]);
