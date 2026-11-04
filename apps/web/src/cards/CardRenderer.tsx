import { useId, useSyncExternalStore, type ReactNode } from "react";
import type { CardData, HeroClass, RollCompare } from "@here-to-slay/protocol";
import "@fontsource/patua-one/400.css";
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/700.css";
import spec from "../../../../docs/contracts/CARD_TEMPLATE_SPEC.json";
import { cardAssets, cardById } from "./catalog";
import { CARD_FACE_PLACEHOLDER, resolveCardArt, resolveCardFace } from "./resolveCardFace";
import {
  BORDER, CARD_RADIUS, CREAM, DESCRIPTION, DESC_DARK, FONT_NAME, FONT_TEXT, FRAME, PANEL_RADIUS, SIZE,
  cssPx, descriptionLineTops, fitDescription, roundedRect,
} from "./cardLayout";
import "./cards.css";
import { translateVi, useLanguage } from "../i18n";
// Class / item symbols from the reference Card Maker (Unstable Games designs; see icons/README.md, ADR-004).
import bardIcon from "./icons/bard.png";
import fighterIcon from "./icons/fighter.png";
import guardianIcon from "./icons/guardian.png";
import rangerIcon from "./icons/ranger.png";
import thiefIcon from "./icons/thief.png";
import wizardIcon from "./icons/wizard.png";
import anyHeroIcon from "./icons/hero.png";
import itemIcon from "./icons/item.png";
import cursedItemIcon from "./icons/cursed-item.png";

const CLASS_ICON: Record<HeroClass, string> = { bard: bardIcon, fighter: fighterIcon, guardian: guardianIcon, ranger: rangerIcon, thief: thiefIcon, wizard: wizardIcon };

const rgb = (values: readonly number[]) => `rgb(${values.join(",")})`;
const titleCase = (text: string) => text.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
export const rollLabel = (range: RollCompare) => `${range.value}${range.op === "gte" ? "+" : "−"}`;
const classColor = (c: HeroClass | null | undefined) => rgb(c ? spec.colors.classes[c] : spec.colors.classes.none);
const C = {
  magic: rgb(spec.colors.magic), item: rgb(spec.colors.itemFrame), itemTitle: rgb(spec.colors.itemTitle),
  cursedTitle: rgb(spec.colors.cursedItemTitle), monster: rgb(spec.colors.monsterBottomPanel),
  good: rgb(spec.colors.modifierPositive), bad: rgb(spec.colors.modifierNegative), noClass: rgb(spec.colors.classes.none),
  artPending: "#3f4442",
};

// ---------------------------------------------------------------- fonts + measuring
// Text is wrapped by measuring with the real fonts; re-render once they have loaded.
let fontsReady = typeof document === "undefined" || !document.fonts || document.fonts.status === "loaded";
const fontListeners = new Set<() => void>();
if (!fontsReady && typeof document !== "undefined") {
  void Promise.all(["400 36px \"Patua One\"", "400 36px \"Source Sans 3\"", "700 36px \"Source Sans 3\""].map((f) => document.fonts.load(f))).finally(() => {
    fontsReady = true; fontListeners.forEach((l) => l());
  });
}
const useFontsReady = () => useSyncExternalStore((l) => { fontListeners.add(l); return () => fontListeners.delete(l); }, () => fontsReady, () => true);
let measureCtx: CanvasRenderingContext2D | null = null;
function measure(text: string, size: number, family = FONT_TEXT, weight = 400, letterSpacing = 1): number {
  measureCtx ??= typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  if (!measureCtx) return text.length * size * 0.5;
  measureCtx.font = `${weight} ${size}px ${family}`;
  return measureCtx.measureText(text).width + letterSpacing * text.length;
}

// ---------------------------------------------------------------- building blocks
/** Top-anchored text (the reference draws from the line-box top). `size` is in reference units. */
function Label({ x, y, size, children, fill = "#000", family = FONT_NAME, weight = 400, anchor = "middle", spacing = 0, shadow }: { x: number; y: number; size: number; children: ReactNode; fill?: string; family?: string; weight?: number; anchor?: "start" | "middle" | "end"; spacing?: number; shadow?: { fill: string; offset: number } }) {
  const common = { fontFamily: family, fontSize: cssPx(size, family === FONT_NAME ? "name" : "text"), fontWeight: weight, textAnchor: anchor, dominantBaseline: "text-before-edge" as const, letterSpacing: spacing || undefined };
  return <>
    {shadow && <text x={x + shadow.offset} y={y + shadow.offset} fill={shadow.fill} {...common}>{children}</text>}
    <text x={x} y={y} fill={fill} {...common}>{children}</text>
  </>;
}

function Description({ text, box, width, fill, maxLines = 5, size = SIZE.description, minSize = 26 }: { text: string; box: { left: number; right: number; area: number; bottom: number }; width: number; fill: string; maxLines?: number; size?: number; minSize?: number }) {
  const maxWidth = width - box.left - box.right;
  const fitted = fitDescription(text, maxWidth, maxLines, (s, fittedSize) => measure(s, cssPx(fittedSize, "text")), size, minSize);
  const tops = descriptionLineTops(fitted.lines.length, box.area, box.bottom, fitted.size, fitted.paragraphBreaks.length);
  let gap = 0;
  return <text fill={fill} fontFamily={FONT_TEXT} fontSize={cssPx(fitted.size, "text")} letterSpacing={1} dominantBaseline="text-before-edge">
    {fitted.lines.map((line, i) => { if (fitted.paragraphBreaks.includes(i)) gap += 13; return <tspan key={i} x={box.left} y={tops[i] + gap}>{line}</tspan>; })}
  </text>;
}

/** Rounded roll pill (78 px) with the cream rim of the original. */
function Pill({ x, y, fill, label }: { x: number; y: number; fill: string; label: string }) {
  return <g>
    <rect x={x} y={y} width={78} height={78} rx={14} fill={CREAM} />
    <rect x={x + 3} y={y + 3} width={72} height={72} rx={12} fill={fill} />
    <text x={x + 39} y={y + 40} fill="#fff" fontFamily={FONT_NAME} fontSize={cssPx(label.length > 3 ? 36 : SIZE.roll, "name")} textAnchor="middle" dominantBaseline="central">{label}</text>
  </g>;
}

/** Round class / kind symbol. Uses the original icon when there is one, else a drawn circle + glyph. */
function Symbol({ x, y, size, fill, icon, children }: { x: number; y: number; size: number; fill: string; icon?: string; children?: ReactNode }) {
  if (icon) return <image href={icon} x={x} y={y} width={size} height={size} />;
  const r = size / 2;
  return <g>
    <circle cx={x + r} cy={y + r} r={r} fill={CREAM} />
    <circle cx={x + r} cy={y + r} r={r - size * 0.07} fill={fill} />
    {children}
  </g>;
}
/** Initial letter, sized like the reference's custom-class symbol (75 at 102 px). */
const Letter = ({ x, y, size, letter }: { x: number; y: number; size: number; letter: string }) =>
  <text x={x + size / 2} y={y + size / 2 + size * 0.03} fill="#fff" fontFamily={FONT_NAME} fontSize={cssPx(size * (SIZE.symbolLetter / 102), "name")} textAnchor="middle" dominantBaseline="central">{letter}</text>;

function Art({ id, href, x, y, w, h, top = 0, bottom = 0 }: { id: string; href?: string; x: number; y: number; w: number; h: number; top?: number; bottom?: number }) {
  const shape = roundedRect(x, y, w, h, top, bottom);
  return <g>
    <clipPath id={id}><path d={shape} /></clipPath>
    <path d={shape} fill={C.artPending} />
    {href
      ? <image href={href} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} />
      : <text x={x + w / 2} y={y + h / 2} fill="#ffffff55" fontFamily={FONT_TEXT} fontSize={22} letterSpacing={4} textAnchor="middle" dominantBaseline="central">ARTWORK PENDING</text>}
  </g>;
}

// ---------------------------------------------------------------- renderer
/**
 * Placeholder card face in the original print format (poker 745×1040, tarot 827×1417):
 * coloured 41 px frame, cream panel, Patua One name, Source Sans text, 78 px roll pills,
 * 102 px class symbol. Imported complete faces win; imported artwork fills the art window.
 */
export function CardRenderer({ card, className = "", artUrl }: { card: CardData; className?: string; /** Workbench preview: draw this art instead of any imported face/art. */ artUrl?: string }) {
  const { language } = useLanguage();
  useFontsReady();
  const uid = useId().replaceAll(":", "");
  const face = artUrl || language === "vi" ? CARD_FACE_PLACEHOLDER : resolveCardFace(card.definitionId);
  if (face !== CARD_FACE_PLACEHOLDER) return <CardFaceImage cardId={card.definitionId} label={card.name} className={className} />;
  const art = artUrl ?? resolveCardArt(card.definitionId) ?? cardAssets[card.definitionId]?.artUrl;
  const tarot = card.kind === "monster" || card.kind === "party_leader";
  const width = tarot ? 827 : 745, height = tarot ? 1417 : 1040;
  const sourceText = card.text ?? "Text unavailable";
  const text = language === "vi" ? translateVi(sourceText) : sourceText;
  const sourceLabel = card.kind === "party_leader" ? `Party Leader: ${titleCase(card.heroClass)}` : card.kind === "hero" ? `Hero: ${titleCase(card.heroClass)}` : card.kind === "cursed_item" ? "Cursed Item" : titleCase(card.kind);
  const label = language === "vi" ? translateVi(sourceLabel) : sourceLabel;

  let body: ReactNode;
  switch (card.kind) {
    case "hero":
    case "magic": {
      const frame = card.kind === "hero" ? classColor(card.heroClass) : C.magic;
      const box = DESCRIPTION[card.kind];
      body = <>
        <rect width={width} height={height} fill={frame} />
        <rect x={BORDER} y={BORDER} width={width - 2 * BORDER} height={height - 2 * BORDER} rx={PANEL_RADIUS} fill={CREAM} />
        <Art id={`${uid}a`} href={art} x={100} y={232} w={545} h={545} />
        <Label x={width / 2} y={80} size={SIZE.name}>{card.name}</Label>
        <Label x={width / 2} y={134} size={SIZE.title} family={FONT_TEXT} spacing={1} fill={frame}>{label}</Label>
        {card.kind === "hero" && <>
          <Symbol x={322} y={722} size={102} fill={frame} icon={CLASS_ICON[card.heroClass]}><Letter x={322} y={722} size={102} letter={card.heroClass[0].toUpperCase()} /></Symbol>
          <Pill x={94} y={852} fill={C.good} label={`${card.rollThreshold}+`} />
        </>}
        <Description text={text} box={box} width={width} fill={DESC_DARK} />
      </>;
      break;
    }
    case "item":
    case "cursed_item": {
      const mask = card.kind === "item" ? card.maskClass : null;
      const title = card.kind === "cursed_item" ? C.cursedTitle : C.itemTitle;
      body = <>
        <rect width={width} height={height} fill={C.item} />
        <path d={roundedRect(BORDER, BORDER, width - 2 * BORDER, FRAME.itemPanelBottom - BORDER, PANEL_RADIUS, 0)} fill={CREAM} />
        <Art id={`${uid}a`} href={art} x={100} y={232} w={545} h={545} />
        <Label x={width / 2} y={80} size={SIZE.name}>{card.name}</Label>
        <Label x={width / 2} y={134} size={SIZE.title} family={FONT_TEXT} spacing={1} fill={title}>{label}</Label>
        <Symbol x={99} y={886} size={102} fill={mask ? classColor(mask) : title} icon={mask ? CLASS_ICON[mask] : card.kind === "cursed_item" ? cursedItemIcon : itemIcon}>
          {mask ? <Letter x={99} y={886} size={102} letter={mask[0].toUpperCase()} />
            : card.kind === "cursed_item" ? <Letter x={99} y={886} size={102} letter="!" />
              : <rect x={150 - 18} y={937 - 18} width={36} height={36} fill="#fff" transform="rotate(45 150 937)" />}
        </Symbol>
        <Description text={text} box={DESCRIPTION.item} width={width} fill={CREAM} />
      </>;
      break;
    }
    case "modifier":
    case "challenge": {
      const challenge = card.kind === "challenge";
      const options = card.kind === "modifier" ? card.options : [];
      const good = options.find((v) => v > 0), bad = options.find((v) => v < 0);
      const both = good !== undefined && bad !== undefined;
      body = <>
        <rect width={width} height={height} fill={CREAM} />
        <Art id={`${uid}a`} href={art} x={challenge ? 50 : 100} y={challenge ? 215 : 182} w={challenge ? 645 : 545} h={challenge ? 550 : 545} top={PANEL_RADIUS} bottom={PANEL_RADIUS} />
        <Label x={width / 2} y={52} size={SIZE.nameBlank}>{challenge ? card.name.toUpperCase() : "MODIFIER"}</Label>
        {!challenge && <>
          {both && <Label x={width / 2} y={763} size={SIZE.modifier}>/</Label>}
          {good !== undefined && <Label x={width / 2 - (both ? 94 : 0)} y={763} size={SIZE.modifier} fill={C.good}>{`+${good}`}</Label>}
          {bad !== undefined && <Label x={width / 2 + (both ? 94 : 0)} y={763} size={SIZE.modifier} fill={C.bad}>{`${bad}`}</Label>}
        </>}
        <Description text={text} box={DESCRIPTION[card.kind]} width={width} fill={DESC_DARK} maxLines={challenge ? 5 : 3} />
      </>;
      break;
    }
    case "monster": {
      const reqLabel = "REQUIREMENT:";
      const reqWidth = measure(reqLabel, cssPx(SIZE.requirement, "text"), FONT_TEXT, 700, 0);
      body = <>
        <rect width={width} height={height} fill={C.monster} />
        <Art id={`${uid}a`} href={art} x={BORDER} y={BORDER} w={width - 2 * BORDER} h={FRAME.monsterBandTop - BORDER} top={PANEL_RADIUS} />
        <rect x={0} y={FRAME.tarotCreamTop} width={width} height={height - FRAME.tarotCreamTop} fill={CREAM} />
        <Label x={width / 2} y={67} size={SIZE.name} fill="#fff" shadow={{ fill: "rgba(0,0,0,.5)", offset: 3 }}>{card.name}</Label>
        <Label x={width / 2} y={118} size={SIZE.title} family={FONT_TEXT} spacing={1} fill="#fff" shadow={{ fill: "rgba(0,0,0,.5)", offset: 2 }}>Monster</Label>
        <Label x={88} y={920} size={SIZE.requirement} family={FONT_TEXT} weight={700} anchor="start" fill={CREAM}>{reqLabel}</Label>
        {card.requirement.map((slot, i) => {
          const x = 93 + reqWidth + 10 + i * (83 + 13);
          return <Symbol key={i} x={x} y={902} size={83} fill={slot.kind === "any" ? C.noClass : classColor(slot.heroClass)} icon={slot.kind === "any" ? anyHeroIcon : CLASS_ICON[slot.heroClass]}>
            <Letter x={x} y={902} size={83} letter={slot.kind === "any" ? "H" : slot.heroClass[0].toUpperCase()} />
          </Symbol>;
        })}
        {/* Pill colour by meaning (red = penalty, green = slay); the numbers come from data (Dracos is inverted). */}
        <Pill x={87} y={1002} fill={C.bad} label={rollLabel(card.penaltyRange)} />
        <Label x={187} y={1023} size={SIZE.description} family={FONT_TEXT} anchor="start" fill={CREAM} spacing={1}>{language === "vi" ? translateVi(card.penaltyText) : card.penaltyText}</Label>
        <Pill x={87} y={1099} fill={C.good} label={rollLabel(card.slay)} />
        <Label x={187} y={1120} size={SIZE.description} family={FONT_TEXT} anchor="start" fill={CREAM} spacing={1}>{language === "vi" ? "HẠ Quái vật này" : "SLAY this Monster"}</Label>
        <Description text={text} box={DESCRIPTION.monster} width={width} fill={DESC_DARK} maxLines={4} />
      </>;
      break;
    }
    case "party_leader": {
      const frame = classColor(card.heroClass);
      const onArt = !!art;
      body = <>
        <rect width={width} height={height} fill={frame} />
        <Art id={`${uid}a`} href={art} x={BORDER} y={BORDER} w={width - 2 * BORDER} h={FRAME.tarotCreamTop - BORDER} top={PANEL_RADIUS} />
        <rect x={0} y={FRAME.tarotCreamTop} width={width} height={height - FRAME.tarotCreamTop} fill={CREAM} />
        <Label x={width / 2} y={67} size={SIZE.name} fill={onArt ? "#000" : "#fff"} shadow={{ fill: onArt ? "rgba(255,255,255,.4)" : "rgba(0,0,0,.5)", offset: 3 }}>{card.name}</Label>
        <Label x={width / 2} y={118} size={SIZE.title} family={FONT_TEXT} spacing={1} fill={onArt ? "#000" : "#fff"} shadow={{ fill: onArt ? "rgba(255,255,255,.4)" : "rgba(0,0,0,.5)", offset: 2 }}>{label}</Label>
        <Symbol x={363} y={1167} size={102} fill={frame} icon={CLASS_ICON[card.heroClass]}><Letter x={363} y={1167} size={102} letter={card.heroClass[0].toUpperCase()} /></Symbol>
        <Description text={text} box={DESCRIPTION.party_leader} width={width} fill={DESC_DARK} maxLines={4} size={42} minSize={30} />
      </>;
      break;
    }
  }

  return <svg className={`card-renderer ${className}`} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`${card.name} · ${label}`} data-definition-id={card.definitionId}>
    <title>{card.name} · {label}</title>
    <desc>{text}{card.kind === "monster" ? ` ${language === "vi" ? "Phạt" : "Penalty"} ${rollLabel(card.penaltyRange)}: ${language === "vi" ? translateVi(card.penaltyText) : card.penaltyText} ${language === "vi" ? "Hạ" : "Slay"} ${rollLabel(card.slay)}.` : ""}</desc>
    <clipPath id={`${uid}c`}><rect width={width} height={height} rx={CARD_RADIUS} /></clipPath>
    <g clipPath={`url(#${uid}c)`}>{body}</g>
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
