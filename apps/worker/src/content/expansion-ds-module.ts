// EX-05: the Dragon & Sorcerer v2 pack as an ExpansionModule. NOT registered in GAME_SET_CATALOG here:
// the live worker registers a pack only once room wiring and acceptance (EX-06) are complete.
import { expansionDefinitionsFor } from "./expansion-drafts.ts";
import { DS_CARD_DATA, DS_UNIMPLEMENTED_EFFECTS } from "./expansion-ds.ts";
import { EXPANSION_SET_IDS, type ExpansionModule } from "./set-catalog.ts";

export type DsRules = (typeof DS_CARD_DATA)[number];

export function createDsModule(): ExpansionModule<DsRules> {
  if (DS_UNIMPLEMENTED_EFFECTS.length > 0) {
    throw new Error(`Dragon & Sorcerer v2 is incomplete: ${DS_UNIMPLEMENTED_EFFECTS.join(", ")}`);
  }
  return {
    setId: EXPANSION_SET_IDS.dragonSorcerer,
    definitions: expansionDefinitionsFor("dragonSorcerer"),
    rulesByDefinition: new Map(DS_CARD_DATA.map((card) => [card.definitionId, card])),
  };
}
