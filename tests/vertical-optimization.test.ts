import { describe, expect, it } from 'vitest';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import {
  additionRegroupingCount,
  hasAcrossZeroPattern,
  hasConsecutiveAdditionRegrouping,
  hasConsecutiveMultiplicationRegrouping,
  hasConsecutiveSubtractionRegrouping,
  multiplicationRegroupingCount,
  subtractionRegroupingCount
} from '../src/domain/math-core/regrouping';
import { hasAdditionRegrouping, hasSubtractionRegrouping } from '../src/core/generators/sampling';
import {
  sampleAddendPairWithRegrouping,
  sampleDivision,
  sampleMultiplicationPair,
  sampleSubtrahendWithBorrows,
  type RegroupingTarget
} from '../src/core/generators/sampling';
import { generateWorksheet } from '../src/core/generate';
import { generateVerticalQuestion, generateVerticalQuestions, resolveVerticalParameters } from '../src/core/generators/vertical';
import { scoreQuestionDifficulty } from '../src/domain/questions/difficulty-score';
import { normalizeStoredWorksheetConfig } from '../src/features/worksheet-builder/config';
import type { ProblemProfile, Question } from '../src/domain/questions/model';
import type { WorksheetConfig } from '../src/domain/worksheet/config';

const worksheetBase: WorksheetConfig = {
  stage: 'grade3', rangeMode: 'curriculum', difficulty: 'standard', practiceMode: 'verticalAddSub',
  types: ['addition100'], count: 8,
  verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true,
  answerPage: false, allowDuplicates: true, randomMix: false,
  fields: { name: false, date: false, time: false, score: false, streak: false },
  orientation: 'portrait', fontSize: 'standard'
};

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

const TARGETS: RegroupingTarget[] = [
  { min: 0, max: 0 },
  { min: 1 },
  { min: 2 },
  { min: 1, consecutive: true },
  { min: 2, consecutive: true }
];

function matchesTarget(count: number, consecutive: boolean, target: RegroupingTarget): boolean {
  return count >= target.min && (target.max === undefined || count <= target.max) && (!target.consecutive || consecutive);
}

describe('step 2: vertical constraint samplers', () => {
  it('sampleAddendPairWithRegrouping returns null exactly when no valid split exists', () => {
    const context = createGenerationContext('step2-addend-exhaustive');
    for (let sum = 1; sum <= 120; sum++) {
      for (const target of TARGETS) {
        const feasible: number[] = [];
        for (let a = 1; a < sum; a++) {
          if (matchesTarget(additionRegroupingCount(a, sum - a), hasConsecutiveAdditionRegrouping(a, sum - a), target)) feasible.push(a);
        }
        const pair = sampleAddendPairWithRegrouping(sum, target, context.random);
        if (!feasible.length) {
          expect(pair).toBeNull();
        } else {
          expect(pair).not.toBeNull();
          const [a, b] = pair as [number, number];
          expect(a + b).toBe(sum);
          expect(feasible).toContain(a);
        }
      }
    }
  });

  it('sampleAddendPairWithRegrouping covers the whole feasible set', () => {
    const context = createGenerationContext('step2-addend-coverage');
    const feasible = new Set<number>();
    for (let a = 1; a < 15; a++) {
      if (additionRegroupingCount(a, 15 - a) >= 1) feasible.add(a);
    }
    expect(feasible.size).toBeGreaterThan(1);
    const seen = new Set<number>();
    for (let index = 0; index < 500; index++) {
      const pair = sampleAddendPairWithRegrouping(15, { min: 1 }, context.random);
      expect(pair).not.toBeNull();
      seen.add((pair as [number, number])[0]);
    }
    expect(seen).toEqual(feasible);
  });

  it('sampleAddendPairWithRegrouping honors exact counts, consecutive carries, and filters', () => {
    const context = createGenerationContext('step2-addend-targets');
    for (let index = 0; index < 50; index++) {
      const exact = sampleAddendPairWithRegrouping(200, { min: 2, max: 2 }, context.random);
      expect(exact).not.toBeNull();
      expect(additionRegroupingCount(exact![0], exact![1])).toBe(2);
      const consecutive = sampleAddendPairWithRegrouping(200, { min: 2, consecutive: true }, context.random);
      expect(consecutive).not.toBeNull();
      expect(hasConsecutiveAdditionRegrouping(consecutive![0], consecutive![1])).toBe(true);
      const filtered = sampleAddendPairWithRegrouping(96, { min: 0, max: 0 }, context.random, {
        minOperand: 10,
        filter: (a, b) => a % 10 !== 0 && b % 10 !== 0 && a !== b
      });
      expect(filtered).not.toBeNull();
      expect(filtered![0]).toBeGreaterThanOrEqual(10);
      expect(filtered![1]).toBeGreaterThanOrEqual(10);
      expect(filtered![0] % 10).not.toBe(0);
      expect(filtered![1] % 10).not.toBe(0);
      expect(filtered![0]).not.toBe(filtered![1]);
    }
    expect(sampleAddendPairWithRegrouping(19, { min: 1 }, context.random)).toBeNull();
  });

  it('sampleSubtrahendWithBorrows returns null exactly when no valid subtrahend exists', () => {
    const context = createGenerationContext('step2-subtrahend-exhaustive');
    for (let minuend = 1; minuend <= 120; minuend++) {
      for (const target of TARGETS) {
        for (const acrossZero of [false, true]) {
          const feasible: number[] = [];
          for (let b = 1; b <= minuend; b++) {
            if (!matchesTarget(subtractionRegroupingCount(minuend, b), hasConsecutiveSubtractionRegrouping(minuend, b), target)) continue;
            if (acrossZero && !hasAcrossZeroPattern(minuend, b)) continue;
            feasible.push(b);
          }
          const picked = sampleSubtrahendWithBorrows(minuend, target, context.random, { acrossZero });
          if (!feasible.length) {
            expect(picked).toBeNull();
          } else {
            expect(picked).not.toBeNull();
            expect(feasible).toContain(picked as number);
          }
        }
      }
    }
  });

  it('sampleSubtrahendWithBorrows covers the feasible set and honors acrossZero', () => {
    const context = createGenerationContext('step2-subtrahend-coverage');
    const feasible = new Set<number>();
    for (let b = 1; b <= 42; b++) {
      if (subtractionRegroupingCount(42, b) >= 1) feasible.add(b);
    }
    const seen = new Set<number>();
    for (let index = 0; index < 500; index++) {
      const picked = sampleSubtrahendWithBorrows(42, { min: 1 }, context.random);
      expect(picked).not.toBeNull();
      seen.add(picked as number);
    }
    expect(seen).toEqual(feasible);
    for (let index = 0; index < 30; index++) {
      const picked = sampleSubtrahendWithBorrows(500, { min: 1 }, context.random, { acrossZero: true });
      expect(picked).not.toBeNull();
      expect(hasAcrossZeroPattern(500, picked as number)).toBe(true);
    }
    expect(sampleSubtrahendWithBorrows(87, { min: 1 }, context.random, { acrossZero: true })).toBeNull();
  });

  it('sampleMultiplicationPair returns null exactly when no valid pair exists', () => {
    const context = createGenerationContext('step2-mul-exhaustive');
    for (const target of TARGETS) {
      const feasible: Array<[number, number]> = [];
      for (let a = 10; a <= 30; a++) {
        for (let b = 2; b <= 9; b++) {
          if (matchesTarget(multiplicationRegroupingCount(a, b), hasConsecutiveMultiplicationRegrouping(a, b), target)) feasible.push([a, b]);
        }
      }
      const pair = sampleMultiplicationPair(10, 30, 2, 9, target, context.random);
      if (!feasible.length) {
        expect(pair).toBeNull();
      } else {
        expect(pair).not.toBeNull();
        expect(feasible).toContainEqual(pair as [number, number]);
      }
    }
  });

  it('sampleMultiplicationPair covers the feasible set and honors digit patterns', () => {
    const context = createGenerationContext('step2-mul-coverage');
    const feasible = new Set<string>();
    for (let a = 10; a <= 19; a++) {
      for (let b = 2; b <= 3; b++) {
        if (multiplicationRegroupingCount(a, b) >= 1) feasible.add(`${a}x${b}`);
      }
    }
    const seen = new Set<string>();
    for (let index = 0; index < 500; index++) {
      const pair = sampleMultiplicationPair(10, 19, 2, 3, { min: 1 }, context.random);
      expect(pair).not.toBeNull();
      seen.add(`${pair![0]}x${pair![1]}`);
    }
    expect(seen).toEqual(feasible);
    const threeByOne = sampleMultiplicationPair(100, 999, 2, 9, { min: 1 }, context.random, {
      filter: (a, b) => a % 10 !== 0 && a * b <= 1000
    });
    expect(threeByOne).not.toBeNull();
    expect(threeByOne![0]).toBeGreaterThanOrEqual(100);
    expect(threeByOne![0] * threeByOne![1]).toBeLessThanOrEqual(1000);
    expect(sampleMultiplicationPair(100, 999, 2, 9, { min: 0, max: 0 }, context.random, {
      filter: (a, b) => a * b <= 20
    })).toBeNull();
  });

  it('sampleDivision returns null exactly when no valid division exists', () => {
    const context = createGenerationContext('step2-div-exhaustive');
    for (const remainder of [false, true]) {
      for (const zeroQuotient of [false, true]) {
        const feasible: string[] = [];
        for (let divisor = 2; divisor <= 9; divisor++) {
          for (let quotient = 10; quotient <= 30; quotient++) {
            if (zeroQuotient && !String(quotient).includes('0')) continue;
            const remainders = remainder ? Array.from({ length: divisor - 1 }, (_, i) => i + 1) : [0];
            for (const r of remainders) feasible.push(`${divisor * quotient + r}÷${divisor}=${quotient}r${r}`);
          }
        }
        const sample = sampleDivision(2, 9, 10, 30, { remainder, zeroQuotient }, context.random);
        if (!feasible.length) {
          expect(sample).toBeNull();
        } else {
          expect(sample).not.toBeNull();
          expect(feasible).toContain(`${sample!.dividend}÷${sample!.divisor}=${sample!.quotient}r${sample!.remainder}`);
          expect(sample!.dividend).toBe(sample!.divisor * sample!.quotient + sample!.remainder);
        }
      }
    }
    expect(sampleDivision(2, 9, 10, 30, { remainder: true, zeroQuotient: true, filter: () => false }, context.random)).toBeNull();
  });

  it('sampleDivision covers the feasible set', () => {
    const context = createGenerationContext('step2-div-coverage');
    const feasible = new Set<string>();
    for (let divisor = 2; divisor <= 3; divisor++) {
      for (let quotient = 10; quotient <= 12; quotient++) {
        for (let r = 1; r < divisor; r++) feasible.add(`${divisor}x${quotient}r${r}`);
      }
    }
    const seen = new Set<string>();
    for (let index = 0; index < 500; index++) {
      const sample = sampleDivision(2, 3, 10, 12, { remainder: true }, context.random);
      expect(sample).not.toBeNull();
      seen.add(`${sample!.divisor}x${sample!.quotient}r${sample!.remainder}`);
    }
    expect(seen).toEqual(feasible);
  });
});

describe('step 2: sampler-based vertical generation', () => {
  it('throws a constraint-naming error when division is infeasible', () => {
    const random = createGenerationContext('step2-div-infeasible').random;
    expect(() => generateVerticalQuestion('verticalDivision', profile({ max: 20, maxFactor: 5 }), random))
      .toThrow(/除数 2–5，商 ≥ 10/);
  });

  it('generates acrossZero subtraction at grade 1 within the profile max', () => {
    const sheet = generateWorksheet({
      ...worksheetBase, stage: 'grade1', rangeMode: 'curriculum', difficulty: 'entry',
      practiceMode: 'verticalAddSub', verticalOperations: ['subtraction'],
      verticalSubtractionMode: 'acrossZero', verticalPages: 1
    }, { seed: 'step2-across-zero-g1' });
    expect(sheet.questions).toHaveLength(8);
    expect(sheet.questions.every(q => q.metadata?.regrouping === true)).toBe(true);
    expect(sheet.questions.every(q => q.operands[0] % 10 === 0 || Math.floor(q.operands[0] / 10) % 10 === 0)).toBe(true);
    expect(sheet.questions.every(q => q.operands[0] <= 20)).toBe(true);
  });

  it('fills a tight no-duplicate pool at grade 1 without spinning', () => {
    const sheet = generateWorksheet({
      ...worksheetBase, stage: 'grade1', rangeMode: 'curriculum', difficulty: 'entry',
      practiceMode: 'verticalAddSub', verticalOperations: ['addition', 'subtraction'],
      verticalPages: 2, allowDuplicates: false
    }, { seed: 'step2-tight-pool' });
    expect(sheet.questions).toHaveLength(16);
    expect(new Set(sheet.questions.map(q => q.signature)).size).toBe(16);
  });

  it('never emits swapped addition pairs on a no-duplicate worksheet', () => {
    const sheet = generateWorksheet({
      ...worksheetBase, stage: 'grade3', rangeMode: 'curriculum', difficulty: 'standard',
      practiceMode: 'verticalAll', verticalOperations: ['addition', 'subtraction', 'multiplication', 'division'],
      verticalPages: 5, allowDuplicates: false, randomMix: true
    }, { seed: 'step2-no-swapped-pairs' });
    expect(sheet.questions).toHaveLength(40);
    const additionKeys = sheet.questions
      .filter(q => q.type === 'verticalAddition')
      .map(q => [...q.operands].sort((a, b) => a - b).join('+'));
    expect(new Set(additionKeys).size).toBe(additionKeys.length);
  });

  it('keeps exact regrouping counts under the sampler at every quota extreme', () => {
    const all = generateVerticalQuestions(worksheetBase, profile({ carryRate: 1 }), createGenerationContext('step2-all-complex').random);
    expect(all.every(q => Number(q.metadata?.regroupingCount) >= 2)).toBe(true);
    const none = generateVerticalQuestions(worksheetBase, profile({ carryRate: 0 }), createGenerationContext('step2-no-complex').random);
    expect(none.every(q => Number(q.metadata?.regroupingCount) === 0)).toBe(true);
  });
});

describe('step 3: per-operation difficulty profiles', () => {
  it('resolves different digit patterns per operation from the same profile', () => {
    const standard = profile({});
    expect(resolveVerticalParameters(standard, 'addition').digitPattern).toBe('3+3');
    expect(resolveVerticalParameters(standard, 'subtraction').digitPattern).toBe('3-3');
    expect(resolveVerticalParameters(standard, 'multiplication').digitPattern).toBe('2×1');
    expect(resolveVerticalParameters(standard, 'division').digitPattern).toBe('3÷1');
    const small = profile({ max: 100 });
    expect(resolveVerticalParameters(small, 'addition').digitPattern).toBe('2+2');
    expect(resolveVerticalParameters(small, 'subtraction').digitPattern).toBe('2-2');
    const tiny = profile({ max: 20 });
    expect(resolveVerticalParameters(tiny, 'addition').digitPattern).toBe('2位数以内');
  });

  it('maps sub-modes onto the resolved fields', () => {
    const baseProfile = profile({});
    expect(resolveVerticalParameters(baseProfile, 'division', { division: 'exact' }).remainderPolicy).toBe('exact');
    expect(resolveVerticalParameters(baseProfile, 'division', { division: 'remainder' }).remainderPolicy).toBe('remainder');
    expect(resolveVerticalParameters(baseProfile, 'division', { division: 'mixed' }).remainderPolicy).toBe('mixed');
    expect(resolveVerticalParameters(baseProfile, 'division', { division: 'zeroQuotient' }).zeroQuotientRate).toBe(1);
    expect(resolveVerticalParameters(baseProfile, 'division', { division: 'mixed' }).zeroQuotientRate).toBe(0);
    expect(resolveVerticalParameters(baseProfile, 'subtraction', { subtraction: 'acrossZero' }).acrossZeroRate).toBe(1);
    expect(resolveVerticalParameters(baseProfile, 'subtraction', { subtraction: 'mixed' }).acrossZeroRate).toBe(0);
    expect(resolveVerticalParameters(baseProfile, 'multiplication', { multiplication: 'threeByOne' }).digitPattern).toBe('3×1');
    expect(resolveVerticalParameters(baseProfile, 'multiplication', { multiplication: 'twoByTwo' }).digitPattern).toBe('2×2');
    expect(resolveVerticalParameters(baseProfile, 'division', { division: 'twoDigitDivisor' }).digitPattern).toBe('3÷2');
  });

  it('demands consecutive regroupings only at the challenge tier', () => {
    expect(resolveVerticalParameters(profile({ carryRate: .5 }), 'addition').regroupingTarget).toEqual({ min: 1, consecutive: false });
    expect(resolveVerticalParameters(profile({ carryRate: .75 }), 'addition').regroupingTarget).toEqual({ min: 2, consecutive: false });
    expect(resolveVerticalParameters(profile({ carryRate: .9 }), 'addition').regroupingTarget).toEqual({ min: 2, consecutive: true });
    expect(resolveVerticalParameters(profile({ carryRate: .9, max: 100 }), 'addition').regroupingTarget).toEqual({ min: 1, consecutive: true });
  });

  it('bounds each operation by its own profile in a per-operation record', () => {
    const questions = generateVerticalQuestions(
      { ...worksheetBase, practiceMode: 'verticalAll', verticalOperations: ['addition', 'subtraction', 'multiplication', 'division'] },
      {
        addition: profile({ max: 60, carryRate: .5, highRangeRate: .5 }),
        subtraction: profile({ max: 60, carryRate: .5, highRangeRate: .5 }),
        multiplication: profile({ max: 1000, carryRate: .5, highRangeRate: .5 }),
        division: profile({ max: 200, carryRate: .5, highRangeRate: .5 })
      },
      createGenerationContext('step3-per-op-bounds').random
    );
    expect(questions).toHaveLength(8);
    for (const question of questions) {
      if (question.type === 'verticalAddition') expect(Number(question.answer)).toBeLessThanOrEqual(60);
      if (question.type === 'verticalSubtraction') expect(question.operands[0]).toBeLessThanOrEqual(60);
      if (question.type === 'verticalDivision') expect(question.operands[0]).toBeLessThanOrEqual(200);
    }
  });

  it('drives complex quotas from each operation\'s own carry rate', () => {
    const questions = generateVerticalQuestions(
      worksheetBase,
      {
        addition: profile({ carryRate: 1 }),
        subtraction: profile({ carryRate: 0 }),
        multiplication: profile({ carryRate: .5 }),
        division: profile({ carryRate: .5 })
      },
      createGenerationContext('step3-per-op-quota').random
    );
    expect(questions.filter(q => q.type === 'verticalAddition').every(q => q.metadata?.regrouping === true)).toBe(true);
    expect(questions.filter(q => q.type === 'verticalSubtraction').every(q => q.metadata?.regrouping === false)).toBe(true);
  });

  it('generates consecutive regroupings on complex challenge slots', () => {
    const questions = generateVerticalQuestions(
      { ...worksheetBase, practiceMode: 'verticalAddSub', verticalOperations: ['addition', 'subtraction'] },
      profile({ carryRate: .9, highRangeRate: .85 }),
      createGenerationContext('step3-consecutive').random
    );
    const complex = questions.filter(q => q.metadata?.regrouping === true);
    expect(complex.length).toBeGreaterThan(0);
    for (const question of complex) {
      const [a, b] = question.operands;
      const consecutive = question.type === 'verticalAddition'
        ? hasConsecutiveAdditionRegrouping(a, b)
        : hasConsecutiveSubtractionRegrouping(a, b);
      expect(consecutive).toBe(true);
    }
  });
});

describe('step 3: saved-config compatibility', () => {
  it('keeps the three sub-modes when loading a stored config', () => {
    const loaded = normalizeStoredWorksheetConfig({
      stage: 'grade3', rangeMode: 'curriculum', difficulty: 'standard',
      practiceMode: 'verticalMulDiv', verticalOperations: ['multiplication', 'division'],
      verticalDivisionMode: 'zeroQuotient',
      verticalMultiplicationMode: 'twoByTwo',
      verticalSubtractionMode: 'acrossZero'
    });
    expect(loaded.verticalDivisionMode).toBe('zeroQuotient');
    expect(loaded.verticalMultiplicationMode).toBe('twoByTwo');
    expect(loaded.verticalSubtractionMode).toBe('acrossZero');
    const sheet = generateWorksheet({ ...loaded, verticalPages: 1 }, { seed: 'step3-stored-modes' });
    expect(sheet.questions.every(q => String(q.metadata?.quotient ?? '').includes('0') || q.type === 'verticalMultiplication')).toBe(true);
    expect(sheet.questions.filter(q => q.type === 'verticalMultiplication').every(q => q.operands[1] >= 11)).toBe(true);
  });

  it('drops unknown sub-mode values and tolerates configs without them', () => {
    const loaded = normalizeStoredWorksheetConfig({
      stage: 'grade3', rangeMode: 'curriculum', difficulty: 'standard',
      practiceMode: 'verticalMulDiv', verticalOperations: ['multiplication', 'division'],
      verticalDivisionMode: 'bogus', verticalMultiplicationMode: 42
    });
    expect(loaded.verticalDivisionMode).toBeUndefined();
    expect(loaded.verticalMultiplicationMode).toBeUndefined();
    expect(loaded.verticalSubtractionMode).toBeUndefined();
    const sheet = generateWorksheet({ ...loaded, verticalPages: 1 }, { seed: 'step3-stored-defaults' });
    expect(sheet.questions).toHaveLength(8);
  });
});

describe('step 4: vertical difficulty score', () => {
  const verticalQuestion = (
    type: 'verticalAddition' | 'verticalSubtraction' | 'verticalMultiplication' | 'verticalDivision',
    operands: [number, number],
    answer: number | string,
    metadata: Record<string, string | number | boolean> = {}
  ): Question => ({
    id: 'q-v', type, text: '', answer, operands,
    operators: [type === 'verticalAddition' ? '+' : type === 'verticalSubtraction' ? '-' : type === 'verticalMultiplication' ? '×' : '÷'],
    signature: `${type}:${operands.join(',')}`,
    layout: type === 'verticalDivision' ? 'longDivision' : 'vertical',
    metadata
  });
  const profileMax = { max: 1000 };

  it('ranks more regroupings higher at the same digit count', () => {
    const none = scoreQuestionDifficulty(verticalQuestion('verticalAddition', [11, 22], 33, { magnitude: 33 }), profileMax);
    const one = scoreQuestionDifficulty(verticalQuestion('verticalAddition', [27, 15], 42, { magnitude: 42 }), profileMax);
    const two = scoreQuestionDifficulty(verticalQuestion('verticalAddition', [789, 234], 1023, { magnitude: 1023 }), profileMax);
    expect(one).toBeGreaterThan(none);
    expect(two).toBeGreaterThan(one);
  });

  it('ranks more digits higher at the same regrouping count', () => {
    const twoDigit = scoreQuestionDifficulty(verticalQuestion('verticalAddition', [11, 22], 33, { magnitude: 33 }), profileMax);
    const threeDigit = scoreQuestionDifficulty(verticalQuestion('verticalAddition', [111, 222], 333, { magnitude: 333 }), profileMax);
    expect(threeDigit).toBeGreaterThan(twoDigit);
  });

  it('ranks across-zero borrowing above plain borrowing at the same count', () => {
    const plain = scoreQuestionDifficulty(verticalQuestion('verticalSubtraction', [642, 258], 384, { magnitude: 642 }), profileMax);
    const acrossZero = scoreQuestionDifficulty(verticalQuestion('verticalSubtraction', [500, 168], 332, { magnitude: 500 }), profileMax);
    expect(acrossZero).toBeGreaterThan(plain);
  });

  it('ranks partial-product rows above single-factor multiplication', () => {
    const twoByOne = scoreQuestionDifficulty(verticalQuestion('verticalMultiplication', [99, 9], 891, { magnitude: 891 }), profileMax);
    const twoByTwo = scoreQuestionDifficulty(verticalQuestion('verticalMultiplication', [34, 26], 884, { magnitude: 884 }), profileMax);
    expect(twoByTwo).toBeGreaterThan(twoByOne);
  });

  it('ranks division by remainder, zero quotient, and two-digit divisor', () => {
    const exact = scoreQuestionDifficulty(verticalQuestion('verticalDivision', [96, 8], 12, { magnitude: 96, quotient: 12, remainder: 0 }), profileMax);
    const remainderOnly = scoreQuestionDifficulty(verticalQuestion('verticalDivision', [97, 8], '12……1', { magnitude: 97, quotient: 12, remainder: 1 }), profileMax);
    const zeroQuotientOnly = scoreQuestionDifficulty(verticalQuestion('verticalDivision', [80, 8], 10, { magnitude: 80, quotient: 10, remainder: 0 }), profileMax);
    const both = scoreQuestionDifficulty(verticalQuestion('verticalDivision', [85, 8], '10……5', { magnitude: 85, quotient: 10, remainder: 5 }), profileMax);
    expect(remainderOnly).toBeGreaterThan(exact);
    expect(zeroQuotientOnly).toBeGreaterThan(exact);
    expect(both).toBeGreaterThan(remainderOnly);
    expect(both).toBeGreaterThan(zeroQuotientOnly);
    const oneDigitDivisor = scoreQuestionDifficulty(verticalQuestion('verticalDivision', [204, 6], 34, { magnitude: 204, quotient: 34, remainder: 0 }), profileMax);
    const twoDigitDivisor = scoreQuestionDifficulty(verticalQuestion('verticalDivision', [204, 12], 17, { magnitude: 204, quotient: 17, remainder: 0 }), profileMax);
    expect(twoDigitDivisor).toBeGreaterThan(oneDigitDivisor);
  });

  it('recomputes regrouping from operands instead of trusting metadata', () => {
    const trusted = scoreQuestionDifficulty(
      verticalQuestion('verticalAddition', [27, 15], 42, { magnitude: 42, regrouping: true, regroupingCount: 1 }), profileMax);
    const stale = scoreQuestionDifficulty(
      verticalQuestion('verticalAddition', [27, 15], 42, { magnitude: 42, regrouping: false, regroupingCount: 0 }), profileMax);
    expect(stale).toBe(trusted);
  });

  it('keeps every generated vertical score within [0, 1]', () => {
    for (const practiceMode of ['verticalAddSub', 'verticalMulDiv', 'verticalAll'] as const) {
      const sheet = generateWorksheet({
        ...worksheetBase, practiceMode,
        verticalOperations: practiceMode === 'verticalAddSub' ? ['addition', 'subtraction'] : practiceMode === 'verticalMulDiv' ? ['multiplication', 'division'] : ['addition', 'subtraction', 'multiplication', 'division'],
        verticalPages: 2
      }, { seed: `step4-bounds-${practiceMode}` });
      for (const question of sheet.questions) {
        const score = scoreQuestionDifficulty(question, { max: 1000 });
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    }
  });

  it('sums the renormalized generic weights to exactly 1', () => {
    const maxed: Question = {
      id: 'q-max', type: 'addition100', text: '', answer: 9999, operands: [9999],
      operators: ['+', '-', '+'], signature: 'max', layout: 'inline',
      metadata: { regrouping: true, reverse: true }
    };
    expect(scoreQuestionDifficulty(maxed, { max: 1000 })).toBeCloseTo(1, 10);
  });
});
