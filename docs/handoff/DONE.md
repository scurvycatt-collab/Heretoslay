# Mốc đã nghiệm thu — chỉ đọc khi cần bằng chứng cũ

Ngày chốt: 2026-10-29. “Xong” bên dưới chỉ cho phạm vi ghi rõ, không phải cả game. Source mới cần kiểm tra phù hợp lại.

| Mốc | Đầu ra / bằng chứng | Giới hạn |
|---|---|---|
| Foundation scaffold/mock | FOUNDATION_REVIEW.md; UI desktop/mobile, 5 ảnh; 14 test tại mốc Foundation; local Worker smoke, typecheck/build | Chưa nối gameplay đầy đủ; số test lịch sử không thay kiểm tra VS hiện tại |
| UI direction | UI_DIRECTION.md, REFERENCE_REVISION.svg; owner duyệt | Bố cục được duyệt, fixture/artwork không phải bộ bài thật |
| Git/root tooling | FOUNDATION_INTEGRATION.md; backup .git, main, npm workspaces, lock và CI Node24 | Chưa commit, remote, deploy hoặc chạy CI remote |
| Spec/research ban đầu | BASE_SPEC.md có 27 requirement; BASE_CARD_INDEX.csv có 96 định nghĩa, tổng standard copies 115 theo nguồn thứ cấp | Chỉ mốc nghiên cứu; card text/effect, trigger và expansion vẫn thiếu |
| Quyết định sản phẩm | product-decisions.md | Base 2–6; expansion hỗ trợ mở 8; timer 20 giây; một Modifier hoặc Skip; server dice; mọi player tham gia kể cả không card |
| VS room/reaction local | REACTION_SLICE_REPORT.md, REACTION_SLICE_HANDOFF.md; root npm test 20 workspace + 5 root PASS/1 live SKIP; live HTTP 5/5; browser core flow + F-02/F-03 PASS | Fixture demo qua HTTP polling; browser invalid saved-session/no-card state SKIP; chưa full base game, artwork, expansion hoặc deploy |

Lịch sử đầy đủ trước audit token: archive/STATUS_BEFORE_TOKEN_AUDIT_2026-10-29.md và archive/CHAT_ASSIGNMENTS_BEFORE_TOKEN_AUDIT_2026-10-29.md. Không đọc mặc định.

## SETUP-LOCAL-ACCEPT-20261102 — PM local synthetic acceptance

Scope SETUP_SLICE_DISPATCH:2–6 setup_demo,unique sequential Leaders,server deal5/3Monsters/private snapshots,3AP Draw/Redraw/EndTurn,idempotency/guards. SL-F01 config rejection root/live verified;UI roster/notice fixes typecheck/build+PM IAB reverify. QA setup5/5,root10PASS0FAIL1SKIP(live reaction URLunset),live8789 core/replay/privacy/config PASS. PM IAB2clients core+reload+reactionregression PASS;exact evidence PM_BROWSER_REVIEW_2026-11-01.md (final02/11),QA worker report distinct. NativeChrome request stillpending,not countedPASS. Runtime Vite5173 proxyenv→Worker8789 healthy. No fullbase/effects/art/expansion/license/deploy claim. No commit/push/deploy.

## DATA-BASE-REVIEW-20261102 — source/rule checkpoint

DB-01 sourceevidence và6Leaderbaseartifacts PMvisualchecked;sourcepublisher-linked/community-hosted,không publisher-hosted fullmanifest/license. Merchantauthority đãhạUNVERIFIED,editionmetadata khônggộp. DB-02 Heroimmediate once-per-turn verified;ownerdepletionpolicy sequential/reshuffle/partialstop đãghi riêngpublisherUNKNOWN. Outputs Content BASE_SOURCE_EVIDENCE/BASE_LEADER_ARTIFACT_CHECK,Rules BASE_RULE_GATES,productdecision02/11. Sourcebatch docs reviewaccepted;fullretailreadiness cònpartial. Không code/tests trongbatch;DEPL-001 implementation prepared,NEXT_BATCH. Không commit/push/deploy.

## DEPL-001-ACCEPT-20261102

OwnerpartialDrawpolicy implemented trong apps/worker,SETUP_API updated:sequentialdeck/discardreshuffle,partial/zeroresolve,Redrawdiscardfirst,normalAP/turn/idempotency/guards. Architecture typecheck+Worker14/14+dry-runPASS;QAsetup5/5,root10PASS0FAIL1unrelatedSKIP. RootHTTPcoverconservation/sequentialreshuffle/zero/AP/replay/conflict/guards;partialRedraw<5/emptyhand quaworkspaceinjectedstate. PMreviewsource/evidenceaccepted;docs/qa/DEPL_REPORT.md. Khônglive/browser/newscope,khôngfullbaseclaim/commit/push/deploy. Usagecuối95%/5h,74%/tuần,workersidle.

## BR-01-CAT-001-ACCEPT-20261102

Hẹn04:27đãchạy/xóa. BR-01PMpublicDOMexact95row name/quantity/cardURL/kind parity0mismatch/duplicate,badquantity0;inventorypermalink32728/gallery42555. CSV+evidence3JSON saved. 6visualchecked/89linkchecked secondaryrightsUNVERIFIED,historicalviewrequireslogin notread.

CAT-001typedinternalreference95defs→main115/Monster15/Leader6physicalcopies,instanceIdriêngdefinitionId,source/provenancestatuspreserved. WorkertypecheckPASS,targetedcatalogtests2/2PASS,PMreviewparity/source/noRoomimportaccepted. KhôngruntimeAPI/protocol/deps/UI/Room/baseenable/cardtext/art/effects;khôngfullretail/licenseclaim. Khôngrerunroom/root/DEPLsuites. HandoffBASE_REFERENCE_CATALOG_HANDOFF.md. Usage20%/5h,77%/tuần;Content/Architectureidle,khôngcommit/push/deploy.

## EG-PREP-001-REVIEW-20261102
Content2base scans mapped/read, Rules case matrix và Architecture outline saved; PM approved five project-minimal policies (product-decisions EG-PREP-001-PM-POLICY). Source remains secondary/UNVERIFIED; plan not API freeze. PC-CONTRACT-001 prepared before code. PM reviewed three docs and CSV mapping. git diff check unavailable/notworktree; no runtime checks for docs-only. Usage33%/5h79%week, workers idle, no commit/push/deploy.


## PC-CONTRACT-001-ACCEPT-20261102
PLAY_CARD_API.md reviewed/accepted, PM-policy mode/config/timeout recorded in product-decisions. Synthetic2card contract only, no runtime/tests/UI/base-enable claims. Usage38%/5h80%week checkpoint, Architectureidle; PC-IMPL-001 prepared, not dispatched.


## PC-IMPL-BOTH-BOUNDED-20261102
Bothsyntheticeffectsimplemented. Protocol11/Worker23(7effect)/QA4/root14PASS1SKIP, typechecks/buildsPASS. PM IAB2clientCriticalBoost/DodgySkip+paidfail/lastAPadvancePASS. Handoffs+PM_EFFECT_REVIEW saved. Fullgame not accepted; BACKLOG EF-TURN-001/EF-UI-001 explicit. Usage93%5h89%week checkpoint, workersidle, no commit/push/deploy.


## OPS-CHECKPOINT-20261102
Owner-requested operatingchange applied: AGENTS/OPERATING_MODEL, compact150word cards7workers, STATUS taskboard, preserved IDs/model/effort without overrides. All7checkpointcomplete/idle. Nativecontextcompaction unavailable/unconfirmed, no claim executed. No gameplaychecks/reruns; usage15%5h91%week checkpoint.


## EF-FOLLOWUP-001-CODE-TEST-20261102
END_TURN effect_demo+ownModifiermetadata/labels/completionguards implemented. Protocol11/Worker8/QA6/root16PASS1SKIP, typechecks/webbuildPASS; PMsource reviewed. UIlive NOTRUN provider browser.user unavailable, BACKLOG EF-BROWSER-001; unusedrenderer cleanup separatelydeferred. Allworkersidle, usage49%5h97%week checkpoint. No commit/push/deploy.


## EF-BROWSER-001-ACCEPT-20261102
PM control-session reset restoredIAB. D89726two-clientEndTurn host→guest→host3AP, kind/delta/targetlabels, pendingEndTurnhidden, playedModifier→remainingModifier/Skipdisabled PASS. LateSkipWINDOW_CLOSEDrefreshobserved, notallcompletedclaim. PM_EF_BROWSER_REVIEW_2026-11-02.md+screenshot. No oldtests/code/runtime changes or workerwake. EF-FOLLOWUP UI accepted.


## EF-UI-CLEANUP-001-ACCEPT-20261102
Removed unusedrenderers, activeV2 renamedEffectRoom, oneentrypoint; PM independentnormalizedfullfunctionhash8f8b…69f1 matches precleanupcheckpoint, workerbodyhash evidence inUIhandoff. Webtypecheck/buildPASS; no oldtests/browserrerun. Usage65%5h99%week, workersidle, no commit/push/deploy.

