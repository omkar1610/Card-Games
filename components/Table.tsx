"use client";

import { useEffect, useState } from "react";
import type { RoomView } from "@/lib/rooms";
import type { Action, PlayerView, Team } from "@/lib/engine/game";
import { SUITS, SUIT_SYMBOL, SUIT_NAME, Suit } from "@/lib/engine/cards";
import { CardFace } from "./Card";

type Dir = "s" | "e" | "n" | "w";
const DIRS: Dir[] = ["s", "e", "n", "w"]; // relative to me, anticlockwise
const TRICK_SHOW_MS = 900; // finished hand stays in the middle…
const TRICK_COLLECT_MS = 600; // …then slides to whoever won it
const TOAST_MS = 3500;

const teamOf = (seat: number): Team => (seat % 2 === 0 ? "A" : "B");
const isRed = (s: Suit | null) => s === "H" || s === "D";

interface Props {
  view: RoomView;
  game: PlayerView;
  act: (a: Action) => void;
  send: (body: unknown) => Promise<void>;
  error: string;
}

export default function Table({ view, game, act, send, error }: Props) {
  const r = game.round!;
  const me = game.mySeat;
  const dirOf = (seat: number) => DIRS[(seat - me + 4) % 4];
  const seatAt = (d: Dir) => (me + DIRS.indexOf(d)) % 4;
  const name = (seat: number | null) => (seat === null ? "" : seat === me ? "You" : (view.seats[seat] ?? "?"));
  const teamNames = (t: Team) =>
    [0, 1, 2, 3]
      .filter((s) => teamOf(s) === t)
      .map((s) => view.seats[s])
      .join(" & ");

  // ---- finished hand: show it, then slide it to the winner. Decided during render so cards never flash.
  const tricksLen = r.tricks.length;
  const trickKey = `${r.number}:${tricksLen}`;
  const [seenKey, setSeenKey] = useState(trickKey);
  const [held, setHeld] = useState<{ key: string; collecting: boolean } | null>(null);
  if (trickKey !== seenKey) {
    setSeenKey(trickKey);
    setHeld(tricksLen > 0 ? { key: trickKey, collecting: false } : null);
  }
  const holding = held?.key === trickKey;
  useEffect(() => {
    if (!held) return;
    const t = held.collecting
      ? setTimeout(() => setHeld(null), TRICK_COLLECT_MS)
      : setTimeout(() => setHeld({ ...held, collecting: true }), TRICK_SHOW_MS);
    return () => clearTimeout(t);
  }, [held]);

  // ---- short pop-up for important events during play (trump asked, marriage)
  const logLen = r.log.length;
  const lastLog = r.log[logLen - 1];
  const [toast, setToast] = useState<string | null>(null);
  const [seenLog, setSeenLog] = useState(`${r.number}:${logLen}`);
  if (`${r.number}:${logLen}` !== seenLog) {
    setSeenLog(`${r.number}:${logLen}`);
    if (lastLog && /trump is|marriage|redoubled|doubled/.test(lastLog.text) && r.phase === "playing")
      setToast(`${name(lastLog.seat)} ${lastLog.text}`);
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const lastTrick = tricksLen ? r.tricks[tricksLen - 1] : null;
  const showLast = holding && r.trick.length === 0 && lastTrick !== null;
  const shownTrick = showLast ? lastTrick!.cards : r.trick;
  const deciding = r.phase === "double" || r.phase === "redouble";
  const myTurn = r.turn === me && (r.phase === "bidding" || r.phase === "trump" || r.phase === "playing");
  const iDecide = r.doubleDeciders.includes(me);
  const legal = new Set(r.legal.cards);
  const preplay = r.phase === "bidding" || r.phase === "trump" || deciding;

  const lastBid = (seat: number) => {
    for (let i = r.bids.length - 1; i >= 0; i--) if (r.bids[i].seat === seat) return r.bids[i].bid;
    return undefined;
  };
  const isTurn = (seat: number) => (deciding ? r.doubleDeciders.includes(seat) : r.turn === seat && r.phase !== "done");

  // "21 (17 + 4)" after a marriage
  const bidText = (() => {
    if (r.highBid === null) return "–";
    if (r.target === null || r.target === r.highBid) return String(r.highBid);
    const d = r.target - r.highBid;
    return `${r.target} (${r.highBid} ${d > 0 ? "+" : "−"} ${Math.abs(d)})`;
  })();
  const multLabel = r.multiplier === 4 ? "Redoubled ×4" : r.multiplier === 2 ? "Doubled ×2" : null;

  function headline(): string {
    if (r.phase === "bidding")
      return r.highBid ? `High bid ${r.highBid} · ${name(r.bidder)}` : "Bidding · no bids yet (min 16)";
    if (r.phase === "trump")
      return r.bidder === me
        ? `You won the bid at ${r.highBid} · choose trump`
        : `${name(r.bidder)} won the bid at ${r.highBid} · choosing trump`;
    const who = r.doubleDeciders.map(name).join(" & ");
    if (r.phase === "double") return `Team ${teamOf(r.bidder! + 1)} can double · waiting for ${who}`;
    if (r.phase === "redouble") return `Doubled! Team ${teamOf(r.bidder!)} can redouble · waiting for ${who}`;
    return "";
  }

  function status(): { text: string; mine: boolean } {
    if (r.phase === "bidding")
      return myTurn ? { text: "Your bid", mine: true } : { text: `${name(r.turn)} is bidding…`, mine: false };
    if (r.phase === "trump")
      return myTurn
        ? { text: `You won at ${r.highBid}. Choose trump`, mine: true }
        : { text: `${name(r.bidder)} is choosing trump…`, mine: false };
    if (deciding) {
      if (iDecide) return { text: r.phase === "double" ? "Double their bid?" : "Redouble?", mine: true };
      return { text: "Waiting…", mine: false };
    }
    if (r.phase === "playing") {
      if (showLast) return { text: `${name(lastTrick!.winner)} won the hand (+${lastTrick!.points})`, mine: false };
      return myTurn ? { text: "Your turn", mine: true } : { text: `${name(r.turn)}'s turn`, mine: false };
    }
    return { text: "Round over", mine: false };
  }
  const st = status();

  async function endGame() {
    if (!confirm("End this game for everyone? The room will close.")) return;
    await send({ op: "end" });
  }

  const nameplate = (seat: number) => (
    <div className={`nameplate team-${teamOf(seat)} ${isTurn(seat) ? "turn" : ""}`}>
      <span>{seat === me ? view.me : name(seat)}</span>
      {seat === r.dealer && <span className="chip dealer">D</span>}
      {seat === r.bidder && r.phase !== "bidding" && <span className="chip">{r.highBid}</span>}
    </div>
  );

  const seatBubble = (seat: number) => {
    if (r.phase === "bidding") {
      const bid = lastBid(seat);
      if (bid === undefined) return null;
      return <div className={`bubble ${bid === null ? "pass" : ""}`}>{bid === null ? "Pass" : bid}</div>;
    }
    if (r.redoubledBy === seat) return <div className="bubble dbl">Redouble</div>;
    if (r.doubledBy === seat) return <div className="bubble dbl">Double</div>;
    return null;
  };

  return (
    <div className="game">
      {/* ---------------- scoreboard ---------------- */}
      <header className="topbar">
        <div className="room-strip">
          <span>Room {view.code}</span>
          <span className="ta">A: {teamNames("A")}</span>
          <span className="tb">B: {teamNames("B")}</span>
          <button className="end-btn" onClick={endGame}>
            End game
          </button>
        </div>

        <div className="stats-row">
          <div className="stat">
            <span className="stat-label">Game</span>
            <span className="stat-value">
              <span className="ta">A {game.score.A}</span>
              <span className="tb">B {game.score.B}</span>
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Round {r.number}</span>
            <span className="stat-value">
              <span className="ta">A {r.points.A}</span>
              <span className="tb">B {r.points.B}</span>
            </span>
          </div>
          <div className="stat grow">
            <span className="stat-label">Bid {r.bidder !== null ? `· ${name(r.bidder)}` : ""}</span>
            <span className="stat-value">
              <span className={r.bidder !== null ? (teamOf(r.bidder) === "A" ? "ta" : "tb") : ""}>{bidText}</span>
              {multLabel && <span className="x-badge">{multLabel}</span>}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Trump</span>
            <span className="stat-value">
              <span className={`trump-suit ${isRed(r.trumpSuit) ? "red" : ""}`}>
                {r.trumpSuit ? SUIT_SYMBOL[r.trumpSuit] : "?"}
              </span>
              <span className="stat-sub">
                {r.trumpRevealed ? name(r.revealedBy) : r.trumpSuit ? "secret" : ""}
              </span>
            </span>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat">
            <span className="stat-label">Hands</span>
            <div className="hands-track">
              {Array.from({ length: 8 }, (_, i) => {
                const t = r.tricks[i];
                const team = t ? teamOf(t.winner) : null;
                return (
                  <div key={i} className={`hand-slot ${team ?? ""}`} title={t ? `${name(t.winner)} +${t.points}` : ""}>
                    {team ?? i + 1}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="stat grow">
            <span className="stat-label">
              Last hand {lastTrick ? `· ${name(lastTrick.winner)} +${lastTrick.points}` : ""}
            </span>
            <div className="last-hand">
              {lastTrick ? (
                lastTrick.cards.map((p) => (
                  <CardFace key={p.card} card={p.card} className={`tiny ${p.seat === lastTrick.winner ? "won" : ""}`} />
                ))
              ) : (
                <span className="stat-sub">–</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ---------------- table ---------------- */}
      <section className="felt">
        {(["n", "w", "e"] as Dir[]).map((d) => {
          const seat = seatAt(d);
          return (
            <div key={d} className={`player ${d === "n" ? "north" : d === "w" ? "west" : "east"}`}>
              {nameplate(seat)}
              {seatBubble(seat)}
            </div>
          );
        })}

        <div className="trick-area">
          {toast && <div className="toast">{toast}</div>}
          <div className={`collect ${showLast && held?.collecting ? `to-${dirOf(lastTrick!.winner)}` : ""}`}>
            {shownTrick.map((p) => (
              <div
                key={p.card}
                className={`trick-card ${dirOf(p.seat)} ${showLast && p.seat === lastTrick!.winner ? "winner" : ""}`}
              >
                <CardFace card={p.card} />
              </div>
            ))}
          </div>
          {preplay && (
            <div className="feed">
              <div className="headline">{headline()}</div>
              <div className="lines">
                {r.log.slice(-5).map((l, i) => (
                  <div key={`${logLen}-${i}`}>
                    {l.seat !== null && <b>{name(l.seat)} </b>}
                    {l.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ---------------- me (south) ---------------- */}
        <div className="south">
          <div className="action-bar">
            <div className={`status-text ${st.mine ? "mine" : ""}`}>{st.text}</div>
            {seatBubble(me)}
            {r.legal.canReveal && (
              <button className="btn primary" onClick={() => act({ type: "revealTrump" })}>
                Ask for trump
              </button>
            )}
            {r.canMarriage && (
              <button className="btn primary" onClick={() => act({ type: "marriage" })}>
                Declare marriage
              </button>
            )}
            {iDecide && (
              <>
                <button
                  className="btn primary"
                  onClick={() => act({ type: r.phase === "double" ? "double" : "redouble" })}
                >
                  {r.phase === "double" ? "Double" : "Redouble"}
                </button>
                <button className="btn" onClick={() => act({ type: "noDouble" })}>
                  {r.phase === "double" ? "No double" : "No redouble"}
                </button>
              </>
            )}
            {error && (
              <span className="error" style={{ margin: 0 }}>
                {error}
              </span>
            )}
          </div>

          {r.phase === "bidding" && myTurn && (
            <div className="bid-grid">
              {Array.from({ length: 28 - r.minBid + 1 }, (_, i) => r.minBid + i).map((v) => (
                <button key={v} className="btn primary" onClick={() => act({ type: "bid", value: v })}>
                  {v}
                </button>
              ))}
              <button className="btn pass-btn" onClick={() => act({ type: "pass" })}>
                Pass
              </button>
            </div>
          )}

          {r.phase === "trump" && myTurn && (
            <div className="suit-pick">
              {SUITS.map((s) => (
                <button
                  key={s}
                  className={`btn ${isRed(s) ? "red" : ""}`}
                  title={SUIT_NAME[s]}
                  onClick={() => act({ type: "chooseTrump", suit: s })}
                >
                  {SUIT_SYMBOL[s]}
                </button>
              ))}
            </div>
          )}

          <div className="my-hand">
            {r.hand.map((c) => {
              const playable = myTurn && r.phase === "playing" && legal.has(c);
              return (
                <button
                  key={c}
                  className={`hand-card ${playable ? "playable" : ""} ${myTurn && r.phase === "playing" && !playable ? "dim" : ""}`}
                  disabled={!playable}
                  onClick={() => act({ type: "play", card: c })}
                >
                  <CardFace card={c} />
                </button>
              );
            })}
          </div>
          {nameplate(me)}
        </div>

        <div className="log" aria-label="Game log">
          {r.log
            .slice()
            .reverse()
            .map((l, i) => (
              <div key={i}>
                {l.seat !== null && <b>{name(l.seat)} </b>}
                {l.text}
              </div>
            ))}
        </div>

        {r.phase === "done" && r.result && !holding && (
          <div className="overlay">
            <div className="result-card">
              <h2>Round {r.number} over</h2>
              <p className="hint" style={{ fontSize: 15 }}>
                Team {r.result.bidderTeam} ({name(r.result.bidder)}) bid {r.result.bid}
                {r.result.target !== r.result.bid ? `, target ${r.result.target} after marriage` : ""}
                {r.result.multiplier === 4 ? " · redoubled" : r.result.multiplier === 2 ? " · doubled" : ""}
              </p>
              <div className={`big ${r.result.bidderTeam === "A" ? "ta" : "tb"}`}>
                {r.result.bidderPoints} / {r.result.target}
              </div>
              <p style={{ fontSize: 18, fontWeight: 700 }}>
                {r.result.made ? "Made it! " : "Went down. "}
                Team {r.result.bidderTeam} {r.result.made ? "+" : "−"}
                {r.result.multiplier}
              </p>
              <p className="stat-value" style={{ justifyContent: "center" }}>
                <span className="ta">A {game.score.A}</span>
                <span className="tb">B {game.score.B}</span>
              </p>
              <button className="btn primary block" onClick={() => act({ type: "nextRound" })}>
                Next round
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
