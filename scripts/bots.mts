// Fills the other seats of a room with random-move bots so you can test alone.
// Usage: BASE=http://localhost:3000 npx tsx scripts/bots.mts ROOMCODE friend1 friend2 friend3
// Bots use the password in BOT_PASSWORD (default "changeme"), sit in free seats, and play random legal moves.
const BASE = process.env.BASE ?? "http://localhost:3000";
const [code, ...names] = process.argv.slice(2);
const PASSWORD = process.env.BOT_PASSWORD ?? "changeme";
const DELAY = Number(process.env.BOT_DELAY ?? 900);
if (!code || !names.length) throw new Error("usage: bots.mts ROOMCODE user1 [user2 user3]");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function login(u: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: u, password: PASSWORD, force: true }),
  });
  if (!res.ok) throw new Error(`login ${u}: ${await res.text()}`);
  return res.headers.get("set-cookie")!.split(";")[0];
}

async function call(cookie: string, body?: unknown) {
  const res = await fetch(`${BASE}/api/rooms/${code}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const bots = [];
for (const n of names) {
  const cookie = await login(n);
  let v = await call(cookie);
  if (!v.started && v.mySeat === null) {
    const free = v.seats.findIndex((s: string | null) => !s);
    if (free >= 0) v = await call(cookie, { op: "sit", seat: free });
  }
  bots.push(cookie);
  console.log(`${n} ready`);
}

while (true) {
  await sleep(DELAY);
  for (const cookie of bots) {
    try {
      const v = await call(cookie);
      const r = v.game?.round;
      if (!r || r.phase === "done") continue;
      let action;
      if (r.phase === "double" || r.phase === "redouble") {
        if (!r.doubleDeciders.includes(v.mySeat)) continue;
        action = Math.random() < 0.25 ? { type: r.phase } : { type: "noDouble" };
      } else if (r.turn !== v.mySeat) continue;
      else if (r.phase === "bidding") action = r.minBid <= 18 && Math.random() < 0.4 ? { type: "bid", value: r.minBid } : { type: "pass" };
      else if (r.phase === "trump") action = { type: "chooseTrump", suit: pick(["S", "H", "D", "C"]) };
      else if (r.legal.canReveal && Math.random() < 0.4) action = { type: "revealTrump" };
      else action = { type: "play", card: pick(r.legal.cards) };
      await call(cookie, { op: "action", action });
      break; // one move per tick so humans can follow along
    } catch (e) {
      console.error((e as Error).message);
    }
  }
}
