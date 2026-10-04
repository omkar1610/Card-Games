"use client";

import { useEffect, useState } from "react";
import { getVolume, setVolume, sfx, unlockAudio } from "@/lib/sound";

/** 🔊 button in the top strip; tap to show a volume slider (saved on this device, default 60%). */
export default function VolumeControl() {
  const [open, setOpen] = useState(false);
  const [vol, setVol] = useState(0.6);

  useEffect(() => {
    setVol(getVolume());
    // Browsers block audio until the first tap; unlock it then.
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const icon = vol === 0 ? "🔇" : vol < 0.4 ? "🔈" : "🔊";
  return (
    <span className="volume">
      <button className="volume-btn" onClick={() => setOpen(!open)} aria-label="Volume">
        {icon} {Math.round(vol * 100)}%
      </button>
      {open && (
        <span className="volume-pop">
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
        </span>
      )}
    </span>
  );
}
