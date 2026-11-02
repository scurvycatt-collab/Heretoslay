# PC-CONTRACT-001 — PLAY_CARD effect-demo API

**Status:** implementation freeze accepted by `PC-CONTRACT-001-PM-ACCEPT`, 2026-11-02. HTTP command + personalized polling như `REACTION_API.md`. Đây là synthetic demo cho đúng hai candidate mechanics, không phải base mode hay authoritative card catalog. `Critical Boost`/`Dodgy Dealer` source vẫn `secondary_discovery`, text/rights `UNVERIFIED`.

## Mode và fixture gate

Create đề xuất:

```json
{"nickname":"Host","mode":"effect_demo","reactionSeconds":20}
```

`reactionSeconds` optional, integer `5..120`, default `20`; immutable sau start. Đây là **PM-policy proposed**, không phải publisher rule. Expansion/set/catalog config vẫn reject. `reaction_demo` và frozen `setup_demo` không đổi.

Host dùng `START_EFFECT_DEMO` khi có 2–6 players; join khóa sau start. Server tạo unique `fixture.effect.*` instances: Critical Boost, Dodgy Dealer, Challenge/Modifier reaction fixtures và inert draw fillers. Chỉ hai named cards có effect. Không import `BASE_REFERENCE_DEFINITIONS`, không nhận `hts.base.v1.*`, không enable `base`, Leader/Monster triggers, MOD-SELECT hoặc effect khác. Active player đầu là host, 3 AP.

## Persisted state và zones

Mỗi physical instance ở đúng một zone: `mainDeck`, một player `hand`, `pending`, một player `party`, hoặc `discard`. `pendingPlay` là durable state, không phải bản sao card:

```json
{
  "attemptId":"opaque",
  "actorPlayerId":"p1",
  "cardInstanceId":"fixture.effect.instance.opaque",
  "cardKind":"magic|hero",
  "phase":"challenge|critical_boost_discard|dodgy_roll_choice|dodgy_modifier",
  "lockedTargetPlayerId":null,
  "choiceDeadlineAt":null,
  "reactionWindowId":"opaque-or-null",
  "heroRoll":{"raw":null,"final":null,"threshold":9},
  "source":"play|paid_hero_roll"
}
```

For `source=play`, accepted `PLAY_CARD` atomically validates, subtracts 1 AP and moves hand→pending before Challenge. For paid Hero roll, Hero remains in Party; `cardInstanceId` is a reference and `pending` zone stays empty. No other normal turn command is accepted while `pendingPlay` exists.

Persist room revision, zones, pending state, reaction state, deadlines, exact-command receipts, AP/turn and Hero allowance in one Durable Object transaction.

## Commands

All use `{commandId, expectedRevision, kind, payload}` and Bearer-derived actor.

```json
{"kind":"START_EFFECT_DEMO","payload":{}}
{"kind":"PLAY_CARD","payload":{"cardInstanceId":"fixture.effect.instance.cb-1"}}
{"kind":"CHOOSE_CRITICAL_BOOST_DISCARD","payload":{"attemptId":"a1","cardInstanceId":"fixture.effect.instance.x"}}
{"kind":"CHOOSE_DODGY_DEALER_IMMEDIATE","payload":{"attemptId":"a2","choice":"skip"}}
{"kind":"CHOOSE_DODGY_DEALER_IMMEDIATE","payload":{"attemptId":"a2","choice":"roll","targetPlayerId":"p2"}}
{"kind":"ROLL_HERO_EFFECT","payload":{"heroInstanceId":"fixture.effect.instance.dd-1","targetPlayerId":"p2"}}
{"kind":"END_TURN","payload":{}}
```

Challenge/Modifier/Skip reuse `PLAY_CHALLENGE`, `PLAY_MODIFIER`, `SKIP_REACTION` with server window IDs. Fixture modifiers have fixed delta/roll target; this slice does not add modifier option selection.

Only pending actor may submit card-specific choices. `PLAY_CARD` accepts only supported Magic/Hero instances in actor hand, on actor turn, with ≥1 AP and no pending action. `ROLL_HERO_EFFECT` requires actor turn, Dodgy Dealer in actor Party, unused allowance, ≥1 AP, valid other-player target and no pending action.

`END_TURN` is also valid in `effect_demo` only for the active player during `turn_active`, with no `pendingPlay` or unresolved reaction. It forfeits remaining AP and advances once to a persisted fresh turn (`3 AP`, new `turnId`, fresh Hero allowance). Wrong actor, stale, conflict or pending action rejects without command mutation; exact replay never advances twice. `setup_demo` behavior is unchanged.

## State machine và resolution

1. Valid play spends 1 AP, moves card hand→pending and opens Challenge for all players. First valid opponent Challenge wins admission; Challenge card moves hand→discard on acceptance (**PC-CH-04 project policy**). Existing server dice, Modifier cap/Skip, all-completed/deadline rules apply.
2. Challenge success: pending card→discard; AP is not refunded; effect does not run. Challenge failure/no Challenge continues below.
3. Critical Boost: keep Magic in pending; draw up to 3 sequentially. When deck empties, shuffle discard and continue; stop when 3 drawn or deck+discard empty. Enter `critical_boost_discard`. Actor may discard any current hand instance, including a drawn card. If hand is empty, discard 0 (**PC-CB-04 project policy**). Only after choice/fallback does Magic move pending→discard and attempt complete.
4. Dodgy Dealer: move Hero pending→actor Party, then enter `dodgy_roll_choice`. `skip` completes without consuming that Hero’s roll allowance. `roll` requires and locks another room player before server dice (**PC-DD-04**), marks allowance used before rolling, then opens Modifier. Final ≥9 atomically swaps complete hands; empty hand is valid (**PC-DD-06**). A disconnected target whose player record remains swaps normally; missing record makes effect no-op, with no retarget/reroll (**PC-DD-07**). Failure/no-op still consumes allowance.
5. Paid `ROLL_HERO_EFFECT` spends 1 AP and consumes the current-turn allowance before dice, locks target, then follows Dodgy Modifier/swap resolution. Immediate roll costs no additional AP.

Allowance key is `(turnId, heroInstanceId)`. New turn gives a fresh allowance. Same Hero cannot immediate-roll then paid-roll, nor paid-roll twice, in one turn.

## Choice deadline, fallback và restart

Each card-specific choice uses the room’s `reactionSeconds`; server stores absolute `choiceDeadlineAt`, never resets it, and schedules an alarm. **PM-policy proposed:** on deadline, Critical Boost discards the first instance in persisted actor-hand order (ID visible only to that actor); empty hand discards 0. Dodgy immediate choice falls back to `skip`. These deterministic fallbacks are not official rulings.

On restart, constructor/recovery loads pending/reaction/deadline/receipts unchanged and re-arms the earliest alarm. If `now >= deadlineAt`, alarm or next command resolves fallback exactly once before other mutation. Recovery never rerolls, redraws, reshuffles, repeats swap, reopens a window or extends a deadline.

## Turn completion và conservation

AP reaching 0 does not advance while a pending play/effect/reaction exists. Complete the chain first, clear `pendingPlay`, then advance exactly once and grant next player 3 AP. If AP remains, actor keeps turn.

Accepted effect-demo `END_TURN` explicitly forfeits any positive AP and performs the same single turn advance. It cannot bypass a pending last-AP chain.

Every accepted transition preserves instance count and uniqueness. Draw is deck→hand; selected discard is hand→discard; Challenge/Modifier use is hand→discard; failed attempted play is pending→discard; successful Magic finishes pending→discard; successful Hero is pending→Party; hand swap exchanges two arrays without clone/drop. A `pendingPlay.cardInstanceId` reference never creates another instance.

## Personalized snapshot

`EffectDemoSnapshot` extends common room fields with current player/AP, deck/discard counts, public Party instances, reaction summary, and:

```json
{
  "mode":"effect_demo",
  "yourHand":[{"instanceId":"opaque","fixtureDefinitionId":"fixture.effect.modifier.actor-plus-one","kind":"modifier","modifier":{"delta":1,"rollTarget":"actor"}}],
  "players":[{"playerId":"p1","handCount":3,"party":[{"instanceId":"opaque","fixtureDefinitionId":"fixture.effect.hero.dodgy-dealer"}]}],
  "pendingPlay":{"attemptId":"a1","actorPlayerId":"p1","cardFixtureDefinitionId":"fixture.effect.magic.critical-boost","phase":"critical_boost_discard","lockedTargetPlayerId":null,"choiceDeadlineAt":12345,"youMustChoose":true},
  "yourHeroAllowance":{"fixture.effect.instance.dd-1":"available|used"}
}
```

Other hand IDs/order, deck order, discard contents, tokens/hashes and server-only fallback ordering never appear. Public attempted card, Party, actor, locked target, rolls and deadlines may appear. `youMustChoose` is personalized.

Only own-hand Modifier cards expose optional typed `modifier { delta, rollTarget }`, copied from actual fixture metadata. Non-Modifier cards omit it; other players expose only `handCount`. No label/name inference and no modifier option selection is introduced.

## Outcomes, errors và idempotency

Outcome shape remains `{accepted, code, replayed, commandId, revision}`. Idempotency scope `(room, actor, commandId)` is checked before revision. Same canonical kind/payload replays stored outcome/snapshot semantics without repeating zone/AP/draw/roll/swap; changed payload returns `IDEMPOTENCY_CONFLICT`. `expectedRevision` mismatch is `STALE_REVISION` for unseen commands.

Required stable codes: existing auth/body/rate/reaction codes plus `MODE_MISMATCH`, `INVALID_PHASE`, `NOT_YOUR_TURN`, `CARD_NOT_OWNED`, `UNSUPPORTED_CARD`, `INSUFFICIENT_AP`, `PENDING_ACTION_ACTIVE`, `ATTEMPT_MISMATCH`, `CHOICE_NOT_ALLOWED`, `CHOICE_CLOSED`, `INVALID_TARGET`, `HERO_NOT_IN_PARTY`, `HERO_EFFECT_ALREADY_USED`. Invalid commands make no mutation.

## Accepted policy / remaining gates

- PM accepted `effect_demo`, `reactionSeconds 5..120`, and deterministic timeout fallbacks; these remain project policy, not official rules.
- Protocol DTO, Durable Object schema/recovery and workspace coverage are implemented; independent root QA and UI integration remain.
- Source/rights remain secondary/UNVERIFIED, so release as base gameplay remains blocked. There is no known semantic blocker for this synthetic two-card demo.
- Out of scope: full catalog/base mode, other card effects, Leader/Monster triggers, MOD-SELECT, art, expansion, WebSocket.
