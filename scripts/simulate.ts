// Engine smoke test: plays many random games with random legal moves and checks invariants.
import { applyAction, newMatch, viewFor, legalPlays, canDeclareMarriage, doubleDeciders, bidRange, Match, Action } from "../lib/engine/game";
import { pointsOf } from "../lib/engine/cards";

function seeded(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const GAMES = 3000;
let reveals = 0, marriages = 0, made = 0, doubles = 0, early = 0, redeals = 0, highBids = 0;

for (let g = 0; g < GAMES; g++) {
  const rng = seeded(g + 1);
  let m: Match = newMatch(rng);
  for (let round = 0; round < 3; round++) {
    let guard = 0;
    while (m.round!.phase !== "done") {
      assert(guard++ < 2000, "stuck");
      const r = m.round!;
      const seat = r.turn;
      // occasionally someone declares marriage
      for (let s = 0; s < 4; s++) if (canDeclareMarriage(r, s) && rng() < 0.5) { m = applyAction(m, s, { type: "marriage" }, rng); marriages++; }
      const rr = m.round!;
      if (rr.phase === "done") break; // a marriage can settle the round
      let action: Action;
      if (rr.phase === "bidding") {
        const { min, max } = bidRange(rr.highBid);
        // bids over 24 must be refused until someone has bid 24
        if (max === 24 && min <= 24) {
          let threw = false;
          try { applyAction(m, seat, { type: "bid", value: 25 }, rng); } catch { threw = true; }
          assert(threw, "25 allowed before anyone bid 24");
        }
        action = min <= max && rng() < 0.45 ? { type: "bid", value: min + Math.floor(rng() * (max - min + 1) * 0.3) } : { type: "pass" };
        m = applyAction(m, seat, action, rng);
        if (action.type === "bid" && action.value > 24) highBids++;
        continue;
      }
      if (rr.phase === "trump") {
        const hand = rr.hands[seat];
        assert(hand.length === 4, "bidder should have 4 cards when choosing trump");
        const suit = (["S", "H", "D", "C"] as const)[Math.floor(rng() * 4)];
        m = applyAction(m, seat, { type: "chooseTrump", suit }, rng);
        if (m.round!.phase === "bidding") {
          redeals++; // opponents held no trump: same dealer, fresh deal
          assert(m.round!.dealer === rr.dealer && m.round!.number === rr.number, "redeal keeps dealer and round number");
          continue;
        }
        assert(m.round!.hands.every((h) => h.length === 8), "8 cards each after trump chosen");
        const opp = [0, 1, 2, 3].filter((s) => s % 2 !== seat % 2);
        assert(opp.some((s) => m.round!.hands[s].some((c) => c.endsWith(suit))), "opponents hold at least one trump");
        assert(viewFor(m, (seat + 1) % 4).round!.trumpSuit === null, "trump suit hidden from others");
        assert(viewFor(m, seat).round!.trumpSuit !== null, "bidder sees trump suit");
        continue;
      }
      if (rr.phase === "double" || rr.phase === "redouble") {
        const who = doubleDeciders(rr);
        assert(who.length > 0, "someone must decide double");
        const s = who[Math.floor(rng() * who.length)];
        const yes = rng() < 0.2;
        m = applyAction(m, s, { type: yes ? (rr.phase === "double" ? "double" : "redouble") : "noDouble" }, rng);
        if (yes) doubles++;
        continue;
      }
      const legal = legalPlays(rr, seat);
      if (legal.canReveal && rng() < 0.5) {
        m = applyAction(m, seat, { type: "revealTrump" }, rng);
        reveals++;
        const after = legalPlays(m.round!, seat);
        const trumps = m.round!.hands[seat].filter((c) => c.endsWith(m.round!.trumpSuit!));
        if (trumps.length) assert(after.cards.every((c) => trumps.includes(c)), "asker must play trump if they have one");
        else assert(after.cards.length === m.round!.hands[seat].length, "asker with no trump may play anything");
        continue;
      }
      assert(legal.cards.length > 0, "no legal cards");
      // view must never leak other hands
      const v = viewFor(m, seat);
      assert(v.round!.hand.length === rr.hands[seat].length, "view hand mismatch");
      m = applyAction(m, seat, { type: "play", card: legal.cards[Math.floor(rng() * legal.cards.length)] }, rng);
    }
    const r = m.round!;
    const n = r.tricks.length;
    const all = r.tricks.flatMap((t) => t.cards.map((c) => c.card));
    assert(new Set(all).size === n * 4, "every played card unique");
    assert(all.reduce((s, c) => s + pointsOf(c), 0) === r.points.A + r.points.B, "points match cards played");
    assert(r.hands.every((h) => h.length === 8 - n), "hands shrink evenly");
    assert(r.result!.handsPlayed === n, "handsPlayed recorded");
    if (n === 8) {
      assert(r.points.A + r.points.B === 28, "28 points total");
    } else {
      early++;
      // Ended early: the result must be beyond doubt even if every remaining point went the other way.
      const bt = r.result!.bidderTeam;
      const left = 28 - r.points.A - r.points.B;
      if (r.result!.made) assert(r.points[bt] >= r.result!.target, "early made needs target reached");
      else assert(r.points[bt] + left < r.result!.target, "early loss needs target out of reach");
    }
    if (r.result!.made) made++;
    assert(Math.abs(r.result!.delta.A + r.result!.delta.B) === r.multiplier, "score delta = multiplier");
    m = applyAction(m, 0, { type: m.winner ? "playAgain" : "nextRound" }, rng);
  }
}

// Games end at +6 / −6 and can be replayed
{
  let finished = 0;
  for (let g = 0; g < 200; g++) {
    const rng = seeded(10_000 + g);
    let m: Match = newMatch(rng);
    let guard = 0;
    while (!m.winner) {
      assert(guard++ < 20_000, "game never ended");
      const r = m.round!;
      if (r.phase === "done") { m = applyAction(m, 0, { type: "nextRound" }, rng); continue; }
      if (r.phase === "bidding") { m = applyAction(m, r.turn, r.bids.length === 0 ? { type: "bid", value: 16 + Math.floor(rng() * 4) } : { type: "pass" }, rng); continue; }
      if (r.phase === "trump") { m = applyAction(m, r.turn, { type: "chooseTrump", suit: "S" }, rng); continue; }
      if (r.phase === "double" || r.phase === "redouble") { m = applyAction(m, doubleDeciders(r)[0], { type: "noDouble" }, rng); continue; }
      const legal = legalPlays(r, r.turn);
      m = applyAction(m, r.turn, { type: "play", card: legal.cards[Math.floor(rng() * legal.cards.length)] }, rng);
    }
    const w = m.winner;
    assert(m.score[w] >= 6 || m.score[w === "A" ? "B" : "A"] <= -6, "winner reached +6 or other team −6");
    let threw = false;
    try { applyAction(m, 0, { type: "nextRound" }, rng); } catch { threw = true; }
    assert(threw, "no next round after game over");
    const again = applyAction(m, 0, { type: "playAgain" }, rng);
    assert(again.score.A === 0 && again.score.B === 0 && !again.winner && again.gamesWon![w] === m.gamesWon![w], "play again resets score, keeps games won");
    finished++;
  }
  console.log(`games played to ±6: ${finished}`);
}

// Illegal actions are rejected
{
  const m = newMatch(seeded(42));
  const wrong = (m.round!.turn + 1) % 4;
  let threw = false;
  try { applyAction(m, wrong, { type: "pass" }); } catch { threw = true; }
  assert(threw, "out-of-turn action should throw");
  threw = false;
  try { applyAction(m, m.round!.turn, { type: "bid", value: 15 }); } catch { threw = true; }
  assert(threw, "bid below 16 should throw");
}

console.log(`OK: ${GAMES * 3} rounds simulated. reveals=${reveals} marriages=${marriages} bids made=${made} doubles/redoubles=${doubles} endedEarly=${early} noTrumpRedeals=${redeals} bidsOver24=${highBids}`);
