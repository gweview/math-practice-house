import { describe, expect, it } from 'vitest';
import { createGenerationContext, createSeededRandom } from '../src/shared/random/seeded-random';
import { createVersionedStorage, type StorageLike } from '../src/shared/storage/versioned-storage';
import {
  createSudokuConfigStorage,
  SUDOKU_LEGACY_STORAGE_KEY,
  SUDOKU_STORAGE_KEY
} from '../src/features/sudoku/difficulty';
import { DEFAULT_SUDOKU_CONFIG } from '../src/features/sudoku/difficulty';
import { printTarget } from '../src/app/PrintController';
import {
  BINARY_REASONING_LEGACY_STORAGE_KEY,
  BINARY_REASONING_STORAGE_KEY,
  createBinaryReasoningConfigStorage
} from '../src/features/binary-reasoning/difficulty';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

class ThrowingStorage implements StorageLike {
  getItem(): string | null { throw new Error('blocked'); }
  setItem(): void { throw new Error('blocked'); }
  removeItem(): void { throw new Error('blocked'); }
}

describe('seeded generation infrastructure', () => {
  it('replays the same random sequence without global state', () => {
    const first = createSeededRandom('worksheet-42');
    const second = createSeededRandom('worksheet-42');
    expect(Array.from({ length: 8 }, first)).toEqual(Array.from({ length: 8 }, second));
  });

  it('creates deterministic scoped IDs', () => {
    const first = createGenerationContext('class-a');
    const second = createGenerationContext('class-a');
    expect([first.createId(), first.createId()]).toEqual([second.createId(), second.createId()]);
  });
});

describe('versioned storage', () => {
  it('normalizes legacy raw values and saves an envelope', () => {
    const storage = new MemoryStorage();
    storage.setItem('config', JSON.stringify({ count: 10 }));
    const settings = createVersionedStorage({
      key: 'config', version: 2, storage,
      defaults: () => ({ count: 20 }),
      normalize: value => ({ count: Math.max(5, Number((value as { count?: unknown })?.count) || 20) }),
      migrate: value => value
    });
    expect(settings.load()).toEqual({ count: 10 });
    expect(settings.save({ count: 30 })).toBe(true);
    expect(JSON.parse(storage.getItem('config') ?? '{}')).toEqual({ version: 2, value: { count: 30 } });
  });

  it('falls back safely for corrupt data', () => {
    const storage = new MemoryStorage();
    storage.setItem('config', '{broken');
    const settings = createVersionedStorage({
      key: 'config', version: 1, storage,
      defaults: () => ({ count: 20 }),
      normalize: value => value as { count: number }
    });
    expect(settings.load()).toEqual({ count: 20 });
  });

  it('recovers from a corrupt current key with a legacy key and leaves legacy data intact', () => {
    const storage = new MemoryStorage();
    const legacy = JSON.stringify({ count: 7 });
    storage.setItem('legacy-config', legacy);
    storage.setItem('config', '{broken');
    const settings = createVersionedStorage({
      key: 'config', version: 2, legacyKeys: ['legacy-config'], storage,
      defaults: () => ({ count: 20 }),
      normalize: value => ({ count: Number((value as { count?: unknown })?.count) || 20 }),
      migrate: value => value
    });
    expect(settings.load()).toEqual({ count: 7 });
    expect(storage.getItem('legacy-config')).toBe(legacy);
    expect(JSON.parse(storage.getItem('config') ?? '{}')).toMatchObject({ version: 2, value: { count: 7 } });
  });

  it('returns defaults for a storage implementation that throws', () => {
    const settings = createVersionedStorage({
      key: 'config', version: 1, storage: new ThrowingStorage(),
      defaults: () => ({ count: 20 }), normalize: value => value as { count: number }
    });
    expect(settings.load()).toEqual({ count: 20 });
    expect(settings.save({ count: 30 })).toBe(false);
    expect(settings.clear()).toBe(false);
  });

  it('migrates Sudoku V1 without deleting it and writes an isolated V2 key', () => {
    const storage = new MemoryStorage();
    const legacy = JSON.stringify({ difficulty: 'challenge', count: 2 });
    storage.setItem(SUDOKU_LEGACY_STORAGE_KEY, legacy);
    const settings = createSudokuConfigStorage(storage);
    expect(settings.load().selections).toEqual([{ size: 9, difficulty: 'challenge', count: 2 }]);
    expect(storage.getItem(SUDOKU_LEGACY_STORAGE_KEY)).toBe(legacy);
    expect(JSON.parse(storage.getItem(SUDOKU_STORAGE_KEY) ?? '{}').version).toBe(2);
    expect(storage.getItem('math-worksheet-binary-reasoning-config-v2')).toBeNull();
    expect(DEFAULT_SUDOKU_CONFIG.selections).toHaveLength(1);
  });

  it('migrates binary V1 while keeping math and Sudoku namespaces untouched', () => {
    const storage = new MemoryStorage();
    const legacy = JSON.stringify({ stage: 'grade3', difficulty: 'challenge', count: 8 });
    storage.setItem(BINARY_REASONING_LEGACY_STORAGE_KEY, legacy);
    const settings = createBinaryReasoningConfigStorage(storage);
    expect(settings.load()).toMatchObject({ stage: 'grade3', difficulty: 'challenge', count: 8 });
    expect(storage.getItem(BINARY_REASONING_LEGACY_STORAGE_KEY)).toBe(legacy);
    expect(JSON.parse(storage.getItem(BINARY_REASONING_STORAGE_KEY) ?? '{}').version).toBe(2);
    expect(storage.getItem('math-worksheet-config-v2')).toBeNull();
    expect(storage.getItem(SUDOKU_STORAGE_KEY)).toBeNull();
  });

  it('cleans the print target when an embedded print API throws synchronously', () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const dataset: Record<string, string> = {};
    const body = { dataset };
    const fakeWindow = {
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      setTimeout: () => 1,
      clearTimeout: () => undefined,
      print: () => { throw new Error('print blocked'); }
    };
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { body } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
    try {
      expect(() => printTarget('math')).not.toThrow();
      expect(dataset.printTarget).toBeUndefined();
    } finally {
      if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
      else Reflect.deleteProperty(globalThis, 'document');
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });

  it('cleans normal print lifecycle and replaces an earlier target safely', () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const dataset: Record<string, string> = {};
    const listeners = new Set<() => void>();
    const timers = new Set<number>();
    let nextTimer = 0;
    const body = { dataset };
    const fakeWindow = {
      addEventListener: (_name: string, listener: () => void) => { listeners.add(listener); },
      removeEventListener: (_name: string, listener: () => void) => { listeners.delete(listener); },
      setTimeout: () => { const id = ++nextTimer; timers.add(id); return id; },
      clearTimeout: (id: number) => { timers.delete(id); },
      print: () => undefined
    };
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { body } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
    try {
      printTarget('math');
      expect(dataset.printTarget).toBe('math');
      expect(listeners.size).toBe(1);
      expect(timers.size).toBe(1);

      printTarget('sudoku');
      expect(dataset.printTarget).toBe('sudoku');
      expect(listeners.size).toBe(1);
      expect(timers.size).toBe(1);

      [...listeners][0]();
      expect(dataset.printTarget).toBeUndefined();
      expect(listeners.size).toBe(0);
      expect(timers.size).toBe(0);
    } finally {
      if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
      else Reflect.deleteProperty(globalThis, 'document');
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });

  it('does not retain a selector when print is unavailable', () => {
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const dataset: Record<string, string> = {};
    const body = { dataset };
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { body } });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout: () => 1, clearTimeout: () => undefined } });
    try {
      printTarget('binary-reasoning');
      expect(dataset.printTarget).toBeUndefined();
    } finally {
      if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
      else Reflect.deleteProperty(globalThis, 'document');
      if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
      else Reflect.deleteProperty(globalThis, 'window');
    }
  });
});
