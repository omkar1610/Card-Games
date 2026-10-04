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

/** Call from a user gesture (first tap) so later sounds are allowed to play. */
export function unlockAudio() {
  audio();
}

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
};
