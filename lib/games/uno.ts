// Uno: 2–6 players, standard 108-card deck. Match the top card's colour or symbol, or play a Wild.
// Skip, Reverse (acts as Skip with 2 players), +2, Wild, Wild +4. Can't play → draw 1; you may play
// it if it fits, otherwise pass. "UNO!" is announced automatically. First to empty their hand wins.
//
// Cards are strings "<colour><value>#<n>": colour R/Y/G/B or W (wild); value 0–9, S (skip),
// R (reverse), D (+2), W (wild), F (wild +4). #n keeps duplicates distinct.
import type { GameDef } from "./types";
import { Log, fail, pushLog } from "./common";
import { shuffle } from "../engine/cards";

export type UColour = "R" | "Y" | "G" | "B";
export const UCOLOURS: UColour[] = ["R", "Y", "G", "B"];
export const UCOLOUR_NAME: Record<UColour, string> = { R: "red", Y: "yellow", G: "green", B: "blue" };

export const ucolour = (card: string) => card[0];
export const uvalue = (card: string) => card.slice(1, card.indexOf("#"));
export const isWild = (card: string) => card[0] === "W";

export function unoDeck(): string[] {
  const d: string[] = [];
  let n = 0;
  for (const c of UCOLOURS) {
    d.push(`${c}0#${n++}`);
    for (const v of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "S", "R", "D"]) d.push(`${c}${v}#${n++}`, `${c}${v}#${n++}`);
  }
  for (let i = 0; i < 4; i++) d.push(`WW#${n++}`, `WF#${n++}`);
  return d;
}

export function cardLabel(card: string): string {
  const v = uvalue(card);
  return v === "S" ? "Skip" : v === "R" ? "Reverse" : v === "D" ? "+2" : v === "W" ? "Wild" : v === "F" ? "Wild +4" : v;
}

export interface UMatch {
  players: number;
  hands: string[][];
  draw: string[];
  discard: string[]; // top = last
  colour: UColour; // colour in play (wilds set it)
  turn: number;
  direction: 1 | -1;
  drawnCard: string | null; // card just drawn by the player whose turn it is (may play it or pass)
  starter: number;
  winner: number | null;
  wins: number[];
  log: Log[];
}
export type UAction =
  | { type: "play"; card: string; colour?: UColour }
  | { type: "draw" }
  | { type: "pass" }
  | { type: "playAgain" };

export interface UView {
  mySeat: number;
  players: number;
  hand: string[];
  handCounts: number[];
  top: string;
  colour: UColour;
  turn: number;
  direction: 1 | -1;
  drawCount: number;
  drawnCard: string | null; // only shown to the player who drew it
  playable: string[];
  winner: number | null;
  wins: number[];
  log: Log[];
}

const next = (m: UMatch, from = m.turn, steps = 1) => (((from + m.direction * steps) % m.players) + m.players) % m.players;

export function canPlay(card: string, top: string, colour: UColour): boolean {
  if (isWild(card)) return true;
  return ucolour(card) === colour || uvalue(card) === uvalue(top);
}

function takeCards(m: UMatch, seat: number, n: number) {
  for (let i = 0; i < n; i++) {
    if (!m.draw.length) {
      const top = m.discard.pop()!;
      m.draw = shuffle(m.discard);
      m.discard = [top];
      if (!m.draw.length) return; // everything is in hands
    }
    m.hands[seat].push(m.draw.pop()!);
  }
}

function fresh(players: number, starter: number, prev?: UMatch): UMatch {
  let deck = shuffle(unoDeck());
  const hands = Array.from({ length: players }, () => deck.splice(0, 7));
  // First discard must be a plain number card.
  let i = deck.findIndex((c) => /^[RYGB]\d/.test(c));
  const top = deck.splice(i, 1)[0];
  deck = shuffle(deck);
  return {
    players,
    hands,
    draw: deck,
    discard: [top],
    colour: ucolour(top) as UColour,
    turn: starter,
    direction: 1,
    drawnCard: null,
    starter,
    winner: null,
    wins: prev?.wins ?? Array(players).fill(0),
    log: [{ seat: starter, text: "goes first" }],
  };
}

export function playableFor(m: UMatch, seat: number): string[] {
  if (m.winner !== null || m.turn !== seat) return [];
  const top = m.discard[m.discard.length - 1];
  if (m.drawnCard) return canPlay(m.drawnCard, top, m.colour) ? [m.drawnCard] : [];
  return m.hands[seat].filter((c) => canPlay(c, top, m.colour));
}

function apply(input: UMatch, seat: number, a: UAction): UMatch {
  const m: UMatch = structuredClone(input);
  if (a.type === "playAgain") {
    if (m.winner === null) fail("The game isn't over");
    return fresh(m.players, (m.starter + 1) % m.players, m);
  }
  if (m.winner !== null) fail("The game is over");
  if (m.turn !== seat) fail("Not your turn");

  if (a.type === "draw") {
    if (m.drawnCard) fail("You already drew — play it or pass");
    takeCards(m, seat, 1);
    const card = m.hands[seat][m.hands[seat].length - 1];
    m.drawnCard = card ?? null;
    pushLog(m.log, seat, "drew a card");
    if (!card || !canPlay(card, m.discard[m.discard.length - 1], m.colour)) {
      m.drawnCard = null;
      m.turn = next(m);
    }
    return m;
  }
  if (a.type === "pass") {
    if (!m.drawnCard) fail("Draw a card first");
    m.drawnCard = null;
    pushLog(m.log, seat, "passed");
    m.turn = next(m);
    return m;
  }

  // play
  if (!playableFor(m, seat).includes(a.card)) fail("You can't play that card");
  if (isWild(a.card) && !UCOLOURS.includes(a.colour as UColour)) fail("Choose a colour");
  m.hands[seat].splice(m.hands[seat].indexOf(a.card), 1);
  m.discard.push(a.card);
  m.drawnCard = null;
  m.colour = isWild(a.card) ? (a.colour as UColour) : (ucolour(a.card) as UColour);
  const v = uvalue(a.card);
  pushLog(m.log, seat, `played ${isWild(a.card) ? `${cardLabel(a.card)} → ${UCOLOUR_NAME[m.colour]}` : `${UCOLOUR_NAME[ucolour(a.card) as UColour]} ${cardLabel(a.card)}`}`);
  if (m.hands[seat].length === 1) pushLog(m.log, seat, "UNO!");
  if (m.hands[seat].length === 0) {
    m.winner = seat;
    m.wins[seat] += 1;
    pushLog(m.log, seat, "is out and wins!");
    return m;
  }
  if (v === "R") {
    m.direction = m.direction === 1 ? -1 : 1;
    m.turn = m.players === 2 ? seat : next(m);
  } else if (v === "S") {
    m.turn = next(m, seat, 2);
  } else if (v === "D" || v === "F") {
    const victim = next(m);
    takeCards(m, victim, v === "D" ? 2 : 4);
    pushLog(m.log, victim, `draws ${v === "D" ? 2 : 4} and is skipped`);
    m.turn = next(m, seat, 2);
  } else {
    m.turn = next(m);
  }
  return m;
}

function viewFor(m: UMatch, seat: number): UView {
  return {
    mySeat: seat,
    players: m.players,
    hand: m.hands[seat],
    handCounts: m.hands.map((h) => h.length),
    top: m.discard[m.discard.length - 1],
    colour: m.colour,
    turn: m.turn,
    direction: m.direction,
    drawCount: m.draw.length,
    drawnCard: m.turn === seat ? m.drawnCard : null,
    playable: playableFor(m, seat),
    winner: m.winner,
    wins: m.wins,
    log: m.log,
  };
}

/** Bot: when the next player is close to winning, hit them with actions; keep wilds for last. */
function botAction(m: UMatch, seat: number): UAction {
  const options = playableFor(m, seat);
  if (!options.length) return m.drawnCard ? { type: "pass" } : { type: "draw" };
  const hand = m.hands[seat];
  const nextCount = m.hands[next(m)].length;
  const rank = (c: string) => {
    const v = uvalue(c);
    if (isWild(c)) return v === "F" ? (nextCount <= 2 ? 9 : 1) : 0;
    if (v === "D" || v === "S" || v === "R") return nextCount <= 2 ? 8 : 4;
    return 5 + hand.filter((x) => ucolour(x) === ucolour(c)).length / 10;
  };
  const card = options.reduce((a, b) => (rank(b) > rank(a) ? b : a));
  const best = UCOLOURS.reduce((a, b) =>
    hand.filter((x) => ucolour(x) === b).length > hand.filter((x) => ucolour(x) === a).length ? b : a,
  );
  return isWild(card) ? { type: "play", card, colour: best } : { type: "play", card };
}

export const uno: GameDef<UMatch, UAction, UView> = {
  id: "uno",
  newMatch: (players) => fresh(players, 0),
  applyAction: apply,
  viewFor,
  nextBotMove(m, isBot) {
    if (m.winner !== null || !isBot(m.turn)) return null;
    return { seat: m.turn, action: botAction(m, m.turn) };
  },
  botDelayMs: () => 950,
};
