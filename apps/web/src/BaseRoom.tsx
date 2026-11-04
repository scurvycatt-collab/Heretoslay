// UI-003 draft — tabletop for mode "base" after the owner's reference captures:
// perimeter seats, central Monsters + Discard, peeking hand, left rail, toasts,
// full-screen reaction stage. Everything shown comes from the server snapshot
// (+ static card data by definitionId); the client only sends commands and never
// computes game state. Command kinds/payloads are unchanged from UI-001/002.
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { BaseCardView, BaseChainView, BaseGameSnapshot, BaseRollOutcome, BaseRollResultView, BaseRollView, BaseTargets, HeroClass, TargetRule } from "@here-to-slay/protocol";
import { CardRenderer, InspectContext, type CardLike, type InspectFn } from "./CardRenderer";
import { Glyph } from "./ClassIcon";
import { CLASS_COLOR, HERO_CLASSES, cardData, leaderDisplayName, titleCase } from "./cardCatalog";
import "./base-room.css";

type Send = (kind: string, payload: object) => void;
type Player = BaseGameSnapshot["players"][number];
type Game = BaseGameSnapshot["game"];

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const leaderColor = (player: Player) => (player.leaderClass ? CLASS_COLOR[player.leaderClass as HeroClass] ?? CLASS_COLOR.none : CLASS_COLOR.none);
const RESULT_MS = 8000;
/** Dice tumble for this long, then the numbers are revealed (owner 2026-11-04: slower, readable rolls). */
const DICE_ROLL_MS = 2000;
const TOTAL_REVEAL_MS = 600;
const rollText = (roll: { op: "gte" | "lte"; value: number }) => `${roll.value}${roll.op === "gte" ? "+" : "-"}`;

/* ------------------------------------------------------------------ targets */

type TargetApi = {
  enabled: boolean;
  value: BaseTargets;
  togglePlayer: (playerId: string) => void;
  toggleHero: (heroId: string) => void;
};

/** Precise target form (fallback to clicking on the table). */
function TargetPicker({ state, value, onChange }: { state: BaseGameSnapshot; value: BaseTargets; onChange: (next: BaseTargets) => void }) {
  const heroes = state.players.flatMap((player) => player.party.map((entry) => ({ owner: player.nickname, hero: entry.hero })));
  const heroIds = value.heroInstanceIds ?? [];
  const setHero = (index: number, id: string) => {
    const next = [...heroIds];
    next[index] = id;
    const cleaned = next.filter(Boolean);
    onChange({ ...value, heroInstanceIds: cleaned.length ? cleaned : undefined });
  };
  return (
    <div className="t3-target-fields">
      <label>
        <span>Player</span>
        <select value={value.playerId ?? ""} onChange={(event) => onChange({ ...value, playerId: event.target.value || undefined })}>
          <option value="">—</option>
          {state.players.filter((p) => p.playerId !== state.you.playerId).map((p) => (
            <option key={p.playerId} value={p.playerId}>{p.nickname}</option>
          ))}
        </select>
      </label>
      {[0, 1].map((index) => (
        <label key={index}>
          <span>Hero {index + 1}</span>
          <select value={heroIds[index] ?? ""} onChange={(event) => setHero(index, event.target.value)}>
            <option value="">—</option>
            {heroes.map(({ owner, hero }) => (
              <option key={hero.cardId} value={hero.cardId}>{owner}: {hero.name}</option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function findHero(state: BaseGameSnapshot, heroId: string | undefined) {
  if (!heroId) return undefined;
  for (const player of state.players) {
    const entry = player.party.find((e) => e.hero.cardId === heroId);
    if (entry) return { ...entry, owner: player };
  }
  return undefined;
}

function TargetChips({ state, targets }: { state: BaseGameSnapshot; targets: BaseTargets }) {
  const playerName = targets.playerId ? state.players.find((p) => p.playerId === targets.playerId)?.nickname : undefined;
  const heroes = (targets.heroInstanceIds ?? []).map((id, i) => `T${i + 1} · ${findHero(state, id)?.hero.name ?? id}`);
  if (!playerName && heroes.length === 0) return <span className="t3-muted">No targets — click a player or a Hero.</span>;
  return (
    <>
      {playerName && <span className="t3-chip t3-chip--target">⌖ {playerName}</span>}
      {heroes.map((h) => <span key={h} className="t3-chip t3-chip--target">{h}</span>)}
    </>
  );
}

/* ----------------------------------------------------------- target dialog */

/** What a play/roll needs (Q-08: chosen up front, server re-validates). Items equip a Hero (Q-06). */
type PickRule = TargetRule | "equip_own" | "equip_any";
type PartyEntry = Player["party"][number];
type TargetOption = { key: string; player: Player; entry?: PartyEntry };
type TargetStep = { label: string; options: TargetOption[]; count: number };

function ruleFor(card: CardLike): PickRule | null {
  if (card.kind === "item") return "equip_own";
  if (card.kind === "cursed_item") return "equip_any";
  const data = cardData(card.definitionId);
  const rule = data && (data.kind === "hero" || data.kind === "magic") ? data.target : "none";
  return rule === "none" ? null : rule;
}

/** Legal options from public snapshot data only (same checks as the server's validateTargets / playTargetError). */
function targetSteps(state: BaseGameSnapshot, rule: PickRule): TargetStep[] {
  const me = state.you.playerId;
  const others = state.players.filter((p) => p.playerId !== me);
  const self = state.players.find((p) => p.playerId === me);
  const heroes = (players: Player[], keep: (e: PartyEntry) => boolean = () => true) =>
    players.flatMap((player) => player.party.filter(keep).map((entry) => ({ key: entry.hero.cardId, player, entry })));
  const own = self ? [self] : [];
  switch (rule) {
    case "other_player": return [{ label: "Choose a player", options: others.map((player) => ({ key: player.playerId, player })), count: 1 }];
    case "hero_other_party": return [{ label: "Choose a Hero in another player's Party", options: heroes(others), count: 1 }];
    case "two_heroes_other_party": return [{ label: "Choose 2 Heroes in other players' Parties", options: heroes(others), count: 2 }];
    case "hero_other_party_and_own_hero": return [
      { label: "1 · Choose a Hero in another player's Party", options: heroes(others), count: 1 },
      { label: "2 · Choose one of your Heroes", options: heroes(own), count: 1 },
    ];
    case "own_hero": return [{ label: "Choose one of your Heroes", options: heroes(own), count: 1 }];
    case "own_hero_with_cursed_item": return [{ label: "Choose your Hero with a Cursed Item", options: heroes(own, (e) => e.item?.kind === "cursed_item"), count: 1 }];
    case "any_hero_with_item": return [{ label: "Choose a Hero with an Item", options: heroes(state.players, (e) => Boolean(e.item)), count: 1 }];
    case "equip_own": return [{ label: "Equip to one of your Heroes (without an Item)", options: heroes(own, (e) => !e.item), count: 1 }];
    case "equip_any": return [{ label: "Equip to any Hero (without an Item)", options: heroes(state.players, (e) => !e.item), count: 1 }];
    default: return [];
  }
}

function buildTargets(rule: PickRule, picks: string[][]): BaseTargets {
  if (rule === "other_player") return { playerId: picks[0]?.[0] };
  return { heroInstanceIds: picks.flat() };
}

/** Inline picker: one row per step; auto-selects a step that has exactly the needed number of options. */
function TargetOptions({ state, rule, onChange }: { state: BaseGameSnapshot; rule: PickRule; onChange: (targets: BaseTargets | null) => void }) {
  const steps = targetSteps(state, rule);
  const [picks, setPicks] = useState<string[][]>(() => steps.map((step) => (step.options.length === step.count ? step.options.map((o) => o.key) : [])));
  const complete = steps.length > 0 && steps.every((step, i) => (picks[i] ?? []).length === step.count);
  useEffect(() => { onChange(complete ? buildTargets(rule, picks) : null); }, [complete, picks.map((p) => p.join(",")).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (i: number, key: string, count: number) =>
    setPicks((current) => current.map((row, k) => {
      if (k !== i) return row;
      if (row.includes(key)) return row.filter((x) => x !== key);
      return count === 1 ? [key] : row.length < count ? [...row, key] : [row[0], key];
    }));
  if (steps.some((step) => step.options.length < step.count)) {
    return <p className="t3-target-none">No valid target right now — this effect cannot be used.</p>;
  }
  return (
    <div className="t3-target-steps">
      {steps.map((step, i) => (
        <div key={step.label} className="t3-target-step">
          <b>{step.label}</b>
          <div className="t3-target-row">
            {step.options.map((option) => {
              const order = (picks[i] ?? []).indexOf(option.key);
              const on = order >= 0;
              return (
                <button key={option.key} type="button" className={`t3-target-opt${on ? " is-on" : ""}`} aria-pressed={on} onClick={() => toggle(i, option.key, step.count)}>
                  {option.entry ? (
                    <CardRenderer card={option.entry.hero} classes={option.entry.classes} equipped={Boolean(option.entry.item)} variant="art" size="sm" badge={on && step.count > 1 ? `${order + 1}` : on ? "✓" : undefined} />
                  ) : (
                    <span className="t3-target-face" style={{ background: leaderColor(option.player) }}>{option.player.nickname.slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className="t3-target-name">{option.entry ? option.entry.hero.name : option.player.nickname}</span>
                  <small>{option.entry ? `${option.player.nickname}${option.player.playerId === state.you.playerId ? " (you)" : ""}${option.entry.item ? ` · ${option.entry.item.name}` : ""}` : `${option.player.handCount} cards · ${option.player.party.length} Heroes`}</small>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

type TargetRequest = { title: string; verb: string; card: CardLike; rule: PickRule; onConfirm: (targets: BaseTargets) => void };

function TargetDialog({ state, request, onClose }: { state: BaseGameSnapshot; request: TargetRequest; onClose: () => void }) {
  const [targets, setTargets] = useState<BaseTargets | null>(null);
  useEffect(() => {
    const returnToTable = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", returnToTable);
    return () => window.removeEventListener("keydown", returnToTable);
  }, [onClose]);
  return (
    <div className="t3-pileview t3-target-dialog" role="dialog" aria-label={request.title} onClick={onClose}>
      <button className="t3-stage-min" onClick={onClose} aria-label="Hide target selection to view the table">◱ TABLE</button>
      <div className="t3-target-panel" onClick={(e) => e.stopPropagation()}>
        <div className="t3-target-card"><CardRenderer card={request.card} size="lg" /></div>
        <div className="t3-target-body">
          <h2>{request.title}</h2>
          <TargetOptions state={state} rule={request.rule} onChange={setTargets} />
          <div className="t3-target-actions">
            <button className="t3-btn t3-btn--ghost" onClick={onClose}>CANCEL</button>
            <button className="t3-btn t3-btn--continue" disabled={!targets} onClick={() => { if (targets) { request.onConfirm(targets); onClose(); } }}>{request.verb}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- inspector */

const INSPECT_DWELL_MS = 2000;

/** True once the pointer has rested on the same card for INSPECT_DWELL_MS (no key needed). */
function useInspectDwell(hovered: { card: CardLike; pinned: boolean } | null) {
  const [ready, setReady] = useState(false);
  const key = hovered ? `${hovered.card.cardId ?? hovered.card.definitionId}` : null;
  useEffect(() => {
    setReady(false);
    if (!key) return;
    const timer = window.setTimeout(() => setReady(true), INSPECT_DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [key]);
  return ready;
}

/** Full-size card after hovering one card for 2 seconds, after right-click, or on touch long-press. */
function Inspector({ hovered, ready }: { hovered: { card: CardLike; rect: DOMRect | null; pinned: boolean } | null; ready: boolean }) {
  if (!hovered || (!ready && !hovered.pinned)) return null;
  const tall = hovered.card.kind === "monster" || hovered.card.kind === "party_leader";
  const ratio = tall ? 1.713 : 1.396;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.floor(Math.max(220, Math.min(vw * 0.9, (vh * 0.9) / ratio, 720)));
  return (
    <div className="t3-inspect" aria-hidden>
      <CardRenderer card={hovered.card} size="xl" inspect={false} style={{ "--w": `${w}px` } as CSSProperties} />
    </div>
  );
}

/* ------------------------------------------------------------ table hover */

type TableHover = {
  showLeader: (playerId: string | null, rect?: DOMRect) => void;
  showStack: (heroId: string | null, rect?: DOMRect) => void;
};
const TableHoverContext = createContext<TableHover>({ showLeader: () => {}, showStack: () => {} });

/** Leader card + party / win-progress summary for one seat (hover the avatar). */
function LeaderPanel({ player, game, rect }: { player: Player; game: Game; rect: DOMRect }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Leader card + 8 stat rows: as large as fits the viewport so the text is readable (≤ 400 px wide).
  const w = Math.floor(Math.max(240, Math.min(400, (vh - 24 - 330) / 1.713)));
  const h = Math.round(w * 1.713) + 330;
  let left = rect.right + 12 + w < vw ? rect.right + 12 : rect.left - 12 - w;
  if (vw < 640) left = (vw - w) / 2;
  const top = Math.min(Math.max(8, rect.top - 60), Math.max(8, vh - h - 8));
  const missing = HERO_CLASSES.filter((c) => !player.partyClasses.includes(c));
  const isTurn = player.playerId === game.currentPlayerId;
  const rows: Array<[string, ReactNode]> = [
    ["HEROES", player.party.length],
    ["DISTINCT CLASSES", `${player.partyClasses.length}/6`],
    ["SLAIN MONSTERS", `${player.slainMonsters.length}/3`],
    [
      "MISSING",
      missing.length ? (
        <span className="t3-missing">
          {missing.map((c) => <span key={c} style={{ background: CLASS_COLOR[c] }} title={titleCase(c)}><Glyph name={c} /></span>)}
        </span>
      ) : "—",
    ],
    ["CARDS IN HAND", player.handCount],
    ["ACTION POINTS", isTurn ? game.actionPoints ?? 0 : 0],
    ["EQUIPPED ITEMS", player.party.filter((e) => e.item).length],
  ];
  return (
    <div className="t3-leader-panel" style={{ left: Math.max(8, left), top, width: w, "--panel-w": `${w}px` } as CSSProperties} aria-hidden>
      {player.leaderId && <CardRenderer card={{ definitionId: player.leaderId, kind: "party_leader", name: leaderDisplayName(player.leaderId) }} size="lg" inspect={false} style={{ "--w": `${w}px` } as CSSProperties} />}
      <dl className="t3-leader-stats">
        <div className="t3-leader-who"><b>{player.nickname}</b>{isTurn && <em>TURN</em>}</div>
        {rows.map(([k, v]) => (
          <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
        {player.protections.length > 0 && <div><dt>PROTECTED</dt><dd>{player.protections.map((p) => (p === "no_destroy" ? "no destroy" : "no steal")).join(", ")}</dd></div>}
      </dl>
    </div>
  );
}

/**
 * Hero + equipped Item: shows the Hero with the Item tucked behind; moving the
 * pointer to the middle of the Hero splits the two apart so both can be read.
 */
function HeroStack({ entry, rect, onEnter, onLeave }: { entry: Player["party"][number]; rect: DOMRect; onEnter: () => void; onLeave: () => void }) {
  const [split, setSplit] = useState(false);
  const w = 300;
  const h = Math.round(w * 1.396);
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cx = Math.min(Math.max(rect.left + rect.width / 2, w * 1.25 + 8), vw - w * 1.25 - 8);
  // Overlap only the token's edge so the pointer starts on the card border, not the centre.
  const above = rect.top - h + rect.height * 0.35;
  const top = above >= 8 ? above : Math.min(rect.bottom - rect.height * 0.35, vh - h - 8);
  if (!entry.item) return null;
  return (
    <div className={`t3-stack${split ? " is-split" : ""}`} style={{ left: cx - w / 2, top, "--stack-w": `${w}px` } as CSSProperties} onMouseEnter={onEnter} onMouseLeave={() => { setSplit(false); onLeave(); }}>
      <div className="t3-stack-item"><CardRenderer card={entry.item} size="lg" inspect={false} /></div>
      <div className="t3-stack-hero">
        <CardRenderer card={entry.hero} classes={entry.classes} equipped size="lg" inspect={false} />
        <span className="t3-stack-hot" onMouseEnter={() => setSplit(true)} aria-hidden />
      </div>
      {!split && <span className="t3-stack-hint">hover the centre to separate</span>}
    </div>
  );
}

/* ------------------------------------------------------------------- seats */

const HEX_RING: Array<[number, number]> = [[0.5, -0.866], [1, 0], [0.5, 0.866], [-0.5, 0.866], [-1, 0], [-0.5, -0.866]];

/** Leader avatar in a ring of six class hexes (lit = class present in the Party). */
function SeatCluster({ player, game, me, target }: { player: Player; game: Game; me: string; target: TargetApi }) {
  const isActive = player.playerId === game.currentPlayerId;
  const isMe = player.playerId === me;
  const targetable = target.enabled && !isMe;
  const targeted = target.value.playerId === player.playerId;
  const hover = useContext(TableHoverContext);
  const avatar = (
    <>
      <span className="t3-avatar-face" style={{ background: leaderColor(player) }}>
        <Glyph name={(player.leaderClass as HeroClass) ?? "leader"} className="t3-avatar-glyph" />
      </span>
      {targeted && <span className="t3-reticle" aria-hidden />}
    </>
  );
  return (
    <div className={`t3-cluster${isActive ? " is-active" : ""}`} title={`${player.nickname} · ✋ ${player.handCount} cards in hand · ◆ ${player.partyClasses.length}/6 classes · ☠ ${player.slainMonsters.length}/3 Monsters`}>
      <span className={`t3-nametag${isActive ? " is-active" : ""}`}>
        <span className="t3-player-name">{player.isBot ? "🤖 " : ""}{player.nickname}{isMe ? " (you)" : ""}{player.isHost ? " ★" : ""}</span>
        <span className="t3-hand-count" aria-label={`${player.handCount} cards in hand`}>🃏 {player.handCount}</span>
      </span>
      {player.leaderId && (
        <span className="t3-seat-leader t3-leader-hit" onMouseEnter={(e) => hover.showLeader(player.playerId, e.currentTarget.getBoundingClientRect())} onMouseLeave={() => hover.showLeader(null)}>
          <CardRenderer card={{ definitionId: player.leaderId, kind: "party_leader", name: leaderDisplayName(player.leaderId) }} variant="art" size="xs" className="t3-token t3-leader-card" inspect={false} />
        </span>
      )}
      <div className="t3-hexes" onMouseEnter={(e) => hover.showLeader(player.playerId, e.currentTarget.getBoundingClientRect())} onMouseLeave={() => hover.showLeader(null)}>
        {HERO_CLASSES.map((c, i) => {
          const lit = player.partyClasses.includes(c);
          return (
            <span
              key={c}
              className={`t3-hex${lit ? " is-lit" : ""}`}
              style={{ "--dx": HEX_RING[i][0], "--dy": HEX_RING[i][1], ...(lit ? { background: CLASS_COLOR[c] } : {}) } as CSSProperties}
              title={`${titleCase(c)}${lit ? " — in Party" : ""}`}
            >
              {lit && <Glyph name={c} />}
            </span>
          );
        })}
        {targetable ? (
          <button type="button" className={`t3-avatar is-targetable${targeted ? " is-targeted" : ""}`} onClick={() => target.togglePlayer(player.playerId)} aria-pressed={targeted} aria-label={`Target ${player.nickname}`}>
            {avatar}
          </button>
        ) : (
          <span className="t3-avatar" title={player.leaderId ? leaderDisplayName(player.leaderId) : "No Leader"}>{avatar}</span>
        )}
        {/* Anchored to the hex ring, not the cluster: a long nickname must not push the Monster slots around. */}
        <SlainHexes monsters={player.slainMonsters} />
      </div>
      {player.protections.length > 0 && (
        <span className="t3-protect">{player.protections.map((p) => (p === "no_destroy" ? "NO DESTROY" : "NO STEAL")).join(" · ")}</span>
      )}
    </div>
  );
}

/** Three Monster slots per seat (3 slain = win); a slain Monster pops into its hex. */
function SlainHexes({ monsters }: { monsters: BaseCardView[] }) {
  return (
    <span className="t3-slain" aria-label={`Slain Monsters ${monsters.length}/3`}>
      {[0, 1, 2].map((i) => {
        const monster = monsters[i];
        return monster ? (
          <CardRenderer key={monster.cardId} card={monster} variant="art" size="xs" className="t3-slain-hex is-filled" ariaLabel={`Slain: ${monster.name}`} />
        ) : (
          <span key={`empty-${i}`} className="t3-slain-hex" aria-hidden>☠</span>
        );
      })}
    </span>
  );
}

function PartyTokens({ player, target, heroAction, vertical }: { player: Player; target: TargetApi; heroAction?: (entry: Player["party"][number]) => ReactNode; vertical?: boolean }) {
  const heroIds = target.value.heroInstanceIds ?? [];
  const hover = useContext(TableHoverContext);
  return (
    <div className={`t3-party${vertical ? " is-vertical" : ""}`}>
      {player.party.map((entry) => {
        const order = heroIds.indexOf(entry.hero.cardId);
        return (
          <div
            key={entry.hero.cardId}
            className={`t3-hero${entry.item ? " has-item" : ""}`}
            onMouseEnter={entry.item ? (e) => hover.showStack(entry.hero.cardId, e.currentTarget.getBoundingClientRect()) : undefined}
            onMouseLeave={entry.item ? () => hover.showStack(null) : undefined}
          >
            <CardRenderer
              card={entry.hero}
              inspect={!entry.item}
              variant="art"
              size="xs"
              className="t3-token"
              classes={entry.classes}
              equipped={Boolean(entry.item)}
              selected={order >= 0}
              badge={order >= 0 ? `T${order + 1}` : undefined}
              onClick={target.enabled ? () => target.toggleHero(entry.hero.cardId) : undefined}
              ariaLabel={`${entry.hero.name} (${entry.classes.join("/")})${entry.item ? ` with ${entry.item.name}` : ""}`}
            />
            {entry.item && <CardRenderer card={entry.item} variant="art" size="xs" className="t3-token t3-token--item" inspect={false} />}
            {heroAction?.(entry)}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- reaction UI */

const chainKey = (chain: BaseChainView) =>
  chain.step === "choice" ? chain.choiceId : chain.step === "immediate_roll_choice" ? `imm-${chain.deadlineAt}` : chain.windowId;

const STATUS_LABEL: Record<string, string> = { pending: "THINKING", passed: "SKIPPED", played: "PLAYED" };

function Roster({ state, responders }: { state: BaseGameSnapshot; responders: Record<string, string> }) {
  return (
    <aside className="t3-roster" aria-label="Reaction roster">
      {state.players.filter((p) => p.playerId in responders).map((p) => (
        <div key={p.playerId} className={`t3-roster-row is-${responders[p.playerId]}`}>
          <span className="t3-roster-face" style={{ background: leaderColor(p) }}>{p.nickname.slice(0, 1).toUpperCase()}</span>
          <span className="t3-roster-name">{p.nickname}{p.playerId === state.you.playerId ? " (you)" : ""}</span>
          <em>{responders[p.playerId] === "pending" ? "⧗ " : "✓ "}{STATUS_LABEL[responders[p.playerId]] ?? responders[p.playerId]}</em>
        </div>
      ))}
    </aside>
  );
}

/** 0 = dice tumbling · 1 = dice landed · 2 = totals revealed. Live windows animate; the result screen shows the final state. */
type Reveal = 0 | 1 | 2;
const RevealContext = createContext<Reveal>(2);

function useRevealPhase(): Reveal {
  const [phase, setPhase] = useState<Reveal>(0);
  useEffect(() => {
    const landed = window.setTimeout(() => setPhase(1), DICE_ROLL_MS);
    const shown = window.setTimeout(() => setPhase(2), DICE_ROLL_MS + TOTAL_REVEAL_MS);
    return () => { window.clearTimeout(landed); window.clearTimeout(shown); };
  }, []);
  return phase;
}

function Die({ value, tone, tilt }: { value: number; tone: string; tilt: number }) {
  const phase = useContext(RevealContext);
  const rolling = phase === 0;
  const [face, setFace] = useState(value);
  useEffect(() => {
    if (!rolling) { setFace(value); return; }
    const id = window.setInterval(() => setFace(1 + Math.floor(Math.random() * 6)), 120);
    return () => window.clearInterval(id);
  }, [rolling, value]);
  const pips: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return (
    <span className={`t3-die t3-die--${tone}${rolling ? " is-rolling" : phase === 1 ? " is-landed" : ""}`} style={{ "--tilt": `${tilt}deg`, "--seed": (value * 37) % 11 } as CSSProperties} aria-label={rolling ? "die rolling" : `die ${value}`}>
      {Array.from({ length: 9 }, (_, i) => <i key={i} className={pips[face]?.includes(i) ? "on" : ""} />)}
    </span>
  );
}

/** Big seconds number + thin smooth bar, keyed by the server deadline. */
function Countdown({ deadlineAt, serverNow, totalMs, big }: { deadlineAt: number; serverNow: number; totalMs: number; big?: boolean }) {
  const [initialRemaining] = useState(() => Math.max(0, deadlineAt - serverNow));
  const remaining = Math.max(0, deadlineAt - serverNow);
  const seconds = Math.ceil(remaining / 1000);
  const from = Math.min(1, initialRemaining / Math.max(1, totalMs));
  const live = Math.min(1, remaining / Math.max(1, totalMs));
  return (
    <div className={`t3-countdown${big ? " is-big" : ""}${seconds <= 5 ? " is-urgent" : ""}`} role="timer" aria-label={`${seconds} seconds left`}>
      <b>{seconds}</b>
      <span className="t3-countdown-track">
        <span className="t3-countdown-fill" style={{ "--from": from, transform: `scaleX(${live})`, animationDuration: `${initialRemaining}ms` } as CSSProperties} />
      </span>
    </div>
  );
}

function Stat({ label, value, tone, rolled }: { label: string; value: ReactNode; tone?: string; rolled?: boolean }) {
  const phase = useContext(RevealContext);
  const hidden = Boolean(rolled) && phase < 2;
  return (
    <div className={`t3-stat${tone && !hidden ? ` t3-stat--${tone}` : ""}${hidden ? " is-hidden" : ""}`}>
      <small>{label}</small>
      <strong>{hidden ? "?" : value}</strong>
    </div>
  );
}

/* ------------------------------------------------------------ roll board */

const OUTCOME_WORD: Record<BaseRollOutcome, { word: string; tone: string }> = {
  success: { word: "SUCCESS!", tone: "good" },
  fail: { word: "FAIL", tone: "bad" },
  slay: { word: "SUCCESS!", tone: "good" },
  penalty: { word: "FAIL", tone: "bad" },
  none: { word: "NO EFFECT", tone: "flat" },
  challenge_succeeded: { word: "", tone: "good" },
  challenge_failed: { word: "", tone: "good" },
};

/**
 * Shared presentation of a roll for the live Modifier window and the result
 * screen. Numbers come straight from the server's roll view; the outcome (if
 * any) is the server's `lastRoll.outcome` — the client never decides it.
 */
function rollParts(state: BaseGameSnapshot, roll: BaseRollView, result?: BaseRollResultView) {
  const name = (playerId: string) => state.players.find((p) => p.playerId === playerId)?.nickname ?? playerId;
  const hero = findHero(state, roll.heroInstanceId);
  const liveMonster = roll.monsterInstanceId ? state.game.faceUpMonsters.find((m) => m.cardId === roll.monsterInstanceId) : undefined;
  const subject: BaseCardView | undefined = result?.card ?? roll.attemptCard ?? hero?.hero ?? liveMonster;
  const monsterData = subject?.kind === "monster" ? cardData(subject.definitionId) : undefined;
  const featured = subject ? (
    <CardRenderer card={subject} classes={hero && subject.cardId === hero.hero.cardId ? hero.classes : undefined} equipped={Boolean(hero?.item && subject.cardId === hero.hero.cardId)} size="xl" />
  ) : null;
  const diceSum = (d: number[]) => d[0] + d[1];
  const chips = (filter?: "challenger" | "defender") => (
    <div className="t3-modchips">
      {roll.modifiers.filter((m) => !filter || (m.side ?? "defender") === filter).map((m) => (
        <span key={m.cardId} className={`t3-modchip ${m.value >= 0 ? "is-pos" : "is-neg"}`}>{name(m.playerId)} {signed(m.value)}</span>
      ))}
      {roll.passives.filter((p) => !filter || (p.side ?? "defender") === filter).map((p, i) => (
        <span key={`${p.source}-${i}`} className={`t3-modchip ${p.value >= 0 ? "is-pos" : "is-neg"}`}>{leaderPassiveLabel(p.label)} {signed(p.value)}</span>
      ))}
    </div>
  );
  if (roll.kind === "challenge") {
    const cMod = roll.challengerTotal! - diceSum(roll.challengerDice!);
    const dMod = roll.total - diceSum(roll.dice);
    const winnerId = result ? (result.outcome === "challenge_succeeded" ? roll.challengerPlayerId! : roll.rollerPlayerId) : null;
    const center = (
      <div className="t3-versus-wrap">
        <div className="t3-versus">
          <div className={`t3-side t3-side--a${winnerId === roll.rollerPlayerId ? " is-winner" : winnerId ? " is-loser" : ""}`}>
            <h3>{name(roll.rollerPlayerId)}</h3>
            <div className="t3-stats-row">
              <Stat rolled label="ROLLED" value={diceSum(roll.dice)} />
              <Stat rolled label="MODIFIER" value={signed(dMod)} tone={dMod > 0 ? "pos" : dMod < 0 ? "neg" : "zero"} />
              <Stat rolled label="TOTAL" value={roll.total} />
            </div>
            {chips("defender")}
            <div className="t3-dice">{roll.dice.map((d, i) => <Die key={i} value={d} tone="green" tilt={i ? 14 : -10} />)}</div>
          </div>
          <span className="t3-vs">VS</span>
          <div className={`t3-side t3-side--b${winnerId === roll.challengerPlayerId ? " is-winner" : winnerId ? " is-loser" : ""}`}>
            <h3>{name(roll.challengerPlayerId!)}</h3>
            <div className="t3-stats-row">
              <Stat rolled label="ROLLED" value={diceSum(roll.challengerDice!)} />
              <Stat rolled label="MODIFIER" value={signed(cMod)} tone={cMod > 0 ? "pos" : cMod < 0 ? "neg" : "zero"} />
              <Stat rolled label="TOTAL" value={roll.challengerTotal} />
            </div>
            {chips("challenger")}
            <div className="t3-dice">{roll.challengerDice!.map((d, i) => <Die key={i} value={d} tone="orange" tilt={i ? -16 : 9} />)}</div>
          </div>
        </div>
        {winnerId && <p className="t3-winner-banner">{name(winnerId)} WINS!</p>}
        {!result && <p className="t3-muted t3-tie-note">Ties go to the challenger.</p>}
      </div>
    );
    return { tone: "versus", headline: `Challenged by ${name(roll.challengerPlayerId!)}!`, kicker: "THE DICE GODS WILL DECIDE", featured, center, outcome: null as null | { word: string; tone: string } };
  }
  const mod = roll.total - diceSum(roll.dice);
  const what = subject?.name ?? "a roll";
  const center = (
    <div className="t3-rollboard">
      <div className="t3-stats-row">
        <Stat rolled label="ROLLED" value={diceSum(roll.dice)} />
        <Stat rolled label="MODIFIER" value={signed(mod)} tone={mod > 0 ? "pos" : mod < 0 ? "neg" : "zero"} />
        <Stat rolled label="TOTAL" value={roll.total} />
        {roll.threshold !== undefined && <Stat label="REQUIRED" value={roll.threshold} tone="req" />}
        {monsterData?.kind === "monster" && (
          <Stat label="REQUIRED" value={`${monsterData.slay.op === "gte" ? "≥" : "≤"}${monsterData.slay.value}`} tone="req" />
        )}
      </div>
      {chips()}
      {monsterData?.kind === "monster" && (
        <p className="t3-attack-note">
          <span className="pos">SLAY {rollText(monsterData.slay)}</span> · <span className="neg">PENALTY {rollText(monsterData.penaltyRange)}: {monsterData.penaltyText}</span>
        </p>
      )}
      {result && roll.kind === "attack" && subject && (
        <p className="t3-result-line">
          {result.outcome === "slay" ? `${name(roll.rollerPlayerId)} slayed ${subject.name}!` : result.outcome === "penalty" ? `${name(roll.rollerPlayerId)} suffers the penalty: ${monsterData?.kind === "monster" ? monsterData.penaltyText : ""}` : "Nothing happens."}
        </p>
      )}
      {result && roll.kind === "hero_effect" && subject && (
        <p className="t3-result-line">
          {result.outcome === "success" ? `${name(roll.rollerPlayerId)} succeeded with ${subject.name} (${roll.total}/${roll.threshold}).` : `${name(roll.rollerPlayerId)} failed ${subject.name}'s roll (${roll.total}/${roll.threshold}).`}
        </p>
      )}
      <div className="t3-dice">{roll.dice.map((d, i) => <Die key={i} value={d} tone={roll.kind === "attack" ? "blue" : "yellow"} tilt={i ? 12 : -18} />)}</div>
    </div>
  );
  return {
    tone: "roll",
    headline: roll.kind === "attack" ? `${name(roll.rollerPlayerId)} is attacking ${what}` : `${name(roll.rollerPlayerId)} is using ${what}`,
    kicker: roll.kind === "attack" ? "MONSTER ATTACK" : "HERO ABILITY",
    featured,
    center,
    outcome: result ? OUTCOME_WORD[result.outcome] : null,
  };
}

/** Result screen for the last resolved roll (server outcome), shown briefly. */
function ResultStage({ state, result, onClose }: { state: BaseGameSnapshot; result: BaseRollResultView; onClose: () => void }) {
  const parts = rollParts(state, result.roll, result);
  return (
    <div className={`t3-stage t3-stage--${parts.tone} t3-stage--result`} role="dialog" aria-label="Roll result">
      <header className="t3-stage-head" aria-live="polite">
        <h2 className={parts.tone === "versus" ? "t3-dim" : ""}>{parts.headline}</h2>
        {parts.tone === "versus" ? <span className="t3-gods">{parts.kicker}</span> : <span className="t3-stage-kicker">{parts.kicker}</span>}
        {parts.outcome && <strong className={`t3-outcome t3-outcome--${parts.outcome.tone}`}>{parts.outcome.word}</strong>}
      </header>
      {parts.featured && <div className="t3-stage-feature">{parts.featured}</div>}
      <div className="t3-stage-center">{parts.center}</div>
      <div className="t3-stage-primary">
        <button className="t3-btn t3-btn--continue" onClick={onClose}>CONTINUE</button>
      </div>
    </div>
  );
}

function ReactionStage({ state, send, pending, serverNow, askTargets }: { state: BaseGameSnapshot; send: Send; pending: boolean; serverNow: number; askTargets: (request: TargetRequest) => void }) {
  const [rollTargets, setRollTargets] = useState<BaseTargets | null>(null);
  const chain = state.game.chain!;
  const me = state.you.playerId;
  const settings = state.game.settings;
  const [hornBonus, setHornBonus] = useState<0 | 1 | -1>(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [focusCard, setFocusCard] = useState<string | null>(null);
  const [modifierValue, setModifierValue] = useState<number | null>(null);
  const phase = useRevealPhase();
  const needsMe =
    chain.step === "challenge_window" || chain.step === "modifier_window"
      ? chain.responders[me] === "pending"
      : chain.step === "immediate_roll_choice"
        ? chain.actorPlayerId === me
        : chain.playerId === me;
  const [collapsed, setCollapsed] = useState(!needsMe);
  const openTargetDialog = (request: TargetRequest) => {
    setCollapsed(true);
    askTargets(request);
  };
  useEffect(() => {
    const returnToTable = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCollapsed(true);
    };
    window.addEventListener("keydown", returnToTable);
    return () => window.removeEventListener("keydown", returnToTable);
  }, []);
  const name = (playerId: string) => state.players.find((p) => p.playerId === playerId)?.nickname ?? playerId;
  const totalMs = (chain.step === "challenge_window" || chain.step === "modifier_window" ? settings.reactionSeconds : settings.choiceSeconds) * 1000;
  const countdown = (big: boolean) => <Countdown key={chain.deadlineAt} deadlineAt={chain.deadlineAt} serverNow={serverNow} totalMs={totalMs} big={big} />;

  let headline = "";
  let kicker = "";
  let tone = "choice";
  let featured: ReactNode = null;
  let center: ReactNode = null;
  let roster: ReactNode = null;
  let tray: ReactNode = null;
  let trayCardCount = 0;
  let primary: ReactNode = null;

  if (chain.step === "challenge_window") {
    const mine = chain.responders[me];
    tone = "challenge";
    headline = `${name(chain.actorPlayerId)} is playing ${chain.pendingCard.name}`;
    kicker = "CHALLENGE?";
    featured = <CardRenderer card={chain.pendingCard} size="xl" />;
    roster = <Roster state={state} responders={chain.responders} />;
    const cards = state.yourHand.filter((c) => c.kind === "challenge");
    if (mine === "pending") {
      trayCardCount = cards.length;
      tray = cards.map((card) => (
        <div key={card.cardId} className="t3-tray-card">
          <CardRenderer
            card={card}
            size="md"
            disabled={pending}
            onClick={() => send("REACT_CHALLENGE", { windowId: chain.windowId, cardInstanceId: card.cardId })}
            ariaLabel={`${card.name} — play Challenge`}
          />
          <div className="t3-tray-actions">
            <button className="t3-btn t3-btn--red" disabled={pending} onClick={() => send("REACT_CHALLENGE", { windowId: chain.windowId, cardInstanceId: card.cardId })}>CHALLENGE</button>
          </div>
        </div>
      ));
      primary = <button className="t3-btn t3-btn--continue" disabled={pending} onClick={() => { setCollapsed(true); send("REACT_PASS", { windowId: chain.windowId }); }}>SKIP</button>;
    }
  } else if (chain.step === "modifier_window") {
    const roll = chain.roll;
    const mine = chain.responders[me];
    const hasHorn = state.players.find((p) => p.playerId === me)?.leaderId === "hts.base.v1.party-leader.the-protecting-horn";
    roster = <Roster state={state} responders={chain.responders} />;
    const parts = rollParts(state, roll);
    tone = parts.tone;
    headline = parts.headline;
    kicker = parts.kicker;
    featured = parts.featured;
    center = parts.center;
    const modifierCards = state.yourHand.filter((c) => c.kind === "modifier");
    if (mine === "pending") {
      trayCardCount = modifierCards.length;
      tray = (
        <>
          {hasHorn && (
            <div className="t3-tray-options">
              <div className="t3-seg" role="group" aria-label="Protecting Horn bonus">
                <span>Horn</span>
                {([0, 1, -1] as const).map((v) => (
                  <button key={v} className={hornBonus === v ? "is-on" : ""} aria-pressed={hornBonus === v} onClick={() => setHornBonus(v)}>{v === 0 ? "none" : signed(v)}</button>
                ))}
              </div>
            </div>
          )}
          {modifierCards.map((card) => {
            const options = card.modifierOptions ?? [];
            const singleValue = options.length === 1 ? options[0] : undefined;
            const play = (value: number, chosenSide: "challenger" | "defender" = "defender") => send("REACT_MODIFIER", {
              windowId: chain.windowId,
              cardInstanceId: card.cardId,
              value,
              ...(roll.kind === "challenge" ? { side: chosenSide } : {}),
              ...(hornBonus ? { leaderBonus: hornBonus } : {}),
            });
            return (
            <div key={card.cardId} className={`t3-tray-card${focusCard === card.cardId ? " is-up" : ""}`}>
              <CardRenderer
                card={card}
                size="md"
                disabled={pending}
                onClick={() => {
                  if (singleValue !== undefined && roll.kind !== "challenge") play(singleValue);
                  else if (singleValue !== undefined) {
                    setFocusCard(focusCard === card.cardId ? null : card.cardId);
                    setModifierValue(singleValue);
                  }
                  else {
                    setFocusCard(focusCard === card.cardId ? null : card.cardId);
                    setModifierValue(null);
                  }
                }}
                selected={focusCard === card.cardId}
                ariaLabel={singleValue === undefined ? `${card.name} — choose modifier value` : roll.kind === "challenge" ? `${card.name} — choose who receives ${signed(singleValue)}` : `${card.name} — play ${signed(singleValue)}`}
              />
              <div className="t3-tray-actions">
                {singleValue === undefined && focusCard === card.cardId && modifierValue === null && <span className="t3-tray-step">1 · CHOOSE + / −</span>}
                {singleValue === undefined && focusCard === card.cardId && modifierValue === null && options.map((value) => (
                  <button
                    key={`${card.cardId}${value}`}
                    className={`t3-btn ${value >= 0 ? "t3-btn--green" : "t3-btn--red"}`}
                    disabled={pending}
                    aria-label={`${card.name}: ${signed(value)}`}
                    onClick={() => roll.kind === "challenge" ? setModifierValue(value) : play(value)}
                  >
                    {signed(value)}
                  </button>
                ))}
                {focusCard === card.cardId && modifierValue !== null && roll.kind === "challenge" && (
                  <div className="t3-seg" role="group" aria-label="Apply modifier to">
                    <span>2 · APPLY {signed(modifierValue)} TO</span>
                    {(["defender", "challenger"] as const).map((chosenSide) => (
                      <button key={chosenSide} onClick={() => play(modifierValue, chosenSide)}>
                        {chosenSide === "defender" ? name(roll.rollerPlayerId) : name(roll.challengerPlayerId!)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </>
      );
      primary = <button className="t3-btn t3-btn--continue" disabled={pending} onClick={() => send("REACT_PASS", { windowId: chain.windowId })}>SKIP{modifierCards.length ? ` (${modifierCards.length})` : ""}</button>;
    }
  } else if (chain.step === "immediate_roll_choice") {
    tone = "roll";
    headline = `${chain.hero.name} entered ${name(chain.actorPlayerId)}'s Party`;
    kicker = "ROLL ITS EFFECT?";
    featured = <CardRenderer card={chain.hero} size="xl" />;
    const rule = ruleFor(chain.hero);
    const threshold = (() => { const d = cardData(chain.hero.definitionId); return d?.kind === "hero" ? d.rollThreshold : undefined; })();
    center =
      chain.actorPlayerId === me ? (
        <div className="t3-stage-copy">
          <p>Roll the effect now (free){threshold ? <> — needs <b>{threshold}+</b></> : null}, or skip.</p>
          {rule && <TargetOptions state={state} rule={rule} onChange={setRollTargets} />}
        </div>
      ) : <p className="t3-stage-copy">Waiting for {name(chain.actorPlayerId)}…</p>;
    if (chain.actorPlayerId === me) {
      primary = (
        <>
          <button className="t3-btn t3-btn--ghost" disabled={pending} onClick={() => send("IMMEDIATE_ROLL", { choice: "skip" })}>SKIP</button>
          <button className="t3-btn t3-btn--continue" disabled={pending || (rule !== null && !rollTargets)} onClick={() => send("IMMEDIATE_ROLL", { choice: "roll", ...(rule ? { targets: rollTargets } : {}) })}>🎲 ROLL</button>
        </>
      );
    }
  } else {
    const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
    const range = chain.kind !== "confirm" ? ` · pick ${chain.min === chain.max ? chain.max : `${chain.min}–${chain.max}`}` : "";
    tone = "choice";
    headline = `${name(chain.playerId)}: ${chain.prompt}`;
    kicker = chain.kind === "order_top" ? "ORDER THE CARDS" : chain.kind === "view_hand" ? "LOOK AT HAND" : chain.kind === "confirm" ? "CONFIRM" : "CHOOSE";
    const mineChoice = chain.playerId === me;
    center = !mineChoice ? (
      <p className="t3-stage-copy">Waiting for {name(chain.playerId)} to choose…</p>
    ) : chain.kind === "confirm" ? null : chain.options ? (
      <div className="t3-choice">
        <p className="t3-muted">
          {chain.kind === "order_top" ? "Click in order — #1 goes on top." : `Click cards to select${range}.`} Timeout = skip. Hover a card for 2s or right-click for full text.
          {chain.kind === "play_card" && <> You will choose targets after confirming.</>}
        </p>
        <div className="t3-choice-row">
          {chain.options.map((card) => {
            const index = picked.indexOf(card.cardId);
            return (
              <div key={card.cardId} className="t3-choice-item">
                <CardRenderer
                  card={card}
                  variant="art"
                  size="sm"
                  selected={index >= 0}
                  badge={index >= 0 ? (chain.kind === "order_top" ? `#${index + 1}` : "✓") : undefined}
                  onClick={chain.kind !== "view_hand" ? () => toggle(card.cardId) : undefined}
                />
                <small>{card.name}</small>
              </div>
            );
          })}
        </div>
      </div>
    ) : null;
    if (mineChoice && chain.kind === "confirm") {
      primary = (
        <>
          <button className="t3-btn t3-btn--ghost" disabled={pending} onClick={() => send("RESOLVE_CHOICE", { choiceId: chain.choiceId, cardInstanceIds: [], accept: false })}>NO</button>
          <button className="t3-btn t3-btn--continue" disabled={pending} onClick={() => send("RESOLVE_CHOICE", { choiceId: chain.choiceId, cardInstanceIds: [], accept: true })}>YES</button>
        </>
      );
    } else if (mineChoice && chain.options) {
      primary = (
        <button
          className="t3-btn t3-btn--continue"
          disabled={pending}
          onClick={() => {
            const card = chain.kind === "play_card" && picked.length ? chain.options?.find((c) => c.cardId === picked[0]) : undefined;
            // A Hero played from a choice enters first; its own ability asks for targets (or is skipped) afterwards.
            const rule = card && card.kind !== "hero" ? ruleFor(card) : null;
            if (card && rule) {
              const ids = picked;
              openTargetDialog({ title: `Targets for ${card.name}`, verb: "PLAY", card, rule, onConfirm: (t) => send("RESOLVE_CHOICE", { choiceId: chain.choiceId, cardInstanceIds: ids, targets: t }) });
            } else {
              send("RESOLVE_CHOICE", { choiceId: chain.choiceId, cardInstanceIds: picked, ...(chain.kind === "play_card" && picked.length ? { targets: {} } : {}) });
            }
            setPicked([]);
          }}
        >
          {chain.kind === "view_hand" ? "CLOSE" : picked.length === 0 && chain.min === 0 ? "SKIP" : `CONFIRM (${picked.length})`}
        </button>
      );
    }
  }

  if (collapsed) {
    return (
      <div className={`t3-pill-dock t3-pill-dock--${tone}${needsMe ? " needs-me" : ""}`} role="status" aria-live="polite">
        <b>{kicker}</b>
        <span>{headline}</span>
        {countdown(false)}
        <button className="t3-btn" onClick={() => setCollapsed(false)}>{needsMe ? "RESPOND" : "VIEW"}</button>
      </div>
    );
  }

  return (
    <RevealContext.Provider value={phase}>
    <div className={`t3-stage t3-stage--${tone}`} role="dialog" aria-label={kicker}>
      <button className="t3-stage-min" onClick={() => setCollapsed(true)} aria-label="Hide to view the table">◱ TABLE</button>
      <header className="t3-stage-head" aria-live="polite">
        <h2 className={tone === "versus" ? "t3-dim" : ""}>{headline}</h2>
        {tone === "versus" ? <span className="t3-gods">{kicker}</span> : <span className="t3-stage-kicker">{kicker}</span>}
        {countdown(tone !== "versus")}
      </header>
      {featured && <div className="t3-stage-feature">{featured}</div>}
      <div className="t3-stage-center">{center}</div>
      {roster}
      {tray && <div className={`t3-stage-tray${trayCardCount >= 4 ? " is-dense" : ""}`} style={{ "--tray-count": Math.max(1, trayCardCount) } as CSSProperties}>{tray}</div>}
      {primary && <div className="t3-stage-primary">{primary}</div>}
    </div>
    </RevealContext.Provider>
  );
}

/* --------------------------------------------------------------- popups */

function Popup({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="t3-popup-back" onClick={onClose}>
      <section className={`t3-popup${wide ? " is-wide" : ""}`} role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <header><b>{title}</b><button className="t3-icon-btn" onClick={onClose} aria-label="Close">✕</button></header>
        {children}
      </section>
    </div>
  );
}

type Toast = { seq: number; text: string };

/** How long the latest action stays on screen; the last 0.6s of it is the CSS fade-away. */
const TOAST_MS = 5000;

/** Only the most recent action is shown (next to the LOG button); it fades away after TOAST_MS. */
/** "passive của Leader: The Charismatic Song" -> "Leader: The Charismatic Song" (the chip stays on one short line). */
function leaderPassiveLabel(label: string): string {
  return label.replace(/^\s*passive\s+(?:của|of)\s+/i, "");
}

/** True for ~1.8 s each time the turn passes to me (not on a mid-turn reload). */
function useYourTurn(currentPlayerId: string | null, me: string): boolean {
  const [show, setShow] = useState(false);
  const prev = useRef(currentPlayerId);
  useEffect(() => {
    const was = prev.current;
    prev.current = currentPlayerId;
    if (currentPlayerId !== me) { setShow(false); return; }
    if (was === me) return;
    setShow(true);
    const timer = window.setTimeout(() => setShow(false), 1800);
    return () => window.clearTimeout(timer);
  }, [currentPlayerId, me]);
  return show;
}

function useLogToasts(log: Game["log"]) {
  const lastSeq = useRef<number>(log.length ? log[log.length - 1].seq : 0);
  const timer = useRef<number | undefined>(undefined);
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const fresh = log.filter((entry) => entry.seq > lastSeq.current);
    if (!fresh.length) return;
    const latest = fresh[fresh.length - 1];
    lastSeq.current = latest.seq;
    setToasts([{ seq: latest.seq, text: latest.text }]);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToasts([]), TOAST_MS);
  }, [log]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [toasts, () => setToasts([])] as const;
}

/** Discard pile: full cards in a horizontal strip over the blurred table, newest first. */
function DiscardView({ pile, count, onClose }: { pile: BaseCardView[]; count: number; onClose: () => void }) {
  const strip = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const scroll = (dir: number) => strip.current?.scrollBy({ left: dir * strip.current.clientWidth * 0.8, behavior: "smooth" });
  return (
    <div className="t3-pileview" role="dialog" aria-label={`Discard pile, ${count} cards`} onClick={onClose}>
      <h2>DISCARD PILE ({count})</h2>
      <div className="t3-pileview-row" onClick={(e) => e.stopPropagation()}>
        <button className="t3-pileview-nav" onClick={() => scroll(-1)} aria-label="Scroll left">◀</button>
        <div className="t3-pileview-strip" ref={strip}>
          {[...pile].reverse().map((card) => <CardRenderer key={card.cardId} card={card} size="lg" />)}
          {pile.length === 0 && <p className="t3-muted">The discard pile is empty.</p>}
        </div>
        <button className="t3-pileview-nav" onClick={() => scroll(1)} aria-label="Scroll right">▶</button>
      </div>
      <p className="t3-pileview-hint">Newest first · hover a card for 2s or right-click to enlarge · click outside or <kbd>Esc</kbd> to close</p>
    </div>
  );
}

/* --------------------------------------------------------------------- hand */

function Hand({ hand, canPlay, partyFull, onPlay }: { hand: BaseCardView[]; canPlay: boolean; partyFull: boolean; onPlay: (card: BaseCardView) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const n = hand.length;
  const handShift = -Math.min(0.78, 0.2 + Math.max(0, n - 5) * 0.055);
  return (
    <div className="t3-hand" aria-label="Your hand" style={{ "--n": n, "--hand-shift": handShift } as CSSProperties}>
      {hand.map((card, i) => {
        const offset = i - (n - 1) / 2;
        const playable = card.kind === "hero" || card.kind === "item" || card.kind === "cursed_item" || card.kind === "magic";
        const isSel = selected === card.cardId;
        return (
          <div
            key={card.cardId}
            className={`t3-hand-card${isSel ? " is-up" : ""}`}
            style={{ "--rot": `${offset * Math.min(4, 24 / Math.max(1, n))}deg`, zIndex: isSel ? 60 : i + 1 } as CSSProperties}
          >
            <CardRenderer card={card} size="md" selected={isSel} onClick={() => setSelected(isSel ? null : card.cardId)} />
            {isSel && (
              <div className="t3-hand-actions">
                {playable ? (
                  <button className="t3-btn t3-btn--continue" disabled={!canPlay || (card.kind === "hero" && partyFull)} title={card.kind === "hero" && partyFull ? "Party is limited to 6 Heroes" : undefined} onClick={() => { onPlay(card); setSelected(null); }}>PLAY · 1 AP</button>
                ) : (
                  <span className="t3-chip">{card.kind === "modifier" ? "Used on a roll" : "Used to challenge"}</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------- lobby */

const TURN_CHOICES = [30, 60, 90] as const;

/** Waiting room: seats (humans + bots), Leader pick for everyone, host settings, start. */
function LobbyStage({ state, send, pending }: { state: BaseGameSnapshot; send: Send; pending: boolean }) {
  const game = state.game;
  const me = state.you.playerId;
  const host = state.you.isHost;
  const mine = state.players.find((p) => p.playerId === me);
  const ownerOf = (leaderId: string) => state.players.find((p) => p.leaderId === leaderId);
  const missing = state.players.filter((p) => !p.leaderId);
  const notReady = state.players.filter((p) => !p.isHost && !p.ready);
  const shadowBanned = state.players.length === 2;
  const blockedShadow = shadowBanned && state.players.some((p) => p.leaderId?.endsWith("the-shadow-claw"));
  const canStart = host && state.players.length >= 2 && missing.length === 0 && notReady.length === 0 && !blockedShadow;
  const hint = state.players.length < 2
    ? "Need at least 2 players — invite a friend or add a bot."
    : missing.length
      ? `Waiting for ${missing.map((p) => p.nickname).join(", ")} to pick a Leader.`
      : blockedShadow
        ? "The Shadow Claw cannot be used in a 2-player game."
        : notReady.length
          ? `Waiting for ${notReady.map((p) => p.nickname).join(", ")} to get ready.`
        : host ? "Everyone is ready." : "Waiting for the host to start.";
  return (
    <section className="t3-lobby" aria-label="Lobby">
      <header className="t3-lobby-head">
        <div>
          <p className="t3-kicker">ROOM CODE — SHARE TO INVITE</p>
          <strong className="t3-roomcode">{state.roomCode}</strong>
        </div>
        <div className="t3-lobby-settings">
          <span className="t3-kicker">TURN TIMER</span>
          <div className="t3-seg t3-seg--light" role="group" aria-label="Turn timer">
            {TURN_CHOICES.map((seconds) => (
              <button
                key={seconds}
                className={game.settings.turnSeconds === seconds ? "is-on" : ""}
                aria-pressed={game.settings.turnSeconds === seconds}
                disabled={!host || pending}
                onClick={() => send("CONFIGURE_GAME", { turnSeconds: seconds })}
              >
                {seconds}s
              </button>
            ))}
          </div>
          <small>{host ? "Using AP resets the timer; time out = turn passes." : "Set by the host."}</small>
        </div>
      </header>

      <div className="t3-lobby-body">
        <aside className="t3-lobby-seats" aria-label="Players">
          <h3>PLAYERS {state.players.length}/6</h3>
          {state.players.map((p) => (
            <div key={p.playerId} className={`t3-lobby-seat${p.playerId === me ? " is-me" : ""}`}>
              <span className="t3-roster-face" style={{ background: leaderColor(p) }}>{p.isBot ? "🤖" : p.nickname.slice(0, 1).toUpperCase()}</span>
              <span className="t3-lobby-seat-name">
                <b>{p.nickname}{p.playerId === me ? " (you)" : ""}</b>
                <small>
                  {p.isHost && <em className="t3-tag">HOST</em>}
                  {p.isBot && <em className="t3-tag t3-tag--bot">BOT</em>}
                  {p.ready && <em className="t3-tag">READY</em>}
                  {p.leaderId ? leaderDisplayName(p.leaderId) : <i>choosing a Leader…</i>}
                </small>
              </span>
              {host && p.isBot && (
                <button className="t3-icon-btn" disabled={pending} onClick={() => send("REMOVE_BOT", { playerId: p.playerId })} aria-label={`Remove ${p.nickname}`}>✕</button>
              )}
            </div>
          ))}
          {host && state.players.length < 6 && (
            <button className="t3-lobby-add" disabled={pending} onClick={() => send("ADD_BOT", {})}>+ ADD BOT</button>
          )}
          {Array.from({ length: Math.max(0, 6 - state.players.length - (host ? 1 : 0)) }, (_, i) => <div key={`e${i}`} className="t3-lobby-seat is-empty">open seat</div>)}
        </aside>

        <div className="t3-lobby-leaders">
          <h3>CHOOSE YOUR PARTY LEADER {mine?.leaderId ? <small>— you picked {leaderDisplayName(mine.leaderId)} (click another to change)</small> : null}</h3>
          <div className="t3-leaders">
            {game.leaderPool.map((id) => {
              const owner = ownerOf(id);
              const isMine = owner?.playerId === me;
              const banned = shadowBanned && id.endsWith("the-shadow-claw");
              return (
                <div key={id} className="t3-leader-slot">
                  <CardRenderer
                    card={{ definitionId: id, kind: "party_leader", name: leaderDisplayName(id) }}
                    size="lg"
                    selected={isMine}
                    dimmed={Boolean(owner && !isMine) || banned}
                    disabled={pending || Boolean(owner && !isMine)}
                    badge={owner ? (isMine ? "YOU" : owner.nickname) : banned ? "3+ PLAYERS" : undefined}
                    onClick={owner && !isMine ? undefined : () => send("SELECT_PARTY_LEADER", { leaderId: id })}
                    ariaLabel={`${leaderDisplayName(id)}${owner ? ` — taken by ${owner.nickname}` : ""}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <footer className="t3-lobby-foot">
        <span className="t3-muted">{hint}</span>
        {!mine?.isBot && !mine?.isHost && <button className="t3-btn t3-btn--continue t3-btn--big" disabled={pending || !mine?.leaderId} onClick={() => send("SET_READY", { ready: !mine?.ready })}>{mine?.ready ? "NOT READY" : "READY"}</button>}
        {host && <button className="t3-btn t3-btn--continue t3-btn--big" disabled={pending || !canStart} onClick={() => send("START_GAME", {})}>START GAME</button>}
      </footer>
    </section>
  );
}

/* --------------------------------------------------------------------- room */

/** Seat slots by opponent count (clockwise after you): left edge, top row (corners first), right edge. */
function seatSlots(count: number): string[] {
  switch (count) {
    case 1: return ["top-c"];
    case 2: return ["top-cl", "top-cr"];
    case 3: return ["left", "top-c", "right"];
    case 4: return ["left", "top-cl", "top-cr", "right"];
    default: return ["left", "top-l", "top-c", "top-r", "right"];
  }
}

export function BaseRoom({ state, send, pending, serverNow, notice, onLobby }: { state: BaseGameSnapshot; send: Send; pending: boolean; serverNow: number; notice: string; onLobby: () => void }) {
  const game = state.game;
  const me = state.you.playerId;
  const gameActive = game.phase === "turn_active";
  const active = gameActive && game.currentPlayerId === me;
  const ap = game.actionPoints ?? 0;
  const free = active && game.chain === null;
  const [targets, setTargets] = useState<BaseTargets>({});
  const [hovered, setHovered] = useState<{ card: CardLike; rect: DOMRect | null; pinned: boolean } | null>(null);
  const [panel, setPanel] = useState<null | "log" | "discard" | "targets" | "help" | "menu">(null);
  const [hideGameOver, setHideGameOver] = useState(false);
  const [targetRequest, setTargetRequest] = useState<TargetRequest | null>(null);
  const [leaderHover, setLeaderHover] = useState<{ playerId: string; rect: DOMRect } | null>(null);
  const [stack, setStack] = useState<{ heroId: string; rect: DOMRect } | null>(null);
  const stackTimer = useRef<number | null>(null);
  const [dismissedRoll, setDismissedRoll] = useState<string | null>(null);
  const [attackFor, setAttackFor] = useState<string | null>(null);
  useEffect(() => {
    if (game.phase !== "game_over") return;
    setTargetRequest(null);
    setAttackFor(null);
  }, [game.phase]);
  // Click anywhere else (or Esc) folds the ATTACK button back behind its Monster.
  useEffect(() => {
    if (!attackFor) return;
    const away = (e: PointerEvent) => { if (!(e.target as HTMLElement | null)?.closest?.(".t3-monster")) setAttackFor(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAttackFor(null); };
    window.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("pointerdown", away); window.removeEventListener("keydown", esc); };
  }, [attackFor]);
  const cancelStackClose = () => { if (stackTimer.current !== null) window.clearTimeout(stackTimer.current); stackTimer.current = null; };
  const tableHover: TableHover = {
    showLeader: (playerId, rect) => setLeaderHover(playerId && rect ? { playerId, rect } : null),
    showStack: (heroId, rect) => {
      cancelStackClose();
      if (heroId && rect) setStack({ heroId, rect });
      else stackTimer.current = window.setTimeout(() => setStack(null), 260);
    },
  };
  const inspectReady = useInspectDwell(hovered);
  const [toasts, dismissToast] = useLogToasts(game.log);
  const yourTurn = useYourTurn(game.phase === "turn_active" ? game.currentPlayerId : null, me);
  const mySeat = state.players.find((p) => p.playerId === me);
  const allSelected = game.phase === "leader_selection" && game.selectionPlayerId === null;
  const playing = game.phase === "turn_active" || game.phase === "game_over";
  const chain = game.chain;
  const chainTargets =
    (chain?.step === "immediate_roll_choice" && chain.actorPlayerId === me) || (chain?.step === "choice" && chain.playerId === me && chain.kind === "play_card");
  const targetApi: TargetApi = {
    // Targets are picked in a dialog at the moment of playing/rolling (see TargetDialog); table clicks stay off.
    enabled: false && ((active && game.phase === "turn_active") || Boolean(chainTargets)),
    value: targets,
    togglePlayer: (playerId) => setTargets((t) => ({ ...t, playerId: t.playerId === playerId ? undefined : playerId })),
    toggleHero: (heroId) =>
      setTargets((t) => {
        const ids = t.heroInstanceIds ?? [];
        const next = ids.includes(heroId) ? ids.filter((id) => id !== heroId) : ids.length < 2 ? [...ids, heroId] : [ids[0], heroId];
        return { ...t, heroInstanceIds: next.length ? next : undefined };
      }),
  };
  const inspect: InspectFn = (card, rect, pinned) => setHovered(card ? { card, rect: rect ?? null, pinned: Boolean(pinned) } : null);

  const turnLeft = game.turnDeadlineAt ? Math.max(0, Math.ceil((game.turnDeadlineAt - serverNow) / 1000)) : 0;
  const turnFraction = game.turnDeadlineAt ? Math.min(1, Math.max(0, (game.turnDeadlineAt - serverNow) / (game.settings.turnSeconds * 1000))) : 0;
  const canDraw = !pending && free && ap >= 1;
  const canRedraw = !pending && free && ap >= 3;
  const canEnd = !pending && free;
  // Keyboard shortcuts for the same three turn buttons (same guards as the buttons).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName))) return;
      const key = e.key.toLowerCase();
      if (key === "d" && canDraw) send("DRAW_CARD", {});
      else if (key === "r" && canRedraw) send("REDRAW_HAND", {});
      else if (key === "e" && canEnd) send("END_TURN", {});
      else if (key === "l") setPanel((p) => (p === "log" ? null : "log"));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canDraw, canRedraw, canEnd, send]);

  // Seats clockwise after you (display only).
  const order = game.turnOrder.length ? game.turnOrder : state.players.map((p) => p.playerId);
  const myIndex = order.indexOf(me);
  const rotated = myIndex >= 0 ? [...order.slice(myIndex + 1), ...order.slice(0, myIndex)] : order.filter((id) => id !== me);
  const opponents = rotated.map((id) => state.players.find((p) => p.playerId === id)).filter((p): p is Player => Boolean(p));
  for (const p of state.players) if (p.playerId !== me && !opponents.includes(p)) opponents.push(p);
  const slots = seatSlots(opponents.length);
  const railPlayers = order.map((id) => state.players.find((p) => p.playerId === id)).filter((p): p is Player => Boolean(p));
  const currentName = state.players.find((p) => p.playerId === game.currentPlayerId)?.nickname;
  const winner = state.players.find((p) => p.playerId === game.winnerPlayerId);
  const discardPile = game.discardPile ?? [];
  const topDiscard = discardPile[discardPile.length - 1];

  const preTable = !playing;

  return (
    <InspectContext.Provider value={inspect}>
      <TableHoverContext.Provider value={tableHover}>
      <main className={`t3-root${preTable ? " app-shell" : ""}`}>
        {preTable && (
          <header className="review-bar">
            <div><b>HERE TO SLAY</b><span>BASE GAME · ROOM {state.roomCode}</span></div>
            <button onClick={onLobby}>LOBBY</button>
          </header>
        )}

        {game.phase === "lobby" && <LobbyStage state={state} send={send} pending={pending} />}

        {game.phase === "leader_selection" && (
          <section className="t3-prestage" aria-label="Party Leader selection">
            <p className="t3-kicker">CHOOSE YOUR PARTY LEADER</p>
            <h2>{game.selectionPlayerId ? (game.selectionPlayerId === me ? "Your pick" : `Picking: ${state.players.find((p) => p.playerId === game.selectionPlayerId)?.nickname}`) : "All Leaders picked."}</h2>
            <div className="t3-leaders">
              {game.leaderPool.map((id) => {
                const taken = game.selectedLeaderIds.includes(id);
                const owner = state.players.find((p) => p.leaderId === id);
                return (
                  <CardRenderer
                    key={id}
                    card={{ definitionId: id, kind: "party_leader", name: leaderDisplayName(id) }}
                    size="lg"
                    dimmed={taken}
                    disabled={pending || taken || game.selectionPlayerId !== me}
                    badge={taken ? owner?.nickname ?? "TAKEN" : undefined}
                    onClick={game.selectionPlayerId === me ? () => send("SELECT_PARTY_LEADER", { leaderId: id }) : undefined}
                    ariaLabel={`${leaderDisplayName(id)}${taken ? " (taken)" : ""}`}
                  />
                );
              })}
            </div>
            {state.you.isHost && allSelected && <button className="t3-btn t3-btn--continue" disabled={pending} onClick={() => send("START_GAME", {})}>START GAME</button>}
          </section>
        )}

        {playing && (
          <div className="t3-frame">
            {/* left rail: turn order + tools */}
            <nav className="t3-rail" aria-label="Players and tools">
              <div className="t3-rail-players">
                {railPlayers.map((p) => (
                  <span key={p.playerId} className={`t3-rail-face${p.playerId === game.currentPlayerId ? " is-active" : ""}${p.playerId === me ? " is-me" : ""}`} style={{ background: leaderColor(p) }} title={`${p.nickname}${p.playerId === game.currentPlayerId ? " — turn" : ""}`}>
                    {p.isBot ? "🤖" : p.nickname.slice(0, 1).toUpperCase()}
                  </span>
                ))}
              </div>
              <div className="t3-rail-tools">
                <button className="t3-icon-btn" onClick={() => setPanel("log")} aria-label="Game log (L)" title="Game log (L)">☰<small>LOG</small></button>
                <button className="t3-icon-btn" onClick={() => setPanel("help")} aria-label="Controls help" title="Controls">?<small>KEYS</small></button>
              </div>
            </nav>

            <section className={`t3-felt t3-felt--p${opponents.length + 1}`} aria-label="Base game table">
              <button className="t3-corner t3-corner--menu" onClick={() => setPanel("menu")} aria-label="Menu">≡</button>
              <div className="t3-corner t3-corner--status" aria-label="Turn status">
                {chain ? <span className="t3-status-timer">⧗ {Math.max(0, Math.ceil((chain.deadlineAt - serverNow) / 1000))}s</span> : null}
                {game.turnDeadlineAt ? (
                  <span className={`t3-turn-clock${turnLeft <= 10 ? " is-urgent" : ""}`} title="Turn timer — resets when AP is spent">⏱ {turnLeft}s</span>
                ) : game.phase === "turn_active" && chain ? <span className="t3-turn-clock is-paused" title="Turn timer paused while this resolves">⏸</span> : null}
                <span>T{game.turnNumber}</span>
                <span className="t3-ap" aria-label={`${ap} action points`}>{Array.from({ length: Math.max(3, ap) }, (_, i) => <i key={i} className={i < ap ? "on" : ""} />)}</span>
              </div>

              {opponents.map((player, i) => (
                <div key={player.playerId} className={`t3-seat t3-seat--${slots[i] ?? "top-c"}`} aria-label={`${player.nickname}'s party`}>
                  <SeatCluster player={player} game={game} me={me} target={targetApi} />
                  <PartyTokens player={player} target={targetApi} vertical={slots[i] === "left" || slots[i] === "right"} />
                </div>
              ))}

              <div className="t3-center">
                <div className="t3-deck" aria-label={`Deck ${game.mainDeckCount} cards`} title={`Main deck · ${game.mainDeckCount}`}>
                  <span className="t3-deck-stack" />
                  <b>{game.mainDeckCount}</b>
                  <small>DECK</small>
                </div>
                <div className="t3-monsters" aria-label="Monsters">
                  {game.faceUpMonsters.map((monster) => {
                    const open = attackFor === monster.cardId && free;
                    return (
                      <div key={monster.cardId} className={`t3-monster${open ? " is-open" : ""}`}>
                        {/* The ATTACK button sits behind the card and slides out below it when the Monster is clicked. */}
                        <div className="t3-attack-drawer" aria-hidden={!open}>
                          <button
                            className="t3-btn t3-btn--red t3-attack"
                            tabIndex={open ? 0 : -1}
                            disabled={pending || !free || ap < 2}
                            title={ap < 2 ? "Needs 2 AP" : undefined}
                            onClick={() => { send("ATTACK_MONSTER", { monsterInstanceId: monster.cardId }); setAttackFor(null); }}
                          >
                            ⚔ ATTACK · 2 AP
                          </button>
                        </div>
                        <CardRenderer card={monster} size="lg" selected={open} onClick={gameActive ? () => setAttackFor(attackFor === monster.cardId ? null : monster.cardId) : undefined} ariaLabel={`${monster.name}${gameActive ? " — click to attack" : ""}`} />
                      </div>
                    );
                  })}
                  <span className="t3-monster-deck" title="Monster deck">☠ {game.monsterDeckCount}</span>
                </div>
                <span className="t3-divider" aria-hidden />
                <button type="button" className="t3-discard" onClick={() => setPanel("discard")} aria-label={`Discard pile, ${game.discardCount} cards — open`}>
                  {topDiscard ? <CardRenderer card={topDiscard} size="lg" /> : <span className="t3-discard-empty">DISCARD<br />empty</span>}
                  <span className="t3-discard-count">{game.discardCount}</span>
                </button>
              </div>

              {mySeat && (
                <div className="t3-seat t3-seat--me" aria-label="Your party">
                  <SeatCluster player={mySeat} game={game} me={me} target={targetApi} />
                  <PartyTokens
                    player={mySeat}
                    target={targetApi}
                    heroAction={(entry) => {
                      if (!active || game.phase !== "turn_active") return null;
                      const used = game.heroRollsUsed.includes(entry.hero.cardId);
                      return (
                        <button
                          className="t3-roll-btn"
                          disabled={pending || !free || ap < 1 || used}
                          onClick={() => {
                            const rule = ruleFor(entry.hero);
                            if (!rule) send("USE_HERO_EFFECT", { heroInstanceId: entry.hero.cardId, targets: {} });
                            else setTargetRequest({ title: `Roll ${entry.hero.name} — choose targets`, verb: "🎲 ROLL · 1 AP", card: entry.hero, rule, onConfirm: (t) => send("USE_HERO_EFFECT", { heroInstanceId: entry.hero.cardId, targets: t }) });
                          }}
                          title={used ? "Already rolled this turn" : "Roll effect · 1 AP"}
                        >
                          {used ? "✓" : "🎲 1"}
                        </button>
                      );
                    }}
                  />
                </div>
              )}



              <Hand
                hand={state.yourHand}
                canPlay={!pending && free && ap >= 1}
                    partyFull={(mySeat?.party.length ?? 0) >= 6}
                onPlay={(card) => {
                  const rule = card.kind === "hero" ? null : ruleFor(card); // Heroes need targets only when they roll
                  if (!rule) send("PLAY_HAND_CARD", { cardInstanceId: card.cardId, targets: {} });
                  else setTargetRequest({ title: card.kind === "item" || card.kind === "cursed_item" ? `Equip ${card.name}` : `Play ${card.name} — choose targets`, verb: "PLAY · 1 AP", card, rule, onConfirm: (t) => send("PLAY_HAND_CARD", { cardInstanceId: card.cardId, targets: t }) });
                }}
              />

              <div className="t3-turn-actions" aria-label="Turn actions">
                {active && game.phase === "turn_active" ? (
                  <>
                    {game.turnDeadlineAt ? (
                      <div className={`t3-turnbar${turnLeft <= 10 ? " is-urgent" : ""}`} role="timer" aria-label={`${turnLeft} seconds left in your turn`}>
                        <span className="t3-turnbar-fill" style={{ transform: `scaleX(${turnFraction})` }} />
                        <b>YOUR TURN · {turnLeft}s</b>
                      </div>
                    ) : null}
                    {mySeat?.leaderId === "hts.base.v1.party-leader.the-shadow-claw" && (
                      <button className="t3-act" disabled={pending || !free || ap < 1} onClick={() => mySeat && setTargetRequest({ title: "The Shadow Claw — pull a card from…", verb: "PULL · 1 AP", card: { definitionId: mySeat.leaderId!, kind: "party_leader", name: leaderDisplayName(mySeat.leaderId!) }, rule: "other_player", onConfirm: (t) => send("LEADER_ACTION", { targetPlayerId: t.playerId }) })}><kbd>⌖</kbd>PULL</button>
                    )}
                    <button className="t3-act" disabled={!canDraw} onClick={() => send("DRAW_CARD", {})}><kbd>D</kbd>DRAW</button>
                    <button className="t3-act" disabled={!canRedraw} onClick={() => send("REDRAW_HAND", {})}><kbd>R</kbd>REDEAL</button>
                    <button className="t3-act t3-act--end" disabled={!canEnd} onClick={() => send("END_TURN", {})}><kbd>E</kbd>PASS</button>
                  </>
                ) : (
                  <span className="t3-waiting">{game.phase === "game_over" ? "GAME OVER" : `${currentName ?? "…"}'s turn`}</span>
                )}
              </div>

              <p className="t3-hint">Hover a card for 2s for full details</p>
            </section>

            {yourTurn && <div className="t3-yourturn" role="status" aria-live="assertive"><b>YOUR TURN</b></div>}
            <div className="t3-toasts" aria-live="polite">
              {toasts.map((t) => (
                <div key={t.seq} className="t3-toast">
                  <span>{t.text}</span>
                  <button className="t3-icon-btn" onClick={() => dismissToast()} aria-label="Dismiss">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {chain && <ReactionStage key={chainKey(chain)} state={state} send={send} pending={pending} serverNow={serverNow} askTargets={setTargetRequest} />}

        {game.reveals.filter((reveal) => reveal.expiresAt > serverNow).map((reveal) => (
          <aside key={reveal.revealId} className="t3-reveal" role="status" aria-live="polite">
            <strong>{state.players.find((p) => p.playerId === reveal.playerId)?.nickname ?? "?"} reveals ({reveal.source})</strong>
            <CardRenderer card={reveal.card} size="md" />
          </aside>
        ))}

        {game.lastRoll && game.lastRoll.id !== dismissedRoll && serverNow - game.lastRoll.resolvedAt < RESULT_MS && (
          <ResultStage key={game.lastRoll.id} state={state} result={game.lastRoll} onClose={() => setDismissedRoll(game.lastRoll!.id)} />
        )}

        {leaderHover && (() => {
          const p = state.players.find((x) => x.playerId === leaderHover.playerId);
          return p ? <LeaderPanel player={p} game={game} rect={leaderHover.rect} /> : null;
        })()}

        {stack && (() => {
          const found = findHero(state, stack.heroId);
          return found?.item ? <HeroStack key={stack.heroId} entry={found} rect={stack.rect} onEnter={cancelStackClose} onLeave={() => setStack(null)} /> : null;
        })()}

        {panel === "log" && (
          <Popup title={`GAME LOG · ${game.log.length}`} onClose={() => setPanel(null)}>
            <ol className="t3-log">{game.log.map((entry) => <li key={entry.seq}>{entry.text}</li>)}</ol>
          </Popup>
        )}
        {panel === "discard" && <DiscardView pile={discardPile} count={game.discardCount} onClose={() => setPanel(null)} />}
        {panel === "help" && (
          <Popup title="CONTROLS" onClose={() => setPanel(null)}>
            <ul className="t3-help">
              <li>Hover a card for 2s — full card (right-click, or touch: long-press)</li>
              <li>Click a hand card — lift it, then PLAY</li>
              <li>Effects that need a target ask for it when you play / roll</li>
              <li><kbd>D</kbd> draw · <kbd>R</kbd> redeal · <kbd>E</kbd> pass turn · <kbd>L</kbd> log · <kbd>Esc</kbd> close</li>
            </ul>
          </Popup>
        )}
        {panel === "menu" && (
          <Popup title={`ROOM ${state.roomCode}`} onClose={() => setPanel(null)}>
            <p className="t3-muted">{game.phase.replaceAll("_", " ")} · turn {game.turnNumber} · {currentName}</p>
            <p className="t3-muted">{notice || "Server snapshot is authoritative. Card data from community sources; rights UNVERIFIED. Card art is placeholder."}</p>
            <button className="t3-btn" onClick={onLobby}>BACK TO LOBBY</button>
          </Popup>
        )}

        {game.phase === "game_over" && !hideGameOver && (
          <div className="t3-stage t3-stage--win" role="dialog" aria-label="Game over">
            <header className="t3-stage-head">
              <span className="t3-stage-kicker">GAME OVER</span>
              <h2 className="t3-win-name" role="status">{winner?.nickname} WINS!</h2>
              <p>{game.winReason === "slay_3" ? "Slew 3 Monsters" : "6 classes in Party"}</p>
              {state.you.isHost && <button className="t3-btn t3-btn--continue" disabled={pending} onClick={() => send("NEW_GAME", {})}>NEW GAME · SAME ROOM</button>}
              <button className="t3-btn t3-btn--continue" onClick={() => setHideGameOver(true)}>VIEW TABLE</button>
            </header>
          </div>
        )}

        {targetRequest && <TargetDialog key={targetRequest.title} state={state} request={targetRequest} onClose={() => setTargetRequest(null)} />}

        <Inspector hovered={hovered} ready={inspectReady} />
        {preTable && <p className="sr-note" role="status">{notice || "Server snapshot is authoritative. Card data from community sources; rights UNVERIFIED."}</p>}
        {!preTable && notice && <p className="t3-notice" role="status">{notice}</p>}
      </main>
      </TableHoverContext.Provider>
    </InspectContext.Provider>
  );
}
