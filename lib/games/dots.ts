// Dots & Boxes: 2–4 players. Grid of R×C boxes (4×4 for 2 players, 5×5 for more).
// Draw one line per turn; closing a box scores it and you go again. Most boxes wins.
import type { GameDef } from "./types";
import { Log, fail, pushLog, stableRandom } from "./common";

export interface DMatch {
  players: number;
  rows: number; // boxes
  cols: number;
  h: (number | null)[][]; // (rows+1) × cols horizontal lines, seat that drew it
  v: (number | null)[][]; // rows × (cols+1) vertical lines
  boxes: (number | null)[][]; // rows × cols owner
  turn: number;
  starter: number;
  scores: number[];
  winners: number[] | null; // seats with the most boxes (several = tie)
  lastLine: { kind: "h" | "v"; r: number; c: number } | null;
  moves: number;
  wins: number[];
  log: Log[];
}
export type DAction = { type: "line"; kind: "h" | "v"; r: number; c: number } | { type: "playAgain" };
export type DView = DMatch & { mySeat: number };

function fresh(players: number, starter: number, prev?: DMatch): DMatch {
  const n = players <= 2 ? 4 : 5;
  return {
    players,
    rows: n,
    cols: n,
    h: Array.from({ length: n + 1 }, () => Array(n).fill(null)),
    v: Array.from({ length: n }, () => Array(n + 1).fill(null)),
    boxes: Array.from({ length: n }, () => Array(n).fill(null)),
    turn: starter,
    starter,
    scores: Array(players).fill(0),
    winners: null,
    lastLine: null,
    moves: 0,
    wins: prev?.wins ?? Array(players).fill(0),
    log: [{ seat: starter, text: "starts" }],
  };
}

const sides = (m: DMatch, r: number, c: number) =>
  (m.h[r][c] !== null ? 1 : 0) + (m.h[r + 1][c] !== null ? 1 : 0) + (m.v[r][c] !== null ? 1 : 0) + (m.v[r][c + 1] !== null ? 1 : 0);

/** Boxes touched by a line. */
function adjacent(m: DMatch, kind: "h" | "v", r: number, c: number): [number, number][] {
  const out: [number, number][] = [];
  if (kind === "h") {
    if (r > 0) out.push([r - 1, c]);
    if (r < m.rows) out.push([r, c]);
  } else {
    if (c > 0) out.push([r, c - 1]);
    if (c < m.cols) out.push([r, c]);
  }
  return out;
}

export function freeLines(m: DMatch): { kind: "h" | "v"; r: number; c: number }[] {
  const out: { kind: "h" | "v"; r: number; c: number }[] = [];
  m.h.forEach((row, r) => row.forEach((x, c) => x === null && out.push({ kind: "h", r, c })));
  m.v.forEach((row, r) => row.forEach((x, c) => x === null && out.push({ kind: "v", r, c })));
  return out;
}

function apply(input: DMatch, seat: number, a: DAction): DMatch {
  const m: DMatch = structuredClone(input);
  if (a.type === "playAgain") {
    if (!m.winners) fail("The game isn't over");
    return fresh(m.players, (m.starter + 1) % m.players, m);
  }
  if (m.winners) fail("The game is over");
  if (m.turn !== seat) fail("Not your turn");
  const grid = a.kind === "h" ? m.h : m.v;
  if (!grid[a.r] || grid[a.r][a.c] !== null) fail("That line is taken");
  grid[a.r][a.c] = seat;
  m.lastLine = { kind: a.kind, r: a.r, c: a.c };
  m.moves += 1;
  let closed = 0;
  for (const [r, c] of adjacent(m, a.kind, a.r, a.c)) {
    if (m.boxes[r][c] === null && sides(m, r, c) === 4) {
      m.boxes[r][c] = seat;
      m.scores[seat] += 1;
      closed++;
    }
  }
  if (closed) pushLog(m.log, seat, `closed ${closed === 1 ? "a box" : `${closed} boxes`} — goes again`);
  else m.turn = (seat + 1) % m.players;

  if (m.boxes.every((row) => row.every((b) => b !== null))) {
    const best = Math.max(...m.scores);
    m.winners = m.scores.flatMap((s, i) => (s === best ? [i] : []));
    if (m.winners.length === 1) m.wins[m.winners[0]] += 1;
    pushLog(m.log, m.winners.length === 1 ? m.winners[0] : null, m.winners.length === 1 ? "wins!" : "it's a tie");
  }
  return m;
}

function botLine(m: DMatch) {
  const free = freeLines(m);
  const after = (l: (typeof free)[number]) => adjacent(m, l.kind, l.r, l.c).map(([r, c]) => sides(m, r, c) + 1);
  // 1) close a box; 2) a line that doesn't hand over a box (no box gets its 3rd side); 3) the least damaging.
  const closing = free.filter((l) => after(l).some((s) => s === 4));
  if (closing.length) return closing[0];
  const safe = free.filter((l) => after(l).every((s) => s < 3));
  const pool = safe.length ? safe : free.slice().sort((a, b) => after(a).filter((s) => s === 3).length - after(b).filter((s) => s === 3).length);
  const pick = safe.length ? Math.floor(stableRandom("dots", m.moves, pool.length) * pool.length) : 0;
  return pool[pick];
}

export const dots: GameDef<DMatch, DAction, DView> = {
  id: "dots",
  newMatch: (players) => fresh(players, 0),
  applyAction: apply,
  viewFor: (m, seat) => ({ ...m, mySeat: seat }),
  nextBotMove(m, isBot) {
    if (m.winners || !isBot(m.turn)) return null;
    const l = botLine(m);
    return { seat: m.turn, action: { type: "line", kind: l.kind, r: l.r, c: l.c } };
  },
  botDelayMs: () => 650,
};
