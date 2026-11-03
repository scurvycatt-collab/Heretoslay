// In-house geometric glyphs (no third-party icon art, ADR-003).
import type { HeroClass } from "@here-to-slay/protocol";

export type GlyphName = HeroClass | "none" | "item" | "cursed" | "magic" | "modifier" | "challenge" | "monster" | "leader" | "any";

const PATHS: Record<GlyphName, string> = {
  // Bard — eighth note
  bard: "M9 4h9v4h-6v9.5a3.5 3.5 0 1 1-3-3.46z",
  // Fighter — upright sword
  fighter: "M12 2l2 3v9h3v2h-3.5v3l1.5 2v1h-6v-1l1.5-2v-3H7v-2h3V5z",
  // Guardian — shield
  guardian: "M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z",
  // Ranger — arrow
  ranger: "M3 21l11-11-3-1 9-6-6 9-1-3L5 21z",
  // Thief — dagger (diagonal)
  thief: "M20 3l-1 5-8 8 1 2-2 2-2-2-3 3-2-2 3-3-2-2 2-2 2 1 8-8z",
  // Wizard — star
  wizard: "M12 2l2.6 6.4L21 9l-5 4.5L17.5 21 12 17.3 6.5 21 8 13.5 3 9l6.4-.6z",
  none: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
  any: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10z",
  // Item — diamond gem
  item: "M6 3h12l4 6-10 13L2 9z",
  // Cursed — skull-ish
  cursed: "M12 2c5 0 8 3.5 8 8 0 3-1.5 5-3 6v4h-3v-2h-1v2h-2v-2h-1v2H7v-4c-1.5-1-3-3-3-6 0-4.5 3-8 8-8zm-3.5 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  // Magic — sparkle
  magic: "M12 1l2 8 8 3-8 3-2 8-2-8-8-3 8-3z",
  // Modifier — plus/minus
  modifier: "M10 3h4v5h5v4h-5v1h-4v-1H5V8h5zM5 17h14v4H5z",
  // Challenge — exclamation
  challenge: "M10 2h4l-.5 13h-3zM12 17a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
  // Monster — horns / claw
  monster: "M3 3l5 6h8l5-6-1 9c0 5-3.5 9-8 9s-8-4-8-9zm6 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  // Leader — crown
  leader: "M2 7l5 4 5-7 5 7 5-4-2 12H4z",
};

export function Glyph({ name, title, className }: { name: GlyphName; title?: string; className?: string }) {
  return (
    <svg className={className ?? "glyph"} viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title && <title>{title}</title>}
      <path d={PATHS[name]} fill="currentColor" />
    </svg>
  );
}
