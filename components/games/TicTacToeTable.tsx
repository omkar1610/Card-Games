"use client";

import type { RoomView } from "@/lib/rooms";
import type { TAction, TView } from "@/lib/games/tictactoe";
import GameFrame from "../GameFrame";
import { displayName } from "@/lib/names";
import { sfx } from "@/lib/sound";
import { useChangeSound } from "./useLogSounds";

const MARK = ["✕", "○"];
const COLOUR = ["#e8604c", "#5b8def"];

export default function TicTacToeTable({ view, game, act, send, error }: { view: RoomView; game: TView; act: (a: TAction) => Promise<void>; send: (b: unknown) => Promise<void>; error: string }) {
  const me = game.mySeat;
  const myTurn = game.turn === me && game.winner === null;
  const name = (s: number) => (s === me ? "You" : displayName(view.names[s]));
  const filled = game.board.filter((c) => c !== null).length;
  // The other player's mark (mine already ticked when I tapped).
  useChangeSound(game.board, view.version, (prev, next) => {
    const placed = next.findIndex((c, i) => c !== null && prev[i] === null);
    if (placed >= 0 && next[placed] !== me) sfx.tap();
  });

  return (
    <GameFrame
      view={view}
      gameId="tictactoe"
      players={[0, 1].map((s) => ({ seat: s, tag: MARK[s], colour: COLOUR[s], sub: `${game.wins[s]} won` }))}
      turn={game.winner === null ? [game.turn] : []}
      status={myTurn ? { text: `Your turn (${MARK[me]})`, mine: true } : { text: game.winner === null ? `${name(game.turn)}'s turn` : "Game over", mine: false }}
      result={game.winner === null ? null : { winners: game.winner === "draw" ? [] : [game.winner], detail: `Game ${game.games} · draws so far: ${game.draws}` }}
      onPlayAgain={() => act({ type: "playAgain" })}
      send={send}
      error={error}
    >
      <div className="ttt-board" data-filled={filled}>
        {game.board.map((c, i) => (
          <button
            key={i}
            className={`ttt-cell ${game.line?.includes(i) ? "win" : ""} ${c === null && myTurn ? "open" : ""}`}
            disabled={c !== null || !myTurn}
            onClick={() => {
              sfx.tap();
              act({ type: "move", cell: i });
            }}
            aria-label={c === null ? `Square ${i + 1}, empty` : `Square ${i + 1}, ${MARK[c]}`}
            style={{ color: c === null ? undefined : COLOUR[c] }}
          >
            {c === null ? "" : MARK[c]}
          </button>
        ))}
      </div>
    </GameFrame>
  );
}
