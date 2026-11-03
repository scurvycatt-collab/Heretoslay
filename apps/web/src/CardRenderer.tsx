// CardRenderer (ADR-003): draws a base card from public card data + the layout
// facts in docs/contracts/CARD_TEMPLATE_SPEC.json. No third-party frame/art:
// frames are CSS, art is an in-house geometric placeholder.
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import type { BaseCardKind, CardData, HeroClass, MonsterCardData, RollCompare } from "@here-to-slay/protocol";
import { CLASS_COLOR, PALETTE, cardData, cardSize, descriptionBox, layoutFor, pct, titleCase } from "./cardCatalog";
import { Glyph, type GlyphName } from "./ClassIcon";
import "./card.css";

export type CardLike = { definitionId: string; kind: BaseCardKind; name: string; cardId?: string; modifierOptions?: number[] };
export type CardSizeName = "xs" | "sm" | "md" | "lg" | "xl";

/** Hover/focus preview: any card rendered inside the provider can feed the inspector. */
export const InspectContext = createContext<((card: CardLike | null) => void) | null>(null);

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

function heroClassOf(data: CardData | undefined): HeroClass | undefined {
  if (!data) return undefined;
  if (data.kind === "hero" || data.kind === "party_leader") return data.heroClass;
  if ((data.kind === "item" || data.kind === "cursed_item") && data.maskClass) return data.maskClass;
  return undefined;
}

function frameColors(kind: BaseCardKind, heroClass: HeroClass | undefined): CSSProperties {
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

function kindGlyph(kind: BaseCardKind, heroClass: HeroClass | undefined): GlyphName {
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
          <span key={index} className="card-req-icon" style={{ background: slot.kind === "class" ? CLASS_COLOR[slot.heroClass] : CLASS_COLOR.none }}>
            <Glyph name={slot.kind === "class" ? slot.heroClass : "any"} title={slot.kind === "class" ? titleCase(slot.heroClass) : "Any Hero"} />
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
  onClick?: () => void;
  ariaLabel?: string;
};

export function CardRenderer({ card, size = "md", classes, equipped, selected, dimmed, disabled, badge, className, style, inspect = true, onClick, ariaLabel }: CardRendererProps) {
  const setInspect = useContext(InspectContext);
  const data = cardData(card.definitionId);
  const kind = card.kind;
  const heroClass = (classes?.[0] as HeroClass | undefined) ?? heroClassOf(data);
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

  const classNames = [
    "tcard",
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

  const body = (
    <>
      <span className="tcard-art" style={rect(layout.art)}>
        <Glyph name={glyph} className="tcard-art-glyph" />
      </span>
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

  const common = {
    className: classNames,
    style: { ...frameColors(kind, heroClass), aspectRatio: `${spec.width} / ${spec.height}`, ...style },
    onMouseEnter: inspect && setInspect ? () => setInspect(card) : undefined,
    onMouseLeave: inspect && setInspect ? () => setInspect(null) : undefined,
    onFocus: inspect && setInspect ? () => setInspect(card) : undefined,
    onBlur: inspect && setInspect ? () => setInspect(null) : undefined,
    "aria-label": ariaLabel ?? `${card.name} — ${title}${text ? `. ${text}` : ""}`,
  };

  if (onClick) {
    return (
      <button type="button" {...common} onClick={onClick} disabled={disabled} aria-pressed={selected ?? undefined}>
        {body}
      </button>
    );
  }
  return (
    <div role="img" {...common}>
      {body}
    </div>
  );
}
