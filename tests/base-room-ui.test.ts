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

test("right-click opens the same full-card inspector as a 2-second hover", async () => {
  const card = await readFile(new URL("../apps/web/src/CardRenderer.tsx", import.meta.url), "utf8");
  const room = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  assert.match(card, /onContextMenu: canInspect/);
  assert.match(card, /e\.preventDefault\(\);\s+setInspect\(card, e\.currentTarget\.getBoundingClientRect\(\), true\)/);
  assert.match(room, /hover a card for 2s or right-click to enlarge/);
  assert.match(room, /INSPECT_DWELL_MS = 2000/);
  assert.doesNotMatch(room, /useModifierKey|e\.key === "Control"/);
});

test("one-way Modifiers play from the card and two-way cards reveal value then target steps", async () => {
  const room = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  assert.match(room, /const singleValue = options\.length === 1 \? options\[0\] : undefined/);
  assert.match(room, /if \(singleValue !== undefined\) play\(singleValue\)/);
  assert.match(room, /setFocusCard\(focusCard === card\.cardId \? null : card\.cardId\);\s+setModifierValue\(null\)/);
  assert.match(room, /focusCard === card\.cardId && modifierValue === null && options\.map/);
  assert.match(room, /roll\.kind === "challenge" \? setModifierValue\(value\) : play\(value\)/);
  assert.match(room, /2 · APPLY \{signed\(modifierValue\)\} TO/);
  assert.match(room, /play\(modifierValue, chosenSide\)/);
  assert.match(room, /ariaLabel=\{singleValue === undefined \? `\$\{card\.name\} — choose modifier value` : `\$\{card\.name\} — play \$\{signed\(singleValue\)\}`\}/);
});

test("lobby exposes per-player Ready state and only the host can start after everyone is ready", async () => {
  const room = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  assert.match(room, /send\("SET_READY", \{ ready: !mine\?\.ready \}\)/);
  assert.match(room, /const notReady = state\.players\.filter\(\(p\) => !p\.ready\)/);
  assert.match(room, /notReady\.length === 0/);
  assert.match(room, /Waiting for.*to get ready/);
});

test("the host can start a clean game from game over without replacing the room", async () => {
  const room = await readFile(new URL("../apps/web/src/BaseRoom.tsx", import.meta.url), "utf8");
  assert.match(room, /send\("NEW_GAME", \{\}\)/);
  assert.match(room, /NEW GAME · SAME ROOM/);
});
