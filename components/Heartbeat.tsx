"use client";

import { useEffect } from "react";

const BEAT_MS = 20_000; // keep in sync with PRESENCE_BEAT_MS in lib/auth.ts

/** Tells the server this user has a page open, so nobody else can log in as them meanwhile. */
export default function Heartbeat() {
  useEffect(() => {
    const beat = () =>
      fetch("/api/auth/heartbeat", { method: "POST" })
        .then((res) => {
          // Logged out from another device ("log out everywhere").
          if (res.status === 401) window.location.href = "/login";
        })
        .catch(() => {});
    beat();
    const t = setInterval(beat, BEAT_MS);
    return () => clearInterval(t);
  }, []);
  return null;
}
