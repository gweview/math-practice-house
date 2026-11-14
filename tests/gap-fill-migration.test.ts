import { describe, expect, it } from 'vitest';
import type { ProblemProfile, Question, WorksheetConfig } from '../src/core/types';
import { getQuestionDefinition } from '../src/domain/questions/registry';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import type { ProblemType } from '../src/domain/questions/problem-type';

/**
 * Coverage for the grade 1-3 taxonomy gap-fill types added after v2.0.0:
 * oddEven, tenMoreLess, moneySense, shapePattern, repeatedAddition,
 * sameDenominatorFraction, fractionOfAmount, multiplicativeComparison,
 * polygonPerimeter, likelihoodLanguage, plus the extended unitConversion table.
 */
const TYPES: ProblemType[] = [
  'oddEven', 'tenMoreLess', 'moneySense', 'shapePattern', 'repeatedAddition',
  'sameDenominatorFraction', 'fractionOfAmount', 'multiplicativeComparison',
  'polygonPerimeter', 'likelihoodLanguage'
];

function config(overrides: Partial<WorksheetConfig> = {}): WorksheetConfig {
  return {
    stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard', types: TYPES,
    count: 20, verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true,
    showLines: true, answerPage: false, answerMode: 'none', allowDuplicates: true, randomMix: false,
    ordering: 'grouped', fields: { name: false, date: false, time: false, score: false, streak: false },
    orientation: 'portrait', fontSize: 'standard', ...overrides
  };
}

function profile(type: ProblemType): ProblemProfile {
  return {
    min: 0, max: getQuestionDefinition(type).difficultyProfiles.standard?.max ?? 1000, terms: 3,
    carryRate: .5, highRangeRate: .5, wordSteps: 2, maxFactor: 9, trivialRate: .1, equalityRate: .2, mixedRate: .4
  };
}

function generate(type: ProblemType, seed: string, overrides: Partial<WorksheetConfig> = {}): Question {
  const context = createGenerationContext(seed);
  const currentConfig = config(overrides);
  return getQuestionDefinition(type).generate({
    type, config: currentConfig, profile: profile(type), random: context.random, createId: context.createId
  });
}

describe('gap-fill migration', () => {
  it('replays each new generator with a fixed seed and validates its answer', () => {
    for (const type of TYPES) {
      const first = generate(type, `gap-fill-${type}`);
      const replay = generate(type, `gap-fill-${type}`);
      const validation = getQuestionDefinition(type).validate(first, config(), getQuestionDefinition(type));
      expect(replay).toEqual(first);
      expect(validation.valid, `${type}: ${validation.errors.join('; ')}`).toBe(true);
      expect(first.id).toMatch(/^q-/);
      expect(first.type).toBe(type);
      expect(first.answerDetails?.display).not.toBe('');
    }
  });

  it('validates every new type at its entry curriculum grade', () => {
    const entryStage: Partial<Record<ProblemType, WorksheetConfig['stage']>> = {
      oddEven: 'grade1', tenMoreLess: 'grade1', moneySense: 'grade1', shapePattern: 'grade1',
      repeatedAddition: 'grade2', sameDenominatorFraction: 'grade3', fractionOfAmount: 'grade3',
      multiplicativeComparison: 'grade3', polygonPerimeter: 'grade3', likelihoodLanguage: 'grade3'
    };
    const stageCaps: Record<string, number> = { grade1: 20, grade2: 100, grade3: 1000 };
    for (const type of TYPES) {
      const stage = entryStage[type]!;
      const curriculum = config({ stage, rangeMode: 'curriculum', difficulty: 'entry', types: [type] });
      const context = createGenerationContext(`gap-fill-curriculum-${type}`);
      const definition = getQuestionDefinition(type);
      const question = definition.generate({
        type, config: curriculum,
        profile: { ...profile(type), max: Math.min(definition.difficultyProfiles.entry?.max ?? 10, stageCaps[stage]) },
        random: context.random, createId: context.createId
      });
      const validation = definition.validate(question, curriculum, definition);
      expect(validation.valid, `${type}@${stage}: ${validation.errors.join('; ')}`).toBe(true);
    }
  });

  it('keeps type-specific semantics', () => {
    const odd = generate('oddEven', 'odd-structure');
    if (odd.metadata?.form === 'judge') {
      expect(odd.answer).toBe(odd.operands[0] % 2 === 0 ? '双数' : '单数');
    } else {
      const parity = String(odd.metadata?.parity);
      const expected = odd.operands.filter(value => (value % 2 === 0 ? '双数' : '单数') === parity).join('，');
      expect(odd.answer).toBe(expected);
    }

    const moreLess = generate('tenMoreLess', 'more-less-structure');
    const [base, delta] = moreLess.operands;
    expect([1, 10, 100, 1000]).toContain(delta);
    expect(moreLess.answer).toBe(moreLess.metadata?.direction === 'more' ? base + delta : base - delta);

    const money = generate('moneySense', 'money-structure');
    if (money.metadata?.form === 'yuan-to-jiao') expect(money.answer).toBe(money.operands[0] * 10);
    if (money.metadata?.form === 'jiao-split') {
      expect(money.answer).toBe(`${Math.floor(money.operands[0] / 10)} 元 ${money.operands[0] % 10} 角`);
    }

    const repeated = generate('repeatedAddition', 'repeated-structure');
    expect(repeated.answer).toBe(repeated.metadata?.form === 'missing-addend' ? repeated.operands[0] : repeated.operands[1]);

    const fractionSum = generate('sameDenominatorFraction', 'fraction-sum-structure');
    expect(String(fractionSum.answer)).toMatch(/^\d+(\/\d+)?$/);

    const amount = generate('fractionOfAmount', 'fraction-amount-structure');
    const [total, den, num] = amount.operands;
    expect(total % den).toBe(0);
    expect(amount.answer).toBe((total / den) * num);

    const times = generate('multiplicativeComparison', 'times-structure');
    const [timesBase, timesMult] = times.operands;
    expect(times.answer).toBe(times.metadata?.form === 'how-many-times' ? timesMult : timesBase * timesMult);

    const perimeter = generate('polygonPerimeter', 'perimeter-structure');
    expect(perimeter.answerDetails?.display).toBe(`${perimeter.answer} ${perimeter.answerDetails?.unit}`);

    const likelihood = generate('likelihoodLanguage', 'likelihood-structure');
    expect(['一定', '可能', '不可能']).toContain(likelihood.answer);
  });

  it('rejects corrupted answers for the new types', () => {
    for (const type of TYPES) {
      const definition = getQuestionDefinition(type);
      const question = generate(type, `gap-fill-corrupt-${type}`);
      const corrupted: Question = { ...question, answer: typeof question.answer === 'number' ? question.answer + 1 : '错误答案' };
      expect(definition.validate(corrupted, config(), definition).valid, type).toBe(false);
    }
  });

  it('rejects the new types below their entry grade', () => {
    const odd = generate('oddEven', 'odd-grade');
    expect(getQuestionDefinition('oddEven').validate(odd, config({ stage: 'preschool' }), getQuestionDefinition('oddEven')).valid).toBe(false);
    const times = generate('multiplicativeComparison', 'times-grade');
    expect(getQuestionDefinition('multiplicativeComparison').validate(times, config({ stage: 'grade2' }), getQuestionDefinition('multiplicativeComparison')).valid).toBe(false);
  });

  it('generates the extended unit conversion pairs and validates them', () => {
    const definition = getQuestionDefinition('unitConversion');
    const seen = new Set<string>();
    for (let index = 0; index < 400; index += 1) {
      const context = createGenerationContext(`unit-extended-${index}`);
      const currentConfig = config({ types: ['unitConversion'], difficulty: 'challenge' });
      const question = definition.generate({
        type: 'unitConversion', config: currentConfig,
        profile: { min: 0, max: 12000, terms: 3, carryRate: .5, highRangeRate: .5, wordSteps: 1, maxFactor: 12, trivialRate: 0, equalityRate: .2, mixedRate: .4 },
        random: context.random, createId: context.createId
      });
      expect(definition.validate(question, currentConfig, definition).valid, question.text).toBe(true);
      seen.add(String(question.metadata?.unit));
    }
    for (const unit of ['分米', '毫米', '吨', '升', '毫升', '秒', '分']) {
      expect(seen.has(unit), `unit ${unit}`).toBe(true);
    }
  });
});
