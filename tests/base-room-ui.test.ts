import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Challenge Skip folds the popup to the table before sending REACT_PASS", async () => {
  const source = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  assert.match(source, /setCollapsed\(true\); send\("REACT_PASS", \{ windowId: chain\.windowId \}\); \}\}>SKIP<\/button>/);
});

test("Escape folds a reaction popup to the table without sending a game command", async () => {
  const source = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  const reaction = source.slice(source.indexOf("function ReactionStage"), source.indexOf("function LogToasts"));
  assert.match(reaction, /event\.key === "Escape"\) setCollapsed\(true\)/);
  assert.match(reaction, /addEventListener\("keydown", returnToTable\)/);
  assert.match(reaction, /removeEventListener\("keydown", returnToTable\)/);
});

test("a Challenge can be submitted from either its card or its action button", async () => {
  const source = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  const challengeBlock = source.slice(source.indexOf('if (chain.step === "challenge_window")'), source.indexOf('} else if (chain.step === "modifier_window")'));
  const action = /send\("REACT_CHALLENGE", \{ windowId: chain\.windowId, cardInstanceId: card\.cardId \}\)/g;
  assert.equal((challengeBlock.match(action) ?? []).length, 2);
  assert.match(challengeBlock, />CHALLENGE<\/button>/);
});

test("Party Leader effect copy uses the larger fitted type scale", async () => {
  const source = await readFile(new URL("../apps/web/src/cards/CardRenderer.tsx", import.meta.url), "utf8");
  assert.match(source, /DESCRIPTION\.party_leader[^\n]+size=\{42\} minSize=\{30\}/);
});

test("game over removes every gameplay action path", async () => {
  const source = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  assert.match(source, /const gameActive = game\.phase === "turn_active";/);
  assert.match(source, /const active = gameActive && game\.currentPlayerId === me;/);
  assert.match(source, /if \(game\.phase !== "game_over"\) return;\s+setTargetRequest\(null\);\s+setAttackFor\(null\);/);
  assert.match(source, /onClick=\{gameActive \? \(\) => setAttackFor/);
});

test("large reaction hands shrink into one tray row so the primary action stays visible", async () => {
  const room = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../apps/web/src/base-room.css", import.meta.url), "utf8");
  assert.match(room, /trayCardCount >= 4 \? " is-dense"/);
  assert.match(room, /"--tray-count": Math\.max\(1, trayCardCount\)/);
  assert.match(css, /\.t3-stage-tray\.is-dense \{ flex-wrap: nowrap;/);
  assert.match(css, /calc\(\(88vw - \(var\(--tray-count\) - 1\) \* 14px\) \/ var\(--tray-count\)\)/);
});

test("a growing hand keeps overlapping so it does not cover the deployed Party", async () => {
  const room = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../apps/web/src/base-room.css", import.meta.url), "utf8");
  assert.match(room, /const handShift = -Math\.min\(0\.78, 0\.2 \+ Math\.max\(0, n - 5\) \* 0\.055\)/);
  assert.match(room, /"--hand-shift": handShift/);
  assert.match(css, /\.t3-hand-card \{ margin-left: calc\(var\(--hw\) \* var\(--hand-shift\)\); \}/);
  assert.match(css, /\.t3-seat--me \.t3-party \{ max-width: 20cqw;/);
});

test("Ctrl/Command-click and right-click open the same inspector while 2-second hover remains", async () => {
  const card = await readFile(new URL("../apps/web/src/CardRenderer.tsx", import.meta.url), "utf8");
  const room = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  assert.match(card, /onContextMenu: canInspect/);
  assert.match(card, /e\.preventDefault\(\);\s+setInspect\(card, e\.currentTarget\.getBoundingClientRect\(\), true\)/);
  assert.match(card, /!e\.ctrlKey && !e\.metaKey/);
  assert.match(card, /if \(!inspectModifiedClick\(e\)\) onClick\(\)/);
  assert.match(room, /hover a card for 2s or right-click to enlarge/);
  assert.match(room, /INSPECT_DWELL_MS = 2000/);
});

test("one-way Modifiers skip value selection but still choose a Challenge target", async () => {
  const room = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  assert.match(room, /const singleValue = options\.length === 1 \? options\[0\] : undefined/);
  assert.match(room, /if \(singleValue !== undefined && roll\.kind !== "challenge"\) play\(singleValue\)/);
  assert.match(room, /setModifierValue\(singleValue\)/);
  assert.match(room, /setFocusCard\(focusCard === card\.cardId \? null : card\.cardId\);\s+setModifierValue\(null\)/);
  assert.match(room, /focusCard === card\.cardId && modifierValue === null && options\.map/);
  assert.match(room, /roll\.kind === "challenge" \? setModifierValue\(value\) : play\(value\)/);
  assert.match(room, /2 · APPLY \{signed\(modifierValue\)\} TO/);
  assert.match(room, /play\(modifierValue, chosenSide\)/);
  assert.match(room, /choose who receives \$\{signed\(singleValue\)\}/);
});

test("lobby requires Ready only from non-host players", async () => {
  const room = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  assert.match(room, /send\("SET_READY", \{ ready: !mine\?\.ready \}\)/);
  assert.match(room, /const notReady = state\.players\.filter\(\(p\) => !p\.isHost && !p\.ready\)/);
  assert.match(room, /!mine\?\.isBot && !mine\?\.isHost && <button/);
  assert.match(room, /!mine\?\.isHost && <button className="t3-btn t3-btn--continue t3-btn--big"/);
  assert.match(room, /onClick=\{\(\) => send\("SET_READY", \{ ready: !mine\?\.ready \}\)\}/);
  assert.match(room, /notReady\.length === 0/);
  assert.match(room, /Waiting for.*to get ready/);
  const css = await readFile(new URL("../apps/web/src/base-room.css", import.meta.url), "utf8");
  assert.match(css, /\.t3-lobby-foot \{ position: sticky; bottom: 0;/);
});

test("the host can start a clean game from game over without replacing the room", async () => {
  const room = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  assert.match(room, /send\("NEW_GAME", \{\}\)/);
  assert.match(room, /NEW GAME · SAME ROOM/);
});

test("each table name tag shows the authoritative hand count beside the player name", async () => {
  const room = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  const css = await readFile(new URL("../apps/web/src/base-room.css", import.meta.url), "utf8");
  assert.match(room, /className="t3-hand-count" aria-label=\{`\$\{player\.handCount\} cards in hand`\}>🃏 \{player\.handCount\}/);
  assert.match(css, /\.t3-hand-count \{ flex: 0 0 auto;/);
});

test("playing a Hero is disabled when the Party already has 6 Heroes", async () => {
  const room = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  assert.match(room, /partyFull=\{\(mySeat\?\.party\.length \?\? 0\) >= partyCap\}/);
  assert.match(room, /const partyCap = game\.settings\.expansionIds\?\.length \? 7 : 6;/);
  assert.match(room, /card\.kind === "hero" && partyFull/);
  assert.match(room, /Party is limited to \$\{partyCap\} Heroes/);
});

test("every card/function/target selection can return to the table without submitting", async () => {
  const room = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  const targetDialog = room.slice(room.indexOf("function TargetDialog"), room.indexOf("/* --------------------------------------------------------------- inspector */"));
  const reaction = room.slice(room.indexOf("function ReactionStage"), room.indexOf("/* --------------------------------------------------------------- popups */"));
  assert.match(targetDialog, /className="t3-stage-min" onClick=\{onClose\}[^>]*>◱ TABLE<\/button>/);
  assert.match(targetDialog, /event\.key === "Escape"\) onClose\(\)/);
  assert.match(reaction, /className="t3-stage-min" onClick=\{\(\) => setCollapsed\(true\)\}[^>]*>◱ TABLE<\/button>/);
  assert.match(reaction, /const openTargetDialog = \(request: TargetRequest\) => \{\s*setCollapsed\(true\);\s*askTargets\(request\);/);
  assert.doesNotMatch(reaction, /(?<!openTargetDialog\()askTargets\(\{/);
});

test("Whiskers' STEAL/DESTROY target picker has an explicit TABLE escape", async () => {
  const room = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  const cards = await readFile(new URL("../apps/worker/src/content/base-cards.json", import.meta.url), "utf8");
  assert.match(cards, /"definitionId": "hts\.base\.v1\.hero\.whiskers"[\s\S]*?"target": "two_heroes_other_party"/);
  const targetDialog = room.slice(room.indexOf("function TargetDialog"), room.indexOf("/* --------------------------------------------------------------- inspector */"));
  assert.match(targetDialog, /aria-label="Hide target selection to view the table">◱ TABLE<\/button>/);
});
