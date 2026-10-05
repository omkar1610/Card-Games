"use client";

import { useState } from "react";
import Link from "next/link";
import type { RoomView } from "@/lib/rooms";
import { displayName } from "@/lib/names";
import { gameName } from "@/lib/games/catalog";

// 29 goes anticlockwise (seat 1 on the right); Bridge goes clockwise (seat 1 on the left).
// Partners always sit opposite.
const POS: Record<string, string[]> = {
  "29": ["seat-s", "seat-e", "seat-n", "seat-w"],
  bridge: ["seat-s", "seat-w", "seat-n", "seat-e"],
};

export default function Lobby({ view, send, error }: { view: RoomView; send: (b: unknown) => Promise<void>; error: string }) {
  const [copied, setCopied] = useState(false);
  const full = view.seats.every(Boolean);

  function copyLink() {
    navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

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
        <p className="lobby-game">{gameName(view.gameId)}</p>
        <p className="hint">Tap a seat to sit there, or fill it with a bot. Partners sit opposite each other.</p>
        {error && <p className="error">{error}</p>}

        <div className="seat-grid">
          {view.seats.map((user, seat) => {
            const team = seat % 2 === 0 ? "A" : "B";
            const mine = user === view.me;
            const bot = !!user && user.startsWith("bot:");
            const canManage = view.mySeat !== null;
            return (
              <div
                key={seat}
                className={`seat-slot ${(POS[view.gameId] ?? POS["29"])[seat]} team-${team} ${user ? "filled" : "empty"} ${mine ? "me" : ""}`}
              >
                <span className="team-label">Team {team}</span>
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
              </div>
            );
          })}
          <div className="seat-table">table</div>
        </div>

        {view.mySeat !== null ? (
          <>
            <button className="btn primary block" disabled={!full} onClick={() => send({ op: "start" })}>
              {full ? "Start game" : `Waiting for players (${view.seats.filter(Boolean).length}/4)`}
            </button>
            <button className="btn block" onClick={async () => {
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
