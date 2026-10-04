"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { post } from "@/lib/api";
import type { RoomView } from "@/lib/rooms";
import Lobby from "./Lobby";
import Table from "./Table";
import type { Action } from "@/lib/engine/game";

const POLL_MS = 600; // how quickly other players' moves show up

export default function RoomClient({ code }: { code: string }) {
  const [view, setView] = useState<RoomView | null>(null);
  const [error, setError] = useState("");
  const [fatal, setFatal] = useState("");
  const versionRef = useRef<number | undefined>(undefined);

  const accept = useCallback((v: RoomView) => {
    // Ignore stale responses that arrive after a newer one.
    if (versionRef.current !== undefined && v.version < versionRef.current) return;
    versionRef.current = v.version;
    setView(v);
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const q = versionRef.current !== undefined ? `?v=${versionRef.current}` : "";
        const res = await fetch(`/api/rooms/${code}${q}`, { cache: "no-store" });
        if (res.status === 200) accept(await res.json());
        else if (res.status === 401) window.location.href = `/login?next=/room/${code}`;
        else if (res.status === 404) setFatal("Room not found. Check the code and try again.");
      } catch {
        // network blip; try again next tick
      }
      if (!stopped) timer = setTimeout(poll, document.hidden ? POLL_MS * 3 : POLL_MS);
    }
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [code, accept]);

  const send = useCallback(
    async (body: unknown) => {
      setError("");
      try {
        accept(await post<RoomView>(`/api/rooms/${code}`, body));
      } catch (err) {
        setError((err as Error).message);
        setTimeout(() => setError(""), 3000);
      }
    },
    [code, accept],
  );

  const act = useCallback((action: Action) => send({ op: "action", action }), [send]);

  if (fatal)
    return (
      <main className="center-page">
        <div className="panel">
          <p className="error">{fatal}</p>
          <Link href="/home" className="btn block" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
            Back home
          </Link>
        </div>
      </main>
    );

  if (!view)
    return (
      <main className="center-page">
        <p className="hint">Loading room {code}…</p>
      </main>
    );

  if (view.ended)
    return (
      <main className="center-page">
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Game over</h2>
          {view.game && (
            <p className="stat-value">
              <span className="ta">Team A {view.game.score.A}</span>
              <span className="tb">Team B {view.game.score.B}</span>
            </p>
          )}
          <p className="hint">Room {view.code} was closed.</p>
          <Link href="/home" className="btn primary block" style={{ display: "block", textAlign: "center", textDecoration: "none" }}>
            Back home
          </Link>
        </div>
      </main>
    );

  if (!view.started) return <Lobby view={view} send={send} error={error} />;

  if (!view.game) {
    const botSeats = view.seats.flatMap((u, seat) => (u?.startsWith("bot:") ? [seat] : []));
    return (
      <main className="center-page">
        <div className="panel">
          <p>This game has already started.</p>
          {botSeats.length > 0 ? (
            <>
              <p className="hint">Take over a bot to join. You keep its cards and its team&apos;s score.</p>
              {error && <p className="error">{error}</p>}
              {botSeats.map((seat) => (
                <button
                  key={seat}
                  className="btn primary block"
                  style={{ marginBottom: 8 }}
                  onClick={() => send({ op: "takeSeat", seat })}
                >
                  Take {view.names[seat]?.replace(/^bot:/, "")}&apos;s seat · Team {seat % 2 === 0 ? "A" : "B"}
                </button>
              ))}
            </>
          ) : (
            <p className="hint">All four seats are taken by players.</p>
          )}
          <Link href="/home">Back home</Link>
        </div>
      </main>
    );
  }

  return <Table view={view} game={view.game} act={act} send={send} error={error} />;
}
