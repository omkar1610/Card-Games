"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomView } from "@/lib/rooms";
import type { Action, PlayerView, Team } from "@/lib/engine/game";
import { trickWinner } from "@/lib/engine/game";
import { SUITS, SUIT_SYMBOL, SUIT_NAME, Suit } from "@/lib/engine/cards";
import { CardBack, CardFace } from "./Card";
import Settings from "./Settings";
import { displayName } from "@/lib/names";
import { sfx } from "@/lib/sound";

type Dir = "s" | "e" | "n" | "w";
const DIRS: Dir[] = ["s", "e", "n", "w"]; // relative to me, anticlockwise
const TRICK_SHOW_MS = 800; // finished hand stays in the middle…
const TRICK_COLLECT_MS = 450; // …then slides to whoever won it
const TOAST_MS = 3500;
const DEAL_STEP_MS = 70; // gap between cards flying out of the dealer's hand
// Where dealt cards fly to / start from, relative to the middle of the table.
const DEAL_TO: Record<Dir, [string, string]> = { s: ["0px", "260px"], n: ["0px", "-230px"], e: ["170px", "0px"], w: ["-170px", "0px"] };
const DEAL_FROM: Record<Dir, [string, string]> = { s: ["0px", "90px"], n: ["0px", "-80px"], e: ["60px", "0px"], w: ["-60px", "0px"] };

const teamOf = (seat: number): Team => (seat % 2 === 0 ? "A" : "B");
const isRed = (s: Suit | null) => s === "H" || s === "D";

interface Props {
  view: RoomView;
  game: PlayerView;
  act: (a: Action) => Promise<void>;
  send: (body: unknown) => Promise<void>;
  error: string;
}

export default function Table({ view, game, act, send, error }: Props) {
  const r = game.round!;
  const me = game.mySeat;
  const dirOf = (seat: number) => DIRS[(seat - me + 4) % 4];
  const seatAt = (d: Dir) => (me + DIRS.indexOf(d)) % 4;
  const name = (seat: number | null) => (seat === null ? "" : seat === me ? "You" : displayName(view.names[seat]));
  const teamNames = (t: Team) =>
    [0, 1, 2, 3]
      .filter((s) => teamOf(s) === t)
      .map((s) => displayName(view.names[s]))
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

  // ---- deal animation: whenever 4+ new cards land in my hand (first 4, then 4 more after trump),
  // cards fly from the dealer to everyone in dealing order. Not on page load.
  const handSig = r.hand.join(",");
  const [knownHand, setKnownHand] = useState(r.hand);
  const [deal, setDeal] = useState<{ id: number; fresh: string[] } | null>(null);
  if (handSig !== knownHand.join(",")) {
    const fresh = r.hand.filter((c) => !knownHand.includes(c));
    setKnownHand(r.hand);
    if (fresh.length >= 4) setDeal({ id: (deal?.id ?? 0) + 1, fresh });
  }
  useEffect(() => {
    if (!deal) return;
    for (let i = 0; i < 16; i++) sfx.deal((i * DEAL_STEP_MS) / 1000);
    const t = setTimeout(() => setDeal(null), 16 * DEAL_STEP_MS + 700);
    return () => clearTimeout(t);
  }, [deal]);
  const myDealOffset = (me - r.dealer - 1 + 8) % 4; // my position in the dealing order

  // My card goes on the table immediately; the server's reply replaces this a moment later.
  const [pending, setPending] = useState<string | null>(null);
  async function playCard(card: string) {
    sfx.card();
    setPending(card);
    await act({ type: "play", card });
    setPending(null);
  }

  const lastTrick = tricksLen ? r.tricks[tricksLen - 1] : null;
  const showLast = holding && r.trick.length === 0 && lastTrick !== null && !pending;
  const shownTrick = pending ? [...r.trick, { seat: me, card: pending }] : showLast ? lastTrick!.cards : r.trick;
  const deciding = r.phase === "double" || r.phase === "redouble";
  // Who's winning the trick so far (from the 2nd card). Trump only counts once revealed, as in the rules.
  const leadingSeat = shownTrick.length >= 2 ? trickWinner(shownTrick, r.trumpSuit, r.trumpRevealed) : null;
  const myTurn =
    !pending && r.turn === me && (r.phase === "bidding" || r.phase === "trump" || r.phase === "playing");
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
      return r.highBid
        ? `High bid ${r.highBid} · ${name(r.bidder)}${r.maxBid === 24 ? " · 25+ opens after a 24" : ""}`
        : "Bidding · opening bid 16–24";
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
      if (showLast && !myTurn)
        return { text: `${name(lastTrick!.winner)} won the hand (+${lastTrick!.points})`, mine: false };
      if (myTurn && r.mustTrump) return { text: "You asked for trump: play a trump", mine: true };
      return myTurn ? { text: "Your turn", mine: true } : { text: `${name(r.turn)}'s turn`, mine: false };
    }
    return { text: "Round over", mine: false };
  }
  const st = status();

  // ---- sound effects, driven by what changed since the last update (nothing plays on first load)
  const prev = useRef<{ cards: number; tricks: number; log: string[]; myTurn: boolean; winner: string | null } | null>(null);
  const cardsOnTable = r.tricks.length * 4 + r.trick.length;
  const logKeys = r.log.map((l) => `${l.seat}|${l.text}`);
  const iMustAct = myTurn || iDecide;
  useEffect(() => {
    const p = prev.current;
    prev.current = { cards: cardsOnTable, tricks: tricksLen, log: logKeys, myTurn: iMustAct, winner: game.winner };
    if (!p) return;
    let at = 0;
    const later = (fn: () => void, ms: number) => setTimeout(fn, ms);
    // Cards played by others (my own card already clicked when I tapped it).
    if (cardsOnTable > p.cards && cardsOnTable - p.cards <= 4) {
      const played = [...r.tricks.flatMap((t) => t.cards), ...r.trick].slice(p.cards);
      played.filter((c) => c.seat !== me).forEach((_, i) => later(sfx.card, i * 140));
      at = played.length * 140;
    }
    if (tricksLen > p.tricks) later(sfx.collect, TRICK_SHOW_MS);
    // New log entries: bids, passes, reveals, marriages, doubles, round results.
    let same = 0;
    while (same < p.log.length && same < logKeys.length && p.log[same] === logKeys[same]) same++;
    const fresh = r.log.slice(same);
    for (const l of fresh) {
      const t = l.text;
      if (t.startsWith("bid ")) later(sfx.bid, at);
      else if (t === "passed" || t === "no double" || t === "no redouble") later(sfx.pass, at);
      else if (t.includes("trump is")) later(sfx.reveal, at);
      else if (t.includes("marriage")) later(sfx.marriage, at);
      else if (t === "doubled!" || t === "redoubled!") later(sfx.double, at);
      else if ((t.startsWith("made the bid") || t.startsWith("went down")) && !game.winner) {
        const bidderMine = l.seat !== null && teamOf(l.seat) === teamOf(me);
        const good = t.startsWith("made") === bidderMine;
        later(good ? sfx.roundWon : sfx.roundLost, TRICK_SHOW_MS + 300);
      }
    }
    if (game.winner && !p.winner) later(game.winner === teamOf(me) ? sfx.gameWon : sfx.gameLost, TRICK_SHOW_MS + 300);
    if (iMustAct && !p.myTurn) later(sfx.turn, Math.max(at, tricksLen > p.tricks ? TRICK_SHOW_MS + TRICK_COLLECT_MS : 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.version]);
  useEffect(() => {
    if (error) sfx.error();
  }, [error]);

  async function endGame() {
    if (!confirm("End this game for everyone? The room will close.")) return;
    await send({ op: "end" });
  }

  const initials = (seat: number) => {
    const u = view.names[seat] ?? "?";
    return u.startsWith("bot:") ? "🤖" : u.slice(0, 2).toUpperCase();
  };
  const chips = (seat: number) => (
    <>
      {seat === r.dealer && <span className="chip dealer" title="Dealer">D</span>}
      {seat === r.bidder && r.phase !== "bidding" && <span className="chip" title="Bidder">{r.highBid}</span>}
    </>
  );
  // Other players: avatar circle (glowing ring on their turn) with name and chips underneath.
  // Me: one compact row, to leave room for the hand.
  const nameplate = (seat: number) =>
    seat === me ? (
      <div className={`nameplate me team-${teamOf(seat)} ${isTurn(seat) ? "turn" : ""}`}>
        <span className={`avatar small team-${teamOf(seat)}`}>{initials(seat)}</span>
        <span>
          {view.meName} · Team {teamOf(seat)}
        </span>
        {chips(seat)}
      </div>
    ) : (
      <div className={`seat-badge team-${teamOf(seat)} ${isTurn(seat) ? "turn" : ""}`}>
        <span className={`avatar team-${teamOf(seat)}`}>{initials(seat)}</span>
        <span className="pname">{(view.names[seat] ?? "?").replace(/^bot:/, "")}</span>
        <span className="pchips">{chips(seat)}</span>
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
          <Settings onEndGame={endGame} gameId="29" />
        </div>

        <div className="stats-row">
          <div className="stat">
            <span className="stat-label">Game · to ±6</span>
            <span className="stat-value">
              <span className="ta">A {game.score.A}</span>
              <span className="tb">B {game.score.B}</span>
            </span>
            {game.gamesWon.A + game.gamesWon.B > 0 && (
              <span className="stat-sub">
                Games won {game.gamesWon.A}–{game.gamesWon.B}
              </span>
            )}
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
              {/* Face down until revealed, then flips over to show the suit. */}
              <span className={`flip ${r.trumpRevealed ? "up" : ""}`} aria-label={r.trumpRevealed ? `Trump ${r.trumpSuit}` : "Trump hidden"}>
                <span className="flip-inner">
                  <span className="flip-face flip-back" />
                  <span className={`flip-face flip-front ${isRed(r.trumpSuit) ? "red" : ""}`}>
                    {r.trumpRevealed && r.trumpSuit ? SUIT_SYMBOL[r.trumpSuit] : ""}
                  </span>
                </span>
              </span>
              <span className="stat-sub">
                {r.trumpRevealed ? (
                  name(r.revealedBy)
                ) : r.trumpSuit ? (
                  <>
                    <span className={`trump-peek ${isRed(r.trumpSuit) ? "red" : ""}`}>{SUIT_SYMBOL[r.trumpSuit]}</span> only you
                  </>
                ) : (
                  ""
                )}
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
          {deal && (
            <div className="deal-layer" key={deal.id} aria-hidden>
              {Array.from({ length: 16 }, (_, i) => {
                const to = DEAL_TO[dirOf((r.dealer + 1 + i) % 4)];
                const from = DEAL_FROM[dirOf(r.dealer)];
                const style = {
                  "--sx": from[0],
                  "--sy": from[1],
                  "--tx": to[0],
                  "--ty": to[1],
                  "--d": `${i * DEAL_STEP_MS}ms`,
                } as React.CSSProperties;
                return (
                  <div key={i} className="deal-card" style={style}>
                    <CardBack />
                  </div>
                );
              })}
            </div>
          )}
          <div className={`collect ${showLast && held?.collecting ? `to-${dirOf(lastTrick!.winner)}` : ""}`}>
            {shownTrick.map((p) => (
              <div
                key={p.card}
                className={`trick-card ${dirOf(p.seat)} ${showLast && p.seat === lastTrick!.winner ? "winner" : !showLast && p.seat === leadingSeat ? "leading" : ""}`}
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
              {Array.from({ length: Math.max(0, r.maxBid - r.minBid + 1) }, (_, i) => r.minBid + i).map((v) => (
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
            {r.hand.filter((c) => c !== pending).map((c) => {
              const playable = myTurn && r.phase === "playing" && legal.has(c);
              const k = deal ? deal.fresh.indexOf(c) : -1;
              const dealStyle =
                k >= 0 ? ({ "--d": `${(myDealOffset + 4 * k) * DEAL_STEP_MS + 300}ms` } as React.CSSProperties) : undefined;
              return (
                <button
                  key={c}
                  style={dealStyle}
                  className={`hand-card ${playable ? "playable" : ""} ${myTurn && r.phase === "playing" && !playable ? "dim" : ""} ${k >= 0 ? "deal-in" : ""}`}
                  disabled={!playable}
                  onClick={() => playCard(c)}
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
              {r.result.handsPlayed < 8 && (
                <p className="hint" style={{ margin: 0 }}>
                  Decided after {r.result.handsPlayed} of 8 hands
                </p>
              )}
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
              {game.winner ? (
                <div className="game-over">
                  <div className="petals" aria-hidden>
                    {Array.from({ length: 18 }, (_, i) => (
                      <span
                        key={i}
                        className="petal"
                        style={
                          {
                            "--x": `${(i * 37) % 100}%`,
                            "--d": `${(i % 6) * 0.35}s`,
                            "--t": `${3 + (i % 4) * 0.6}s`,
                            "--r": `${(i * 53) % 360}deg`,
                          } as React.CSSProperties
                        }
                      />
                    ))}
                  </div>
                  <div className="divider-motif" aria-hidden>
                    <span />◆<span />
                  </div>
                  <div className={`winner-banner ${game.winner === "A" ? "ta" : "tb"}`}>
                    Team {game.winner} wins the game!
                  </div>
                  <p className="hint" style={{ margin: "0 0 10px" }}>
                    {teamNames(game.winner)}
                    {game.gamesWon.A + game.gamesWon.B > 1 &&
                      ` · games won A ${game.gamesWon.A} – B ${game.gamesWon.B}`}
                  </p>
                  <button className="btn primary block" onClick={() => act({ type: "playAgain" })}>
                    Play again
                  </button>
                  <button className="btn block" style={{ marginTop: 8 }} onClick={endGame}>
                    End game
                  </button>
                </div>
              ) : (
                <button className="btn primary block" onClick={() => act({ type: "nextRound" })}>
                  Next round
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
