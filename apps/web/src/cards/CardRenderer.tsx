import { useId } from "react";
import type { CardData, RollCompare } from "@here-to-slay/protocol";
import spec from "../../../../docs/contracts/CARD_TEMPLATE_SPEC.json";
import { cardAssets, cardById } from "./catalog";
import { CARD_FACE_PLACEHOLDER, resolveCardArt, resolveCardFace } from "./resolveCardFace";
import "./cards.css";

const rgb = (values: number[]) => `rgb(${values.join(",")})`;
const titleCase = (text: string) => text.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
export const rollLabel = (range: RollCompare) => `${range.value}${range.op === "gte" ? "+" : "−"}`;

// Conservative wrapping keeps exports deterministic with the documented fallback fonts.
function wrap(text: string, width: number, size: number): string[] {
  const limit = Math.max(1, Math.floor(width / (size * 0.56)));
  return text.split("\n").flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (line && `${line} ${word}`.length > limit) { lines.push(line); line = ""; }
      line = line ? `${line} ${word}` : word;
    }
    return [...lines, line];
  });
}

function TextBlock({ text, x, y, width, height, size = spec.fonts.description.size, fill = rgb(spec.colors.bottomText) }: { text: string; x: number; y: number; width: number; height: number; size?: number; fill?: string }) {
  let fitted = size;
  let lines = wrap(text, width, fitted);
  while (lines.length * fitted * 1.15 > height && fitted > 18) { fitted--; lines = wrap(text, width, fitted); }
  const lineHeight = fitted * 1.15;
  const top = y + (height - lines.length * lineHeight) / 2;
  return <text fill={fill} fontFamily='"Source Sans Pro", Arial, sans-serif' fontWeight="400" fontSize={fitted}>
    {lines.map((line, index) => <tspan key={index} x={x} y={top + (index + 0.8) * lineHeight}>{line}</tspan>)}
  </text>;
}

function Badge({ x, y, size, label, color }: { x: number; y: number; size: number; label: string; color: string }) {
  return <g><circle cx={x + size / 2} cy={y + size / 2} r={size / 2} fill={color} stroke="#f5f1e7" strokeWidth="4" />
    <text x={x + size / 2} y={y + size / 2} dominantBaseline="central" textAnchor="middle" fill="#fff" fontFamily='"Patua One", Georgia, serif' fontWeight="700" fontSize={size * 0.48}>{label}</text></g>;
}

/** Original geometric frame; layout facts come from the secondary-reference spec.
 * No third-party frames/icons/code are included. SVG remains usable at native size.
 */
export function CardRenderer({ card, className = "", artUrl }: { card: CardData; className?: string; /** Workbench preview: draw this art instead of any imported face/art. */ artUrl?: string }) {
  const clipId = useId().replaceAll(":", "");
  const face = artUrl ? CARD_FACE_PLACEHOLDER : resolveCardFace(card.definitionId);
  if (face !== CARD_FACE_PLACEHOLDER) return <CardFaceImage cardId={card.definitionId} label={card.name} className={className} />;
  const kind = card.kind === "cursed_item" ? "item" : card.kind;
  const layout = spec.layouts[kind];
  const { width, height } = spec.cardSizes[layout.size as "poker" | "tarot"];
  const art = layout.art;
  const artHref = artUrl ?? resolveCardArt(card.definitionId) ?? cardAssets[card.definitionId]?.artUrl;
  const heroClass = "heroClass" in card ? card.heroClass : "maskClass" in card ? card.maskClass : null;
  const accent = rgb(heroClass ? spec.colors.classes[heroClass] : card.kind === "magic" ? spec.colors.magic : spec.colors.itemFrame);
  const label = `${titleCase(card.kind)}${heroClass ? `: ${titleCase(heroClass)}` : ""}`;
  const largeName = kind === "modifier" || kind === "challenge";
  const nameSize = Math.min(largeName ? spec.fonts.nameBlankCard.size : spec.fonts.name.size, (width - 140) / Math.max(card.name.length * 0.58, 1));
  const desc = layout.description;
  const descWidth = width - desc.left - desc.right;
  const descOffset = "frameOffset" in desc ? desc.frameOffset : 0;
  // Keep modifier values inside the canvas: the reference centerY=1041 exceeds 1040.
  const descHeight = desc.areaHeightFromBottom - (kind === "modifier" ? 105 : 30);
  return <svg className={`card-renderer ${className}`} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`${card.name} · ${label}`} data-definition-id={card.definitionId}>
    <title>{card.name} · {label}</title><desc>{card.text ?? "Card text unavailable."}{card.kind === "monster" ? ` Penalty ${rollLabel(card.penaltyRange)}: ${card.penaltyText} Slay ${rollLabel(card.slay)}.` : ""}</desc>
    <defs><clipPath id={clipId}><rect x={art.x} y={art.y} width={art.w} height={art.h} rx="16" /></clipPath></defs>
    <rect width={width} height={height} rx="35" fill="#10161b" />
    <rect x="16" y="16" width={width - 32} height={height - 32} rx="24" fill={accent} stroke="#b6a178" strokeWidth="3" />
    <g clipPath={`url(#${clipId})`}>
      <rect x={art.x} y={art.y} width={art.w} height={art.h} fill="#252e32" />
      {artHref ? <image href={artHref} x={art.x} y={art.y} width={art.w} height={art.h} preserveAspectRatio="xMidYMid slice" /> : <g fill="none" stroke="#718481" strokeWidth="3" opacity="0.45">
        <path d={`M ${art.x} ${art.y + art.h} L ${art.x + art.w} ${art.y} M ${art.x} ${art.y} L ${art.x + art.w} ${art.y + art.h}`} />
        <circle cx={width / 2} cy={art.y + art.h / 2} r={art.w * 0.23} />
      </g>}
    </g>
    {!artHref && <text x={width / 2} y={art.y + art.h * 0.65} fill="#d5d9cd" textAnchor="middle" fontFamily="Arial, sans-serif" fontSize="23" letterSpacing="3">ARTWORK PENDING</text>}
    <rect x="41" y="41" width={width - 82} height={largeName ? 125 : 151} rx="12" fill="#10161b" opacity="0.94" />
    <text x={width / 2} y={layout.name.y} dominantBaseline="hanging" textAnchor="middle" fill="#f5f1e7" fontFamily='"Patua One", Georgia, serif' fontSize={nameSize} fontWeight="700">{card.name}</text>
    {"title" in layout && <text x={width / 2} y={layout.title.y + 18} dominantBaseline="hanging" textAnchor="middle" fill={card.kind === "cursed_item" ? rgb(spec.colors.cursedItemTitle) : card.kind === "item" ? rgb(spec.colors.itemTitle) : "#d8c59a"} fontFamily='"Source Sans Pro", Arial, sans-serif' fontSize={spec.fonts.title.size * 0.8}>{label}</text>}
    <rect x="41" y={height - desc.areaHeightFromBottom + descOffset - 10} width={width - 82} height={desc.areaHeightFromBottom - descOffset - 31} rx="12" fill="#171a1e" />
    <TextBlock text={card.text ?? "Text unavailable"} x={desc.left} y={height - desc.areaHeightFromBottom + descOffset} width={descWidth} height={descHeight} />
    {(kind === "hero" || kind === "party_leader") && heroClass && (() => {
      const symbol = spec.layouts[kind].classSymbol;
      return <Badge x={symbol.x} y={symbol.y} size={symbol.w} label={heroClass[0].toUpperCase()} color={accent} />;
    })()}
    {card.kind === "hero" && <Badge x={spec.layouts.hero.rollPill.x} y={spec.layouts.hero.rollPill.y} size={spec.layouts.hero.rollPill.w} label={`${card.rollThreshold}+`} color={accent} />}
    {(card.kind === "item" || card.kind === "cursed_item") && <Badge x={spec.layouts.item.kindSymbol.x} y={spec.layouts.item.kindSymbol.y} size={spec.layouts.item.kindSymbol.w} label={heroClass ? heroClass[0].toUpperCase() : card.kind === "cursed_item" ? "!" : "I"} color={accent} />}
    {card.kind === "modifier" && <text x={width / 2} y={height - 65} fill="#f5f1e7" textAnchor="middle" fontFamily='"Patua One", Georgia, serif' fontSize={spec.fonts.modifierAmount.size}>{card.options.map((value, index) => <tspan key={index} fill={rgb(value >= 0 ? spec.colors.modifierPositive : spec.colors.modifierNegative)}>{index ? " / " : ""}{value > 0 ? "+" : ""}{value}</tspan>)}</text>}
    {card.kind === "monster" && <>
      <rect x="41" y="880" width={width - 82} height="304" rx="12" fill={rgb(spec.colors.monsterBottomPanel)} />
      <text x={spec.layouts.monster.requirementLabel.x} y={spec.layouts.monster.requirementLabel.y} fill="#f5f1e7" fontFamily="Arial, sans-serif" fontSize="30">Requires</text>
      {card.requirement.map((slot, index) => <Badge key={index} x={240 + index * (spec.layouts.monster.requirementIcons.w + spec.layouts.monster.requirementIcons.gap)} y={spec.layouts.monster.requirementIcons.y - 10} size={70} label={slot.kind === "any" ? "H" : slot.heroClass[0].toUpperCase()} color={slot.kind === "class" ? rgb(spec.colors.classes[slot.heroClass]) : "#5b5d5c"} />)}
      <Badge x={spec.layouts.monster.penaltyRollPill.x} y={spec.layouts.monster.penaltyRollPill.y} size={78} label={rollLabel(card.penaltyRange)} color={rgb(spec.colors.modifierNegative)} />
      <TextBlock text={card.penaltyText} x={spec.layouts.monster.rollOutcomeText.x} y={1002} width={550} height={78} size={32} />
      <Badge x={spec.layouts.monster.slayRollPill.x} y={spec.layouts.monster.slayRollPill.y} size={78} label={rollLabel(card.slay)} color={rgb(spec.colors.modifierPositive)} />
      <TextBlock text="SLAY this Monster" x={spec.layouts.monster.rollOutcomeText.x} y={1099} width={550} height={78} size={32} />
    </>}
  </svg>;
}

/** Resolve only a definition already revealed by the server snapshot. */
export function CardById({ definitionId, fallback }: { definitionId: string; fallback?: string }) {
  const card = cardById.get(definitionId);
  return card ? <CardRenderer card={card} /> : <CardFaceImage cardId={definitionId} label={fallback ?? definitionId} />;
}

/** A complete imported face must not receive another frame or rules overlay. */
export function CardFaceImage({ cardId, label, className = "" }: { cardId: string; label: string; className?: string }) {
  return <img className={`card-renderer ${className}`} src={resolveCardFace(cardId)} alt={label} data-definition-id={cardId} loading="lazy" onError={(event) => {
    const image = event.currentTarget;
    if (image.getAttribute("src") !== CARD_FACE_PLACEHOLDER) image.src = CARD_FACE_PLACEHOLDER;
  }} />;
}
