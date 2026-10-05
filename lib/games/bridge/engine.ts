// Contract Bridge engine (Chicago scoring). Pure functions over JSON state.
//
// Seats 0..3 in clockwise order: seat s is followed by (s + 1) % 4. Partnerships: 0 & 2 (A), 1 & 3 (B).
// - 52 cards, 13 each. Dealer calls first. Auction: bids 1♣..7NT (each higher than the last),
//   pass, double (an opponent's bid), redouble (a double of your side's bid).
//   Three passes after a bid end the auction; four opening passes → same dealer redeals.
// - Declarer = first player of the winning side to name the final strain; dummy = partner.
//   Left of declarer leads; then dummy's cards go face up and declarer plays them.
// - Must follow suit; trumps = the contract's strain (none in NT). 13 tricks per deal.
// - Chicago: 4 deals (vulnerability: none / dealer's side / dealer's side / both),
//   standard contract-bridge scoring; higher total after 4 deals wins.

import { Card, shuffle, suitOf, rankOf } from "../../engine/cards";
import { EngineError, LogEntry, PlayedCard, Team, teamOf } from "../../engine/game";
import { scoreDeal, ScoreResult } from "./scoring";

export type Suit = "S" | "H" | "D" | "C";
export type Strain = "C" | "D" | "H" | "S" | "NT";
export const STRAINS: Strain[] = ["C", "D", "H", "S", "NT"];
export const STRAIN_SYMBOL: Record<Strain, string> = { C: "♣", D: "♦", H: "♥", S: "♠", NT: "NT" };
export const BRIDGE_RANKS = ["A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"];
export const DEALS_PER_CHICAGO = 4;

export type Call =
  | { type: "bid"; level: number; strain: Strain }
  | { type: "pass" }
  | { type: "double" }
  | { type: "redouble" };

export interface CallEntry {
  seat: number;
  call: Call;
}

export interface Contract {
  level: number;
  strain: Strain;
  doubled: 0 | 1 | 2; // 1 = doubled, 2 = redoubled
  declarer: number;
}

export interface BTrick {
  leader: number;
  cards: PlayedCard[];
  winner: number;
}

export interface DealResult extends ScoreResult {
  deal: number;
  contract: Contract;
  declarerTeam: Team;
  tricks: number; // won by declarer's side
  pointsTo: Record<Team, number>;
}

export interface BRound {
  deal: number; // 1..4 within the Chicago
  dealer: number;
  vulnerable: Record<Team, boolean>;
  phase: "auction" | "play" | "done";
  hands: Card[][];
  turn: number;
  calls: CallEntry[];
  contract: Contract | null;
  dummy: number | null;
  dummyVisible: boolean;
  leader: number;
  trick: PlayedCard[];
  tricks: BTrick[];
  won: Record<Team, number>;
  result: DealResult | null;
  log: LogEntry[];
}

export interface BMatch {
  dealer: number;
  deal: number;
  score: Record<Team, number>; // this Chicago's totals
  history: DealResult[];
  round: BRound;
  winner: Team | "tie" | null;
  gamesWon: Record<Team, number>;
}

export type BAction =
  | { type: "call"; call: Call }
  | { type: "play"; card: Card }
  | { type: "nextDeal" }
  | { type: "playAgain" };

const fail = (msg: string): never => {
  throw new EngineError(msg);
};
export const nextSeat = (s: number) => (s + 1) % 4;
const rankIdx = (c: Card) => BRIDGE_RANKS.indexOf(rankOf(c));

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of ["S", "H", "D", "C"]) for (const r of BRIDGE_RANKS) deck.push(r + s);
  return deck;
}

export function sortBridgeHand(hand: Card[]): Card[] {
  const order = ["S", "H", "C", "D"];
  return hand.slice().sort((a, b) => order.indexOf(suitOf(a)) - order.indexOf(suitOf(b)) || rankIdx(a) - rankIdx(b));
}

export function callText(c: Call): string {
  if (c.type === "bid") return `${c.level}${STRAIN_SYMBOL[c.strain]}`;
  return c.type === "pass" ? "Pass" : c.type === "double" ? "Double" : "Redouble";
}

export function contractText(c: Contract): string {
  return `${c.level}${STRAIN_SYMBOL[c.strain]}${c.doubled === 2 ? " XX" : c.doubled === 1 ? " X" : ""}`;
}

/** Chicago vulnerability for deal 1..4 with the given dealer. */
export function vulnerability(deal: number, dealer: number): Record<Team, boolean> {
  const dealerSide = teamOf(dealer);
  if (deal === 1) return { A: false, B: false };
  if (deal === 4) return { A: true, B: true };
  return { A: dealerSide === "A", B: dealerSide === "B" };
}

// ---------------------------------------------------------------- setup

export function newMatch(rng: () => number = Math.random): BMatch {
  const dealer = Math.floor(rng() * 4);
  const m = {
    dealer,
    deal: 1,
    score: { A: 0, B: 0 },
    history: [],
    winner: null,
    gamesWon: { A: 0, B: 0 },
  } as unknown as BMatch;
  m.round = freshRound(1, dealer, rng);
  return m;
}

function freshRound(deal: number, dealer: number, rng: () => number): BRound {
  const deck = shuffle(newDeck(), rng);
  const hands: Card[][] = [[], [], [], []];
  deck.forEach((c, i) => hands[(dealer + 1 + i) % 4].push(c));
  return {
    deal,
    dealer,
    vulnerable: vulnerability(deal, dealer),
    phase: "auction",
    hands,
    turn: dealer,
    calls: [],
    contract: null,
    dummy: null,
    dummyVisible: false,
    leader: nextSeat(dealer),
    trick: [],
    tricks: [],
    won: { A: 0, B: 0 },
    result: null,
    log: [{ seat: dealer, text: `dealt deal ${deal} of ${DEALS_PER_CHICAGO}` }],
  };
}

// ---------------------------------------------------------------- auction

const bidRank = (level: number, strain: Strain) => (level - 1) * 5 + STRAINS.indexOf(strain);

function lastBid(r: BRound): CallEntry | null {
  for (let i = r.calls.length - 1; i >= 0; i--) if (r.calls[i].call.type === "bid") return r.calls[i];
  return null;
}

function lastNonPass(r: BRound): CallEntry | null {
  for (let i = r.calls.length - 1; i >= 0; i--) if (r.calls[i].call.type !== "pass") return r.calls[i];
  return null;
}

export interface LegalCalls {
  minBid: { level: number; strain: Strain } | null; // cheapest legal bid (null if 7NT already bid)
  canDouble: boolean;
  canRedouble: boolean;
}

export function legalCalls(r: BRound, seat: number): LegalCalls {
  if (r.phase !== "auction" || r.turn !== seat) return { minBid: null, canDouble: false, canRedouble: false };
  const lb = lastBid(r);
  const ln = lastNonPass(r);
  let minBid: LegalCalls["minBid"] = { level: 1, strain: "C" };
  if (lb && lb.call.type === "bid") {
    const next = bidRank(lb.call.level, lb.call.strain) + 1;
    minBid = next > bidRank(7, "NT") ? null : { level: Math.floor(next / 5) + 1, strain: STRAINS[next % 5] };
  }
  const opp = (s: number) => teamOf(s) !== teamOf(seat);
  return {
    minBid,
    canDouble: !!ln && ln.call.type === "bid" && opp(ln.seat),
    canRedouble: !!ln && ln.call.type === "double" && opp(ln.seat),
  };
}

export function isLegalCall(r: BRound, seat: number, c: Call): boolean {
  const l = legalCalls(r, seat);
  if (r.phase !== "auction" || r.turn !== seat) return false;
  switch (c.type) {
    case "pass":
      return true;
    case "double":
      return l.canDouble;
    case "redouble":
      return l.canRedouble;
    case "bid":
      return (
        !!l.minBid &&
        Number.isInteger(c.level) &&
        c.level >= 1 &&
        c.level <= 7 &&
        STRAINS.includes(c.strain) &&
        bidRank(c.level, c.strain) >= bidRank(l.minBid.level, l.minBid.strain)
      );
  }
}

function doCall(m: BMatch, r: BRound, seat: number, c: Call, rng: () => number) {
  if (r.phase !== "auction") fail("The auction is over");
  if (r.turn !== seat) fail("Not your turn");
  if (!isLegalCall(r, seat, c)) fail("You can't make that call");
  r.calls.push({ seat, call: c });
  r.log.push({
    seat,
    text: c.type === "bid" ? `bid ${callText(c)}` : c.type === "pass" ? "passed" : c.type === "double" ? "doubled!" : "redoubled!",
  });

  const n = r.calls.length;
  const allPassed = n === 4 && r.calls.every((x) => x.call.type === "pass");
  if (allPassed) {
    m.round = freshRound(r.deal, r.dealer, rng); // passed out: same dealer redeals
    m.round.log.unshift({ seat: null, text: "everyone passed — redealt" });
    return;
  }
  const endsAuction = lastBid(r) !== null && n >= 4 && r.calls.slice(-3).every((x) => x.call.type === "pass");
  if (!endsAuction) {
    r.turn = nextSeat(seat);
    return;
  }

  // Contract: final bid, doubled state, declarer = first of that side to name the strain.
  const fb = lastBid(r)!;
  const fbCall = fb.call as Extract<Call, { type: "bid" }>;
  const after = r.calls.slice(r.calls.indexOf(fb) + 1).filter((x) => x.call.type !== "pass");
  const doubled: 0 | 1 | 2 = after.some((x) => x.call.type === "redouble") ? 2 : after.some((x) => x.call.type === "double") ? 1 : 0;
  const side = teamOf(fb.seat);
  const declarer = r.calls.find(
    (x) => x.call.type === "bid" && x.call.strain === fbCall.strain && teamOf(x.seat) === side,
  )!.seat;
  r.contract = { level: fbCall.level, strain: fbCall.strain, doubled, declarer };
  r.dummy = (declarer + 2) % 4;
  r.phase = "play";
  r.leader = nextSeat(declarer);
  r.turn = r.leader;
  r.log.push({ seat: declarer, text: `declares ${contractText(r.contract)} — needs ${6 + fbCall.level} tricks` });
}

// ---------------------------------------------------------------- play

/** Who taps the card for the seat whose turn it is (declarer plays dummy). */
export function controllerOf(r: BRound, seat: number): number {
  return seat === r.dummy && r.contract ? r.contract.declarer : seat;
}

export function legalCards(r: BRound, seat: number): Card[] {
  if (r.phase !== "play") return [];
  const hand = r.hands[seat];
  if (r.trick.length === 0) return hand;
  const led = suitOf(r.trick[0].card);
  const follow = hand.filter((c) => suitOf(c) === led);
  return follow.length ? follow : hand;
}

export function trickWinner(cards: PlayedCard[], strain: Strain): number {
  const led = suitOf(cards[0].card);
  const trumps = strain === "NT" ? [] : cards.filter((p) => suitOf(p.card) === strain);
  const pool = trumps.length ? trumps : cards.filter((p) => suitOf(p.card) === led);
  return pool.reduce((best, p) => (rankIdx(p.card) < rankIdx(best.card) ? p : best)).seat;
}

function doPlay(m: BMatch, r: BRound, by: number, card: Card) {
  if (r.phase !== "play") fail("Not playing now");
  if (controllerOf(r, r.turn) !== by) fail(r.turn === r.dummy && by === r.dummy ? "Declarer plays dummy's cards" : "Not your turn");
  const seat = r.turn;
  if (!legalCards(r, seat).includes(card)) fail("You can't play that card");
  r.hands[seat].splice(r.hands[seat].indexOf(card), 1);
  r.trick.push({ seat, card });
  if (!r.dummyVisible) {
    r.dummyVisible = true;
    r.log.push({ seat: r.dummy, text: "is dummy — cards face up" });
  }
  if (r.trick.length < 4) {
    r.turn = nextSeat(seat);
    return;
  }
  const winner = trickWinner(r.trick, r.contract!.strain);
  r.tricks.push({ leader: r.leader, cards: r.trick, winner });
  r.won[teamOf(winner)] += 1;
  r.trick = [];
  r.leader = winner;
  r.turn = winner;
  if (r.tricks.length === 13) finishDeal(m, r);
}

function finishDeal(m: BMatch, r: BRound) {
  const c = r.contract!;
  const side = teamOf(c.declarer);
  const tricks = r.won[side];
  const s = scoreDeal(c, tricks, r.vulnerable[side]);
  const points: Record<Team, number> = { A: 0, B: 0 };
  if (s.made) points[side] = s.points;
  else points[side === "A" ? "B" : "A"] = s.points;
  m.score.A += points.A;
  m.score.B += points.B;
  r.phase = "done";
  r.result = { ...s, deal: r.deal, contract: c, declarerTeam: side, tricks, pointsTo: points };
  m.history.push(r.result);
  r.log.push({ seat: c.declarer, text: s.made ? `made ${contractText(c)} (${tricks} tricks)` : `went down in ${contractText(c)} (${tricks} tricks)` });
  if (r.deal === DEALS_PER_CHICAGO) {
    m.winner = m.score.A === m.score.B ? "tie" : m.score.A > m.score.B ? "A" : "B";
    if (m.winner !== "tie") m.gamesWon[m.winner] += 1;
  }
}

// ---------------------------------------------------------------- apply

export function applyAction(input: BMatch, seat: number, a: BAction, rng: () => number = Math.random): BMatch {
  const m: BMatch = structuredClone(input);
  const r = m.round;
  switch (a.type) {
    case "call":
      doCall(m, r, seat, a.call, rng);
      break;
    case "play":
      doPlay(m, r, seat, a.card);
      break;
    case "nextDeal":
      if (r.phase !== "done") fail("The deal isn't finished");
      if (m.winner) fail("This Chicago is over");
      m.dealer = nextSeat(m.dealer);
      m.deal += 1;
      m.round = freshRound(m.deal, m.dealer, rng);
      break;
    case "playAgain":
      if (!m.winner) fail("The Chicago isn't over yet");
      m.score = { A: 0, B: 0 };
      m.history = [];
      m.winner = null;
      m.deal = 1;
      m.dealer = nextSeat(m.dealer);
      m.round = freshRound(1, m.dealer, rng);
      break;
    default:
      fail("Unknown action");
  }
  m.round.log = m.round.log.slice(-40);
  return m;
}

// ---------------------------------------------------------------- view

export interface BView {
  mySeat: number;
  deal: number;
  dealsPerChicago: number;
  score: Record<Team, number>;
  history: DealResult[];
  winner: Team | "tie" | null;
  gamesWon: Record<Team, number>;
  round: {
    dealer: number;
    vulnerable: Record<Team, boolean>;
    phase: BRound["phase"];
    turn: number;
    hand: Card[];
    handCounts: number[];
    calls: CallEntry[];
    contract: Contract | null;
    dummy: number | null;
    dummyHand: Card[] | null; // face up after the opening lead
    leader: number;
    trick: PlayedCard[];
    tricks: BTrick[];
    won: Record<Team, number>;
    result: DealResult | null;
    log: LogEntry[];
    legalCalls: LegalCalls;
    /** Seat I'm choosing a card for right now (me, or dummy if I'm declarer), else null. */
    playingFor: number | null;
    legalCards: Card[];
  };
}

export function viewFor(m: BMatch, seat: number): BView {
  const r = m.round;
  const actingSeat = r.phase === "play" && controllerOf(r, r.turn) === seat ? r.turn : null;
  return {
    mySeat: seat,
    deal: r.deal,
    dealsPerChicago: DEALS_PER_CHICAGO,
    score: m.score,
    history: m.history,
    winner: m.winner,
    gamesWon: m.gamesWon,
    round: {
      dealer: r.dealer,
      vulnerable: r.vulnerable,
      phase: r.phase,
      turn: r.turn,
      hand: sortBridgeHand(r.hands[seat]),
      handCounts: r.hands.map((h) => h.length),
      calls: r.calls,
      contract: r.contract,
      dummy: r.dummy,
      dummyHand: r.dummyVisible && r.dummy !== null ? sortBridgeHand(r.hands[r.dummy]) : null,
      leader: r.leader,
      trick: r.trick,
      tricks: r.tricks,
      won: r.won,
      result: r.result,
      log: r.log,
      legalCalls: legalCalls(r, seat),
      playingFor: actingSeat,
      legalCards: actingSeat !== null ? legalCards(r, actingSeat) : [],
    },
  };
}
