from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import random
from typing import Dict, List, Optional, Tuple


class GameError(Exception):
    pass


class Suit(str, Enum):
    SPADES = "S"
    HEARTS = "H"
    DIAMONDS = "D"
    CLUBS = "C"


RANK_ORDER: Tuple[str, ...] = ("J", "9", "A", "10", "K", "Q", "8", "7")
CARD_POINTS: Dict[str, int] = {
    "J": 3,
    "9": 2,
    "A": 1,
    "10": 1,
    "K": 0,
    "Q": 0,
    "8": 0,
    "7": 0,
}

PLAYERS: Tuple[str, ...] = ("N", "E", "S", "W")
TEAM_OF: Dict[str, str] = {"N": "NS", "S": "NS", "E": "EW", "W": "EW"}


@dataclass(frozen=True, slots=True)
class Card:
    suit: Suit
    rank: str

    def __post_init__(self) -> None:
        if self.rank not in RANK_ORDER:
            raise ValueError(f"Invalid rank: {self.rank}")


@dataclass(slots=True)
class GameSettings:
    hidden_trump_mode: bool = True
    pair_rule: bool = True
    double_rule: bool = True
    turn_timer_seconds: Optional[int] = None
    winning_marks: int = 6
    traditional_scoring: bool = True
    min_bid: int = 16
    max_bid: int = 28
    min_bid_increment: int = 1
    double_deadline_trick: int = 4


@dataclass(slots=True)
class BidEntry:
    player: str
    bid: Optional[int]


@dataclass(slots=True)
class Trick:
    leader: str
    plays: List[Tuple[str, Card]]
    winner: str


@dataclass(slots=True)
class TeamScore:
    black_marks: int = 0
    red_marks: int = 0
    game_points: int = 0


@dataclass(slots=True)
class RoundResult:
    declarer_team: str
    declarer_success: bool
    bid: int
    adjusted_target: int
    ns_points: int
    ew_points: int
    multiplier: int


@dataclass(slots=True)
class RoundState:
    dealer_index: int = 0
    phase: str = "IDLE"
    hands: Dict[str, List[Card]] = field(default_factory=lambda: {p: [] for p in PLAYERS})
    trick_leader: Optional[str] = None
    current_turn: Optional[str] = None
    current_trick: List[Tuple[str, Card]] = field(default_factory=list)
    tricks: List[Trick] = field(default_factory=list)
    remaining_deck: List[Card] = field(default_factory=list)

    bids: List[BidEntry] = field(default_factory=list)
    passed: set[str] = field(default_factory=set)
    highest_bid: Optional[int] = None
    highest_bidder: Optional[str] = None

    declarer: Optional[str] = None
    trump: Optional[Suit] = None
    trump_open: bool = False
    trump_opened_by: Optional[str] = None

    pair_declared: bool = False
    pair_declared_by: Optional[str] = None
    pair_adjustment: int = 0

    multiplier: int = 1
    doubled_by: Optional[str] = None
    redoubled_by: Optional[str] = None

    ns_card_points: int = 0
    ew_card_points: int = 0


class TwentyNineGame:
    def __init__(self, settings: Optional[GameSettings] = None, seed: Optional[int] = None) -> None:
        self.settings = settings or GameSettings()
        self.state = RoundState()
        self.scores: Dict[str, TeamScore] = {"NS": TeamScore(), "EW": TeamScore()}
        self._random = random.Random(seed)

    @staticmethod
    def _next_player(player: str) -> str:
        return PLAYERS[(PLAYERS.index(player) + 1) % 4]

    @staticmethod
    def _team(player: str) -> str:
        return TEAM_OF[player]

    def _deck(self) -> List[Card]:
        cards = [Card(suit=s, rank=r) for s in Suit for r in RANK_ORDER]
        self._random.shuffle(cards)
        return cards

    def start_round(self) -> None:
        st = self.state
        deck = self._deck()
        st.phase = "BIDDING"
        st.hands = {p: [] for p in PLAYERS}
        st.tricks.clear()
        st.current_trick.clear()
        st.bids.clear()
        st.passed.clear()
        st.highest_bid = None
        st.highest_bidder = None
        st.declarer = None
        st.trump = None
        st.trump_open = False
        st.trump_opened_by = None
        st.pair_declared = False
        st.pair_declared_by = None
        st.pair_adjustment = 0
        st.multiplier = 1
        st.doubled_by = None
        st.redoubled_by = None
        st.ns_card_points = 0
        st.ew_card_points = 0
        
        first = PLAYERS[(st.dealer_index + 1) % 4]
        order = [first]
        for _ in range(3):
            order.append(self._next_player(order[-1]))

        for _ in range(4):
            for p in order:
                st.hands[p].append(deck.pop())

        st.current_turn = first
        st.trick_leader = None
        st.remaining_deck = deck

    def bid(self, player: str, amount: Optional[int]) -> None:
        st = self.state
        if st.phase != "BIDDING":
            raise GameError("Not in bidding phase")
        if player != st.current_turn:
            raise GameError("Not your turn to bid")
        if amount is None:
            if st.highest_bid is None and len(st.passed) == 3:
                raise GameError("At least one player must place a bid")
            st.passed.add(player)
            st.bids.append(BidEntry(player=player, bid=None))
        else:
            if amount < self.settings.min_bid or amount > self.settings.max_bid:
                raise GameError("Bid out of range")
            min_required = self.settings.min_bid if st.highest_bid is None else st.highest_bid + self.settings.min_bid_increment
            if amount < min_required:
                raise GameError("Bid too low")
            st.highest_bid = amount
            st.highest_bidder = player
            st.bids.append(BidEntry(player=player, bid=amount))
            st.passed.discard(player)

        nxt = self._next_player(player)
        while nxt in st.passed and len(st.passed) < 3:
            nxt = self._next_player(nxt)
        st.current_turn = nxt

        if st.highest_bid is not None and len(st.passed) == 3:
            st.declarer = st.highest_bidder
            st.phase = "TRUMP_SELECTION"
            st.current_turn = st.declarer

    def select_trump(self, player: str, suit: Suit) -> None:
        st = self.state
        if st.phase != "TRUMP_SELECTION":
            raise GameError("Not in trump selection phase")
        if player != st.declarer:
            raise GameError("Only declarer selects trump")

        st.trump = suit
        st.trump_open = not self.settings.hidden_trump_mode
        st.current_turn = st.declarer

        for _ in range(4):
            for p in PLAYERS:
                st.hands[p].append(st.remaining_deck.pop())

        st.phase = "PLAYING"
        st.trick_leader = st.declarer

    def reveal_trump(self, player: str) -> None:
        st = self.state
        if st.phase != "PLAYING":
            raise GameError("Trump can only be revealed during play")
        if st.trump_open:
            raise GameError("Trump already opened")
        if st.trump is None:
            raise GameError("Trump is not set")
        if not st.current_trick:
            raise GameError("Trump reveal requires an active trick")

        lead_suit = st.current_trick[0][1].suit
        hand = st.hands[player]
        can_follow = any(c.suit == lead_suit for c in hand)
        if can_follow:
            raise GameError("Cannot reveal trump when you can follow suit")

        st.trump_open = True
        st.trump_opened_by = player

    def call_double(self, player: str) -> None:
        st = self.state
        if not self.settings.double_rule:
            raise GameError("Double rule disabled")
        if st.phase != "PLAYING":
            raise GameError("Double can only be called during play")
        if st.multiplier != 1:
            raise GameError("Double already called")
        if self._team(player) == self._team(st.declarer):
            raise GameError("Only declarer opponents can call double")
        if len(st.tricks) >= self.settings.double_deadline_trick:
            raise GameError("Double deadline passed")

        st.multiplier = 2
        st.doubled_by = player

    def call_redouble(self, player: str) -> None:
        st = self.state
        if not self.settings.double_rule:
            raise GameError("Redouble rule disabled")
        if st.phase != "PLAYING":
            raise GameError("Redouble can only be called during play")
        if st.multiplier != 2:
            raise GameError("Redouble requires active double")
        if self._team(player) != self._team(st.declarer):
            raise GameError("Only declarer team can redouble")

        st.multiplier = 4
        st.redoubled_by = player

    def _card_key(self, card: Card) -> int:
        return RANK_ORDER.index(card.rank)

    def _trick_winner(self, plays: List[Tuple[str, Card]], lead_suit: Suit) -> str:
        st = self.state
        trump_active = st.trump is not None and (st.trump_open or not self.settings.hidden_trump_mode)

        trump_plays = []
        if trump_active:
            trump_plays = [(p, c) for p, c in plays if c.suit == st.trump]
        pool = trump_plays if trump_plays else [(p, c) for p, c in plays if c.suit == lead_suit]
        winner, _ = min(pool, key=lambda pc: self._card_key(pc[1]))
        return winner

    def play_card(self, player: str, card: Card, reveal_trump: bool = False) -> None:
        st = self.state
        if st.phase != "PLAYING":
            raise GameError("Not in playing phase")
        if player != st.current_turn:
            raise GameError("Not your turn")
        if card not in st.hands[player]:
            raise GameError("Card not in hand")

        if st.current_trick:
            lead_suit = st.current_trick[0][1].suit
            can_follow = any(c.suit == lead_suit for c in st.hands[player])
            if can_follow and card.suit != lead_suit:
                raise GameError("Must follow suit")
            if (not can_follow) and reveal_trump and not st.trump_open:
                self.reveal_trump(player)
        else:
            lead_suit = card.suit

        st.hands[player].remove(card)
        st.current_trick.append((player, card))

        if len(st.current_trick) < 4:
            st.current_turn = self._next_player(player)
            return

        winner = self._trick_winner(st.current_trick, lead_suit)
        points = sum(CARD_POINTS[c.rank] for _, c in st.current_trick)
        if self._team(winner) == "NS":
            st.ns_card_points += points
        else:
            st.ew_card_points += points

        st.tricks.append(Trick(leader=st.trick_leader or st.current_trick[0][0], plays=st.current_trick[:], winner=winner))
        st.current_trick.clear()
        st.trick_leader = winner
        st.current_turn = winner

        if len(st.tricks) == 8:
            if self._team(winner) == "NS":
                st.ns_card_points += 1
            else:
                st.ew_card_points += 1
            st.phase = "ROUND_ENDED"

    def declare_pair(self, player: str) -> None:
        st = self.state
        if not self.settings.pair_rule:
            raise GameError("Pair rule disabled")
        if st.phase != "PLAYING":
            raise GameError("Pair can only be declared during play")
        if st.pair_declared:
            raise GameError("Pair already declared")
        if not st.trump_open:
            raise GameError("Pair can only be declared after trump reveal")
        if st.trump is None:
            raise GameError("Trump not set")

        hand = st.hands[player]
        needs = {Card(st.trump, "K"), Card(st.trump, "Q")}
        if not needs.issubset(set(hand)):
            raise GameError("Player does not own trump king and queen")

        declarer_team = self._team(st.declarer)
        adjust = -4 if self._team(player) == declarer_team else 4
        st.pair_adjustment = adjust
        st.pair_declared = True
        st.pair_declared_by = player

    def adjusted_target(self) -> int:
        st = self.state
        if st.highest_bid is None:
            raise GameError("Bid not finalized")
        tgt = st.highest_bid + st.pair_adjustment
        return max(self.settings.min_bid, min(self.settings.max_bid, tgt))

    def finish_round(self) -> RoundResult:
        st = self.state
        if st.phase != "ROUND_ENDED":
            raise GameError("Round not finished")

        declarer_team = self._team(st.declarer)
        target = self.adjusted_target()
        decl_points = st.ns_card_points if declarer_team == "NS" else st.ew_card_points
        success = decl_points >= target

        if self.settings.traditional_scoring:
            if success:
                self.scores[declarer_team].black_marks += st.multiplier
            else:
                self.scores[declarer_team].red_marks += st.multiplier
        else:
            winner_team = declarer_team if success else ("EW" if declarer_team == "NS" else "NS")
            self.scores[winner_team].game_points += st.multiplier

        result = RoundResult(
            declarer_team=declarer_team,
            declarer_success=success,
            bid=st.highest_bid,
            adjusted_target=target,
            ns_points=st.ns_card_points,
            ew_points=st.ew_card_points,
            multiplier=st.multiplier,
        )

        st.dealer_index = (st.dealer_index + 1) % 4
        st.phase = "IDLE"
        return result

    def marks_reached(self) -> Optional[str]:
        for team, score in self.scores.items():
            if score.black_marks + score.red_marks >= self.settings.winning_marks:
                return team
        return None
