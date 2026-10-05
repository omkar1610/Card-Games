"use client";

import { useEffect, useState } from "react";
import type { RoomView } from "@/lib/rooms";
import { BLAction, BLView, BLUFF_RANKS } from "@/lib/games/bluff";

// Group by rank (A, 2 … K) so all cards of a rank sit together and are easy to pick.
const SUIT_ORDER = ["S", "H", "C", "D"];
const byRank = (hand: string[]) =>
  hand
    .slice()
    .sort((a, b) => BLUFF_RANKS.indexOf(rankOf(a)) - BLUFF_RANKS.indexOf(rankOf(b)) || SUIT_ORDER.indexOf(suitOf(a)) - SUIT_ORDER.indexOf(suitOf(b)));
import GameFrame from "../GameFrame";
import { PLAYER_COLOURS } from "./DotsTable";
import { CardBack, CardFace } from "../Card";
import { rankOf, suitOf } from "@/lib/engine/cards";
import { displayName } from "@/lib/names";
import { sfx } from "@/lib/sound";
import { useLogSounds } from "./useLogSounds";

export default function BluffTable({ view, game, act, send, error }: { view: RoomView; game: BLView; act: (a: BLAction) => Promise<void>; send: (b: unknown) => Promise<void>; error: string }) {
  const me = game.mySeat;
  const myTurn = game.turn === me && game.winner === null;
  const name = (s: number) => (s === me ? "You" : displayName(view.names[s]));
  const [selected, setSelected] = useState<string[]>([]);
  const [rank, setRank] = useState<string | null>(null);
  // Forget a stale selection when the hand changes (cards picked up, round over…).
  const handKey = game.hand.join(",");
  useEffect(() => setSelected((sel) => sel.filter((c) => game.hand.includes(c))), [handKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useLogSounds(game.log, view.version, (e) => {
    if (e.text.startsWith("played") && e.seat !== me) sfx.card();
    else if (e.text.startsWith("called bluff")) {
      sfx.double();
      setTimeout(e.text.includes("caught") ? sfx.good : sfx.bad, 400);
    } else if (e.text.startsWith("everyone passed")) sfx.collect();
    else if (e.text === "passed") sfx.pass();
  });

  const startingRound = game.rank === null;
  const claim = game.rank ?? rank;
  const toggle = (c: string) =>
    setSelected((sel) => (sel.includes(c) ? sel.filter((x) => x !== c) : sel.length >= 4 ? sel : [...sel, c]));
  async function play() {
    if (!selected.length || !claim) return;
    sfx.card();
    await act({ type: "play", cards: selected, ...(startingRound ? { rank: claim } : {}) });
    setSelected([]);
    setRank(null);
  }

  const lp = game.lastPlay;
  const status = myTurn
    ? startingRound
      ? { text: "Start a round: pick a rank, then 1–4 cards", mine: true }
      : { text: `Play 1–4 cards as ${game.rank}, or pass`, mine: true }
    : { text: game.winner === null ? `${name(game.turn)}'s turn` : "Game over", mine: false };

  return (
    <GameFrame
      view={view}
      gameId="bluff"
      players={Array.from({ length: game.players }, (_, s) => ({ seat: s, colour: PLAYER_COLOURS[s], sub: `${game.handCounts[s]} cards` }))}
      turn={game.winner === null ? [game.turn] : []}
      status={status}
      result={game.winner === null ? null : { winners: [game.winner] }}
      onPlayAgain={() => act({ type: "playAgain" })}
      send={send}
      error={error}
      scoreLine={game.wins.some((w) => w > 0) ? `Games won: ${game.wins.map((w, s) => `${name(s)} ${w}`).join(" · ")}` : undefined}
      footer={
        <>
          {myTurn && startingRound && (
            <div className="bluff-ranks">
              {BLUFF_RANKS.map((r) => (
                <button key={r} className={`btn small ${rank === r ? "primary" : ""}`} onClick={() => setRank(r)}>
                  {r}
                </button>
              ))}
            </div>
          )}
          {myTurn && (
            <div className="action-bar">
              <button className="btn primary" disabled={!selected.length || !claim} onClick={play}>
                {selected.length && claim ? `Play ${selected.length} as ${claim}` : startingRound ? "Pick a rank and cards" : "Pick 1–4 cards"}
              </button>
              {!startingRound && (
                <button className="btn" onClick={() => act({ type: "pass" })}>
                  Pass
                </button>
              )}
            </div>
          )}
          {/* Scrolls sideways when the hand is wider than the screen; centred otherwise. */}
          <div className="hand-scroll">
            <div className="my-hand bluff-hand">
              {byRank(game.hand).map((c) => (
                <button key={c} className={`hand-card ${selected.includes(c) ? "selected" : ""}`} disabled={!myTurn} onClick={() => toggle(c)}>
                  <CardFace card={c} />
                </button>
              ))}
            </div>
          </div>
          {game.hand.length > 13 && <div className="hand-count">{game.hand.length} cards · swipe to see them all</div>}
        </>
      }
    >
      <div className="bluff-centre">
        <div className="bluff-pile">
          {game.pileCount > 0 ? (
            <>
              {Array.from({ length: Math.min(5, game.pileCount) }, (_, i) => (
                <div key={i} className="bluff-pile-card" style={{ transform: `translate(${i * 3}px, ${-i * 2}px) rotate(${(i % 3) * 4 - 4}deg)` }}>
                  <CardBack />
                </div>
              ))}
              <span className="bluff-pile-count">{game.pileCount}</span>
            </>
          ) : (
            <span className="hint">Empty pile</span>
          )}
        </div>
        <div className="bluff-claim">
          {game.rank ? (
            <>
              Round of <b>{game.rank}s</b>
            </>
          ) : (
            "New round"
          )}
          {lp && (
            <div className="hint" style={{ margin: "4px 0 0" }}>
              {name(lp.seat)} played {lp.count} as {lp.rank}
              {lp.count > 1 ? "s" : ""}
            </div>
          )}
        </div>
        {game.canCall && (
          <button
            className="btn danger bluff-call"
            onClick={() => {
              sfx.double();
              act({ type: "call" });
            }}
          >
            Bluff!
          </button>
        )}
        {game.reveal && (
          <div className={`bluff-reveal ${game.reveal.truthful ? "true" : "lie"}`}>
            <div className="bluff-reveal-cards">
              {game.reveal.cards.map((c) => (
                <CardFace key={c} card={c} />
              ))}
            </div>
            <div>
              {name(game.reveal.caller)} called bluff on {name(game.reveal.player)}:{" "}
              <b>{game.reveal.truthful ? "it was true!" : "a lie!"}</b> {name(game.reveal.pickedUp)} picked up {game.reveal.count}.
            </div>
          </div>
        )}
      </div>
    </GameFrame>
  );
}
