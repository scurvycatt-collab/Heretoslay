// CardRenderer (ADR-003): draws a base card from public card data + the layout
// facts in docs/contracts/CARD_TEMPLATE_SPEC.json. No third-party frame/art:
// frames are CSS, art is an in-house geometric placeholder.
import { createContext, useContext, useRef, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import type { AnyHeroClass, BaseCardKind, CardData, MonsterCardData, RollCompare } from "@here-to-slay/protocol";
import { CLASS_COLOR, PALETTE, webClass, cardData, cardSize, descriptionBox, layoutFor, pct, titleCase } from "./cardCatalog";
import { Glyph, type GlyphName } from "./ClassIcon";
import { CardRenderer as FaceRenderer } from "./cards/CardRenderer";
import { CARD_FACE_PLACEHOLDER, resolveCardArt, resolveCardFace } from "./cards/resolveCardFace";
import "./card.css";

/**
 * Real artwork (ADR-004, FAN_MADE_NON_COMMERCIAL): an imported illustration, else
 * the art area cropped out of an imported complete face. Null = use the placeholder.
 */
function realArtStyle(definitionId: string, kind: BaseCardKind): CSSProperties | null {
  const art = resolveCardArt(definitionId);
  if (art) return { backgroundImage: `url("${art}")`, backgroundSize: "cover", backgroundPosition: "center" };
  const face = resolveCardFace(definitionId);
  if (face === CARD_FACE_PLACEHOLDER) return null;
  const size = cardSize(kind);
  const r = (layoutFor(kind) as { art: { x: number; y: number; w: number; h: number } }).art;
  // The art token is a 4:5 box; the art window of a complete face is not (monsters: 745x824), so
  // crop it "cover"-style instead of stretching it to the box.
  const BOX = 4 / 5;
  const pct = (n: number) => `${Math.round(n * 1000) / 1000}%`;
  if (r.w / r.h >= BOX) {
    const visW = r.h * BOX;
    const x = r.x + (r.w - visW) / 2;
    return {
      backgroundImage: `url("${face}")`,
      backgroundSize: `${pct(size.width / visW * 100)} ${pct(size.height / r.h * 100)}`,
      backgroundPosition: `${pct(x / (size.width - visW) * 100)} ${pct(r.y / (size.height - r.h) * 100)}`,
    };
  }
  const visH = r.w / BOX;
  const y = r.y + (r.h - visH) / 2;
  return {
    backgroundImage: `url("${face}")`,
    backgroundSize: `${pct(size.width / r.w * 100)} ${pct(size.height / visH * 100)}`,
    backgroundPosition: `${pct(r.x / (size.width - r.w) * 100)} ${pct(y / (size.height - visH) * 100)}`,
  };
}

export type CardLike = { definitionId: string; kind: BaseCardKind; name: string; cardId?: string; modifierOptions?: number[] };
export type CardSizeName = "xs" | "sm" | "md" | "lg" | "xl";

/**
 * Card inspector: cards report hover/focus (with their screen rect) and touch
 * long-press / right-click (`pinned`). The provider decides when to show the
 * full card (e.g. only while Ctrl is held, or always when pinned).
 */
export type InspectFn = (card: CardLike | null, rect?: DOMRect | null, pinned?: boolean) => void;
export const InspectContext = createContext<InspectFn | null>(null);

/** Two-letter monogram + stable hue shift so placeholder art tells cards apart. */
function artSeed(card: CardLike) {
  const words = card.name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  const mono = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
  let hash = 0;
  for (const ch of card.definitionId) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return { mono, angle: Math.abs(hash) % 180, spot: 15 + (Math.abs(hash >> 3) % 70) };
}

const KIND_LABEL: Record<BaseCardKind, string> = {
  hero: "Hero",
  magic: "Magic",
  item: "Item",
  cursed_item: "Cursed Item",
  modifier: "Modifier",
  challenge: "Challenge",
  monster: "Monster",
  party_leader: "Party Leader",
};

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const rollText = (roll: RollCompare) => `${roll.value}${roll.op === "gte" ? "+" : "-"}`;

function heroClassOf(data: CardData | undefined): AnyHeroClass | undefined {
  if (!data) return undefined;
  if (data.kind === "hero" || data.kind === "party_leader") return webClass(data.heroClass);
  if ((data.kind === "item" || data.kind === "cursed_item") && data.maskClass) return webClass(data.maskClass);
  return undefined;
}

function frameColors(kind: BaseCardKind, heroClass: AnyHeroClass | undefined): CSSProperties {
  switch (kind) {
    case "hero":
    case "party_leader":
      return { "--frame": CLASS_COLOR[heroClass ?? "none"], "--title": PALETTE.text, "--ink": PALETTE.text } as CSSProperties;
    case "magic":
      return { "--frame": PALETTE.magic, "--title": PALETTE.text, "--ink": PALETTE.text } as CSSProperties;
    case "item":
      return { "--frame": PALETTE.itemFrame, "--title": PALETTE.itemTitle, "--ink": PALETTE.text, "--accent": heroClass ? CLASS_COLOR[heroClass] : PALETTE.itemTitle } as CSSProperties;
    case "cursed_item":
      return { "--frame": PALETTE.itemFrame, "--title": PALETTE.cursedTitle, "--ink": PALETTE.text, "--accent": PALETTE.cursedTitle } as CSSProperties;
    case "monster":
      return { "--frame": PALETTE.monsterPanel, "--title": PALETTE.text, "--ink": PALETTE.text } as CSSProperties;
    default:
      return { "--frame": "#efe7d6", "--title": PALETTE.textDark, "--ink": PALETTE.textDark } as CSSProperties;
  }
}

function kindGlyph(kind: BaseCardKind, heroClass: AnyHeroClass | undefined): GlyphName {
  if (heroClass) return heroClass;
  switch (kind) {
    case "item": return "item";
    case "cursed_item": return "cursed";
    case "magic": return "magic";
    case "modifier": return "modifier";
    case "challenge": return "challenge";
    case "monster": return "monster";
    case "party_leader": return "leader";
    default: return "none";
  }
}

function MonsterPanel({ data }: { data: MonsterCardData }) {
  const L = layoutFor("monster") as typeof import("../../../docs/contracts/CARD_TEMPLATE_SPEC.json")["layouts"]["monster"];
  const size = cardSize("monster");
  const y = (v: number) => `${(v / size.height) * 100}%`;
  const x = (v: number) => `${(v / size.width) * 100}%`;
  // Pill colours are by meaning (spec $note): green = slay, red = penalty; op/value come from data.
  const rows = [
    { key: "penalty", top: L.penaltyRollPill.y, roll: data.penaltyRange, text: data.penaltyText, tone: "bad" },
    { key: "slay", top: L.slayRollPill.y, roll: data.slay, text: "SLAY this Monster card.", tone: "good" },
  ];
  return (
    <>
      <span className="card-req" style={{ left: x(L.requirementLabel.x), top: y(L.requirementIcons.y), height: y(L.requirementIcons.h) }}>
        <span className="card-req-label">Requirement:</span>
        {data.requirement.map((slot, index) => (
          <span key={index} className="card-req-icon" style={{ background: slot.kind === "class" ? CLASS_COLOR[webClass(slot.heroClass) ?? "none"] : CLASS_COLOR.none }}>
            <Glyph name={slot.kind === "class" ? webClass(slot.heroClass) ?? "none" : "any"} title={slot.kind === "class" ? titleCase(slot.heroClass) : "Any Hero"} />
          </span>
        ))}
      </span>
      {rows.map((row) => (
        <span key={row.key} className="card-outcome" style={{ top: y(row.top), height: y(L.slayRollPill.h), left: x(L.penaltyRollPill.x), right: x(60) }}>
          <span className={`card-pill card-pill--${row.tone}`}>{rollText(row.roll)}</span>
          <span className="card-outcome-text">{row.text}</span>
        </span>
      ))}
    </>
  );
}

type CardRendererProps = {
  card: CardLike;
  size?: CardSizeName;
  /** Effective classes from the snapshot (e.g. Mask applied); defaults to card data. */
  classes?: string[];
  equipped?: boolean;
  selected?: boolean;
  dimmed?: boolean;
  disabled?: boolean;
  badge?: ReactNode;
  className?: string;
  style?: CSSProperties;
  inspect?: boolean;
  /** "art": compact table token (art only); "full": the whole card face. */
  variant?: "full" | "art";
  onClick?: () => void;
  ariaLabel?: string;
};

export function CardRenderer({ card, size = "md", classes, equipped, selected, dimmed, disabled, badge, className, style, inspect = true, variant = "full", onClick, ariaLabel }: CardRendererProps) {
  const setInspect = useContext(InspectContext);
  const pressTimer = useRef<number | null>(null);
  const pinnedRef = useRef(false);
  const seed = artSeed(card);
  const data = cardData(card.definitionId);
  const kind = card.kind;
  const heroClass = (classes?.[0] as AnyHeroClass | undefined) ?? heroClassOf(data);
  const spec = cardSize(kind);
  const layout = layoutFor(kind) as Record<string, unknown> & { art: { x: number; y: number; w: number; h: number } };
  const compact = size === "xs" || size === "sm";
  const text = data?.text ?? null;
  const descScale = text ? Math.min(1, Math.max(0.68, 1 - (text.length - 70) / 260)) : 1;
  const tarot = spec.height / spec.width > 1.55;
  const title =
    kind === "hero" || kind === "party_leader" ? `${KIND_LABEL[kind]}: ${heroClass ? titleCase(heroClass) : "?"}` : KIND_LABEL[kind];
  const blank = kind === "modifier" || kind === "challenge";
  const glyph = kindGlyph(kind, heroClass);
  const options = card.modifierOptions ?? (data?.kind === "modifier" ? data.options : undefined);
  const rect = (r: unknown) => pct(kind, r as { x: number; y: number; w: number; h: number });

  const art = variant === "art";
  const classNames = [
    "tcard",
    art ? "tcard--art" : "",
    !art && data ? "tcard--real" : "",
    `tcard--${kind}`,
    `tcard--${size}`,
    tarot ? "tcard--tarot" : "tcard--poker",
    compact ? "tcard--compact" : "",
    selected ? "is-selected" : "",
    dimmed ? "is-dimmed" : "",
    disabled ? "is-disabled" : "",
    onClick ? "is-clickable" : "",
    className ?? "",
  ].filter(Boolean).join(" ");

  const real = art ? realArtStyle(card.definitionId, kind) : null;
  const artBlock = (style: CSSProperties) => (
    <span className={`tcard-art${real ? " is-real" : ""}`} style={{ ...style, ...(real ?? {}), "--art-angle": `${seed.angle}deg`, "--art-spot": `${seed.spot}%` } as CSSProperties}>
      {!real && <Glyph name={glyph} className="tcard-art-glyph" />}
      {!real && <span className="tcard-mono">{seed.mono}</span>}
    </span>
  );

  const artBody = (
    <>
      {artBlock({ left: "6%", top: "6%", width: "88%", height: "88%" })}
      {heroClass && <span className="tcard-mini-class"><Glyph name={heroClass} /></span>}
      {equipped && <span className="tcard-mini-item" title="Item equipped"><Glyph name="item" /></span>}
      {badge && <span className="tcard-badge">{badge}</span>}
    </>
  );

  // Full face: the shared card renderer (imported face, or frame + imported art + rules text).
  const realFace = !art && data ? (
    <>
      <FaceRenderer card={data} className="tcard-face" />
      {badge && <span className="tcard-badge">{badge}</span>}
      {equipped && <span className="tcard-mini-item tcard-mini-item--face" title="Item equipped"><Glyph name="item" /></span>}
    </>
  ) : null;

  const body = art ? artBody : realFace ?? (
    <>
      {artBlock(rect(layout.art))}
      <span className={`tcard-head${blank ? " tcard-head--blank" : ""}`}>
        <span className="tcard-name">{card.name}</span>
        {!blank && <span className="tcard-title">{title}</span>}
      </span>

      {kind === "hero" && data?.kind === "hero" && (
        <>
          <span className="tcard-symbol" style={rect(layout.classSymbol)} title={classes?.map(titleCase).join(" / ")}>
            <Glyph name={heroClass ?? "none"} />
          </span>
          <span className="card-pill card-pill--roll" style={rect(layout.rollPill)} title={`Roll ${data.rollThreshold}+ to use the effect`}>
            {data.rollThreshold}+
          </span>
          {!compact && (() => {
            const slot = layout.itemSlots as { xRight: number; y: number; w: number; h: number };
            return <span className={`tcard-slot${equipped ? " is-filled" : ""}`} style={rect({ x: slot.xRight - slot.w, y: slot.y, w: slot.w, h: slot.h })} />;
          })()}
          {equipped && compact && <span className="tcard-slot tcard-slot--corner is-filled" />}
        </>
      )}

      {kind === "party_leader" && (
        <span className="tcard-symbol" style={rect(layout.classSymbol)}>
          <Glyph name={heroClass ?? "leader"} />
        </span>
      )}

      {(kind === "item" || kind === "cursed_item") && (
        <span className="tcard-symbol tcard-symbol--kind" style={rect(layout.kindSymbol)}>
          <Glyph name={glyph} />
        </span>
      )}

      {kind === "monster" && data?.kind === "monster" && <MonsterPanel data={data} />}

      {kind === "modifier" && options && (
        <span className="tcard-amounts">
          {options.map((value) => (
            <b key={value} className={value >= 0 ? "pos" : "neg"}>{signed(value)}</b>
          ))}
        </span>
      )}

      {!compact && text && (
        <span className="tcard-desc" style={{ ...descriptionBox(kind), "--desc-scale": descScale } as CSSProperties}>
          <span>{text}</span>
        </span>
      )}
      {!compact && !text && kind !== "challenge" && (
        <span className="tcard-desc tcard-desc--missing" style={descriptionBox(kind)}><span>Effect text UNVERIFIED</span></span>
      )}
      {badge && <span className="tcard-badge">{badge}</span>}
    </>
  );

  const canInspect = inspect && setInspect;
  const inspectModifiedClick = (e: MouseEvent<Element>) => {
    if (!canInspect || (!e.ctrlKey && !e.metaKey)) return false;
    e.preventDefault();
    e.stopPropagation();
    setInspect(card, e.currentTarget.getBoundingClientRect(), true);
    return true;
  };
  const clearPress = () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
    if (pinnedRef.current && setInspect) setInspect(null);
    pinnedRef.current = false;
  };
  const common = {
    className: classNames,
    style: { ...frameColors(kind, heroClass), aspectRatio: art ? "4 / 5" : `${spec.width} / ${spec.height}`, ...style },
    onMouseEnter: canInspect ? (e: { currentTarget: Element }) => setInspect(card, e.currentTarget.getBoundingClientRect()) : undefined,
    onMouseLeave: canInspect ? () => setInspect(null) : undefined,
    onFocus: canInspect ? (e: { currentTarget: Element }) => setInspect(card, e.currentTarget.getBoundingClientRect()) : undefined,
    onBlur: canInspect ? () => setInspect(null) : undefined,
    // Desktop: right-click mirrors Ctrl/⌘ + hover without opening the browser menu.
    onContextMenu: canInspect
      ? (e: { preventDefault: () => void; currentTarget: Element }) => {
          e.preventDefault();
          setInspect(card, e.currentTarget.getBoundingClientRect(), true);
        }
      : undefined,
    // Touch: long-press shows the full card until release.
    onPointerDown: canInspect
      ? (e: PointerEvent<Element>) => {
          if (e.pointerType === "mouse") return;
          const rectNow = e.currentTarget.getBoundingClientRect();
          pressTimer.current = window.setTimeout(() => { pinnedRef.current = true; setInspect(card, rectNow, true); }, 380);
        }
      : undefined,
    onPointerUp: canInspect ? clearPress : undefined,
    onPointerCancel: canInspect ? clearPress : undefined,
    title: art ? card.name : undefined,
    "aria-label": ariaLabel ?? `${card.name} — ${title}${text ? `. ${text}` : ""}`,
  };

  if (onClick) {
    return (
      <button type="button" {...common} onClick={(e) => { if (!inspectModifiedClick(e)) onClick(); }} disabled={disabled} aria-pressed={selected ?? undefined}>
        {body}
      </button>
    );
  }
  return (
    <div role="img" {...common} onClick={inspectModifiedClick}>
      {body}
    </div>
  );
}
