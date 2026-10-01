"use client";

import { useState } from "react";
import { ApiError, post } from "@/lib/api";

export default function LoginForm({ next }: { next: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [offerReset, setOfferReset] = useState(false);
  const [offerForce, setOfferForce] = useState(false);
  const [busy, setBusy] = useState(false);

  async function login(e?: React.FormEvent, force = false) {
    e?.preventDefault();
    setBusy(true);
    setMsg(null);
    setOfferReset(false);
    setOfferForce(false);
    try {
      await post("/api/auth/login", { username, password, force });
      window.location.href = next;
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
      const status = err instanceof ApiError ? err.status : 0;
      setOfferReset(status === 401);
      setOfferForce(status === 409);
      setBusy(false);
    }
  }

  async function resetPassword() {
    setBusy(true);
    setMsg(null);
    try {
      await post("/api/auth/reset", { username });
      setPassword("");
      setOfferReset(false);
      setMsg({ ok: true, text: "Password reset to 1234. Log in with it now." });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
    setBusy(false);
  }

  return (
    <form className="panel" onSubmit={login}>
      <h1 className="logo">
        2<span>9</span>
      </h1>
      <p className="subtitle">New username? An account is created for you.</p>
      {msg && <p className={msg.ok ? "success" : "error"}>{msg.text}</p>}
      <label className="field">
        Username
        <input
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setOfferReset(false);
            setOfferForce(false);
          }}
          autoComplete="username"
          autoCapitalize="none"
          autoFocus
          required
        />
      </label>
      <label className="field">
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <button type="submit" className="btn primary block" disabled={busy}>
        {busy ? "…" : "Log in"}
      </button>
      {offerForce && (
        <button type="button" className="btn block" style={{ marginTop: 10 }} disabled={busy} onClick={() => login(undefined, true)}>
          Log out everywhere else &amp; log in here
        </button>
      )}
      {offerReset && (
        <button type="button" className="btn block" style={{ marginTop: 10 }} disabled={busy} onClick={resetPassword}>
          Forgot it? Reset password to 1234
        </button>
      )}
    </form>
  );
}
