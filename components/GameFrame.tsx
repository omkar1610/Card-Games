"use client";

// Shared screen frame for games that don't use the 4-seat card-table layout (Ludo, Uno, …):
// top strip with Settings, a row of players (avatar, turn ring, a line of info), the game's own
// board in the middle, a status bar, and the win screen. Also plays the common sounds.
import { ReactNode, useEffect, useRef } from "react";
import type { RoomView } from "@/lib/rooms";
import type { GameId } from "@/lib/games/catalog";
import { gameName } from "@/lib/games/catalog";
import { displayName } from "@/lib/names";
import { sfx } from "@/lib/sound";
import Settings from "./Settings";

export interface FramePlayer {
  seat: number;
  sub?: ReactNode; // e.g. "5 cards", "at 42"
  colour?: string; // ring / avatar colour (Ludo colours, X/O)
  tag?: string; // short label shown in the avatar instead of initials
}

export interface FrameResult {
  winners: number[]; // seats; several = tie; empty = draw
  detail?: ReactNode;
}

interface Props {
  view: RoomView;
  gameId: GameId;
  players: FramePlayer[];
  turn: number[]; // seats whose move it is
  status: { text: string; mine: boolean };
  result: FrameResult | null;
  onPlayAgain: () => void;
  send: (body: unknown) => Promise<void>;
  error: string;
  scoreLine?: ReactNode; // small line under the players, e.g. "Wins: Omkar 2 · Ravi 1"
  footer?: ReactNode; // buttons under the status (Roll, Draw, …)
  children: ReactNode;
}

export default function GameFrame(p: Props) {
  const { view, gameId, players, turn, status, result } = p;
  const me = view.mySeat!;
  const nameOf = (seat: number) => (seat === me ? "You" : displayName(view.names[seat]));
  const initials = (seat: number) => {
    const u = view.names[seat] ?? "?";
    return u.startsWith("bot:") ? "🤖" : u.slice(0, 2).toUpperCase();
  };

  // Sounds: chime when it becomes my turn; fanfare / sad notes when the game ends.
  const myTurn = turn.includes(me) && !result;
  const prev = useRef<{ myTurn: boolean; over: boolean } | null>(null);
  useEffect(() => {
    const was = prev.current;
    prev.current = { myTurn, over: !!result };
    if (!was) return;
    if (myTurn && !was.myTurn) sfx.turn();
    if (result && !was.over) {
      const won = result.winners.includes(me);
      setTimeout(won ? sfx.gameWon : result.winners.length === 1 ? sfx.gameLost : sfx.roundWon, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.version]);
  useEffect(() => {
    if (p.error) sfx.error();
  }, [p.error]);

  async function endGame() {
    if (!confirm("End this game for everyone? The room will close.")) return;
    await p.send({ op: "end" });
  }

  const winnerText = !result
    ? ""
    : result.winners.length === 0
      ? "It's a draw!"
      : result.winners.length > 1
        ? `Tie: ${result.winners.map(nameOf).join(" & ")}`
        : result.winners[0] === me
          ? "You win!"
          : `${nameOf(result.winners[0])} wins!`;

  return (
    <div className={`game frame game-${gameId}`}>
      <header className="topbar">
        <div className="room-strip">
          <span>
            {gameName(gameId)} · Room {view.code}
          </span>
          <Settings onEndGame={endGame} gameId={gameId} />
        </div>
        <div className="frame-players">
          {players.map((pl) => (
            <div key={pl.seat} className={`frame-player ${turn.includes(pl.seat) && !result ? "turn" : ""} ${pl.seat === me ? "me" : ""}`}>
              <span className="avatar" style={{ background: pl.colour ?? "var(--team-a-fill)", color: "#fff" }}>
                {pl.tag ?? initials(pl.seat)}
              </span>
              <span className="fp-name">{pl.seat === me ? view.meName : (view.names[pl.seat] ?? "?").replace(/^bot:/, "")}</span>
              {pl.sub !== undefined && <span className="fp-sub">{pl.sub}</span>}
            </div>
          ))}
        </div>
        {p.scoreLine && <div className="frame-score">{p.scoreLine}</div>}
      </header>

      <section className="frame-board">{p.children}</section>

      <footer className="frame-footer">
        <div className="action-bar">
          <div className={`status-text ${status.mine ? "mine" : ""}`}>{status.text}</div>
          {p.error && (
            <span className="error" style={{ margin: 0 }}>
              {p.error}
            </span>
          )}
        </div>
        {p.footer}
      </footer>

      {result && (
        <div className="overlay">
          <div className="result-card">
            <div className="game-over" style={{ borderTop: "none", marginTop: 0, paddingTop: 0 }}>
              {result.winners.includes(me) && (
                <div className="petals" aria-hidden>
                  {Array.from({ length: 18 }, (_, i) => (
                    <span
                      key={i}
                      className="petal"
                      style={{ "--x": `${(i * 37) % 100}%`, "--d": `${(i % 6) * 0.35}s`, "--t": `${3 + (i % 4) * 0.6}s`, "--r": `${(i * 53) % 360}deg` } as React.CSSProperties}
                    />
                  ))}
                </div>
              )}
              <div className="divider-motif" aria-hidden>
                <span />◆<span />
              </div>
              <div className="winner-banner">{winnerText}</div>
              {result.detail && <div className="hint" style={{ margin: "6px 0 12px" }}>{result.detail}</div>}
              <button className="btn primary block" onClick={p.onPlayAgain}>
                Play again
              </button>
              <button className="btn block" style={{ marginTop: 8 }} onClick={endGame}>
                End game
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
