import assert from "node:assert/strict";
import test from "node:test";
import { BASE_CARDS_BY_ID } from "../src/content/base-cards.ts";
import { BASE_REFERENCE_PHYSICAL_COPIES } from "../src/content/base-reference.ts";
import {
  BASE_SET_ID, createSetCatalog, EXPANSION_SET_IDS, GAME_SET_CATALOG,
  type ExpansionDefinition, type ExpansionModule,
} from "../src/content/set-catalog.ts";
import { baseLeaderPool, baseMainDeck, baseMonsterDeck } from "../src/game/base-content.ts";

const { dragonSorcerer, warriorsDruids } = EXPANSION_SET_IDS;
type FixtureRules = { activate: () => string };

function fixture(setId: string, leaderCount: number): ExpansionModule<FixtureRules> {
  const provenance = {
    inventorySource: "https://example.test/inventory",
    cardSource: "https://example.test/card",
  };
  const definitions: ExpansionDefinition[] = [
    { definitionId: `${setId}.repeat`, kind: "modifier", canonicalName: "Repeat", physicalCopyCount: 2, ...provenance },
    { definitionId: `${setId}.monster`, kind: "monster", canonicalName: "Monster", physicalCopyCount: 1, ...provenance },
    ...Array.from({ length: leaderCount }, (_, i): ExpansionDefinition => ({
      definitionId: `${setId}.leader-${i + 1}`, kind: "party_leader", canonicalName: "Leader",
      physicalCopyCount: 1, ...provenance,
    })),
  ];
  return {
    setId,
    definitions,
    rulesByDefinition: new Map(definitions.map(({ definitionId }) => [
      definitionId, { activate: () => definitionId },
    ])),
  };
}

test("normal base deck helpers preserve every ID, kind and order", () => {
  const base = GAME_SET_CATALOG.compose();
  assert.deepEqual(baseMainDeck(), BASE_REFERENCE_PHYSICAL_COPIES.main.map(
    ({ instanceId, definitionId, kind }) => ({ cardId: instanceId, definitionId, kind }),
  ));
  assert.deepEqual(baseMonsterDeck(), BASE_REFERENCE_PHYSICAL_COPIES.monster.map(({ instanceId }) => instanceId));
  assert.deepEqual(baseLeaderPool(), BASE_REFERENCE_PHYSICAL_COPIES.partyLeader.map(({ definitionId }) => definitionId));
  assert.deepEqual([base.main.length, base.monster.length, base.leaderPool.length], [115, 15, 6]);
  assert.deepEqual([base.maxPlayers, base.partyHeroLimit, base.classWinThreshold, base.monsterWinThreshold], [6, 6, 6, 3]);
  assert.equal(base.leadersForPlayerCount(2).length, 5);
  assert.ok(base.leadersForPlayerCount(2).every((id) => BASE_CARDS_BY_ID.get(id)?.name !== "The Shadow Claw"));
  assert.equal(base.leadersForPlayerCount(6).length, 6);
  assert.throws(() => base.leadersForPlayerCount(7), /Invalid player count/);
  assert.throws(() => GAME_SET_CATALOG.compose([dragonSorcerer]), /Unsupported expansion/);
});

test("a registered pack composes only selected cards and bindings with stable physical IDs", () => {
  const catalog = createSetCatalog([fixture(warriorsDruids, 2), fixture(dragonSorcerer, 1)]);
  const ds = catalog.compose([dragonSorcerer]);
  assert.deepEqual(ds.setIds, [BASE_SET_ID, dragonSorcerer]);
  assert.deepEqual([ds.maxPlayers, ds.partyHeroLimit, ds.classWinThreshold, ds.monsterWinThreshold], [7, 7, 7, 3]);
  assert.equal(ds.leadersForPlayerCount(7).length, 7);
  assert.throws(() => ds.leadersForPlayerCount(8), /Invalid player count/);
  const dsId = `${dragonSorcerer}.repeat`;
  const wdId = `${warriorsDruids}.repeat`;
  assert.deepEqual(ds.main.slice(-2).map(({ instanceId }) => instanceId), [`${dsId}#01`, `${dsId}#02`]);
  assert.equal(ds.monster.at(-1)?.instanceId, `${dragonSorcerer}.monster#01`);
  assert.equal(ds.expansionCard(dsId)?.rules.activate(), dsId);
  assert.equal(ds.expansionCard(wdId), undefined);
  assert.equal(catalog.compose().expansionCard(dsId), undefined);

  const mixed = catalog.compose([dragonSorcerer, warriorsDruids]);
  assert.deepEqual(mixed.main, catalog.compose([warriorsDruids, dragonSorcerer]).main);
  assert.equal(mixed.maxPlayers, 8);
  assert.equal(mixed.classWinThreshold, 7);
  assert.equal(new Set(mixed.leadersForPlayerCount(8)).size, 9);
  assert.equal(new Set(mixed.main.map(({ instanceId }) => instanceId)).size, mixed.main.length);
  assert.equal(mixed.expansionCard(wdId)?.rules.activate(), wdId);
  ds.main.pop();
  assert.equal(catalog.compose([dragonSorcerer]).main.length, 117);
});

test("invalid manifests and selections fail before supplying playable content", () => {
  const pack = fixture(dragonSorcerer, 1);
  const [card, monster, leader] = pack.definitions;
  const replaceCard = (overrides: Partial<ExpansionDefinition>) => ({
    ...pack, definitions: [{ ...card, ...overrides }, monster, leader],
  });
  assert.throws(() => createSetCatalog([replaceCard({ physicalCopyCount: 0 })]), /Invalid expansion definition/);
  assert.throws(() => createSetCatalog([replaceCard({ inventorySource: "" })]), /Invalid expansion definition/);
  assert.throws(() => createSetCatalog([replaceCard({ definitionId: "wrong.repeat" })]), /Invalid expansion definition/);
  assert.throws(() => createSetCatalog([{ ...pack, definitions: [card, card] }]), /Invalid expansion definition/);
  assert.throws(() => createSetCatalog([{ ...pack, definitions: [card, monster, { ...leader, physicalCopyCount: 2 }] }]), /Invalid Party Leader/);
  assert.throws(() => createSetCatalog([{ ...pack, rulesByDefinition: new Map() }]), /Missing rules binding/);
  assert.throws(() => createSetCatalog([{ ...pack, definitions: [card, monster] }]), /Unknown rules binding/);
  assert.throws(() => createSetCatalog([pack, pack]), /Duplicate set/);
  const catalog = createSetCatalog([{ ...pack, definitions: [card, monster, { ...leader, bannedPlayerCounts: [7] }] }]);
  assert.throws(() => catalog.compose([dragonSorcerer, dragonSorcerer]), /Invalid expansion selection/);
  assert.throws(() => catalog.compose([BASE_SET_ID]), /Invalid expansion selection/);
  assert.throws(() => catalog.compose([dragonSorcerer]).leadersForPlayerCount(7), /Insufficient eligible Party Leaders/);
});
