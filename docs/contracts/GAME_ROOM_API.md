# GAME_ROOM_API — real base game room (mode `base`)

Task: GAME-001 + GAME-002 (2026-11-02). Owner: Architecture. Status: IMPLEMENTED — setup, DRAW/REDRAW/END_TURN, full turn loop (play/challenge/modifier/hero roll/attack/choices). Win (GAME-003): see “Win / GAME_OVER”.

Types: `packages/protocol/src/game/base.ts` (`BaseGameSnapshot`, `BaseGameCommand`, `BaseCardView`), re-exported from `@here-to-slay/protocol`. `RoomSnapshot = RoomSliceSnapshot | BaseGameSnapshot`.
Rules: `docs/rules/BASE_SPEC.md` RULE-01..05, `docs/rules/SETUP_VERIFIED.md`. Cards: CAT-001 reference catalog (`apps/worker/src/content/`), IDs/kinds only, rights UNVERIFIED, no artwork.

## Endpoints

Same routes as the demo slices; mode is chosen at create time and fixed for the room.

| Method | Path | Auth | Body | Success |
|---|---|---|---|---|
| POST | `/api/rooms` | — | `{ "nickname": string, "mode": "base", "roomCode"?: string }` | 201 `{ roomCode, sessionToken, snapshot }` |
| POST | `/api/rooms/:code/join` | — | `{ "nickname": string }` | 201 `{ roomCode, sessionToken, snapshot }` |
| POST | `/api/rooms/:code/watch` | — | `{ "nickname": string }` | 201 read-only `{ roomCode, sessionToken, snapshot }` |
| GET | `/api/rooms/:code/snapshot` | `Bearer <sessionToken>` | — | 200 `{ snapshot }` |
| POST | `/api/rooms/:code/commands` | `Bearer <sessionToken>` | command (below) | 200 `{ outcome, snapshot }` |

- Room code: exactly 6 letters/digits. Create may request one; omitting it generates 6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. Path code is case-insensitive.
- Reconnect/reload keeps `sessionToken` client-side. A different device may reclaim the same seat with room code + nickname only after the old heartbeat is offline for more than 20 seconds; reclaim rotates the token. An online old session returns `SESSION_ACTIVE`.
- Spectators are read-only, do not occupy a player seat or presence heartbeat, receive no private hand, and cannot send commands.
- Public room URLs contain only the room code; player IDs and tokens remain in browser storage. Legacy player-ID URLs are normalized after loading.
- Create accepts `nickname`, `mode`, and optional `roomCode`; expansion/capacity keys remain unsupported.
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
| `ATTACK_MONSTER` | `{ monsterInstanceId }` | current player, ≥2 AP | face-up Monster; requirement checked now (Q-12); the Leader fills a matching class slot but never an "any" slot (retail rulebook, owner 2026-11-02 — `leaderFillsClassSlot`); −2 AP; roll → Modifier window → SLAY (to `slainMonsters`, then and only then refill that vacated slot unless the deck is empty — Q-09) / PENALTY (choice) / nothing |
| `REACT_CHALLENGE` | `{ windowId, cardInstanceId }` | any non-actor while the Challenge window is open | first valid wins; server rolls both (RULE-17), then a Modifier window; challenger wins ties |
| `REACT_MODIFIER` | `{ windowId, cardInstanceId, value, side?, leaderBonus? }` | any player, once per window | `value` ∈ card options; `side` (`challenger`\|`defender`) required only on Challenge rolls; `leaderBonus` ±1 only with The Protecting Horn |
| `REACT_PASS` | `{ windowId }` | eligible responder | Skip; window closes early when all responded |
| `RESOLVE_CHOICE` | `{ choiceId, cardInstanceIds, accept? }` | chooser | discard / sacrifice / give / take-from-discard: ids, count in `[min,max]`; `confirm` (a "may" clause): `cardInstanceIds: []` + `accept: true\|false` |
| `LEADER_ACTION` | `{ targetPlayerId }` | The Shadow Claw holder, 1 AP, once per turn | pull 1 random card from target's hand |

While `game.chain` is non-null or effect steps are queued, turn commands return `CHAIN_PENDING` (G-02). AP may reach 0 during a chain; the turn ends automatically once it closes (G-03). Empty main deck on draw: discard is reshuffled in (RG-DEPL); deck+discard empty → draw 0, AP still spent.

### Lobby settings (MOD-005)

| kind | payload | Who / when | Effect |
|---|---|---|---|
| `CONFIGURE_GAME` | `Partial<{ reactionSeconds, choiceSeconds (10..120), leaderFillsClassSlot, maskMode: "add"\|"replace", leaderPassiveUsesModifierSlot }>` | host, `lobby`/`leader_selection` | per-room rule switches (defaults: 20 s, 30 s, `leaderFillsClassSlot` true, `maskMode` "replace", Q-11 false); nothing changed → `NO_CHANGE` |

### Modifier (MOD-005)
`REACT_MODIFIER` names the exact card instance and one of its `options` (`Modifier +1/-3` → 1 or -3). Wrong card/kind/value/side → rejected, hand unchanged. One Modifier or Skip per player per window; a retry with the same `commandId` replays the stored outcome (no second card consumed). Leader passives (+1 Divine Arrow, +2 Fist of Reason, +1 Charismatic Song, ±1 Protecting Horn via `leaderBonus`) go to `roll.passives` labelled "passive của Leader: …", not to `roll.modifiers`. With `leaderPassiveUsesModifierSlot = true` (Q-11 alternative) a player whose Leader passive applies to the roll starts the window as `played`.

### Win / GAME_OVER (GAME-003)
- **3 Monsters slain** → `game_over` in the same transition (after all Modifiers resolved, Q-03); no refill, open chain and queued effects dropped. `winReason: "slay_3"`.
- **6 distinct classes** (Leader class + Hero classes, Mask replaces the Hero's class by default (`settings.maskMode`)) when the active player's turn ends (`END_TURN` or auto-end at 0 AP after the chain closes). Only the active player is checked. `winReason: "six_classes"`.
- Simultaneous (Q-02): the active player wins. After `game_over` every command returns `GAME_OVER`; `currentPlayerId` is null; deadlines stop.

### Deadlines (DO alarm)
Windows last `settings.reactionSeconds` (20 s), choices / immediate roll `settings.choiceSeconds` (30 s); the timer never resets. On expiry (alarm, or before the next command): Challenge window → no challenge; Modifier window → closes; immediate roll → skip; choice → **skip** (nothing chosen, nothing happens; a "may" is declined) — owner 2026-11-02. Each settle bumps `revision` once — so a command sent right after an expiry gets `STALE_REVISION` and must be resent (new `commandId`) against the fresh snapshot.
After a deadline is settled, the same DO alarm is re-armed to the next gameplay deadline or the room idle-expiry time, whichever is earlier. A resolved window's old deadline is not retained as the alarm target.
"with a <class> in their Party" (Tough Teddy, Smooth Mimimeow) counts the Leader's class: the Leader is in the Party (RB). Q-01 only concerns Monster requirement slots.

### Effects
Effects run as data steps keyed by card `effectId` (GAME-004); every base Hero/Magic `effectId` has a handler (GAME-005). An unknown id is a logged no-op. Interactive parts use `chain.step = "choice"`:

| `kind` | used by | answer (`RESOLVE_CHOICE`) |
|---|---|---|
| `discard` / `discard_from_set` / `sacrifice_hero` / `give_card` / `take_from_discard` | penalties, Heavy Bear, Hopper, Spooky, Greedy Cheeks, Guiding Light…, Beary Wise (from the discarded cards) | card ids |
| `confirm` | every "may" (Arctic Aries, Crowned Serpent, Dracos, Plundering Puma, Rex Major, Pan Chucks reveal, Corrupted Sabretooth steal-instead) | `cardInstanceIds: []`, `accept` |
| `play_card` | "play it immediately": Fuzzy Cheeks, Hook (mandatory), Mellow Dee, Lucky Bucky, Sly Pickings, Buttons, Snowball, Quick Draw, Malamammoth, Orthus (optional, `[]` = skip) | 1 card id + its `targets`; played free (no AP), can still be Challenged |
| `destroy_hero` | Pan Chucks, Qi Bear (one per discarded card) | 1 Hero id in another Party |
| `take_from_top` → `order_top` | Bullseye (top 3, private) | 1 id; then all remaining ids in the order to put back (first = top). Timeout on `order_top` = keep order |
| `view_hand` | Sharp Fox (private) | `[]` to close |
| `take_from_hand` | Silent Shadow (private) | 1 id |

"Item card" includes Cursed Items (Malamammoth, Quick Draw, Sly Pickings, Hook) and DESTROY targets only Heroes in other Parties (Pan Chucks, Qi Bear) — owner confirmed 2026-11-03.

Wiggles: after the STEAL an `immediate_roll_choice` opens for the stolen Hero.

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

`{ ok: false, error: { code, message } }`: 400 `INVALID_JSON`/`INVALID_NICKNAME`/`INVALID_MODE`/`INVALID_ROOM_CODE`/`INVALID_COMMAND`; 401 `UNAUTHORIZED`; 404 `ROOM_NOT_FOUND`/`NOT_FOUND`; 409 `ROOM_FULL`, `SESSION_ACTIVE`, `SETUP_LOCKED`, `EXPANSION_UNSUPPORTED`, `ROOM_CODE_TAKEN`; 413 `BODY_TOO_LARGE`; 429 `RATE_LIMITED`.

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
    mainDeckCount; monsterDeckCount; faceUpMonsters: BaseCardView[]; discardCount; discardPile: BaseCardView[] /* public, oldest first */; lastRoll: BaseRollResultView | null /* last resolved roll: server outcome, display only; null for a viewer when it references a card that is currently in another player's hand or the deck */;
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


Challenge rolls: `BaseRollView.attemptCard` carries the Hero/Item/Magic card being challenged (UI-003, additive).

## UI-004 / owner 2026-11-03 — lobby, bots, turn timer (additive)

| Command | Payload | Who / phase | Effect |
|---|---|---|---|
| `ADD_BOT` | `{}` | host, `lobby`, < 6 seats | Adds a server-driven seat `Bot N` (`players[].isBot = true`); it takes a random free Leader (never Shadow Claw). |
| `REMOVE_BOT` | `{ playerId }` | host, `lobby` | Removes that bot seat. |
| `SELECT_PARTY_LEADER` | `{ leaderId }` | any seat, `lobby` | Pick or change your Leader in the lobby (`LEADER_TAKEN` if another seat holds it). |
| `START_GAME` | `{}` | host, `lobby` | Starts directly from the lobby when 2–6 seats all hold a Leader (`SELECTION_INCOMPLETE`, `LEADER_NOT_AVAILABLE` for Shadow Claw at 2 players). Lobby pick order = selection order, so SETUP-05 (last picker goes first) is unchanged. The old `BEGIN_LEADER_SELECTION` flow still works. |
| `CONFIGURE_GAME` | `+ turnSeconds: 30 \| 60 \| 90` | host, before start | Turn timer (default 60). |

Turn timer: `game.turnDeadlineAt` (snapshot) = end of the current turn. Restarts when AP changes (any AP spend), is
suspended (`null`) while a chain/queue resolves and restarts when it closes; expiry with nothing pending ends the turn
(log "Hết giờ lượt"). The Durable Object alarm includes this deadline. Bots answer windows/choices at once and take one
turn action about every 1.4 s of server time (attack if requirement met → play Hero → equip Item → roll Hero → draw →
end turn); they use the same handlers and validation as players.
