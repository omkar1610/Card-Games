// Snakes & Ladders: 2–4 players on the classic 100-square board. Roll and move; ladders climb,
// snakes slide. Exact roll needed for 100 (otherwise you stay put). A 6 rolls again.
import type { GameDef } from "./types";
import { Log, fail, pushLog, rollDie } from "./common";

export const LADDERS: Record<number, number> = { 1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100 };
export const SNAKES: Record<number, number> = { 16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78 };

export interface SMatch {
  players: number;
  pos: number[]; // 0 = not on the board yet
  turn: number;
  starter: number;
  last: { seat: number; roll: number; from: number; to: number; via: "ladder" | "snake" | "bounce" | null } | null;
  rolls: number;
  winner: number | null;
  wins: number[];
  log: Log[];
}
export type SAction = { type: "roll" } | { type: "playAgain" };
export type SView = SMatch & { mySeat: number };

function fresh(players: number, starter: number, prev?: SMatch): SMatch {
  return {
    players,
    pos: Array(players).fill(0),
    turn: starter,
    starter,
    last: null,
    rolls: 0,
    winner: null,
    wins: prev?.wins ?? Array(players).fill(0),
    log: [{ seat: starter, text: "goes first" }],
  };
}

function apply(input: SMatch, seat: number, a: SAction, rng: () => number = Math.random): SMatch {
  const m: SMatch = structuredClone(input);
  if (a.type === "playAgain") {
    if (m.winner === null) fail("The game isn't over");
    return fresh(m.players, (m.starter + 1) % m.players, m);
  }
  if (m.winner !== null) fail("The game is over");
  if (m.turn !== seat) fail("Not your turn");
  const roll = rollDie(rng);
  const from = m.pos[seat];
  let to = from + roll;
  let via: NonNullable<SMatch["last"]>["via"] = null;
  if (to > 100) {
    to = from;
    via = "bounce";
  } else if (LADDERS[to]) {
    to = LADDERS[to];
    via = "ladder";
  } else if (SNAKES[to]) {
    to = SNAKES[to];
    via = "snake";
  }
  m.pos[seat] = to;
  m.rolls += 1;
  m.last = { seat, roll, from, to, via };
  pushLog(
    m.log,
    seat,
    `rolled ${roll}${via === "ladder" ? ` — ladder up to ${to}!` : via === "snake" ? ` — snake down to ${to}` : via === "bounce" ? " — needs exactly " + (100 - from) : ` → ${to}`}`,
  );
  if (to === 100) {
    m.winner = seat;
    m.wins[seat] += 1;
    pushLog(m.log, seat, "reached 100 and wins!");
  } else if (roll !== 6) {
    m.turn = (seat + 1) % m.players;
  }
  return m;
}

export const snakes: GameDef<SMatch, SAction, SView> = {
  id: "snakes",
  newMatch: (players) => fresh(players, 0),
  applyAction: (m, seat, a) => apply(m, seat, a),
  viewFor: (m, seat) => ({ ...m, mySeat: seat }),
  nextBotMove(m, isBot) {
    if (m.winner !== null || !isBot(m.turn)) return null;
    return { seat: m.turn, action: { type: "roll" } };
  },
  botDelayMs: () => 1300,
};

export { apply as applySnakes };
