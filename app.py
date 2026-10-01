import copy
import os
import secrets
from dataclasses import asdict
from enum import Enum

from flask import Flask, flash, redirect, render_template, request, session, url_for

from game29.engine import (
    BidEntry,
    Card,
    GameError,
    GameSettings,
    RoundState,
    Suit,
    TeamScore,
    Trick,
    TwentyNineGame,
)


app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_SECURE"] = bool(os.environ.get("VERCEL"))

SUIT_SYMBOLS = {
    Suit.SPADES: "♠",
    Suit.HEARTS: "♥",
    Suit.DIAMONDS: "♦",
    Suit.CLUBS: "♣",
}
PLAYERS = ("N", "E", "S", "W")


def _save_game(game):
    data = _json_safe(asdict(game.state))
    data["passed"] = sorted(data["passed"])
    session["game"] = {
        "state": data,
        "scores": {team: asdict(score) for team, score in game.scores.items()},
        "settings": asdict(game.settings),
    }


def _json_safe(value):
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [_json_safe(item) for item in value]
    return value


def _load_game():
    saved = session.get("game")
    if not saved:
        game = TwentyNineGame()
        game.start_round()
        _save_game(game)
        return game

    game = TwentyNineGame(settings=GameSettings(**saved["settings"]))
    state = copy.deepcopy(saved["state"])
    for player, hand in state["hands"].items():
        state["hands"][player] = [Card(Suit(card["suit"]), card["rank"]) for card in hand]
    state["remaining_deck"] = [
        Card(Suit(card["suit"]), card["rank"]) for card in state["remaining_deck"]
    ]
    state["current_trick"] = [
        (player, Card(Suit(card["suit"]), card["rank"]))
        for player, card in state["current_trick"]
    ]
    state["tricks"] = [
        Trick(
            leader=trick["leader"],
            plays=[
                (player, Card(Suit(card["suit"]), card["rank"]))
                for player, card in trick["plays"]
            ],
            winner=trick["winner"],
        )
        for trick in state["tricks"]
    ]
    state["bids"] = [BidEntry(**bid) for bid in state["bids"]]
    state["passed"] = set(state["passed"])
    if state["trump"] is not None:
        state["trump"] = Suit(state["trump"])
    game.state = RoundState(**state)
    game.scores = {team: TeamScore(**score) for team, score in saved["scores"].items()}
    return game


def _new_round(game):
    next_game = TwentyNineGame(settings=game.settings)
    next_game.state.dealer_index = game.state.dealer_index
    next_game.scores = game.scores
    next_game.start_round()
    session.pop("last_result", None)
    return next_game


@app.route("/", methods=["GET", "POST"])
def home():
    game = _load_game()
    if request.method == "POST":
        action = request.form.get("action")
        try:
            if action == "bid":
                amount = request.form.get("amount", "").strip()
                game.bid(game.state.current_turn, int(amount) if amount else None)
            elif action == "trump":
                game.select_trump(game.state.current_turn, Suit(request.form["suit"]))
            elif action == "play":
                suit, rank = request.form["card"].split(":", 1)
                card = Card(Suit(suit), rank)
                game.play_card(
                    game.state.current_turn,
                    card,
                    reveal_trump=request.form.get("reveal_trump") == "yes",
                )
            elif action == "pair":
                game.declare_pair(game.state.current_turn)
            elif action == "double":
                game.call_double(game.state.current_turn)
            elif action == "redouble":
                game.call_redouble(game.state.current_turn)
            elif action == "score":
                session["last_result"] = asdict(game.finish_round())
            elif action == "new_round":
                game = _new_round(game)
            elif action == "new_game":
                game = TwentyNineGame()
                game.start_round()
                session.pop("last_result", None)
            else:
                flash("Unknown action.", "error")
                return redirect(url_for("home"))
            _save_game(game)
        except (GameError, ValueError, KeyError) as error:
            flash(str(error), "error")
        return redirect(url_for("home"))

    return render_template(
        "index.html",
        state=game.state,
        scores=game.scores,
        players=PLAYERS,
        suits=Suit,
        suit_symbols=SUIT_SYMBOLS,
        last_result=session.get("last_result"),
    )


if __name__ == "__main__":
    app.run()
