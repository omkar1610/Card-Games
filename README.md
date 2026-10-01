# 29 — card game for 4 friends

Next.js app on Vercel. Login → create/join a room → pick seats → play.

## Accounts

- Logging in with a new username creates that account with the password you typed.
- An existing username needs its password. The login is refused while the account is in use, meaning it's open on another device (a page sent a heartbeat in the last minute) or seated in a room. You then get a **Log out everywhere else & log in here** button. It signs out the other devices within about 20 seconds and keeps your seat.
- A wrong password offers **Reset password to 1234**. Resets are refused while the account is in use.
- If your password is `1234`, the home screen shows a red reminder to change it. Changing it only asks for the new password.
- A player can be in only one room at a time. A room stops counting once someone presses **End game** or it has been idle for 2 hours. Logging out from a lobby frees your seat.

## Rules implemented

- 32 cards (J 9 A 10 K Q 8 7 in each suit). Points: J=3, 9=2, A=1, 10=1 → 28 per round.
- Partners sit opposite: South+North = Team A, East+West = Team B. Play goes **anticlockwise**.
- 4 cards each, then bidding from the dealer's right: bid 16–28 or pass. A pass is final. If all four pass, the next dealer redeals.
- The bid winner secretly **chooses a trump suit**. Then 4 more cards each.
- Must follow suit. Anyone (including the bidder) may lead any suit.
- If you can't follow suit you may play any card. You may also **Ask for trump** first, which reveals the trump suit to everyone. Until it's revealed there is no trump.
- **Marriage**: once trump is revealed, a player holding K+Q of trump can declare it. If they're on the bidder's team the target drops by 4 (min 16), otherwise it rises by 4 (max 28).
- After trump is chosen, the other team may **Double**. If they do, the bidding team may **Redouble**. Each player on the deciding team answers once.
- The round ends as soon as the result is certain: the bidding team has reached its target, or can't reach it even by winning every remaining hand. A marriage that could still be declared counts as well, so the result must hold whether or not the target moves by 4.
- The bidding team scores +1 game point if it reaches the target, otherwise −1. That's ×2 if doubled and ×4 if redoubled.
- The game ends when a team reaches **+6** (they win) or **−6** (they lose). **Play again** resets the score with the same seats, and the room keeps a count of games won.

The rules live in `lib/engine/game.ts` (pure TypeScript, no framework code). `npm test` plays 9,000 random rounds and checks the invariants.

## Run locally

```bash
npm install
cp .env.example .env.local   # then set AUTH_SECRET
npm run dev
```

Without Redis configured, state lives in memory (fine for local testing).

**Testing solo:** create a room as one user, then fill the other seats with bots:

```bash
npx tsx scripts/bots.mts ROOMCODE raj amit neha
```

Bot accounts are created automatically with password `changeme` (override with `BOT_PASSWORD`).

## Deploy to Vercel

1. Push this folder to a GitHub repo and import it in Vercel.
2. In the Vercel project go to **Storage → Marketplace → Upstash (Redis)**, create a free database and connect it. This sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` for you.
3. Under **Settings → Environment Variables** add:
   - `AUTH_SECRET`: a long random string (`openssl rand -base64 32`)
4. Deploy. Everyone logs in with a username and password of their choice.

## How it works

- Vercel functions can't keep websockets open, so each browser polls `GET /api/rooms/CODE?v=N` once a second. The server returns `204` if nothing changed.
- Each room is stored as one Redis key with a version number. Writes use a compare-and-set Lua script, so two simultaneous moves can't overwrite each other.
- The server sends each player only their own hand. The trump suit is sent only to the bidder until it's revealed.
- A 1-hour game uses about 15k Redis commands, which fits within the Upstash free tier for casual play.
