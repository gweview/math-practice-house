import type { RandomSource } from '../shared/random/seeded-random';

export const randomInt = (min: number, max: number, random: RandomSource = Math.random): number => Math.floor(random() * (max - min + 1)) + min;
export const pick = <T>(items: readonly T[], random: RandomSource = Math.random): T => items[randomInt(0, items.length - 1, random)];
export const shuffle = <T>(items: readonly T[], random: RandomSource = Math.random): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) { const j = randomInt(0, i, random); [copy[i], copy[j]] = [copy[j], copy[i]]; }
  return copy;
};
export const id = (random: RandomSource = Math.random): string => {
  const scopedId = (random as RandomSource & { createId?: () => string }).createId;
  return scopedId ? scopedId() : `q-${Math.floor(random() * Number.MAX_SAFE_INTEGER).toString(36)}-${Math.floor(random() * 0xFFFFFFFF).toString(36)}`;
};

/** Bind worksheet-scoped IDs to a random source without consuming randomness.
 * The optional property keeps the legacy public generator signatures intact. */
export function attachCreateId(random: RandomSource, createId: () => string): RandomSource {
  const scoped = (() => random()) as RandomSource & { createId?: () => string };
  scoped.createId = createId;
  return scoped;
}
