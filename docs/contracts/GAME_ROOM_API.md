# GAME_ROOM_API — real base game room (mode `base`)

Task: GAME-001 + GAME-002 (2026-11-02). Owner: Architecture. Status: IMPLEMENTED — setup, DRAW/REDRAW/END_TURN, full turn loop (play/challenge/modifier/hero roll/attack/choices). Win (GAME-003): see “Win / GAME_OVER”.

Types: `packages/protocol/src/game/base.ts` (`BaseGameSnapshot`, `BaseGameCommand`, `BaseCardView`), re-exported from `@here-to-slay/protocol`. `RoomSnapshot = RoomSliceSnapshot | BaseGameSnapshot`.
Rules: `docs/rules/BASE_SPEC.md` RULE-01..05, `docs/rules/SETUP_VERIFIED.md`. Cards: CAT-001 reference catalog (`apps/worker/src/content/`), IDs/kinds only, rights UNVERIFIED, no artwork.

## Endpoints

Same routes as the demo slices; mode is chosen at create time and fixed for the room.

| Method | Path | Auth | Body | Success |
|---|---|---|---|---|
| POST | `/api/rooms` | — | `{ "nickname": string, "mode": "base" }` | 201 `{ roomCode, sessionToken, snapshot }` |
| POST | `/api/rooms/:code/join` | — | `{ "nickname": string }` | 201 `{ roomCode, sessionToken, snapshot }` |
| GET | `/api/rooms/:code/snapshot` | `Bearer <sessionToken>` | — | 200 `{ snapshot }` |
| POST | `/api/rooms/:code/commands` | `Bearer <sessionToken>` | command (below) | 200 `{ outcome, snapshot }` |

- Room code: 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, server-generated; path code is case-insensitive.
- Nickname: NFKC + trim, 1–24 printable chars, unique per room case-insensitively.
- Reconnect/reload: keep `sessionToken` client-side and call `snapshot` with it; the same seat (`you.playerId`) is returned. Only the SHA-256 hash of the token is stored.
- Create accepts only `nickname` and `mode`; any other key (e.g. `enabledSetIds`, `capacity`, `reactionSeconds`) → 409 `EXPANSION_UNSUPPORTED`. Omitting `mode` still defaults to `reaction_demo` for backward compatibility.
- Body limit 4 KiB. Rate limits: create 10/min/IP (Worker), join 30/min/room, snapshot 180/min/session, commands 120/min/session.

## Commands

Envelope: `{ commandId: string, expectedRevision: number, kind, payload }`.
`commandId` is idempotent per player: same id + same kind/payload → stored outcome with `replayed: true`; same id + different body → `IDEMPOTENCY_CONFLICT`. `expectedRevision` must equal the current room `revision`, else `STALE_REVISION` (nothing changes). Joins also bump `revision`.

| kind | payload | Who / when | Effect |
|---|---|---|---|
| `BEGIN_LEADER_SELECTION` | `{}` | host, `lobby`, 2–6 players | phase → `leader_selection`; selection order = join order; joins locked |
| `SELECT_PARTY_LEADER` | `{ leaderId }` | current selector | assigns a unique Leader (catalog `party_leader` definitionId) |
| `START_GAME` | `{}` | host, all seats selected | shuffle 115-card main deck, deal 5 each, shuffle 15 Monsters, 3 face-up; last selector goes first, then join order; 3 AP |
| `DRAW_CARD` | `{}` | current player, ≥1 AP | draw 1, −1 AP |
| `REDRAW_HAND` | `{}` | current player, ≥3 AP | discard whole hand (if any), draw 5, −3 AP |
| `END_TURN` | `{}` | current player | next player clockwise, fresh 3 AP (no carry-over) |

| `PLAY_HAND_CARD` | `{ cardInstanceId, targets? }` | current player, ≥1 AP, nothing pending | Hero/Item/Cursed Item/Magic from hand → `pending`, −1 AP, opens Challenge window (skipped if uncatchable: Iron Resolve, Warworn Owlbear for Items). Item target `targets.heroInstanceIds[0]`: Item → own Hero, Cursed → any Hero (Q-06), Hero without Item. Magic targets per card `target` rule (Q-08) |
| `USE_HERO_EFFECT` | `{ heroInstanceId, targets? }` | current player, ≥1 AP | once per Hero per turn; −1 AP; server rolls 2d6 (Q-10) → Modifier window → effect if total ≥ threshold. Sealing Key → `HERO_EFFECT_BLOCKED` |
| `IMMEDIATE_ROLL` | `{ choice: "roll"\|"skip", targets? }` | actor, after own Hero entered Party | free roll of that Hero's effect (consumes its allowance) or skip; timeout = skip |
| `ATTACK_MONSTER` | `{ monsterInstanceId }` | current player, ≥2 AP | face-up Monster; requirement checked now (Q-12, Leader never fills a slot by default — Q-01); −2 AP; roll → Modifier window → SLAY (to `slainMonsters`, refill from Monster deck unless empty — Q-09) / PENALTY (choice) / nothing |
| `REACT_CHALLENGE` | `{ windowId, cardInstanceId }` | any non-actor while the Challenge window is open | first valid wins; server rolls both (RULE-17), then a Modifier window; challenger wins ties |
| `REACT_MODIFIER` | `{ windowId, cardInstanceId, value, side?, leaderBonus? }` | any player, once per window | `value` ∈ card options; `side` (`challenger`\|`defender`) required only on Challenge rolls; `leaderBonus` ±1 only with The Protecting Horn |
| `REACT_PASS` | `{ windowId }` | eligible responder | Skip; window closes early when all responded |
| `RESOLVE_CHOICE` | `{ choiceId, cardInstanceIds }` | chooser | discard / sacrifice / give / take-from-discard; count in `[min,max]` |
| `LEADER_ACTION` | `{ targetPlayerId }` | The Shadow Claw holder, 1 AP, once per turn | pull 1 random card from target's hand |

While `game.chain` is non-null or effect steps are queued, turn commands return `CHAIN_PENDING` (G-02). AP may reach 0 during a chain; the turn ends automatically once it closes (G-03). Empty main deck on draw: discard is reshuffled in (RG-DEPL); deck+discard empty → draw 0, AP still spent.

### Lobby settings (MOD-005)

| kind | payload | Who / when | Effect |
|---|---|---|---|
| `CONFIGURE_GAME` | `Partial<{ reactionSeconds, choiceSeconds (10..120), leaderFillsClassSlot, maskMode: "add"\|"replace", leaderPassiveUsesModifierSlot }>` | host, `lobby`/`leader_selection` | per-room rule switches (defaults: 20 s, 30 s, Q-01 false, Q-04 "add", Q-11 false); nothing changed → `NO_CHANGE` |

### Modifier (MOD-005)
`REACT_MODIFIER` names the exact card instance and one of its `options` (`Modifier +1/-3` → 1 or -3). Wrong card/kind/value/side → rejected, hand unchanged. One Modifier or Skip per player per window; a retry with the same `commandId` replays the stored outcome (no second card consumed). Leader passives (+1 Divine Arrow, +2 Fist of Reason, +1 Charismatic Song, ±1 Protecting Horn via `leaderBonus`) go to `roll.passives` labelled "passive của Leader: …", not to `roll.modifiers`. With `leaderPassiveUsesModifierSlot = true` (Q-11 alternative) a player whose Leader passive applies to the roll starts the window as `played`.

### Win / GAME_OVER (GAME-003)
- **3 Monsters slain** → `game_over` in the same transition (after all Modifiers resolved, Q-03); no refill, open chain and queued effects dropped. `winReason: "slay_3"`.
- **6 distinct classes** (Leader class + Hero classes, Mask per `settings.maskMode`) when the active player's turn ends (`END_TURN` or auto-end at 0 AP after the chain closes). Only the active player is checked. `winReason: "six_classes"`.
- Simultaneous (Q-02): the active player wins. After `game_over` every command returns `GAME_OVER`; `currentPlayerId` is null; deadlines stop.

### Deadlines (DO alarm)
Windows last `settings.reactionSeconds` (20 s), choices / immediate roll `settings.choiceSeconds` (30 s); the timer never resets. On expiry (alarm, or before the next command): Challenge window → no challenge; Modifier window → closes; immediate roll → skip; choice → **server picks the first `min` eligible cards** (default, owner may change). Each settle bumps `revision` once — so a command sent right after an expiry gets `STALE_REVISION` and must be resent (new `commandId`) against the fresh snapshot.
"with a <class> in their Party" (Tough Teddy, Smooth Mimimeow) counts the Leader's class: the Leader is in the Party (RB). Q-01 only concerns Monster requirement slots.

### Effects
Effects run as data steps keyed by card `effectId` (GAME-004). Implemented: see `buildEffect` in `apps/worker/src/game/base-engine.ts`. Not yet modelled (logged no-op): Fuzzy Cheeks, Mellow Dee, Pan Chucks, Qi Bear, Beary Wise, Bullseye, Hook, Quick Draw, Sharp Fox, Silent Shadow, Snowball, Wiggles, and "may play it immediately" parts; slain-Monster passives Corrupted Sabretooth, Malamammoth, Orthus, Rex Major. "may" passives that only benefit their owner (Arctic Aries, Crowned Serpent, Dracos, Plundering Puma's victim draw) are applied automatically and logged.

## Outcome

`{ accepted: boolean, code: string, replayed: boolean, commandId, revision }` — HTTP 200 for rule rejections; the returned snapshot is always the authoritative state.

| code | meaning |
|---|---|
| `ACCEPTED` | applied; `revision` incremented by 1 |
| `STALE_REVISION` | `expectedRevision` ≠ current revision |
| `IDEMPOTENCY_CONFLICT` | reused `commandId` with a different body |
| `MODE_MISMATCH` | command kind not available in `base` (demo commands, reactions, `PLAY_CARD` until GAME-002) |
| `FORBIDDEN` | host-only command from a non-host, or actor not seated |
| `INVALID_PHASE` | wrong phase for the command |
| `NOT_ENOUGH_PLAYERS` | fewer than 2 (or more than 6) seated |
| `NOT_ACTIVE_SELECTOR` | not this player's turn to pick a Leader |
| `LEADER_NOT_AVAILABLE` | `leaderId` not in the base leader pool |
| `LEADER_TAKEN` | Leader already picked |
| `SELECTION_INCOMPLETE` | START_GAME before every seat picked |
| `INSUFFICIENT_CARDS` | deck too small to deal (should not occur with the base catalog) |
| `NOT_YOUR_TURN` | turn action from a non-current player |
| `INSUFFICIENT_AP` | not enough AP for the action |
| `CHAIN_PENDING` | a window/choice/effect is in progress |
| `CARD_NOT_IN_HAND` / `CARD_NOT_PLAYABLE` | card missing or wrong kind (Modifier/Challenge are reactions only) |
| `INVALID_TARGET` | targets do not match the card's target rule |
| `HERO_NOT_IN_PARTY` / `HERO_ALREADY_ROLLED` / `HERO_EFFECT_BLOCKED` | hero roll guards |
| `MONSTER_NOT_AVAILABLE` / `REQUIREMENT_NOT_MET` | attack guards |
| `NO_OPEN_WINDOW` / `STALE_WINDOW` / `WINDOW_CLOSED` / `NOT_ELIGIBLE` / `ALREADY_RESPONDED` | reaction guards |
| `INVALID_MODIFIER_VALUE` / `INVALID_MODIFIER_SIDE` / `INVALID_LEADER_BONUS` | Modifier guards |
| `NO_PENDING_CHOICE` / `STALE_CHOICE` / `NOT_YOUR_CHOICE` / `INVALID_CHOICE` / `NO_PENDING_ROLL_CHOICE` | choice guards |
| `LEADER_ACTION_UNAVAILABLE` | not The Shadow Claw, or already used this turn |
| `GAME_OVER` | game finished (GAME-003) |

## HTTP errors

`{ ok: false, error: { code, message } }`: 400 `INVALID_JSON`/`INVALID_NICKNAME`/`INVALID_MODE`/`INVALID_COMMAND`; 401 `UNAUTHORIZED`; 404 `ROOM_NOT_FOUND`/`NOT_FOUND`; 409 `ROOM_FULL` (7th player), `NICKNAME_TAKEN`, `SETUP_LOCKED` (join after selection begins), `EXPANSION_UNSUPPORTED`, `ROOM_CODE_TAKEN`; 413 `BODY_TOO_LARGE`; 429 `RATE_LIMITED`.

## Snapshot (`mode: "base"`)

```ts
{
  mode: "base"; roomCode; revision; serverNow; hostPlayerId;
  you: { playerId; nickname; isHost };
  players: Array<{ playerId; nickname; joinIndex; isHost;
                   handCount; leaderId: string | null; leaderClass: string | null;
    party: Array<{ hero: BaseCardView; item: BaseCardView | null; classes: string[] }>;
    slainMonsters: BaseCardView[]; partyClasses: string[]; protections: ("no_destroy"|"no_steal")[] }>;
  yourHand: BaseCardView[];              // viewer-private
  game: {
    phase: "lobby" | "leader_selection" | "turn_active";
    selectionPlayerId; leaderPool: string[]; selectedLeaderIds: string[];
    turnOrder: string[]; currentPlayerId; turnNumber; turnId; actionPoints;
    mainDeckCount; monsterDeckCount; faceUpMonsters: BaseCardView[]; discardCount;
    heroRollsUsed: string[]; turnRollBonus: number;
    chain: BaseChainView | null;   // challenge_window | modifier_window (roll: dice, modifiers, passives, total) | immediate_roll_choice | choice
    winnerPlayerId; winReason; log: {seq,text}[]; settings: BaseGameSettings;
  };
}
BaseCardView = { cardId /* "<definitionId>#NN" instance */, definitionId, kind, name, modifierOptions? /* Modifier only */ }
```

Privacy: only the requester's hand is serialized; other seats expose `handCount` only; deck order, monster deck order and token hashes are never sent. `chain.options` (choice candidates) is sent only to the chooser. Pulled cards are logged without identity. No `demo`/`demoLabel` field. `party` excludes the Leader (see `leaderId`). Passive bonuses appear in `roll.passives` separately from `roll.modifiers` (Q-11, labelled "passive của Leader: …").

## Extension

New turn action = protocol union + `validateBaseTurnCommand` + handler in `BASE_TURN_HANDLERS` (`apps/worker/src/game/base-game.ts`). New effect = case in `buildEffect` (`base-engine.ts`). The DO hook for deadlines is `settleBaseGame` / `baseNextDeadline`.

## Retry sau khi bị từ chối
Receipt được lưu cho cả command bị từ chối (kể cả `STALE_REVISION`). Client phải dùng `commandId` MỚI sau khi bị từ chối; gửi lại cùng `commandId` sẽ nhận lại đúng kết quả cũ.
