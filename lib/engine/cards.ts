// Card primitives for 29.
// A card is a string like "JS" (Jack of spades) or "10H" (Ten of hearts).

export type Suit = "S" | "H" | "D" | "C";
export type Rank = "J" | "9" | "A" | "10" | "K" | "Q" | "8" | "7";
export type Card = string;

export const SUITS: Suit[] = ["S", "H", "D", "C"];
// Highest to lowest.
export const RANKS: Rank[] = ["J", "9", "A", "10", "K", "Q", "8", "7"];

export const CARD_POINTS: Record<Rank, number> = {
  J: 3,
  "9": 2,
  A: 1,
  "10": 1,
  K: 0,
  Q: 0,
  "8": 0,
  "7": 0,
};

export const SUIT_SYMBOL: Record<Suit, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
export const SUIT_NAME: Record<Suit, string> = { S: "Spades", H: "Hearts", D: "Diamonds", C: "Clubs" };

export function suitOf(card: Card): Suit {
  return card.slice(-1) as Suit;
}

export function rankOf(card: Card): Rank {
  return card.slice(0, -1) as Rank;
}

export function pointsOf(card: Card): number {
  return CARD_POINTS[rankOf(card)];
}

/** Lower number = stronger card. */
export function strength(card: Card): number {
  return RANKS.indexOf(rankOf(card));
}

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Sort a hand for display: grouped by suit, strongest first. */
export function sortHand(hand: Card[]): Card[] {
  const suitOrder: Suit[] = ["S", "H", "C", "D"];
  return hand
    .slice()
    .sort((a, b) => suitOrder.indexOf(suitOf(a)) - suitOrder.indexOf(suitOf(b)) || strength(a) - strength(b));
}
