"use client";

import type { RoomView } from "@/lib/rooms";
import { COLOURS, Colour, HOME_COLUMN, LAction, LUDO_HOME, LView, SAFE_INDEXES, TRACK, trackIndex } from "@/lib/games/ludo";
import GameFrame from "../GameFrame";
import Dice from "./Dice";
import { displayName } from "@/lib/names";
import { sfx } from "@/lib/sound";
import { useChangeSound, useLogSounds } from "./useLogSounds";

export const LUDO_HEX: Record<Colour, string> = { red: "#e0453a", green: "#2fae6b", yellow: "#e8b923", blue: "#3f7fe0" };
const BASE_ORIGIN: Record<Colour, [number, number]> = { red: [0, 0], green: [0, 9], yellow: [9, 9], blue: [9, 0] };
const BASE_SPOTS: [number, number][] = [[1.75, 1.75], [1.75, 4.25], [4.25, 1.75], [4.25, 4.25]];
const HOME_OFFSET: Record<Colour, [number, number]> = { red: [7, 6.4], green: [6.4, 7], yellow: [7, 7.6], blue: [7.6, 7] };

/** Board cell classes for the 15×15 grid. */
function cellClass(r: number, c: number): string {
  for (const col of COLOURS) {
    const [or, oc] = BASE_ORIGIN[col];
    if (r >= or && r < or + 6 && c >= oc && c < oc + 6) {
      const inner = r > or && r < or + 5 && c > oc && c < oc + 5;
      return `ludo-base ${col} ${inner ? "inner" : ""}`;
    }
  }
  if (r >= 6 && r <= 8 && c >= 6 && c <= 8) return "ludo-centre";
  for (const col of COLOURS) if (HOME_COLUMN[col].some(([hr, hc]) => hr === r && hc === c)) return `ludo-home ${col}`;
  const idx = TRACK.findIndex(([tr, tc]) => tr === r && tc === c);
  if (idx >= 0) {
    const startOf = COLOURS.find((col) => trackIndex(col, 0) === idx);
    return `ludo-track ${startOf ? `start ${startOf}` : ""} ${SAFE_INDEXES.includes(idx) && !startOf ? "safe" : ""}`;
  }
  return "ludo-empty";
}

export default function LudoTable({ view, game, act, send, error }: { view: RoomView; game: LView; act: (a: LAction) => Promise<void>; send: (b: unknown) => Promise<void>; error: string }) {
  const me = game.mySeat;
  const myTurn = game.turn === me && game.winner === null;
  const name = (s: number) => (s === me ? "You" : displayName(view.names[s]));
  useLogSounds(game.log, view.version, (e) => {
    if (e.text.startsWith("rolled")) sfx.dice();
    else if (e.text.startsWith("captured")) sfx.good();
    else if (e.text.startsWith("brought")) sfx.good();
  });
  // A token moved: hop sound.
  useChangeSound(game.lastMove, view.version, (_, mv) => mv && sfx.tap());
  // One of my tokens on the board was sent back to base: captured.
  useChangeSound(game.tokens[me], view.version, (prev, next) => {
    if (next.some((p, i) => p === -1 && prev[i] >= 0)) setTimeout(sfx.bad, 250);
  });

  /** Where a token sits, in cell units (row, col) of its centre. */
  const place = (seat: number, token: number): [number, number] => {
    const colour = game.colours[seat];
    const p = game.tokens[seat][token];
    if (p === -1) {
      const [or, oc] = BASE_ORIGIN[colour];
      const [dr, dc] = BASE_SPOTS[token];
      return [or + dr, oc + dc];
    }
    if (p === LUDO_HOME) {
      const [hr, hc] = HOME_OFFSET[colour];
      return [hr + 0.5 + (token - 1.5) * 0.12, hc + 0.5 + (token - 1.5) * 0.12];
    }
    const [r, c] = p <= 50 ? TRACK[trackIndex(colour, p)] : HOME_COLUMN[colour][p - 51];
    return [r + 0.5, c + 0.5];
  };

  // Spread tokens that share a square.
  const positions: { seat: number; token: number; r: number; c: number }[] = [];
  game.tokens.forEach((toks, seat) => toks.forEach((_, token) => {
    const [r, c] = place(seat, token);
    positions.push({ seat, token, r, c });
  }));
  const shared = (r: number, c: number) => positions.filter((p) => Math.abs(p.r - r) < 0.01 && Math.abs(p.c - c) < 0.01);

  const status = myTurn
    ? game.phase === "roll"
      ? { text: game.dice === 6 && game.sixes > 0 ? "You rolled a 6: roll again!" : "Your turn: roll", mine: true }
      : { text: `You rolled ${game.dice}: tap a token to move`, mine: true }
    : { text: game.winner === null ? `${name(game.turn)}'s turn` : "Game over", mine: false };

  return (
    <GameFrame
      view={view}
      gameId="ludo"
      players={Array.from({ length: game.players }, (_, s) => ({
        seat: s,
        colour: LUDO_HEX[game.colours[s]],
        sub: `${game.tokens[s].filter((p) => p === LUDO_HOME).length}/4 home`,
      }))}
      turn={game.winner === null ? [game.turn] : []}
      status={status}
      result={game.winner === null ? null : { winners: [game.winner] }}
      onPlayAgain={() => act({ type: "playAgain" })}
      send={send}
      error={error}
      footer={
        <div className="dice-bar">
          <Dice value={game.dice} />
          <span className="dice-note" style={{ color: LUDO_HEX[game.colours[game.turn]] }}>
            {name(game.turn)} · {game.colours[game.turn]}
          </span>
          <button className="btn primary" disabled={!myTurn || game.phase !== "roll"} onClick={() => act({ type: "roll" })}>
            🎲 Roll
          </button>
        </div>
      }
    >
      <div className="ludo-board">
        {Array.from({ length: 225 }, (_, i) => {
          const r = Math.floor(i / 15);
          const c = i % 15;
          const cls = cellClass(r, c);
          return (
            <div key={i} className={`ludo-cell ${cls}`}>
              {cls.includes("safe") ? "★" : ""}
            </div>
          );
        })}
        <div className="ludo-centre-art" aria-hidden>
          <span className="tri red" />
          <span className="tri green" />
          <span className="tri yellow" />
          <span className="tri blue" />
        </div>
        {positions.map(({ seat, token, r, c }) => {
          const group = shared(r, c);
          const k = group.findIndex((g) => g.seat === seat && g.token === token);
          const spread = group.length > 1 ? (k - (group.length - 1) / 2) * 0.28 : 0;
          const canMove = seat === me && game.movable.includes(token);
          return (
            <button
              key={`${seat}-${token}`}
              className={`ludo-token ${canMove ? "movable" : ""}`}
              style={{ left: `${((c + spread) / 15) * 100}%`, top: `${((r + spread * 0.5) / 15) * 100}%`, background: LUDO_HEX[game.colours[seat]] }}
              disabled={!canMove}
              onClick={() => act({ type: "move", token })}
              aria-label={`${game.colours[seat]} token ${token + 1}`}
            />
          );
        })}
      </div>
    </GameFrame>
  );
}
