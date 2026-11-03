import assert from "node:assert/strict";
import { test } from "node:test";
import { DESCRIPTION, LINE_EM, cssPx, descriptionLineTops, fitDescription, roundedRect, wrapLines } from "../apps/web/src/cards/cardLayout.ts";

const mono = (s: string) => s.length * 10; // 10 px per char

test("wrapLines: greedy, keeps long words, \\n starts a paragraph", () => {
  assert.deepEqual(wrapLines("aaa bbb ccc", 75, mono).lines, ["aaa bbb", "ccc"]);
  assert.deepEqual(wrapLines("supercalifragilistic x", 50, mono).lines, ["supercalifragilistic", "x"]);
  const p = wrapLines("one two\nthree", 1000, mono);
  assert.deepEqual(p.lines, ["one two", "three"]);
  assert.deepEqual(p.paragraphBreaks, [1]);
});

test("description block is centred in its area with the reference line pitch", () => {
  const tops = descriptionLineTops(2, 215, 999, 36);
  assert.deepEqual(tops, [999 - 215 + (215 - (72 - 4.5)) / 2, 999 - 215 + (215 - (72 - 4.5)) / 2 + 31.5]);
  const one = descriptionLineTops(1, 200, 1417, 36)[0];
  assert.equal(one, 1417 - 200 + (200 - 36) / 2);
});

test("fitDescription shrinks only when the text would exceed maxLines", () => {
  const measureAt = (s: string, size: number) => s.length * size * 0.3;
  const short = fitDescription("Trade hands with another player.", 455, 5, measureAt);
  assert.equal(short.size, 36);
  const long = fitDescription("word ".repeat(80).trim(), 455, 3, measureAt);
  assert.equal(long.size, 26, "stops at the minimum size");
  const medium = fitDescription("word ".repeat(30).trim(), 455, 3, measureAt);
  assert.ok(medium.size < 36 && medium.lines.length <= 3);
});

test("reference sizes convert to CSS by the line box", () => {
  assert.equal(cssPx(60, "name"), 60 / LINE_EM.name);
  assert.equal(cssPx(36, "text"), 36 / LINE_EM.text);
  assert.equal(DESCRIPTION.hero.left + DESCRIPTION.hero.right, 290);
  assert.match(roundedRect(41, 41, 745, 817, 10, 0), /^M51,41H776Q786,41 786,51V858/);
});
