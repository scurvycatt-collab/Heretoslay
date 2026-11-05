// EX-03: the Warriors & Druids pack as an ExpansionModule. NOT registered in GAME_SET_CATALOG here: the live
// worker registers a pack only once room wiring (EX-06) lands. Every definition is bound to its card data; the
// handlers are in the engine and tracked by WD_UNIMPLEMENTED_EFFECTS (now empty).
import { expansionDefinitionsFor } from "./expansion-drafts.ts";
import { WD_CARD_DATA, WD_UNIMPLEMENTED_EFFECTS } from "./expansion-wd.ts";
import { EXPANSION_SET_IDS, type ExpansionModule } from "./set-catalog.ts";

export type WdRules = (typeof WD_CARD_DATA)[number];

export function createWdModule(): ExpansionModule<WdRules> {
  if (WD_UNIMPLEMENTED_EFFECTS.length > 0) {
    throw new Error(`Warriors & Druids is incomplete: ${WD_UNIMPLEMENTED_EFFECTS.join(", ")}`);
  }
  return {
    setId: EXPANSION_SET_IDS.warriorsDruids,
    definitions: expansionDefinitionsFor("warriorsDruids"),
    rulesByDefinition: new Map(WD_CARD_DATA.map((card) => [card.definitionId, card])),
  };
}
