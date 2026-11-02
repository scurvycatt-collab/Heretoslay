# PC-IMPL-BOTH — QA acceptance matrix

Ngày: 2026-11-02 (Asia/Saigon)  
Owner: QA  
Phạm vi: `tests/**`, `docs/qa/**`  
Input: `PLAY_CARD_API.md`, `PC-CONTRACT-001-PM-ACCEPT`

## Trạng thái

**MATRIX READY / BOUNDED INDEPENDENT COVERAGE RUN.** `tests/effect-demo.integration.test.ts` đã chạy trên implementation code-ready; evidence và giới hạn thực ở `docs/qa/PLAY_CARD_REPORT.md`. Các row không được report dẫn chiếu vẫn là PLANNED, không suy thành PASS.

Targeted command:

```text
node --test --experimental-strip-types tests/effect-demo.integration.test.ts
```

Sau targeted green, chạy `npm run test:integration` đúng một lần nếu PM yêu cầu regression gate. Không browser/native Chrome/live restart.

## Harness bắt buộc

- Router → Room public HTTP envelope; discover instance owner/type từ personalized snapshots, không hardcode token hoặc private deck order.
- Deterministic queues cho UUID, server dice, shuffle và clock; storage/restart harness giữ persisted state/alarm.
- Zone/conservation digest đếm mỗi physical instance đúng một lần qua deck, hands, pending, Party, discard.
- Mỗi invalid/replay/conflict case so digest, revision, AP, turn, pending, reaction, roll và private zones trước/sau.

## Common/auth/idempotency/privacy

| ID | Case | Expected | Status |
|---|---|---|---|
| `PC-COM-01` | Create `effect_demo`; reactionSeconds omit/5/120 và invalid 4/121/non-integer; expansion/config | default20 hoặc accepted boundary; invalid/config reject trước session | PLANNED |
| `PC-COM-02` | Start 2–6, non-host, 1 player, join after start, wrong mode | valid start only; stable reject and no mutation otherwise | PLANNED |
| `PC-COM-03` | Missing/invalid bearer; payload actor spoof | unauthorized/no mutation; actor always from session | PLANNED |
| `PC-COM-04` | Unseen stale command | `STALE_REVISION`; AP/zones/pending/turn unchanged | PLANNED |
| `PC-COM-05` | Exact retry after play/choice/reaction/roll/swap/fallback | replay receipt; no double AP/draw/discard/roll/swap/revision | PLANNED |
| `PC-COM-06` | Same commandId, changed kind/payload | `IDEMPOTENCY_CONFLICT`; no mutation | PLANNED |
| `PC-COM-07` | Other normal command while pending | `PENDING_ACTION_ACTIVE`; chain/deadline unchanged | PLANNED |
| `PC-PRIV-01` | Compare all player snapshots | only own hand IDs/order; other handCount only; no token/hash/deck/discard order/fallback order | PLANNED |
| `PC-PRIV-02` | Pending choice projections | attempted card/actor/target/roll/deadline public; `youMustChoose` only true for pending actor; allowance only own | PLANNED |
| `PC-CONS-01` | Every accepted/rejected transition | unique physical-instance conservation; pending is a zone for play and reference-only for paid roll | PLANNED |

## Critical Boost

| ID | Case | Expected | Status |
|---|---|---|---|
| `PC-CB-01` | Play with ≥1 AP | spend1, hand→pending, Challenge opens; last AP does not advance yet | PLANNED |
| `PC-CB-02` | Challenge wins | Challenge hand→discard once; Magic pending→discard; no draw/discard choice; AP not refunded | PLANNED |
| `PC-CB-03` | No Challenge / Challenge loses after server roll+Modifier | continue effect exactly once | PLANNED |
| `PC-CB-04` | Draw source has ≥3 | draw exactly3 sequentially; conservation | PLANNED |
| `PC-CB-05` | Combined source has 1–2, including discard fallback | draw all available partial; no reject/rollback/loop | PLANNED |
| `PC-CB-06` | Deck+discard empty | draw0 and enter/resolve choice without loop | PLANNED |
| `PC-CB-07` | Actor chooses owned current-hand card, including drawn card | chosen hand→discard; Magic pending→discard; attempt completes | PLANNED |
| `PC-CB-08` | Wrong actor/attempt/card/not-owned/closed choice | stable reject; no mutation | PLANNED |
| `PC-CB-09` | Empty hand after draw | discard0; Magic final discard; complete | PLANNED |
| `PC-CB-10` | Deadline with non-empty/empty hand | first persisted hand instance or discard0 exactly once; absolute deadline unchanged | PLANNED |
| `PC-CB-11` | Restart before/after deadline | persisted pending/deadline/receipt; re-arm or settle once; no redraw/reshuffle/re-discard | PLANNED |
| `PC-CB-12` | Last AP chain completes | advance exactly once only after pending clears; next player gets3 AP | PLANNED |

## Dodgy Dealer

| ID | Case | Expected | Status |
|---|---|---|---|
| `PC-DD-01` | Play Hero; Challenge wins/loses | win: pending→discard/no Party; loss/no Challenge: pending→Party then immediate choice | PLANNED |
| `PC-DD-02` | Immediate `skip` | complete; allowance remains available; no extra AP; last-AP advance after clear | PLANNED |
| `PC-DD-03` | Immediate `roll` with valid other target | lock target before server dice; mark allowance used; no extra AP | PLANNED |
| `PC-DD-04` | Paid roll | Hero in Party, own turn, ≥1 AP, valid target, allowance available; spend1 and mark before roll | PLANNED |
| `PC-DD-05` | Immediate then paid / paid twice same turn | `HERO_EFFECT_ALREADY_USED`; no AP/RNG/mutation; new turn allowance fresh | PLANNED |
| `PC-DD-06` | Final total ≥9 / <9 after Modifier window | success swaps complete hands atomically; failure keeps hands | PLANNED |
| `PC-DD-07` | One/both hands empty on success | swap empty collections without clone/drop | PLANNED |
| `PC-DD-08` | Target disconnected but record remains | normal swap against locked record | PLANNED |
| `PC-DD-09` | Locked target record missing at resolve | no-op; allowance consumed; no retarget/reroll | PLANNED |
| `PC-DD-10` | Self/missing target, wrong actor/phase/Hero | stable reject; AP/allowance/pending/roll unchanged | PLANNED |
| `PC-DD-11` | Immediate-choice deadline | deterministic Skip once; allowance remains available; deadline no reset | PLANNED |
| `PC-DD-12` | Restart during choice/Modifier or after roll | no reroll/reopen/swap twice; locked target/roll/allowance/receipt persist | PLANNED |
| `PC-DD-13` | Paid roll uses last AP | hold turn through Modifier; advance exactly once after resolution | PLANNED |

## Dependency / handoff

Implementation/fixture seed đã đủ cho bounded test. Phần matrix chưa thực thi còn cần test-control riêng cho missing-player-record no-op, restart giữa Challenge/Modifier và modifier delta quanh threshold. Không có finding trong coverage đã chạy.
