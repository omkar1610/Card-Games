// The list of games, safe to import on the client (no engine code).
export type GameId = "29" | "bridge";

export const GAMES: { id: GameId; name: string; blurb: string; icon: string }[] = [
  { id: "29", name: "29", blurb: "Bid, hide the trump, first team to ±6", icon: "J♠" },
  { id: "bridge", name: "Contract Bridge", blurb: "Auction, dummy, 4-deal Chicago", icon: "A♥" },
];

export const DEFAULT_GAME: GameId = "29";

export function gameName(id: GameId | undefined): string {
  return GAMES.find((g) => g.id === (id ?? DEFAULT_GAME))?.name ?? "29";
}

export function isGameId(x: unknown): x is GameId {
  return GAMES.some((g) => g.id === x);
}
