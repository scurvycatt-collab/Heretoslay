// UI-003 draft — tabletop for mode "base" after the owner's reference captures:
// perimeter seats, central Monsters + Discard, peeking hand, left rail, toasts,
// full-screen reaction stage. Everything shown comes from the server snapshot
// (+ static card data by definitionId); the client only sends commands and never
// computes game state. Command kinds/payloads are unchanged from UI-001/002.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { BaseCardView, BaseChainView, BaseGameSnapshot, BaseTargets, HeroClass } from "@here-to-slay/protocol";
import { CardRenderer, InspectContext, type CardLike, type InspectFn } from "./CardRenderer";
import { Glyph } from "./ClassIcon";
import { CLASS_COLOR, HERO_CLASSES, cardData, leaderDisplayName, titleCase } from "./cardCatalog";
import "./base-room.css";

type Send = (kind: string, payload: object) => void;
type Player = BaseGameSnapshot["players"][number];
type Game = BaseGameSnapshot["game"];

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const leaderColor = (player: Player) => (player.leaderClass ? CLASS_COLOR[player.leaderClass as HeroClass] ?? CLASS_COLOR.none : CLASS_COLOR.none);
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

/* --------------------------------------------------------------- inspector */

function useModifierKey() {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Control" || e.key === "Meta") setHeld(true); };
    const up = (e: KeyboardEvent) => { if (e.key === "Control" || e.key === "Meta") setHeld(false); };
    const reset = () => setHeld(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", reset); };
  }, []);
  return held;
}

/** Full card next to the hovered token while Ctrl/⌘ is held (or on touch long-press). */
function Inspector({ hovered, held }: { hovered: { card: CardLike; rect: DOMRect | null; pinned: boolean } | null; held: boolean }) {
  if (!hovered || (!held && !hovered.pinned)) return null;
  const w = 300;
  const h = Math.round(w * (hovered.card.kind === "monster" || hovered.card.kind === "party_leader" ? 1.713 : 1.396));
  const r = hovered.rect;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = vw / 2 - w / 2;
  let top = vh / 2 - h / 2;
  if (r) {
    left = r.right + 14 + w < vw ? r.right + 14 : Math.max(8, r.left - 14 - w);
    top = Math.min(Math.max(8, r.top + r.height / 2 - h / 2), Math.max(8, vh - h - 8));
  }
  if (vw < 640) { left = (vw - w) / 2; top = Math.max(8, (vh - h) / 2); }
  return (
    <div className="t3-inspect" style={{ left, top }} aria-hidden>
      <CardRenderer card={hovered.card} size="xl" inspect={false} style={{ "--w": `${w}px` } as CSSProperties} />
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
  const avatar = (
    <>
      <span className="t3-avatar-face" style={{ background: leaderColor(player) }}>
        <Glyph name={(player.leaderClass as HeroClass) ?? "leader"} className="t3-avatar-glyph" />
        <b>{player.nickname.slice(0, 1).toUpperCase()}</b>
      </span>
      {targeted && <span className="t3-reticle" aria-hidden />}
    </>
  );
  return (
    <div className={`t3-cluster${isActive ? " is-active" : ""}`}>
      <span className={`t3-nametag${isActive ? " is-active" : ""}`}>{player.nickname}{isMe ? " (you)" : ""}{player.isHost ? " ★" : ""}</span>
      <div className="t3-hexes">
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
      </div>
      <span className="t3-stats">
        <span title="Classes in Party (6 = win)">◆ {player.partyClasses.length}/6</span>
        <span title="Monsters slain (3 = win)">☠ {player.slainMonsters.length}/3</span>
        <span title="Cards in hand">✋ {player.handCount}</span>
      </span>
      {player.protections.length > 0 && (
        <span className="t3-protect">{player.protections.map((p) => (p === "no_destroy" ? "NO DESTROY" : "NO STEAL")).join(" · ")}</span>
      )}
    </div>
  );
}

function PartyTokens({ player, target, heroAction, vertical }: { player: Player; target: TargetApi; heroAction?: (entry: Player["party"][number]) => ReactNode; vertical?: boolean }) {
  const heroIds = target.value.heroInstanceIds ?? [];
  return (
    <div className={`t3-party${vertical ? " is-vertical" : ""}`}>
      {player.leaderId && (
        <CardRenderer card={{ definitionId: player.leaderId, kind: "party_leader", name: leaderDisplayName(player.leaderId) }} variant="art" size="xs" className="t3-token t3-token--leader" />
      )}
      {player.party.map((entry) => {
        const order = heroIds.indexOf(entry.hero.cardId);
        return (
          <div key={entry.hero.cardId} className="t3-hero">
            <CardRenderer
              card={entry.hero}
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
            {entry.item && <CardRenderer card={entry.item} variant="art" size="xs" className="t3-token t3-token--item" />}
            {heroAction?.(entry)}
          </div>
        );
      })}
      {player.slainMonsters.map((monster) => (
        <CardRenderer key={monster.cardId} card={monster} variant="art" size="xs" className="t3-token t3-token--slain" />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------- reaction UI */

const chainKey = (chain: BaseChainView) =>
  chain.step === "choice" ? chain.choiceId : chain.step === "immediate_roll_choice" ? `imm-${chain.deadlineAt}` : chain.windowId;

const STATUS_LABEL: Record<string, string> = { pending: "THINKING", passed: "PASSED", played: "PLAYED" };

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

function Die({ value, tone, tilt }: { value: number; tone: string; tilt: number }) {
  const pips: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return (
    <span className={`t3-die t3-die--${tone}`} style={{ "--tilt": `${tilt}deg` } as CSSProperties} aria-label={`die ${value}`}>
      {Array.from({ length: 9 }, (_, i) => <i key={i} className={pips[value]?.includes(i) ? "on" : ""} />)}
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

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: string }) {
  return (
    <div className={`t3-stat${tone ? ` t3-stat--${tone}` : ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function ReactionStage({ state, send, pending, serverNow, targets }: { state: BaseGameSnapshot; send: Send; pending: boolean; serverNow: number; targets: BaseTargets }) {
  const chain = state.game.chain!;
  const me = state.you.playerId;
  const settings = state.game.settings;
  const [side, setSide] = useState<"challenger" | "defender">("defender");
  const [hornBonus, setHornBonus] = useState<0 | 1 | -1>(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [focusCard, setFocusCard] = useState<string | null>(null);
  const needsMe =
    chain.step === "challenge_window" || chain.step === "modifier_window"
      ? chain.responders[me] === "pending"
      : chain.step === "immediate_roll_choice"
        ? chain.actorPlayerId === me
        : chain.playerId === me;
  const [collapsed, setCollapsed] = useState(!needsMe);
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
  let primary: ReactNode = null;

  if (chain.step === "challenge_window") {
    const mine = chain.responders[me];
    tone = "challenge";
    headline = `${name(chain.actorPlayerId)} is playing ${chain.pendingCard.name}`;
    kicker = "CHALLENGE?";
    featured = <CardRenderer card={chain.pendingCard} size="xl" />;
    roster = <Roster state={state} responders={chain.responders} />;
    center = <p className="t3-stage-copy">Play a <b>Challenge</b> card to contest this play — the server rolls both sides.</p>;
    const cards = state.yourHand.filter((c) => c.kind === "challenge");
    if (mine === "pending") {
      tray = cards.map((card) => (
        <div key={card.cardId} className={`t3-tray-card${focusCard === card.cardId ? " is-up" : ""}`}>
          <CardRenderer card={card} size="md" onClick={() => setFocusCard(focusCard === card.cardId ? null : card.cardId)} selected={focusCard === card.cardId} />
          <div className="t3-tray-actions">
            <button className="t3-btn t3-btn--red" disabled={pending} onClick={() => send("REACT_CHALLENGE", { windowId: chain.windowId, cardInstanceId: card.cardId })}>CHALLENGE</button>
          </div>
        </div>
      ));
      primary = <button className="t3-btn t3-btn--continue" disabled={pending} onClick={() => send("REACT_PASS", { windowId: chain.windowId })}>SKIP</button>;
    }
  } else if (chain.step === "modifier_window") {
    const roll = chain.roll;
    const mine = chain.responders[me];
    const hasHorn = state.players.find((p) => p.playerId === me)?.leaderId === "hts.base.v1.party-leader.the-protecting-horn";
    roster = <Roster state={state} responders={chain.responders} />;
    const hero = findHero(state, roll.heroInstanceId);
    const monster = roll.monsterInstanceId ? state.game.faceUpMonsters.find((m) => m.cardId === roll.monsterInstanceId) : undefined;
    const monsterData = monster ? cardData(monster.definitionId) : undefined;
    if (hero) featured = <CardRenderer card={hero.hero} classes={hero.classes} equipped={Boolean(hero.item)} size="xl" />;
    else if (monster) featured = <CardRenderer card={monster} size="xl" />;
    const diceSum = (d: number[]) => d[0] + d[1];
    const chips = (filter?: "challenger" | "defender") => (
      <div className="t3-modchips">
        {roll.modifiers.filter((m) => !filter || (m.side ?? "defender") === filter).map((m) => (
          <span key={m.cardId} className={`t3-modchip ${m.value >= 0 ? "is-pos" : "is-neg"}`}>{name(m.playerId)} {signed(m.value)}</span>
        ))}
        {roll.passives.filter((p) => !filter || (p.side ?? "defender") === filter).map((p, i) => (
          <span key={`${p.source}-${i}`} className={`t3-modchip ${p.value >= 0 ? "is-pos" : "is-neg"}`}>{p.label} {signed(p.value)}</span>
        ))}
      </div>
    );
    if (roll.kind === "challenge") {
      tone = "versus";
      headline = `Challenged by ${name(roll.challengerPlayerId!)}!`;
      kicker = "THE DICE WILL DECIDE";
      const cMod = roll.challengerTotal! - diceSum(roll.challengerDice!);
      const dMod = roll.total - diceSum(roll.dice);
      center = (
        <div className="t3-versus">
          <div className="t3-side t3-side--a">
            <h3>{name(roll.rollerPlayerId)}</h3>
            <div className="t3-stats-row">
              <Stat label="ROLLED" value={diceSum(roll.dice)} />
              <Stat label="MODIFIER" value={signed(dMod)} tone={dMod > 0 ? "pos" : dMod < 0 ? "neg" : "zero"} />
              <Stat label="TOTAL" value={roll.total} />
            </div>
            {chips("defender")}
            <div className="t3-dice">{roll.dice.map((d, i) => <Die key={i} value={d} tone="blue" tilt={i ? 14 : -10} />)}</div>
          </div>
          <span className="t3-vs">VS</span>
          <div className="t3-side t3-side--b">
            <h3>{name(roll.challengerPlayerId!)}</h3>
            <div className="t3-stats-row">
              <Stat label="ROLLED" value={diceSum(roll.challengerDice!)} />
              <Stat label="MODIFIER" value={signed(cMod)} tone={cMod > 0 ? "pos" : cMod < 0 ? "neg" : "zero"} />
              <Stat label="TOTAL" value={roll.challengerTotal} />
            </div>
            {chips("challenger")}
            <div className="t3-dice">{roll.challengerDice!.map((d, i) => <Die key={i} value={d} tone="green" tilt={i ? -16 : 9} />)}</div>
          </div>
        </div>
      );
    } else {
      tone = "roll";
      const what = hero ? hero.hero.name : monster ? monster.name : "a roll";
      headline = roll.kind === "attack" ? `${name(roll.rollerPlayerId)} is attacking ${what}` : `${name(roll.rollerPlayerId)} is using ${what}`;
      kicker = roll.kind === "attack" ? "MONSTER ATTACK" : "HERO ABILITY";
      const mod = roll.total - diceSum(roll.dice);
      center = (
        <div className="t3-rollboard">
          <div className="t3-stats-row">
            <Stat label="ROLLED" value={diceSum(roll.dice)} />
            <Stat label="MODIFIER" value={signed(mod)} tone={mod > 0 ? "pos" : mod < 0 ? "neg" : "zero"} />
            <Stat label="TOTAL" value={roll.total} />
            {roll.threshold !== undefined && <Stat label="REQUIRED" value={roll.threshold} tone="req" />}
            {monsterData?.kind === "monster" && (
              <Stat label="SLAY · PENALTY" value={<><span className="pos">{rollText(monsterData.slay)}</span> <span className="neg">{rollText(monsterData.penaltyRange)}</span></>} tone="req" />
            )}
          </div>
          {chips()}
          <div className="t3-dice">{roll.dice.map((d, i) => <Die key={i} value={d} tone="orange" tilt={i ? 12 : -18} />)}</div>
        </div>
      );
    }
    const modifierCards = state.yourHand.filter((c) => c.kind === "modifier");
    if (mine === "pending") {
      tray = (
        <>
          {(roll.kind === "challenge" || hasHorn) && (
            <div className="t3-tray-options">
              {roll.kind === "challenge" && (
                <div className="t3-seg" role="group" aria-label="Apply modifier to">
                  <span>Apply to</span>
                  {(["defender", "challenger"] as const).map((s) => (
                    <button key={s} className={side === s ? "is-on" : ""} aria-pressed={side === s} onClick={() => setSide(s)}>{s === "defender" ? name(roll.rollerPlayerId) : name(roll.challengerPlayerId!)}</button>
                  ))}
                </div>
              )}
              {hasHorn && (
                <div className="t3-seg" role="group" aria-label="Protecting Horn bonus">
                  <span>Horn</span>
                  {([0, 1, -1] as const).map((v) => (
                    <button key={v} className={hornBonus === v ? "is-on" : ""} aria-pressed={hornBonus === v} onClick={() => setHornBonus(v)}>{v === 0 ? "none" : signed(v)}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          {modifierCards.map((card) => (
            <div key={card.cardId} className={`t3-tray-card${focusCard === card.cardId ? " is-up" : ""}`}>
              <CardRenderer card={card} size="md" onClick={() => setFocusCard(focusCard === card.cardId ? null : card.cardId)} selected={focusCard === card.cardId} />
              <div className="t3-tray-actions">
                {(card.modifierOptions ?? []).map((value) => (
                  <button
                    key={`${card.cardId}${value}`}
                    className={`t3-btn ${value >= 0 ? "t3-btn--green" : "t3-btn--red"}`}
                    disabled={pending}
                    aria-label={`${card.name}: ${signed(value)}`}
                    onClick={() =>
                      send("REACT_MODIFIER", {
                        windowId: chain.windowId,
                        cardInstanceId: card.cardId,
                        value,
                        ...(roll.kind === "challenge" ? { side } : {}),
                        ...(hornBonus ? { leaderBonus: hornBonus } : {}),
                      })
                    }
                  >
                    {signed(value)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </>
      );
      primary = <button className="t3-btn t3-btn--continue" disabled={pending} onClick={() => send("REACT_PASS", { windowId: chain.windowId })}>SKIP{modifierCards.length ? ` (${modifierCards.length})` : ""}</button>;
    }
  } else if (chain.step === "immediate_roll_choice") {
    tone = "roll";
    headline = `${chain.hero.name} entered ${name(chain.actorPlayerId)}'s Party`;
    kicker = "ROLL ITS EFFECT?";
    featured = <CardRenderer card={chain.hero} size="xl" />;
    center =
      chain.actorPlayerId === me ? (
        <div className="t3-stage-copy">
          <p>Roll the effect now (free) or skip.</p>
          <p className="t3-muted">Effect needs a target? Press <b>TABLE</b>, click the player / Hero, then come back.</p>
          <p className="t3-chips"><TargetChips state={state} targets={targets} /></p>
        </div>
      ) : <p className="t3-stage-copy">Waiting for {name(chain.actorPlayerId)}…</p>;
    if (chain.actorPlayerId === me) {
      primary = (
        <>
          <button className="t3-btn t3-btn--ghost" disabled={pending} onClick={() => send("IMMEDIATE_ROLL", { choice: "skip" })}>SKIP</button>
          <button className="t3-btn t3-btn--continue" disabled={pending} onClick={() => send("IMMEDIATE_ROLL", { choice: "roll", targets })}>ROLL</button>
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
          {chain.kind === "order_top" ? "Click in order — #1 goes on top." : `Click cards to select${range}.`} Timeout = skip. Hold Ctrl + hover for full text.
          {chain.kind === "play_card" && <> Targets: <TargetChips state={state} targets={targets} /></>}
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
          onClick={() => { send("RESOLVE_CHOICE", { choiceId: chain.choiceId, cardInstanceIds: picked, ...(chain.kind === "play_card" && picked.length ? { targets } : {}) }); setPicked([]); }}
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
    <div className={`t3-stage t3-stage--${tone}`} role="dialog" aria-label={kicker}>
      <button className="t3-stage-min" onClick={() => setCollapsed(true)} aria-label="Hide to view the table">◱ TABLE</button>
      <header className="t3-stage-head" aria-live="polite">
        <h2>{headline}</h2>
        <span className="t3-stage-kicker">{kicker}</span>
        {countdown(true)}
      </header>
      {featured && <div className="t3-stage-feature">{featured}</div>}
      <div className="t3-stage-center">{center}</div>
      {roster}
      {tray && <div className="t3-stage-tray">{tray}</div>}
      {primary && <div className="t3-stage-primary">{primary}</div>}
    </div>
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

function useLogToasts(log: Game["log"]) {
  const lastSeq = useRef<number>(log.length ? log[log.length - 1].seq : 0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    const fresh = log.filter((entry) => entry.seq > lastSeq.current);
    if (!fresh.length) return;
    lastSeq.current = fresh[fresh.length - 1].seq;
    setToasts((current) => [...current, ...fresh.map((e) => ({ seq: e.seq, text: e.text }))].slice(-3));
    const ids = fresh.map((e) => e.seq);
    const timer = window.setTimeout(() => setToasts((current) => current.filter((t) => !ids.includes(t.seq))), 4500);
    return () => window.clearTimeout(timer);
  }, [log]);
  return [toasts, (seq: number) => setToasts((current) => current.filter((t) => t.seq !== seq))] as const;
}

/* --------------------------------------------------------------------- hand */

function Hand({ hand, canPlay, onPlay }: { hand: BaseCardView[]; canPlay: boolean; onPlay: (card: BaseCardView) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const n = hand.length;
  return (
    <div className="t3-hand" aria-label="Your hand" style={{ "--n": n } as CSSProperties}>
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
                  <button className="t3-btn t3-btn--continue" disabled={!canPlay} onClick={() => { onPlay(card); setSelected(null); }}>PLAY · 1 AP</button>
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

/* --------------------------------------------------------------------- room */

/** Seat slots by opponent count (clockwise after you): left edge, top row, right edge. */
function seatSlots(count: number): string[] {
  switch (count) {
    case 1: return ["top-c"];
    case 2: return ["top-l2", "top-r2"];
    case 3: return ["top-l", "top-c", "top-r"];
    case 4: return ["left", "top-l2", "top-r2", "right"];
    default: return ["left", "top-l", "top-c", "top-r", "right"];
  }
}

export function BaseRoom({ state, send, pending, serverNow, notice, onLobby }: { state: BaseGameSnapshot; send: Send; pending: boolean; serverNow: number; notice: string; onLobby: () => void }) {
  const game = state.game;
  const me = state.you.playerId;
  const active = game.currentPlayerId === me;
  const ap = game.actionPoints ?? 0;
  const free = active && game.chain === null;
  const [targets, setTargets] = useState<BaseTargets>({});
  const [hovered, setHovered] = useState<{ card: CardLike; rect: DOMRect | null; pinned: boolean } | null>(null);
  const [panel, setPanel] = useState<null | "log" | "discard" | "targets" | "help" | "menu">(null);
  const [hideGameOver, setHideGameOver] = useState(false);
  const held = useModifierKey();
  const [toasts, dismissToast] = useLogToasts(game.log);
  const mySeat = state.players.find((p) => p.playerId === me);
  const allSelected = game.phase === "leader_selection" && game.selectionPlayerId === null;
  const playing = game.phase === "turn_active" || game.phase === "game_over";
  const chain = game.chain;
  const chainTargets =
    (chain?.step === "immediate_roll_choice" && chain.actorPlayerId === me) || (chain?.step === "choice" && chain.playerId === me && chain.kind === "play_card");
  const targetApi: TargetApi = {
    enabled: (active && game.phase === "turn_active") || Boolean(chainTargets),
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
      <main className={`t3-root${preTable ? " app-shell" : ""}`}>
        {preTable && (
          <header className="review-bar">
            <div><b>HERE TO SLAY</b><span>BASE GAME · ROOM {state.roomCode}</span></div>
            <button onClick={onLobby}>LOBBY</button>
          </header>
        )}

        {game.phase === "lobby" && (
          <section className="t3-prestage" aria-label="Lobby">
            <p className="t3-kicker">SHARE THIS ROOM CODE</p>
            <strong className="t3-roomcode">{state.roomCode}</strong>
            <div className="t3-lobby-players">
              {state.players.map((p) => <span key={p.playerId} className="t3-lobby-player"><span className="t3-roster-face" style={{ background: leaderColor(p) }}>{p.nickname.slice(0, 1).toUpperCase()}</span>{p.nickname}{p.isHost ? " · HOST" : ""}</span>)}
              {Array.from({ length: Math.max(0, 6 - state.players.length) }, (_, i) => <span key={`e${i}`} className="t3-lobby-player is-empty">open seat</span>)}
            </div>
            <p>Players {state.players.length}/6 · base game needs 2–6.</p>
            {state.you.isHost ? (
              <button className="t3-btn t3-btn--continue" disabled={pending || state.players.length < 2} onClick={() => send("BEGIN_LEADER_SELECTION", {})}>BEGIN LEADER SELECTION</button>
            ) : <p className="t3-muted">Waiting for the host to begin.</p>}
          </section>
        )}

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
                    {p.nickname.slice(0, 1).toUpperCase()}
                  </span>
                ))}
              </div>
              <div className="t3-rail-tools">
                <button className="t3-icon-btn" onClick={() => setPanel("log")} aria-label="Game log (L)" title="Game log (L)">☰<small>LOG</small></button>
                <button className={`t3-icon-btn${targetApi.enabled ? "" : " is-off"}`} onClick={() => setPanel("targets")} aria-label="Targets" title="Targets">⌖<small>TGT</small></button>
                <button className="t3-icon-btn" onClick={() => setPanel("help")} aria-label="Controls help" title="Controls">?<small>KEYS</small></button>
              </div>
            </nav>

            <section className="t3-felt" aria-label="Base game table">
              <button className="t3-corner t3-corner--menu" onClick={() => setPanel("menu")} aria-label="Menu">≡</button>
              <div className="t3-corner t3-corner--status" aria-label="Turn status">
                {chain ? <span className="t3-status-timer">⧗ {Math.max(0, Math.ceil((chain.deadlineAt - serverNow) / 1000))}s</span> : null}
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
                  {game.faceUpMonsters.map((monster) => (
                    <div key={monster.cardId} className="t3-monster">
                      <CardRenderer card={monster} size="lg" />
                      <button className="t3-btn t3-btn--red t3-attack" disabled={pending || !free || ap < 2} onClick={() => send("ATTACK_MONSTER", { monsterInstanceId: monster.cardId })}>ATTACK · 2 AP</button>
                    </div>
                  ))}
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
                          onClick={() => send("USE_HERO_EFFECT", { heroInstanceId: entry.hero.cardId, targets })}
                          title={used ? "Already rolled this turn" : "Roll effect · 1 AP"}
                        >
                          {used ? "✓" : "🎲 1"}
                        </button>
                      );
                    }}
                  />
                </div>
              )}

              {targetApi.enabled && (targets.playerId || targets.heroInstanceIds?.length) ? (
                <div className="t3-target-bar">
                  <TargetChips state={state} targets={targets} />
                  <button className="t3-icon-btn" onClick={() => setTargets({})} aria-label="Clear targets">✕</button>
                </div>
              ) : null}

              <Hand hand={state.yourHand} canPlay={!pending && free && ap >= 1} onPlay={(card) => send("PLAY_HAND_CARD", { cardInstanceId: card.cardId, targets })} />

              <div className="t3-turn-actions" aria-label="Turn actions">
                {active && game.phase === "turn_active" ? (
                  <>
                    {mySeat?.leaderId === "hts.base.v1.party-leader.the-shadow-claw" && (
                      <button className="t3-act" disabled={pending || !free || ap < 1 || !targets.playerId} onClick={() => send("LEADER_ACTION", { targetPlayerId: targets.playerId })}><kbd>⌖</kbd>PULL</button>
                    )}
                    <button className="t3-act" disabled={!canDraw} onClick={() => send("DRAW_CARD", {})}><kbd>D</kbd>DRAW</button>
                    <button className="t3-act" disabled={!canRedraw} onClick={() => send("REDRAW_HAND", {})}><kbd>R</kbd>REDEAL</button>
                    <button className="t3-act t3-act--end" disabled={!canEnd} onClick={() => send("END_TURN", {})}><kbd>E</kbd>PASS</button>
                  </>
                ) : (
                  <span className="t3-waiting">{game.phase === "game_over" ? "GAME OVER" : `${currentName ?? "…"}'s turn`}</span>
                )}
              </div>

              <p className="t3-hint">Hold <kbd>Ctrl</kbd> + hover a card for full details</p>
            </section>

            <div className="t3-toasts" aria-live="polite">
              {toasts.map((t) => (
                <div key={t.seq} className="t3-toast">
                  <span>{t.text}</span>
                  <button className="t3-icon-btn" onClick={() => dismissToast(t.seq)} aria-label="Dismiss">✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {chain && <ReactionStage key={chainKey(chain)} state={state} send={send} pending={pending} serverNow={serverNow} targets={targets} />}

        {panel === "log" && (
          <Popup title={`GAME LOG · ${game.log.length}`} onClose={() => setPanel(null)}>
            <ol className="t3-log">{game.log.map((entry) => <li key={entry.seq}>{entry.text}</li>)}</ol>
          </Popup>
        )}
        {panel === "discard" && (
          <Popup title={`DISCARD PILE · ${game.discardCount}`} onClose={() => setPanel(null)} wide>
            <p className="t3-muted">Newest first. Hold <kbd>Ctrl</kbd> + hover for full card.</p>
            <div className="t3-discard-list">
              {[...discardPile].reverse().map((card) => (
                <div key={card.cardId} className="t3-choice-item">
                  <CardRenderer card={card} variant="art" size="sm" />
                  <small>{card.name}</small>
                </div>
              ))}
              {discardPile.length === 0 && <p className="t3-muted">Empty.</p>}
            </div>
          </Popup>
        )}
        {panel === "targets" && (
          <Popup title="TARGETS" onClose={() => setPanel(null)}>
            <p className="t3-muted">Click a player avatar or Hero on the table (Hero order = T1, T2), or pick here. The server checks targets against the card rule.</p>
            <p className="t3-chips"><TargetChips state={state} targets={targets} /></p>
            <TargetPicker state={state} value={targets} onChange={setTargets} />
            <button className="t3-btn" onClick={() => setTargets({})}>CLEAR TARGETS</button>
          </Popup>
        )}
        {panel === "help" && (
          <Popup title="CONTROLS" onClose={() => setPanel(null)}>
            <ul className="t3-help">
              <li><kbd>Ctrl</kbd>/<kbd>⌘</kbd> + hover — full card (touch: long-press)</li>
              <li>Click a hand card — lift it, then PLAY</li>
              <li>Click an avatar / Hero — set target (T1, T2)</li>
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
              <button className="t3-btn t3-btn--continue" onClick={() => setHideGameOver(true)}>VIEW TABLE</button>
            </header>
          </div>
        )}

        <Inspector hovered={hovered} held={held} />
        {preTable && <p className="sr-note" role="status">{notice || "Server snapshot is authoritative. Card data from community sources; rights UNVERIFIED."}</p>}
        {!preTable && notice && <p className="t3-notice" role="status">{notice}</p>}
      </main>
    </InspectContext.Provider>
  );
}
