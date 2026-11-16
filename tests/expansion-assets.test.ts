// Every WD / BN / DS card the live catalog can deal has exactly one mapped complete face on disk,
// every class has a vector symbol, and the committed manifests follow the artwork rights policy.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { EXPANSION_FACE_DRAFTS } from "../apps/worker/src/content/expansion-drafts.ts";
import { ARTWORK_RIGHTS_STATUS, TAKEDOWN_CONTACT } from "../apps/web/src/asset-import/contract.ts";
import { CLASS_GLYPHS, CLASS_LOGO_COLOR } from "../apps/web/src/classGlyphs.ts";
import { isRelativePosixPath } from "../tools/import-card-art.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PACKS = { warriorsDruids: "warriors-druids", berserkersNecromancers: "berserkers-necromancers", dragonSorcerer: "dragon-sorcerer" } as const;

for (const [setKey, slug] of Object.entries(PACKS)) {
  test(`${slug}: one mapped complete face per definition`, async () => {
    const dir = path.join(ROOT, "assets/cards/expansions", slug, "faces");
    const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
    assert.equal(manifest.schema, 1);
    assert.equal(manifest.mode, "mapped");
    assert.equal(manifest.rightsStatus, ARTWORK_RIGHTS_STATUS);
    assert.equal(manifest.takedownContact, TAKEDOWN_CONTACT);
    const expected = EXPANSION_FACE_DRAFTS.filter((face) => face.setKey === setKey);
    assert.deepEqual(manifest.assets.map((a: any) => a.definitionId).sort(), expected.map((face) => face.definitionId).sort());
    for (const asset of manifest.assets) {
      assert.equal(asset.renderMode, "complete_face");
      assert.equal(asset.variant, "default");
      assert.equal(asset.rightsStatus, ARTWORK_RIGHTS_STATUS);
      assert.ok(isRelativePosixPath(asset.relativePath) && /^cards\/[a-z0-9.-]+\.webp$/.test(asset.relativePath), asset.relativePath);
      assert.ok(!/[A-Za-z]:[\\/]/.test(JSON.stringify(asset)), "no machine path in the manifest");
      await access(path.join(dir, asset.relativePath));
      const draft = expected.find((face) => face.definitionId === asset.definitionId)!;
      assert.equal(asset.provenance.sourceFaceSha256, draft.sha256, `${draft.canonicalName}: face mapped by the reviewed source hash`);
      assert.equal(asset.template, draft.kind === "monster" || draft.kind === "party_leader" ? "tarot" : "poker");
    }
  });
}

test("all eleven classes have a vector symbol and a colour", () => {
  const classes = ["bard", "fighter", "guardian", "ranger", "thief", "wizard", "warrior", "druid", "berserker", "necromancer", "sorcerer"];
  assert.deepEqual(Object.keys(CLASS_GLYPHS).sort(), [...classes].sort());
  for (const name of classes) {
    const glyph = CLASS_GLYPHS[name as keyof typeof CLASS_GLYPHS];
    assert.match(glyph.viewBox, /^-?[\d.]+ -?[\d.]+ 74 74$/);
    assert.ok(glyph.d.length > 100 && /^M/.test(glyph.d), name);
    assert.match(CLASS_LOGO_COLOR[name as keyof typeof CLASS_LOGO_COLOR], /^#[0-9a-f]{6}$/i);
  }
});
