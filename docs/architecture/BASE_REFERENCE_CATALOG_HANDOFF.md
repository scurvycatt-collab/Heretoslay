# CAT-001 internal base reference catalog

Ngày: 2026-11-02. Owner: Architecture. Không commit/push/deploy.

## Output

- `apps/worker/src/content/types.ts`: typed definition, provenance và physical-copy contracts.
- `base-reference-data.ts`: 95 candidate definitions generated từ BR-01 CSV, giữ exact ID/name/kind/quantity và row-specific inventory/gallery evidence.
- `base-reference.ts`: map provenance chung + expand copy instances; 74 main definitions → 115 copies, 15 Monster → 15, 6 Leader → 6.
- `apps/worker/tests/base-reference-catalog.test.ts`: CSV field parity, counts, unique instance IDs, per-definition copy conservation và source-gate assertions.

Mỗi physical copy có `instanceId` riêng và `definitionId`; copies không collapse. Tất cả rows giữ `sourceAuthority=secondary`, `metadataConfidence=reference_only`, `retailAuthenticity=UNVERIFIED`, `rightsStatus=UNVERIFIED`; 89 link-checked và 6 visual-checked không bị promote. Không chứa card text/effect/art.

## Checks

- Worker typecheck: PASS.
- Targeted `base-reference*.test.ts`: 2/2 PASS.
- Không chạy room/root suites vì không import catalog vào runtime.

## Gate / next

Catalog là candidate metadata layer, chưa phải authoritative retail manifest. Không có import từ Room/router, không route/API/protocol/dependency change và không enable `base`. PM review parity; chỉ tích hợp gameplay sau source/rights/effect gates riêng.
