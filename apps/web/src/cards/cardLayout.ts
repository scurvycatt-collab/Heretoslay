/**
 * Card face geometry in native pixels (top-left origin). Numbers are layout FACTS
 * measured from the reference Card Maker (Danrejk/Here-To-Slay-Card-Maker, GPL-3.0):
 * its Program.cs coordinates (already in CARD_TEMPLATE_SPEC.json) plus the shape of its
 * frame masks (border width, panel corners, bands). No GPL code and no PNG is reused;
 * every shape is drawn by our own SVG (ADR-003). Pure module: tests/card-layout.test.ts.
 */
export const CREAM = "rgb(245,241,231)";
export const DESC_DARK = "rgb(78,78,78)";
export const BORDER = 41;          // coloured frame width on every side
export const PANEL_RADIUS = 10;    // inner corner of the cream panel / art window
export const CARD_RADIUS = 28;     // rounded die-cut corner for on-screen display

export const FONT_NAME = '"Patua One", Georgia, serif';
/**
 * The reference engine (Raylib) sizes a font by its full line box (ascent + descent);
 * CSS sizes by the em. Patua One: 1.22 em (measured line box). Source Sans: 1.32 em, calibrated
 * against the reference renders (it used Source Sans Pro, whose metrics differ from Source Sans 3).
 * Every SIZE below is in reference units; convert with cssPx() before handing it to SVG.
 */
export const LINE_EM = { name: 1.22, text: 1.32 } as const;
export const cssPx = (referenceSize: number, font: keyof typeof LINE_EM) => referenceSize / LINE_EM[font];
export const FONT_TEXT = '"Source Sans 3", "Source Sans Pro", Arial, sans-serif';

export const SIZE = {
  name: 60, nameBlank: 97, title: 47, requirement: 49, roll: 43, description: 36, modifier: 97, symbolLetter: 75,
} as const;
/** Raylib line advance = font size; consecutive lines are pulled 4.5 px closer. */
export const DESC_LINE_TIGHTEN = 4.5;

export const FRAME = {
  /** Item: cream panel stops here; below is the dark item band with light text. */
  itemPanelBottom: 836,
  /** Monster: dark band under the art, then the cream description strip. */
  monsterBandTop: 858,
  /** Monster + Leader: cream description strip starts here (tarot). */
  tarotCreamTop: 1217,
} as const;

/** Description boxes: left/right padding and the height of the area measured up from `bottom`. */
export const DESCRIPTION = {
  hero: { left: 200, right: 90, area: 215, bottom: 1040 - BORDER },
  magic: { left: 100, right: 90, area: 222, bottom: 1040 - BORDER },
  item: { left: 225, right: 90, area: 205, bottom: 1040 },
  modifier: { left: 100, right: 90, area: 264, bottom: 1040 },
  challenge: { left: 100, right: 90, area: 264, bottom: 1040 },
  monster: { left: 87, right: 90, area: 200, bottom: 1417 },
  party_leader: { left: 87, right: 90, area: 200, bottom: 1417 },
} as const;

/**
 * Greedy word wrap with a width function (canvas measureText in the browser).
 * "\n" forces a break and marks a paragraph gap (extra space, like the original).
 */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): { lines: string[]; paragraphBreaks: number[] } {
  const lines: string[] = [];
  const paragraphBreaks: number[] = [];
  text.split("\n").forEach((paragraph, p) => {
    if (p > 0) paragraphBreaks.push(lines.length);
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) { lines.push(line); line = word; } else line = next;
    }
    lines.push(line);
  });
  return { lines, paragraphBreaks };
}

/** Top y of each line so the block is vertically centred in [bottom - area, bottom]. */
export function descriptionLineTops(lineCount: number, area: number, bottom: number, size: number = SIZE.description, paragraphGaps = 0, gap = 13): number[] {
  const step = size - DESC_LINE_TIGHTEN;
  const blockHeight = lineCount * size - (lineCount - 1) * DESC_LINE_TIGHTEN + paragraphGaps * gap;
  const top = bottom - area + (area - blockHeight) / 2;
  return Array.from({ length: lineCount }, (_, i) => top + i * step);
}

/** Largest size ≤ `size` whose wrapped text still fits `maxLines`. */
export function fitDescription(text: string, maxWidth: number, maxLines: number, measureAt: (s: string, size: number) => number, size: number = SIZE.description, minSize = 26) {
  for (let s = size; s >= minSize; s--) {
    const wrapped = wrapLines(text, maxWidth, (t) => measureAt(t, s));
    if (wrapped.lines.length <= maxLines) return { size: s, ...wrapped };
  }
  return { size: minSize, ...wrapWithFallback(text, maxWidth, (t) => measureAt(t, minSize)) };
}
const wrapWithFallback = (text: string, maxWidth: number, measure: (s: string) => number) => wrapLines(text, maxWidth, measure);

/** Rounded-rect path with independent top / bottom radii (art windows are square at the bottom when a band covers them). */
export function roundedRect(x: number, y: number, w: number, h: number, top: number, bottom: number): string {
  return `M${x + top},${y}H${x + w - top}Q${x + w},${y} ${x + w},${y + top}V${y + h - bottom}Q${x + w},${y + h} ${x + w - bottom},${y + h}H${x + bottom}Q${x},${y + h} ${x},${y + h - bottom}V${y + top}Q${x},${y} ${x + top},${y}Z`;
}
