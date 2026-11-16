# Class logos

The table already shows the owner's vector class symbols for all eleven classes. They live in
`apps/web/src/classGlyphs.ts` (glyph geometry + disc colour, extracted 2026-11-16 from the owner's
`assets/cards/Expansion/Class icon/*.svg`, itself exact Bezier geometry from `HtS_All Class Logos.eps`).
`Glyph` in `ClassIcon.tsx` draws them in `currentColor` on top of `CLASS_COLOR`.

This folder is an optional override slot: a file named exactly

`bard` · `fighter` · `guardian` · `ranger` · `thief` · `wizard` · `warrior` · `druid` · `berserker` · `necromancer` · `sorcerer`

with extension `.png`, `.webp` or `.svg` replaces the vector symbol wherever `ClassMark` is used
(square, transparent background, light single-colour mark, ≥128×128). No code change needed:
`ClassMark` picks files up via `import.meta.glob` at build time. Record the source and rights of any file added here.
