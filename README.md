# Games for friends: 29, Bridge, Ludo, Snakes & Ladders, Bluff, Uno, Tic-tac-toe, Dots & Boxes

Next.js app on Vercel. Login → create a room (choose the game) or join one by code → pick seats → play.
Settings → Rules shows the rules of the game you're in.

## Accounts

- Logging in with a new username creates that account with the password you typed.
- An existing username needs its password. The login is refused while the account is in use, meaning it's open on another device (a page sent a heartbeat in the last minute) or seated in a room. You then get a **Log out everywhere else & log in here** button. It signs out the other devices within about 20 seconds and keeps your seat.
- A wrong password offers **Reset password to 1234**. Resets are refused while the account is in use.
- If your password is `1234`, the home screen shows a red reminder to change it. Changing it only asks for the new password.
- A player can be in only one room at a time. A room stops counting once someone presses **End game** or it has been idle for 2 hours. Logging out from a lobby frees your seat.

## Games

Each game plugs into `lib/games`. A `GameDef` provides: new match for N players, apply action, per-player view, bot move, and bot pacing. Each game also has its own screen in `components`. `lib/games/catalog.ts` lists every game with its player count (min–max), whether it has fixed teams, and seat names. Rooms, accounts, lobby, bots, sounds, settings and themes are shared, and newer games use the shared `GameFrame` (top strip, players, status, win screen). Rooms made before multiple games existed are treated as 29.

| Game | Players | Notes |
|---|---|---|
| 29 | 4 (2 teams) | See below |
| Contract Bridge | 4 (2 partnerships) | Chicago scoring |
| Ludo | 2–4 | 6 to leave base; extra roll on 6, capture or home; three 6s end the turn; safe stars and starts; exact roll home |
| Snakes & Ladders | 2–4 | Classic board; exact roll for 100; 6 rolls again |
| Bluff | 3–6 | Claim a rank, play 1–4 cards face down; anyone can call bluff; all pass → pile cleared |
| Uno | 2–6 | 108-card deck; draw 1 if you can't play; automatic UNO |
| Tic-tac-toe | 2 | Starter alternates; running score |
| Dots & Boxes | 2–4 | 4×4 boxes for 2 players, 5×5 for 3–4; closing a box = another turn |

In non-team games, players can start once the minimum is seated; empty seats are dropped at the start. `scripts/games-test.ts` plays every game with bots at every player count and checks key rules.

### Contract Bridge (Chicago)

- 52 cards, 13 each, clockwise play. The dealer calls first: bids 1♣–7NT, Pass, Double, Redouble. Three passes after a bid end the auction; four opening passes mean the same dealer redeals.
- The declarer plays dummy's cards, which go face up after the opening lead.
- Chicago: 4 deals, with vulnerability none / dealer's side / dealer's side / both. Standard scoring (contract points, game/part-score, slam, doubled/redoubled, overtricks, undertricks), with a breakdown after each deal. Highest total wins.
- Bots use basic natural bidding (high-card points and suit length, no conventions) and simple card play. The engine is in `lib/games/bridge`; `scripts/bridge-test.ts` checks scoring against standard tables and plays 400 all-bot Chicagos.

## 29 rules

- 32 cards (J 9 A 10 K Q 8 7 in each suit). Points: J=3, 9=2, A=1, 10=1 → 28 per round.
- Partners sit opposite: South+North = Team A, East+West = Team B. Play goes **anticlockwise**.
- 4 cards each, then bidding from the dealer's right. Bid or pass; a pass is final. Each bid must beat the last one. Bids are **16–24** until someone bids exactly 24; after that any higher bid up to **28** is allowed. If all four pass, the next dealer redeals.
- The bid winner secretly **chooses a trump suit**. Then 4 more cards each. If the opponent team between them holds **no trump at all**, the same dealer redeals.
- Must follow suit. Anyone (including the bidder) may lead any suit.
- If you can't follow suit you may play any card. You may also **Ask for trump** first, which reveals the trump suit to everyone. The player who asked must then play a trump if they have one; otherwise they may play anything. Until it's revealed there is no trump.
- **Marriage**: once trump is revealed, a player holding K+Q of trump can declare it. If they're on the bidder's team the target drops by 4 (min 16), otherwise it rises by 4 (max 28).
- After trump is chosen, the other team may **Double**. If they do, the bidding team may **Redouble**. Each player on the deciding team answers once.
- The round ends as soon as the result is certain: the bidding team has reached its target, or can't reach it even by winning every remaining hand. A marriage that could still be declared counts as well, so the result must hold whether or not the target moves by 4.
- The bidding team scores +1 game point if it reaches the target, otherwise −1. That's ×2 if doubled and ×4 if redoubled.
- The game ends when a team reaches **+6** (they win) or **−6** (they lose). **Play again** resets the score with the same seats, and the room keeps a count of games won.

The rules live in `lib/engine/game.ts` and the bot brain in `lib/engine/bot.ts` (pure TypeScript, no framework code). `npm test` plays 9,000 random rounds and checks the invariants, then checks that all-bot games only make legal moves and that bots beat random players.

## Run locally

```bash
npm install
cp .env.example .env.local   # then set AUTH_SECRET
npm run dev
```

Without Redis configured, state lives in memory (fine for local testing).

**Playing with bots:** in the lobby, tap **+ Add bot** on any empty seat, or **✕ Remove bot** to free it again. Once a game has started, a friend who opens the room link can **take over a bot's seat**, keeping its cards and team score. Bots bid on hand strength, choose their strongest suit as trump, and play sensibly. They move when a player's screen checks for updates (Vercel has no always-on server), about once a second, with a longer pause after each hand. If every human closes the game, the bots wait.

**Sounds:** cards, dealing, your turn, hand collected, bids, trump reveal, marriage, double, round won/lost and game won/lost. They're synthesized in the browser, so there are no audio files. The 🔊 control at the top sets the volume, defaults to 60%, and is saved per device.

`scripts/bots.mts` is an older test helper that plays from separate accounts over HTTP.

## Deploy to Vercel

1. Push this folder to a GitHub repo and import it in Vercel.
2. In the Vercel project go to **Storage → Marketplace → Upstash (Redis)**, create a free database and connect it. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
3. Under **Settings → Environment Variables** add:
   - `AUTH_SECRET`: a long random string (`openssl rand -base64 32`)
4. Deploy. Everyone logs in with a username and password of their choice.

## Staging

- Work is pushed to the `staging` branch first. Vercel builds it as a preview deployment, which shows a **STAGING** badge. After it's checked there, `staging` is merged into `main` (production).
- Staging shares the production Upstash database, but every key it uses is prefixed with `staging:`. Accounts, rooms and games on staging are completely separate from the live site.

## How it works

- Vercel functions can't keep websockets open, so each browser polls `GET /api/rooms/CODE?v=N` once a second. The server returns `204` if nothing changed.
- Each room is stored as one Redis key with a version number. Writes use a compare-and-set Lua script, so two simultaneous moves can't overwrite each other.
- The server sends each player only their own hand. The trump suit is sent only to the bidder until it's revealed.
- A 1-hour game uses about 15k Redis commands, which fits within the Upstash free tier for casual play.
