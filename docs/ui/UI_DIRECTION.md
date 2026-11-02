# UI-001 — reference revision (review only)

**Owner:** UI/UX · **Scope:** `docs/ui/` · **Status:** direction **APPROVED**; no app is built.

## Reference and interpretation

Four supplied desktop captures were reviewed directly. Observed patterns: a wide white tabletop inside a heavy navy, angular retro frame; opponents around the perimeter; three central cards; personal avatar/party and a fanned hand on the lower edge; compact actions lower-right. Reaction states dim/blur the table, feature the active card at left, present an oversized headline/timer/stat line, and use a right-side player roster.

`REFERENCE_REVISION.svg` follows that spatial hierarchy and visual energy more closely than the earlier neutral mockup. It uses dark, corner-cut chrome and bold mono-like system typography, but does **not** copy the reference’s logo, dragon ornaments, card art, card text/effects, player names, or font. All card art is geometric placeholder color blocks; all values are labelled mockup/demo.

## Four desktop states

1. **Table:** bright broad play surface; opponents around its edge; three Monster placeholders centred; deck/discard at left; own Party/avatar and fanned hand below; Draw, Redeal, End Turn at lower-right. The four shown seats illustrate layout only. Base supports **2–6 players**; selecting an expansion can unlock up to **8**, but expansion play is not implemented in this review artifact.
2. **Hero roll / Modifier:** dimmed board, left active placeholder card, big 20-second deadline, Rolled/Modifier/Total/Required and dice illustration. Right roster distinguishes Waiting and Skipped; Modifier hand and Skip stay available below.
3. **Challenge prompt:** full-board reaction state with active card, `CHALLENGE?`, 20 seconds, roster, and Skip. Caption limits it to a Hero/Item/Magic play—never a Hero-effect roll.
4. **Challenge versus:** two colored sides compare Roll/Modifier/Total around `VS`, with roster and reaction hand retained.

## Guardrails and unresolved behavior

D-07 is represented as 20 seconds with Skip; a new reaction must not reset that deadline. Each eligible player completes a window by submitting one valid Modifier or choosing Skip; completed players are final, and the window closes early when all eligible players complete. A disconnected player who is not complete waits through the 20-second deadline. Server dice and any animation are display-only client states. The source captures’ 35/57 second values and `Continue` are not adopted. Challenge remains first-valid-wins, with the server rolling both sides.

## Handoff

Files: `UI_DIRECTION.md`, `REFERENCE_REVISION.svg`; `WIREFRAME.svg` is intentionally unchanged. SVG is a review artifact with placeholder content and no third-party assets. Validation: SVG XML parsed; no renderer installed, so visual preview beyond source inspection was unavailable.
