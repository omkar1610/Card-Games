// The six newer games: every player count, all-bot games must finish with only legal moves,
// plus a few rule checks per game.
import { getGame } from "../lib/games";
import type { GameId } from "../lib/games/catalog";
import { GAMES } from "../lib/games/catalog";
import { applyLudo, LUDO_HOME, trackIndex, TRACK } from "../lib/games/ludo";
import { applySnakes, LADDERS, SNAKES } from "../lib/games/snakes";
import { lineWinner } from "../lib/games/tictactoe";
import { unoDeck } from "../lib/games/uno";
import { fullDeck } from "../lib/games/bluff";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const over = (m: any) => (m.winner !== undefined ? m.winner !== null : !!m.winners);

const summary: string[] = [];
for (const id of ["ludo", "snakes", "bluff", "uno", "tictactoe", "dots"] as GameId[]) {
  const def = getGame(id);
  const info = GAMES.find((g) => g.id === id)!;
  let games = 0, moves = 0;
  for (let players = info.minPlayers; players <= info.maxPlayers; players++) {
    for (let g = 0; g < 40; g++) {
      let m = def.newMatch(players);
      for (let guard = 0; !over(m); guard++) {
        assert(guard < 20000, `${id} (${players}p) never ended`);
        const move = def.nextBotMove(m, () => true);
        assert(move, `${id} (${players}p): no bot move`);
        m = def.applyAction(m, move.seat, move.action); // throws on an illegal move
        moves++;
        for (let s = 0; s < players; s++) def.viewFor(m, s);
      }
      const again = def.applyAction(m, 0, { type: "playAgain" });
      assert(!over(again), `${id}: play again starts a new game`);
      games++;
    }
  }
  summary.push(`${id} ${games} games/${moves} moves`);
}

// --- rule spot checks
assert(TRACK.length === 52 && new Set(TRACK.map((p) => p.join())).size === 52, "ludo track has 52 distinct squares");
assert(trackIndex("green", 0) === 13 && trackIndex("blue", 50) === 37, "ludo start/turn-in squares");
{
  let m: any = getGame("ludo").newMatch(2);
  // force a roll of 5 with tokens in base: no move, turn passes
  m = applyLudo(m, 0, { type: "roll" }, () => 4 / 6); // 5
  assert(m.turn === 1 && m.phase === "roll", "ludo: no 6 with all tokens in base passes the turn");
  m = applyLudo(m, 1, { type: "roll" }, () => 5.5 / 6); // 6
  assert(m.phase === "move" && m.dice === 6, "ludo: a 6 lets you move");
  m = applyLudo(m, 1, { type: "move", token: 0 });
  assert(m.tokens[1][0] === 0 && m.turn === 1 && m.phase === "roll", "ludo: 6 brings a token out and rolls again");
  m.tokens[1][0] = LUDO_HOME - 2;
  m.phase = "roll";
  m = applyLudo(m, 1, { type: "roll" }, () => 4 / 6); // 5: overshoots home
  assert(m.turn === 0, "ludo: exact roll needed for home");
}
{
  let m: any = getGame("snakes").newMatch(2);
  m.pos[0] = 98;
  m = applySnakes(m, 0, { type: "roll" }, () => 3 / 6); // 4 → would be 102
  assert(m.pos[0] === 98, "snakes: overshooting 100 stays put");
  m.pos[1] = 0;
  m = applySnakes(m, 1, { type: "roll" }, () => 0); // 1 → ladder to 38
  assert(m.pos[1] === LADDERS[1], "snakes: ladder climbs");
  assert(Object.keys(SNAKES).every((k) => SNAKES[+k] < +k) && Object.keys(LADDERS).every((k) => LADDERS[+k] > +k), "snakes go down, ladders up");
}
assert(lineWinner([0, 0, 0, null, 1, 1, null, null, null])?.seat === 0, "ttt: row wins");
assert(unoDeck().length === 108 && new Set(unoDeck()).size === 108, "uno: 108 distinct cards");
assert(fullDeck().length === 52, "bluff: full deck");
{
  // Bluff: a caught lie sends the pile to the liar; a wrong call sends it to the caller.
  const def = getGame("bluff");
  let m: any = def.newMatch(3);
  const liar = m.turn;
  const notAce = m.hands[liar].find((c: string) => !c.startsWith("A"));
  m = def.applyAction(m, liar, { type: "play", cards: [notAce], rank: "A" });
  const before = m.hands[liar].length;
  m = def.applyAction(m, (liar + 1) % 3, { type: "call" });
  assert(m.hands[liar].length === before + 1 && m.reveal && !m.reveal.truthful, "bluff: liar picks up");
  const starter = m.turn;
  const real = m.hands[starter][0];
  m = def.applyAction(m, starter, { type: "play", cards: [real], rank: real.slice(0, -1) });
  const caller = (starter + 1) % 3;
  const cBefore = m.hands[caller].length;
  m = def.applyAction(m, caller, { type: "call" });
  assert(m.hands[caller].length === cBefore + 1 && m.reveal.truthful, "bluff: wrong call, caller picks up");
}
console.log(`games OK: ${summary.join("; ")}`);
