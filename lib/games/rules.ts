// Plain-language rules shown from Settings → Rules. Keep these in sync with the engines.
import type { GameId } from "./catalog";

export interface RuleSection {
  title: string;
  points: string[];
}

export const RULES: Record<GameId, { title: string; sections: RuleSection[] }> = {
  "29": {
    title: "29 — rules",
    sections: [
      {
        title: "Players and cards",
        points: [
          "4 players in 2 teams; partners sit opposite. Play goes anticlockwise.",
          "32 cards: J 9 A 10 K Q 8 7 in each suit, highest to lowest.",
          "Points: J = 3, 9 = 2, A = 1, 10 = 1. 28 points in all.",
        ],
      },
      {
        title: "Bidding",
        points: [
          "Everyone gets 4 cards. Bidding starts on the dealer's right.",
          "Bid how many points your team will take, or pass (a pass is final).",
          "Bids are 16–24 until someone bids 24; after that any bid up to 28.",
          "Each bid must be higher than the last. If all four pass, the next dealer redeals.",
        ],
      },
      {
        title: "Trump",
        points: [
          "The highest bidder secretly chooses the trump suit. Then everyone gets 4 more cards.",
          "If the other team holds no trump at all, the same dealer redeals.",
          "After trump is chosen, the other team may Double; then the bidding team may Redouble.",
        ],
      },
      {
        title: "Playing",
        points: [
          "You must follow the suit that was led. Anyone may lead any suit.",
          "If you can't follow suit you may play any card, or first Ask for trump to reveal it.",
          "If you asked for trump, you must play a trump if you have one.",
          "Until trump is revealed there is no trump. Highest trump wins, otherwise the highest card of the led suit.",
          "Marriage: after trump is revealed, holding K and Q of trump lets you declare it. The bidding team's target drops by 4 (min 16) if it's theirs, or rises by 4 (max 28) if it's the other team's.",
        ],
      },
      {
        title: "Scoring",
        points: [
          "The round ends as soon as the result is certain.",
          "Bidding team reaches the target: +1 game point. Otherwise −1. Doubled ×2, redoubled ×4.",
          "First team to +6 wins; a team at −6 loses.",
        ],
      },
    ],
  },
  bridge: {
    title: "Contract Bridge — rules",
    sections: [
      {
        title: "Players and cards",
        points: [
          "4 players in 2 partnerships; partners sit opposite. Play goes clockwise.",
          "52 cards, 13 each. A K Q J 10 … 2, highest to lowest.",
        ],
      },
      {
        title: "Auction",
        points: [
          "The dealer calls first. Each call is a bid, Pass, Double or Redouble.",
          "A bid is a level and a suit (or NT = no trump): 2♥ means 'my side will take 6 + 2 = 8 tricks with hearts as trump'.",
          "Each bid must be higher: a higher level, or the same level in a higher suit (♣ < ♦ < ♥ < ♠ < NT).",
          "Double an opponent's bid to raise the stakes; their side may Redouble.",
          "Three passes after a bid end the auction. If all four pass at the start, the same dealer redeals.",
        ],
      },
      {
        title: "Declarer and dummy",
        points: [
          "Declarer is the player on the winning side who first named the final suit; their partner is dummy.",
          "The player on declarer's left leads first. Then dummy's cards are placed face up.",
          "Declarer plays both hands: their own and dummy's. Dummy just watches.",
        ],
      },
      {
        title: "Playing",
        points: [
          "You must follow the suit that was led if you can; otherwise play any card.",
          "Highest trump wins the trick, otherwise the highest card of the led suit. No trump in NT.",
          "The winner of a trick leads the next one. 13 tricks per deal.",
        ],
      },
      {
        title: "Scoring (Chicago)",
        points: [
          "A Chicago is 4 deals. Vulnerability: deal 1 nobody, deals 2 and 3 the dealer's side, deal 4 both.",
          "Make your contract: 20 per trick in ♣/♦, 30 in ♥/♠, NT 40 for the first then 30 — counted for the tricks you bid above 6.",
          "100+ of those points is a game: +300 bonus (+500 vulnerable). Less is a part score: +50.",
          "Slams: bid 6 → +500 (+750 vulnerable); bid 7 → +1000 (+1500). Extra tricks score extra.",
          "Fail and the other side scores 50 per trick short (100 vulnerable), more if doubled.",
          "Doubled contracts score double (redoubled ×4), plus 50/100 for making them.",
          "Highest total after 4 deals wins. The app shows a breakdown after every deal.",
        ],
      },
    ],
  },
};
