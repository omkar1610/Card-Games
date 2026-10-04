// Key-value storage. Uses Upstash Redis when configured (Vercel Marketplace → Upstash),
// otherwise an in-process Map, which is only good for `npm run dev` on one machine.
import { Redis } from "@upstash/redis";

const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

/**
 * On Vercel, in-memory storage silently breaks logins (every request may hit a different server),
 * so refuse to run without Redis and say why.
 */
export function storageProblem(): string | null {
  if (redis || !process.env.VERCEL) return null;
  return "Server setup problem: no database connected. In Vercel, add Upstash Redis under Storage (it sets KV_REST_API_URL and KV_REST_API_TOKEN), then redeploy.";
}

type Entry = { value: unknown; expires: number | null };
const g = globalThis as unknown as { __mem?: Map<string, Entry> };
const mem = (g.__mem ??= new Map());

function memGet(key: string): unknown {
  const e = mem.get(key);
  if (!e) return null;
  if (e.expires && e.expires < Date.now()) {
    mem.delete(key);
    return null;
  }
  return e.value;
}

export async function kvGet<T>(key: string): Promise<T | null> {
  if (redis) return (await redis.get<T>(key)) ?? null;
  const v = memGet(key);
  return v === null ? null : (structuredClone(v) as T);
}

export async function kvSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (redis) {
    await (ttlSeconds ? redis.set(key, value, { ex: ttlSeconds }) : redis.set(key, value));
    return;
  }
  mem.set(key, { value: structuredClone(value), expires: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
}

export async function kvDel(key: string): Promise<void> {
  if (redis) await redis.del(key);
  else mem.delete(key);
}

/** Set only if the key doesn't exist. Returns true if written. */
export async function kvSetNew(key: string, value: unknown, ttlSeconds?: number): Promise<boolean> {
  if (redis) {
    const res = await redis.set(key, value, ttlSeconds ? { nx: true, ex: ttlSeconds } : { nx: true });
    return res === "OK";
  }
  if (memGet(key) !== null) return false;
  await kvSet(key, value, ttlSeconds);
  return true;
}

const CAS_SCRIPT = `
local v = redis.call('GET', KEYS[2])
if (v or '0') ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
redis.call('SET', KEYS[2], ARGV[4], 'EX', ARGV[3])
return 1`;

/**
 * Versioned record: data at `key`, version number at `key:v`.
 * Writes succeed only if nobody else wrote in between (optimistic concurrency).
 */
export async function versionGet(key: string): Promise<number> {
  const v = redis ? await redis.get<number>(key + ":v") : memGet(key + ":v");
  return Number(v ?? 0);
}

/** Several small values in one round trip. */
export async function kvMget(keys: string[]): Promise<unknown[]> {
  if (redis) return redis.mget<unknown[]>(...keys);
  return keys.map((k) => {
    const v = memGet(k);
    return v === null ? null : structuredClone(v);
  });
}

/** Value and version in one round trip. */
export async function versionedGet<T>(key: string): Promise<{ value: T | null; version: number }> {
  if (redis) {
    const [value, v] = await redis.mget<[T | null, number | null]>(key, key + ":v");
    return { value: value ?? null, version: Number(v ?? 0) };
  }
  const value = memGet(key);
  return { value: value === null ? null : (structuredClone(value) as T), version: Number(memGet(key + ":v") ?? 0) };
}

export async function versionedWrite(
  key: string,
  expectedVersion: number,
  value: unknown,
  ttlSeconds: number,
): Promise<boolean> {
  const next = expectedVersion + 1;
  if (redis) {
    const ok = await redis.eval(
      CAS_SCRIPT,
      [key, key + ":v"],
      [String(expectedVersion), JSON.stringify(value), String(ttlSeconds), String(next)],
    );
    return ok === 1;
  }
  if (Number(memGet(key + ":v") ?? 0) !== expectedVersion) return false;
  await kvSet(key, value, ttlSeconds);
  await kvSet(key + ":v", next, ttlSeconds);
  return true;
}
