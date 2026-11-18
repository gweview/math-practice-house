import { pick } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';
import {
  additionCarryPositions,
  hasAcrossZeroPattern,
  hasConsecutivePositions,
  multiplicationCarryPositions,
  subtractionBorrowPositions
} from '../../domain/math-core/regrouping';

/**
 * Shared constraint sampler.
 *
 * Generators used to satisfy arithmetic constraints (carry, borrow,
 * divisibility, product bounds) by guessing random operands in a retry loop
 * and falling back to a degenerate question when the loop ran out. This
 * module replaces guessing with construction: each sampler enumerates the
 * exact set of values satisfying the constraint and picks uniformly from it,
 * returning null when the set is empty so callers can adjust their target
 * instead of emitting an off-spec question.
 *
 * Enumeration is deliberately preferred over digit dynamic programming here:
 * worksheet sums stay at or below 1000, so a full scan costs a few thousand
 * predicate evaluations at most, while the code stays obviously correct and
 * the sampled distribution stays uniform over the feasible set.
 */

/** True when adding a and b carries at any digit. The raw digit check equals
 * true carry propagation: a carry into a digit requires an earlier digit
 * whose plain sum reached 10, so checking plain digit sums is sufficient. */
export function hasAdditionRegrouping(a: number, b: number): boolean {
  while (a > 0 || b > 0) {
    if (a % 10 + b % 10 >= 10) return true;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return false;
}

/** True when subtracting b from a borrows at any digit. As with addition,
 * the raw digit check equals true borrow propagation. */
export function hasSubtractionRegrouping(a: number, b: number): boolean {
  while (a > 0 || b > 0) {
    if (a % 10 < b % 10) return true;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return false;
}

/**
 * Sample a pair (a, b) with a + b === sum, both operands >= minOperand, whose
 * regrouping status equals `regrouping`. Uniform over all such pairs, or null
 * when none exists (for example sum 19 admits no carrying split with
 * single-digit-free operands, and powers of ten admit no carry-free split).
 */
export function sampleAddendPair(
  sum: number,
  regrouping: boolean,
  random: RandomSource = Math.random,
  minOperand = 1
): [number, number] | null {
  const candidates: number[] = [];
  for (let a = minOperand; a <= sum - minOperand; a++) {
    if (hasAdditionRegrouping(a, sum - a) === regrouping) candidates.push(a);
  }
  if (!candidates.length) return null;
  const a = pick(candidates, random);
  return [a, sum - a];
}

/**
 * Sample a subtrahend b with minOperand <= b <= minuend whose regrouping
 * status against `minuend` equals `regrouping`. Uniform over all such values,
 * or null when none exists (for example minuends ending in 9 below 100 admit
 * no borrowing subtrahend).
 */
export function sampleSubtrahend(
  minuend: number,
  regrouping: boolean,
  random: RandomSource = Math.random,
  minOperand = 1
): number | null {
  const candidates: number[] = [];
  for (let b = minOperand; b <= minuend; b++) {
    if (hasSubtractionRegrouping(minuend, b) === regrouping) candidates.push(b);
  }
  if (!candidates.length) return null;
  return pick(candidates, random);
}

/**
 * Sample a triple (a, b, divisor) with every factor in [minimum, maxFactor]
 * and a * b * divisor <= max. Uniform over all such triples, or null when
 * even the smallest triple exceeds max.
 */
export function sampleProductTriple(
  minimum: number,
  maxFactor: number,
  max: number,
  random: RandomSource = Math.random
): [number, number, number] | null {
  const candidates: Array<[number, number, number]> = [];
  for (let a = minimum; a <= maxFactor; a++) {
    for (let b = minimum; b <= maxFactor; b++) {
      for (let divisor = minimum; divisor <= maxFactor; divisor++) {
        if (a * b * divisor <= max) candidates.push([a, b, divisor]);
      }
    }
  }
  if (!candidates.length) return null;
  return pick(candidates, random);
}

/**
 * Regrouping target for vertical sampling: how many digit positions must
 * regroup, and whether two of them must be adjacent. `max` defaults to no
 * upper bound; `{ min: 0, max: 0 }` pins the count at exactly zero.
 */
export interface RegroupingTarget {
  min: number;
  max?: number;
  consecutive?: boolean;
}

export function matchesRegroupingTarget(
  count: number,
  positions: readonly boolean[],
  target: RegroupingTarget
): boolean {
  if (count < target.min) return false;
  if (target.max !== undefined && count > target.max) return false;
  if (target.consecutive && !hasConsecutivePositions(positions)) return false;
  return true;
}

function regroupingMatch(positions: readonly boolean[], target: RegroupingTarget): boolean {
  return matchesRegroupingTarget(positions.filter(Boolean).length, positions, target);
}

/**
 * Sample a pair (a, b) with a + b === sum, both operands >= minOperand,
 * whose regrouping count matches `target`. Uniform over all such pairs, or
 * null when none exists. An optional `filter` applies further format rules
 * (for example rejecting multiples of ten) inside the enumeration, so a
 * null result means the combined constraints are infeasible for this sum.
 */
export function sampleAddendPairWithRegrouping(
  sum: number,
  target: RegroupingTarget,
  random: RandomSource = Math.random,
  options: { minOperand?: number; filter?: (a: number, b: number) => boolean } = {}
): [number, number] | null {
  const minOperand = options.minOperand ?? 1;
  const candidates: number[] = [];
  for (let a = minOperand; a <= sum - minOperand; a++) {
    const b = sum - a;
    if (!regroupingMatch(additionCarryPositions(a, b), target)) continue;
    if (options.filter && !options.filter(a, b)) continue;
    candidates.push(a);
  }
  if (!candidates.length) return null;
  const a = pick(candidates, random);
  return [a, sum - a];
}

/**
 * Sample a subtrahend b with minOperand <= b <= minuend whose borrow count
 * against `minuend` matches `target`. Uniform over all such values, or null
 * when none exists. With `acrossZero`, only subtrahends that borrow across
 * a zero digit of the minuend qualify.
 */
export function sampleSubtrahendWithBorrows(
  minuend: number,
  target: RegroupingTarget,
  random: RandomSource = Math.random,
  options: { minOperand?: number; acrossZero?: boolean; filter?: (subtrahend: number) => boolean } = {}
): number | null {
  const minOperand = options.minOperand ?? 1;
  const candidates: number[] = [];
  for (let b = minOperand; b <= minuend; b++) {
    if (!regroupingMatch(subtractionBorrowPositions(minuend, b), target)) continue;
    if (options.acrossZero && !hasAcrossZeroPattern(minuend, b)) continue;
    if (options.filter && !options.filter(b)) continue;
    candidates.push(b);
  }
  if (!candidates.length) return null;
  return pick(candidates, random);
}

/**
 * Sample a pair (multiplicand, factor) inside the given ranges whose carry
 * count matches `target`. Uniform over all such pairs, or null when none
 * exists. The ranges encode the digit pattern (for example 10–99 × 2–9 for
 * two-by-one, 100–999 × 2–9 for three-by-one, 11–99 × 11–99 for
 * two-by-two); the product bound belongs in `filter`.
 */
export function sampleMultiplicationPair(
  multiplicandMin: number,
  multiplicandMax: number,
  factorMin: number,
  factorMax: number,
  target: RegroupingTarget,
  random: RandomSource = Math.random,
  options: { filter?: (multiplicand: number, factor: number) => boolean } = {}
): [number, number] | null {
  const candidates: Array<[number, number]> = [];
  for (let a = multiplicandMin; a <= multiplicandMax; a++) {
    for (let b = factorMin; b <= factorMax; b++) {
      if (!regroupingMatch(multiplicationCarryPositions(a, b), target)) continue;
      if (options.filter && !options.filter(a, b)) continue;
      candidates.push([a, b]);
    }
  }
  if (!candidates.length) return null;
  return pick(candidates, random);
}

export interface DivisionSample {
  dividend: number;
  divisor: number;
  quotient: number;
  remainder: number;
}

/**
 * Sample a division constructed quotient-first: divisor and quotient inside
 * the given ranges, remainder 0 for exact division or 1..divisor-1 for
 * remainder division, dividend = divisor * quotient + remainder. Uniform
 * over all such triples, or null when none exists. With `zeroQuotient`,
 * only quotients containing a 0 digit qualify; dividend bounds and format
 * rules belong in `filter`.
 */
export function sampleDivision(
  divisorMin: number,
  divisorMax: number,
  quotientMin: number,
  quotientMax: number,
  options: { remainder: boolean; zeroQuotient?: boolean; filter?: (sample: DivisionSample) => boolean },
  random: RandomSource = Math.random
): DivisionSample | null {
  const candidates: DivisionSample[] = [];
  for (let divisor = divisorMin; divisor <= divisorMax; divisor++) {
    for (let quotient = quotientMin; quotient <= quotientMax; quotient++) {
      if (options.zeroQuotient && !String(quotient).includes('0')) continue;
      const remainders = options.remainder
        ? Array.from({ length: Math.max(0, divisor - 1) }, (_, index) => index + 1)
        : [0];
      for (const remainder of remainders) {
        const sample: DivisionSample = { dividend: divisor * quotient + remainder, divisor, quotient, remainder };
        if (options.filter && !options.filter(sample)) continue;
        candidates.push(sample);
      }
    }
  }
  if (!candidates.length) return null;
  return pick(candidates, random);
}
