export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface VersionedEnvelope {
  version: number;
  value: unknown;
}

export interface VersionedStorageOptions<T> {
  key: string;
  version: number;
  defaults: () => T;
  normalize: (value: unknown) => T;
  migrate?: (value: unknown, fromVersion: number) => unknown;
  /**
   * Older keys are read only as a migration source. They are deliberately
   * never removed, so rolling back the application remains possible.
   */
  legacyKeys?: readonly string[];
  storage?: StorageLike;
}

function browserStorage(): StorageLike | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isEnvelope(value: unknown): value is VersionedEnvelope {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Number.isInteger((value as Partial<VersionedEnvelope>).version)
    && (value as Partial<VersionedEnvelope>).version! >= 0
    && Object.hasOwn(value as object, 'value');
}

interface ReadResult<T> {
  value: T;
  /** A raw (pre-envelope) value should be upgraded in place. */
  shouldPersist: boolean;
}

export function createVersionedStorage<T>(options: VersionedStorageOptions<T>) {
  const storage = options.storage ?? browserStorage();

  const decode = (saved: string, rawVersion: number): ReadResult<T> | undefined => {
    try {
      const parsed: unknown = JSON.parse(saved);
      if (!isEnvelope(parsed)) {
        const migrated = options.migrate ? options.migrate(parsed, rawVersion) : parsed;
        return { value: options.normalize(migrated), shouldPersist: true };
      }
      const migrated = parsed.version === options.version
        ? parsed.value
        : options.migrate?.(parsed.value, parsed.version);
      if (migrated === undefined) return undefined;
      return { value: options.normalize(migrated), shouldPersist: parsed.version !== options.version };
    } catch {
      return undefined;
    }
  };

  return {
    load(): T {
      if (!storage) return options.defaults();
      try {
        const saved = storage.getItem(options.key);
        const current = saved ? decode(saved, 0) : undefined;
        if (current) {
          if (current.shouldPersist) {
            try { storage.setItem(options.key, JSON.stringify({ version: options.version, value: current.value } satisfies VersionedEnvelope)); } catch { /* best effort */ }
          }
          return current.value;
        }

        // A legacy key is a fallback as well as a migration source. This
        // makes a corrupt V2 value recoverable without touching the old key.
        for (const legacyKey of options.legacyKeys ?? []) {
          const legacySaved = storage.getItem(legacyKey);
          if (!legacySaved) continue;
          const legacy = decode(legacySaved, 0);
          if (!legacy) continue;
          try { storage.setItem(options.key, JSON.stringify({ version: options.version, value: legacy.value } satisfies VersionedEnvelope)); } catch { /* best effort */ }
          return legacy.value;
        }
        return options.defaults();
      } catch {
        return options.defaults();
      }
    },

    save(value: T): boolean {
      if (!storage) return false;
      try {
        storage.setItem(options.key, JSON.stringify({ version: options.version, value } satisfies VersionedEnvelope));
        return true;
      } catch {
        return false;
      }
    },

    clear(): boolean {
      if (!storage) return false;
      try {
        storage.removeItem(options.key);
        return true;
      } catch {
        return false;
      }
    }
  };
}
