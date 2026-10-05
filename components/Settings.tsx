"use client";

import { useEffect, useRef, useState } from "react";
import { getVolume, installAudioUnlock, setVolume, sfx, unlockAudio } from "@/lib/sound";
import { THEMES, Theme, getTheme, setTheme } from "@/lib/theme";
import { RULES } from "@/lib/games/rules";
import type { GameId } from "@/lib/games/catalog";

/**
 * ⚙ menu in the top strip. Each setting is one row, so new ones can be added below
 * (e.g. theme, four-colour suits).
 */
export default function Settings({ onEndGame, gameId }: { onEndGame: () => void; gameId: GameId }) {
  const [open, setOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [vol, setVol] = useState(0.6);
  const [theme, setThemeState] = useState<Theme>("heritage");
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setVol(getVolume());
    setThemeState(getTheme());
    // Browsers block audio until a completed tap; keep trying until it's unlocked.
    return installAudioUnlock();
  }, []);

  // Close when tapping outside the menu.
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  const icon = vol === 0 ? "🔇" : vol < 0.4 ? "🔈" : "🔊";
  return (
    <span className="settings" ref={ref}>
      <button className="settings-btn" onClick={() => setOpen(!open)} aria-label="Settings" aria-expanded={open}>
        ⚙ Settings
      </button>
      {open && (
        <div className="settings-menu" role="menu">
          <div className="settings-row">
            <div className="settings-label">
              <span>{icon} Volume</span>
              <span className="settings-value">{Math.round(vol * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(vol * 100)}
              aria-label="Volume level"
              onChange={(e) => {
                const v = Number(e.target.value) / 100;
                setVol(v);
                setVolume(v);
              }}
              onPointerUp={() => sfx.card()}
            />
            <button
              className="btn block small"
              style={{ marginTop: 8 }}
              onClick={() => {
                unlockAudio();
                sfx.turn();
                setTimeout(sfx.card, 250);
              }}
            >
              ▶ Test sound
            </button>
          </div>
          <div className="settings-row">
            <div className="settings-label">
              <span>🎨 Theme</span>
            </div>
            <div className="theme-pick">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={theme === t.id ? "on" : ""}
                  aria-pressed={theme === t.id}
                  onClick={() => {
                    setTheme(t.id);
                    setThemeState(t.id);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="settings-row">
            <button
              className="btn block"
              onClick={() => {
                setOpen(false);
                setShowRules(true);
              }}
            >
              📖 Rules
            </button>
          </div>
          <div className="settings-row">
            <button
              className="btn danger block"
              onClick={() => {
                setOpen(false);
                onEndGame();
              }}
            >
              End game for everyone
            </button>
          </div>
        </div>
      )}
      {showRules && <RulesSheet gameId={gameId} onClose={() => setShowRules(false)} />}
    </span>
  );
}

function RulesSheet({ gameId, onClose }: { gameId: GameId; onClose: () => void }) {
  const rules = RULES[gameId];
  return (
    <div className="rules-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={rules.title}>
      <div className="rules-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="rules-head">
          <h2>{rules.title}</h2>
          <button className="btn small" onClick={onClose} aria-label="Close rules">
            ✕
          </button>
        </div>
        <div className="rules-body">
          {rules.sections.map((s) => (
            <section key={s.title}>
              <h3>{s.title}</h3>
              <ul>
                {s.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
