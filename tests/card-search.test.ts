import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { foldText, searchCards } from "../apps/web/src/asset-import/cardSearch.ts";

const cards = JSON.parse(readFileSync(new URL("../apps/worker/src/content/base-cards.json", import.meta.url), "utf8")).cards;

test("accent-insensitive, multi-term, name-prefix first", () => {
  assert.equal(foldText("Đội Hình Ánh"), "doi hinh anh");
  assert.equal(searchCards(cards, "dodgy", "all")[0].name, "Dodgy Dealer");
  assert.equal(searchCards(cards, "DÓDGY  dealer", "all")[0].name, "Dodgy Dealer");
  const wiz = searchCards(cards, "wizard", "hero");
  assert.ok(wiz.length > 0 && wiz.every((c: { kind: string; heroClass: string }) => c.kind === "hero" && c.heroClass === "wizard"));
});

test("kind filter: item includes cursed items; empty query lists the kind", () => {
  const items = searchCards(cards, "", "item");
  assert.equal(items.length, cards.filter((c: { kind: string }) => c.kind === "item" || c.kind === "cursed_item").length);
  assert.equal(searchCards(cards, "", "all").length, cards.length);
  assert.deepEqual(searchCards(cards, "zzzz-not-a-card", "all"), []);
});
