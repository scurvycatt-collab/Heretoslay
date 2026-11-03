import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ART_LAYOUTS, CARD_SIZE, artLayoutForKind, boxFromDrag, contentBounds, fitAspect, moveBox, normalizeBox, resizeBox,
  sampleToSource, sourceAspect, splitGrid,
} from "../apps/web/src/asset-import/cropGeometry.ts";
import spec from "../docs/contracts/CARD_TEMPLATE_SPEC.json" with { type: "json" };

const B = { width: 5100, height: 6600 };
const inside = (b: { x: number; y: number; width: number; height: number }) =>
  Number.isInteger(b.x) && Number.isInteger(b.y) && Number.isInteger(b.width) && Number.isInteger(b.height) &&
  b.x >= 0 && b.y >= 0 && b.x + b.width <= B.width && b.y + b.height <= B.height;

test("literal sizes match CARD_TEMPLATE_SPEC", () => {
  for (const t of ["poker", "tarot"] as const) assert.deepEqual(CARD_SIZE[t], { width: spec.cardSizes[t].width, height: spec.cardSizes[t].height });
  for (const [key, l] of Object.entries(ART_LAYOUTS)) {
    const art = (spec.layouts as Record<string, { art: { w: number; h: number }; size: string }>)[key];
    assert.deepEqual([l.width, l.height, l.template], [art.art.w, art.art.h, art.size], key);
  }
  assert.equal(artLayoutForKind("cursed_item"), "hero");
  assert.equal(artLayoutForKind("magic"), "hero");
  assert.equal(artLayoutForKind("monster"), "monster");
  assert.equal(artLayoutForKind(undefined), undefined);
});

test("sourceAspect swaps for quarter turns", () => {
  assert.equal(sourceAspect(CARD_SIZE.poker, 0), 745 / 1040);
  assert.equal(sourceAspect(CARD_SIZE.poker, 270), 1040 / 745);
});

test("resize without lock keeps the opposite corner fixed and stays inside", () => {
  const b = { x: 100, y: 100, width: 1000, height: 1400 };
  const r = resizeBox(b, "se", 200, -100, B);
  assert.deepEqual(r, { x: 100, y: 100, width: 1200, height: 1300 });
  const big = resizeBox(b, "nw", -500, -500, B);
  assert.deepEqual(big, { x: 0, y: 0, width: 1100, height: 1500 }, "clamped at the image edge");
});

test("resize with aspect lock keeps the ratio from every handle", () => {
  const aspect = 745 / 1040;
  const b = { x: 1000, y: 1000, width: 745, height: 1040 };
  for (const h of ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const) {
    const r = resizeBox(b, h, 137, 211, B, aspect);
    assert.ok(inside(r), h);
    assert.ok(Math.abs(r.width / r.height - aspect) < 0.01, `${h}: ${r.width}x${r.height}`);
  }
  // Growing into the edge shrinks proportionally instead of breaking the ratio.
  const edge = resizeBox({ x: 4000, y: 100, width: 745, height: 1040 }, "se", 5000, 5000, B, aspect);
  assert.ok(inside(edge));
  assert.equal(edge.x + edge.width, 5100);
  assert.ok(Math.abs(edge.width / edge.height - aspect) < 0.01);
});

test("drag draws in any direction, locked or free", () => {
  assert.deepEqual(boxFromDrag({ x: 500, y: 600 }, { x: 100, y: 100 }, B), { x: 100, y: 100, width: 400, height: 500 });
  const locked = boxFromDrag({ x: 100, y: 100 }, { x: 845, y: 300 }, B, 745 / 1040);
  assert.deepEqual([locked.width, locked.height], [745, 1040]);
});

test("move clamps; fitAspect centres", () => {
  assert.deepEqual(moveBox({ x: 10, y: 10, width: 100, height: 100 }, -50, 99999, B), { x: 0, y: 6500, width: 100, height: 100 });
  const f = fitAspect({ x: 0, y: 0, width: 2000, height: 2000 }, 0.5, B);
  assert.deepEqual(f, { x: 500, y: 0, width: 1000, height: 2000 });
  assert.deepEqual(normalizeBox({ x: -5, y: 1.4, width: 9e9, height: 3 }, B), { x: 0, y: 1, width: 5100, height: 8 });
});

test("splitGrid tiles exactly with gutters", () => {
  const cells = splitGrid({ x: 0, y: 0, width: 5100, height: 6600 }, 2, 2, 100, 0);
  assert.equal(cells.length, 4);
  assert.deepEqual(cells[0], { x: 0, y: 0, width: 2500, height: 3300, row: 1, column: 1 });
  assert.deepEqual(cells[3], { x: 2600, y: 3300, width: 2500, height: 3300, row: 2, column: 2 });
  const odd = splitGrid({ x: 7, y: 3, width: 1001, height: 1000 }, 3, 3);
  assert.equal(odd.reduce((s, c) => s + (c.row === 1 ? c.width : 0), 0), 1001, "no pixel lost to rounding");
  assert.throws(() => splitGrid({ x: 0, y: 0, width: 10, height: 10 }, 2, 2, 20), /Khe/);
});

test("contentBounds finds a card on a uniform background", () => {
  const w = 100, h = 80;
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255); // white page
  for (let y = 12; y < 70; y++) for (let x = 20; x < 61; x++) { const i = (y * w + x) * 4; rgba[i] = 40; rgba[i + 1] = 90; rgba[i + 2] = 60; }
  rgba[(2 * w + 2) * 4] = 0; // a speck must not count
  assert.deepEqual(contentBounds(rgba, w, h), { x: 20, y: 12, width: 41, height: 58 });
  assert.equal(contentBounds(new Uint8ClampedArray(w * h * 4).fill(200), w, h), null);
  // back to source pixels (sample at 1/10 scale of a region at 1000,2000)
  const src = sampleToSource({ x: 20, y: 12, width: 41, height: 58 }, { x: 1000, y: 2000, width: 1000, height: 800 }, w, h, B);
  assert.deepEqual(src, { x: 1200, y: 2120, width: 410, height: 580 });
});

test("contentBounds ignores a title separated from the card", () => {
  const w = 120, h = 120;
  const rgba = new Uint8ClampedArray(w * h * 4).fill(255);
  const paint = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * w + x) * 4; rgba[i] = rgba[i + 1] = rgba[i + 2] = 30; } };
  paint(50, 4, 110, 9);   // page title, top right
  paint(10, 20, 70, 110); // the card
  assert.deepEqual(contentBounds(rgba, w, h), { x: 10, y: 20, width: 60, height: 90 });
});
