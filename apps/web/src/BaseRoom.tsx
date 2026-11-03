// UI-002 — tabletop for mode "base". Everything shown comes from the server
// snapshot (+ static card data by definitionId); the client only sends commands
// and never computes game state. Command kinds/payloads are unchanged from UI-001.
import { useState, type CSSProperties, type ReactNode } from "react";
import type { BaseCardView, BaseChainView, BaseGameSnapshot, BaseTargets } from "@here-to-slay/protocol";
import { CardRenderer, InspectContext, type CardLike } from "./CardRenderer";
import { Glyph } from "./ClassIcon";
import { HERO_CLASSES, cardData, leaderDisplayName, titleCase } from "./cardCatalog";
import "./base-room.css";

type Send = (kind: string, payload: object) => void;
type Player = BaseGameSnapshot["players"][number];

const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);
const AVATAR_COLORS = ["#6ba2cc", "#e0884a", "#8fc06a", "#c77fd6", "#e5c34a", "#e46a6a"];
const avatarColor = (player: Player) => AVATAR_COLORS[player.joinIndex % AVATAR_COLORS.length];

/* ------------------------------------------------------------------ targets */

type TargetApi = {
  enabled: boolean;
  value: BaseTargets;
  togglePlayer: (playerId: string) => void;
  toggleHero: (heroId: string) => void;
};

/** Optional targets for a play/roll; the server validates them against the card's rule. */
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
    <div className="tt-targets-fields">
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

/* ------------------------------------------------------------------- timers */

/** Smooth deadline bar: CSS animation from the remaining fraction to 0, keyed by deadline. */
function CountdownBar({ deadlineAt, serverNow, totalMs }: { deadlineAt: number; serverNow: number; totalMs: number }) {
  const [initialRemaining] = useState(() => Math.max(0, deadlineAt - serverNow));
  const remaining = Math.max(0, deadlineAt - serverNow);
  const seconds = Math.ceil(remaining / 1000);
  const from = Math.min(1, initialRemaining / Math.max(1, totalMs));
  const live = Math.min(1, remaining / Math.max(1, totalMs));
  return (
    <div className={`tt-timer${seconds <= 5 ? " is-urgent" : ""}`} role="timer" aria-label={`${seconds} seconds left`}>
      <div className="tt-timer-track">
        <div className="tt-timer-fill" style={{ "--from": from, transform: `scaleX(${live})`, animationDuration: `${initialRemaining}ms` } as CSSProperties} />
      </div>
      <b className="tt-timer-num">{seconds}s</b>
    </div>
  );
}

function Die({ value }: { value: number }) {
  const pips: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  return (
    <span className="tt-die" aria-label={`die ${value}`}>
      {Array.from({ length: 9 }, (_, i) => <i key={i} className={pips[value]?.includes(i) ? "on" : ""} />)}
    </span>
  );
}

/* ------------------------------------------------------------------ players */

function Avatar({ player, size = "md" }: { player: Player; size?: "sm" | "md" }) {
  return (
    <span className={`tt-avatar tt-avatar--${size}`} style={{ background: avatarColor(player) }} aria-hidden>
      {player.nickname.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ClassPips({ classes }: { classes: string[] }) {
  return (
    <span className="tt-pips" aria-label={`Classes ${classes.length}/6: ${classes.join(", ") || "none"}`}>
      {HERO_CLASSES.map((c) => (
        <span key={c} className={`tt-pip tt-pip--${c}${classes.includes(c) ? " is-on" : ""}`} title={titleCase(c)}>
          <Glyph name={c} />
        </span>
      ))}
    </span>
  );
}

function SeatHeader({ player, game, me, target }: { player: Player; game: BaseGameSnapshot["game"]; me: string; target: TargetApi }) {
  const isActive = player.playerId === game.currentPlayerId;
  const isMe = player.playerId === me;
  const targetable = target.enabled && !isMe;
  const targeted = target.value.playerId === player.playerId;
  const content = (
    <>
      <Avatar player={player} />
      <span className="tt-seat-id">
        <b>{player.nickname}{isMe ? " (you)" : ""}</b>
        <small>
          {player.isHost && <span className="tt-chip">HOST</span>}
          <span className="tt-chip" title="Cards in hand">✋ {player.handCount}</span>
          <span className="tt-chip" title="Monsters slain">☠ {player.slainMonsters.length}/3</span>
          {player.protections.map((p) => <span key={p} className="tt-chip tt-chip--shield">{p === "no_destroy" ? "NO DESTROY" : "NO STEAL"}</span>)}
        </small>
      </span>
      {isActive && <span className="tt-turn-flag">TURN</span>}
      {targeted && <span className="tt-target-flag">TARGET</span>}
    </>
  );
  return targetable ? (
    <button type="button" className={`tt-seat-head is-targetable${targeted ? " is-targeted" : ""}`} onClick={() => target.togglePlayer(player.playerId)} aria-pressed={targeted} title="Click to set as target player">
      {content}
    </button>
  ) : (
    <div className="tt-seat-head">{content}</div>
  );
}

function PartyRow({ player, size, target, heroAction }: { player: Player; size: "sm" | "md"; target: TargetApi; heroAction?: (entry: Player["party"][number]) => ReactNode }) {
  const heroIds = target.value.heroInstanceIds ?? [];
  return (
    <div className={`tt-party tt-party--${size}`}>
      {player.leaderId && (
        <div className="tt-party-slot tt-party-slot--leader">
          <CardRenderer card={{ definitionId: player.leaderId, kind: "party_leader", name: leaderDisplayName(player.leaderId) }} size={size === "md" ? "sm" : "xs"} />
          <small>Leader</small>
        </div>
      )}
      {player.party.map((entry) => {
        const order = heroIds.indexOf(entry.hero.cardId);
        return (
          <div key={entry.hero.cardId} className={`tt-party-slot${entry.item ? " has-item" : ""}`}>
            {entry.item && (
              <CardRenderer card={entry.item} size="xs" className="tt-equip" />
            )}
            <CardRenderer
              card={entry.hero}
              size={size}
              classes={entry.classes}
              equipped={Boolean(entry.item)}
              selected={order >= 0}
              badge={order >= 0 ? `T${order + 1}` : undefined}
              onClick={target.enabled ? () => target.toggleHero(entry.hero.cardId) : undefined}
              ariaLabel={`${entry.hero.name} (${entry.classes.join("/")})${entry.item ? ` equipped with ${entry.item.name}` : ""}${target.enabled ? " — click to target" : ""}`}
            />
            {entry.classes.length > 1 && <small className="tt-mask-note">{entry.classes.map(titleCase).join(" / ")}</small>}
            {heroAction?.(entry)}
          </div>
        );
      })}
      {player.party.length === 0 && <p className="tt-empty">No Heroes yet</p>}
    </div>
  );
}

function SlainRow({ player }: { player: Player }) {
  if (player.slainMonsters.length === 0) return null;
  return (
    <div className="tt-slain" aria-label="Slain monsters">
      {player.slainMonsters.map((monster) => <CardRenderer key={monster.cardId} card={monster} size="xs" />)}
    </div>
  );
}

function OpponentSeat({ player, game, me, target }: { player: Player; game: BaseGameSnapshot["game"]; me: string; target: TargetApi }) {
  return (
    <section className={`tt-seat${player.playerId === game.currentPlayerId ? " is-active" : ""}`} aria-label={`${player.nickname}'s party`}>
      <SeatHeader player={player} game={game} me={me} target={target} />
      <ClassPips classes={player.partyClasses} />
      <PartyRow player={player} size="sm" target={target} />
      <SlainRow player={player} />
    </section>
  );
}

/* ------------------------------------------------------------ chain overlay */

const chainKey = (chain: BaseChainView) =>
  chain.step === "choice" ? chain.choiceId : chain.step === "immediate_roll_choice" ? `imm-${chain.deadlineAt}` : chain.windowId;

const STATUS_LABEL: Record<string, string> = { pending: "Waiting", passed: "Skipped", played: "Played" };

function Roster({ state, responders }: { state: BaseGameSnapshot; responders: Record<string, string> }) {
  return (
    <aside className="tt-roster" aria-label="Reaction roster">
      <h3>PLAYERS</h3>
      {state.players.filter((p) => p.playerId in responders).map((p) => (
        <div key={p.playerId} className={`tt-roster-row is-${responders[p.playerId]}`}>
          <Avatar player={p} size="sm" />
          <span>{p.nickname}{p.playerId === state.you.playerId ? " (you)" : ""}</span>
          <em>{STATUS_LABEL[responders[p.playerId]] ?? responders[p.playerId]}</em>
        </div>
      ))}
    </aside>
  );
}

function findHero(state: BaseGameSnapshot, heroId: string | undefined) {
  if (!heroId) return undefined;
  for (const player of state.players) {
    const entry = player.party.find((e) => e.hero.cardId === heroId);
    if (entry) return entry;
  }
  return undefined;
}

function ChainOverlay({ state, send, pending, serverNow, targets }: { state: BaseGameSnapshot; send: Send; pending: boolean; serverNow: number; targets: BaseTargets }) {
  const chain = state.game.chain!;
  const me = state.you.playerId;
  const settings = state.game.settings;
  const [side, setSide] = useState<"challenger" | "defender">("defender");
  const [hornBonus, setHornBonus] = useState<0 | 1 | -1>(0);
  const [picked, setPicked] = useState<string[]>([]);
  const needsMe =
    chain.step === "challenge_window" || chain.step === "modifier_window"
      ? chain.responders[me] === "pending"
      : chain.step === "immediate_roll_choice"
        ? chain.actorPlayerId === me
        : chain.playerId === me;
  const [collapsed, setCollapsed] = useState(!needsMe);
  const name = (playerId: string) => state.players.find((p) => p.playerId === playerId)?.nickname ?? playerId;
  const totalMs = (chain.step === "challenge_window" || chain.step === "modifier_window" ? settings.reactionSeconds : settings.choiceSeconds) * 1000;

  let headline = "";
  let sub = "";
  let tone = "choice";
  let featured: ReactNode = null;
  let main: ReactNode = null;
  let roster: ReactNode = null;
  let controls: ReactNode = null;

  if (chain.step === "challenge_window") {
    const mine = chain.responders[me];
    tone = "challenge";
    headline = "CHALLENGE?";
    sub = `${name(chain.actorPlayerId)} plays ${chain.pendingCard.name}`;
    featured = <CardRenderer card={chain.pendingCard} size="lg" />;
    roster = <Roster state={state} responders={chain.responders} />;
    const challengeCards = state.yourHand.filter((c) => c.kind === "challenge");
    main = <p className="tt-ov-copy">Play a <b>Challenge</b> card to contest this play, or skip. The server rolls both sides.</p>;
    controls = mine === "pending" && (
      <div className="tt-react-hand">
        {challengeCards.map((card) => (
          <div key={card.cardId} className="tt-react-card">
            <CardRenderer card={card} size="sm" />
            <button className="tt-btn tt-btn--danger" disabled={pending} onClick={() => send("REACT_CHALLENGE", { windowId: chain.windowId, cardInstanceId: card.cardId })}>CHALLENGE</button>
          </div>
        ))}
        {challengeCards.length === 0 && <p className="tt-empty">No Challenge card in hand.</p>}
        <button className="tt-btn tt-btn--skip" disabled={pending} onClick={() => send("REACT_PASS", { windowId: chain.windowId })}>SKIP</button>
      </div>
    );
  } else if (chain.step === "modifier_window") {
    const roll = chain.roll;
    const mine = chain.responders[me];
    const hasHorn = state.players.find((p) => p.playerId === me)?.leaderId === "hts.base.v1.party-leader.the-protecting-horn";
    tone = roll.kind === "challenge" ? "versus" : "modifier";
    headline = roll.kind === "challenge" ? "CHALLENGE ROLL" : roll.kind === "attack" ? "ATTACK ROLL" : "HERO ROLL";
    sub = `${name(roll.rollerPlayerId)} rolled · play a Modifier or skip`;
    roster = <Roster state={state} responders={chain.responders} />;
    const hero = findHero(state, roll.heroInstanceId);
    const monster = roll.monsterInstanceId ? state.game.faceUpMonsters.find((m) => m.cardId === roll.monsterInstanceId) : undefined;
    const monsterData = monster ? cardData(monster.definitionId) : undefined;
    if (hero) featured = <CardRenderer card={hero.hero} classes={hero.classes} equipped={Boolean(hero.item)} size="lg" />;
    else if (monster) featured = <CardRenderer card={monster} size="lg" />;
    const effects = (
      <ul className="tt-mods">
        {roll.modifiers.map((m) => <li key={m.cardId}><b className={m.value >= 0 ? "pos" : "neg"}>{signed(m.value)}</b> Modifier by {name(m.playerId)}{m.side ? ` → ${m.side}` : ""}</li>)}
        {roll.passives.map((p, i) => <li key={`${p.source}-${i}`}><b className={p.value >= 0 ? "pos" : "neg"}>{signed(p.value)}</b> {p.label}{p.side ? ` → ${p.side}` : ""}</li>)}
        {roll.modifiers.length === 0 && roll.passives.length === 0 && <li className="tt-muted">No modifiers yet</li>}
      </ul>
    );
    main =
      roll.kind === "challenge" ? (
        <div className="tt-versus">
          <div className="tt-side tt-side--challenger">
            <small>CHALLENGER</small>
            <b>{name(roll.challengerPlayerId!)}</b>
            <span className="tt-dice">{roll.challengerDice!.map((d, i) => <Die key={i} value={d} />)}</span>
            <strong>{roll.challengerTotal}</strong>
          </div>
          <span className="tt-vs">VS</span>
          <div className="tt-side tt-side--defender">
            <small>DEFENDER</small>
            <b>{name(roll.rollerPlayerId)}</b>
            <span className="tt-dice">{roll.dice.map((d, i) => <Die key={i} value={d} />)}</span>
            <strong>{roll.total}</strong>
          </div>
          {effects}
        </div>
      ) : (
        <div className="tt-rollstats">
          <div className="tt-stat"><small>ROLLED</small><span className="tt-dice">{roll.dice.map((d, i) => <Die key={i} value={d} />)}</span></div>
          <div className="tt-stat"><small>TOTAL</small><strong>{roll.total}</strong></div>
          {roll.threshold !== undefined && <div className="tt-stat"><small>REQUIRED</small><strong>{roll.threshold}+</strong></div>}
          {monsterData?.kind === "monster" && (
            <div className="tt-stat">
              <small>SLAY / PENALTY</small>
              <strong className="tt-stat-pair">
                <span className="pos">{monsterData.slay.value}{monsterData.slay.op === "gte" ? "+" : "-"}</span>
                <span className="neg">{monsterData.penaltyRange.value}{monsterData.penaltyRange.op === "gte" ? "+" : "-"}</span>
              </strong>
            </div>
          )}
          {effects}
        </div>
      );
    const modifierCards = state.yourHand.filter((c) => c.kind === "modifier");
    controls = mine === "pending" && (
      <>
        {(roll.kind === "challenge" || hasHorn) && (
          <div className="tt-ov-options">
            {roll.kind === "challenge" && (
              <div className="tt-seg" role="group" aria-label="Apply modifier to">
                <span>Apply to</span>
                {(["defender", "challenger"] as const).map((s) => (
                  <button key={s} className={side === s ? "is-on" : ""} aria-pressed={side === s} onClick={() => setSide(s)}>{s}</button>
                ))}
              </div>
            )}
            {hasHorn && (
              <div className="tt-seg" role="group" aria-label="Protecting Horn bonus">
                <span>Protecting Horn</span>
                {([0, 1, -1] as const).map((v) => (
                  <button key={v} className={hornBonus === v ? "is-on" : ""} aria-pressed={hornBonus === v} onClick={() => setHornBonus(v)}>{v === 0 ? "none" : signed(v)}</button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="tt-react-hand">
          {modifierCards.map((card) => (
            <div key={card.cardId} className="tt-react-card">
              <CardRenderer card={card} size="sm" />
              <div className="tt-react-opts">
                {(card.modifierOptions ?? []).map((value) => (
                  <button
                    key={`${card.cardId}${value}`}
                    className={`tt-btn ${value >= 0 ? "tt-btn--pos" : "tt-btn--neg"}`}
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
          {modifierCards.length === 0 && <p className="tt-empty">No Modifier card in hand.</p>}
          <button className="tt-btn tt-btn--skip" disabled={pending} onClick={() => send("REACT_PASS", { windowId: chain.windowId })}>SKIP</button>
        </div>
      </>
    );
  } else if (chain.step === "immediate_roll_choice") {
    headline = "HERO ENTERED THE PARTY";
    sub = `${name(chain.actorPlayerId)} · ${chain.hero.name}`;
    tone = "modifier";
    featured = <CardRenderer card={chain.hero} size="lg" />;
    main =
      chain.actorPlayerId === me ? (
        <div className="tt-ov-copy">
          <p>Roll its effect now (free) or skip.</p>
          <p className="tt-muted">If the effect needs targets, minimise this panel and click a player / Hero on the table first.</p>
          <TargetSummary state={state} targets={targets} />
        </div>
      ) : <p className="tt-ov-copy">Waiting for {name(chain.actorPlayerId)}.</p>;
    controls = chain.actorPlayerId === me && (
      <div className="tt-ov-actions">
        <button className="tt-btn tt-btn--go" disabled={pending} onClick={() => send("IMMEDIATE_ROLL", { choice: "roll", targets })}>ROLL</button>
        <button className="tt-btn tt-btn--skip" disabled={pending} onClick={() => send("IMMEDIATE_ROLL", { choice: "skip" })}>SKIP</button>
      </div>
    );
  } else {
    // choice
    const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
    const range = chain.kind !== "confirm" ? ` (${chain.min === chain.max ? chain.max : `${chain.min}–${chain.max}`})` : "";
    headline = chain.kind === "order_top" ? "ORDER THE CARDS" : chain.kind === "view_hand" ? "LOOK AT HAND" : chain.kind === "confirm" ? "CONFIRM" : "CHOOSE";
    sub = `${name(chain.playerId)}: ${chain.prompt}${range} · timeout = skip`;
    tone = "choice";
    const mineChoice = chain.playerId === me;
    main = !mineChoice ? (
      <p className="tt-ov-copy">Waiting for {name(chain.playerId)} to choose…</p>
    ) : chain.kind === "confirm" ? (
      <p className="tt-ov-copy">{chain.prompt}</p>
    ) : chain.options ? (
      <div className="tt-choice">
        {chain.kind === "play_card" && <p className="tt-muted">Card targets (if needed): minimise and click a player / Hero on the table. <TargetSummary state={state} targets={targets} /></p>}
        {chain.kind === "order_top" && (
          <p className="tt-muted">Click in order — <b>#1 goes on top</b>. {picked.length > 0 && <>Order: {picked.map((id) => chain.options?.find((c) => c.cardId === id)?.name).join(" → ")}</>}</p>
        )}
        <div className="tt-choice-grid">
          {chain.options.map((card) => {
            const index = picked.indexOf(card.cardId);
            return (
              <CardRenderer
                key={card.cardId}
                card={card}
                size="md"
                selected={index >= 0}
                badge={index >= 0 ? (chain.kind === "order_top" ? `#${index + 1}` : "✓") : undefined}
                onClick={chain.kind !== "view_hand" ? () => toggle(card.cardId) : undefined}
              />
            );
          })}
        </div>
      </div>
    ) : null;
    controls = mineChoice && (
      <div className="tt-ov-actions">
        {chain.kind === "confirm" ? (
          <>
            <button className="tt-btn tt-btn--go" disabled={pending} onClick={() => send("RESOLVE_CHOICE", { choiceId: chain.choiceId, cardInstanceIds: [], accept: true })}>YES</button>
            <button className="tt-btn tt-btn--skip" disabled={pending} onClick={() => send("RESOLVE_CHOICE", { choiceId: chain.choiceId, cardInstanceIds: [], accept: false })}>NO</button>
          </>
        ) : chain.options ? (
          <>
            <span className="tt-muted">Selected {picked.length}{chain.max ? ` / ${chain.max}` : ""}</span>
            <button
              className="tt-btn tt-btn--go"
              disabled={pending}
              onClick={() => { send("RESOLVE_CHOICE", { choiceId: chain.choiceId, cardInstanceIds: picked, ...(chain.kind === "play_card" && picked.length ? { targets } : {}) }); setPicked([]); }}
            >
              {chain.kind === "view_hand" ? "CLOSE" : picked.length === 0 && chain.min === 0 ? "SKIP" : "CONFIRM"}
            </button>
          </>
        ) : null}
      </div>
    );
  }

  const timer = <CountdownBar key={chain.deadlineAt} deadlineAt={chain.deadlineAt} serverNow={serverNow} totalMs={totalMs} />;

  if (collapsed) {
    return (
      <div className={`tt-dock tt-dock--${tone}${needsMe ? " needs-me" : ""}`} role="status" aria-live="polite">
        <b>{headline}</b>
        <span className="tt-dock-sub">{sub}</span>
        {timer}
        <button className="tt-btn" onClick={() => setCollapsed(false)}>{needsMe ? "RESPOND" : "VIEW"}</button>
      </div>
    );
  }

  return (
    <div className={`tt-overlay tt-overlay--${tone}`} role="dialog" aria-modal="false" aria-label={headline}>
      <div className="tt-ov-panel">
        <button className="tt-ov-min" onClick={() => setCollapsed(true)} aria-label="Minimise to view the table">▾ TABLE</button>
        <header className="tt-ov-head" aria-live="polite">
          <span className="tt-ov-sub">{sub}</span>
          <strong className="tt-ov-title">{headline}</strong>
          {timer}
        </header>
        <div className={`tt-ov-body${featured ? "" : " no-feature"}${roster ? "" : " no-roster"}`}>
          {featured && <div className="tt-ov-feature">{featured}</div>}
          <div className="tt-ov-main">{main}</div>
          {roster}
        </div>
        {controls && <footer className="tt-ov-controls">{controls}</footer>}
      </div>
    </div>
  );
}

function TargetSummary({ state, targets }: { state: BaseGameSnapshot; targets: BaseTargets }) {
  const playerName = targets.playerId ? state.players.find((p) => p.playerId === targets.playerId)?.nickname : undefined;
  const heroes = (targets.heroInstanceIds ?? []).map((id, i) => `T${i + 1} ${findHero(state, id)?.hero.name ?? id}`);
  if (!playerName && heroes.length === 0) return <span className="tt-target-summary tt-muted">No targets set.</span>;
  return (
    <span className="tt-target-summary">
      {playerName && <span className="tt-chip tt-chip--target">Player: {playerName}</span>}
      {heroes.map((h) => <span key={h} className="tt-chip tt-chip--target">{h}</span>)}
    </span>
  );
}

/* --------------------------------------------------------------------- hand */

function HandFan({ hand, canPlay, onPlay }: { hand: BaseCardView[]; canPlay: boolean; onPlay: (card: BaseCardView) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const n = hand.length;
  const spread = n > 1 ? Math.min(7, 42 / n) : 0;
  return (
    <div className="tt-hand" aria-label="Your hand" style={{ "--n": n } as CSSProperties}>
      {n === 0 && <p className="tt-empty">Your hand is empty.</p>}
      {hand.map((card, i) => {
        const offset = i - (n - 1) / 2;
        const playable = card.kind === "hero" || card.kind === "item" || card.kind === "cursed_item" || card.kind === "magic";
        const isSel = selected === card.cardId;
        return (
          <div
            key={card.cardId}
            className={`tt-hand-slot${isSel ? " is-selected" : ""}`}
            style={{ "--rot": `${offset * spread}deg`, "--lift": `${Math.abs(offset) * Math.abs(offset) * 2.2}px`, zIndex: isSel ? 60 : i + 1 } as CSSProperties}
          >
            <CardRenderer card={card} size="md" selected={isSel} onClick={() => setSelected(isSel ? null : card.cardId)} />
            <div className="tt-hand-actions">
              {playable ? (
                <button className="tt-btn tt-btn--go" disabled={!canPlay} onClick={() => { onPlay(card); setSelected(null); }}>PLAY · 1 AP</button>
              ) : (
                <span className="tt-chip">{card.kind === "modifier" ? "Use on a roll" : card.kind === "challenge" ? "Use to challenge" : titleCase(card.kind)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------------- room */

export function BaseRoom({ state, send, pending, serverNow, notice, onLobby }: { state: BaseGameSnapshot; send: Send; pending: boolean; serverNow: number; notice: string; onLobby: () => void }) {
  const game = state.game;
  const me = state.you.playerId;
  const active = game.currentPlayerId === me;
  const ap = game.actionPoints ?? 0;
  const free = active && game.chain === null;
  const [targets, setTargets] = useState<BaseTargets>({});
  const [inspect, setInspect] = useState<CardLike | null>(null);
  const [hideGameOver, setHideGameOver] = useState(false);
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

  // Seat order follows turn order, starting after you (display only).
  const order = game.turnOrder.length ? game.turnOrder : state.players.map((p) => p.playerId);
  const myIndex = order.indexOf(me);
  const rotated = myIndex >= 0 ? [...order.slice(myIndex + 1), ...order.slice(0, myIndex)] : order.filter((id) => id !== me);
  const opponents = rotated.map((id) => state.players.find((p) => p.playerId === id)).filter((p): p is Player => Boolean(p));
  for (const p of state.players) if (p.playerId !== me && !opponents.includes(p)) opponents.push(p);
  const currentName = state.players.find((p) => p.playerId === game.currentPlayerId)?.nickname;
  const winner = state.players.find((p) => p.playerId === game.winnerPlayerId);

  return (
    <InspectContext.Provider value={setInspect}>
      <main className="app-shell tt-shell">
        <header className="review-bar tt-bar">
          <div>
            <b>HERE TO SLAY</b>
            <span>BASE GAME · ROOM {state.roomCode}</span>
          </div>
          <div className="tt-bar-status" aria-label="Game status">
            <span className="tt-chip tt-chip--phase">{game.phase.replaceAll("_", " ").toUpperCase()}</span>
            {game.phase === "turn_active" && (
              <>
                <span className="tt-chip">TURN {game.turnNumber}</span>
                <span className={`tt-chip${active ? " tt-chip--you" : ""}`}>{active ? "YOUR TURN" : currentName}</span>
                <span className="tt-ap" aria-label={`${ap} action points`}>
                  {Array.from({ length: Math.max(3, ap) }, (_, i) => <i key={i} className={i < ap ? "on" : ""} />)}
                  <small>AP {ap}</small>
                </span>
                {game.turnRollBonus ? <span className="tt-chip tt-chip--pos">ROLLS +{game.turnRollBonus}</span> : null}
              </>
            )}
          </div>
          <button onClick={onLobby}>LOBBY</button>
        </header>

        {game.phase === "lobby" && (
          <section className="tt-stage" aria-label="Lobby">
            <p className="tt-kicker">SHARE THIS ROOM CODE</p>
            <strong className="tt-roomcode">{state.roomCode}</strong>
            <div className="tt-lobby-players">
              {state.players.map((p) => (
                <span key={p.playerId} className="tt-lobby-player"><Avatar player={p} /> {p.nickname}{p.isHost ? " · HOST" : ""}</span>
              ))}
              {Array.from({ length: Math.max(0, 6 - state.players.length) }, (_, i) => <span key={`empty-${i}`} className="tt-lobby-player is-empty">open seat</span>)}
            </div>
            <p>Players {state.players.length}/6 · base game needs 2–6.</p>
            {state.you.isHost ? (
              <button className="tt-btn tt-btn--go tt-btn--big" disabled={pending || state.players.length < 2} onClick={() => send("BEGIN_LEADER_SELECTION", {})}>BEGIN LEADER SELECTION</button>
            ) : <p className="tt-muted">Waiting for the host to begin.</p>}
          </section>
        )}

        {game.phase === "leader_selection" && (
          <section className="tt-stage" aria-label="Party Leader selection">
            <p className="tt-kicker">CHOOSE YOUR PARTY LEADER</p>
            <strong className="tt-stage-title">
              {game.selectionPlayerId ? (game.selectionPlayerId === me ? "Your pick" : `Picking: ${state.players.find((p) => p.playerId === game.selectionPlayerId)?.nickname}`) : "All Leaders picked."}
            </strong>
            <div className="tt-leaders">
              {game.leaderPool.map((id) => {
                const taken = game.selectedLeaderIds.includes(id);
                const owner = state.players.find((p) => p.leaderId === id);
                const canPick = game.selectionPlayerId === me && !taken;
                return (
                  <div key={id} className="tt-leader-slot">
                    <CardRenderer
                      card={{ definitionId: id, kind: "party_leader", name: leaderDisplayName(id) }}
                      size="lg"
                      dimmed={taken}
                      disabled={pending || taken || game.selectionPlayerId !== me}
                      badge={taken ? (owner ? owner.nickname : "TAKEN") : undefined}
                      onClick={game.selectionPlayerId === me ? () => send("SELECT_PARTY_LEADER", { leaderId: id }) : undefined}
                      ariaLabel={`${leaderDisplayName(id)}${taken ? " (taken)" : ""}`}
                    />
                    {canPick && <small className="tt-pick-hint">Click to pick</small>}
                  </div>
                );
              })}
            </div>
            {state.you.isHost && allSelected && <button className="tt-btn tt-btn--go tt-btn--big" disabled={pending} onClick={() => send("START_GAME", {})}>START GAME</button>}
          </section>
        )}

        {playing && (
          <section className="tt-table" aria-label="Base game table">
            <div className={`tt-opponents tt-opponents--${opponents.length}`}>
              {opponents.map((player) => <OpponentSeat key={player.playerId} player={player} game={game} me={me} target={targetApi} />)}
            </div>

            <div className="tt-center">
              <div className="tt-piles" aria-label="Piles">
                <div className="tt-pile"><span className="tt-pile-stack" /><b>{game.mainDeckCount}</b><small>DECK</small></div>
                <div className="tt-pile tt-pile--discard"><span className="tt-pile-stack" /><b>{game.discardCount}</b><small>DISCARD</small></div>
                <div className="tt-pile tt-pile--monster"><span className="tt-pile-stack" /><b>{game.monsterDeckCount}</b><small>MONSTERS</small></div>
              </div>

              <div className="tt-monsters" aria-label="Monsters">
                <h2>MONSTERS</h2>
                <div className="tt-monster-row">
                  {game.faceUpMonsters.map((monster) => (
                    <div key={monster.cardId} className="tt-monster">
                      <CardRenderer card={monster} size="lg" />
                      <button className="tt-btn tt-btn--danger" disabled={pending || !free || ap < 2} onClick={() => send("ATTACK_MONSTER", { monsterInstanceId: monster.cardId })}>ATTACK · 2 AP</button>
                    </div>
                  ))}
                </div>
              </div>

              <details className="tt-log" open>
                <summary>LOG</summary>
                <ol>{game.log.slice(-12).map((entry) => <li key={entry.seq}>{entry.text}</li>)}</ol>
              </details>
            </div>

            {mySeat && (
              <section className={`tt-me${active ? " is-active" : ""}`} aria-label="Your party">
                <div className="tt-me-head">
                  <SeatHeader player={mySeat} game={game} me={me} target={targetApi} />
                  <ClassPips classes={mySeat.partyClasses} />
                  <SlainRow player={mySeat} />
                </div>
                <PartyRow
                  player={mySeat}
                  size="md"
                  target={targetApi}
                  heroAction={(entry) => {
                    const used = game.heroRollsUsed.includes(entry.hero.cardId);
                    return (
                      <button
                        className="tt-btn tt-btn--roll"
                        disabled={pending || !free || ap < 1 || used}
                        onClick={() => send("USE_HERO_EFFECT", { heroInstanceId: entry.hero.cardId, targets })}
                      >
                        {used ? "ROLLED" : "ROLL EFFECT · 1 AP"}
                      </button>
                    );
                  }}
                />
              </section>
            )}

            {targetApi.enabled && (
              <section className="tt-targets" aria-label="Targets">
                <b>TARGETS</b>
                <span className="tt-muted">Click a player or Hero on the table (Hero order = T1, T2).</span>
                <TargetSummary state={state} targets={targets} />
                <TargetPicker state={state} value={targets} onChange={setTargets} />
                <button className="tt-btn" onClick={() => setTargets({})}>CLEAR TARGETS</button>
              </section>
            )}

            <div className="tt-dock-bottom">
              <HandFan hand={state.yourHand} canPlay={!pending && free && ap >= 1} onPlay={(card) => send("PLAY_HAND_CARD", { cardInstanceId: card.cardId, targets })} />
              {active && game.phase === "turn_active" ? (
                <div className="tt-actions" aria-label="Turn actions">
                  <button className="tt-btn tt-btn--go" disabled={pending || !free || ap < 1} onClick={() => send("DRAW_CARD", {})}>DRAW · 1 AP</button>
                  <button className="tt-btn" disabled={pending || !free || ap < 3} onClick={() => send("REDRAW_HAND", {})}>REDRAW · 3 AP</button>
                  {mySeat?.leaderId === "hts.base.v1.party-leader.the-shadow-claw" && (
                    <button className="tt-btn" disabled={pending || !free || ap < 1 || !targets.playerId} onClick={() => send("LEADER_ACTION", { targetPlayerId: targets.playerId })}>SHADOW CLAW PULL · 1 AP</button>
                  )}
                  <button className="tt-btn tt-btn--end" disabled={pending || !free} onClick={() => send("END_TURN", {})}>END TURN</button>
                </div>
              ) : (
                <div className="tt-actions tt-actions--idle">
                  <span className="tt-muted">{game.phase === "game_over" ? "Game over" : `Waiting for ${currentName ?? "…"}`}</span>
                </div>
              )}
            </div>
          </section>
        )}

        {chain && <ChainOverlay key={chainKey(chain)} state={state} send={send} pending={pending} serverNow={serverNow} targets={targets} />}

        {game.phase === "game_over" && !hideGameOver && (
          <div className="tt-overlay tt-overlay--win" role="dialog" aria-label="Game over">
            <div className="tt-ov-panel tt-win">
              <span className="tt-ov-sub">GAME OVER</span>
              <strong className="tt-ov-title" role="status">WINNER: {winner?.nickname}</strong>
              <p>{game.winReason === "slay_3" ? "Slew 3 Monsters" : "6 classes in Party"}</p>
              <button className="tt-btn" onClick={() => setHideGameOver(true)}>VIEW TABLE</button>
            </div>
          </div>
        )}

        {inspect && (
          <div className="tt-inspect" aria-hidden>
            <CardRenderer card={inspect} size="xl" inspect={false} />
          </div>
        )}

        <p className="sr-note" role="status">{notice || "Server snapshot is authoritative. Card data from community sources; rights UNVERIFIED. Card art is placeholder."}</p>
      </main>
    </InspectContext.Provider>
  );
}
