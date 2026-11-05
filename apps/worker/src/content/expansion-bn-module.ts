// EX-04: the Berserkers & Necromancers pack as an ExpansionModule. NOT registered in GAME_SET_CATALOG here:
// the live worker registers a pack only once room wiring and acceptance (EX-06) are complete.
import { expansionDefinitionsFor } from "./expansion-drafts.ts";
import { BN_CARD_DATA, BN_UNIMPLEMENTED_EFFECTS } from "./expansion-bn.ts";
import { EXPANSION_SET_IDS, type ExpansionModule } from "./set-catalog.ts";

export type BnRules = (typeof BN_CARD_DATA)[number];

export function createBnModule(): ExpansionModule<BnRules> {
  if (BN_UNIMPLEMENTED_EFFECTS.length > 0) {
    throw new Error(`Berserkers & Necromancers is incomplete: ${BN_UNIMPLEMENTED_EFFECTS.join(", ")}`);
  }
  return {
    setId: EXPANSION_SET_IDS.berserkersNecromancers,
    definitions: expansionDefinitionsFor("berserkersNecromancers"),
    rulesByDefinition: new Map(BN_CARD_DATA.map((card) => [card.definitionId, card])),
  };
}
