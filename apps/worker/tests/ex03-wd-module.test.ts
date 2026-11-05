import assert from "node:assert/strict";
import test from "node:test";

import { createWdModule } from "../src/content/expansion-wd-module.ts";
import { createSetCatalog, EXPANSION_SET_IDS, GAME_SET_CATALOG } from "../src/content/set-catalog.ts";

test("the WD module loads: every definition has a binding and quantities are consistent", () => {
  const module = createWdModule();
  const catalog = createSetCatalog([module]);
  const base = GAME_SET_CATALOG.compose();
  const withWd = catalog.compose([EXPANSION_SET_IDS.warriorsDruids]);
  const copies = (kind: (k: string) => boolean) => module.definitions.filter((d) => kind(d.kind)).reduce((n, d) => n + d.physicalCopyCount, 0);
  assert.equal(withWd.main.length - base.main.length, copies((k) => k !== "monster" && k !== "party_leader"));
  assert.equal(withWd.monster.length - base.monster.length, copies((k) => k === "monster"));
  assert.equal(withWd.leaderPool.length - base.leaderPool.length, 2);
  assert.equal(withWd.partyHeroLimit, 7, "E15: expansion rooms cap Parties at seven");
  assert.deepEqual(withWd.setIds, ["hts.base.v1", EXPANSION_SET_IDS.warriorsDruids]);
  assert.ok(withWd.expansionCard(module.definitions[0].definitionId));
});

test("the live catalog still registers no pack", () => {
  assert.deepEqual(GAME_SET_CATALOG.compose().setIds, ["hts.base.v1"]);
  assert.throws(() => GAME_SET_CATALOG.compose([EXPANSION_SET_IDS.warriorsDruids]), /Unsupported expansion/);
});
