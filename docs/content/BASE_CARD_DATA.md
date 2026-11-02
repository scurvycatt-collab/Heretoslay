# GAME-004 — Base card data (cơ chế + text)

Ngày: 2026-11-02. Owner: arch-heavy. Trạng thái: DONE (data secondary, rights UNVERIFIED).

## File
| File | Vai trò |
|---|---|
| `packages/protocol/src/cards.ts` | Schema TS (`CardData`, `HeroCardData`, `MonsterCardData`, …, `FieldProvenance`) — type-only, dùng chung engine + CardRenderer. |
| `apps/worker/src/content/base-cards.json` | Data 95 definition / 136 copy (115 main + 15 Monster + 6 Leader). Rule Card không vào data (không phải thẻ chơi, quantity UNKNOWN). |
| `apps/worker/src/content/base-cards.ts` | Loader + `validateCardData` (chạy lúc import; data sai → throw). |
| `apps/worker/tests/base-cards.test.ts` | Test: khớp `BASE_CARD_INDEX.csv` + catalog CAT-001, cơ chế mẫu, validator bắt lỗi. |
| `docs/contracts/CARD_TEMPLATE_SPEC.json` | Layout pixel trích từ Card Maker (chỉ số liệu; không copy code GPL / frame PNG). |

## Nguồn (tất cả secondary; không có scan retail trong repo)
| Key | Nguồn | Dùng cho |
|---|---|---|
| S | ShadowzLmao2/HereToSlay-Online `src/cards.py` @30fa4d0 | text mọi thẻ, class/roll Hero, Monster, Modifier, Item |
| J | jingxianlau/here-to-slay-online `server/src` @af89829 | class/roll Hero, requirement + roll Monster, penalty |
| L | LanCorC/LiveBoard `assets.js` @cb1fd57 | roll Hero, slay Monster ("Name N+") |
| N | 1nk-bl0t/HereToSlay `HereToSlayMain.py` | text Magic (Forceful Winds chỉ có ở đây) |
| F | fandom wikitext (dump trong DavidManiaM/HereToSlay @0dad4c7) | text/requirement một số thẻ |
| RB | bản text rulebook retail (Wayback copy, cùng repo DavidManiaM) | Shadow Claw cấm 2 người |
| PM | `BASE_LEADER_ARTIFACT_CHECK.md` | class/skill Leader |

Mỗi field cơ chế có `provenance[field] = { status, sources, note? }`; `status` ∈ `corroborated` (≥2 nguồn khớp) · `single_source` · `majority` (lệch, lấy đa số, ghi bất đồng) · `derived` (annotation engine suy từ text: effectId, target) · `UNVERIFIED` (null). Hiện không field nào UNVERIFIED.

## Độ phủ
- Hero 48: class + roll khớp **S·J·L** (3/3) cho cả 48. Text: 33 corroborated, 15 single_source.
- Monster 15: requirement khớp S·J; slay khớp S·J(·L); penalty range khớp S·J trừ 1 ca.
- Item/Cursed 12, Magic 8, Modifier 5, Challenge, Leader 6: text đủ; Modifier options có cấu trúc.

## Sai lệch giữa nguồn (đã xử lý)
| Thẻ | Lệch | Chọn |
|---|---|---|
| Dark Dragon King | penalty S=4-, F=4-, J=7- | 4- (`majority`) |
| 6 Monster penalty DISCARD | S DISCARD 1; J, F DISCARD 2 | 2 (`majority`/`single_source`) |
| Wizard Mask | S field "Mask Type" = Sorcerer (bug), text = Wizard | wizard (theo text + tên) |
| Dracos | ngược: slay **5-**, penalty **8+** (S, J, L khớp) | `slay {op:"lte"}`; schema hỗ trợ cả hai chiều |
| Mega Slime | F ghi thêm "Draw 2 cards" khi slay; không nguồn nào khác | không mô hình hoá (ghi `notes`) |

## Mâu thuẫn với quyết định owner (cần owner xem)
1. **Q-01** (Leader không thỏa slot class): text rulebook retail (bản Wayback) ghi *"you must have a Wizard in your Party (either a Hero card or the Wizard Party Leader card)"*. Engine theo Q-01 nhưng để cấu hình được.
2. **Q-04** (Mask cộng class): text thẻ ghi *"considered a Bard **instead of** its original class"*. Engine theo Q-04 (union) nhưng để cấu hình được (`replace`).

## Target rule (`derived`)
`none` · `other_player` · `hero_other_party` · `two_heroes_other_party` · `hero_other_party_and_own_hero` · `own_hero` · `own_hero_with_cursed_item` · `any_hero_with_item`. Chọn lúc PLAY/ROLL (Q-08), server validate lại khi resolve.

## Cập nhật data
Data sinh một lần từ các nguồn trên (script tạm, không commit vì đọc repo ngoài). Sửa tay JSON được; validator + test sẽ bắt sai shape/provenance/catalog.
