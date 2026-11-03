import { useEffect, useMemo, useState } from "react";
import { clearSession, command, createRoom, joinRoom, loadSession, saveSession, snapshot, type Session } from "./api";
import type { EffectDemoSnapshot, SetupDemoSnapshot } from "@here-to-slay/protocol";
import { BaseRoom } from "./BaseRoom";

type Scene = "table" | "modifier" | "challenge" | "versus";
type View = "lobby" | "preview";
type CloseReason = "all-completed" | "deadline" | null;
type Player = { id: string; name: string; hasModifier: boolean; hasChallenge: boolean; isActor: boolean; status: "waiting" | "completed" };

const createPlayers = (): Player[] => [
  { id: "p1", name: "You", hasModifier: true, hasChallenge: false, isActor: false, status: "waiting" },
  { id: "p2", name: "Mica", hasModifier: false, hasChallenge: true, isActor: true, status: "waiting" },
  { id: "p3", name: "Rune", hasModifier: true, hasChallenge: false, isActor: false, status: "waiting" },
  { id: "p4", name: "Sol", hasModifier: false, hasChallenge: true, isActor: false, status: "waiting" },
  { id: "p5", name: "Ari", hasModifier: true, hasChallenge: false, isActor: false, status: "waiting" },
  { id: "p6", name: "Kite", hasModifier: false, hasChallenge: false, isActor: false, status: "waiting" },
];
const sceneLabels: Record<Scene, string> = { table: "Table", modifier: "Hero roll + Modifier", challenge: "Challenge prompt", versus: "Challenge versus" };

function Card({ className = "", label = "CARD" }: { className?: string; label?: string }) {
  return <div className={`card ${className}`} aria-label={`${label} placeholder card`}>
<span>◇</span>
<strong>{label}</strong>
<small>DEMO</small>
</div>;
}
function Stat({ label, value }: { label: string; value: string }) {
  return <div className="stat">
<small>{label}</small>
<strong>{value}</strong>
</div>;
}

function SetupRoom({ state, pending, send }: { state: SetupDemoSnapshot; pending: boolean; send: (kind: string, payload: object) => void }) {
  const setup = state.setup;
  const canSelect = setup.phase === "leader_selection" && setup.selectionPlayerId === state.you.playerId;
  const canStart = state.you.isHost && setup.phase === "leader_selection" && setup.selectionPlayerId === null;
  const active = setup.currentPlayerId === state.you.playerId;
  const ap = setup.actionPoints ?? 0;
  const availableLeaders = setup.leaderPool.filter((id) => !setup.selectedLeaderIds.includes(id));
  return <section className="table-frame" aria-label="Synthetic setup demo"><div className="table-status"><span>ROOM {state.roomCode}</span><span>{state.demoLabel}</span><span>{setup.phase.replaceAll("_", " ")}</span></div><div className="table-surface"><div className="monsters"><p>3 SYNTHETIC MONSTERS</p>{setup.faceUpMonsterIds.map((id) => <Card key={id} label="FIXTURE"/>)}</div><div className="your-party"><div className="avatar you">Y</div><div><b>{state.you.nickname}</b><small>{active ? "CURRENT TURN" : canSelect ? "SELECT LEADER" : "WAITING"}</small></div></div><aside className="roster setup-roster"><h2>ROOM PLAYERS</h2>{state.players.map((player) => <div key={player.playerId}><span>{player.nickname}{player.playerId === setup.selectionPlayerId ? " · SELECTOR" : player.playerId === setup.currentPlayerId ? " · ACTIVE" : ""}</span><em>{player.leaderId && `Leader ${player.leaderId.replace("fixture.setup.leader.", "")} · `}HAND {player.handCount}</em></div>)}</aside></div><div className="hand">{state.yourHand.map((card) => <Card key={card.cardId} label="FIXTURE"/>)}</div><div className="turn-actions">{state.you.isHost && setup.phase === "lobby" && <button disabled={pending} onClick={() => send("BEGIN_LEADER_SELECTION", {})}>BEGIN LEADER SELECTION</button>}{canSelect && <div className="leader-options">{setup.leaderPool.map((id) => <button key={id} disabled={pending || !availableLeaders.includes(id)} onClick={() => send("SELECT_PARTY_LEADER", { leaderId: id })}>{id.replace("fixture.setup.", "")} {setup.selectedLeaderIds.includes(id) ? "TAKEN" : "SELECT"}</button>)}</div>}{canStart && <button disabled={pending} onClick={() => send("START_GAME", {})}>START GAME</button>}{setup.phase === "turn_active" && <><button disabled={pending || !active || ap < 1} onClick={() => send("DRAW_CARD", {})}>DRAW · 1 AP</button><button disabled={pending || !active || ap < 3} onClick={() => send("REDRAW_HAND", {})}>REDRAW · 3 AP</button><button disabled={pending || !active} onClick={() => send("END_TURN", {})}>END TURN</button></>}</div><p className="sr-note">TURN {setup.turnNumber} · AP {ap} · deck {setup.mainDeckCount} · discard {setup.discardCount}. Synthetic fixture only; base effects and expansion are unsupported.</p></section>;
}

const effectLabel = (fixtureDefinitionId: string) => fixtureDefinitionId.includes("critical-boost") ? "CRITICAL BOOST" : fixtureDefinitionId.includes("dodgy-dealer") ? "DODGY DEALER" : fixtureDefinitionId.includes("challenge") ? "CHALLENGE" : fixtureDefinitionId.includes("modifier") ? "MODIFIER" : "FIXTURE";

const effectCardLabel = (card: EffectDemoSnapshot["yourHand"][number]) => card.kind === "modifier" ? "MODIFIER" : card.kind === "challenge" ? "CHALLENGE" : effectLabel(card.fixtureDefinitionId);
const modifierTargetLabel = (target: "actor" | "challenger" | "hero") => target === "actor" ? "ACTOR" : target === "challenger" ? "CHALLENGER" : "HERO";

function EffectRoom({ state, pending, send, serverNow }: { state: EffectDemoSnapshot; pending: boolean; send: (kind: string, payload: object) => void; serverNow: number }) {
  const { effect, pendingPlay } = state;
  const reaction = state.reaction as NonNullable<EffectDemoSnapshot["reaction"]>;
  const active = effect.currentPlayerId === state.you.playerId;
  const reactionOpen = Boolean(reaction && !reaction.resolved);
  const deadlineAt = pendingPlay?.choiceDeadlineAt ?? reaction?.deadlineAt;
  const seconds = deadlineAt === undefined || deadlineAt === null ? null : Math.max(0, Math.ceil((deadlineAt - serverNow) / 1000));
  const ownParty = state.players.find((player) => player.playerId === state.you.playerId)?.party ?? [];
  const others = state.players.filter((player) => player.playerId !== state.you.playerId);
  const reactionComplete = Boolean(reaction?.youCompleted);
  const canEndTurn = active && effect.phase === "turn_active" && !pendingPlay && !reactionOpen;
  const canChoose = Boolean(pendingPlay?.youMustChoose && !reactionOpen);
  return <main className="app-shell"><header className="review-bar"><div><b>HERE TO SLAY</b><span>EFFECT DEMO · SYNTHETIC TWO-CARD FIXTURE</span></div><button onClick={() => location.reload()}>REFRESH SNAPSHOT</button></header><section className="effect-frame" aria-label="Synthetic effect demo"><div className="table-status"><span>ROOM {state.roomCode}</span><span>TURN {effect.turnNumber} · AP {effect.actionPoints ?? 0}</span><span>{pendingPlay ? `${pendingPlay.phase.replaceAll("_", " ")} · ${seconds ?? 0}s` : reactionOpen ? `${reaction.kind.toUpperCase()} · ${seconds ?? 0}s` : effect.phase.replaceAll("_", " ")}</span></div><div className="effect-board"><section><h2>YOUR HAND · PRIVATE</h2><div className="effect-cards">{state.yourHand.map((card) => <div key={card.instanceId} className="effect-card"><b>{effectCardLabel(card)}</b><small>{card.kind.toUpperCase()} · SYNTHETIC</small>{card.modifier && <small>{card.modifier.delta >= 0 ? "+" : ""}{card.modifier.delta} · {modifierTargetLabel(card.modifier.rollTarget)}</small>}{active && !pendingPlay && (card.kind === "magic" || card.kind === "hero") && <button disabled={pending} onClick={() => send("PLAY_CARD", { cardInstanceId: card.instanceId })}>PLAY · 1 AP</button>}</div>)}</div></section><aside className="effect-roster"><h2>PARTY / HAND COUNTS</h2>{state.players.map((player) => <div key={player.playerId}><b>{player.nickname}{player.playerId === effect.currentPlayerId ? " · ACTIVE" : ""}</b><span>HAND {player.handCount}</span>{player.party.map((hero) => <small key={hero.instanceId}>{effectLabel(hero.fixtureDefinitionId)} · PARTY</small>)}</div>)}</aside><section className="effect-status"><p>DECK {effect.mainDeckCount} · DISCARD {effect.discardCount}</p><p>{pendingPlay ? `PENDING ${effectLabel(pendingPlay.cardFixtureDefinitionId)} · ${pendingPlay.phase.replaceAll("_", " ")}` : "NO PENDING EFFECT"}</p>{state.heroRoll && <p>SERVER ROLL {state.heroRoll.raw.join(" + ")} · TOTAL {state.heroRoll.finalTotal ?? "PENDING"} · TARGET {state.heroRoll.threshold}</p>}</section></div>{state.you.isHost && effect.phase === "lobby" && <div className="effect-actions"><button disabled={pending} onClick={() => send("START_EFFECT_DEMO", {})}>START EFFECT DEMO</button></div>}{canChoose && pendingPlay?.phase === "critical_boost_discard" && <div className="effect-actions"><p>CHOOSE ONE PRIVATE HAND CARD TO DISCARD · {seconds ?? 0}s</p>{state.yourHand.map((card) => <button key={card.instanceId} disabled={pending} onClick={() => send("CHOOSE_CRITICAL_BOOST_DISCARD", { attemptId: pendingPlay.attemptId, cardInstanceId: card.instanceId })}>DISCARD {effectCardLabel(card)}</button>)}</div>}{canChoose && pendingPlay?.phase === "dodgy_roll_choice" && <div className="effect-actions"><p>DODGY DEALER · CHOOSE IMMEDIATE EFFECT · {seconds ?? 0}s</p><button disabled={pending} onClick={() => send("CHOOSE_DODGY_DEALER_IMMEDIATE", { attemptId: pendingPlay.attemptId, choice: "skip" })}>SKIP</button>{others.map((player) => <button key={player.playerId} disabled={pending} onClick={() => send("CHOOSE_DODGY_DEALER_IMMEDIATE", { attemptId: pendingPlay.attemptId, choice: "roll", targetPlayerId: player.playerId })}>ROLL VS {player.nickname}</button>)}</div>}{reactionOpen && reaction && <div className="effect-actions"><p>{reaction.kind.toUpperCase()} WINDOW · {seconds ?? 0}s · SERVER DEADLINE</p>{reaction.kind === "challenge" && state.yourHand.filter((card) => card.kind === "challenge").map((card) => <button key={card.instanceId} disabled={pending || reactionComplete || reaction.actorPlayerId === state.you.playerId} onClick={() => send("PLAY_CHALLENGE", { windowId: reaction.windowId, cardId: card.instanceId })}>PLAY CHALLENGE</button>)}{reaction.kind === "modifier" && state.yourHand.filter((card) => card.kind === "modifier").map((card) => <button key={card.instanceId} disabled={pending || reactionComplete} onClick={() => send("PLAY_MODIFIER", { windowId: reaction.windowId, cardId: card.instanceId })}>PLAY MODIFIER {card.modifier ? `${card.modifier.delta >= 0 ? "+" : ""}${card.modifier.delta} · ${modifierTargetLabel(card.modifier.rollTarget)}` : ""}</button>)}<button disabled={pending || reactionComplete} onClick={() => send("SKIP_REACTION", { windowId: reaction.windowId })}>SKIP REACTION</button></div>}{active && !pendingPlay && !reactionOpen && <div className="effect-actions">{ownParty.filter((hero) => hero.fixtureDefinitionId.includes("dodgy-dealer")).map((hero) => state.yourHeroAllowance[hero.instanceId] === "available" ? others.map((player) => <button key={`${hero.instanceId}-${player.playerId}`} disabled={pending} onClick={() => send("ROLL_HERO_EFFECT", { heroInstanceId: hero.instanceId, targetPlayerId: player.playerId })}>PAID DODGY ROLL VS {player.nickname} · 1 AP</button>) : <small key={hero.instanceId}>DODGY DEALER ALLOWANCE USED THIS TURN</small>)}</div>}{canEndTurn && <div className="effect-actions effect-end-turn"><button disabled={pending} onClick={() => send("END_TURN", {})}>END TURN · FORFEIT REMAINING AP</button></div>}<p className="sr-note" role="status">Synthetic effect-demo only. Server snapshot is authoritative; card sources and rights remain UNVERIFIED.</p></section></main>;
}

function PreviewApp() {
  const [scene, setScene] = useState<Scene>("table");
  const [view, setView] = useState<View>("preview");
  const [capacity, setCapacity] = useState("4");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [lobbyNotice, setLobbyNotice] = useState("Server room API contract is not available yet. No room has been created or joined.");
  const [players, setPlayers] = useState(createPlayers);
  const [selectedId, setSelectedId] = useState("p1");
  const [seconds, setSeconds] = useState(20);
  const [closeReason, setCloseReason] = useState<CloseReason>(null);
  const reacting = scene !== "table";
  const reactionPlayers = players.slice(0, Number(capacity));
  const selected = reactionPlayers.find((player) => player.id === selectedId) ?? reactionPlayers[0];
  const allCompleted = reactionPlayers.every((player) => player.status === "completed");
  const live = reacting && closeReason === null && seconds > 0;
  const visibleOpponents = useMemo(() => ["Mica", "Rune", "Sol", "Ari", "Kite"].slice(0, Number(capacity) - 1), [capacity]);

  const restartFixture = () => { setPlayers(createPlayers()); setSelectedId("p1"); setSeconds(20); setCloseReason(null); };
  const selectScene = (next: Scene) => { setScene(next); restartFixture(); };
  const complete = (kind: "modifier" | "skip") => {
    if (!live || selected.status === "completed" || (kind === "modifier" && !selected.hasModifier)) return;
    setPlayers((current) => current.map((player) => player.id === selected.id ? { ...player, status: "completed" } : player));
  };
  const playChallenge = () => {
    if (!live || selected.isActor || !selected.hasChallenge || selected.status === "completed") return;
    // Demo only: server validates first-valid-wins and rolls both sides.
    setScene("versus"); restartFixture();
  };

  useEffect(() => { if (!reactionPlayers.some((player) => player.id === selectedId)) setSelectedId(reactionPlayers[0].id); }, [capacity, reactionPlayers, selectedId]);
  useEffect(() => { if (!live) return;
const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000); return () => window.clearInterval(timer); }, [live]);
  useEffect(() => { if (reacting && closeReason === null && seconds === 0) setCloseReason("deadline"); }, [closeReason, reacting, seconds]);
  useEffect(() => { if (reacting && closeReason === null && allCompleted) setCloseReason("all-completed"); }, [allCompleted, closeReason, reacting]);
  const closedLabel = closeReason === "deadline" ? "WINDOW CLOSED · DEADLINE" : closeReason === "all-completed" ? "WINDOW CLOSED · ALL COMPLETED" : null;

  if (view === "lobby") return <main className="lobby-shell">
<section className="lobby-panel" aria-labelledby="lobby-title">
<span className="lobby-kicker">LOCAL REACTION SLICE · UI ONLY</span>
<h1 id="lobby-title">HERE TO SLAY</h1>
<p>Choose a nickname, then create or join a room when the server contract is available. No account is required. Base rooms support 2–6 players; expansion support is not implemented.</p>
<div className="lobby-grid">
<form className="lobby-card" onSubmit={(event) => { event.preventDefault(); setLobbyNotice("Create room is waiting for the server API contract; nothing was created."); }}>
<h2>CREATE ROOM</h2>
<label>Nickname<input required value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Display name" maxLength={24}/>
</label>
<button type="submit" disabled={!nickname.trim()}>CREATE (UNAVAILABLE)</button>
</form>
<form className="lobby-card" onSubmit={(event) => { event.preventDefault(); setLobbyNotice("Join room is waiting for the server API contract; no session was sent."); }}>
<h2>JOIN ROOM</h2>
<label>Nickname<input required value={nickname} onChange={(event) => setNickname(event.target.value)} placeholder="Display name" maxLength={24}/>
</label>
<label>Room code<input required value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="e.g. ABCD" maxLength={12}/>
</label>
<button type="submit" disabled={!nickname.trim() || !roomCode.trim()}>JOIN (UNAVAILABLE)</button>
</form>
</div>
<button className="expansion" disabled>+ Expansion → max 8 (not supported)</button>
<p className="lobby-notice" role="status">{lobbyNotice}</p>
<button className="lobby-preview" onClick={() => setView("preview")}>OPEN APPROVED DESIGN PREVIEW (LOCAL MOCK)</button>
</section>
</main>;

  return <main className="app-shell">
    <header className="review-bar">
<div>
<b>HERE TO SLAY</b>
<span>APPROVED DESIGN PREVIEW · LOCAL MOCK</span>
</div>
<button onClick={() => setView("lobby")}>LOBBY</button>
<label>Scene <select aria-label="Select mock scene" value={scene} onChange={(event) => selectScene(event.target.value as Scene)}>{Object.entries(sceneLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
</label>
<label>Base seats <select aria-label="Select base player count" value={capacity} onChange={(event) => { setCapacity(event.target.value); restartFixture(); }}>
<option value="2">2</option>
<option value="4">4</option>
<option value="6">6</option>
</select>
</label>
<button className="expansion" disabled aria-label="Expansion seating is not implemented">+ Expansion → max 8 (not supported)</button>
</header>
    <section className="table-frame" aria-label="Demo tabletop">
<div className="table-status">
<span>ROOM DEMO-42</span>
<span>BASE {capacity} PLAYERS</span>
<span>YOUR TURN · 2 / 3 AP</span>
</div>
<div className="table-surface">{visibleOpponents.map((name, index) => <div key={name} className={`seat seat-${index + 1}`}>
<div className="avatar">{name[0]}</div>
<b>{name}</b>
<small>party / status</small>
</div>)}<div className="piles">
<button aria-label="Demo draw pile">DRAW<br/>
<small>DECK</small>
</button>
<button aria-label="Demo discard pile">DISCARD</button>
</div>
<div className="monsters">
<p>3 MONSTERS</p>
<Card label="MONSTER"/>
<Card label="MONSTER"/>
<Card label="MONSTER"/>
</div>
<div className="your-party">
<div className="avatar you">Y</div>
<div>
<b>YOU · PARTY</b>
<small>Leader + placeholder heroes</small>
</div>
</div>
</div>
<div className="hand" aria-label="Demo hand">
<Card/>
<Card/>
<Card/>
<Card/>
</div>
<div className="turn-actions">
<button>DRAW</button>
<button>REDEAL</button>
<button>END TURN</button>
</div>
      {reacting && <div className="reaction-layer" aria-live="polite">
<div className="reaction-heading">
<span>{scene === "modifier" ? "HERO ROLL / MODIFIER" : scene === "challenge" ? "CHALLENGE?" : "CHALLENGE VERSUS"}</span>
<strong>{closedLabel ?? `${seconds}s`}</strong>
<small>{closedLabel ?? "Shared deadline · reactions never reset it"}</small>
</div>
<Card className="active-card" label={scene === "modifier" ? "ACTIVE HERO" : "ACTIVE PLAY"}/>{scene === "modifier" && <section className="roll-stats" aria-label="Demo roll totals">
<Stat label="ROLLED" value="?"/>
<Stat label="MODIFIER" value="±?"/>
<Stat label="TOTAL" value="?"/>
<Stat label="REQUIRED" value="?"/>
<div className="dice">? ?</div>
<p>Server result placeholder; client is not authoritative.</p>
</section>}{scene === "challenge" && <p className="challenge-copy">Challenge is only for a Hero, Item, or Magic play — never a Hero-effect roll.</p>}{scene === "versus" && <section className="versus" aria-label="Challenge versus demo">
<div>
<b>ACTOR</b>
<Stat label="ROLL / MOD / TOTAL" value="? / ±? / ?"/>
</div>
<strong>VS</strong>
<div>
<b>CHALLENGER</b>
<Stat label="ROLL / MOD / TOTAL" value="? / ±? / ?"/>
</div>
<p>Server rolls both sides; dice animation is display-only.</p>
</section>}<aside className="roster" aria-label="Reaction player roster">
<h2>REACTION ROSTER</h2>{reactionPlayers.map((player) => <button key={player.id} className={selectedId === player.id ? "selected" : ""} onClick={() => setSelectedId(player.id)}>
<span>{player.name}{player.isActor && " · ACTOR"}</span>
<em>{player.status === "completed" ? "COMPLETED" : "WAITING"}</em>
</button>)}<small>Everyone participates; no-card players can Skip.</small>
</aside>
<div className="reaction-controls">
<span>Selected: <b>{selected.name}</b>
</span>{scene === "challenge" ? <button disabled={!live || selected.isActor || !selected.hasChallenge || selected.status === "completed"} onClick={playChallenge}>PLAY CHALLENGE</button> : <button disabled={!live || !selected.hasModifier || selected.status === "completed"} onClick={() => complete("modifier")}>USE 1 MODIFIER</button>}<button disabled={!live || selected.status === "completed"} onClick={() => complete("skip")}>SKIP</button>
<button className="restart" onClick={restartFixture}>RESTART DEMO</button>
</div>
</div>}
    </section>
<p className="sr-note">Demo controls change local mock state only. Networking, legal-card validation, timer authority, player identity, and game effects require Worker/protocol integration.</p>
  </main>;
}

export function App() {
  const [mode, setMode] = useState<"lobby" | "room" | "preview">(() => loadSession() ? "room" : "lobby");
  const [nickname, setNickname] = useState("");
const [roomCode, setRoomCode] = useState("");
  const [createMode, setCreateMode] = useState<"base" | "reaction_demo" | "setup_demo" | "effect_demo">("base");
  const [session, setSession] = useState<Session | null>(() => loadSession());
  const [notice, setNotice] = useState(() => session ? "" : "Choose a nickname to create or join a room.");
const [pending, setPending] = useState(false);
  const [localNow, setLocalNow] = useState(Date.now());
  const accept = (next: Session, clearNotice = true) => { saveSession(next); setSession(next); setMode("room"); if (clearNotice) setNotice(""); };
  const connect = async (kind: "create" | "join") => { setPending(true); setNotice(""); try { accept(kind === "create" ? await createRoom(nickname.trim(), createMode) : await joinRoom(roomCode.trim(), nickname.trim())); } catch (error) { setNotice(error instanceof Error ? error.message : "Connection failed."); } finally { setPending(false); } };
  useEffect(() => { if (!session || mode !== "room") return;
const poll = window.setInterval(async () => { try { const next = await snapshot(session.roomCode, session.sessionToken); accept({ ...session, snapshot: next.snapshot, receivedAt: Date.now() }, false); } catch (error) { clearSession(); setSession(null); setMode("lobby"); setNotice(error instanceof Error ? error.message : "Session is no longer valid. Join a room again."); } }, 1000); return () => window.clearInterval(poll); }, [mode, session]);
  useEffect(() => { if (mode !== "room") return;
const tick = window.setInterval(() => setLocalNow(Date.now()), 250); return () => window.clearInterval(tick); }, [mode]);
  if (mode === "preview") return <PreviewApp />;
  if (mode === "room" && session) { const state = session.snapshot;
const send = async (kind: string, payload: object) => { setPending(true); try { let result = await command(state.roomCode, session.sessionToken, crypto.randomUUID(), state.revision, kind, payload); if (!result.outcome.accepted && result.outcome.code === "STALE_REVISION") result = await command(state.roomCode, session.sessionToken, crypto.randomUUID(), result.snapshot.revision, kind, payload); /* one retry: the board moved (e.g. a bot acted); the server re-validates the command */ accept({ ...session, snapshot: result.snapshot, receivedAt: Date.now() }, result.outcome.accepted); if (!result.outcome.accepted) setNotice(`Command rejected: ${result.outcome.code}. Refreshed from the server.`); } catch (error) { setNotice(error instanceof Error ? error.message : "Command failed."); } finally { setPending(false); } };
if (state.mode === "base") return <BaseRoom state={state} send={send} pending={pending} serverNow={state.serverNow + (localNow - session.receivedAt)} notice={notice} onLobby={() => setMode("lobby")} />;
if (state.mode === "setup_demo") return <main className="app-shell"><header className="review-bar"><div><b>HERE TO SLAY</b><span>SETUP DEMO · SERVER SNAPSHOT</span></div><button onClick={() => setMode("lobby")}>LOBBY</button></header><SetupRoom state={state} pending={pending} send={send}/><p className="sr-note" role="status">{notice || "Personalized synthetic setup state from server."}</p></main>;
if (state.mode === "effect_demo") return <><EffectRoom state={state} pending={pending} send={send} serverNow={state.serverNow + (localNow - session.receivedAt)} />{notice && <p className="sr-note" role="status">{notice}</p>}</>;
const reaction = state.reaction;
const estimatedServerNow = state.serverNow + (localNow - session.receivedAt);
const secondsRemaining = reaction ? Math.max(0, Math.ceil((reaction.deadlineAt - estimatedServerNow) / 1000)) : null;
const disabledBySnapshot = Boolean(reaction?.resolved || reaction?.youCompleted);
const modifier = state.yourHand.find((card) => card.kind === "modifier");
const challenge = state.yourHand.find((card) => card.kind === "challenge"); return <main className="app-shell">
<header className="review-bar">
<div>
<b>HERE TO SLAY</b>
<span>REACTION DEMO · SERVER SNAPSHOT</span>
</div>
<button onClick={() => setMode("lobby")}>LOBBY</button>
</header>
<section className="table-frame">
<div className="table-status">
<span>ROOM {state.roomCode}</span>
<span>REVISION {state.revision}</span>
<span>{reaction ? `${reaction.kind.toUpperCase()} · ${secondsRemaining}s` : "WAITING FOR HOST DEMO"}</span>
</div>
<div className="table-surface">
<div className="monsters">
<p>SERVER DEMO TABLE</p>
<Card label="FIXTURE"/>
<Card label="FIXTURE"/>
<Card label="FIXTURE"/>
</div>
<div className="your-party">
<div className="avatar you">Y</div>
<div>
<b>{state.you.nickname}</b>
<small>Personalized server view</small>
</div>
</div>
</div>
<div className="hand">{state.yourHand.map((card) => <Card key={card.cardId} label={card.kind.toUpperCase()}/>)}</div>{reaction && <div className="reaction-layer">
<div className="reaction-heading">
<span>{reaction.kind.toUpperCase()} WINDOW</span>
<strong>{reaction.resolved ? `CLOSED · ${reaction.closeReason ?? "SERVER"}` : `${secondsRemaining}s`}</strong>
<small>Countdown uses server time offset; snapshot closed state is final.</small>
</div>
<aside className="roster">
<h2>REACTION ROSTER</h2>{state.players.map((player) => <div key={player.playerId}>
<span>{player.nickname}</span>
<em>{reaction.completedPlayerIds.includes(player.playerId) ? "COMPLETED" : "WAITING"}</em>
</div>)}</aside>
{state.challengeRoll && <p className="sr-note">SERVER DICE · actor {state.challengeRoll.playedByDice.join(" + ")} · challenger {state.challengeRoll.challengerDice.join(" + ")}</p>}
{state.fixtureTotals && <p className="sr-note">FIXTURE TOTALS · base {state.fixtureTotals.baseTotal} · modifier {state.fixtureTotals.modifierTotal} · final {state.fixtureTotals.finalTotal}</p>}
<div className="reaction-controls">{reaction.kind === "modifier" && <button disabled={!modifier || pending || disabledBySnapshot} onClick={() => send("PLAY_MODIFIER", { windowId: reaction.windowId, cardId: modifier?.cardId })}>USE 1 MODIFIER</button>}{reaction.kind === "challenge" && <button disabled={!challenge || pending || disabledBySnapshot || reaction.actorPlayerId === state.you.playerId} onClick={() => send("PLAY_CHALLENGE", { windowId: reaction.windowId, cardId: challenge?.cardId })}>PLAY CHALLENGE</button>}<button disabled={pending || disabledBySnapshot} onClick={() => send("SKIP_REACTION", { windowId: reaction.windowId })}>SKIP</button>
</div>
</div>} {state.you.isHost && !reaction && <div className="turn-actions">
<button disabled={pending} onClick={() => send("OPEN_REACTION_DEMO", { reactionKind: "modifier" })}>OPEN MODIFIER DEMO</button>
<button disabled={pending} onClick={() => send("OPEN_REACTION_DEMO", { reactionKind: "challenge" })}>OPEN CHALLENGE DEMO</button>
</div>}</section>
<p className="sr-note" role="status">{notice || "Server state is personalized; no other hand or token is shown."}</p>
</main>; }
  return <main className="lobby-shell">
<section className="lobby-panel">
<span className="lobby-kicker">BASE GAME</span>
<h1>HERE TO SLAY</h1>
<p>Nickname and room code only. No account. Base rooms support 2–6 players.</p>
<div className="lobby-grid">
<form className="lobby-card" onSubmit={(event) => { event.preventDefault(); void connect("create"); }}>
<h2>CREATE ROOM</h2>
<label>Nickname<input required value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={24}/>
</label>
<label>Mode<select value={createMode} onChange={(event) => setCreateMode(event.target.value as "base" | "reaction_demo" | "setup_demo" | "effect_demo")}><option value="base">Base game (2–6 players)</option><option value="reaction_demo">Reaction demo</option><option value="setup_demo">Setup demo · synthetic</option><option value="effect_demo">Effect demo · synthetic two cards</option></select></label>
<button disabled={pending || !nickname.trim()}>CREATE ROOM</button>
</form>
<form className="lobby-card" onSubmit={(event) => { event.preventDefault(); void connect("join"); }}>
<h2>JOIN ROOM</h2>
<label>Nickname<input required value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={24}/>
</label>
<label>Room code<input required value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} maxLength={12}/>
</label>
<button disabled={pending || !nickname.trim() || !roomCode.trim()}>JOIN ROOM</button>
</form>
</div>
<button className="expansion" disabled>+ Expansion → max 8 (not supported)</button>
<p className="lobby-notice" role="status">{notice}</p>
<button className="lobby-preview" onClick={() => setMode("preview")}>OPEN APPROVED DESIGN PREVIEW (LOCAL MOCK)</button>
<a className="base-collection-link" href={`${import.meta.env.BASE_URL}?cards`}>BROWSE BASE CARD COLLECTION →</a>
</section>
</main>;
}
