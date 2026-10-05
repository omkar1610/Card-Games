import type { GameId } from "./catalog";

/**
 * What the room system needs from a game. Seats are 0..players-1 (team games: 4 seats, 0 & 2 vs 1 & 3).
 * Engines are pure functions over JSON state and throw EngineError for illegal moves.
 * Player counts and teams are declared in catalog.ts.
 */
export interface GameDef<M = unknown, A = unknown, V = unknown> {
  id: GameId;
  newMatch(players: number): M;
  applyAction(match: M, seat: number, action: A): M;
  /** What `seat` is allowed to see. */
  viewFor(match: M, seat: number): V;
  /** A move for any bot seat that has something to do now, or null. */
  nextBotMove(match: M, isBot: (seat: number) => boolean): { seat: number; action: A } | null;
  /** How long bots should wait before their next move (longer right after a trick). */
  botDelayMs(match: M): number;
}
