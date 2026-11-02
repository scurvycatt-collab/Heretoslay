# DEPL-001 — bounded implementation 2026-11-02

Owner cho phép dùng phần quota còn lại sau checkpoint80 để làm thêm task. Snapshot đầu82%/5h,72%/tuần;không resetquota/đổi model/tạochat. Mở duy nhất DEPL-001,không fullbase/nguồn rộng/effects/UI/art. Giữ phần dư cho verification/handoff;checkpoint khi gần cạn,không hứa phầntrăm đoán hoặc lách limit.

- Architecture01a182c5-9fbe-7f42-81ea-f2f6f818069b sở hữu apps/worker/**,docs/architecture/** vàworkspace tests. Input BASE_RULE_GATES RG-DEPL-01–06,NEXT_BATCH DEPL-001. Implement partial/zero/sequentialreshuffle/Redrawdiscardtrước,giữAPcost vàguards/idempotency;SETUP_API/handoff phảnánhpolicyowner. Không tests/** root/protocol/UI/rootdeps.
- QA01a186be-0c58-7882-86a8-e66d830fd104 sở hữu tests/**,docs/qa/**. Update depletion publicHTTP assertions cho policy mới,không nới unrelatedguards. ChờPM code-ready rồi affectedroot/meaningfulcases. Khôngbrowser/nativeChrome hoặc runtime restarts trong batch này.
- PM sở hữu tracker/dispatch,review code+evidence,không source worker. Không commit/push/deploy. Live chỉ nếuhealthy và thiết yếu,không bắtquét hàngtrămcommand hoặc replaybrowser cũ.

Acceptance:đủN;2deck+3discard→đúng5;M<N→M;bothzero→0stop;Redrawdiscardtrước;normalAP/no-carry/auto-advance;card conservation;exactreplay khôngdoublecard/AP/revision;payloadconflict/invalidphase/out-of-turn/stale giữrejectatomic. Chưa tính cảfullgame/source manifest đãverified. Policyowner khácpublisherUNKNOWN phảighi rõ.

Handoff<=250từ:file/checks thật/blocker/bước kế. No newtask khi budget không đủ finishingchecks. User approval không bypassreview rejection;đúng permission local đãgiaoPM.

## DEPL-001-ACCEPT-20261102

OwnerpartialDrawpolicy implemented trong apps/worker,SETUP_API updated:sequentialdeck/discardreshuffle,partial/zeroresolve,Redrawdiscardfirst,normalAP/turn/idempotency/guards. Architecture typecheck+Worker14/14+dry-runPASS;QAsetup5/5,root10PASS0FAIL1unrelatedSKIP. RootHTTPcoverconservation/sequentialreshuffle/zero/AP/replay/conflict/guards;partialRedraw<5/emptyhand quaworkspaceinjectedstate. PMreviewsource/evidenceaccepted;docs/qa/DEPL_REPORT.md. Khônglive/browser/newscope,khôngfullbaseclaim/commit/push/deploy. Usagecuối95%/5h,74%/tuần,workersidle.
