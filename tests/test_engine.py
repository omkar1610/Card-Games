import unittest

from game29.engine import Card, GameError, GameSettings, Suit, TwentyNineGame


class TestTwentyNine(unittest.TestCase):
    def setUp(self):
        self.game = TwentyNineGame(GameSettings(hidden_trump_mode=True), seed=1)
        self.game.start_round()

    def _force_bidding(self):
        t = self.game.state.current_turn
        self.game.bid(t, 16)
        self.game.bid(self.game.state.current_turn, None)
        self.game.bid(self.game.state.current_turn, None)
        self.game.bid(self.game.state.current_turn, None)

    def test_bidding_and_trump_selection(self):
        self._force_bidding()
        self.assertEqual(self.game.state.phase, "TRUMP_SELECTION")
        declarer = self.game.state.declarer
        self.game.select_trump(declarer, Suit.HEARTS)
        self.assertEqual(self.game.state.phase, "PLAYING")
        self.assertFalse(self.game.state.trump_open)
        for p in ("N", "E", "S", "W"):
            self.assertEqual(len(self.game.state.hands[p]), 8)

    def test_follow_suit_enforced(self):
        self._force_bidding()
        declarer = self.game.state.declarer
        self.game.select_trump(declarer, Suit.SPADES)

        lead = self.game.state.current_turn
        lead_card = self.game.state.hands[lead][0]
        self.game.play_card(lead, lead_card)

        p2 = self.game.state.current_turn
        hand = self.game.state.hands[p2]
        same_suit = [c for c in hand if c.suit == lead_card.suit]
        off_suit = [c for c in hand if c.suit != lead_card.suit]
        if same_suit and off_suit:
            with self.assertRaises(GameError):
                self.game.play_card(p2, off_suit[0])

    def test_pair_requires_open_trump(self):
        self._force_bidding()
        declarer = self.game.state.declarer
        self.game.select_trump(declarer, Suit.DIAMONDS)
        with self.assertRaises(GameError):
            self.game.declare_pair(declarer)

    def test_adjusted_target_clamps(self):
        self._force_bidding()
        st = self.game.state
        st.highest_bid = 28
        st.pair_adjustment = 4
        self.assertEqual(self.game.adjusted_target(), 28)
        st.highest_bid = 16
        st.pair_adjustment = -4
        self.assertEqual(self.game.adjusted_target(), 16)

    def test_last_trick_bonus(self):
        self._force_bidding()
        declarer = self.game.state.declarer
        self.game.select_trump(declarer, Suit.CLUBS)

        # deterministic mini-simulation that always plays first legal card
        while self.game.state.phase == "PLAYING":
            p = self.game.state.current_turn
            trick = self.game.state.current_trick
            hand = self.game.state.hands[p]
            if not trick:
                card = hand[0]
            else:
                lead = trick[0][1].suit
                same = [c for c in hand if c.suit == lead]
                card = same[0] if same else hand[0]
            self.game.play_card(p, card, reveal_trump=True)

        total = self.game.state.ns_card_points + self.game.state.ew_card_points
        self.assertEqual(total, 29)


if __name__ == "__main__":
    unittest.main()
