export type RandomSource = () => number;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
export function normalizeSeed(seed: string | number): string {
  const normalized = String(seed).trim();
  if (!normalized) throw new Error('随机种子不能为空');
  return normalized.slice(0, 80);
}

/** Deterministic Mulberry32 PRNG. It owns its state and never mutates global randomness. */
export function createSeededRandom(seed: string | number): RandomSource {
  let state = hashSeed(normalizeSeed(seed));
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export interface GenerationContext {
  seed: string;
  random: RandomSource;
  createId: () => string;
}

export function createGenerationContext(seed: string | number): GenerationContext {
  const normalized = normalizeSeed(seed);
  const random = createSeededRandom(normalized);
  let idCounter = 0;
  return {
    seed: normalized,
    random,
    createId: () => `q-${hashSeed(normalized).toString(36)}-${(++idCounter).toString(36)}`
  };
}

export function createRandomSeed(random: RandomSource = Math.random): string {
  const time = Date.now().toString(36);
  const entropy = Math.floor(random() * 0xFFFFFFFF).toString(36).padStart(7, '0');
  return `${time}-${entropy}`;
}
