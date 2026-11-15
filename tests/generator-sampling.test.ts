import { describe, expect, it } from 'vitest';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import { generateAddition, generateSubtraction } from '../src/core/generators/arithmetic';
import {
  hasAdditionRegrouping, hasSubtractionRegrouping,
  sampleAddendPair, sampleProductTriple, sampleSubtrahend
} from '../src/core/generators/sampling';
import { generateTwoDigitBorrow, generateTwoDigitCarry, validateBasicQuestion } from '../src/question-types/calculation/basic';
import { generateMixedMulDiv, validateMixedMulDiv } from '../src/question-types/calculation/multiplication';
import type { QuestionGenerationInput } from '../src/domain/questions/contracts';
import type { ProblemProfile } from '../src/domain/questions/model';
import type { WorksheetConfig } from '../src/domain/worksheet/config';

const config: WorksheetConfig = {
  stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard',
  types: ['twoDigitCarry', 'twoDigitBorrow', 'mixedMulDiv'], count: 5,
  verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true,
  answerPage: false, allowDuplicates: true, randomMix: false,
  fields: { name: false, date: false, time: false, score: false, streak: false },
  orientation: 'portrait', fontSize: 'standard'
};

function profile(overrides: Partial<ProblemProfile> = {}): ProblemProfile {
  return {
    min: 0, max: 100, terms: 3, carryRate: .5, highRangeRate: .5, wordSteps: 1,
    maxFactor: 9, trivialRate: 0, equalityRate: .2, mixedRate: .4,
    reverseRate: .25, multiStepRate: .3, ...overrides
  };
}

function inputFor(type: QuestionGenerationInput['type'], seed: string, profileValue: ProblemProfile): QuestionGenerationInput {
  const context = createGenerationContext(seed);
  return { type, config, profile: profileValue, random: context.random, createId: context.createId };
}

describe('constraint sampler', () => {
  it('sampleAddendPair returns null exactly when no valid split exists', () => {
    const context = createGenerationContext('sampler-addend-exhaustive');
    for (let sum = 1; sum <= 120; sum++) {
      for (const regrouping of [true, false]) {
        const feasible: number[] = [];
        for (let a = 1; a < sum; a++) {
          if (hasAdditionRegrouping(a, sum - a) === regrouping) feasible.push(a);
        }
        const pair = sampleAddendPair(sum, regrouping, context.random);
        if (!feasible.length) {
          expect(pair).toBeNull();
        } else {
          expect(pair).not.toBeNull();
          const [a, b] = pair as [number, number];
          expect(a + b).toBe(sum);
          expect(a).toBeGreaterThanOrEqual(1);
          expect(b).toBeGreaterThanOrEqual(1);
          expect(feasible).toContain(a);
        }
      }
    }
  });

  it('sampleAddendPair covers the whole feasible set', () => {
    const context = createGenerationContext('sampler-addend-coverage');
    const feasible = new Set<number>();
    for (let a = 1; a < 15; a++) {
      if (hasAdditionRegrouping(a, 15 - a)) feasible.add(a);
    }
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const pair = sampleAddendPair(15, true, context.random);
      expect(pair).not.toBeNull();
      seen.add((pair as [number, number])[0]);
    }
    expect(seen).toEqual(feasible);
  });

  it('sampleAddendPair honors a minimum operand', () => {
    const context = createGenerationContext('sampler-addend-min');
    for (let i = 0; i < 100; i++) {
      const pair = sampleAddendPair(42, true, context.random, 10);
      expect(pair).not.toBeNull();
      const [a, b] = pair as [number, number];
      expect(a).toBeGreaterThanOrEqual(10);
      expect(b).toBeGreaterThanOrEqual(10);
      expect(hasAdditionRegrouping(a, b)).toBe(true);
    }
    // Totals ending in 9 below 100 admit no two-digit carrying split.
    expect(sampleAddendPair(29, true, context.random, 10)).toBeNull();
    expect(sampleAddendPair(39, true, context.random, 10)).toBeNull();
  });

  it('sampleSubtrahend returns null exactly when no valid subtrahend exists', () => {
    const context = createGenerationContext('sampler-subtrahend-exhaustive');
    for (let minuend = 1; minuend <= 120; minuend++) {
      for (const regrouping of [true, false]) {
        const feasible: number[] = [];
        for (let b = 1; b <= minuend; b++) {
          if (hasSubtractionRegrouping(minuend, b) === regrouping) feasible.push(b);
        }
        const subtrahend = sampleSubtrahend(minuend, regrouping, context.random);
        if (!feasible.length) {
          expect(subtrahend).toBeNull();
        } else {
          expect(subtrahend).not.toBeNull();
          expect(feasible).toContain(subtrahend as number);
        }
      }
    }
  });

  it('sampleSubtrahend covers the whole feasible set', () => {
    const context = createGenerationContext('sampler-subtrahend-coverage');
    const feasible = new Set<number>();
    for (let b = 1; b <= 30; b++) {
      if (hasSubtractionRegrouping(30, b)) feasible.add(b);
    }
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const subtrahend = sampleSubtrahend(30, true, context.random);
      expect(subtrahend).not.toBeNull();
      seen.add(subtrahend as number);
    }
    expect(seen).toEqual(feasible);
  });

  it('sampleProductTriple respects factor bounds and the product cap', () => {
    const context = createGenerationContext('sampler-product');
    for (let i = 0; i < 200; i++) {
      const triple = sampleProductTriple(2, 9, 100, context.random);
      expect(triple).not.toBeNull();
      const [a, b, divisor] = triple as [number, number, number];
      expect(a).toBeGreaterThanOrEqual(2);
      expect(a).toBeLessThanOrEqual(9);
      expect(b).toBeGreaterThanOrEqual(2);
      expect(b).toBeLessThanOrEqual(9);
      expect(divisor).toBeGreaterThanOrEqual(2);
      expect(divisor).toBeLessThanOrEqual(9);
      expect(a * b * divisor).toBeLessThanOrEqual(100);
    }
    expect(sampleProductTriple(5, 9, 100, context.random)).toBeNull();
  });
});

describe('arithmetic generators on the sampler', () => {
  it('generateAddition always honors the requested regrouping status', () => {
    for (const max of [10, 19, 20, 99, 100, 1000]) {
      for (const carry of [true, false]) {
        const context = createGenerationContext(`addition-${max}-${carry}`);
        for (let i = 0; i < 200; i++) {
          const question = generateAddition(max, carry, 'addition100', 'inline', 0, .5, 0, context.random);
          const [a, b] = question.operands;
          expect(question.answer).toBe(a + b);
          expect(a + b).toBeLessThanOrEqual(max);
          expect(hasAdditionRegrouping(a, b)).toBe(carry);
          expect(question.metadata?.regrouping).toBe(carry);
        }
      }
    }
  });

  it('generateSubtraction always honors the requested regrouping status', () => {
    for (const max of [10, 19, 20, 99, 100, 1000]) {
      for (const borrow of [true, false]) {
        const context = createGenerationContext(`subtraction-${max}-${borrow}`);
        for (let i = 0; i < 200; i++) {
          const question = generateSubtraction(max, borrow, 'subtraction100', 'inline', 0, .5, 0, context.random);
          const [a, b] = question.operands;
          expect(question.answer).toBe(a - b);
          expect(Number(question.answer)).toBeGreaterThanOrEqual(0);
          expect(a).toBeLessThanOrEqual(max);
          expect(hasSubtractionRegrouping(a, b)).toBe(borrow);
          expect(question.metadata?.regrouping).toBe(borrow);
        }
      }
    }
  });

  it('two-digit generators always produce two-digit regrouping operands', () => {
    for (let i = 0; i < 200; i++) {
      const carry = generateTwoDigitCarry(inputFor('twoDigitCarry', `twodigit-carry-${i}`, profile({ max: 100, min: 10 })));
      expect(carry.operands.every(value => value >= 10)).toBe(true);
      expect(hasAdditionRegrouping(carry.operands[0], carry.operands[1])).toBe(true);
      expect(validateBasicQuestion(carry, config).valid).toBe(true);
      const borrow = generateTwoDigitBorrow(inputFor('twoDigitBorrow', `twodigit-borrow-${i}`, profile({ max: 99, min: 10 })));
      expect(borrow.operands.every(value => value >= 10)).toBe(true);
      expect(hasSubtractionRegrouping(borrow.operands[0], borrow.operands[1])).toBe(true);
      expect(validateBasicQuestion(borrow, config).valid).toBe(true);
    }
  });

  it('mixed multiplication/division stays within the product cap and divides evenly', () => {
    for (let i = 0; i < 200; i++) {
      const question = generateMixedMulDiv(inputFor('mixedMulDiv', `mixed-muldiv-${i}`, profile({ max: 100, maxFactor: 9 })));
      expect(question.operands.every(value => value >= 1 && value <= 100)).toBe(true);
      expect(validateMixedMulDiv(question, config).valid).toBe(true);
    }
  });
});
