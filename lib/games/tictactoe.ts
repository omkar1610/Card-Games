// Tic-tac-toe: 2 players, X (seat 0) and O (seat 1). Starter alternates each game; running score.
import type { GameDef } from "./types";
import { Log, fail, pushLog, stableRandom } from "./common";

export interface TMatch {
  board: (number | null)[]; // 9 cells, seat that owns it
  turn: number;
  starter: number;
  winner: number | "draw" | null;
  line: number[] | null;
  wins: number[];
  draws: number;
  games: number;
  log: Log[];
}
export type TAction = { type: "move"; cell: number } | { type: "playAgain" };
export type TView = TMatch & { mySeat: number };

const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

export function lineWinner(b: (number | null)[]): { seat: number; line: number[] } | null {
  for (const l of LINES) if (b[l[0]] !== null && b[l[0]] === b[l[1]] && b[l[1]] === b[l[2]]) return { seat: b[l[0]]!, line: l };
  return null;
}

function fresh(starter: number, prev?: TMatch): TMatch {
  return {
    board: Array(9).fill(null),
    turn: starter,
    starter,
    winner: null,
    line: null,
    wins: prev?.wins ?? [0, 0],
    draws: prev?.draws ?? 0,
    games: (prev?.games ?? 0) + 1,
    log: [{ seat: starter, text: "starts" }],
  };
}

function apply(input: TMatch, seat: number, a: TAction): TMatch {
  const m: TMatch = structuredClone(input);
  if (a.type === "playAgain") {
    if (m.winner === null) fail("The game isn't over");
    return fresh(1 - m.starter, m);
  }
  if (m.winner !== null) fail("The game is over");
  if (m.turn !== seat) fail("Not your turn");
  if (!Number.isInteger(a.cell) || a.cell < 0 || a.cell > 8 || m.board[a.cell] !== null) fail("Pick an empty square");
  m.board[a.cell] = seat;
  const w = lineWinner(m.board);
  if (w) {
    m.winner = w.seat;
    m.line = w.line;
    m.wins[w.seat] += 1;
    pushLog(m.log, seat, "wins!");
  } else if (m.board.every((c) => c !== null)) {
    m.winner = "draw";
    m.draws += 1;
    pushLog(m.log, null, "it's a draw");
  } else {
    m.turn = 1 - seat;
  }
  return m;
}

/** Perfect play with minimax (bots occasionally make a casual move so they can be beaten). */
function bestMove(b: (number | null)[], me: number): number {
  const empty = b.flatMap((c, i) => (c === null ? [i] : []));
  const score = (board: (number | null)[], turn: number, depth: number): number => {
    const w = lineWinner(board);
    if (w) return w.seat === me ? 10 - depth : depth - 10;
    if (board.every((c) => c !== null)) return 0;
    const scores = board.flatMap((c, i) => {
      if (c !== null) return [];
      const nb = board.slice();
      nb[i] = turn;
      return [score(nb, 1 - turn, depth + 1)];
    });
    return turn === me ? Math.max(...scores) : Math.min(...scores);
  };
  let best = empty[0];
  let bestScore = -Infinity;
  for (const i of empty) {
    const nb = b.slice();
    nb[i] = me;
    const s = score(nb, 1 - me, 1);
    if (s > bestScore) [best, bestScore] = [i, s];
  }
  return best;
}

export const ticTacToe: GameDef<TMatch, TAction, TView> = {
  id: "tictactoe",
  newMatch: () => fresh(0),
  applyAction: apply,
  viewFor: (m, seat) => ({ ...m, mySeat: seat }),
  nextBotMove(m, isBot) {
    if (m.winner !== null || !isBot(m.turn)) return null;
    const empty = m.board.flatMap((c, i) => (c === null ? [i] : []));
    const casual = stableRandom("ttt", m.games, empty.length) < 0.2;
    const cell = casual ? empty[Math.floor(stableRandom("cell", m.games, empty.length) * empty.length)] : bestMove(m.board, m.turn);
    return { seat: m.turn, action: { type: "move", cell } };
  },
  botDelayMs: () => 700,
};
