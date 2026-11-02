# Board schema — Here to Slay Web

Collection: `tasks` trong Artifact database.

| Field | Type | Values |
|---|---|---|
| code | string | GAME-001, ARCH-001, QA-001, ... |
| title | string | Mô tả ngắn |
| phase | string | infra / protocol / game-loop / content / deploy |
| role | string | arch / ui / qa / lead |
| status | string | todo / doing / review / done |
| files | string[] | File scope của task |
| done | string | Tiêu chí nghiệm thu |
| deps | string[] | Mã task phụ thuộc |
| pr | string | PR URL hoặc branch |
| note | string | Checkpoint ngắn (≤ 10 dòng) |
