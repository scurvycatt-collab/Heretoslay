// ADR-004: artwork rights policy constants stay in sync, and committed asset
// manifests never record a machine path (e.g. "E:\\…") — only POSIX relative paths.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { RIGHTS_STATUS, TAKEDOWN_EMAIL } from "../apps/web/src/asset-import/adapters/core.ts";
import { ARTWORK_RIGHTS_STATUS, TAKEDOWN_CONTACT } from "../apps/web/src/asset-import/contract.ts";
import { RIGHTS_STATUS as CLI_RIGHTS, TAKEDOWN_CONTACT as CLI_TAKEDOWN, isRelativePosixPath } from "../tools/import-card-art.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFESTS = [
  "assets/cards/kickstarter-preview/manifest.json",
  "assets/cards/kickstarter-preview/png-webgame/manifest.json",
];

test("rights policy constants agree across contract, core and CLI", () => {
  assert.equal(ARTWORK_RIGHTS_STATUS, "FAN_MADE_NON_COMMERCIAL");
  for (const v of [RIGHTS_STATUS, CLI_RIGHTS]) assert.equal(v, ARTWORK_RIGHTS_STATUS);
  for (const v of [TAKEDOWN_EMAIL, CLI_TAKEDOWN]) assert.equal(v, TAKEDOWN_CONTACT);
});

test("isRelativePosixPath rejects machine paths", () => {
  for (const bad of ["E:\\Code\\a.jpg", "E:/Code/a.jpg", "/home/me/a.jpg", "a\\b.jpg", "../a.jpg", ""]) {
    assert.equal(isRelativePosixPath(bad), false, bad);
  }
  for (const ok of ["kickstarter-preview/sheet1.jpg", "Print 01 - Poker Cards_Hero/Front 01.jpg", "fronts/x.png"]) {
    assert.equal(isRelativePosixPath(ok), true, ok);
  }
});

for (const rel of MANIFESTS) {
  test(`${rel}: relative paths + rights policy`, async () => {
    const m = JSON.parse((await readFile(path.join(ROOT, rel), "utf8")).replace(/^\uFEFF/, ""));
    assert.equal(m.rightsStatus, ARTWORK_RIGHTS_STATUS);
    assert.equal(m.takedownContact, TAKEDOWN_CONTACT);
    assert.equal(m.gameplaySupported, false, "expansion art stays non-gameplay");
    assert.equal(m.sheets.length, 5);
    for (const s of m.sheets) assert.ok(isRelativePosixPath(s.path), `sheet ${s.id}: ${s.path}`);
    for (const c of m.cards) {
      assert.ok(isRelativePosixPath(c.src), `card ${c.previewId}: ${c.src}`);
      assert.equal(c.rightsStatus, ARTWORK_RIGHTS_STATUS);
    }
  });
}
