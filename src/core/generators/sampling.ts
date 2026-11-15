import { pick } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';

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
