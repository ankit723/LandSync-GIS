import Redis from "ioredis";

/**
 * Cache layer. Uses Redis when REDIS_URL is set and reachable; otherwise falls
 * back to a per-process TTL map so the app runs with no Redis in development.
 */
type Entry = { value: string; expires: number };

const g = globalThis as unknown as {
  __landstackRedis?: Redis | null;
  __landstackMem?: Map<string, Entry>;
};

const mem = g.__landstackMem ?? new Map<string, Entry>();
g.__landstackMem = mem;

let redis: Redis | null | undefined = g.__landstackRedis;
if (redis === undefined) {
  if (process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    redis.on("error", () => {
      /* swallow — cache is best-effort, we fall back to mem */
    });
    redis.connect().catch(() => {
      redis = null;
      g.__landstackRedis = null;
    });
  } else {
    redis = null;
  }
  g.__landstackRedis = redis;
}

export async function cacheGet(key: string): Promise<string | null> {
  try {
    if (redis && redis.status === "ready") return await redis.get(key);
  } catch {
    /* fall through to mem */
  }
  const e = mem.get(key);
  if (!e) return null;
  if (Date.now() > e.expires) {
    mem.delete(key);
    return null;
  }
  return e.value;
}

export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    if (redis && redis.status === "ready") {
      await redis.set(key, value, "EX", ttlSeconds);
      return;
    }
  } catch {
    /* fall through */
  }
  mem.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
}

export async function cacheDel(prefix: string): Promise<void> {
  try {
    if (redis && redis.status === "ready") {
      const keys = await redis.keys(`${prefix}*`);
      if (keys.length) await redis.del(...keys);
    }
  } catch {
    /* ignore */
  }
  for (const k of mem.keys()) if (k.startsWith(prefix)) mem.delete(k);
}

/** Memoise an async producer of JSON-serialisable data. */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>,
): Promise<T> {
  const hit = await cacheGet(key);
  if (hit != null) {
    try {
      return JSON.parse(hit) as T;
    } catch {
      /* corrupt entry — recompute */
    }
  }
  const value = await produce();
  await cacheSet(key, JSON.stringify(value), ttlSeconds);
  return value;
}

export function cacheBackend(): "redis" | "memory" {
  return redis && redis.status === "ready" ? "redis" : "memory";
}
