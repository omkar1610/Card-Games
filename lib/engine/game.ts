// 29 game engine. Pure functions over plain JSON state so it can be stored in Redis as-is.
//
// Seats are 0..3. Play is anticlockwise: seat s is followed by (s + 1) % 4.
// Teams: seats 0 & 2 are team A, seats 1 & 3 are team B.
//
// Rules implemented (see README for details):
//  - 32 cards (J 9 A 10 K Q 8 7), points J=3 9=2 A=1 10=1 → 28 total.
//  - Deal 4 each, bid 16..28 (pass = out of the bidding). Bids are capped at 24 until someone has
//    bid 24; after that any higher bid up to 28. All pass → redeal with next dealer.
//  - Bid winner secretly chooses a trump suit (only they know it), then 4 more cards each.
//    If the opponents then hold no trump between them, the same dealer redeals.
//  - Must follow suit; anyone may lead any suit. A player who cannot follow may play any card,
//    or first "ask for trump" (revealing it), after which they must play a trump if they have one.
//  - Until the reveal there is no trump: trump-suit cards are ordinary cards.
//  - Marriage (K+Q of trump in one hand), declarable once trump is revealed:
//    bidder's team → target −4 (min 16), other team → +4 (max 28).
//  - After trump is chosen and all 8 cards are dealt, the other team may Double; if they do,
//    the bidder's team may Redouble. Each opponent (then each bidder-team player) answers once.
//  - The round ends as soon as its result can no longer change (target reached, or out of reach),
//    allowing for a marriage that could still be declared.
//  - Bidder team reaching the target scores +1 game point, otherwise −1 (×2 doubled, ×4 redoubled).
//  - The game ends when a team reaches +6 (they win) or −6 (they lose).

import { Card, SUITS, SUIT_SYMBOL, Suit, newDeck, pointsOf, shuffle, strength, suitOf, rankOf, sortHand } from "./cards";

export type Team = "A" | "B";
export type Phase = "bidding" | "trump" | "double" | "redouble" | "playing" | "done";

export const MIN_BID = 16;
export const MAX_BID = 28;
/** Bids above this are only allowed once someone has bid exactly this. */
export const BID_CAP = 24;

export function bidRange(highBid: number | null): { min: number; max: number } {
  return {
    min: highBid === null ? MIN_BID : highBid + 1,
    max: highBid !== null && highBid >= BID_CAP ? MAX_BID : BID_CAP,
  };
}
export const MARRIAGE_DELTA = 4;
export const GAME_POINTS = 6;

export const teamOf = (seat: number): Team => (seat % 2 === 0 ? "A" : "B");
export const nextSeat = (seat: number) => (seat + 1) % 4;

export interface PlayedCard {
  seat: number;
  card: Card;
}

export interface Trick {
  leader: number;
  cards: PlayedCard[];
  winner: number;
  points: number;
}

export interface BidEntry {
  seat: number;
  bid: number | null; // null = pass
}

export interface LogEntry {
  seat: number | null;
  text: string;
}

export interface RoundResult {
  round: number;
  bidder: number;
  bidderTeam: Team;
  bid: number;
  target: number;
  bidderPoints: number;
  multiplier: number;
  made: boolean;
  handsPlayed: number; // < 8 when the round ended early
  delta: Record<Team, number>;
}

export interface Round {
  number: number;
  dealer: number;
  phase: Phase;
  hands: Card[][];
  stock: Card[];
  turn: number;
  bids: BidEntry[];
  passed: boolean[];
  highBid: number | null;
  bidder: number | null;
  target: number | null;
  trumpSuit: Suit | null;
  trumpRevealed: boolean;
  revealedBy: number | null;
  revealTrick: number | null;
  mustTrump?: number | null; // seat that just asked for trump: must play one if they can
  leader: number;
  trick: PlayedCard[];
  tricks: Trick[];
  points: Record<Team, number>;
  marriage: { seat: number; team: Team } | null;
  multiplier: number; // 1, 2 (doubled) or 4 (redoubled)
  doubledBy: number | null;
  redoubledBy: number | null;
  declined: boolean[]; // who said "no" in the current double/redouble phase
  result: RoundResult | null;
  log: LogEntry[];
}

export interface Match {
  score: Record<Team, number>;
  winner?: Team | null; // set when a team reaches +6 or the other reaches −6
  gamesWon?: Record<Team, number>; // across "Play again"s in this room
  dealer: number;
  roundNumber: number;
  round: Round | null;
  history: RoundResult[];
}

export type Action =
  | { type: "bid"; value: number }
  | { type: "pass" }
  | { type: "chooseTrump"; suit: Suit }
  | { type: "revealTrump" }
  | { type: "play"; card: Card }
  | { type: "marriage" }
  | { type: "double" }
  | { type: "redouble" }
  | { type: "noDouble" }
  | { type: "nextRound" }
  | { type: "playAgain" };

export class EngineError extends Error {}

function fail(msg: string): never {
  throw new EngineError(msg);
}

// ---------------------------------------------------------------- setup

export function newMatch(rng: () => number = Math.random): Match {
  const match: Match = {
    score: { A: 0, B: 0 },
    winner: null,
    gamesWon: { A: 0, B: 0 },
    dealer: Math.floor(rng() * 4),
    roundNumber: 0,
    round: null,
    history: [],
  };
  startRound(match, rng);
  return match;
}

function startRound(match: Match, rng: () => number) {
  match.roundNumber += 1;
  const deck = shuffle(newDeck(), rng);
  const hands: Card[][] = [[], [], [], []];
  const first = nextSeat(match.dealer);
  for (let i = 0; i < 16; i++) hands[(first + i) % 4].push(deck[i]);
  match.round = {
    number: match.roundNumber,
    dealer: match.dealer,
    phase: "bidding",
    hands,
    stock: deck.slice(16),
    turn: first,
    bids: [],
    passed: [false, false, false, false],
    highBid: null,
    bidder: null,
    target: null,
    trumpSuit: null,
    trumpRevealed: false,
    revealedBy: null,
    revealTrick: null,
    leader: first,
    trick: [],
    tricks: [],
    points: { A: 0, B: 0 },
    marriage: null,
    multiplier: 1,
    doubledBy: null,
    redoubledBy: null,
    declined: [false, false, false, false],
    result: null,
    log: [{ seat: match.dealer, text: `dealt round ${match.roundNumber}` }],
  };
}

// ---------------------------------------------------------------- queries

export interface Legal {
  cards: Card[];
  canReveal: boolean;
}

export function legalPlays(r: Round, seat: number): Legal {
  if (r.phase !== "playing" || r.turn !== seat) return { cards: [], canReveal: false };
  const hand = r.hands[seat];
  if (r.trick.length === 0) return { cards: hand, canReveal: false };

  if (r.mustTrump === seat) {
    const trumps = hand.filter((c) => suitOf(c) === r.trumpSuit);
    return { cards: trumps.length ? trumps : hand, canReveal: false };
  }
  const led = suitOf(r.trick[0].card);
  const follow = hand.filter((c) => suitOf(c) === led);
  if (follow.length) return { cards: follow, canReveal: false };
  return { cards: hand, canReveal: !r.trumpRevealed };
}

export function canDeclareMarriage(r: Round, seat: number): boolean {
  if (r.phase !== "playing" || !r.trumpRevealed || r.marriage) return false;
  const hand = r.hands[seat];
  return hand.includes("K" + r.trumpSuit) && hand.includes("Q" + r.trumpSuit);
}

export function trickWinner(cards: PlayedCard[], trumpSuit: Suit | null, trumpRevealed: boolean): number {
  const led = suitOf(cards[0].card);
  const trumps = trumpRevealed && trumpSuit ? cards.filter((p) => suitOf(p.card) === trumpSuit) : [];
  const pool = trumps.length ? trumps : cards.filter((p) => suitOf(p.card) === led);
  return pool.reduce((best, p) => (strength(p.card) < strength(best.card) ? p : best)).seat;
}

// ---------------------------------------------------------------- actions

/** Applies an action for `seat`. Returns a new Match; never mutates the input. */
export function applyAction(input: Match, seat: number, action: Action, rng: () => number = Math.random): Match {
  const match: Match = structuredClone(input);
  const r = match.round;
  if (!r) fail("No round in progress");

  switch (action.type) {
    case "bid":
    case "pass":
      doBid(match, r, seat, action.type === "bid" ? action.value : null, rng);
      break;
    case "chooseTrump":
      doChooseTrump(match, r, seat, action.suit, rng);
      break;
    case "revealTrump":
      doReveal(r, seat);
      break;
    case "play":
      doPlay(match, r, seat, action.card);
      break;
    case "marriage":
      doMarriage(match, r, seat);
      break;
    case "double":
    case "redouble":
    case "noDouble":
      doDouble(r, seat, action.type);
      break;
    case "nextRound":
      if (r.phase !== "done") fail("Round is not finished");
      if (match.winner) fail("The game is over");
      match.dealer = nextSeat(match.dealer);
      startRound(match, rng);
      break;
    case "playAgain":
      if (!match.winner) fail("The game isn't over yet");
      match.score = { A: 0, B: 0 };
      match.history = [];
      match.winner = null;
      match.roundNumber = 0;
      match.dealer = nextSeat(match.dealer);
      startRound(match, rng);
      break;
    default:
      fail("Unknown action");
  }
  if (match.round) match.round.log = match.round.log.slice(-40);
  return match;
}

function doBid(match: Match, r: Round, seat: number, value: number | null, rng: () => number) {
  if (r.phase !== "bidding") fail("Not in bidding");
  if (r.turn !== seat) fail("Not your turn");
  if (value !== null) {
    if (!Number.isInteger(value)) fail("Bid must be a whole number");
    const { min, max } = bidRange(r.highBid);
    if (min > max) fail("No higher bid is possible");
    if (value < min || value > max)
      fail(max === BID_CAP && value > BID_CAP ? `Bids above ${BID_CAP} open up only after someone bids ${BID_CAP}` : `Bid must be between ${min} and ${max}`);
    r.highBid = value;
    r.bidder = seat;
    r.log.push({ seat, text: `bid ${value}` });
  } else {
    r.passed[seat] = true;
    r.log.push({ seat, text: "passed" });
  }
  r.bids.push({ seat, bid: value });

  const passedCount = r.passed.filter(Boolean).length;
  if (passedCount === 4) {
    match.dealer = nextSeat(match.dealer);
    match.roundNumber -= 1; // a redeal is not a new round
    startRound(match, rng);
    match.round!.log.unshift({ seat: null, text: "everyone passed — redealt" });
    return;
  }
  if (passedCount === 3 && r.highBid !== null) {
    r.phase = "trump";
    r.turn = r.bidder!;
    r.log.push({ seat: r.bidder, text: `won the bid at ${r.highBid}` });
    return;
  }
  let t = nextSeat(seat);
  while (r.passed[t]) t = nextSeat(t);
  r.turn = t;
}

function doChooseTrump(match: Match, r: Round, seat: number, suit: Suit, rng: () => number) {
  if (r.phase !== "trump") fail("Not choosing trump now");
  if (seat !== r.bidder) fail("Only the bidder chooses trump");
  if (!SUITS.includes(suit)) fail("Pick a suit");
  r.trumpSuit = suit;
  // Deal the second half: 4 more each, starting left of dealer.
  const first = nextSeat(r.dealer);
  r.stock.forEach((c, i) => r.hands[(first + i) % 4].push(c));
  r.stock = [];

  const bidderTeam = teamOf(seat);
  const oppTrumps = [0, 1, 2, 3]
    .filter((s) => teamOf(s) !== bidderTeam)
    .reduce((n, s) => n + r.hands[s].filter((c) => suitOf(c) === suit).length, 0);
  if (oppTrumps === 0) {
    // Same dealer, same round number, fresh shuffle.
    match.roundNumber -= 1;
    startRound(match, rng);
    match.round!.log.unshift({ seat: null, text: `the other team had no trump (${SUIT_SYMBOL[suit]}) — redealt` });
    return;
  }

  r.target = r.highBid;
  r.phase = "double";
  r.declined = [false, false, false, false];
  r.leader = first;
  r.turn = first;
  r.log.push({ seat, text: "chose the trump suit" });
}

/** Seats that may still answer in the current double/redouble phase. */
export function doubleDeciders(r: Round): number[] {
  if (r.phase !== "double" && r.phase !== "redouble") return [];
  const bidderTeam = teamOf(r.bidder!);
  return [0, 1, 2, 3].filter(
    (s) => (r.phase === "double" ? teamOf(s) !== bidderTeam : teamOf(s) === bidderTeam) && !r.declined[s],
  );
}

function doDouble(r: Round, seat: number, kind: "double" | "redouble" | "noDouble") {
  if (!doubleDeciders(r).includes(seat)) fail("You can't do that now");
  if (kind === "double") {
    if (r.phase !== "double") fail("You can't double now");
    r.multiplier = 2;
    r.doubledBy = seat;
    r.phase = "redouble";
    r.declined = [false, false, false, false];
    r.log.push({ seat, text: "doubled!" });
  } else if (kind === "redouble") {
    if (r.phase !== "redouble") fail("You can't redouble now");
    r.multiplier = 4;
    r.redoubledBy = seat;
    r.phase = "playing";
    r.log.push({ seat, text: "redoubled!" });
  } else {
    r.declined[seat] = true;
    r.log.push({ seat, text: r.phase === "double" ? "no double" : "no redouble" });
    if (doubleDeciders(r).length === 0) r.phase = "playing";
  }
}

function reveal(r: Round, seat: number) {
  r.trumpRevealed = true;
  r.revealedBy = seat;
  r.revealTrick = r.tricks.length;
}

function doReveal(r: Round, seat: number) {
  const legal = legalPlays(r, seat);
  if (!legal.canReveal) fail("You can't ask for trump now");
  reveal(r, seat);
  r.mustTrump = seat;
  r.log.push({ seat, text: `asked for trump — trump is ${SUIT_SYMBOL[r.trumpSuit!]}` });
}

function doPlay(match: Match, r: Round, seat: number, card: Card) {
  const legal = legalPlays(r, seat);
  if (!legal.cards.includes(card)) fail(r.turn !== seat ? "Not your turn" : "You can't play that card");

  const hand = r.hands[seat];
  hand.splice(hand.indexOf(card), 1);
  r.trick.push({ seat, card });
  r.mustTrump = null;

  if (r.trick.length < 4) {
    r.turn = nextSeat(seat);
    return;
  }

  const winner = trickWinner(r.trick, r.trumpSuit, r.trumpRevealed);
  const points = r.trick.reduce((s, p) => s + pointsOf(p.card), 0);
  r.tricks.push({ leader: r.leader, cards: r.trick, winner, points });
  r.points[teamOf(winner)] += points;
  r.trick = [];
  r.leader = winner;
  r.turn = winner;

  if (r.tricks.length === 8 || outcomeDecided(r) !== null) finishRound(match, r);
}

/**
 * true/false once the bidder's team has certainly made/missed the target, else null.
 * A marriage someone could still declare moves the target by ±4, so both targets must agree.
 */
export function outcomeDecided(r: Round): boolean | null {
  if (r.phase !== "playing" || r.target === null) return null;
  const bidderTeam = teamOf(r.bidder!);
  const have = r.points[bidderTeam];
  const left = 28 - r.points.A - r.points.B;
  const targets = [r.target];
  if (!r.marriage) {
    const holder = [0, 1, 2, 3].find(
      (s) => r.hands[s].includes("K" + r.trumpSuit) && r.hands[s].includes("Q" + r.trumpSuit),
    );
    if (holder !== undefined)
      targets.push(
        teamOf(holder) === bidderTeam ? Math.max(MIN_BID, r.target - MARRIAGE_DELTA) : Math.min(MAX_BID, r.target + MARRIAGE_DELTA),
      );
  }
  if (targets.every((t) => have >= t)) return true;
  if (targets.every((t) => have + left < t)) return false;
  return null;
}

function doMarriage(match: Match, r: Round, seat: number) {
  if (!canDeclareMarriage(r, seat)) fail("You can't declare a marriage now");
  const team = teamOf(seat);
  const bidderTeam = teamOf(r.bidder!);
  r.marriage = { seat, team };
  r.target =
    team === bidderTeam ? Math.max(MIN_BID, r.target! - MARRIAGE_DELTA) : Math.min(MAX_BID, r.target! + MARRIAGE_DELTA);
  r.log.push({ seat, text: `declared marriage — target is now ${r.target}` });
  // Settle only between hands; mid-hand it's checked again when the hand completes.
  if (r.trick.length === 0 && outcomeDecided(r) !== null) finishRound(match, r);
}

function finishRound(match: Match, r: Round) {
  const bidderTeam = teamOf(r.bidder!);
  const bidderPoints = r.points[bidderTeam];
  const made = bidderPoints >= r.target!;
  const delta: Record<Team, number> = { A: 0, B: 0 };
  delta[bidderTeam] = (made ? 1 : -1) * r.multiplier;
  match.score.A += delta.A;
  match.score.B += delta.B;
  const s = match.score[bidderTeam];
  if (Math.abs(s) >= GAME_POINTS) {
    const winner: Team = s > 0 ? bidderTeam : bidderTeam === "A" ? "B" : "A";
    match.winner = winner;
    match.gamesWon = match.gamesWon ?? { A: 0, B: 0 };
    match.gamesWon[winner] += 1;
  }
  r.phase = "done";
  r.result = {
    round: r.number,
    bidder: r.bidder!,
    bidderTeam,
    bid: r.highBid!,
    target: r.target!,
    bidderPoints,
    multiplier: r.multiplier,
    made,
    handsPlayed: r.tricks.length,
    delta,
  };
  match.history.push(r.result);
  if (r.tricks.length < 8) r.log.push({ seat: null, text: `result decided after ${r.tricks.length} hands — round over` });
  r.log.push({ seat: r.bidder, text: made ? `made the bid (${bidderPoints}/${r.target})` : `went down (${bidderPoints}/${r.target})` });
}

// ---------------------------------------------------------------- per-player view

export interface PlayerView {
  mySeat: number;
  score: Record<Team, number>;
  winner: Team | null;
  gamesWon: Record<Team, number>;
  history: RoundResult[];
  round: null | {
    number: number;
    dealer: number;
    phase: Phase;
    turn: number;
    hand: Card[];
    handCounts: number[];
    bids: BidEntry[];
    passed: boolean[];
    highBid: number | null;
    bidder: number | null;
    target: number | null;
    trumpSuit: Suit | null; // only visible to the bidder until revealed
    trumpRevealed: boolean;
    revealedBy: number | null;
    leader: number;
    trick: PlayedCard[];
    tricks: Trick[];
    points: Record<Team, number>;
    marriage: { seat: number; team: Team } | null;
    multiplier: number;
    doubledBy: number | null;
    redoubledBy: number | null;
    doubleDeciders: number[];
    result: RoundResult | null;
    log: LogEntry[];
    legal: Legal;
    canMarriage: boolean;
    minBid: number;
    maxBid: number;
    mustTrump: boolean; // I asked for trump and must play one
  };
}

/** Strips everything `seat` must not see (other hands, stock, secret trump suit). */
export function viewFor(match: Match, seat: number): PlayerView {
  const r = match.round;
  const common = {
    mySeat: seat,
    score: match.score,
    winner: match.winner ?? null,
    gamesWon: match.gamesWon ?? { A: 0, B: 0 },
    history: match.history,
  };
  if (!r) return { ...common, round: null };
  const iSeeTrump = r.trumpRevealed || seat === r.bidder;
  return {
    ...common,
    round: {
      number: r.number,
      dealer: r.dealer,
      phase: r.phase,
      turn: r.turn,
      hand: sortHand(r.hands[seat]),
      handCounts: r.hands.map((h) => h.length),
      bids: r.bids,
      passed: r.passed,
      highBid: r.highBid,
      bidder: r.bidder,
      target: r.target,
      trumpSuit: iSeeTrump ? r.trumpSuit : null,
      trumpRevealed: r.trumpRevealed,
      revealedBy: r.revealedBy,
      leader: r.leader,
      trick: r.trick,
      tricks: r.tricks,
      points: r.points,
      marriage: r.marriage,
      multiplier: r.multiplier,
      doubledBy: r.doubledBy,
      redoubledBy: r.redoubledBy,
      doubleDeciders: doubleDeciders(r),
      result: r.result,
      log: r.log,
      legal: legalPlays(r, seat),
      canMarriage: canDeclareMarriage(r, seat),
      minBid: bidRange(r.highBid).min,
      maxBid: bidRange(r.highBid).max,
      mustTrump: r.mustTrump === seat && r.hands[seat].some((c) => suitOf(c) === r.trumpSuit),
    },
  };
}

export { rankOf, suitOf };
