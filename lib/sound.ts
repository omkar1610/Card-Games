// Sound effects synthesized with the Web Audio API (no audio files to load or license).
// Browsers only allow audio after the user has tapped something, so the context is created lazily
// and unlocked on the first pointer event (see unlockAudio).

const VOLUME_KEY = "29-volume";
const DEFAULT_VOLUME = 0.6;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let volume = DEFAULT_VOLUME;
let loaded = false;

function loadVolume() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const v = localStorage.getItem(VOLUME_KEY);
    if (v !== null && !Number.isNaN(Number(v))) volume = Math.min(1, Math.max(0, Number(v)));
  } catch {
    // storage blocked: keep the default
  }
}

export function getVolume(): number {
  loadVolume();
  return volume;
}

export function setVolume(v: number) {
  volume = Math.min(1, Math.max(0, v));
  if (master) master.gain.value = volume;
  try {
    localStorage.setItem(VOLUME_KEY, String(volume));
  } catch {
    // ignore
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  loadVolume();
  if (volume === 0) return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

let silentEl: HTMLAudioElement | null = null;

/**
 * Call from user gestures. Browsers (iOS Safari especially) only allow audio after a completed tap,
 * and the iPhone silent switch mutes Web Audio unless the page plays as "media"; both are handled here.
 */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  // iOS 17+: treat our sounds as media playback so the silent switch doesn't mute them.
  const nav = navigator as unknown as { audioSession?: { type: string } };
  if (nav.audioSession) {
    try {
      nav.audioSession.type = "playback";
    } catch {
      // older Safari: ignore
    }
  }
  // Older iOS: playing a (silent) media element during a tap switches the page to media playback too.
  if (!silentEl) {
    silentEl = new Audio(SILENT_WAV);
    silentEl.setAttribute("playsinline", "");
    silentEl.loop = true;
    silentEl.volume = 0.01;
  }
  silentEl.play().catch(() => {});
  const a = audio();
  // A one-sample blip inside the gesture is what finally unlocks Safari's AudioContext.
  if (a && master) {
    const src = a.createBufferSource();
    src.buffer = a.createBuffer(1, 1, 22050);
    src.connect(master);
    src.start(0);
  }
}

/** True once audio is actually allowed to play. */
export function audioReady(): boolean {
  return !!ctx && ctx.state === "running";
}

/**
 * Keeps trying to unlock on every kind of tap/key until audio is running, and resumes it when the
 * player comes back to the tab (phones suspend audio in the background). Returns a cleanup function.
 */
export function installAudioUnlock(): () => void {
  const events = ["pointerup", "touchend", "click", "keydown"] as const;
  const onGesture = () => {
    unlockAudio();
    if (audioReady()) events.forEach((e) => window.removeEventListener(e, onGesture, true));
  };
  const onVisible = () => {
    if (!document.hidden && ctx && ctx.state !== "running") ctx.resume().catch(() => {});
  };
  events.forEach((e) => window.addEventListener(e, onGesture, true));
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    events.forEach((e) => window.removeEventListener(e, onGesture, true));
    document.removeEventListener("visibilitychange", onVisible);
  };
}

// 0.1s of silence as a WAV data URI (used only to switch iOS into media playback).
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

interface ToneOpts {
  freq: number;
  to?: number; // slide to this frequency
  dur: number;
  type?: OscillatorType;
  gain?: number;
  at?: number; // delay in seconds
}

function tone({ freq, to, dur, type = "sine", gain = 0.3, at = 0 }: ToneOpts) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise({ dur, freq, q = 1, gain = 0.3, at = 0, sweepTo }: { dur: number; freq: number; q?: number; gain?: number; at?: number; sweepTo?: number }) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + at;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(freq, t);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  filter.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t);
}

const notes = (freqs: number[], step: number, opts: Partial<ToneOpts> = {}) =>
  freqs.forEach((f, i) => tone({ freq: f, dur: step * 1.6, at: i * step, ...opts }));

export const sfx = {
  /** A card snapped onto the table. */
  card: () => {
    noise({ dur: 0.07, freq: 2200, q: 0.8, gain: 0.35 });
    tone({ freq: 160, to: 90, dur: 0.06, gain: 0.25 });
  },
  /** One card flicked out during the deal. */
  deal: (at = 0) => noise({ dur: 0.04, freq: 4000, q: 1.2, gain: 0.18, at }),
  /** It's your turn. */
  turn: () => notes([880, 1320], 0.09, { gain: 0.18 }),
  /** The four cards are swept to the winner. */
  collect: () => noise({ dur: 0.28, freq: 600, sweepTo: 2500, q: 0.7, gain: 0.25 }),
  bid: () => tone({ freq: 620, dur: 0.05, type: "square", gain: 0.08 }),
  pass: () => tone({ freq: 240, to: 180, dur: 0.12, gain: 0.2 }),
  /** Trump revealed. */
  reveal: () => notes([392, 523, 784], 0.08, { type: "triangle", gain: 0.25 }),
  marriage: () => notes([523, 659, 784, 1047], 0.09, { type: "triangle", gain: 0.22 }),
  double: () => {
    tone({ freq: 330, dur: 0.12, type: "sawtooth", gain: 0.12 });
    tone({ freq: 440, dur: 0.16, type: "sawtooth", gain: 0.12, at: 0.13 });
  },
  roundWon: () => notes([523, 659, 784], 0.1, { gain: 0.22 }),
  roundLost: () => notes([392, 330, 262], 0.13, { type: "triangle", gain: 0.2 }),
  gameWon: () => notes([523, 659, 784, 1047, 784, 1047], 0.11, { type: "triangle", gain: 0.25 }),
  gameLost: () => notes([392, 370, 330, 262], 0.16, { type: "triangle", gain: 0.2 }),
  error: () => tone({ freq: 130, dur: 0.18, type: "square", gain: 0.1 }),
  /** Dice rattling, then landing. */
  dice: () => {
    for (let i = 0; i < 5; i++) noise({ dur: 0.04, freq: 1800 + i * 300, q: 2, gain: 0.22, at: i * 0.06 });
    tone({ freq: 220, to: 140, dur: 0.08, gain: 0.25, at: 0.32 });
  },
  /** A pen stroke / tap on the board. */
  tap: () => tone({ freq: 880, to: 660, dur: 0.06, type: "triangle", gain: 0.15 }),
  /** Something good for the mover (box closed, ladder climbed, capture). */
  good: () => notes([659, 988], 0.07, { type: "triangle", gain: 0.2 }),
  /** Something bad for the mover (snake, captured, picked up the pile). */
  bad: () => tone({ freq: 392, to: 196, dur: 0.35, type: "triangle", gain: 0.2 }),
};
