// Small helpers shared by the simpler games.
import { EngineError } from "../engine/game";

export interface Log {
  seat: number | null;
  text: string;
}

export function fail(msg: string): never {
  throw new EngineError(msg);
}

export function pushLog(log: Log[], seat: number | null, text: string) {
  log.push({ seat, text });
  if (log.length > 40) log.splice(0, log.length - 40);
}

/**
 * A repeatable 0..1 number for bot decisions. Bots are asked on every poll, so a decision
 * that uses randomness must give the same answer for the same situation.
 */
export function stableRandom(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join("|")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export const rollDie = (rng: () => number) => 1 + Math.floor(rng() * 6);
