import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { kvDel, kvGet, kvSet, kvSetNew, storageProblem } from "./store";

const COOKIE = "session";
const SESSION_DAYS = 30;
export const DEFAULT_PASSWORD = "1234";

/** Human-readable reason the server can't handle logins, or null if setup is fine. */
export function setupProblem(): string | null {
  if (process.env.VERCEL && !process.env.AUTH_SECRET)
    return "Server setup problem: AUTH_SECRET is not set. Add it in Vercel → Settings → Environment Variables, then redeploy.";
  return storageProblem();
}

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    if (process.env.VERCEL) throw new Error("AUTH_SECRET env var is required");
    return new TextEncoder().encode("dev-only-secret-change-me");
  }
  return new TextEncoder().encode(s);
}

interface UserRecord {
  username: string;
  hash: string;
  createdAt: number;
  displayName?: string; // as the player typed it ("Jack"); the key/username is lowercase ("jack")
  sessionVersion?: number; // bumped by "log out everywhere"; older sessions stop working
}

const userKey = (u: string) => `user:${u}`;

export function normalizeUsername(u: unknown): string | null {
  if (typeof u !== "string") return null;
  const n = u.trim().toLowerCase();
  return /^[a-z0-9_]{3,20}$/.test(n) ? n : null;
}

export function validPassword(p: unknown): p is string {
  return typeof p === "string" && p.length >= 4 && p.length <= 100;
}

export async function userExists(username: string): Promise<boolean> {
  return (await kvGet(userKey(username))) !== null;
}

/** The name as typed (trimmed), if it's a valid username apart from letter case. */
export function cleanDisplayName(u: unknown): string | null {
  if (typeof u !== "string") return null;
  const n = u.trim();
  return /^[A-Za-z0-9_]{3,20}$/.test(n) ? n : null;
}

/** Creates the user if the name is free. Returns false if it already exists. */
export async function createUser(username: string, password: string, displayName = username): Promise<boolean> {
  const rec: UserRecord = { username, displayName, hash: await bcrypt.hash(password, 10), createdAt: Date.now() };
  return kvSetNew(userKey(username), rec);
}

/** How the player's name is shown: exactly as they last typed it at login. */
export async function getDisplayName(username: string): Promise<string> {
  return (await kvGet<UserRecord>(userKey(username)))?.displayName ?? username;
}

export async function setDisplayName(username: string, displayName: string) {
  const rec = await kvGet<UserRecord>(userKey(username));
  if (rec && rec.displayName !== displayName) await kvSet(userKey(username), { ...rec, displayName });
}

export async function checkPassword(username: string, password: string): Promise<boolean> {
  const rec = await kvGet<UserRecord>(userKey(username));
  if (!rec) return false;
  return bcrypt.compare(password, rec.hash);
}

export async function setPassword(username: string, password: string) {
  const rec = await kvGet<UserRecord>(userKey(username));
  if (!rec) throw new Error("User not found");
  await kvSet(userKey(username), { ...rec, hash: await bcrypt.hash(password, 10) });
}

// Presence: a page that is open sends a heartbeat every PRESENCE_BEAT_MS; the key expires shortly after.
export const PRESENCE_BEAT_MS = 20_000;
const PRESENCE_TTL_S = 60;
const presenceKey = (u: string) => `presence:${u}`;

export async function markPresent(username: string) {
  await kvSet(presenceKey(username), Date.now(), PRESENCE_TTL_S);
}

/** True if this user has a page open somewhere (heartbeat in the last minute). */
export async function isOnline(username: string): Promise<boolean> {
  return (await kvGet(presenceKey(username))) !== null;
}

/** Invalidates every existing session of this user. */
export async function logoutEverywhere(username: string) {
  const rec = await kvGet<UserRecord>(userKey(username));
  if (!rec) return;
  await kvSet(userKey(username), { ...rec, sessionVersion: (rec.sessionVersion ?? 0) + 1 });
  await kvDel(presenceKey(username));
}

export async function startSession(username: string) {
  await markPresent(username);
  const rec = await kvGet<UserRecord>(userKey(username));
  const jwt = await new SignJWT({ sv: rec?.sessionVersion ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
  (await cookies()).set(COOKIE, jwt, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function endSession(username: string | null) {
  if (username) await kvDel(presenceKey(username));
  (await cookies()).delete(COOKIE);
}

/**
 * The logged-in username, or null. With `verify`, also checks the session wasn't revoked by
 * "log out everywhere" (one extra read, so the 1-second room poll skips it; the heartbeat
 * and every action do check, so a revoked device is kicked out within ~20s).
 */
export async function currentUser({ verify = true } = {}): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const user = payload.sub;
    if (!user) return null;
    if (verify) {
      const rec = await kvGet<UserRecord>(userKey(user));
      if (!rec || (rec.sessionVersion ?? 0) !== (payload.sv ?? 0)) return null;
    }
    return user;
  } catch {
    return null;
  }
}
