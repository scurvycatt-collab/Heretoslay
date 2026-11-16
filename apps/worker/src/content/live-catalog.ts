// The catalog the live worker plays with. Owner decision 2026-11-16: Warriors & Druids, Berserkers &
// Necromancers and Dragon & Sorcerer v2 are registered (every definition bound, every effect handled:
// the *_UNIMPLEMENTED_EFFECTS lists are empty and each create*Module() throws otherwise).
// Banner Quest, Here to Sleigh and the Monster Expansion stay out until the owner says otherwise.
// Lives apart from set-catalog.ts so the pack modules can import the registry helpers without a cycle.
import { createBnModule } from "./expansion-bn-module.ts";
import { createDsModule } from "./expansion-ds-module.ts";
import { createWdModule } from "./expansion-wd-module.ts";
import { createSetCatalog, type ExpansionModule, type SetCatalog } from "./set-catalog.ts";

export const GAME_SET_CATALOG: SetCatalog = createSetCatalog<object>([
  createWdModule(), createBnModule(), createDsModule(),
] as readonly ExpansionModule<object>[]);
