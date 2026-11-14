import { randomInt } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';

export function highFloor(min: number, max: number): number {
  return Math.max(min, Math.ceil(min + (max - min) * .6));
}

export function sampleInt(min: number, max: number, highRangeRate = 0, random: RandomSource = Math.random): number {
  if (max <= min) return min;
  const lower = random() < highRangeRate ? highFloor(min, max) : min;
  return randomInt(lower, max, random);
}

export function allowTrivial(rate: number, random: RandomSource = Math.random): boolean {
  return random() < rate;
}

export function samplePositive(max: number, highRangeRate = 0, random: RandomSource = Math.random): number {
  return sampleInt(1, Math.max(1, max), highRangeRate, random);
}
