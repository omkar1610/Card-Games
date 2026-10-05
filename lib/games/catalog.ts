// The list of games, safe to import on the client (no engine code).
export type GameId = "29" | "bridge";

export const GAMES: { id: GameId; name: string; blurb: string }[] = [
  { id: "29", name: "29", blurb: "4 players · 2 teams · first to ±6" },
  { id: "bridge", name: "Contract Bridge", blurb: "4 players · 2 partnerships · Chicago (4 deals)" },
];

export const DEFAULT_GAME: GameId = "29";

export function gameName(id: GameId | undefined): string {
  return GAMES.find((g) => g.id === (id ?? DEFAULT_GAME))?.name ?? "29";
}

export function isGameId(x: unknown): x is GameId {
  return GAMES.some((g) => g.id === x);
}
