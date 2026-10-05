// Ludo: 2–4 players, 4 tokens each, on the classic 15×15 board.
// - Roll a 6 to bring a token out. A 6, a capture, or bringing a token home gives another roll;
//   three 6s in a row end your turn.
// - Landing on opponents' tokens sends them back to base, except on safe squares (stars and starts).
// - Exact roll needed to reach home. First player with all 4 tokens home wins.
//
// Positions are per token, relative to its colour: -1 = base, 0..50 = main track (0 = own start),
// 51..55 = own home column, 56 = home.
import type { GameDef } from "./types";
import { Log, fail, pushLog, rollDie, stableRandom } from "./common";

export type Colour = "red" | "green" | "yellow" | "blue";
export const COLOURS: Colour[] = ["red", "green", "yellow", "blue"];
const HOME = 56;
const START_INDEX: Record<Colour, number> = { red: 0, green: 13, yellow: 26, blue: 39 };
export const SAFE_INDEXES = [0, 8, 13, 21, 26, 34, 39, 47];

/** The 52 main-track squares as [row, col] on the 15×15 board, clockwise from red's start. */
export const TRACK: [number, number][] = (() => {
  const t: [number, number][] = [];
  for (let c = 1; c <= 5; c++) t.push([6, c]);
  for (let r = 5; r >= 0; r--) t.push([r, 6]);
  t.push([0, 7], [0, 8]);
  for (let r = 1; r <= 5; r++) t.push([r, 8]);
  for (let c = 9; c <= 14; c++) t.push([6, c]);
  t.push([7, 14], [8, 14]);
  for (let c = 13; c >= 9; c--) t.push([8, c]);
  for (let r = 9; r <= 14; r++) t.push([r, 8]);
  t.push([14, 7], [14, 6]);
  for (let r = 13; r >= 9; r--) t.push([r, 6]);
  for (let c = 5; c >= 0; c--) t.push([8, c]);
  t.push([7, 0], [6, 0]);
  return t;
})();

/** Each colour's 5 home-column squares. */
export const HOME_COLUMN: Record<Colour, [number, number][]> = {
  red: [1, 2, 3, 4, 5].map((c) => [7, c]),
  green: [1, 2, 3, 4, 5].map((r) => [r, 7]),
  yellow: [13, 12, 11, 10, 9].map((c) => [7, c]),
  blue: [13, 12, 11, 10, 9].map((r) => [r, 7]),
};

/** Colours used for 2, 3 or 4 players (2 players sit opposite). */
export function coloursFor(players: number): Colour[] {
  return players === 2 ? ["red", "yellow"] : players === 3 ? ["red", "green", "yellow"] : COLOURS;
}

export const trackIndex = (colour: Colour, rel: number) => (START_INDEX[colour] + rel) % 52;

export interface LMatch {
  players: number;
  colours: Colour[];
  tokens: number[][]; // [seat][token] relative position
  turn: number;
  starter: number;
  phase: "roll" | "move";
  dice: number | null;
  sixes: number;
  rolls: number;
  lastMove: { seat: number; token: number; from: number; to: number; captured: number } | null;
  winner: number | null;
  wins: number[];
  log: Log[];
}
export type LAction = { type: "roll" } | { type: "move"; token: number } | { type: "playAgain" };
export type LView = LMatch & { mySeat: number; movable: number[] };

function fresh(players: number, starter: number, prev?: LMatch): LMatch {
  return {
    players,
    colours: coloursFor(players),
    tokens: Array.from({ length: players }, () => [-1, -1, -1, -1]),
    turn: starter,
    starter,
    phase: "roll",
    dice: null,
    sixes: 0,
    rolls: 0,
    lastMove: null,
    winner: null,
    wins: prev?.wins ?? Array(players).fill(0),
    log: [{ seat: starter, text: "goes first" }],
  };
}

export function movableTokens(m: LMatch, seat: number): number[] {
  if (m.phase !== "move" || m.turn !== seat || m.dice === null) return [];
  return m.tokens[seat].flatMap((p, i) => {
    if (p === HOME) return [];
    if (p === -1) return m.dice === 6 ? [i] : [];
    return p + m.dice! <= HOME ? [i] : [];
  });
}

function nextTurn(m: LMatch) {
  m.turn = (m.turn + 1) % m.players;
  m.sixes = 0;
  m.phase = "roll";
}

function apply(input: LMatch, seat: number, a: LAction, rng: () => number = Math.random): LMatch {
  const m: LMatch = structuredClone(input);
  if (a.type === "playAgain") {
    if (m.winner === null) fail("The game isn't over");
    return fresh(m.players, (m.starter + 1) % m.players, m);
  }
  if (m.winner !== null) fail("The game is over");
  if (m.turn !== seat) fail("Not your turn");

  if (a.type === "roll") {
    if (m.phase !== "roll") fail("Move a token first");
    const d = rollDie(rng);
    m.dice = d;
    m.rolls += 1;
    m.sixes = d === 6 ? m.sixes + 1 : 0;
    if (m.sixes === 3) {
      pushLog(m.log, seat, "rolled three 6s — turn over");
      nextTurn(m);
      return m;
    }
    m.phase = "move";
    if (movableTokens(m, seat).length === 0) {
      pushLog(m.log, seat, `rolled ${d} — no move`);
      if (d === 6) m.phase = "roll";
      else nextTurn(m);
    } else {
      pushLog(m.log, seat, `rolled ${d}`);
    }
    return m;
  }

  // move
  if (!movableTokens(m, seat).includes(a.token)) fail("That token can't move");
  const colour = m.colours[seat];
  const from = m.tokens[seat][a.token];
  const to = from === -1 ? 0 : from + m.dice!;
  m.tokens[seat][a.token] = to;
  let captured = 0;
  if (to <= 50) {
    const idx = trackIndex(colour, to);
    if (!SAFE_INDEXES.includes(idx)) {
      m.tokens.forEach((toks, s) => {
        if (s === seat) return;
        toks.forEach((p, i) => {
          if (p >= 0 && p <= 50 && trackIndex(m.colours[s], p) === idx) {
            toks[i] = -1;
            captured++;
          }
        });
      });
    }
  }
  m.lastMove = { seat, token: a.token, from, to, captured };
  if (captured) pushLog(m.log, seat, `captured ${captured === 1 ? "a token" : `${captured} tokens`}!`);
  if (to === HOME) pushLog(m.log, seat, "brought a token home");

  if (m.tokens[seat].every((p) => p === HOME)) {
    m.winner = seat;
    m.wins[seat] += 1;
    pushLog(m.log, seat, "got all 4 tokens home and wins!");
    return m;
  }
  if (m.dice === 6 || captured || to === HOME) m.phase = "roll"; // roll again
  else nextTurn(m);
  return m;
}

/** Bot: capture > reach home > leave base > get out of danger > advance the furthest safe token. */
function botToken(m: LMatch, seat: number): number {
  const options = movableTokens(m, seat);
  const colour = m.colours[seat];
  const opponentsAt = (idx: number) =>
    m.tokens.some((toks, s) => s !== seat && toks.some((p) => p >= 0 && p <= 50 && trackIndex(m.colours[s], p) === idx));
  const threatened = (idx: number) =>
    !SAFE_INDEXES.includes(idx) &&
    m.tokens.some((toks, s) =>
      s !== seat && toks.some((p) => p >= 0 && p <= 50 && [1, 2, 3, 4, 5, 6].some((d) => (trackIndex(m.colours[s], p) + d) % 52 === idx)),
    );
  const score = (t: number) => {
    const from = m.tokens[seat][t];
    const to = from === -1 ? 0 : from + m.dice!;
    let s = to / 10;
    if (to <= 50) {
      const idx = trackIndex(colour, to);
      if (!SAFE_INDEXES.includes(idx) && opponentsAt(idx)) s += 50;
      if (threatened(idx)) s -= 15;
      if (from >= 0 && from <= 50 && threatened(trackIndex(colour, from))) s += 12;
    } else s += 20;
    if (to === HOME) s += 30;
    if (from === -1) s += 25;
    return s + stableRandom("ludo", m.rolls, t) * 0.5;
  };
  return options.reduce((best, t) => (score(t) > score(best) ? t : best));
}

export const ludo: GameDef<LMatch, LAction, LView> = {
  id: "ludo",
  newMatch: (players) => fresh(players, 0),
  applyAction: (m, seat, a) => apply(m, seat, a),
  viewFor: (m, seat) => ({ ...m, mySeat: seat, movable: movableTokens(m, seat) }),
  nextBotMove(m, isBot) {
    if (m.winner !== null || !isBot(m.turn)) return null;
    if (m.phase === "roll") return { seat: m.turn, action: { type: "roll" } };
    return { seat: m.turn, action: { type: "move", token: botToken(m, m.turn) } };
  },
  botDelayMs: (m) => (m.phase === "move" ? 700 : 1100),
};

export { apply as applyLudo, HOME as LUDO_HOME };
