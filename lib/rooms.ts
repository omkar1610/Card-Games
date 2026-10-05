import { EngineError } from "./engine/game";
import { getGame } from "./games";
import { DEFAULT_GAME, GameId, gameInfo } from "./games/catalog";
import { getDisplayName } from "./auth";
import { kvDel, kvGet, kvMget, kvSet, versionGet, versionedGet, versionedWrite } from "./store";

const ROOM_TTL = 7 * 24 * 3600;
const roomKey = (code: string) => `room:${code}`;
const memberKey = (user: string) => `member:${user}`;
const botDueKey = (code: string) => `room:${code}:bot`;
/** Bots wait this long before moving, so people can follow along (longer right after a hand ends). */
const BOT_NAMES = ["Asha", "Ravi", "Meera", "Kabir", "Tara", "Dev"];
export const isBotName = (u: string | null | undefined): u is string => !!u && u.startsWith("bot:");

/** A room stops counting as "yours" once nobody has done anything in it for this long. */
const ROOM_IDLE_MS = 2 * 3600 * 1000;

export interface Room {
  code: string;
  host: string;
  createdAt: number;
  updatedAt?: number;
  ended?: boolean;
  seats: (string | null)[]; // usernames by seat; seats 0 & 2 are team A, 1 & 3 team B
  names?: Record<string, string>; // username → name as typed ("jack" → "Jack")
  game?: GameId; // missing on rooms made before multiple games existed → 29
  match: any | null; // the game's own match state (see lib/games)
}

export interface RoomView {
  code: string;
  host: string;
  seats: (string | null)[];
  names: (string | null)[]; // what to show for each seat (bots keep their "bot:" prefix)
  version: number;
  me: string;
  meName: string;
  mySeat: number | null;
  started: boolean;
  ended: boolean;
  gameId: GameId;
  game: any | null; // that game's per-player view
}

export class RoomError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

const isLive = (room: Room) => !room.ended && Date.now() - (room.updatedAt ?? room.createdAt) < ROOM_IDLE_MS;

/** Code of the live room `user` is seated in, or null. A player can be in only one room at a time. */
export async function roomFor(user: string): Promise<string | null> {
  const code = await kvGet<string>(memberKey(user));
  if (!code) return null;
  const room = await kvGet<Room>(roomKey(code));
  return room && isLive(room) && room.seats.includes(user) ? code : null;
}

async function assertFree(user: string, exceptCode?: string) {
  const other = await roomFor(user);
  if (other && other !== exceptCode) throw new RoomError(`You're already in room ${other}. Leave it first.`, 409);
}

export async function createRoom(host: string, game: GameId = DEFAULT_GAME): Promise<string> {
  await assertFree(host);
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = "";
    for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if ((await versionGet(roomKey(code))) !== 0) continue;
    const now = Date.now();
    const room: Room = {
      code,
      host,
      createdAt: now,
      updatedAt: now,
      seats: [host, ...Array<null>(gameInfo(game).maxPlayers - 1).fill(null)],
      names: { [host]: await getDisplayName(host) },
      game,
      match: null,
    };
    if (await versionedWrite(roomKey(code), 0, room, ROOM_TTL)) {
      await kvSet(memberKey(host), code, ROOM_TTL);
      return code;
    }
  }
  throw new RoomError("Could not create a room, try again", 500);
}

async function load(code: string): Promise<{ room: Room; version: number }> {
  const { value: room, version } = await versionedGet<Room>(roomKey(code));
  if (!room || !version) throw new RoomError("Room not found", 404);
  return { room, version };
}

export function toView(room: Room, version: number, me: string): RoomView {
  const seat = room.seats.indexOf(me);
  const mySeat = seat >= 0 ? seat : null;
  return {
    code: room.code,
    host: room.host,
    seats: room.seats,
    names: room.seats.map((u) => (u ? (isBotName(u) ? u : (room.names?.[u] ?? u)) : null)),
    version,
    me,
    meName: room.names?.[me] ?? me,
    mySeat,
    started: room.match !== null,
    ended: !!room.ended,
    gameId: room.game ?? DEFAULT_GAME,
    game: room.match && mySeat !== null ? getGame(room.game).viewFor(room.match, mySeat) : null,
  };
}

/**
 * Returns null when the client already has `knownVersion`. One small read checks both the version and
 * whether a bot is due to move; polls are what drive bots, since Vercel has no always-on process.
 */
export async function getRoomView(code: string, me: string, knownVersion?: number): Promise<RoomView | null> {
  const [v, due] = await kvMget([roomKey(code) + ":v", botDueKey(code)]);
  if (due !== null && Date.now() >= Number(due)) {
    const stepped = await runBotStep(code);
    if (stepped) return toView(stepped.room, stepped.version, me);
  }
  if (knownVersion !== undefined && Number(v ?? 0) === knownVersion) return null;
  const { room, version } = await load(code);
  return toView(room, version, me);
}

function botMoveFor(room: Room) {
  if (!room.match || room.ended) return null;
  return getGame(room.game).nextBotMove(room.match, (s) => isBotName(room.seats[s]));
}

/** Records when the next bot move is due (or clears it). Rooms without bots never touch this key. */
async function scheduleBots(code: string, room: Room) {
  if (!room.seats.some(isBotName)) return;
  if (!botMoveFor(room)) return kvDel(botDueKey(code));
  await kvSet(botDueKey(code), Date.now() + getGame(room.game).botDelayMs(room.match), ROOM_TTL);
}

/** Makes one bot move. Several polls may try at once; the versioned write lets only one succeed. */
async function runBotStep(code: string): Promise<{ room: Room; version: number } | null> {
  const { room, version } = await load(code);
  const move = botMoveFor(room);
  if (!move) {
    await kvDel(botDueKey(code));
    return null;
  }
  room.match = getGame(room.game).applyAction(room.match, move.seat, move.action);
  room.updatedAt = Date.now();
  if (!(await versionedWrite(roomKey(code), version, room, ROOM_TTL))) return null;
  await scheduleBots(code, room);
  return { room, version: version + 1 };
}

export type RoomOp =
  | { op: "sit"; seat: number }
  | { op: "leave" }
  | { op: "start" }
  | { op: "end" }
  | { op: "addBot"; seat: number }
  | { op: "removeBot"; seat: number }
  | { op: "takeSeat"; seat: number } // join a game in progress by replacing a bot
  | { op: "action"; action: unknown };

function mutate(room: Room, me: string, body: RoomOp, myName: string) {
  if (room.ended) throw new RoomError("This game has ended");
  const seated = room.seats.includes(me);
  switch (body.op) {
    case "sit": {
      if (room.match) throw new RoomError("Game already started");
      const seat = body.seat;
      if (!Number.isInteger(seat) || seat < 0 || seat >= room.seats.length) throw new RoomError("Bad seat");
      if (room.seats[seat] && room.seats[seat] !== me) throw new RoomError("Seat taken");
      room.seats = room.seats.map((u) => (u === me ? null : u));
      room.seats[seat] = me;
      room.names = { ...room.names, [me]: myName };
      return;
    }
    case "leave": {
      if (room.match) throw new RoomError("Game already started — use End game instead");
      room.seats = room.seats.map((u) => (u === me ? null : u));
      return;
    }
    case "addBot":
    case "removeBot": {
      if (room.match) throw new RoomError("Game already started");
      if (!seated) throw new RoomError("Sit down first", 403);
      const seat = body.seat;
      if (!Number.isInteger(seat) || seat < 0 || seat >= room.seats.length) throw new RoomError("Bad seat");
      if (body.op === "addBot") {
        if (room.seats[seat]) throw new RoomError("Seat taken");
        const name = BOT_NAMES.find((n) => !room.seats.includes(`bot:${n}`))!;
        room.seats[seat] = `bot:${name}`;
      } else {
        if (!isBotName(room.seats[seat])) throw new RoomError("That seat isn't a bot");
        room.seats[seat] = null;
      }
      return;
    }
    case "takeSeat": {
      if (!room.match) throw new RoomError("The game hasn't started; just sit down");
      if (seated) throw new RoomError("You already have a seat");
      const seat = body.seat;
      if (!Number.isInteger(seat) || !isBotName(room.seats[seat])) throw new RoomError("That seat isn't a bot");
      room.seats[seat] = me; // keeps the bot's cards, team and score
      room.names = { ...room.names, [me]: myName };
      return;
    }
    case "start": {
      if (!seated) throw new RoomError("Sit down first", 403);
      if (room.match) throw new RoomError("Already started");
      const info = gameInfo(room.game);
      const filled = room.seats.filter(Boolean);
      if (info.teams && filled.length !== room.seats.length) throw new RoomError(`Need ${room.seats.length} players`);
      if (filled.length < info.minPlayers) throw new RoomError(`Need at least ${info.minPlayers} players`);
      // Non-team games: close the gaps so players are seats 0..n-1 in the order they sat.
      if (!info.teams) room.seats = filled;
      room.match = getGame(room.game).newMatch(room.seats.length);
      return;
    }
    case "end": {
      if (!seated) throw new RoomError("You are not in this game", 403);
      room.ended = true;
      return;
    }
    case "action": {
      const seat = room.seats.indexOf(me);
      if (seat < 0) throw new RoomError("You are not seated", 403);
      if (!room.match) throw new RoomError("Game not started");
      try {
        room.match = getGame(room.game).applyAction(room.match, seat, body.action);
      } catch (e) {
        if (e instanceof EngineError) throw new RoomError(e.message);
        throw e;
      }
      return;
    }
    default:
      throw new RoomError("Unknown op");
  }
}

/**
 * Applies an op with optimistic locking, retrying if someone else wrote concurrently.
 * `sessionOk` lets the caller's session check run in parallel with the room read; it's awaited before writing.
 */
export async function updateRoom(
  code: string,
  me: string,
  body: RoomOp,
  sessionOk: Promise<boolean> = Promise.resolve(true),
): Promise<RoomView> {
  let myName = me;
  if (body.op === "sit" || body.op === "takeSeat")
    [myName] = await Promise.all([getDisplayName(me), assertFree(me, code)]);
  for (let attempt = 0; attempt < 8; attempt++) {
    const { room, version } = await load(code);
    const before = room.seats.slice();
    mutate(room, me, body, myName);
    room.updatedAt = Date.now();
    if (!(await sessionOk)) throw new RoomError("Not logged in", 401);
    if (await versionedWrite(roomKey(code), version, room, ROOM_TTL)) {
      await Promise.all([syncMembership(code, before, room), scheduleBots(code, room)]);
      return toView(room, version + 1, me);
    }
  }
  throw new RoomError("Busy, try again", 409);
}

async function syncMembership(code: string, before: (string | null)[], room: Room) {
  const now = room.ended ? [] : room.seats;
  const ops: Promise<unknown>[] = [];
  for (const u of before) if (u && !isBotName(u) && !now.includes(u)) ops.push(kvDel(memberKey(u)));
  for (const u of now) if (u && !isBotName(u) && !before.includes(u)) ops.push(kvSet(memberKey(u), code, ROOM_TTL));
  await Promise.all(ops);
}

/** Removes `user` from a lobby they're sitting in (used on logout). Fails if their game has started. */
export async function leaveLobbyFor(user: string) {
  const code = await roomFor(user);
  if (!code) return;
  const { room } = await load(code);
  if (room.match) throw new RoomError(`You're in a game in progress (room ${code}). End the game first.`, 409);
  await updateRoom(code, user, { op: "leave" });
}
