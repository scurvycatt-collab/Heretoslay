# UI-001 — reference revision (review only)

**Owner:** UI/UX · **Scope:** `docs/ui/` · **Status:** direction **APPROVED**; no app is built.

## Reference and interpretation

Four supplied desktop captures were reviewed directly. Observed patterns: a wide white tabletop inside a heavy navy, angular retro frame; opponents around the perimeter; three central cards; personal avatar/party and a fanned hand on the lower edge; compact actions lower-right. Reaction states dim/blur the table, feature the active card at left, present an oversized headline/timer/stat line, and use a right-side player roster.

`REFERENCE_REVISION.svg` follows that spatial hierarchy and visual energy more closely than the earlier neutral mockup. It uses dark, corner-cut chrome and bold mono-like system typography, but does **not** copy the reference’s logo, dragon ornaments, card art, card text/effects, player names, or font. All card art is geometric placeholder color blocks; all values are labelled mockup/demo.

## Four desktop states

1. **Table:** bright broad play surface; opponents around its edge; three Monster placeholders centred; deck/discard at left; own Party/avatar and fanned hand below; Draw, Redeal, End Turn at lower-right. The four shown seats illustrate layout only. Base supports **2–6 players**; selecting an expansion can unlock up to **8**, but expansion play is not implemented in this review artifact.
2. **Hero roll / Modifier:** dimmed board, left active placeholder card, big 20-second deadline, Rolled/Modifier/Total/Required and dice illustration. Right roster distinguishes Waiting and Skipped; Modifier hand and Skip stay available below.
3. **Challenge prompt:** full-board reaction state with active card, `CHALLENGE?`, 20 seconds, roster, and Skip. A Challenge may be submitted either by clicking its card directly or by clicking that card's Challenge button. Caption limits it to a Hero/Item/Magic play—never a Hero-effect roll.
4. **Challenge versus:** two colored sides compare Roll/Modifier/Total around `VS`, with roster and reaction hand retained.

## Guardrails and unresolved behavior

D-07 is represented as 20 seconds with Skip; a new reaction must not reset that deadline. Each eligible player completes a window by submitting one valid Modifier or choosing Skip; completed players are final, and the window closes early when all eligible players complete. A disconnected player who is not complete waits through the 20-second deadline. Server dice and any animation are display-only client states. The source captures’ 35/57 second values and `Continue` are not adopted. Challenge remains first-valid-wins, with the server rolling both sides.

When the local player chooses Skip in a Challenge prompt, the full-screen prompt folds immediately back to the table while the authoritative `REACT_PASS` command is submitted. The minimized server-timed status remains available, and no game state is advanced locally. Party Leader effect copy uses a larger base size than other tarot description text, shrinking only as needed to keep the full rule inside its card panel.

Pressing `Esc` while any reaction/choice stage is open folds it to the table exactly like the `TABLE` control. This is presentation-only: it does not submit Skip or any other game command, and the minimized status can reopen the stage.

Once the authoritative phase is `game_over`, no hand play, Monster attack, Hero roll, Leader action, draw/redeal/pass button, target dialog, or keyboard gameplay shortcut remains actionable. The finished table, result, log, and navigation stay available for review.

On desktop, cards in hand overlap progressively as the hand grows, up to a 78% overlap. The deployed Party retains its own bounded region beside the hand so a large hand does not cover Hero cards.

Reaction trays with four or more playable Challenge/Modifier cards stay on one row and reduce card/action size according to both card count and viewport height. The primary Skip control remains in its own final grid row and must stay visible without vertical scrolling.

The Vietnamese card gallery always keeps Vietnamese frames and rule text. If a definition has standalone artwork, it fills the art window; if it only has an imported complete English face, the renderer crops that face's canonical art rectangle into the Vietnamese card instead of showing an empty artwork panel.

## Handoff

Files: `UI_DIRECTION.md`, `REFERENCE_REVISION.svg`; `WIREFRAME.svg` is intentionally unchanged. SVG is a review artifact with placeholder content and no third-party assets. Validation: SVG XML parsed; no renderer installed, so visual preview beyond source inspection was unavailable.
