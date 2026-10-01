import unittest

import app as webapp


class TestWebApp(unittest.TestCase):
    def setUp(self):
        webapp.app.config.update(TESTING=True, SECRET_KEY="test-only-secret")
        self.client = webapp.app.test_client()

    def test_round_can_be_played_through_the_web_session(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Twenty-nine", response.data)

        self.client.post("/", data={"action": "bid", "amount": "16"})
        for _ in range(3):
            self.client.post("/", data={"action": "bid", "amount": ""})

        with self.client.session_transaction() as session:
            state = session["game"]["state"]
            self.assertEqual(state["phase"], "TRUMP_SELECTION")
            declarer = state["declarer"]

        self.client.post("/", data={"action": "trump", "suit": "S"})

        with self.client.session_transaction() as session:
            state = session["game"]["state"]
            player = state["current_turn"]
            card = state["hands"][player][0]

        response = self.client.post(
            "/",
            data={"action": "play", "card": f'{card["suit"]}:{card["rank"]}'},
            follow_redirects=True,
        )
        self.assertEqual(response.status_code, 200)
        with self.client.session_transaction() as session:
            state = session["game"]["state"]
            self.assertEqual(len(state["current_trick"]), 1)
            self.assertEqual(state["declarer"], declarer)

        while True:
            with self.client.session_transaction() as session:
                state = session["game"]["state"]
                if state["phase"] != "PLAYING":
                    self.assertEqual(state["phase"], "ROUND_ENDED")
                    break
                player = state["current_turn"]
                hand = state["hands"][player]
                lead_suit = (
                    state["current_trick"][0][1]["suit"]
                    if state["current_trick"]
                    else None
                )
                card = next(
                    (item for item in hand if item["suit"] == lead_suit),
                    hand[0],
                )
            self.client.post(
                "/",
                data={"action": "play", "card": f'{card["suit"]}:{card["rank"]}'},
            )

        response = self.client.post("/", data={"action": "score"}, follow_redirects=True)
        self.assertEqual(response.status_code, 200)
        with self.client.session_transaction() as session:
            self.assertEqual(session["game"]["state"]["phase"], "IDLE")
            self.assertIn(session["last_result"]["declarer_team"], ("NS", "EW"))

    def test_invalid_bid_keeps_round_in_bidding(self):
        response = self.client.post(
            "/", data={"action": "bid", "amount": "15"}, follow_redirects=True
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn(b"Bid out of range", response.data)
        with self.client.session_transaction() as session:
            self.assertEqual(session["game"]["state"]["phase"], "BIDDING")


if __name__ == "__main__":
    unittest.main()
