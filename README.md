# Card-Games

## 29 (Indian/Bengali/Odia variant) server engine

This repository now includes a complete server-side rule engine for the traditional 4-player partnership game **29** in `game29/engine.py`.

Implemented rules include:

- 32-card deck with authentic 29 rank/point system.
- 4+4 dealing flow with bidding in between.
- Bidding from 16 to 28 with full bid history.
- Hidden trump selection and legal reveal behavior.
- Follow-suit enforcement and trick resolution.
- Royal Pair (trump K+Q) declaration after trump reveal with ±4 adjusted bid target and min/max clamp.
- Double/redouble challenge flow with configurable deadline and multipliers (×1/×2/×4).
- 8-trick round scoring with automatic last-trick +1 bonus.
- Declarer success/fail resolution using adjusted target.
- Traditional black/red mark tracking and configurable winning marks.
- Dealer rotation after every round.

## Quick usage

```python
from game29 import TwentyNineGame, GameSettings, Suit

game = TwentyNineGame(GameSettings(hidden_trump_mode=True))
game.start_round()
# run bidding via game.bid(...)
# declarer chooses trump via game.select_trump(...)
# play cards via game.play_card(...)
# finish via game.finish_round()
```

## Tests

Run:

```bash
python -m unittest discover -s tests
```
