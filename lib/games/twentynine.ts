import type { GameDef } from "./types";
import { Action, Match, PlayerView, applyAction, newMatch, viewFor } from "../engine/game";
import { nextBotMove } from "../engine/bot";

export const twentyNine: GameDef<Match, Action, PlayerView> = {
  id: "29",
  newMatch: () => newMatch(),
  applyAction: (m, seat, a) => applyAction(m, seat, a),
  viewFor,
  nextBotMove(m, isBot) {
    const r = m.round;
    if (!r || m.winner) return null;
    return nextBotMove(r, isBot);
  },
  botDelayMs(m) {
    const r = m.round;
    const handJustEnded = !!r && r.phase === "playing" && r.trick.length === 0 && r.tricks.length > 0;
    return handJustEnded ? 1700 : 900;
  },
};
