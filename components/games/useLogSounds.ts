"use client";

import { useEffect, useRef } from "react";

/** Calls `onEntry` for each log entry added since the last update (none on first render). */
export function useLogSounds(log: { seat: number | null; text: string }[], version: number, onEntry: (e: { seat: number | null; text: string }) => void) {
  const prev = useRef<string[] | null>(null);
  const keys = log.map((l) => `${l.seat}|${l.text}`);
  useEffect(() => {
    const p = prev.current;
    prev.current = keys;
    if (!p) return;
    let same = 0;
    while (same < p.length && same < keys.length && p[same] === keys[same]) same++;
    // If the log was trimmed or reset (new game), only treat genuinely new tail entries as new.
    const fresh = same === 0 && p.length ? log.slice(Math.max(0, log.length - 2)) : log.slice(same);
    fresh.forEach(onEntry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
}
