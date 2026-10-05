// Basic natural-bidding Bridge bot. Uses only what that seat could know: its hand, the dummy
// (once face up), the auction and the cards played. No conventions.
import { Card, rankOf, suitOf } from "../../engine/cards";
import { teamOf } from "../../engine/game";
import {
  BAction,
  BMatch,
  BRound,
  BRIDGE_RANKS,
  Call,
  STRAINS,
  Strain,
  controllerOf,
  isLegalCall,
  legalCalls,
  legalCards,
  trickWinner,
} from "./engine";

type Suit = "S" | "H" | "D" | "C";
const SUITS: Suit[] = ["S", "H", "D", "C"];
const HCP: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1 };
const rankIdx = (c: Card) => BRIDGE_RANKS.indexOf(rankOf(c));

export const hcp = (hand: Card[]) => hand.reduce((s, c) => s + (HCP[rankOf(c)] ?? 0), 0);
const lengths = (hand: Card[]) =>
  Object.fromEntries(SUITS.map((s) => [s, hand.filter((c) => suitOf(c) === s).length])) as Record<Suit, number>;
const balanced = (len: Record<Suit, number>) => {
  const v = Object.values(len);
  return v.every((n) => n >= 2) && v.filter((n) => n === 2).length <= 1;
};
const isMajor = (s: Strain) => s === "H" || s === "S";

// ---------------------------------------------------------------- bidding

interface PartnerInfo {
  points: number;
  suits: Partial<Record<Suit, number>>; // minimum lengths shown
  balanced: boolean;
}

/** Rough reading of partner's calls in plain natural bidding. */
function readPartner(r: BRound, seat: number): PartnerInfo {
  const partner = (seat + 2) % 4;
  const info: PartnerInfo = { points: 7, suits: {}, balanced: false };
  let ourSideBidBefore = false;
  let firstBid = true;
  for (const { seat: s, call } of r.calls) {
    if (teamOf(s) !== teamOf(seat)) continue;
    if (s !== partner) {
      if (call.type === "bid") ourSideBidBefore = true;
      continue;
    }
    if (call.type === "pass") {
      if (firstBid && !ourSideBidBefore) info.points = Math.min(info.points, 10);
      continue;
    }
    if (call.type !== "bid") continue;
    const { level, strain } = call;
    if (firstBid) {
      firstBid = false;
      if (!ourSideBidBefore) {
        // Partner opened (or overcalled).
        if (strain === "NT") {
          info.points = level === 1 ? 16 : level === 2 ? 21 : 25;
          info.balanced = true;
        } else {
          info.points = level === 1 ? 13 : 10;
          info.suits[strain] = isMajor(strain) ? 5 : level === 1 ? 3 : 6;
        }
      } else {
        // Partner responded to us.
        if (strain === "NT") {
          info.points = level === 1 ? 8 : level === 2 ? 11 : 14;
          info.balanced = true;
        } else {
          info.points = level === 1 ? 9 : level === 2 ? 9 : 11;
          info.suits[strain] = 4;
        }
      }
    } else if (strain !== "NT") {
      info.suits[strain] = Math.max(info.suits[strain] ?? 0, 4);
    }
  }
  return info;
}

function cheapestLevel(r: BRound, seat: number, strain: Strain): number | null {
  const min = legalCalls(r, seat).minBid;
  if (!min) return null;
  return STRAINS.indexOf(strain) >= STRAINS.indexOf(min.strain) ? min.level : min.level + 1;
}

function chooseCall(r: BRound, seat: number): Call {
  const hand = r.hands[seat];
  const pts = hcp(hand);
  const len = lengths(hand);
  const bal = balanced(len);
  const pass: Call = { type: "pass" };
  const side = teamOf(seat);
  const ourBids = r.calls.filter((c) => teamOf(c.seat) === side && c.call.type === "bid");
  const theirBids = r.calls.filter((c) => teamOf(c.seat) !== side && c.call.type === "bid");
  const longest = SUITS.reduce((a, b) => (len[b] > len[a] || (len[b] === len[a] && isMajor(b) && !isMajor(a)) ? b : a));
  const tryBid = (level: number, strain: Strain): Call => {
    const c: Call = { type: "bid", level, strain };
    return level <= 7 && isLegalCall(r, seat, c) ? c : pass;
  };

  // --- We haven't bid yet: open or overcall.
  if (ourBids.length === 0) {
    if (theirBids.length === 0) {
      if (pts < 12 && !(pts >= 10 && len[longest] >= 6)) return pass;
      if (bal && pts >= 15 && pts <= 17) return tryBid(1, "NT");
      if (bal && pts >= 20 && pts <= 21) return tryBid(2, "NT");
      if (len.S >= 5 && len.S >= len.H) return tryBid(1, "S");
      if (len.H >= 5) return tryBid(1, "H");
      return tryBid(1, len.D > len.C ? "D" : "C");
    }
    // Overcall a suit with 5+ cards and opening-ish strength, at the 1 or 2 level only.
    if (pts >= 10 && len[longest] >= 5) {
      const lvl = cheapestLevel(r, seat, longest);
      if (lvl !== null && lvl <= 2 && (lvl === 1 || pts >= 12)) return tryBid(lvl, longest);
    }
    if (bal && pts >= 15 && pts <= 18) {
      const lvl = cheapestLevel(r, seat, "NT");
      if (lvl === 1) return tryBid(1, "NT");
    }
    return pass;
  }

  // --- Our side is bidding: aim for a final contract from combined points and fit.
  const p = readPartner(r, seat);
  const combined = pts + p.points;
  let strain: Strain = "NT";
  const fit = (s: Suit) => len[s] + (p.suits[s] ?? 0) >= 8;
  if (fit("S") || fit("H")) strain = fit("S") && (!fit("H") || len.S >= len.H) ? "S" : "H";
  else if (bal || p.balanced) strain = "NT";
  else if (fit("D") || fit("C")) strain = fit("D") ? "D" : "C";
  else if (len[longest] >= 6) strain = longest;

  let target: number;
  if (combined >= 37) target = 7;
  else if (combined >= 33) target = 6;
  else if (combined >= 25) target = strain === "NT" ? 3 : isMajor(strain) ? 4 : 5;
  else if (combined >= 22) target = strain === "NT" ? 2 : 3;
  else target = strain === "NT" ? 1 : 2;

  // Opponents' contract at game level with our side strong: double for penalty.
  const last = [...r.calls].reverse().find((c) => c.call.type !== "pass");
  if (last && teamOf(last.seat) !== side && last.call.type === "bid") {
    const theirs = last.call;
    const theirGame = theirs.level >= 4 || (theirs.level === 3 && theirs.strain === "NT");
    if (theirGame && combined >= 23 && legalCalls(r, seat).canDouble) return { type: "double" };
  }

  // Already in the right strain at or above the target: stop.
  const lastBid = [...r.calls].reverse().find((c) => c.call.type === "bid");
  if (lastBid && teamOf(lastBid.seat) === side && lastBid.call.type === "bid") {
    const cur = lastBid.call;
    if (cur.level >= target) return pass;
  }

  const lvl = cheapestLevel(r, seat, strain);
  if (lvl === null || lvl > target) return pass;
  // Jump straight to the target once we know where we're going (game or slam), otherwise bid cheaply.
  return tryBid(combined >= 25 ? target : lvl, strain);
}

// ---------------------------------------------------------------- play

function playCard(r: BRound, seat: number): Card {
  const legal = legalCards(r, seat);
  const strain = r.contract!.strain;
  const trump: Suit | null = strain === "NT" ? null : (strain as Suit);
  const declarer = r.contract!.declarer;
  const declaring = teamOf(seat) === teamOf(declarer);
  const played = new Set([...r.tricks.flatMap((t) => t.cards.map((p) => p.card)), ...r.trick.map((p) => p.card)]);
  // Cards on our side: my hand, plus partner's if we're declaring (declarer and dummy see each other).
  const ours = new Set(r.hands[seat]);
  if (declaring) r.hands[(seat + 2) % 4].forEach((c) => ours.add(c));
  const lowest = (cs: Card[]) => cs.reduce((a, b) => (rankIdx(b) > rankIdx(a) ? b : a));
  const highest = (cs: Card[]) => cs.reduce((a, b) => (rankIdx(b) < rankIdx(a) ? b : a));
  // A card that can't be beaten by anything still out in that suit.
  const isTop = (c: Card) =>
    BRIDGE_RANKS.slice(0, rankIdx(c)).every((rk) => played.has(rk + suitOf(c)) || ours.has(rk + suitOf(c)));

  if (r.trick.length === 0) {
    const nonTrump = legal.filter((c) => suitOf(c) !== trump);
    if (declaring && trump) {
      const trumpsOut = 13 - [...played, ...ours].filter((c) => suitOf(c) === trump).length;
      const myTrumps = legal.filter((c) => suitOf(c) === trump);
      if (trumpsOut > 0 && myTrumps.length && isTop(highest(myTrumps))) return highest(myTrumps);
    }
    const winners = nonTrump.filter(isTop);
    if (winners.length) return winners[0];
    const pool = nonTrump.length ? nonTrump : legal;
    const bySuit = SUITS.map((s) => pool.filter((c) => suitOf(c) === s)).filter((x) => x.length);
    const longestSuit = bySuit.reduce((a, b) => (b.length > a.length ? b : a));
    const sorted = longestSuit.slice().sort((a, b) => rankIdx(a) - rankIdx(b));
    // Top of a touching honour sequence (A-K, K-Q, Q-J, J-10), otherwise low.
    if (sorted.length >= 2 && rankIdx(sorted[0]) <= 3 && rankIdx(sorted[1]) === rankIdx(sorted[0]) + 1) return sorted[0];
    return lowest(longestSuit);
  }

  const winnerNow = trickWinner(r.trick, strain);
  const partnerWinning = teamOf(winnerNow) === teamOf(seat);
  const wins = (c: Card) => trickWinner([...r.trick, { seat, card: c }], strain) === seat;
  const position = r.trick.length; // 1 = second hand, 2 = third hand, 3 = last
  const ledSuit = suitOf(r.trick[0].card);
  const following = legal.some((c) => suitOf(c) === ledSuit);

  if (partnerWinning && (position === 3 || isTop(r.trick.find((p) => p.seat === winnerNow)!.card))) {
    const nonTrump = legal.filter((c) => suitOf(c) !== trump || following);
    return lowest(nonTrump.length ? nonTrump : legal);
  }
  const winners = legal.filter(wins);
  if (following) {
    if (position === 1 && !winners.some(isTop)) return lowest(legal); // second hand low
    if (winners.length) return lowest(winners); // cheapest card that takes it
    return lowest(legal);
  }
  // Can't follow: ruff cheaply if it wins, otherwise throw the lowest from the weakest suit.
  const ruffs = winners.filter((c) => suitOf(c) === trump);
  if (ruffs.length && !partnerWinning) return lowest(ruffs);
  const discards = legal.filter((c) => suitOf(c) !== trump);
  return lowest(discards.length ? discards : legal);
}

// ---------------------------------------------------------------- entry point

export function nextBridgeBotMove(m: BMatch, isBot: (seat: number) => boolean): { seat: number; action: BAction } | null {
  const r = m.round;
  if (m.winner && r.phase === "done") return null;
  if (r.phase === "auction") {
    if (!isBot(r.turn)) return null;
    return { seat: r.turn, action: { type: "call", call: chooseCall(r, r.turn) } };
  }
  if (r.phase === "play") {
    const controller = controllerOf(r, r.turn);
    if (!isBot(controller)) return null;
    return { seat: controller, action: { type: "play", card: playCard(r, r.turn) } };
  }
  return null;
}
