import { describe, expect, it } from 'vitest';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import {
  additionRegroupingCount,
  multiplicationRegroupingCount,
  subtractionRegroupingCount
} from '../src/domain/math-core/regrouping';
import { hasAdditionRegrouping, hasSubtractionRegrouping } from '../src/core/generators/sampling';
import { generateVerticalQuestion } from '../src/core/generators/vertical';
import type { ProblemProfile } from '../src/domain/questions/model';

function profile(overrides: Partial<ProblemProfile> = {}): ProblemProfile {
  return {
    min: 0, max: 1000, terms: 3, carryRate: .5, highRangeRate: .5, wordSteps: 1,
    maxFactor: 9, trivialRate: 0, equalityRate: .2, mixedRate: .4,
    reverseRate: .25, multiStepRate: .3, ...overrides
  };
}

/** Independent digit-array reference: count positions whose column computation carries/borrows. */
function referenceAdditionCount(a: number, b: number): number {
  const digitsA = [...String(a)].map(Number).reverse();
  const digitsB = [...String(b)].map(Number).reverse();
  let carry = 0, count = 0;
  for (let index = 0; index < Math.max(digitsA.length, digitsB.length); index++) {
    const sum = (digitsA[index] ?? 0) + (digitsB[index] ?? 0) + carry;
    carry = sum >= 10 ? 1 : 0;
    if (carry) count++;
  }
  return count;
}

function referenceSubtractionCount(a: number, b: number): number {
  const digitsA = [...String(a)].map(Number).reverse();
  const digitsB = [...String(b)].map(Number).reverse();
  let borrow = 0, count = 0;
  for (let index = 0; index < Math.max(digitsA.length, digitsB.length); index++) {
    if ((digitsA[index] ?? 0) - borrow < (digitsB[index] ?? 0)) { borrow = 1; count++; } else borrow = 0;
  }
  return count;
}

describe('step 1: shared regrouping counters', () => {
  it('counts chained carries once per affected position', () => {
    expect(additionRegroupingCount(27, 15)).toBe(1);
    expect(additionRegroupingCount(99, 1)).toBe(2);
    expect(additionRegroupingCount(998, 15)).toBe(3);
    expect(additionRegroupingCount(11, 22)).toBe(0);
    expect(subtractionRegroupingCount(43, 27)).toBe(1);
    expect(subtractionRegroupingCount(500, 168)).toBe(2);
    expect(subtractionRegroupingCount(87, 12)).toBe(0);
    expect(multiplicationRegroupingCount(27, 3)).toBe(1);
    expect(multiplicationRegroupingCount(99, 9)).toBe(2);
    expect(multiplicationRegroupingCount(12, 3)).toBe(0);
  });

  it('matches the independent digit-array reference exhaustively below 200', () => {
    for (let a = 0; a < 200; a++) {
      for (let b = 0; b < 200; b++) {
        expect(additionRegroupingCount(a, b)).toBe(referenceAdditionCount(a, b));
        expect(subtractionRegroupingCount(a, b)).toBe(referenceSubtractionCount(a, b));
        expect(additionRegroupingCount(a, b) > 0).toBe(hasAdditionRegrouping(a, b));
        expect(subtractionRegroupingCount(a, b) > 0).toBe(hasSubtractionRegrouping(a, b));
      }
    }
  });

  it('counts multiplication carries for every factor below 10', () => {
    for (let a = 10; a < 200; a++) {
      for (let factor = 2; factor <= 9; factor++) {
        const digits = [...String(a)].map(Number).reverse();
        let carry = 0, expected = 0;
        for (const digit of digits) {
          carry = Math.floor((digit * factor + carry) / 10);
          if (carry > 0) expected++;
        }
        expect(multiplicationRegroupingCount(a, factor)).toBe(expected);
      }
    }
  });
});

describe('step 1: single-question generation honors the sub-modes', () => {
  it('respects the division sub-mode', () => {
    const random = createGenerationContext('step1-div-modes').random;
    for (let index = 0; index < 10; index++) {
      const exact = generateVerticalQuestion('verticalDivision', profile({}), random, { division: 'exact' });
      expect(Number(exact.metadata?.remainder)).toBe(0);
      const remainder = generateVerticalQuestion('verticalDivision', profile({}), random, { division: 'remainder' });
      expect(Number(remainder.metadata?.remainder)).toBeGreaterThan(0);
      const zeroQuotient = generateVerticalQuestion('verticalDivision', profile({}), random, { division: 'zeroQuotient' });
      expect(String(zeroQuotient.metadata?.quotient)).toContain('0');
    }
  });

  it('respects the multiplication and subtraction sub-modes', () => {
    const random = createGenerationContext('step1-mul-sub-modes').random;
    for (let index = 0; index < 10; index++) {
      const threeByOne = generateVerticalQuestion('verticalMultiplication', profile({}), random, { multiplication: 'threeByOne' });
      expect(threeByOne.operands[0]).toBeGreaterThanOrEqual(100);
      const twoByTwo = generateVerticalQuestion('verticalMultiplication', profile({}), random, { multiplication: 'twoByTwo' });
      expect(twoByTwo.operands[0]).toBeGreaterThanOrEqual(11);
      expect(twoByTwo.operands[1]).toBeGreaterThanOrEqual(11);
      const acrossZero = generateVerticalQuestion('verticalSubtraction', profile({}), random, { subtraction: 'acrossZero' });
      expect(acrossZero.metadata?.regrouping).toBe(true);
      expect(acrossZero.operands[0] % 10 === 0 || Math.floor(acrossZero.operands[0] / 10) % 10 === 0).toBe(true);
    }
  });

  it('defaults to mixed sub-modes when no modes are passed', () => {
    const random = createGenerationContext('step1-mixed-default').random;
    const division = generateVerticalQuestion('verticalDivision', profile({}), random);
    expect(Number(division.metadata?.quotient) % 10).not.toBe(0);
    expect(division.operands[0] % 10).not.toBe(0);
  });
});
