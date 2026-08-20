interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  accessedAt: number;
}

const MAX_ENTRIES = 200;
const STORAGE_KEY = "os-api-cache";

const mem = new Map<string, CacheEntry<unknown>>();

// Restore from sessionStorage on first load
function hydrate() {
  if (mem.size > 0) return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const entries: [string, CacheEntry<unknown>][] = JSON.parse(raw);
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt > now) {
        mem.set(key, entry);
      }
    }
  } catch {
    // corrupt storage, ignore
  }
}

function persist() {
  try {
    const entries = Array.from(mem.entries());
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // storage full or unavailable, proceed without persistence
  }
}

function evict() {
  if (mem.size <= MAX_ENTRIES) return;
  const entries = Array.from(mem.entries()).sort(
    (a, b) => a[1].accessedAt - b[1].accessedAt,
  );
  const toRemove = entries.slice(0, mem.size - MAX_ENTRIES);
  for (const [key] of toRemove) {
    mem.delete(key);
  }
}

export function cacheGet<T>(key: string): T | undefined {
  hydrate();
  const entry = mem.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    mem.delete(key);
    return undefined;
  }
  entry.accessedAt = Date.now();
  return entry.data as T;
}

export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  hydrate();
  mem.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
    accessedAt: Date.now(),
  });
  evict();
  persist();
}

// Build a cache key from a URL path and params, excluding the api_key
export function cacheKey(path: string, params: Record<string, string>): string {
  const sorted = Object.entries(params)
    .filter(([k]) => k !== "api_key")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `${path}?${sorted}`;
}
