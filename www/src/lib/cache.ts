const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

export const CACHE_KEYS = {
  BOXES: "boxes",
  MEMBER_SNAPSHOTS: "member-snapshots",
  MEMBER_SNAPSHOT: (id: string) => `member-snapshot:${id}`,

  VOLUNTEER_INTERESTS: "volunteer-interests",
  SERVICE_HOUR_RATES: "service-hour-rates",
  WORK_FORMULAS: "work-formulas",
  MEMBER_WORK_FORMULA: (id: string) => `member-work-formula:${id}`,

  ADMIN_USERS: "admin-users",
  APPROVAL_UPDATES: "approval-updates",

  PENDING_REQUIREMENT_REQUESTS: "pending-requirement-requests",
  MY_REQUIREMENT_REQUESTS: "my-requirement-requests",

  BOX_MEMBERS: "box-members",
  LEGACY_SNAPSHOTS: "legacy-snapshots",
} as const;

type CacheEntry<T> = {
  value?: T;
  promise?: Promise<T>;
  expiresAt: number;
};

class CacheManager {
  private cache = new Map<string, CacheEntry<unknown>>();

  async get<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl = DEFAULT_TTL,
  ): Promise<T> {
    const existing = this.cache.get(key) as CacheEntry<T> | undefined;

    if (existing?.value !== undefined && Date.now() < existing.expiresAt) {
      return existing.value;
    }

    if (existing?.promise) {
      return existing.promise;
    }

    const promise = fetcher();

    this.cache.set(key, {
      promise,
      expiresAt: Date.now() + ttl,
    });

    try {
      const value = await promise;

      this.cache.set(key, {
        value,
        expiresAt: Date.now() + ttl,
      });

      return value;
    } catch (error) {
      this.cache.delete(key);
      throw error;
    }
  }

  invalidate(key: string) {
    this.cache.delete(key);
  }

  invalidatePrefix(prefix: string) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
  }
}

export const cache = new CacheManager();
