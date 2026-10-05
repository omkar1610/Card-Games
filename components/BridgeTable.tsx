"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomView } from "@/lib/rooms";
import type { Team } from "@/lib/engine/game";
import { SUIT_SYMBOL, Suit, rankOf, suitOf } from "@/lib/engine/cards";
import { BAction, BView, Call, STRAINS, STRAIN_SYMBOL, Strain, callText, contractText } from "@/lib/games/bridge/engine";
import { CardBack, CardFace } from "./Card";
import Settings from "./Settings";
import { displayName } from "@/lib/names";
import { sfx } from "@/lib/sound";

type Dir = "s" | "e" | "n" | "w";
// Bridge goes clockwise: the next player sits on my left (west on screen).
const DIRS: Dir[] = ["s", "w", "n", "e"];
const TRICK_SHOW_MS = 800;
const TRICK_COLLECT_MS = 450;
const DEAL_STEP_MS = 28;
const DEAL_TO: Record<Dir, [string, string]> = { s: ["0px", "260px"], n: ["0px", "-230px"], e: ["170px", "0px"], w: ["-170px", "0px"] };
const DEAL_FROM: Record<Dir, [string, string]> = { s: ["0px", "90px"], n: ["0px", "-80px"], e: ["60px", "0px"], w: ["-60px", "0px"] };

const teamOf = (seat: number): Team => (seat % 2 === 0 ? "A" : "B");
const red = (s: string) => s === "H" || s === "D";

interface Props {
  view: RoomView;
  game: BView;
  act: (a: BAction) => Promise<void>;
  send: (body: unknown) => Promise<void>;
  error: string;
}

export default function BridgeTable({ view, game, act, send, error }: Props) {
  const r = game.round;
  const me = game.mySeat;
  const dirOf = (seat: number) => DIRS[(seat - me + 4) % 4];
  const seatAt = (d: Dir) => (me + DIRS.indexOf(d)) % 4;
  const name = (seat: number | null) => (seat === null ? "" : seat === me ? "You" : displayName(view.names[seat]));
  const teamNames = (t: Team) =>
    [0, 1, 2, 3]
      .filter((s) => teamOf(s) === t)
      .map((s) => displayName(view.names[s]))
      .join(" & ");
  const c = r.contract;
  const declarer = c?.declarer ?? null;

  // ---- finished trick: show it, then slide it to the winner
  const tricksLen = r.tricks.length;
  const trickKey = `${game.deal}:${tricksLen}:${r.dealer}`;
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

  // ---- deal animation when 13 new cards arrive
  const handSig = r.hand.join(",");
  const [knownHand, setKnownHand] = useState(r.hand);
  const [deal, setDeal] = useState<{ id: number; fresh: string[] } | null>(null);
  if (handSig !== knownHand.join(",")) {
    const fresh = r.hand.filter((x) => !knownHand.includes(x));
    setKnownHand(r.hand);
    if (fresh.length >= 13) setDeal({ id: (deal?.id ?? 0) + 1, fresh });
  }
  useEffect(() => {
    if (!deal) return;
    for (let i = 0; i < 52; i += 2) sfx.deal((i * DEAL_STEP_MS) / 1000);
    const t = setTimeout(() => setDeal(null), 52 * DEAL_STEP_MS + 700);
    return () => clearTimeout(t);
  }, [deal]);
  const myDealOffset = (me - r.dealer - 1 + 8) % 4;

  // ---- my card goes down immediately
  const [pending, setPending] = useState<string | null>(null);
  async function playCard(card: string) {
    sfx.card();
    setPending(card);
    await act({ type: "play", card });
    setPending(null);
  }

  // ---- bidding box: pick a level, then a strain
  const [level, setLevel] = useState<number | null>(null);
  const lc = r.legalCalls;
  const myCallTurn = r.phase === "auction" && r.turn === me;
  const bidOk = (lv: number, st: Strain) =>
    !!lc.minBid && (lv - 1) * 5 + STRAINS.indexOf(st) >= (lc.minBid.level - 1) * 5 + STRAINS.indexOf(lc.minBid.strain);
  async function call(cl: Call) {
    setLevel(null);
    await act({ type: "call", call: cl });
  }

  const lastTrick = tricksLen ? r.tricks[tricksLen - 1] : null;
  const showLast = holding && r.trick.length === 0 && lastTrick !== null && !pending;
  const playingFor = pending ? null : r.playingFor;
  const shownTrick = pending
    ? [...r.trick, { seat: r.playingFor ?? me, card: pending }]
    : showLast
      ? lastTrick!.cards
      : r.trick;
  const legal = new Set(r.legalCards);
  const iAmDummy = r.dummy === me && r.phase === "play";

  const lastCall = (seat: number) => {
    for (let i = r.calls.length - 1; i >= 0; i--) if (r.calls[i].seat === seat) return r.calls[i].call;
    return undefined;
  };
  const isTurn = (seat: number) =>
    (r.phase === "auction" && r.turn === seat) || (r.phase === "play" && r.turn === seat && !showLast);

  function status(): { text: string; mine: boolean } {
    if (r.phase === "auction") return myCallTurn ? { text: "Your call", mine: true } : { text: `${name(r.turn)} to call…`, mine: false };
    if (r.phase === "play") {
      if (showLast && playingFor === null) return { text: `${name(lastTrick!.winner)} won the trick`, mine: false };
      if (playingFor === me) return { text: "Your turn", mine: true };
      if (playingFor !== null) return { text: "Play from dummy", mine: true };
      if (iAmDummy) return { text: `You're dummy · ${name(declarer)} plays your cards`, mine: false };
      return { text: `${name(r.turn === r.dummy ? declarer : r.turn)} to play${r.turn === r.dummy ? " from dummy" : ""}…`, mine: false };
    }
    return { text: "Deal over", mine: false };
  }
  const st = status();

  // ---- sounds
  const prev = useRef<{ cards: number; tricks: number; log: string[]; mine: boolean; winner: string | null } | null>(null);
  const cardsOnTable = r.tricks.length * 4 + r.trick.length;
  const logKeys = r.log.map((l) => `${l.seat}|${l.text}`);
  const iMustAct = myCallTurn || r.playingFor !== null;
  useEffect(() => {
    const p = prev.current;
    prev.current = { cards: cardsOnTable, tricks: tricksLen, log: logKeys, mine: iMustAct, winner: String(game.winner) };
    if (!p) return;
    const later = (fn: () => void, ms: number) => setTimeout(fn, ms);
    if (cardsOnTable > p.cards && cardsOnTable - p.cards <= 4) {
      const played = [...r.tricks.flatMap((t) => t.cards), ...r.trick].slice(p.cards);
      played.filter((x) => x.seat !== r.playingFor && x.seat !== me).forEach((_, i) => later(sfx.card, i * 140));
    }
    if (tricksLen > p.tricks) later(sfx.collect, TRICK_SHOW_MS);
    let same = 0;
    while (same < p.log.length && same < logKeys.length && p.log[same] === logKeys[same]) same++;
    for (const l of r.log.slice(same)) {
      const t = l.text;
      if (t.startsWith("bid ")) sfx.bid();
      else if (t === "passed") sfx.pass();
      else if (t === "doubled!" || t === "redoubled!") sfx.double();
      else if (t.startsWith("declares")) later(sfx.reveal, 150);
      else if ((t.startsWith("made") || t.startsWith("went down")) && !game.winner) {
        const ours = l.seat !== null && teamOf(l.seat) === teamOf(me);
        later(t.startsWith("made") === ours ? sfx.roundWon : sfx.roundLost, TRICK_SHOW_MS + 300);
      }
    }
    if (game.winner && String(game.winner) !== p.winner)
      later(game.winner === teamOf(me) ? sfx.gameWon : game.winner === "tie" ? sfx.roundWon : sfx.gameLost, TRICK_SHOW_MS + 300);
    if (iMustAct && !p.mine) later(sfx.turn, tricksLen > p.tricks ? TRICK_SHOW_MS + TRICK_COLLECT_MS : 0);
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
  const roleChips = (seat: number) => (
    <>
      {seat === r.dealer && <span className="chip dealer" title="Dealer">D</span>}
      {seat === declarer && <span className="chip">Declarer</span>}
      {seat === r.dummy && r.phase !== "auction" && <span className="chip dealer">Dummy</span>}
    </>
  );
  const callBubble = (seat: number) => {
    if (r.phase !== "auction") return null;
    const cl = lastCall(seat);
    if (!cl) return null;
    return (
      <div className={`bubble ${cl.type === "pass" ? "pass" : cl.type === "bid" ? "" : "dbl"}`}>{callText(cl)}</div>
    );
  };
  const vulText = r.vulnerable.A && r.vulnerable.B ? "Both" : r.vulnerable.A ? "Team A" : r.vulnerable.B ? "Team B" : "None";

  // Dummy's hand, grouped by suit; tappable when I'm declarer and it's dummy's turn.
  const dummyRows =
    r.dummyHand &&
    (["S", "H", "C", "D"] as Suit[]).map((s) => ({ s, cards: r.dummyHand!.filter((x) => suitOf(x) === s && x !== pending) }));

  return (
    <div className="game bridge">
      <header className="topbar">
        <div className="room-strip">
          <span>Bridge · Room {view.code}</span>
          <span className="ta">A: {teamNames("A")}</span>
          <span className="tb">B: {teamNames("B")}</span>
          <Settings onEndGame={endGame} gameId="bridge" />
        </div>

        <div className="stats-row">
          <div className="stat">
            <span className="stat-label">
              Chicago · deal {game.deal}/{game.dealsPerChicago}
            </span>
            <span className="stat-value">
              <span className="ta">A {game.score.A}</span>
              <span className="tb">B {game.score.B}</span>
            </span>
            {game.gamesWon.A + game.gamesWon.B > 0 && (
              <span className="stat-sub">
                Won {game.gamesWon.A}–{game.gamesWon.B}
              </span>
            )}
          </div>
          <div className="stat grow">
            <span className="stat-label">Contract {declarer !== null ? `· ${name(declarer)}` : ""}</span>
            <span className="stat-value">
              <span className={declarer !== null ? (teamOf(declarer) === "A" ? "ta" : "tb") : ""}>
                {c ? contractText(c) : "–"}
              </span>
              {c && <span className="stat-sub">needs {6 + c.level}</span>}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Tricks</span>
            <span className="stat-value">
              <span className="ta">A {r.won.A}</span>
              <span className="tb">B {r.won.B}</span>
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Vul</span>
            <span className="stat-value" style={{ fontSize: 13 }}>
              {vulText}
            </span>
          </div>
        </div>

        <div className="stats-row">
          <div className="stat grow">
            <span className="stat-label">
              Last trick {lastTrick ? `· ${name(lastTrick.winner)}` : ""}
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

      <section className="felt">
        {(["n", "w", "e"] as Dir[]).map((d) => {
          const seat = seatAt(d);
          return (
            <div key={d} className={`player ${d === "n" ? "north" : d === "w" ? "west" : "east"}`}>
              <div className={`seat-badge team-${teamOf(seat)} ${isTurn(seat) ? "turn" : ""}`}>
                <span className={`avatar team-${teamOf(seat)}`}>{initials(seat)}</span>
                <span className="pname">{(view.names[seat] ?? "?").replace(/^bot:/, "")}</span>
                <span className="pchips">{roleChips(seat)}</span>
              </div>
              {callBubble(seat)}
            </div>
          );
        })}

        <div className="trick-area">
          {dummyRows && (
            <div className={`dummy-band ${playingFor === r.dummy ? "active" : ""}`}>
              <div className="dummy-label">
                Dummy · {r.dummy === me ? "you" : name(r.dummy)} ({dirOf(r.dummy!) === "n" ? "partner" : dirOf(r.dummy!) === "w" ? "left" : dirOf(r.dummy!) === "e" ? "right" : "you"})
              </div>
              {dummyRows.map(({ s, cards }) => (
                <div key={s} className="dummy-row">
                  <span className={`dummy-suit ${red(s) ? "red" : ""}`}>{SUIT_SYMBOL[s]}</span>
                  {cards.length === 0 && <span className="dummy-void">—</span>}
                  {cards.map((x) => {
                    const ok = playingFor === r.dummy && legal.has(x);
                    return (
                      <button key={x} className={`dummy-card ${ok ? "playable" : ""}`} disabled={!ok} onClick={() => playCard(x)}>
                        {rankOf(x)}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
          {deal && (
            <div className="deal-layer" key={deal.id} aria-hidden>
              {Array.from({ length: 52 }, (_, i) => {
                const to = DEAL_TO[dirOf((r.dealer + 1 + i) % 4)];
                const from = DEAL_FROM[dirOf(r.dealer)];
                const style = { "--sx": from[0], "--sy": from[1], "--tx": to[0], "--ty": to[1], "--d": `${i * DEAL_STEP_MS}ms` } as React.CSSProperties;
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
              <div key={p.card} className={`trick-card ${dirOf(p.seat)} ${showLast && p.seat === lastTrick!.winner ? "winner" : ""}`}>
                <CardFace card={p.card} />
              </div>
            ))}
          </div>
          {r.phase === "auction" && (
            <div className="feed">
              <div className="headline">
                Auction · {vulText === "None" ? "nobody" : vulText === "Both" ? "both sides" : vulText} vulnerable
              </div>
              <div className="lines">
                {r.calls.slice(-5).map((x, i) => (
                  <div key={`${r.calls.length}-${i}`}>
                    <b>{name(x.seat)} </b>
                    {callText(x.call)}
                  </div>
                ))}
                {r.calls.length === 0 && <div>{name(r.dealer)} deals and calls first</div>}
              </div>
            </div>
          )}
        </div>

        <div className="south">
          <div className="action-bar">
            <div className={`status-text ${st.mine ? "mine" : ""}`}>{st.text}</div>
            {callBubble(me)}
            {error && (
              <span className="error" style={{ margin: 0 }}>
                {error}
              </span>
            )}
          </div>

          {myCallTurn && (
            <div className="bidding-box">
              <div className="bb-levels">
                {[1, 2, 3, 4, 5, 6, 7].map((lv) => (
                  <button
                    key={lv}
                    className={`btn ${level === lv ? "primary" : ""}`}
                    disabled={!STRAINS.some((s) => bidOk(lv, s))}
                    onClick={() => setLevel(level === lv ? null : lv)}
                  >
                    {lv}
                  </button>
                ))}
              </div>
              {level !== null && (
                <div className="bb-strains">
                  {STRAINS.map((s) => (
                    <button
                      key={s}
                      className={`btn bb-strain ${red(s) ? "red" : ""}`}
                      disabled={!bidOk(level, s)}
                      onClick={() => call({ type: "bid", level, strain: s })}
                    >
                      {level}
                      {STRAIN_SYMBOL[s]}
                    </button>
                  ))}
                </div>
              )}
              <div className="bb-calls">
                <button className="btn" onClick={() => call({ type: "pass" })}>
                  Pass
                </button>
                {lc.canDouble && (
                  <button className="btn danger" onClick={() => call({ type: "double" })}>
                    Double
                  </button>
                )}
                {lc.canRedouble && (
                  <button className="btn danger" onClick={() => call({ type: "redouble" })}>
                    Redouble
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="my-hand">
            {r.hand
              .filter((x) => x !== pending)
              .map((x) => {
                const playable = playingFor === me && legal.has(x);
                const k = deal ? deal.fresh.indexOf(x) : -1;
                const dealStyle =
                  k >= 0 ? ({ "--d": `${(myDealOffset + 4 * k) * DEAL_STEP_MS + 300}ms` } as React.CSSProperties) : undefined;
                return (
                  <button
                    key={x}
                    style={dealStyle}
                    className={`hand-card ${playable ? "playable" : ""} ${playingFor === me && !playable ? "dim" : ""} ${k >= 0 ? "deal-in" : ""}`}
                    disabled={!playable}
                    onClick={() => playCard(x)}
                  >
                    <CardFace card={x} />
                  </button>
                );
              })}
          </div>
          <div className={`nameplate me team-${teamOf(me)} ${isTurn(me) && !iAmDummy ? "turn" : ""}`}>
            <span className={`avatar small team-${teamOf(me)}`}>{initials(me)}</span>
            <span>
              {view.meName} · Team {teamOf(me)}
            </span>
            {roleChips(me)}
          </div>
        </div>

        {r.phase === "done" && r.result && !holding && (
          <div className="overlay">
            <div className="result-card">
              <h2>
                Deal {r.result.deal} of {game.dealsPerChicago}
              </h2>
              <p className="hint" style={{ fontSize: 15 }}>
                {contractText(r.result.contract)} by {name(r.result.contract.declarer)} (Team {r.result.declarerTeam}) ·{" "}
                {r.result.tricks} tricks
              </p>
              <div className={`big ${r.result.made ? (r.result.declarerTeam === "A" ? "ta" : "tb") : r.result.declarerTeam === "A" ? "tb" : "ta"}`}>
                {r.result.made ? (r.result.overUnder > 0 ? `Made +${r.result.overUnder}` : "Made") : `Down ${-r.result.overUnder}`}
              </div>
              <div className="breakdown">
                {r.result.breakdown.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
                <div className="breakdown-total">
                  Team {r.result.pointsTo.A > 0 ? "A" : "B"} +{r.result.points}
                </div>
              </div>
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
                        style={{ "--x": `${(i * 37) % 100}%`, "--d": `${(i % 6) * 0.35}s`, "--t": `${3 + (i % 4) * 0.6}s`, "--r": `${(i * 53) % 360}deg` } as React.CSSProperties}
                      />
                    ))}
                  </div>
                  <div className="divider-motif" aria-hidden>
                    <span />◆<span />
                  </div>
                  <div className={`winner-banner ${game.winner === "A" ? "ta" : game.winner === "B" ? "tb" : ""}`}>
                    {game.winner === "tie" ? "It's a tie!" : `Team ${game.winner} wins the Chicago!`}
                  </div>
                  {game.winner !== "tie" && <p className="hint" style={{ margin: "0 0 10px" }}>{teamNames(game.winner)}</p>}
                  <button className="btn primary block" onClick={() => act({ type: "playAgain" })}>
                    Play again
                  </button>
                  <button className="btn block" style={{ marginTop: 8 }} onClick={endGame}>
                    End game
                  </button>
                </div>
              ) : (
                <button className="btn primary block" onClick={() => act({ type: "nextDeal" })}>
                  Next deal
                </button>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
