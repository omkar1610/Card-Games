// Server-side game registry: the room system looks up each room's game here.
import type { GameDef } from "./types";
import { DEFAULT_GAME, GameId } from "./catalog";
import { twentyNine } from "./twentynine";
import { bridge } from "./bridge";

const REGISTRY: Record<GameId, GameDef<any, any, any>> = { "29": twentyNine, bridge };

export function getGame(id: GameId | undefined): GameDef<any, any, any> {
  return REGISTRY[id ?? DEFAULT_GAME];
}
