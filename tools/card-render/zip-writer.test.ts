import assert from "node:assert/strict";
import test from "node:test";
import { buildZip, crc32, isSafeZipPath, readZip } from "../../apps/web/src/asset-import/adapters/zip.ts";

test("crc32 matches the standard check value", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});
test("zip round-trips with valid CRCs", async () => {
  const blob = buildZip([{ name: "manifest.json", data: new TextEncoder().encode("{}") }, { name: "cards/a.png", data: new Uint8Array([1, 2, 3, 4]) }]);
  const entries = await readZip(blob);
  assert.deepEqual(entries.map((e) => [e.name, e.size, e.crcOk]), [["manifest.json", 2, true], ["cards/a.png", 4, true]]);
});
test("unsafe archive paths are rejected", () => {
  for (const bad of ["../x.png", "/abs.png", "a/../b.png", "C:\\x.png", "a//b.png", ""]) assert.equal(isSafeZipPath(bad), false, bad);
  assert.throws(() => buildZip([{ name: "../x", data: new Uint8Array() }]));
});
