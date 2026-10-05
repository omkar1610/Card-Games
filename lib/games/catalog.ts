// The list of games, safe to import on the client (no engine code).
export type GameId = "29" | "bridge" | "ludo" | "snakes" | "bluff" | "uno" | "tictactoe" | "dots";

export interface GameInfo {
  id: GameId;
  name: string;
  blurb: string;
  icon: string;
  minPlayers: number;
  maxPlayers: number;
  /** Fixed partnerships (seats 0 & 2 vs 1 & 3); needs exactly 4 players. */
  teams: boolean;
  /** Optional names for seats, e.g. Ludo colours or X / O. */
  seatLabels?: string[];
}

export const GAMES: GameInfo[] = [
  { id: "29", name: "29", blurb: "Bid, hide the trump, first team to ±6", icon: "J♠", minPlayers: 4, maxPlayers: 4, teams: true },
  { id: "bridge", name: "Contract Bridge", blurb: "Auction, dummy, 4-deal Chicago", icon: "A♥", minPlayers: 4, maxPlayers: 4, teams: true },
  { id: "ludo", name: "Ludo", blurb: "Roll, race your 4 tokens home, capture", icon: "🎲", minPlayers: 2, maxPlayers: 4, teams: false, seatLabels: ["Red", "Green", "Yellow", "Blue"] },
  { id: "snakes", name: "Snakes & Ladders", blurb: "Climb ladders, dodge snakes, reach 100", icon: "🐍", minPlayers: 2, maxPlayers: 4, teams: false },
  { id: "bluff", name: "Bluff", blurb: "Play cards face down, call the liars", icon: "🃏", minPlayers: 3, maxPlayers: 6, teams: false },
  { id: "uno", name: "Uno", blurb: "Match colour or number, +2, +4, Skip", icon: "+4", minPlayers: 2, maxPlayers: 6, teams: false },
  { id: "tictactoe", name: "Tic-tac-toe", blurb: "Three in a row, best of many", icon: "✕○", minPlayers: 2, maxPlayers: 2, teams: false, seatLabels: ["X", "O"] },
  { id: "dots", name: "Dots & Boxes", blurb: "Draw lines, close boxes, most boxes wins", icon: "⊞", minPlayers: 2, maxPlayers: 4, teams: false },
];

export const DEFAULT_GAME: GameId = "29";

export function gameInfo(id: GameId | undefined): GameInfo {
  return GAMES.find((g) => g.id === (id ?? DEFAULT_GAME)) ?? GAMES[0];
}

export function gameName(id: GameId | undefined): string {
  return gameInfo(id).name;
}

export function isGameId(x: unknown): x is GameId {
  return GAMES.some((g) => g.id === x);
}

export function playersText(g: GameInfo): string {
  return g.minPlayers === g.maxPlayers ? `${g.minPlayers} players` : `${g.minPlayers}–${g.maxPlayers} players`;
}
