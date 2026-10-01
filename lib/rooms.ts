import { Action, EngineError, Match, PlayerView, applyAction, newMatch, viewFor } from "./engine/game";
import { kvDel, kvGet, kvSet, versionGet, versionedWrite } from "./store";

const ROOM_TTL = 7 * 24 * 3600;
const roomKey = (code: string) => `room:${code}`;
const memberKey = (user: string) => `member:${user}`;
/** A room stops counting as "yours" once nobody has done anything in it for this long. */
const ROOM_IDLE_MS = 2 * 3600 * 1000;

export interface Room {
  code: string;
  host: string;
  createdAt: number;
  updatedAt?: number;
  ended?: boolean;
  seats: (string | null)[]; // usernames by seat; seats 0 & 2 are team A, 1 & 3 team B
  match: Match | null;
}

export interface RoomView {
  code: string;
  host: string;
  seats: (string | null)[];
  version: number;
  me: string;
  mySeat: number | null;
  started: boolean;
  ended: boolean;
  game: PlayerView | null;
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

export async function createRoom(host: string): Promise<string> {
  await assertFree(host);
  for (let attempt = 0; attempt < 10; attempt++) {
    let code = "";
    for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if ((await versionGet(roomKey(code))) !== 0) continue;
    const now = Date.now();
    const room: Room = { code, host, createdAt: now, updatedAt: now, seats: [host, null, null, null], match: null };
    if (await versionedWrite(roomKey(code), 0, room, ROOM_TTL)) {
      await kvSet(memberKey(host), code, ROOM_TTL);
      return code;
    }
  }
  throw new RoomError("Could not create a room, try again", 500);
}

async function load(code: string): Promise<{ room: Room; version: number }> {
  const version = await versionGet(roomKey(code));
  const room = version ? await kvGet<Room>(roomKey(code)) : null;
  if (!room) throw new RoomError("Room not found", 404);
  return { room, version };
}

export function toView(room: Room, version: number, me: string): RoomView {
  const seat = room.seats.indexOf(me);
  const mySeat = seat >= 0 ? seat : null;
  return {
    code: room.code,
    host: room.host,
    seats: room.seats,
    version,
    me,
    mySeat,
    started: room.match !== null,
    ended: !!room.ended,
    game: room.match && mySeat !== null ? viewFor(room.match, mySeat) : null,
  };
}

/** Returns null when the client already has `knownVersion`. */
export async function getRoomView(code: string, me: string, knownVersion?: number): Promise<RoomView | null> {
  if (knownVersion !== undefined) {
    const v = await versionGet(roomKey(code));
    if (v === knownVersion) return null;
  }
  const { room, version } = await load(code);
  return toView(room, version, me);
}

export type RoomOp =
  | { op: "sit"; seat: number }
  | { op: "leave" }
  | { op: "start" }
  | { op: "end" }
  | { op: "action"; action: Action };

function mutate(room: Room, me: string, body: RoomOp) {
  if (room.ended) throw new RoomError("This game has ended");
  const seated = room.seats.includes(me);
  switch (body.op) {
    case "sit": {
      if (room.match) throw new RoomError("Game already started");
      const seat = body.seat;
      if (!Number.isInteger(seat) || seat < 0 || seat > 3) throw new RoomError("Bad seat");
      if (room.seats[seat] && room.seats[seat] !== me) throw new RoomError("Seat taken");
      room.seats = room.seats.map((u) => (u === me ? null : u));
      room.seats[seat] = me;
      return;
    }
    case "leave": {
      if (room.match) throw new RoomError("Game already started — use End game instead");
      room.seats = room.seats.map((u) => (u === me ? null : u));
      return;
    }
    case "start": {
      if (!seated) throw new RoomError("Sit down first", 403);
      if (room.match) throw new RoomError("Already started");
      if (room.seats.some((s) => !s)) throw new RoomError("Need 4 players");
      room.match = newMatch();
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
        room.match = applyAction(room.match, seat, body.action);
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

/** Applies an op with optimistic locking, retrying if someone else wrote concurrently. */
export async function updateRoom(code: string, me: string, body: RoomOp): Promise<RoomView> {
  if (body.op === "sit") await assertFree(me, code);
  for (let attempt = 0; attempt < 8; attempt++) {
    const { room, version } = await load(code);
    const before = room.seats.slice();
    mutate(room, me, body);
    room.updatedAt = Date.now();
    if (await versionedWrite(roomKey(code), version, room, ROOM_TTL)) {
      await syncMembership(code, before, room);
      return toView(room, version + 1, me);
    }
  }
  throw new RoomError("Busy, try again", 409);
}

async function syncMembership(code: string, before: (string | null)[], room: Room) {
  const now = room.ended ? [] : room.seats;
  const ops: Promise<unknown>[] = [];
  for (const u of before) if (u && !now.includes(u)) ops.push(kvDel(memberKey(u)));
  for (const u of now) if (u && !before.includes(u)) ops.push(kvSet(memberKey(u), code, ROOM_TTL));
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
