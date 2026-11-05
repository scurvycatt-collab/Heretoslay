import assert from "node:assert/strict";
import test from "node:test";

import { createBnModule } from "../src/content/expansion-bn-module.ts";
import { createDsModule } from "../src/content/expansion-ds-module.ts";
import { createWdModule } from "../src/content/expansion-wd-module.ts";
import { createSetCatalog, EXPANSION_SET_IDS, GAME_SET_CATALOG } from "../src/content/set-catalog.ts";

for (const [name, make, setId] of [
  ["BN", createBnModule, EXPANSION_SET_IDS.berserkersNecromancers],
  ["DS", createDsModule, EXPANSION_SET_IDS.dragonSorcerer],
] as const) {
  test(`the ${name} module loads: every definition bound, quantities consistent`, () => {
    const module = make();
    assert.equal(module.setId, setId);
    const catalog = createSetCatalog([module as never]);
    const base = GAME_SET_CATALOG.compose();
    const composed = catalog.compose([setId]);
    const copies = (match: (kind: string) => boolean) => module.definitions.filter((d) => match(d.kind)).reduce((n, d) => n + d.physicalCopyCount, 0);
    assert.equal(composed.main.length - base.main.length, copies((k) => k !== "monster" && k !== "party_leader"));
    assert.equal(composed.monster.length - base.monster.length, copies((k) => k === "monster"));
    assert.equal(composed.leaderPool.length - base.leaderPool.length, module.definitions.filter((d) => d.kind === "party_leader").length);
    assert.equal(composed.partyHeroLimit, 7);
    assert.ok(composed.expansionCard(module.definitions[0].definitionId));
  });
}

test("all three packs compose together with no duplicate ids", () => {
  const catalog = createSetCatalog([createWdModule(), createBnModule(), createDsModule()] as never[]);
  const all = catalog.compose([EXPANSION_SET_IDS.warriorsDruids, EXPANSION_SET_IDS.berserkersNecromancers, EXPANSION_SET_IDS.dragonSorcerer]);
  const ids = [...all.main, ...all.monster].map((copy) => copy.instanceId);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(all.maxPlayers, Math.min(8, all.leaderPool.length));
});

test("the live catalog still registers no pack", () => {
  assert.deepEqual(GAME_SET_CATALOG.compose().setIds, ["hts.base.v1"]);
  assert.throws(() => GAME_SET_CATALOG.compose([EXPANSION_SET_IDS.berserkersNecromancers]), /Unsupported expansion/);
  assert.throws(() => GAME_SET_CATALOG.compose([EXPANSION_SET_IDS.dragonSorcerer]), /Unsupported expansion/);
});
