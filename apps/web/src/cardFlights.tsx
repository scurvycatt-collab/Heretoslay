// Card flights: when a new server snapshot moves a card to another zone, a short-lived "ghost" card
// travels from where the card was drawn on screen to where it is drawn now.
//
// Display only. The snapshot stays authoritative: this module never delays, blocks or invents state.
// It compares the previous and the current snapshot (card zones by cardId, hand counts, deck count)
// and replays the difference. Flights are skipped under `prefers-reduced-motion`.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { BaseCardView, BaseGameSnapshot } from "@here-to-slay/protocol";
import { CardRenderer } from "./CardRenderer";

type Box = { left: number; top: number; width: number; height: number };
type Flight = { id: number; card: BaseCardView | null; variant: "full" | "art"; from: Box; to: Box; delay: number; target?: HTMLElement };
/** A ghost never takes off as an empty frame: it waits (at most this long) for its picture to be decoded. */
const IMAGE_WAIT_MS = 700;

/** Resolves once every picture drawn inside `el` (<img> or CSS background) is decoded, or after `IMAGE_WAIT_MS`. */
function picturesReady(el: HTMLElement): Promise<void> {
  const waits: Promise<unknown>[] = [];
  for (const img of el.querySelectorAll("img")) {
    img.loading = "eager"; // faces are lazy by default; a ghost is always on screen
    waits.push(img.decode().catch(() => undefined));
  }
  for (const node of [el, ...el.querySelectorAll<HTMLElement>("*")]) {
    const url = /url\("?([^")]+)"?\)/.exec(node.style.backgroundImage)?.[1];
    if (!url) continue;
    const probe = new Image();
    probe.src = url;
    waits.push(probe.decode().catch(() => undefined));
  }
  if (!waits.length) return Promise.resolve();
  return Promise.race([Promise.all(waits).then(() => undefined), new Promise<void>((resolve) => window.setTimeout(resolve, IMAGE_WAIT_MS))]);
}

const DURATION_MS = 580;
const STAGGER_MS = 110;
/** Owner 2026-11-16: after a card lands in a Party the table stays visible this long before a reaction / roll stage opens. */
const STAGE_HOLD_AFTER_LANDING_MS = 500;
/** A single snapshot never spawns more than this many ghosts (8-seat deals stay readable). */
const MAX_FLIGHTS = 12;
const MAX_HIDDEN_DRAWS_PER_SEAT = 3;
/** Only cards drawn on the table itself are tracked: overlays (inspector, drawer, dialogs) repeat cardIds. */
const TRACKED = ".t3-hand [data-card-id], .t3-seat [data-card-id], .t3-discard [data-card-id], .t3-monsters [data-card-id]";

const box = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
};
/** A card-shaped box of `width` centred on `anchor` (used when the source card itself was never on screen). */
const centred = (anchor: Box, width: number, ratio = 1.25): Box => ({
  left: anchor.left + anchor.width / 2 - width / 2,
  top: anchor.top + anchor.height / 2 - (width * ratio) / 2,
  width,
  height: width * ratio,
});

/** cardId → zone for every card this viewer is allowed to see. */
function zonesOf(state: BaseGameSnapshot): Map<string, { zone: string; card: BaseCardView }> {
  const zones = new Map<string, { zone: string; card: BaseCardView }>();
  for (const card of state.yourHand) zones.set(card.cardId, { zone: "hand", card });
  for (const player of state.players) {
    for (const entry of player.party) {
      zones.set(entry.hero.cardId, { zone: `party:${player.playerId}`, card: entry.hero });
      for (const item of entry.attachments) zones.set(item.cardId, { zone: `party:${player.playerId}`, card: item });
    }
    for (const monster of player.slainMonsters) zones.set(monster.cardId, { zone: `slain:${player.playerId}`, card: monster });
  }
  for (const monster of state.game.faceUpMonsters) zones.set(monster.cardId, { zone: "monsters", card: monster });
  for (const card of state.game.discardPile ?? []) zones.set(card.cardId, { zone: "discard", card });
  return zones;
}

type Seen = { revision: number; zones: Map<string, { zone: string; card: BaseCardView }>; hands: Map<string, number>; deck: number };

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Call once in the table component and render the returned layer inside it.
 * `root` is the element that contains the table (queries are scoped to it).
 */
export function useCardFlights(state: BaseGameSnapshot, enabled: boolean) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const rects = useRef(new Map<string, Box>());
  const seen = useRef<Seen | null>(null);
  // Cards that left every visible zone (e.g. a Hero waiting on a Challenge window) keep their last box,
  // so they fly from where they were when they come back on the table.
  const limbo = useRef(new Map<string, Box>());
  const nextId = useRef(1);
  // While > 0 the caller keeps full-screen stages closed so the landing is seen (never delays a command).
  const [holdMs, setHoldMs] = useState(0);
  useEffect(() => {
    if (!holdMs) return;
    const timer = window.setTimeout(() => setHoldMs(0), holdMs);
    return () => window.clearTimeout(timer);
  }, [holdMs]);

  // No dependency list on purpose: positions are re-read after every render so the "from" box of a card
  // is where the player last saw it (the hand fans out on hover, seats move with the window).
  useLayoutEffect(() => {
    const zones = zonesOf(state);
    const hands = new Map(state.players.map((p) => [p.playerId, p.handCount]));
    const deck = state.game.mainDeckCount;
    const previous = seen.current;
    const live = new Map<string, Element>();
    for (const el of document.querySelectorAll(TRACKED)) {
      const id = el.getAttribute("data-card-id");
      if (id && !live.has(id)) live.set(id, el);
    }

    if (enabled && previous && previous.revision !== state.revision && !reducedMotion()) {
      const seat = (playerId: string) => document.querySelector(`[data-seat-id="${CSS.escape(playerId)}"]`);
      const deckEl = document.querySelector(".t3-deck");
      const discardEl = document.querySelector(".t3-discard");
      const me = state.you.playerId;
      const planned: Array<Omit<Flight, "id" | "delay" | "target"> & { target?: Element; landsInParty?: boolean }> = [];
      // Who lost cards from a hidden hand in this step (source of a card that appears from nowhere).
      const shrunk = state.players.filter((p) => (previous.hands.get(p.playerId) ?? p.handCount) > p.handCount).map((p) => p.playerId);

      for (const [cardId, now] of zones) {
        const before = previous.zones.get(cardId);
        if (before?.zone === now.zone) continue;
        const target = live.get(cardId);
        const owner = now.zone.includes(":") ? now.zone.slice(now.zone.indexOf(":") + 1) : null;
        const anchorEl = target ?? (owner ? seat(owner) : now.zone === "discard" ? discardEl : null);
        if (!anchorEl) continue;
        const to = target ? box(target) : centred(box(anchorEl), 44);
        let from = before ? rects.current.get(cardId) : limbo.current.get(cardId);
        limbo.current.delete(cardId);
        if (!from) {
          if (now.zone === "hand") {
            // Drawn from the main deck (a card pulled from another hand has no visible source either).
            if (!deckEl) continue;
            from = box(deckEl);
          } else if (now.zone.startsWith("party:") || now.zone === "discard") {
            // Played or discarded from a hidden hand: it leaves that player's seat.
            const sourceId = now.zone.startsWith("party:") ? owner! : shrunk.find((id) => id !== me) ?? state.game.currentPlayerId;
            const sourceEl = sourceId ? seat(sourceId) : null;
            if (!sourceEl) continue;
            from = centred(box(sourceEl), Math.max(64, to.width));
          } else continue;
        }
        planned.push({ card: now.card, variant: now.zone === "hand" || now.zone === "discard" ? "full" : "art", from, to, target, landsInParty: now.zone.startsWith("party:") });
      }

      // Opponents drawing: face-down cards from the deck to their seat (their hand is hidden).
      if (deckEl && (deck < previous.deck || previous.deck === 0)) {
        for (const player of state.players) {
          if (player.playerId === me) continue;
          const gained = Math.min(MAX_HIDDEN_DRAWS_PER_SEAT, player.handCount - (previous.hands.get(player.playerId) ?? player.handCount));
          const seatEl = gained > 0 ? seat(player.playerId) : null;
          if (!seatEl) continue;
          for (let i = 0; i < gained; i += 1) planned.push({ card: null, variant: "art", from: box(deckEl), to: centred(box(seatEl), 40) });
        }
      }

      if (planned.length) {
        const batch = planned.slice(0, MAX_FLIGHTS).map((flight, i) => {
          const delay = i * STAGGER_MS;
          // The real card stays hidden until its ghost lands (the ghost does it), so nothing appears twice.
          return { id: nextId.current++, card: flight.card, variant: flight.variant, from: flight.from, to: flight.to, delay, target: flight.target instanceof HTMLElement ? flight.target : undefined };
        });
        setFlights((current) => [...current, ...batch]);
        const lastLanding = planned.slice(0, MAX_FLIGHTS).reduce((latest, flight, i) => (flight.landsInParty ? i * STAGGER_MS + DURATION_MS : latest), 0);
        if (lastLanding) setHoldMs(lastLanding + STAGE_HOLD_AFTER_LANDING_MS);
      }
    }

    if (previous) {
      for (const cardId of previous.zones.keys()) {
        const last = rects.current.get(cardId);
        if (!zones.has(cardId) && last) limbo.current.set(cardId, last);
      }
      // Bounded: a card that never returns (shuffled back, stolen into a hidden hand) is forgotten.
      while (limbo.current.size > 40) limbo.current.delete(limbo.current.keys().next().value!);
    }
    seen.current = { revision: state.revision, zones, hands, deck };
    const next = new Map<string, Box>();
    for (const [id, el] of live) next.set(id, box(el));
    rects.current = next;
  });

  const done = (id: number) => setFlights((current) => current.filter((flight) => flight.id !== id));
  const layer = flights.length ? (
    <div className="t3-flights" aria-hidden>
      {flights.map((flight) => <Ghost key={flight.id} flight={flight} onDone={() => done(flight.id)} />)}
    </div>
  ) : null;
  return { layer, holdStage: holdMs > 0 };
}

/**
 * True for a moment after `value` drops (a Hero destroyed, sacrificed or stolen): the seat shakes once.
 * Display only; the value itself always comes from the snapshot.
 */
export function useLossPulse(value: number, ms = 520): boolean {
  const last = useRef(value);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (value < last.current) setPulse((n) => n + 1);
    last.current = value;
  }, [value]);
  useEffect(() => {
    if (!pulse) return;
    const timer = window.setTimeout(() => setPulse(0), ms);
    return () => window.clearTimeout(timer);
  }, [pulse, ms]);
  return pulse > 0;
}

function Ghost({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { from, to } = flight;
  // Drawn at the larger of the two sizes and scaled down, so the art never upscales into a blur.
  const width = Math.max(from.width, to.width, 24);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = flight.target;
    const reveal = () => { if (target) target.style.opacity = ""; };
    if (target) target.style.opacity = "0";
    const at = (b: Box, lift = 1) => `translate(${b.left}px, ${b.top}px) scale(${(b.width / width) * lift})`;
    const mid: Box = { left: (from.left + to.left) / 2, top: (from.top + to.top) / 2 - 18, width: (from.width + to.width) / 2, height: 0 };
    let cancelled = false;
    let animation: Animation | undefined;
    // The card leaves the deck as a full picture, not as an empty frame that fills in on arrival.
    void picturesReady(el).then(() => {
      if (cancelled) return;
      animation = el.animate(
        [
          { transform: at(from), opacity: 0.2 },
          { transform: at(from), opacity: 1, offset: 0.08 },
          { transform: at(mid, 1.08), opacity: 1, offset: 0.55 },
          { transform: at(to), opacity: 1 },
        ],
        { duration: DURATION_MS, delay: flight.delay, easing: "cubic-bezier(.3,.7,.3,1)", fill: "both" },
      );
      animation.onfinish = () => { reveal(); onDone(); };
    });
    // Cancelling (unmount, or React StrictMode's mount → unmount → mount in dev) must not end the flight.
    return () => { cancelled = true; reveal(); if (animation) { animation.onfinish = null; animation.cancel(); } };
    // One flight per mounted ghost: its boxes never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div ref={ref} className="t3-flight" style={{ width, opacity: 0 } as CSSProperties}>
      {flight.card
        ? <CardRenderer card={flight.card} variant={flight.variant} size="xs" inspect={false} style={{ "--w": `${width}px` } as CSSProperties} />
        : <span className="t3-flight-back" />}
    </div>
  );
}
