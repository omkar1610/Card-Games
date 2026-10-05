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
  ludo: {
    title: "Ludo — rules",
    sections: [
      { title: "Goal", points: ["2–4 players, 4 tokens each. Be first to bring all 4 tokens home (the centre)."] },
      {
        title: "Turns",
        points: [
          "Tap Roll, then tap a highlighted token to move it by the number rolled.",
          "You need a 6 to bring a token out of your base onto your start square.",
          "Rolling a 6, capturing a token, or bringing a token home gives you another roll.",
          "Three 6s in a row ends your turn.",
          "If no token can move, the turn passes.",
        ],
      },
      {
        title: "Capturing and safety",
        points: [
          "Land on an opponent's token to send it back to their base.",
          "Star squares and the coloured start squares are safe: no captures there.",
          "After going round the board, tokens turn into their own coloured home column. You need the exact roll to reach home.",
        ],
      },
    ],
  },
  snakes: {
    title: "Snakes & Ladders — rules",
    sections: [
      { title: "Goal", points: ["2–4 players. First to land exactly on 100 wins."] },
      {
        title: "Turns",
        points: [
          "Tap Roll and your token moves forward by the number rolled.",
          "Land at the bottom of a ladder: climb up. Land on a snake's head: slide down.",
          "Rolling a 6 gives another roll.",
          "If the roll would take you past 100, you stay where you are.",
        ],
      },
    ],
  },
  bluff: {
    title: "Bluff — rules",
    sections: [
      { title: "Goal", points: ["3–6 players. All 52 cards are dealt. First to get rid of all their cards wins."] },
      {
        title: "Playing",
        points: [
          "The player starting a round picks a rank (e.g. 7) and plays 1–4 cards face down, claiming they're all that rank.",
          "Going round, each player plays 1–4 cards claiming the same rank, or passes. You may lie!",
          "If everyone else passes, the pile is cleared and the last player to play starts a new round.",
        ],
      },
      {
        title: "Calling bluff",
        points: [
          "After any play, anyone else can tap Bluff! before the next player acts.",
          "The cards are shown. If any card wasn't the claimed rank, the player who played them picks up the whole pile. If they were all true, the caller picks up the pile.",
          "Whoever was right starts the next round.",
          "If you play your last cards and nobody calls bluff in time, you win.",
        ],
      },
    ],
  },
  uno: {
    title: "Uno — rules",
    sections: [
      { title: "Goal", points: ["2–6 players, 7 cards each. First to play all their cards wins."] },
      {
        title: "Playing",
        points: [
          "Play a card that matches the top card's colour or its number/symbol, or play a Wild.",
          "Can't (or don't want to) play? Draw 1 card. If it fits you may play it, otherwise pass.",
          "Skip: the next player misses a turn. Reverse: play changes direction (with 2 players it works like Skip).",
          "+2: the next player draws 2 and misses a turn. Wild: choose the colour. Wild +4: choose the colour; the next player draws 4 and misses a turn.",
          "\"UNO!\" is called for you automatically when you're down to one card.",
        ],
      },
    ],
  },
  tictactoe: {
    title: "Tic-tac-toe — rules",
    sections: [
      {
        title: "Playing",
        points: [
          "2 players: X and O take turns marking an empty square.",
          "Three in a row (across, down or diagonal) wins. A full board with no line is a draw.",
          "The starting player alternates each game; the score keeps running.",
        ],
      },
    ],
  },
  dots: {
    title: "Dots & Boxes — rules",
    sections: [
      {
        title: "Playing",
        points: [
          "2–4 players take turns drawing one line between two neighbouring dots.",
          "Close the fourth side of a box and it's yours, and you draw again.",
          "When every box is closed, the player with the most boxes wins.",
          "Grid: 4×4 boxes for 2 players, 5×5 for 3–4 players.",
          "Tip: avoid drawing the third side of a box, or the next player gets it.",
        ],
      },
    ],
  },
};
