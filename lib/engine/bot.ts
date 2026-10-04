// Simple, fair bot: decides using only what that seat could know (its hand, public play,
// and the trump suit only if it chose it or it has been revealed).
import { Card, Suit, SUITS, pointsOf, strength, suitOf } from "./cards";
import {
  Action,
  Round,
  bidRange,
  canDeclareMarriage,
  doubleDeciders,
  legalPlays,
  teamOf,
  trickWinner,
} from "./game";

const handPoints = (hand: Card[]) => hand.reduce((s, c) => s + pointsOf(c), 0);
const lowest = (cards: Card[]) =>
  cards.reduce((a, b) => (pointsOf(b) < pointsOf(a) || (pointsOf(b) === pointsOf(a) && strength(b) > strength(a)) ? b : a));
const highestPoints = (cards: Card[]) =>
  cards.reduce((a, b) => (pointsOf(b) > pointsOf(a) || (pointsOf(b) === pointsOf(a) && strength(b) < strength(a)) ? b : a));
const weakestWinner = (cards: Card[]) => cards.reduce((a, b) => (strength(b) > strength(a) ? b : a));

/** How much a suit is worth as trump from this hand. */
function suitValue(hand: Card[], s: Suit) {
  const cards = hand.filter((c) => suitOf(c) === s);
  return cards.length * 3 + handPoints(cards) * 2;
}

function bestSuit(hand: Card[]): Suit {
  return SUITS.reduce((best, s) => (suitValue(hand, s) > suitValue(hand, best) ? s : best));
}

/** Highest bid this 4-card hand is willing to go to (0 = pass). */
function bidLimit(hand: Card[]): number {
  const s = bestSuit(hand);
  const score = handPoints(hand) + hand.filter((c) => suitOf(c) === s).length * 2;
  if (score >= 12) return 22;
  if (score >= 10) return 20;
  if (score >= 8) return 18;
  if (score >= 6) return 17;
  return 0;
}

/** The action `seat` should take now, or null if it has nothing to do. */
export function botAction(r: Round, seat: number): Action | null {
  const hand = r.hands[seat];

  if (r.phase === "double" || r.phase === "redouble") {
    if (!doubleDeciders(r).includes(seat)) return null;
    const pts = handPoints(hand);
    if (r.phase === "double") return pts >= 11 && r.highBid! <= 18 ? { type: "double" } : { type: "noDouble" };
    return pts >= 12 ? { type: "redouble" } : { type: "noDouble" };
  }
  if (r.turn !== seat) return null;

  if (r.phase === "bidding") {
    const { min, max } = bidRange(r.highBid);
    const limit = bidLimit(hand);
    // Don't outbid a partner who is already holding the bid at a sensible level.
    const partnerHolds = r.bidder !== null && teamOf(r.bidder) === teamOf(seat);
    if (min <= max && min <= limit && !partnerHolds) return { type: "bid", value: min };
    return { type: "pass" };
  }

  if (r.phase === "trump") return { type: "chooseTrump", suit: bestSuit(hand) };

  if (r.phase !== "playing") return null;
  if (canDeclareMarriage(r, seat)) return { type: "marriage" };

  const legal = legalPlays(r, seat);
  const cards = legal.cards;
  const knowsTrump = r.trumpRevealed || seat === r.bidder;
  const trump = knowsTrump ? r.trumpSuit : null;

  // Leading: cash a jack, otherwise lead something cheap (avoid leading trump early as bidder).
  if (r.trick.length === 0) {
    const jacks = cards.filter((c) => c.startsWith("J") && suitOf(c) !== trump);
    if (jacks.length) return { type: "play", card: jacks[0] };
    const nonTrump = cards.filter((c) => suitOf(c) !== trump);
    return { type: "play", card: lowest(nonTrump.length ? nonTrump : cards) };
  }

  const tablePoints = r.trick.reduce((s, p) => s + pointsOf(p.card), 0);
  const winning = trickWinner(r.trick, r.trumpSuit, r.trumpRevealed);
  const partnerWinning = teamOf(winning) === teamOf(seat);
  const wins = (c: Card) =>
    trickWinner([...r.trick, { seat, card: c }], r.trumpSuit, r.trumpRevealed) === seat;

  // Can't follow suit, trump still hidden: ask for it when there's something worth taking.
  if (legal.canReveal && !partnerWinning && tablePoints >= 1 && seat !== r.bidder) return { type: "revealTrump" };
  if (legal.canReveal && seat === r.bidder && !partnerWinning && tablePoints >= 2 && hand.some((c) => suitOf(c) === trump))
    return { type: "revealTrump" };

  if (partnerWinning) {
    // Partner has it: give them points if the last player can't easily overtake, else play cheap.
    const last = r.trick.length === 3;
    return { type: "play", card: last ? highestPoints(cards) : lowest(cards) };
  }
  const winners = cards.filter(wins);
  if (winners.length && (tablePoints >= 1 || r.trick.length === 3 || winners.some((c) => pointsOf(c) > 0)))
    return { type: "play", card: weakestWinner(winners) };
  return { type: "play", card: lowest(cards) };
}

/** Any bot seat that has something to do right now (first found). */
export function nextBotMove(r: Round, isBot: (seat: number) => boolean): { seat: number; action: Action } | null {
  const candidates =
    r.phase === "double" || r.phase === "redouble" ? doubleDeciders(r) : r.phase === "done" ? [] : [r.turn];
  for (const seat of candidates) {
    if (!isBot(seat)) continue;
    const action = botAction(r, seat);
    if (action) return { seat, action };
  }
  return null;
}
