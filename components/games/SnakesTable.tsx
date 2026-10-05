"use client";

import type { RoomView } from "@/lib/rooms";
import { LADDERS, SNAKES, SAction, SView } from "@/lib/games/snakes";
import GameFrame from "../GameFrame";
import Dice from "./Dice";
import { PLAYER_COLOURS } from "./DotsTable";
import { displayName } from "@/lib/names";
import { sfx } from "@/lib/sound";
import { useLogSounds } from "./useLogSounds";

/** Centre of square n (1–100) in board percentages; square 1 is bottom-left, rows zig-zag. */
function cellCentre(n: number): [number, number] {
  const i = n - 1;
  const rowFromBottom = Math.floor(i / 10);
  const col = rowFromBottom % 2 === 0 ? i % 10 : 9 - (i % 10);
  return [col * 10 + 5, (9 - rowFromBottom) * 10 + 5];
}

export default function SnakesTable({ view, game, act, send, error }: { view: RoomView; game: SView; act: (a: SAction) => Promise<void>; send: (b: unknown) => Promise<void>; error: string }) {
  const me = game.mySeat;
  const myTurn = game.turn === me && game.winner === null;
  const name = (s: number) => (s === me ? "You" : displayName(view.names[s]));
  useLogSounds(game.log, view.version, (e) => {
    if (!e.text.startsWith("rolled")) return;
    sfx.dice();
    if (e.text.includes("ladder")) setTimeout(sfx.good, 500);
    if (e.text.includes("snake")) setTimeout(sfx.bad, 500);
  });

  const cells = Array.from({ length: 100 }, (_, i) => {
    const row = Math.floor(i / 10); // 0 = top row
    const fromBottom = 9 - row;
    const col = i % 10;
    const n = fromBottom * 10 + (fromBottom % 2 === 0 ? col + 1 : 10 - col);
    return n;
  });
  const last = game.last;

  return (
    <GameFrame
      view={view}
      gameId="snakes"
      players={Array.from({ length: game.players }, (_, s) => ({ seat: s, colour: PLAYER_COLOURS[s], sub: game.pos[s] === 0 ? "start" : `on ${game.pos[s]}` }))}
      turn={game.winner === null ? [game.turn] : []}
      status={
        myTurn
          ? { text: last?.seat === me && last.roll === 6 ? "You rolled a 6: roll again!" : "Your turn: roll", mine: true }
          : { text: game.winner === null ? `${name(game.turn)}'s turn` : "Game over", mine: false }
      }
      result={game.winner === null ? null : { winners: [game.winner] }}
      onPlayAgain={() => act({ type: "playAgain" })}
      send={send}
      error={error}
      footer={
        <div className="dice-bar">
          <Dice value={last?.roll ?? null} rolling={false} />
          <span className="dice-note">
            {last
              ? `${name(last.seat)} rolled ${last.roll}${last.via === "ladder" ? ": ladder!" : last.via === "snake" ? ": snake!" : last.via === "bounce" ? ": needs exact" : ""}`
              : "Roll to start"}
          </span>
          <button className="btn primary" disabled={!myTurn} onClick={() => act({ type: "roll" })}>
            🎲 Roll
          </button>
        </div>
      }
    >
      <div className="snl-board">
        {cells.map((n) => (
          <div key={n} className={`snl-cell ${(n + Math.floor((n - 1) / 10)) % 2 ? "alt" : ""} ${n === 100 ? "goal" : ""}`}>
            <span>{n}</span>
          </div>
        ))}
        <svg className="snl-overlay" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {Object.entries(LADDERS).map(([from, to]) => {
            const [x1, y1] = cellCentre(+from);
            const [x2, y2] = cellCentre(to);
            // Rails sit 1.6 board-% either side of the centre line; a rung every ~4%.
            const len = Math.hypot(x2 - x1, y2 - y1);
            const ox = (-(y2 - y1) / len) * 1.6;
            const oy = ((x2 - x1) / len) * 1.6;
            const rungs = Math.max(2, Math.floor(len / 4));
            return (
              <g key={`l${from}`} className="snl-ladder">
                <line x1={x1 - ox} y1={y1 - oy} x2={x2 - ox} y2={y2 - oy} />
                <line x1={x1 + ox} y1={y1 + oy} x2={x2 + ox} y2={y2 + oy} />
                {Array.from({ length: rungs }, (_, k) => {
                  const t = (k + 0.5) / rungs;
                  const x = x1 + (x2 - x1) * t;
                  const y = y1 + (y2 - y1) * t;
                  return <line key={k} className="rung" x1={x - ox} y1={y - oy} x2={x + ox} y2={y + oy} />;
                })}
              </g>
            );
          })}
          {Object.entries(SNAKES).map(([from, to]) => {
            const [x1, y1] = cellCentre(+from);
            const [x2, y2] = cellCentre(to);
            const mx = (x1 + x2) / 2 + (y2 - y1) * 0.25;
            const my = (y1 + y2) / 2 - (x2 - x1) * 0.25;
            return (
              <g key={`s${from}`} className="snl-snake">
                <path d={`M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`} />
                <circle cx={x1} cy={y1} r={1.8} />
              </g>
            );
          })}
        </svg>
        {game.pos.map((p, s) => {
          if (p === 0) return null;
          const [x, y] = cellCentre(p);
          const off = [-1.8, 1.8, -1.8, 1.8][s] ?? 0;
          const offY = [-1.8, -1.8, 1.8, 1.8][s] ?? 0;
          return (
            <span
              key={s}
              className={`snl-token ${s === game.turn && game.winner === null ? "active" : ""}`}
              style={{ left: `${x + off}%`, top: `${y + offY}%`, background: PLAYER_COLOURS[s] }}
              title={name(s)}
            />
          );
        })}
      </div>
    </GameFrame>
  );
}
