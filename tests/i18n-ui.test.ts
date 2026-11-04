import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("English/Vietnamese locale is global, persistent, and available on every web route", async () => {
  const [main, i18n] = await Promise.all([
    readFile(new URL("../apps/web/src/main.tsx", import.meta.url), "utf8"),
    readFile(new URL("../apps/web/src/i18n.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(main, /<LanguageProvider>/);
  assert.match(main, /<LanguageSwitch \/>/);
  assert.match(i18n, /localStorage\.setItem\("hts\.language"/);
  assert.match(i18n, /MutationObserver/);
  assert.match(i18n, /COMMON_VI_TERMS/);
  for (const term of ["DRAW", "DISCARD", "STEAL", "DESTROY", "CHALLENGE", "PARTY LEADER"]) assert.match(i18n, new RegExp(`\\\\b${term}\\\\b`));
});

test("Vietnamese catalog covers every base-card rule and monster penalty", async () => {
  const cards = JSON.parse(await readFile(new URL("../apps/worker/src/content/base-cards.json", import.meta.url), "utf8"));
  const vi = JSON.parse(await readFile(new URL("../apps/web/src/i18n.vi.json", import.meta.url), "utf8"));
  for (const card of cards.cards) {
    if (card.text) assert.equal(typeof vi[card.text], "string", `missing Vietnamese rule for ${card.definitionId}`);
    if (card.penaltyText) assert.equal(typeof vi[card.penaltyText], "string", `missing Vietnamese penalty for ${card.definitionId}`);
  }
});

test("lobby uses one mutually exclusive Create/Join/View state", async () => {
  const app = await readFile(new URL("../apps/web/src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /useState<"create" \| "join" \| "view">/);
  assert.equal((app.match(/<form className="lobby-card"/g) ?? []).length, 0);
  assert.equal((app.match(/className="lobby-actions"/g) ?? []).length, 2);
  for (const action of ["create", "join", "view"]) assert.match(app, new RegExp(`lobbyAction === "${action}"`));
});
