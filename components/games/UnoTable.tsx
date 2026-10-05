"use client";

import { useEffect, useState } from "react";
import type { RoomView } from "@/lib/rooms";
import { UAction, UColour, UCOLOURS, UCOLOUR_NAME, UView, isWild, ucolour, uvalue } from "@/lib/games/uno";
import GameFrame from "../GameFrame";
import { PLAYER_COLOURS } from "./DotsTable";
import { displayName } from "@/lib/names";
import { sfx } from "@/lib/sound";
import { dealSound, useLogSounds } from "./useLogSounds";

export const UNO_HEX: Record<UColour, string> = { R: "#d8352a", Y: "#e9b417", G: "#2f9e4f", B: "#2c6bd6" };

function face(card: string): string {
  const v = uvalue(card);
  return v === "S" ? "⦸" : v === "R" ? "⇄" : v === "D" ? "+2" : v === "W" ? "W" : v === "F" ? "+4" : v;
}

export function UnoCard({ card, small }: { card: string; small?: boolean }) {
  const wild = isWild(card);
  const bg = wild ? "#1c1c24" : UNO_HEX[ucolour(card) as UColour];
  return (
    <div className={`uno-card ${small ? "small" : ""}`} style={{ background: bg }} aria-label={card}>
      <span className="uno-corner">{face(card)}</span>
      <span className="uno-oval">
        {wild ? (
          <span className="uno-wheel">
            {UCOLOURS.map((c) => (
              <i key={c} style={{ background: UNO_HEX[c] }} />
            ))}
          </span>
        ) : null}
        <b style={{ color: wild ? "#fff" : bg }}>{face(card)}</b>
      </span>
    </div>
  );
}

export default function UnoTable({ view, game, act, send, error }: { view: RoomView; game: UView; act: (a: UAction) => Promise<void>; send: (b: unknown) => Promise<void>; error: string }) {
  const me = game.mySeat;
  // The deal: when a game has just started (its log has only the opening entry).
  const dealKey = `${game.wins.reduce((a, b) => a + b, 0)}:${game.log.length === 1}`;
  useEffect(() => {
    if (game.log.length === 1) dealSound(sfx.deal, game.players * 7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealKey]);
  const myTurn = game.turn === me && game.winner === null;
  const name = (s: number) => (s === me ? "You" : displayName(view.names[s]));
  const [choosing, setChoosing] = useState<string | null>(null); // wild waiting for a colour
  const playable = new Set(game.playable);
  useLogSounds(game.log, view.version, (e) => {
    if (e.seat === me && e.text.startsWith("played")) return; // already played on tap
    if (e.text.startsWith("played")) sfx.card();
    else if (e.text === "UNO!") sfx.reveal();
    else if (e.text.startsWith("draws")) sfx.bad();
    else if (e.text === "drew a card") sfx.deal();
  });

  function play(card: string) {
    if (isWild(card)) return setChoosing(card);
    sfx.card();
    act({ type: "play", card });
  }

  const status = myTurn
    ? game.drawnCard
      ? { text: "You drew a card: play it or pass", mine: true }
      : { text: game.playable.length ? "Your turn" : "No match: draw a card", mine: true }
    : { text: game.winner === null ? `${name(game.turn)}'s turn` : "Game over", mine: false };

  return (
    <GameFrame
      view={view}
      gameId="uno"
      players={Array.from({ length: game.players }, (_, s) => ({
        seat: s,
        colour: PLAYER_COLOURS[s],
        sub: game.handCounts[s] === 1 ? <b className="uno-badge">UNO!</b> : `${game.handCounts[s]} cards`,
      }))}
      turn={game.winner === null ? [game.turn] : []}
      status={status}
      result={game.winner === null ? null : { winners: [game.winner] }}
      onPlayAgain={() => act({ type: "playAgain" })}
      send={send}
      error={error}
      scoreLine={game.wins.some((w) => w > 0) ? `Games won: ${game.wins.map((w, s) => `${name(s)} ${w}`).join(" · ")}` : undefined}
      footer={
        <>
          {myTurn && (
            <div className="action-bar">
              {!game.drawnCard && (
                <button className="btn" onClick={() => act({ type: "draw" })}>
                  Draw a card
                </button>
              )}
              {game.drawnCard && (
                <button className="btn" onClick={() => act({ type: "pass" })}>
                  Pass
                </button>
              )}
            </div>
          )}
          <div className="hand-scroll">
          <div className="uno-hand">
            {game.hand.map((c) => {
              const ok = myTurn && playable.has(c);
              return (
                <button key={c} className={`uno-hand-card ${ok ? "playable" : myTurn ? "dim" : ""} ${c === game.drawnCard ? "drawn" : ""}`} disabled={!ok} onClick={() => play(c)}>
                  <UnoCard card={c} />
                </button>
              );
            })}
          </div>
          </div>
          {game.hand.length > 9 && <div className="hand-count">{game.hand.length} cards · swipe to see them all</div>}
        </>
      }
    >
      <div className="uno-centre">
        <div className="uno-pile" aria-label={`${game.drawCount} cards to draw`}>
          <div className="uno-card back">
            <span className="uno-oval">
              <b>UNO</b>
            </span>
          </div>
          <span className="uno-count">{game.drawCount}</span>
        </div>
        <div className="uno-top" key={game.top}>
          <UnoCard card={game.top} />
        </div>
        <div className="uno-state">
          <span className="uno-colour" style={{ background: UNO_HEX[game.colour] }}>
            {UCOLOUR_NAME[game.colour]}
          </span>
          <span className="uno-dir">{game.direction === 1 ? "↻ clockwise" : "↺ reversed"}</span>
        </div>
      </div>

      {choosing && (
        <div className="overlay" onClick={() => setChoosing(null)}>
          <div className="result-card" onClick={(e) => e.stopPropagation()}>
            <h2>Choose a colour</h2>
            <div className="uno-pick">
              {UCOLOURS.map((c) => (
                <button
                  key={c}
                  style={{ background: UNO_HEX[c] }}
                  onClick={() => {
                    sfx.card();
                    act({ type: "play", card: choosing, colour: c });
                    setChoosing(null);
                  }}
                >
                  {UCOLOUR_NAME[c]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </GameFrame>
  );
}
