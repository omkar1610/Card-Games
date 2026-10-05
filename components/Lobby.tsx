"use client";

import { useState } from "react";
import Link from "next/link";
import type { RoomView } from "@/lib/rooms";
import { displayName } from "@/lib/names";
import { gameInfo, playersText } from "@/lib/games/catalog";

// Team games: 29 goes anticlockwise (seat 1 on the right); Bridge clockwise (seat 1 on the left).
// Partners always sit opposite.
const POS: Record<string, string[]> = {
  "29": ["seat-s", "seat-e", "seat-n", "seat-w"],
  bridge: ["seat-s", "seat-w", "seat-n", "seat-e"],
};

export default function Lobby({ view, send, error }: { view: RoomView; send: (b: unknown) => Promise<void>; error: string }) {
  const [copied, setCopied] = useState(false);
  const info = gameInfo(view.gameId);
  const seated = view.seats.filter(Boolean).length;
  const canStart = info.teams ? seated === view.seats.length : seated >= info.minPlayers;
  const canManage = view.mySeat !== null;

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const seatControls = (user: string | null, seat: number) => {
    const mine = user === view.me;
    const bot = !!user && user.startsWith("bot:");
    return (
      <>
        {user ? (
          <strong>{displayName(view.names[seat]) + (mine ? " (you)" : "")}</strong>
        ) : (
          <button className="seat-action" onClick={() => send({ op: "sit", seat })}>
            Sit here
          </button>
        )}
        {!user && canManage && (
          <button className="seat-pill" onClick={() => send({ op: "addBot", seat })}>
            + Add bot
          </button>
        )}
        {bot && canManage && (
          <button className="seat-pill remove" onClick={() => send({ op: "removeBot", seat })}>
            ✕ Remove bot
          </button>
        )}
        {user === view.host && <span className="team-label">host</span>}
      </>
    );
  };

  return (
    <main className="center-page">
      <div className="panel lobby">
        <div className="home-header">
          <Link href="/home" className="btn small" style={{ textDecoration: "none" }}>
            ← Home
          </Link>
          <button className="btn small" onClick={copyLink}>
            {copied ? "Copied!" : "Copy invite link"}
          </button>
        </div>
        <p className="hint" style={{ margin: 0 }}>
          Room code
        </p>
        <div className="room-code">{view.code}</div>
        <p className="lobby-game">
          {info.name} · {playersText(info)}
        </p>
        <p className="hint">
          Tap a seat to sit there, or fill it with a bot.{info.teams ? " Partners sit opposite each other." : ""}
        </p>
        {error && <p className="error">{error}</p>}

        {info.teams ? (
          <div className="seat-grid">
            {view.seats.map((user, seat) => {
              const team = seat % 2 === 0 ? "A" : "B";
              return (
                <div
                  key={seat}
                  className={`seat-slot ${(POS[view.gameId] ?? POS["29"])[seat]} team-${team} ${user ? "filled" : "empty"} ${user === view.me ? "me" : ""}`}
                >
                  <span className="team-label">Team {team}</span>
                  {seatControls(user, seat)}
                </div>
              );
            })}
            <div className="seat-table">table</div>
          </div>
        ) : (
          <div className="seat-list">
            {view.seats.map((user, seat) => (
              <div
                key={seat}
                className={`seat-slot seat-row ${user ? "filled" : "empty"} ${user === view.me ? "me" : ""} ${seat >= info.minPlayers ? "optional" : ""}`}
              >
                <span className="team-label">
                  {info.seatLabels?.[seat] ?? `Player ${seat + 1}`}
                  {seat >= info.minPlayers ? " · optional" : ""}
                </span>
                {seatControls(user, seat)}
              </div>
            ))}
          </div>
        )}

        {canManage ? (
          <>
            <button className="btn primary block" disabled={!canStart} onClick={() => send({ op: "start" })}>
              {canStart
                ? info.teams || seated === info.maxPlayers
                  ? "Start game"
                  : `Start with ${seated} players`
                : `Waiting for players (${seated}/${info.teams ? view.seats.length : `${info.minPlayers}+`})`}
            </button>
            <button
              className="btn block"
              onClick={async () => {
                await send({ op: "leave" });
                window.location.href = "/home";
              }}
              style={{ marginTop: 8 }}
            >
              Leave room
            </button>
          </>
        ) : (
          <p className="hint">Tap an empty seat to join.</p>
        )}
      </div>
    </main>
  );
}
