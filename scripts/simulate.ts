// Engine smoke test: plays many random games with random legal moves and checks invariants.
import { applyAction, newMatch, viewFor, legalPlays, canDeclareMarriage, doubleDeciders, Match, Action } from "../lib/engine/game";
import { pointsOf } from "../lib/engine/cards";

function seeded(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const GAMES = 3000;
let reveals = 0, marriages = 0, made = 0, doubles = 0;

for (let g = 0; g < GAMES; g++) {
  const rng = seeded(g + 1);
  let m: Match = newMatch(rng);
  for (let round = 0; round < 3; round++) {
    let guard = 0;
    while (m.round!.phase !== "done") {
      assert(guard++ < 500, "stuck");
      const r = m.round!;
      const seat = r.turn;
      // occasionally someone declares marriage
      for (let s = 0; s < 4; s++) if (canDeclareMarriage(r, s) && rng() < 0.5) { m = applyAction(m, s, { type: "marriage" }, rng); marriages++; }
      const rr = m.round!;
      let action: Action;
      if (rr.phase === "bidding") {
        const min = rr.highBid === null ? 16 : rr.highBid + 1;
        action = min <= 28 && rng() < 0.4 ? { type: "bid", value: Math.min(28, min + Math.floor(rng() * 2)) } : { type: "pass" };
        m = applyAction(m, seat, action, rng);
        continue;
      }
      if (rr.phase === "trump") {
        const hand = rr.hands[seat];
        assert(hand.length === 4, "bidder should have 4 cards when choosing trump");
        m = applyAction(m, seat, { type: "chooseTrump", suit: (["S", "H", "D", "C"] as const)[Math.floor(rng() * 4)] }, rng);
        assert(m.round!.hands.every((h) => h.length === 8), "8 cards each after trump chosen");
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
        continue;
      }
      assert(legal.cards.length > 0, "no legal cards");
      // view must never leak other hands
      const v = viewFor(m, seat);
      assert(v.round!.hand.length === rr.hands[seat].length, "view hand mismatch");
      m = applyAction(m, seat, { type: "play", card: legal.cards[Math.floor(rng() * legal.cards.length)] }, rng);
    }
    const r = m.round!;
    assert(r.tricks.length === 8, "8 tricks");
    assert(r.points.A + r.points.B === 28, "28 points total");
    assert(r.hands.every((h) => h.length === 0), "hands empty");
    const all = r.tricks.flatMap((t) => t.cards.map((c) => c.card));
    assert(new Set(all).size === 32, "every card played once");
    assert(all.reduce((s, c) => s + pointsOf(c), 0) === 28, "points sum");
    if (r.result!.made) made++;
    assert(Math.abs(r.result!.delta.A + r.result!.delta.B) === r.multiplier, "score delta = multiplier");
    m = applyAction(m, 0, { type: "nextRound" }, rng);
  }
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

console.log(`OK: ${GAMES * 3} rounds simulated. reveals=${reveals} marriages=${marriages} bids made=${made} doubles/redoubles=${doubles}`);
