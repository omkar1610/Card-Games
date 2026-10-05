import type { GameDef } from "../types";
import { BAction, BMatch, BView, applyAction, newMatch, viewFor } from "./engine";
import { nextBridgeBotMove } from "./bot";

export const bridge: GameDef<BMatch, BAction, BView> = {
  id: "bridge",
  newMatch: () => newMatch(),
  applyAction: (m, seat, a) => applyAction(m, seat, a),
  viewFor,
  nextBotMove: nextBridgeBotMove,
  botDelayMs(m) {
    const r = m.round;
    const trickJustEnded = r.phase === "play" && r.trick.length === 0 && r.tricks.length > 0;
    return trickJustEnded ? 1600 : 850;
  },
};
