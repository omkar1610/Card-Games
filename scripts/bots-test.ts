// Bot sanity: all-bot games must finish with only legal moves, and bots should beat random players.
import { applyAction, newMatch, legalPlays, doubleDeciders, bidRange, teamOf, Match, Action, Round } from "../lib/engine/game";
import { nextBotMove } from "../lib/engine/bot";

function seeded(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function randomMove(r: Round, rng: () => number): { seat: number; action: Action } {
  if (r.phase === "double" || r.phase === "redouble") return { seat: doubleDeciders(r)[0], action: { type: "noDouble" } };
  const seat = r.turn;
  if (r.phase === "bidding") {
    const { min, max } = bidRange(r.highBid);
    return { seat, action: min <= max && rng() < 0.3 ? { type: "bid", value: min } : { type: "pass" } };
  }
  if (r.phase === "trump") return { seat, action: { type: "chooseTrump", suit: (["S", "H", "D", "C"] as const)[Math.floor(rng() * 4)] } };
  const cards = legalPlays(r, seat).cards;
  return { seat, action: { type: "play", card: cards[Math.floor(rng() * cards.length)] } };
}

function playGame(seed: number, isBot: (s: number) => boolean): Match {
  const rng = seeded(seed);
  let m = newMatch(rng);
  for (let guard = 0; !m.winner; guard++) {
    if (guard > 50_000) throw new Error("game never ended");
    const r = m.round!;
    if (r.phase === "done") { m = applyAction(m, 0, { type: "nextRound" }, rng); continue; }
    const bot = nextBotMove(r, isBot);
    const move = bot ?? randomMove(r, rng);
    if (!bot && isBot(move.seat) && !(r.phase === "double" || r.phase === "redouble")) throw new Error(`bot seat ${move.seat} had no move in ${r.phase}`);
    m = applyAction(m, move.seat, move.action, rng); // throws if a bot move is illegal
  }
  return m;
}

let allBot = 0;
for (let g = 0; g < 300; g++) { playGame(g + 1, () => true); allBot++; }

let botTeamWins = 0;
const N = 400;
for (let g = 0; g < N; g++) {
  const m = playGame(5000 + g, (s) => teamOf(s) === "A"); // team A bots, team B random
  if (m.winner === "A") botTeamWins++;
}
console.log(`all-bot games finished: ${allBot}; bots vs random: bots won ${botTeamWins}/${N} (${Math.round((botTeamWins / N) * 100)}%)`);
if (botTeamWins / N < 0.6) throw new Error("bots should clearly beat random play");
