// Table layout v3 geometry (display only). Pure functions so the rules are testable without a browser.

export const SEAT_WIDTH = 262;
export const SEAT_HEIGHT = 100;
const SEAT_GAP = 10;
// Clear of the Challenge / reaction banner that drops over the top edge of the table.
const SEAT_TOP = 58;
const SCALES = [1, 0.92, 0.84, 0.76, 0.68, 0.6, 0.52] as const;

export type SeatBox = { x: number; y: number; scale: number; width: number; height: number };

/**
 * Opponent seats, left → right in turn order after you, as centre points in table pixels.
 * They spread over the full width with the middle seat(s) on top. A neighbour that would overlap
 * sideways steps down by one seat height, so banners never cover each other. When the stack would
 * pass `floor` (the top of your own banner), or leave no room for the deck / Monster row between the
 * seats above it and `row.floor` (the top of your hand), every seat scales down one notch until it fits.
 */
export type RowBox = { halfWidth: number; height: number; floor: number };
const overRow = (seat: SeatBox, width: number, row: RowBox) => Math.abs(seat.x - width / 2) < row.halfWidth + seat.width / 2;

export function seatLayout(count: number, width: number, floor: number, row?: RowBox): SeatBox[] {
  let result: SeatBox[] = [];
  for (const scale of SCALES) {
    const w = SEAT_WIDTH * scale;
    const h = SEAT_HEIGHT * scale;
    const gap = SEAT_GAP * scale;
    const centre = width / 2;
    const odd = count % 2 === 1;
    const half = Math.floor(count / 2);
    const step = odd ? (half ? (centre - SEAT_GAP - w / 2) / half : 0) : half > 1 ? (centre - SEAT_GAP - w - gap / 2 - w / 2) / (half - 1) : 0;
    const rows = [SEAT_TOP + h / 2];
    for (let j = 1; j <= half; j += 1) rows.push(rows[j - 1] + (step >= w + gap ? Math.min(26, h / 3) : h + gap));
    result = Array.from({ length: count }, (_, i) => {
      const d = i - (count - 1) / 2;
      const rank = odd ? Math.abs(d) : Math.abs(d) - 0.5;
      const dx = odd ? rank * step : w / 2 + gap / 2 + rank * step;
      return { x: centre + Math.sign(d) * dx, y: rows[rank], scale, width: w, height: h };
    });
    const lowest = (seats: SeatBox[]) => Math.max(0, ...seats.map((seat) => seat.y + seat.height / 2));
    const rowFits = !row || lowest(result.filter((seat) => overRow(seat, width, row))) + 14 + row.height <= row.floor;
    if (lowest(result) <= floor && rowFits) break;
  }
  return result;
}

/** Vertical centre of the deck / Monster row: below every seat that hangs over it, never above 46% of the table. */
export function centreY(seats: readonly SeatBox[], width: number, height: number, row: RowBox): number {
  const over = seats.filter((seat) => overRow(seat, width, row));
  const below = over.length ? Math.max(...over.map((seat) => seat.y + seat.height / 2)) + 14 + row.height / 2 : 0;
  const lowest = row.floor - row.height / 2;
  return Math.max(below, Math.min(Math.max(height * 0.46, below), lowest));
}

/**
 * Hand fan. Idle: packed between your banner and the turn rail (never over the banner).
 * Open (hover): as wide as the table allows around the same centre; it may cover the banner.
 * Returns the fan centre and the two spans in table pixels.
 */
export function handSpans(cards: number, cardWidth: number, bannerRight: number, railLeft: number): { centre: number; idle: number; open: number } {
  const left = bannerRight + 18;
  const right = railLeft - 18;
  const room = Math.max(cardWidth, right - left);
  const natural = cardWidth + Math.max(0, cards - 1) * cardWidth * 0.62;
  const idle = Math.min(room, natural);
  // Biased to the right so the fan balances the banner on the left.
  const centre = left + idle / 2 + (room - idle) * 0.6;
  const full = cardWidth + Math.max(0, cards - 1) * (cardWidth + 8);
  const open = Math.max(idle, Math.min(full, 2 * Math.min(centre - 16, right - centre)));
  return { centre, idle, open };
}
