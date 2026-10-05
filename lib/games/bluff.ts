// Bluff: 3–6 players, all 52 cards dealt out.
// - The player starting a round names a rank and plays 1–4 cards face down "as" that rank.
// - Going round, each player plays 1–4 more cards claiming the same rank, or passes.
// - After any play, ANYONE else may call "Bluff!" (until the next player acts). If any of those cards
//   weren't the claimed rank, the player who played them picks up the whole pile; otherwise the caller
//   does. Whoever was right starts the next round.
// - If everyone else passes, the pile is cleared and the last player to play starts the next round.
// - Empty your hand and survive any call → you win.
import type { GameDef } from "./types";
import { Log, fail, pushLog, stableRandom } from "./common";
import { shuffle, rankOf } from "../engine/cards";

export const BLUFF_RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

export function fullDeck(): string[] {
  const d: string[] = [];
  for (const s of ["S", "H", "D", "C"]) for (const r of BLUFF_RANKS) d.push(r + s);
  return d;
}

export interface BPlay {
  seat: number;
  cards: string[]; // hidden from views
  rank: string;
}

export interface BLMatch {
  players: number;
  hands: string[][];
  pile: string[];
  rank: string | null; // claimed rank of the current round
  turn: number;
  lastPlay: BPlay | null;
  challengeOpen: boolean; // someone may still call bluff on lastPlay
  passesSinceLast: number;
  plays: number; // counts plays, so bots' choices stay stable between polls
  reveal: { caller: number; player: number; cards: string[]; rank: string; truthful: boolean; pickedUp: number; count: number } | null;
  starter: number;
  winner: number | null;
  wins: number[];
  log: Log[];
}
export type BLAction =
  | { type: "play"; cards: string[]; rank?: string }
  | { type: "pass" }
  | { type: "call" }
  | { type: "playAgain" };

export interface BLView {
  mySeat: number;
  players: number;
  hand: string[];
  handCounts: number[];
  pileCount: number;
  rank: string | null;
  turn: number;
  lastPlay: { seat: number; count: number; rank: string } | null;
  canCall: boolean;
  reveal: BLMatch["reveal"];
  winner: number | null;
  wins: number[];
  log: Log[];
}

function fresh(players: number, starter: number, prev?: BLMatch): BLMatch {
  const deck = shuffle(fullDeck());
  const hands: string[][] = Array.from({ length: players }, () => []);
  deck.forEach((c, i) => hands[(starter + i) % players].push(c));
  return {
    players,
    hands,
    pile: [],
    rank: null,
    turn: starter,
    lastPlay: null,
    challengeOpen: false,
    passesSinceLast: 0,
    plays: 0,
    reveal: null,
    starter,
    winner: null,
    wins: prev?.wins ?? Array(players).fill(0),
    log: [{ seat: starter, text: "starts" }],
  };
}

const next = (m: BLMatch, s: number) => (s + 1) % m.players;

/** If the last player emptied their hand and nobody called in time, they win. */
function settleUncalledWin(m: BLMatch): boolean {
  if (m.lastPlay && m.hands[m.lastPlay.seat].length === 0) {
    m.winner = m.lastPlay.seat;
    m.wins[m.winner] += 1;
    pushLog(m.log, m.winner, "played their last cards and wins!");
    return true;
  }
  return false;
}

function newRound(m: BLMatch, starter: number) {
  m.rank = null;
  m.lastPlay = null;
  m.challengeOpen = false;
  m.passesSinceLast = 0;
  m.turn = starter;
}

function apply(input: BLMatch, seat: number, a: BLAction): BLMatch {
  const m: BLMatch = structuredClone(input);
  if (a.type === "playAgain") {
    if (m.winner === null) fail("The game isn't over");
    return fresh(m.players, (m.starter + 1) % m.players, m);
  }
  if (m.winner !== null) fail("The game is over");

  if (a.type === "call") {
    if (!m.challengeOpen || !m.lastPlay) fail("Nothing to call");
    if (m.lastPlay.seat === seat) fail("You can't call your own play");
    const lp = m.lastPlay;
    const truthful = lp.cards.every((c) => rankOf(c) === lp.rank);
    const loser = truthful ? seat : lp.seat;
    const count = m.pile.length;
    m.hands[loser].push(...m.pile);
    m.pile = [];
    m.reveal = { caller: seat, player: lp.seat, cards: lp.cards, rank: lp.rank, truthful, pickedUp: loser, count };
    pushLog(m.log, seat, `called bluff — ${truthful ? "it was true!" : "caught a lie!"} ${loser === seat ? "Caller" : "Player"} picks up ${count}`);
    m.challengeOpen = false;
    if (truthful && m.hands[lp.seat].length === 0) {
      m.winner = lp.seat;
      m.wins[lp.seat] += 1;
      pushLog(m.log, lp.seat, "played their last cards and wins!");
      return m;
    }
    newRound(m, truthful ? lp.seat : seat);
    return m;
  }

  if (m.turn !== seat) fail("Not your turn");
  // The next player acting closes the window for calling bluff on the previous play.
  if (m.challengeOpen) {
    m.challengeOpen = false;
    if (settleUncalledWin(m)) return m;
  }

  if (a.type === "pass") {
    if (!m.lastPlay) fail("Start the round by playing cards");
    m.passesSinceLast += 1;
    pushLog(m.log, seat, "passed");
    if (m.passesSinceLast >= m.players - 1) {
      pushLog(m.log, null, `everyone passed — ${m.pile.length} cards cleared`);
      m.pile = [];
      newRound(m, m.lastPlay.seat);
    } else {
      m.turn = next(m, seat);
    }
    return m;
  }

  // play
  const cards = a.cards ?? [];
  if (cards.length < 1 || cards.length > 4) fail("Play 1 to 4 cards");
  if (new Set(cards).size !== cards.length || !cards.every((c) => m.hands[seat].includes(c))) fail("You don't have those cards");
  let rank = m.rank;
  if (rank === null) {
    if (!a.rank || !BLUFF_RANKS.includes(a.rank)) fail("Name a rank to start the round");
    rank = a.rank;
    m.rank = rank;
  }
  m.hands[seat] = m.hands[seat].filter((c) => !cards.includes(c));
  m.pile.push(...cards);
  m.lastPlay = { seat, cards, rank };
  m.challengeOpen = true;
  m.passesSinceLast = 0;
  m.plays += 1;
  m.reveal = null;
  pushLog(m.log, seat, `played ${cards.length} × ${rank}`);
  m.turn = next(m, seat);
  return m;
}

function viewFor(m: BLMatch, seat: number): BLView {
  return {
    mySeat: seat,
    players: m.players,
    hand: m.hands[seat],
    handCounts: m.hands.map((h) => h.length),
    pileCount: m.pile.length,
    rank: m.rank,
    turn: m.turn,
    lastPlay: m.lastPlay ? { seat: m.lastPlay.seat, count: m.lastPlay.cards.length, rank: m.lastPlay.rank } : null,
    canCall: m.winner === null && m.challengeOpen && !!m.lastPlay && m.lastPlay.seat !== seat,
    reveal: m.reveal,
    winner: m.winner,
    wins: m.wins,
    log: m.log,
  };
}

// ---------------------------------------------------------------- bots

/** Would this bot call bluff on the last play? Certain when it holds too many of that rank. */
function botCalls(m: BLMatch, seat: number): boolean {
  const lp = m.lastPlay!;
  const held = m.hands[seat].filter((c) => rankOf(c) === lp.rank).length;
  if (held + lp.cards.length > 4) return true;
  if (m.hands[lp.seat].length === 0) return true; // stop them winning on a lie
  const chance = lp.cards.length >= 3 ? 0.35 : lp.cards.length === 2 ? 0.15 : 0.07;
  return stableRandom("call", m.plays, seat) < chance;
}

function botTurn(m: BLMatch, seat: number): BLAction {
  const hand = m.hands[seat];
  const byRank = (r: string) => hand.filter((c) => rankOf(c) === r);
  if (m.rank === null) {
    // Start with the rank we hold most of, honestly.
    const r = BLUFF_RANKS.reduce((a, b) => (byRank(b).length > byRank(a).length ? b : a));
    return { type: "play", cards: byRank(r).slice(0, 4), rank: r };
  }
  const honest = byRank(m.rank);
  if (honest.length) return { type: "play", cards: honest.slice(0, 4) };
  // No real cards: bluff with one card sometimes, otherwise pass.
  if (stableRandom("bluff", m.plays, seat) < 0.55 || hand.length <= 3) {
    const throwaway = hand.reduce((a, b) => (byRank(rankOf(b)).length < byRank(rankOf(a)).length ? b : a));
    return { type: "play", cards: [throwaway] };
  }
  return { type: "pass" };
}

export const bluff: GameDef<BLMatch, BLAction, BLView> = {
  id: "bluff",
  newMatch: (players) => fresh(players, 0),
  applyAction: apply,
  viewFor,
  nextBotMove(m, isBot) {
    if (m.winner !== null) return null;
    if (m.challengeOpen && m.lastPlay) {
      for (let i = 1; i < m.players; i++) {
        const s = (m.lastPlay.seat + i) % m.players;
        if (isBot(s) && botCalls(m, s)) return { seat: s, action: { type: "call" } };
      }
    }
    if (!isBot(m.turn)) return null;
    return { seat: m.turn, action: botTurn(m, m.turn) };
  },
  // Give people time to call bluff before the next bot plays, and to read a reveal after a call.
  botDelayMs: (m) => (m.challengeOpen ? 2600 : m.reveal && !m.lastPlay ? 3200 : 1000),
};
