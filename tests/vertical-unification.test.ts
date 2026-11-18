import { describe, expect, it } from 'vitest';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import { getProblemProfile } from '../src/core/difficulty-config';
import { generateWorksheet } from '../src/core/generate';
import { generateVerticalQuestion, generateVerticalQuestions, resolveVerticalParameters } from '../src/core/generators/vertical';
import type { Difficulty, ProblemProfile } from '../src/domain/questions/model';
import type { WorksheetConfig } from '../src/domain/worksheet/config';

const base: WorksheetConfig = {
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

describe('vertical unification', () => {
  it('resolves vertical parameters from the registry profile per tier', () => {
    const expected: Record<Difficulty, ReturnType<typeof resolveVerticalParameters>> = {
      entry: { max: 300, minOperand: 30, magnitudeFloorFactor: .425, complexPerPage: 0, remainderRate: 0, factorMin: 2, factorMax: 5, maxDividend: 300, minQuotient: 15, doubleRegrouping: false, complexTier: false, digitPattern: '2+2/3+3', regroupingTarget: { min: 1, consecutive: false }, remainderPolicy: 'mixed', zeroQuotientRate: 0, acrossZeroRate: 0 },
      easy: { max: 550, minOperand: 55, magnitudeFloorFactor: .5, complexPerPage: 2, remainderRate: .2, factorMin: 2, factorMax: 6, maxDividend: 550, minQuotient: 20, doubleRegrouping: false, complexTier: false, digitPattern: '2+2/3+3', regroupingTarget: { min: 1, consecutive: false }, remainderPolicy: 'mixed', zeroQuotientRate: 0, acrossZeroRate: 0 },
      standard: { max: 1000, minOperand: 100, magnitudeFloorFactor: .6, complexPerPage: 4, remainderRate: .5, factorMin: 5, factorMax: 9, maxDividend: 1000, minQuotient: 20, doubleRegrouping: false, complexTier: false, digitPattern: '3+3', regroupingTarget: { min: 1, consecutive: false }, remainderPolicy: 'mixed', zeroQuotientRate: 0, acrossZeroRate: 0 },
      advanced: { max: 1000, minOperand: 100, magnitudeFloorFactor: .7, complexPerPage: 6, remainderRate: .75, factorMin: 5, factorMax: 9, maxDividend: 1000, minQuotient: 20, doubleRegrouping: true, complexTier: true, digitPattern: '3+3', regroupingTarget: { min: 2, consecutive: false }, remainderPolicy: 'mixed', zeroQuotientRate: 0, acrossZeroRate: 0 },
      challenge: { max: 1000, minOperand: 100, magnitudeFloorFactor: .775, complexPerPage: 7, remainderRate: .9, factorMin: 5, factorMax: 9, maxDividend: 1000, minQuotient: 20, doubleRegrouping: true, complexTier: true, digitPattern: '3+3', regroupingTarget: { min: 2, consecutive: true }, remainderPolicy: 'mixed', zeroQuotientRate: 0, acrossZeroRate: 0 }
    };
    for (const difficulty of Object.keys(expected) as Difficulty[]) {
      const resolved = getProblemProfile('verticalAddition', difficulty, 'grade3', 'curriculum');
      const { magnitudeFloorFactor, ...rest } = resolveVerticalParameters(resolved, 'addition');
      const { magnitudeFloorFactor: expectedFactor, ...expectedRest } = expected[difficulty];
      expect(rest).toEqual(expectedRest);
      expect(magnitudeFloorFactor).toBeCloseTo(expectedFactor, 10);
    }
  });

  it('floors the grade-1 vertical range at 20 so a page stays generatable', () => {
    for (const difficulty of ['entry', 'easy'] as Difficulty[]) {
      expect(getProblemProfile('verticalAddition', difficulty, 'grade1', 'curriculum').max).toBe(20);
    }
    const sheet = generateWorksheet({
      ...base, stage: 'grade1', rangeMode: 'curriculum', difficulty: 'entry',
      practiceMode: 'verticalAddSub', verticalOperations: ['addition', 'subtraction'], verticalPages: 1,
      allowDuplicates: false
    }, { seed: 'vertical-grade1-entry' });
    expect(sheet.questions).toHaveLength(8);
    expect(new Set(sheet.questions.map(question => question.signature)).size).toBe(8);
  });

  it('lets the profile bound the numbers even when the config difficulty disagrees', () => {
    const context = createGenerationContext('vertical-profile-bounds');
    const questions = generateVerticalQuestions(
      { ...base, difficulty: 'challenge', verticalOperations: ['addition', 'subtraction'] },
      profile({ max: 60, carryRate: .5, highRangeRate: .5 }),
      context.random
    );
    expect(questions).toHaveLength(8);
    for (const question of questions) {
      expect(Math.max(...question.operands)).toBeLessThanOrEqual(60);
      if (question.type === 'verticalAddition') expect(Number(question.answer)).toBeLessThanOrEqual(60);
    }
  });

  it('drives the complex quota from carryRate alone', () => {
    const all = generateVerticalQuestions(base, profile({ carryRate: 1 }), createGenerationContext('vertical-all-complex').random);
    expect(all).toHaveLength(8);
    expect(all.every(question => question.metadata?.regrouping === true)).toBe(true);
    expect(all.every(question => Number(question.metadata?.regroupingCount) >= 2)).toBe(true);
    const none = generateVerticalQuestions(base, profile({ carryRate: 0 }), createGenerationContext('vertical-no-complex').random);
    expect(none).toHaveLength(8);
    expect(none.every(question => question.metadata?.regrouping === false)).toBe(true);
    expect(none.every(question => Number(question.metadata?.regroupingCount) === 0)).toBe(true);
  });

  it('keeps the vertical output format unchanged', () => {
    const context = createGenerationContext('vertical-format');
    const addition = generateVerticalQuestion('verticalAddition', profile({}), context.random);
    expect(addition.layout).toBe('vertical');
    expect(addition.signature).toBe(`verticalAddition:${Math.min(...addition.operands)}+${Math.max(...addition.operands)}`);
    expect(Object.keys(addition.metadata ?? {}).sort()).toEqual(['magnitude', 'regrouping', 'regroupingCount', 'trivial']);
    const subtraction = generateVerticalQuestion('verticalSubtraction', profile({}), context.random);
    expect(subtraction.layout).toBe('vertical');
    expect(subtraction.signature).toBe(`verticalSubtraction:${subtraction.operands[0]}-${subtraction.operands[1]}`);
    const multiplication = generateVerticalQuestion('verticalMultiplication', profile({}), context.random);
    expect(multiplication.layout).toBe('vertical');
    expect(Object.keys(multiplication.metadata ?? {}).sort()).toEqual(['factor', 'magnitude', 'regrouping', 'regroupingCount', 'trivial']);
    const division = generateVerticalQuestion('verticalDivision', profile({}), context.random);
    expect(division.layout).toBe('longDivision');
    expect(Object.keys(division.metadata ?? {}).sort()).toEqual(['longDivision', 'magnitude', 'quotient', 'remainder', 'trivial']);
  });

  it('raises the free-mode entry ceiling from 100 to the registry 300', () => {
    const sheet = generateWorksheet({
      ...base, stage: 'grade6', rangeMode: 'free', difficulty: 'entry',
      practiceMode: 'verticalAddSub', verticalOperations: ['addition', 'subtraction'], verticalPages: 1
    }, { seed: 'vertical-free-entry' });
    expect(sheet.questions).toHaveLength(8);
    for (const question of sheet.questions) {
      expect(Number(question.answer)).toBeLessThanOrEqual(300);
      if (question.type === 'verticalAddition') expect(Number(question.answer)).toBeGreaterThan(100);
    }
    expect(sheet.questions.some(question => Number(question.answer) > 100)).toBe(true);
  });

  it('keeps grade-2 curriculum bounds at 100 with four regrouping questions', () => {
    const sheet = generateWorksheet({
      ...base, stage: 'grade2', rangeMode: 'curriculum', difficulty: 'standard',
      practiceMode: 'verticalAddSub', verticalOperations: ['addition', 'subtraction'], verticalPages: 1
    }, { seed: 'vertical-grade2' });
    expect(sheet.questions).toHaveLength(8);
    expect(sheet.questions.filter(question => question.metadata?.regrouping)).toHaveLength(4);
    for (const question of sheet.questions) {
      expect(Math.max(...question.operands)).toBeLessThanOrEqual(100);
      expect(Math.min(...question.operands)).toBeGreaterThanOrEqual(10);
      if (question.type === 'verticalAddition') expect(Number(question.answer)).toBeLessThanOrEqual(100);
    }
  });

  it('bounds division dividends by the profile and keeps quotients at ten or above', () => {
    const context = createGenerationContext('vertical-division-bounds');
    const questions = generateVerticalQuestions(
      { ...base, practiceMode: 'verticalMulDiv', verticalOperations: ['division'] },
      profile({ max: 200, carryRate: .5 }),
      context.random
    );
    expect(questions).toHaveLength(8);
    expect(questions.every(question => question.type === 'verticalDivision')).toBe(true);
    expect(questions.filter(question => Number(question.metadata?.remainder) > 0)).toHaveLength(4);
    for (const question of questions) {
      expect(question.operands[0]).toBeLessThanOrEqual(200);
      expect(Number(question.metadata?.quotient)).toBeGreaterThanOrEqual(10);
    }
  });

  it('supports verticalAll mode mixing all four vertical operations on a single page', () => {
    const sheet = generateWorksheet({
      ...base,
      stage: 'grade3',
      rangeMode: 'curriculum',
      difficulty: 'standard',
      practiceMode: 'verticalAll',
      verticalOperations: ['addition', 'subtraction', 'multiplication', 'division'],
      verticalPages: 1
    }, { seed: 'vertical-all-four' });
    expect(sheet.questions).toHaveLength(8);
    expect(sheet.questions.filter(q => q.type === 'verticalAddition')).toHaveLength(2);
    expect(sheet.questions.filter(q => q.type === 'verticalSubtraction')).toHaveLength(2);
    expect(sheet.questions.filter(q => q.type === 'verticalMultiplication')).toHaveLength(2);
    expect(sheet.questions.filter(q => q.type === 'verticalDivision')).toHaveLength(2);
  });

  it('supports specialized verticalDivisionMode: exact, remainder, zeroQuotient, and twoDigitDivisor', () => {
    const exactSheet = generateWorksheet({
      ...base,
      practiceMode: 'verticalMulDiv',
      verticalOperations: ['division'],
      verticalDivisionMode: 'exact',
      verticalPages: 1
    }, { seed: 'vertical-div-exact' });
    expect(exactSheet.questions).toHaveLength(8);
    expect(exactSheet.questions.every(q => Number(q.metadata?.remainder) === 0)).toBe(true);

    const remSheet = generateWorksheet({
      ...base,
      practiceMode: 'verticalMulDiv',
      verticalOperations: ['division'],
      verticalDivisionMode: 'remainder',
      verticalPages: 1
    }, { seed: 'vertical-div-rem' });
    expect(remSheet.questions).toHaveLength(8);
    expect(remSheet.questions.every(q => Number(q.metadata?.remainder) > 0 && Number(q.metadata?.remainder) < q.operands[1])).toBe(true);

    const zeroQSheet = generateWorksheet({
      ...base,
      practiceMode: 'verticalMulDiv',
      verticalOperations: ['division'],
      verticalDivisionMode: 'zeroQuotient',
      verticalPages: 1
    }, { seed: 'vertical-div-zeroq' });
    expect(zeroQSheet.questions).toHaveLength(8);
    expect(zeroQSheet.questions.every(q => String(q.metadata?.quotient).includes('0'))).toBe(true);

    const twoDigitSheet = generateWorksheet({
      ...base,
      stage: 'grade4',
      practiceMode: 'verticalMulDiv',
      verticalOperations: ['division'],
      verticalDivisionMode: 'twoDigitDivisor',
      verticalPages: 1
    }, { seed: 'vertical-div-2digit' });
    expect(twoDigitSheet.questions).toHaveLength(8);
    expect(twoDigitSheet.questions.every(q => q.operands[1] >= 11 && q.operands[1] <= 99)).toBe(true);
  });

  it('supports specialized verticalMultiplicationMode and verticalSubtractionMode', () => {
    const threeByOne = generateWorksheet({
      ...base,
      practiceMode: 'verticalMulDiv',
      verticalOperations: ['multiplication'],
      verticalMultiplicationMode: 'threeByOne',
      verticalPages: 1
    }, { seed: 'vertical-mul-3x1' });
    expect(threeByOne.questions.every(q => q.operands[0] >= 100 && q.operands[1] >= 2 && q.operands[1] <= 9)).toBe(true);

    const twoByTwo = generateWorksheet({
      ...base,
      stage: 'grade4',
      practiceMode: 'verticalMulDiv',
      verticalOperations: ['multiplication'],
      verticalMultiplicationMode: 'twoByTwo',
      verticalPages: 1
    }, { seed: 'vertical-mul-2x2' });
    expect(twoByTwo.questions.every(q => q.operands[0] >= 11 && q.operands[1] >= 11)).toBe(true);

    const acrossZero = generateWorksheet({
      ...base,
      practiceMode: 'verticalAddSub',
      verticalOperations: ['subtraction'],
      verticalSubtractionMode: 'acrossZero',
      verticalPages: 1
    }, { seed: 'vertical-sub-zero' });
    expect(acrossZero.questions.every(q => q.metadata?.regrouping === true && (q.operands[0] % 10 === 0 || Math.floor(q.operands[0] / 10) % 10 === 0))).toBe(true);
  });
});
