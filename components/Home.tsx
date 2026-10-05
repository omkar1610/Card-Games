"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/api";
import { DEFAULT_GAME, GAMES, GameId } from "@/lib/games/catalog";

interface Props {
  username: string;
  defaultPassword: boolean;
  currentRoom: string | null;
}

export default function Home({ username, defaultPassword, currentRoom }: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [game, setGame] = useState<GameId>(DEFAULT_GAME);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(defaultPassword);
  const [isDefault, setIsDefault] = useState(defaultPassword);
  const [next, setNext] = useState("");
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function createRoom() {
    setBusy(true);
    setError("");
    try {
      const { code } = await post<{ code: string }>("/api/rooms", { game });
      router.push(`/room/${code}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  function joinRoom(e: React.FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) router.push(`/room/${c}`);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    try {
      await post("/api/auth/password", { next });
      setPwMsg({ ok: true, text: "Password changed" });
      setIsDefault(next === "1234");
      setNext("");
    } catch (err) {
      setPwMsg({ ok: false, text: (err as Error).message });
    }
  }

  async function logout() {
    setError("");
    try {
      await post("/api/auth/logout");
      window.location.href = "/login";
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="panel home">
      <div className="home-header">
        <h2>Hi, {username}</h2>
        <button className="btn small" onClick={logout}>
          Log out
        </button>
      </div>
      {isDefault && <p className="error">Your password is 1234. Please change it.</p>}
      {error && <p className="error">{error}</p>}

      {currentRoom && (
        <div className="home-section" style={{ borderTop: "none", marginTop: 0, paddingTop: 0 }}>
          <h3>You&apos;re in room {currentRoom}</h3>
          <button className="btn primary block" onClick={() => router.push(`/room/${currentRoom}`)}>
            Go back to room {currentRoom}
          </button>
        </div>
      )}

      {!currentRoom && (
        <>
          <div className="home-section" style={{ borderTop: "none", marginTop: 0, paddingTop: 0 }}>
            <h3>Create room</h3>
            <div className="game-tiles" role="radiogroup" aria-label="Game">
              {GAMES.map((g) => (
                <button
                  key={g.id}
                  role="radio"
                  aria-checked={game === g.id}
                  className={`game-tile ${game === g.id ? "on" : ""}`}
                  onClick={() => setGame(g.id)}
                >
                  <span className={`game-icon ${g.icon.match(/[♥♦]/) ? "red" : ""}`}>{g.icon}</span>
                  <span className="game-name">{g.name}</span>
                  <span className="game-blurb">{g.blurb}</span>
                  <span className="game-players">4 players</span>
                </button>
              ))}
            </div>
            <button className="btn primary block" onClick={createRoom} disabled={busy}>
              Create a {GAMES.find((g) => g.id === game)?.name} room
            </button>
          </div>

          <form className="home-section" onSubmit={joinRoom}>
            <h3>Join room</h3>
            <div className="row">
              <label className="field">
                <input
                  className="code-input"
                  placeholder="ROOM CODE"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  maxLength={5}
                  autoCapitalize="characters"
                  aria-label="Room code"
                />
              </label>
              <button className="btn primary" disabled={!code.trim()}>
                Join
              </button>
            </div>
          </form>
        </>
      )}

      <div className="home-section">
        <h3>Account</h3>
        {!showPw ? (
          <button className="btn block" onClick={() => setShowPw(true)}>
            Change password
          </button>
        ) : (
          <form onSubmit={changePassword}>
            {pwMsg && <p className={pwMsg.ok ? "success" : "error"}>{pwMsg.text}</p>}
            <label className="field">
              New password
              <input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
            </label>
            <div className="row">
              <button type="button" className="btn" onClick={() => setShowPw(false)}>
                Cancel
              </button>
              <button className="btn primary" style={{ flex: 1 }}>
                Save password
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
