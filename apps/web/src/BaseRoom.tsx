// UI-001 — minimal wiring for mode "base". No styling work (visual = Codex).
// Everything shown comes from the server snapshot; the client only sends
// commands and never computes game state.
import { useState } from "react";
import type { BaseCardView, BaseGameSnapshot, BaseTargets } from "@here-to-slay/protocol";

type Send = (kind: string, payload: object) => void;

const leaderName = (id: string) =>
  id.replace("hts.base.v1.party-leader.", "").split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
const signed = (value: number) => (value > 0 ? `+${value}` : `${value}`);

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
    <div className="target-picker">
      <label>
        Target player{" "}
        <select value={value.playerId ?? ""} onChange={(event) => onChange({ ...value, playerId: event.target.value || undefined })}>
          <option value="">—</option>
          {state.players.filter((p) => p.playerId !== state.you.playerId).map((p) => (
            <option key={p.playerId} value={p.playerId}>{p.nickname}</option>
          ))}
        </select>
      </label>
      {[0, 1].map((index) => (
        <label key={index}>
          {" "}Hero {index + 1}{" "}
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

function Countdown({ deadlineAt, serverNow }: { deadlineAt: number; serverNow: number }) {
  return <b>{Math.max(0, Math.ceil((deadlineAt - serverNow) / 1000))}s</b>;
}

function ChainPanel({ state, send, pending, serverNow, targets }: { state: BaseGameSnapshot; send: Send; pending: boolean; serverNow: number; targets: BaseTargets }) {
  const chain = state.game.chain;
  const me = state.you.playerId;
  const [side, setSide] = useState<"challenger" | "defender">("defender");
  const [hornBonus, setHornBonus] = useState<0 | 1 | -1>(0);
  const [picked, setPicked] = useState<string[]>([]);
  if (!chain) return null;
  const name = (playerId: string) => state.players.find((p) => p.playerId === playerId)?.nickname ?? playerId;
  if (chain.step === "challenge_window") {
    const mine = chain.responders[me];
    return (
      <section className="reaction-layer" aria-live="polite">
        <h2>CHALLENGE? · <Countdown deadlineAt={chain.deadlineAt} serverNow={serverNow} /></h2>
        <p>{name(chain.actorPlayerId)} plays {chain.pendingCard.name}</p>
        <p>{Object.entries(chain.responders).map(([id, s]) => `${name(id)}: ${s}`).join(" · ")}</p>
        {mine === "pending" && (
          <>
            {state.yourHand.filter((c) => c.kind === "challenge").map((card) => (
              <button key={card.cardId} disabled={pending} onClick={() => send("REACT_CHALLENGE", { windowId: chain.windowId, cardInstanceId: card.cardId })}>CHALLENGE</button>
            ))}
            <button disabled={pending} onClick={() => send("REACT_PASS", { windowId: chain.windowId })}>SKIP</button>
          </>
        )}
      </section>
    );
  }
  if (chain.step === "modifier_window") {
    const roll = chain.roll;
    const mine = chain.responders[me];
    const hasHorn = state.players.find((p) => p.playerId === me)?.leaderId === "hts.base.v1.party-leader.the-protecting-horn";
    return (
      <section className="reaction-layer" aria-live="polite">
        <h2>MODIFIER · {roll.kind.replace("_", " ")} · <Countdown deadlineAt={chain.deadlineAt} serverNow={serverNow} /></h2>
        {roll.kind === "challenge" ? (
          <p>
            {name(roll.challengerPlayerId!)} (challenger) {roll.challengerDice!.join("+")} → <b>{roll.challengerTotal}</b> vs {name(roll.rollerPlayerId)} {roll.dice.join("+")} → <b>{roll.total}</b>
          </p>
        ) : (
          <p>
            {name(roll.rollerPlayerId)} rolled {roll.dice.join("+")} → <b>{roll.total}</b>
            {roll.threshold !== undefined && ` (needs ${roll.threshold}+)`}
          </p>
        )}
        <ul>
          {roll.modifiers.map((m) => <li key={m.cardId}>Modifier {signed(m.value)} by {name(m.playerId)}{m.side ? ` → ${m.side}` : ""}</li>)}
          {roll.passives.map((p, i) => <li key={`${p.source}-${i}`}>{p.label}: {signed(p.value)}{p.side ? ` → ${p.side}` : ""}</li>)}
        </ul>
        <p>{Object.entries(chain.responders).map(([id, s]) => `${name(id)}: ${s}`).join(" · ")}</p>
        {mine === "pending" && (
          <>
            {roll.kind === "challenge" && (
              <label>Apply to <select value={side} onChange={(e) => setSide(e.target.value as "challenger" | "defender")}><option value="defender">defender</option><option value="challenger">challenger</option></select></label>
            )}
            {hasHorn && (
              <label> Protecting Horn <select value={hornBonus} onChange={(e) => setHornBonus(Number(e.target.value) as 0 | 1 | -1)}><option value={0}>none</option><option value={1}>+1</option><option value={-1}>-1</option></select></label>
            )}
            {state.yourHand.filter((c) => c.kind === "modifier").flatMap((card) =>
              (card.modifierOptions ?? []).map((value) => (
                <button
                  key={`${card.cardId}${value}`}
                  disabled={pending}
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
                  {card.name}: {signed(value)}
                </button>
              )),
            )}
            <button disabled={pending} onClick={() => send("REACT_PASS", { windowId: chain.windowId })}>SKIP</button>
          </>
        )}
      </section>
    );
  }
  if (chain.step === "immediate_roll_choice") {
    return (
      <section className="reaction-layer">
        <h2>{chain.hero.name} entered the Party · <Countdown deadlineAt={chain.deadlineAt} serverNow={serverNow} /></h2>
        {chain.actorPlayerId === me ? (
          <>
            <p>Roll its effect now (free) or skip. Set targets above if the effect needs them.</p>
            <button disabled={pending} onClick={() => send("IMMEDIATE_ROLL", { choice: "roll", targets })}>ROLL</button>
            <button disabled={pending} onClick={() => send("IMMEDIATE_ROLL", { choice: "skip" })}>SKIP</button>
          </>
        ) : <p>Waiting for {name(chain.actorPlayerId)}.</p>}
      </section>
    );
  }
  // choice
  const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  return (
    <section className="reaction-layer">
      <h2>CHOICE · <Countdown deadlineAt={chain.deadlineAt} serverNow={serverNow} /></h2>
      <p>{name(chain.playerId)}: {chain.prompt}{chain.kind !== "confirm" && ` (${chain.min === chain.max ? chain.max : `${chain.min}–${chain.max}`})`} · timeout = skip</p>
      {chain.playerId === me && chain.kind === "confirm" && (
        <>
          <button disabled={pending} onClick={() => send("RESOLVE_CHOICE", { choiceId: chain.choiceId, cardInstanceIds: [], accept: true })}>YES</button>
          <button disabled={pending} onClick={() => send("RESOLVE_CHOICE", { choiceId: chain.choiceId, cardInstanceIds: [], accept: false })}>NO</button>
        </>
      )}
      {chain.playerId === me && chain.kind !== "confirm" && chain.options && (
        <>
          {chain.options.map((card) => (
            <label key={card.cardId}><input type="checkbox" checked={picked.includes(card.cardId)} onChange={() => toggle(card.cardId)} /> {card.name}</label>
          ))}
          <button disabled={pending} onClick={() => { send("RESOLVE_CHOICE", { choiceId: chain.choiceId, cardInstanceIds: picked }); setPicked([]); }}>CONFIRM</button>
        </>
      )}
    </section>
  );
}

function CardLine({ card }: { card: BaseCardView }) {
  return <span>{card.name} <small>({card.kind.replace("_", " ")})</small></span>;
}

export function BaseRoom({ state, send, pending, serverNow, notice, onLobby }: { state: BaseGameSnapshot; send: Send; pending: boolean; serverNow: number; notice: string; onLobby: () => void }) {
  const game = state.game;
  const me = state.you.playerId;
  const active = game.currentPlayerId === me;
  const ap = game.actionPoints ?? 0;
  const free = active && game.chain === null;
  const [targets, setTargets] = useState<BaseTargets>({});
  const mySeat = state.players.find((p) => p.playerId === me);
  const allSelected = game.phase === "leader_selection" && game.selectionPlayerId === null;
  return (
    <main className="app-shell">
      <header className="review-bar">
        <div><b>HERE TO SLAY</b><span>BASE GAME · ROOM {state.roomCode}</span></div>
        <button onClick={onLobby}>LOBBY</button>
      </header>
      <section className="table-frame" aria-label="Base game table">
        <div className="table-status">
          <span>{game.phase.replaceAll("_", " ").toUpperCase()}</span>
          {game.phase === "turn_active" && <span>TURN {game.turnNumber} · {state.players.find((p) => p.playerId === game.currentPlayerId)?.nickname} · AP {ap}{game.turnRollBonus ? ` · rolls +${game.turnRollBonus}` : ""}</span>}
          <span>DECK {game.mainDeckCount} · DISCARD {game.discardCount} · MONSTER DECK {game.monsterDeckCount}</span>
        </div>

        {game.phase === "game_over" && (
          <h2 role="status">
            WINNER: {state.players.find((p) => p.playerId === game.winnerPlayerId)?.nickname} — {game.winReason === "slay_3" ? "slew 3 Monsters" : "6 classes in Party"}
          </h2>
        )}

        {game.phase === "lobby" && (
          <div className="turn-actions">
            <p>Players: {state.players.map((p) => p.nickname).join(", ")} ({state.players.length}/6). Share room code <b>{state.roomCode}</b>.</p>
            {state.you.isHost && <button disabled={pending || state.players.length < 2} onClick={() => send("BEGIN_LEADER_SELECTION", {})}>BEGIN LEADER SELECTION</button>}
          </div>
        )}

        {game.phase === "leader_selection" && (
          <div className="turn-actions">
            <p>{game.selectionPlayerId ? `Picking: ${state.players.find((p) => p.playerId === game.selectionPlayerId)?.nickname}` : "All Leaders picked."}</p>
            {game.selectionPlayerId === me && game.leaderPool.map((id) => (
              <button key={id} disabled={pending || game.selectedLeaderIds.includes(id)} onClick={() => send("SELECT_PARTY_LEADER", { leaderId: id })}>
                {leaderName(id)}{game.selectedLeaderIds.includes(id) ? " (taken)" : ""}
              </button>
            ))}
            {state.you.isHost && allSelected && <button disabled={pending} onClick={() => send("START_GAME", {})}>START GAME</button>}
          </div>
        )}

        {(game.phase === "turn_active" || game.phase === "game_over") && (
          <>
            <section className="monsters">
              <h2>MONSTERS</h2>
              {game.faceUpMonsters.map((monster) => (
                <div key={monster.cardId}>
                  {monster.name}{" "}
                  <button disabled={pending || !free || ap < 2} onClick={() => send("ATTACK_MONSTER", { monsterInstanceId: monster.cardId })}>ATTACK · 2 AP</button>
                </div>
              ))}
            </section>

            <section className="roster">
              <h2>PLAYERS</h2>
              {state.players.map((player) => (
                <div key={player.playerId}>
                  <b>{player.nickname}{player.playerId === game.currentPlayerId ? " · ACTIVE" : ""}{player.playerId === me ? " (you)" : ""}</b>{" "}
                  Leader: {player.leaderId ? leaderName(player.leaderId) : "—"} · hand {player.handCount} · classes {player.partyClasses.length}/6 ({player.partyClasses.join(", ")})
                  {player.protections.length > 0 && ` · ${player.protections.join(", ")}`}
                  <ul>
                    {player.party.map((entry) => (
                      <li key={entry.hero.cardId}>
                        {entry.hero.name} [{entry.classes.join("/")}]{entry.item ? ` + ${entry.item.name}` : ""}
                        {player.playerId === me && (
                          <button
                            disabled={pending || !free || ap < 1 || game.heroRollsUsed.includes(entry.hero.cardId)}
                            onClick={() => send("USE_HERO_EFFECT", { heroInstanceId: entry.hero.cardId, targets })}
                          >
                            ROLL EFFECT · 1 AP
                          </button>
                        )}
                      </li>
                    ))}
                    {player.slainMonsters.map((monster) => <li key={monster.cardId}>Slain: {monster.name}</li>)}
                  </ul>
                </div>
              ))}
            </section>

            <ChainPanel state={state} send={send} pending={pending} serverNow={serverNow} targets={targets} />

            <section className="hand" aria-label="Your hand">
              <h2>YOUR HAND</h2>
              {state.yourHand.map((card) => (
                <div key={card.cardId}>
                  <CardLine card={card} />{" "}
                  {(card.kind === "hero" || card.kind === "item" || card.kind === "cursed_item" || card.kind === "magic") && (
                    <button disabled={pending || !free || ap < 1} onClick={() => send("PLAY_HAND_CARD", { cardInstanceId: card.cardId, targets })}>PLAY · 1 AP</button>
                  )}
                </div>
              ))}
            </section>

            {active && game.phase === "turn_active" && (
              <div className="turn-actions">
                <TargetPicker state={state} value={targets} onChange={setTargets} />
                <button disabled={pending || !free || ap < 1} onClick={() => send("DRAW_CARD", {})}>DRAW · 1 AP</button>
                <button disabled={pending || !free || ap < 3} onClick={() => send("REDRAW_HAND", {})}>REDRAW · 3 AP</button>
                {mySeat?.leaderId === "hts.base.v1.party-leader.the-shadow-claw" && (
                  <button disabled={pending || !free || ap < 1 || !targets.playerId} onClick={() => send("LEADER_ACTION", { targetPlayerId: targets.playerId })}>SHADOW CLAW PULL · 1 AP</button>
                )}
                <button disabled={pending || !free} onClick={() => send("END_TURN", {})}>END TURN</button>
                <button onClick={() => setTargets({})}>CLEAR TARGETS</button>
              </div>
            )}

            <section aria-label="Game log">
              <h2>LOG</h2>
              <ol>{game.log.slice(-12).map((entry) => <li key={entry.seq}>{entry.text}</li>)}</ol>
            </section>
          </>
        )}
      </section>
      <p className="sr-note" role="status">{notice || "Server snapshot is authoritative. Card data from community sources; rights UNVERIFIED."}</p>
    </main>
  );
}
