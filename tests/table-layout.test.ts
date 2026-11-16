// Table layout v3 geometry: opponent banners never overlap, stay on the table, leave room for the
// deck / Monster row, and the hand fan stays off your banner when idle.
import assert from "node:assert/strict";
import { test } from "node:test";
import { centreY, handSpans, seatLayout, type SeatBox } from "../apps/web/src/tableLayout.ts";

const overlap = (a: SeatBox, b: SeatBox) => Math.abs(a.x - b.x) < (a.width + b.width) / 2 - 1 && Math.abs(a.y - b.y) < (a.height + b.height) / 2 - 1;

for (const [width, height] of [[1180, 660], [1334, 820], [1540, 700], [1800, 940], [2300, 1100]] as const) {
  for (let opponents = 1; opponents <= 7; opponents += 1) {
    test(`${opponents} opponents on a ${width}×${height} table: no banner overlaps another or leaves the table`, () => {
      const row = { halfWidth: 430, height: 240, floor: height * 0.7 };
      const seats = seatLayout(opponents, width, height * 0.74, row);
      assert.equal(seats.length, opponents);
      for (const [i, seat] of seats.entries()) {
        assert.ok(seat.x - seat.width / 2 >= 0 && seat.x + seat.width / 2 <= width, `seat ${i} inside the table`);
        assert.ok(seat.y - seat.height / 2 >= 0);
        for (const other of seats.slice(i + 1)) assert.ok(!overlap(seat, other), `seat ${i} overlaps a neighbour`);
      }
      // Turn order reads left → right, and the layout is symmetric.
      for (let i = 1; i < seats.length; i += 1) assert.ok(seats[i].x > seats[i - 1].x);
      assert.ok(Math.abs(seats[0].x + seats[seats.length - 1].x - width) < 1);
      // The deck / Monster row never sits under a banner.
      const y = centreY(seats, width, height, row);
      for (const seat of seats) {
        if (Math.abs(seat.x - width / 2) < row.halfWidth + seat.width / 2) assert.ok(seat.y + seat.height / 2 <= y - row.height / 2, "row is below the banner above it");
      }
    });
  }
}

test("hand fan: idle stays between the banner and the rail; open is at least as wide and stays on the table", () => {
  for (const cards of [1, 3, 5, 8, 12, 18]) {
    const fan = handSpans(cards, 170, 520, 1260);
    assert.ok(fan.centre - fan.idle / 2 >= 520, `${cards} cards: idle fan clears the banner`);
    assert.ok(fan.centre + fan.idle / 2 <= 1260, `${cards} cards: idle fan clears the rail`);
    assert.ok(fan.open >= fan.idle);
    assert.ok(fan.centre - fan.open / 2 >= 0 && fan.centre + fan.open / 2 <= 1260);
  }
});
