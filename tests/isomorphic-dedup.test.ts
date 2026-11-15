import { describe, expect, it } from 'vitest';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import { buildArithmeticQuestion, generateAddition, generateSubtraction } from '../src/core/generators/arithmetic';
import { deduplicate } from '../src/core/deduplication';
import { generateWorksheet } from '../src/core/generate';
import { generateChainAddition } from '../src/question-types/calculation/basic';
import { generateSameDenominatorFraction } from '../src/question-types/calculation/basics-plus';
import { generateMultiplication, generateTwoDigitByTwoMultiplication } from '../src/question-types/calculation/multiplication';
import { generateCompareSigns, generateComparison } from '../src/question-types/concept/number-sense';
import { generateOddEven } from '../src/question-types/concept/early-number';
import { generatePolygonPerimeter } from '../src/question-types/geometry-measurement/polygon-perimeter';
import type { QuestionGenerationInput } from '../src/domain/questions/contracts';
import type { ProblemProfile } from '../src/domain/questions/model';
import type { WorksheetConfig } from '../src/domain/worksheet/config';

const config: WorksheetConfig = {
  stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard',
  types: ['addition100'], count: 5,
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

describe('isomorphic dedup signatures', () => {
  it('treats swapped addition operands as the same question', () => {
    const context = createGenerationContext('isomorphic-addition');
    const forward = buildArithmeticQuestion('addition100', 3, 5, '+', 'inline', context.random);
    const swapped = buildArithmeticQuestion('addition100', 5, 3, '+', 'inline', context.random);
    expect(forward.signature).toBe('addition100:3+5');
    expect(swapped.signature).toBe(forward.signature);
    expect(forward.text).not.toBe(swapped.text);
    expect(deduplicate([forward, swapped])).toHaveLength(1);
    for (let i = 0; i < 200; i++) {
      const question = generateAddition(100, i % 2 === 0, 'addition100', 'inline', 0, .5, 0, context.random);
      const [a, b] = question.operands;
      expect(question.signature).toBe(`addition100:${Math.min(a, b)}+${Math.max(a, b)}`);
    }
  });

  it('keeps subtraction operand order significant', () => {
    const context = createGenerationContext('isomorphic-subtraction');
    const forward = buildArithmeticQuestion('subtraction100', 8, 3, '-', 'inline', context.random);
    const swapped = buildArithmeticQuestion('subtraction100', 3, 8, '-', 'inline', context.random);
    expect(forward.signature).toBe('subtraction100:8-3');
    expect(swapped.signature).toBe('subtraction100:3-8');
    expect(deduplicate([forward, swapped])).toHaveLength(2);
    for (let i = 0; i < 100; i++) {
      const question = generateSubtraction(100, i % 2 === 0, 'subtraction100', 'inline', 0, .5, 0, context.random);
      const [a, b] = question.operands;
      expect(question.signature).toBe(`subtraction100:${a}-${b}`);
    }
  });

  it('never puts operand-swapped additions on one worksheet', () => {
    const sheet = generateWorksheet({
      ...config, types: ['addition100'], count: 30, allowDuplicates: false
    }, { seed: 'isomorphic-worksheet' });
    const keys = sheet.questions.map(question => {
      const [a, b] = [...question.operands].sort((left, right) => left - right);
      return `${a}+${b}`;
    });
    expect(new Set(keys).size).toBe(sheet.questions.length);
  });

  it('sorts chainAddition operands in the signature but keeps the shown order', () => {
    for (let i = 0; i < 100; i++) {
      const question = generateChainAddition(inputFor('chainAddition', `chain-${i}`, profile({ max: 1000 })));
      const signatureOperands = question.signature
        .replace('chainAddition:', '').replace(' =', '').split(' + ').map(Number);
      expect(signatureOperands).toEqual([...question.operands].sort((left, right) => left - right));
    }
  });

  it('treats the two display orders of choose-larger as the same question', () => {
    for (let i = 0; i < 100; i++) {
      const question = generateComparison(inputFor('comparison', `comparison-${i}`, profile({ max: 100 })));
      const [left, right] = question.operands;
      expect(question.signature).toBe(`comparison:${Math.min(left, right)}:${Math.max(left, right)}`);
    }
  });

  it('keeps compareSigns operand order significant', () => {
    for (let i = 0; i < 100; i++) {
      const question = generateCompareSigns(inputFor('compareSigns', `signs-${i}`, profile({ max: 100 })));
      const [left, right] = question.operands;
      expect(question.signature).toBe(`compareSigns:${left}:${right}`);
    }
  });

  it('sorts same-denominator fraction addition but not subtraction', () => {
    let sawAdd = 0;
    let sawSubtract = 0;
    for (let i = 0; i < 300 && (sawAdd < 20 || sawSubtract < 20); i++) {
      const question = generateSameDenominatorFraction(inputFor('sameDenominatorFraction', `fraction-${i}`, profile({ max: 20 })));
      const form = question.metadata?.form;
      const [n1, n2, d] = question.operands;
      if (form === 'add') {
        sawAdd++;
        expect(question.signature).toBe(`sameDenominatorFraction:add:${Math.min(n1, n2)}/${d}:${Math.max(n1, n2)}/${d}`);
      } else if (form === 'subtract') {
        sawSubtract++;
        expect(question.signature).toBe(`sameDenominatorFraction:sub:${n1}/${d}:${n2}/${d}`);
      }
    }
    expect(sawAdd).toBeGreaterThanOrEqual(20);
    expect(sawSubtract).toBeGreaterThanOrEqual(20);
  });

  it('keeps the already-canonical multiplication signatures canonical', () => {
    for (let i = 0; i < 100; i++) {
      const single = generateMultiplication(inputFor('multiplication', `mul-${i}`, profile({})));
      const [a, b] = single.operands;
      expect(single.signature).toBe(`multiplication:${Math.min(a, b)}×${Math.max(a, b)}`);
      const twoByTwo = generateTwoDigitByTwoMultiplication(inputFor('twoDigitByTwoMultiplication', `mul22-${i}`, profile({ max: 99 })));
      const [left, right] = twoByTwo.operands;
      expect(twoByTwo.signature).toBe(`twoDigitByTwoMultiplication:${Math.min(left, right)}×${Math.max(left, right)}`);
    }
  });

  it('addition10 capacity is the 36 unordered pairs', () => {
    const full = generateWorksheet({
      ...config, stage: 'grade1', rangeMode: 'curriculum', types: ['addition10'],
      count: 36, allowDuplicates: false
    }, { seed: 'addition10-capacity' });
    expect(full.questions).toHaveLength(36);
    expect(new Set(full.questions.map(question => question.signature)).size).toBe(36);
    expect(() => generateWorksheet({
      ...config, stage: 'grade1', rangeMode: 'curriculum', types: ['addition10'],
      count: 37, allowDuplicates: false
    }, { seed: 'addition10-overflow' })).toThrow(/只能生成/);
  });

  it('canonicalizes oddEven option sets and polygonPerimeter triangle/quadrilateral side orders', () => {
    let sawFind = 0;
    for (let i = 0; i < 100; i++) {
      const question = generateOddEven(inputFor('oddEven', `odd-even-${i}`, profile({ max: 20 })));
      if (question.metadata?.form === 'find') {
        sawFind++;
        const sorted = [...question.operands].sort((left, right) => left - right).join(',');
        expect(question.signature).toBe(`oddEven:find:${String(question.metadata?.parity)}:${sorted}`);
      }
    }
    expect(sawFind).toBeGreaterThan(10);

    let sawPolygon = 0;
    for (let i = 0; i < 100; i++) {
      const question = generatePolygonPerimeter(inputFor('polygonPerimeter', `poly-${i}`, profile({ max: 50 })));
      const form = String(question.metadata?.form);
      const unit = String(question.metadata?.unit);
      if (form === 'triangle' || form === 'quadrilateral') {
        sawPolygon++;
        const sorted = [...question.operands].sort((left, right) => left - right).join(',');
        expect(question.signature).toBe(`polygonPerimeter:${form}:${unit}:${sorted}`);
      }
    }
    expect(sawPolygon).toBeGreaterThan(10);
  });
});
