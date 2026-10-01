// Drives a real game through the HTTP API with 4 logged-in users.
// Usage: BASE=http://localhost:3000 tsx scripts/e2e.ts [tricksIntoSecondRound]
const BASE = process.env.BASE ?? "http://localhost:3000";
const tag = Math.floor(Math.random() * 1e5);
const USERS = ["e2ea", "e2eb", "e2ec", "e2ed"].map((u) => u + tag);
const stopAfter = Number(process.argv[2] ?? 3);

async function login(u: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: u, password: "changeme" }),
  });
  if (!res.ok) throw new Error(`login ${u}: ${await res.text()}`);
  return res.headers.get("set-cookie")!.split(";")[0];
}

async function call(cookie: string, path: string, body?: unknown) {
  const res = await fetch(BASE + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} ${JSON.stringify(body)}: ${data.error}`);
  return data;
}

const cookies = await Promise.all(USERS.map(login));
const { code } = await call(cookies[0], "/api/rooms", {});
for (let s = 1; s < 4; s++) await call(cookies[s], `/api/rooms/${code}`, { op: "sit", seat: s });
await call(cookies[0], `/api/rooms/${code}`, { op: "start" });

let roundsDone = 0;
for (let step = 0; step < 400; step++) {
  const views = await Promise.all(cookies.map((c) => call(c, `/api/rooms/${code}`)));
  const r = views[0].game.round;
  if (r.phase === "double" || r.phase === "redouble") {
    const s = r.doubleDeciders[0];
    await call(cookies[s], `/api/rooms/${code}`, { op: "action", action: { type: "noDouble" } });
    continue;
  }
  const turn = r.turn;
  const v = views[turn].game.round;
  // hidden info check: no one else sees the trump suit before reveal
  if (r.phase === "playing" && !r.trumpRevealed)
    views.forEach((vw: any, s: number) => {
      if (s !== r.bidder && vw.game.round.trumpSuit) throw new Error("trump leaked");
    });
  if (r.phase === "done") {
    roundsDone++;
    console.log(`round ${r.number}: bid ${r.result.bid} by seat ${r.result.bidder}, got ${r.result.bidderPoints} → ${r.result.made ? "made" : "down"}; score`, views[0].game.score);
    await call(cookies[0], `/api/rooms/${code}`, { op: "action", action: { type: "nextRound" } });
    continue;
  }
  if (roundsDone >= 1 && r.phase === "playing" && r.tricks.length >= stopAfter && r.trick.length === 0) break;
  let action: any;
  if (v.phase === "bidding") action = v.bids.length === 0 ? { type: "bid", value: 17 } : { type: "pass" };
  else if (v.phase === "trump") action = { type: "chooseTrump", suit: "H" };
  else if (v.legal.canReveal && Math.random() < 0.5) action = { type: "revealTrump" };
  else action = { type: "play", card: v.legal.cards[Math.floor(Math.random() * v.legal.cards.length)] };
  await call(cookies[turn], `/api/rooms/${code}`, { op: "action", action });
}
console.log("ROOM", code);
