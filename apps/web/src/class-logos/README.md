# Class logos (placeholder slot)

Empty on purpose: the table shows in-house placeholder glyphs (`ClassIcon.tsx`) until a logo file is added.

Add one file per class, named exactly:

`bard` · `fighter` · `guardian` · `ranger` · `thief` · `wizard` · `warrior` · `druid` · `berserker` · `necromancer` · `sorcerer`

- Format: `.png`, `.webp` or `.svg` (e.g. `warrior.png`). Square, transparent background, ≥128×128.
- The logo is drawn on top of the class colour (`CLASS_COLOR` in `cardCatalog.ts`), so a light, single-colour mark reads best.
- No code change needed: `ClassMark` picks files up via `import.meta.glob` at build time.
- Record where each image came from (generator, prompt/date, rights) in this README when you add it.
