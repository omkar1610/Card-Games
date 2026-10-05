"use client";

import type { RoomView } from "@/lib/rooms";
import type { DAction, DView } from "@/lib/games/dots";
import GameFrame from "../GameFrame";
import { displayName } from "@/lib/names";
import { sfx } from "@/lib/sound";
import { useChangeSound, useLogSounds } from "./useLogSounds";

export const PLAYER_COLOURS = ["#e8604c", "#5b8def", "#2fae6b", "#e3a72c", "#a66ee8", "#e85fa8"];

export default function DotsTable({ view, game, act, send, error }: { view: RoomView; game: DView; act: (a: DAction) => Promise<void>; send: (b: unknown) => Promise<void>; error: string }) {
  const me = game.mySeat;
  const myTurn = game.turn === me && !game.winners;
  const name = (s: number) => (s === me ? "You" : displayName(view.names[s]));
  useLogSounds(game.log, view.version, (e) => e.text.startsWith("closed") && sfx.good());
  // Other players' lines (mine already ticked when I tapped).
  useChangeSound(game.moves, view.version, (prev, next) => {
    if (next > prev && game.lastLine) {
      const l = game.lastLine;
      const owner = (l.kind === "h" ? game.h : game.v)[l.r][l.c];
      if (owner !== me) sfx.tap();
    }
  });

  // SVG coordinates: dots every 60 units with a margin.
  const G = 60;
  const M = 14;
  const W = game.cols * G + M * 2;
  const H = game.rows * G + M * 2;
  const isLast = (k: "h" | "v", r: number, c: number) => game.lastLine?.kind === k && game.lastLine.r === r && game.lastLine.c === c;
  const draw = (kind: "h" | "v", r: number, c: number) => {
    sfx.tap();
    act({ type: "line", kind, r, c });
  };

  return (
    <GameFrame
      view={view}
      gameId="dots"
      players={Array.from({ length: game.players }, (_, s) => ({ seat: s, colour: PLAYER_COLOURS[s], sub: `${game.scores[s]} box${game.scores[s] === 1 ? "" : "es"}` }))}
      turn={game.winners ? [] : [game.turn]}
      status={myTurn ? { text: "Your turn: draw a line", mine: true } : { text: game.winners ? "Game over" : `${name(game.turn)}'s turn`, mine: false }}
      result={game.winners ? { winners: game.winners, detail: game.scores.map((sc, s) => `${name(s)} ${sc}`).join(" · ") } : null}
      onPlayAgain={() => act({ type: "playAgain" })}
      send={send}
      error={error}
      scoreLine={game.wins.some((w) => w > 0) ? `Games won: ${game.wins.map((w, s) => `${name(s)} ${w}`).join(" · ")}` : undefined}
    >
      <svg className="dots-board" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Dots and boxes board">
        {game.boxes.map((row, r) =>
          row.map((owner, c) =>
            owner === null ? null : (
              <rect key={`b${r}-${c}`} x={M + c * G + 4} y={M + r * G + 4} width={G - 8} height={G - 8} rx={6} fill={PLAYER_COLOURS[owner]} opacity={0.55} />
            ),
          ),
        )}
        {game.h.map((row, r) =>
          row.map((owner, c) => (
            <g key={`h${r}-${c}`}>
              <line
                x1={M + c * G}
                y1={M + r * G}
                x2={M + (c + 1) * G}
                y2={M + r * G}
                className={`dots-line ${owner !== null ? "drawn" : ""} ${isLast("h", r, c) ? "last" : ""}`}
                style={owner !== null ? { stroke: PLAYER_COLOURS[owner] } : undefined}
              />
              {owner === null && myTurn && (
                <rect x={M + c * G + 8} y={M + r * G - 12} width={G - 16} height={24} className="dots-hit" onClick={() => draw("h", r, c)} />
              )}
            </g>
          )),
        )}
        {game.v.map((row, r) =>
          row.map((owner, c) => (
            <g key={`v${r}-${c}`}>
              <line
                x1={M + c * G}
                y1={M + r * G}
                x2={M + c * G}
                y2={M + (r + 1) * G}
                className={`dots-line ${owner !== null ? "drawn" : ""} ${isLast("v", r, c) ? "last" : ""}`}
                style={owner !== null ? { stroke: PLAYER_COLOURS[owner] } : undefined}
              />
              {owner === null && myTurn && (
                <rect x={M + c * G - 12} y={M + r * G + 8} width={24} height={G - 16} className="dots-hit" onClick={() => draw("v", r, c)} />
              )}
            </g>
          )),
        )}
        {Array.from({ length: game.rows + 1 }, (_, r) =>
          Array.from({ length: game.cols + 1 }, (_, c) => <circle key={`d${r}-${c}`} cx={M + c * G} cy={M + r * G} r={5} className="dots-dot" />),
        )}
      </svg>
    </GameFrame>
  );
}
