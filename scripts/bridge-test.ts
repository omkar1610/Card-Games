// Bridge: scoring examples, auction rules, hidden info, and all-bot Chicagos.
import { scoreDeal } from "../lib/games/bridge/scoring";
import { applyAction, newMatch, viewFor, legalCalls, isLegalCall, BMatch, Contract } from "../lib/games/bridge/engine";
import { nextBridgeBotMove } from "../lib/games/bridge/bot";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function seeded(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// --- scoring against standard tables
const k = (level: number, strain: Contract["strain"], doubled: 0 | 1 | 2 = 0): Contract => ({ level, strain, doubled, declarer: 0 });
const cases: [Contract, number, boolean, boolean, number][] = [
  [k(3, "NT"), 10, false, true, 430], // 3NT+1 not vulnerable
  [k(4, "S"), 10, true, true, 620], // 4♠ vulnerable
  [k(6, "H"), 12, false, true, 980], // 6♥ small slam
  [k(2, "C", 1), 8, false, true, 180], // 2♣ doubled, made
  [k(7, "NT", 2), 13, true, true, 2980], // 7NT redoubled vulnerable
  [k(1, "NT", 1), 5, true, false, 500], // 1NT doubled vul down 2
  [k(4, "H", 1), 6, false, false, 800], // 4♥X nv down 4: 100+200+200+300
  [k(2, "D"), 7, false, false, 50], // down 1 undoubled
  [k(1, "C"), 9, false, true, 110], // 1♣+2: 20+50+40
  [k(5, "D", 1), 12, true, true, 950], // 5♦X vul +1: 200+500+50+200
];
for (const [c, tricks, vul, made, pts] of cases) {
  const s = scoreDeal(c, tricks, vul);
  assert(s.made === made && s.points === pts, `score ${c.level}${c.strain} x${c.doubled} ${tricks} tricks vul=${vul}: got ${s.points}, want ${pts}`);
}

// --- auction rules
{
  let m = newMatch(seeded(7));
  const d = m.round.dealer;
  assert(!legalCalls(m.round, d).canDouble, "can't double with no bid");
  m = applyAction(m, d, { type: "call", call: { type: "bid", level: 1, strain: "H" } });
  const lho = (d + 1) % 4;
  assert(!isLegalCall(m.round, lho, { type: "bid", level: 1, strain: "D" }), "1♦ below 1♥ refused");
  assert(isLegalCall(m.round, lho, { type: "bid", level: 1, strain: "S" }), "1♠ over 1♥ ok");
  assert(legalCalls(m.round, lho).canDouble, "opponent can double");
  m = applyAction(m, lho, { type: "call", call: { type: "double" } });
  assert(legalCalls(m.round, (d + 2) % 4).canRedouble, "partner of bidder can redouble");
  m = applyAction(m, (d + 2) % 4, { type: "call", call: { type: "pass" } });
  m = applyAction(m, (d + 3) % 4, { type: "call", call: { type: "pass" } });
  m = applyAction(m, d, { type: "call", call: { type: "pass" } });
  const r = m.round;
  assert(r.phase === "play" && r.contract!.level === 1 && r.contract!.strain === "H" && r.contract!.doubled === 1, "1♥X contract");
  assert(r.contract!.declarer === d && r.dummy === (d + 2) % 4 && r.turn === lho, "declarer, dummy, opening leader");
  assert(viewFor(m, (d + 3) % 4).round.dummyHand === null, "dummy hidden before the opening lead");
  const lead = viewFor(m, lho).round.legalCards[0];
  m = applyAction(m, lho, { type: "play", card: lead });
  assert(viewFor(m, (d + 3) % 4).round.dummyHand?.length === 13, "dummy face up after the lead");
  let threw = false;
  try { applyAction(m, r.dummy!, { type: "play", card: m.round.hands[r.dummy!][0] }); } catch { threw = true; }
  assert(threw, "dummy can't play their own cards");
  const dc = viewFor(m, d).round;
  assert(dc.playingFor === r.dummy && dc.legalCards.length > 0, "declarer plays for dummy");
}
{
  let m = newMatch(seeded(9));
  const dealer = m.round.dealer;
  for (let i = 0; i < 4; i++) m = applyAction(m, (dealer + i) % 4, { type: "call", call: { type: "pass" } });
  assert(m.round.phase === "auction" && m.round.calls.length === 0 && m.round.dealer === dealer && m.deal === 1, "passed out → same dealer redeals");
}

// --- all-bot Chicagos
let deals = 0, passedOut = 0, made = 0, games = 0, slams = 0, doubled = 0;
const levels: number[] = [];
for (let g = 0; g < 400; g++) {
  const rng = seeded(1000 + g);
  let m: BMatch = newMatch(rng);
  for (let guard = 0; !m.winner; guard++) {
    assert(guard < 5000, "chicago never ended");
    const r = m.round;
    if (r.phase === "done") { m = applyAction(m, 0, { type: "nextDeal" }, rng); continue; }
    const before = r.calls.length;
    const move = nextBridgeBotMove(m, () => true);
    assert(move, `bot stuck in ${r.phase}`);
    // other seats never see hidden hands
    const other = (r.turn + 1) % 4;
    assert(viewFor(m, other).round.hand.length === r.hands[other].length, "view hand");
    m = applyAction(m, move.seat, move.action, rng);
    if (move.action.type === "call" && m.round.calls.length === 0 && before === 3) passedOut++;
  }
  for (const res of m.history) {
    deals++;
    levels.push(res.contract.level);
    if (res.made) made++;
    if (res.contract.level >= 6) slams++;
    if (res.contract.doubled) doubled++;
    const t = res.tricks;
    assert(t >= 0 && t <= 13, "tricks in range");
    assert(res.pointsTo.A + res.pointsTo.B === res.points, "points go to one side");
  }
  assert(m.history.length === 4, "4 deals per Chicago");
  games++;
}
const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
console.log(`bridge OK: scoring cases ${cases.length}; ${games} all-bot Chicagos, ${deals} deals; passed out ${passedOut}; made ${Math.round((made / deals) * 100)}%; avg contract level ${avg.toFixed(1)}; slams ${slams}; doubled ${doubled}`);
