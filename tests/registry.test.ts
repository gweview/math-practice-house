import { describe, expect, it } from 'vitest';
import { STAGE_ALLOWED_TYPES, STAGE_RECOMMENDED_TYPES } from '../src/core/grade-config';
import type { ProblemType } from '../src/core/types';
import { GRADE_DEFINITIONS } from '../src/domain/curriculum/types';
import { assertQuestionRegistryComplete, getQuestionDefinition, getQuestionHandler, QUESTION_DEFINITIONS, standardQuestionDefinitions } from '../src/domain/questions/registry';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import type { ProblemProfile, WorksheetConfig } from '../src/core/types';
import { generateWorksheet } from '../src/core/generate';
import { questionFootprint } from '../src/domain/worksheet/layout-metrics';

describe('question registry', () => {
  it('contains exactly one complete definition for every known problem type', () => {
    const ids = QUESTION_DEFINITIONS.map(definition => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const definition of QUESTION_DEFINITIONS) {
      expect(definition.label).not.toBe('');
      expect(definition.allowedGrades.length).toBeGreaterThan(0);
      expect(definition.difficulties).toHaveLength(5);
      expect(definition.footprint.heightMm.large).toBeGreaterThanOrEqual(definition.footprint.heightMm.standard);
      expect(definition.footprint.preventBreakInside).toBe(true);
      expect(getQuestionDefinition(definition.id)).toBe(definition);
    }
  });

  it('fails closed when a runtime capability is missing', () => {
    expect(() => assertQuestionRegistryComplete()).not.toThrow();
    for (const definition of QUESTION_DEFINITIONS) {
      const handler = getQuestionHandler(definition.id);
      expect(handler.generate).toEqual(expect.any(Function));
      expect(handler.validate).toEqual(expect.any(Function));
      expect(handler.renderKind).toBe(definition.renderKind);
      expect(handler.footprint).toBe(definition.footprint);
    }
  });

  it('keeps every standard handler inside its registered rendering footprint', () => {
    const profile: ProblemProfile = { min: 0, max: 1000, terms: 3, carryRate: .5, highRangeRate: .5, wordSteps: 2, maxFactor: 12, trivialRate: .1, equalityRate: .2, mixedRate: .4, reverseRate: .25, multiStepRate: .3 };
    const config: WorksheetConfig = {
      stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard',
      types: QUESTION_DEFINITIONS.map(definition => definition.id), count: 1,
      verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true,
      showLines: true, answerPage: false, answerMode: 'none', allowDuplicates: true,
      randomMix: false, ordering: 'grouped', fields: { name: false, date: false, time: false, score: false, streak: false },
      orientation: 'portrait', fontSize: 'standard'
    };
    const profileFor = (type: ProblemType): ProblemProfile => ({
      ...profile,
      max: ({ addition10: 10, subtraction10: 10, addition20NoCarry: 20, subtraction20NoBorrow: 20,
        addition20Carry: 20, subtraction20Borrow: 20, addition100: 100, subtraction100: 100,
        twoDigitCarry: 100, twoDigitBorrow: 99, multiplication: 144, division: 144,
        fractionComparison: 12, unitConversion: 12000 } as Partial<Record<ProblemType, number>>)[type] ?? 1000
    });
    for (const definition of QUESTION_DEFINITIONS.filter(item => item.practice === 'standard')) {
      for (const fontSize of ['standard', 'large'] as const) {
        const questionConfig = { ...config, fontSize };
        for (const seed of ['footprint-a', 'footprint-b', 'footprint-c']) {
          const context = createGenerationContext(seed);
          const question = getQuestionHandler(definition.id).generate({
            type: definition.id, config: questionConfig, profile: profileFor(definition.id), random: context.random, createId: context.createId
          });
          const actual = questionFootprint(question, questionConfig);
          const registeredColumns = definition.footprint.columns === 'full' ? Number.POSITIVE_INFINITY : definition.footprint.columns;
          const actualColumns = actual.columns === 'full' ? Number.POSITIVE_INFINITY : actual.columns;
          expect.soft(actualColumns, `${definition.id}/${fontSize}/${seed} columns`).toBeLessThanOrEqual(registeredColumns);
          expect.soft(actual.heightMm, `${definition.id}/${fontSize}/${seed} height`).toBeLessThanOrEqual(definition.footprint.heightMm[fontSize]);
        }
      }
    }
  });

  it('derives allowed and recommended curriculum lists from the registry', () => {
    for (const grade of GRADE_DEFINITIONS) {
      expect(STAGE_ALLOWED_TYPES[grade.id].length).toBeGreaterThan(0);
      expect(STAGE_RECOMMENDED_TYPES[grade.id].length).toBeGreaterThan(0);
      expect(STAGE_RECOMMENDED_TYPES[grade.id].every(type => STAGE_ALLOWED_TYPES[grade.id].includes(type))).toBe(true);
    }
  });

  it('keeps all original standard problem IDs registered in display order', () => {
    const original: ProblemType[] = [
      'numberRecognition', 'comparison', 'compareSigns', 'addition10', 'subtraction10',
      'addition20NoCarry', 'subtraction20NoBorrow', 'addition20Carry', 'subtraction20Borrow',
      'addition100', 'subtraction100', 'twoDigitCarry', 'twoDigitBorrow', 'addition1000',
      'subtraction1000', 'multiplication', 'division', 'multiDigitMultiplication',
      'threeDigitByOneMultiplication', 'twoDigitByTwoMultiplication', 'remainderDivision',
      'mixedMulDiv', 'chainAddition', 'chainSubtraction', 'mixedAddSub', 'mixedFour',
      'fillBlank', 'wordProblem', 'unitConversion', 'fractionComparison', 'perimeter'
    ];
    const registered = standardQuestionDefinitions().map(definition => definition.id);
    expect(registered.filter(type => original.includes(type))).toEqual(original);
  });

  it('runs every registered handler with explicit seeded context and no ambient randomness', () => {
    const profile: ProblemProfile = { min: 0, max: 1000, terms: 3, carryRate: .5, highRangeRate: .5, wordSteps: 2, maxFactor: 12, trivialRate: .1, equalityRate: .2, mixedRate: .4, reverseRate: .25, multiStepRate: .3 };
    const types = QUESTION_DEFINITIONS.map(definition => definition.id);
    const makeConfig = (type: ProblemType): WorksheetConfig => {
      const vertical = type.startsWith('vertical');
      const addSub = type === 'verticalAddition' || type === 'verticalSubtraction';
      const operation = type === 'verticalAddition' ? 'addition' : type === 'verticalSubtraction' ? 'subtraction' : type === 'verticalMultiplication' ? 'multiplication' : 'division';
      return { stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: vertical ? addSub ? 'verticalAddSub' : 'verticalMulDiv' : 'standard', types, count: 20, verticalOperations: vertical ? [operation] : ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true, answerPage: false, allowDuplicates: true, randomMix: false, fields: { name: false, date: false, time: false, score: false, streak: false }, orientation: 'portrait', fontSize: 'standard' };
    };
    const randomDescriptor = Object.getOwnPropertyDescriptor(Math, 'random');
    if (!randomDescriptor) throw new Error('Math.random descriptor missing');
    const profileFor = (type: ProblemType): ProblemProfile => ({ ...profile, max: ({ addition10: 10, subtraction10: 10, addition20NoCarry: 20, subtraction20NoBorrow: 20, addition20Carry: 20, subtraction20Borrow: 20, addition100: 100, subtraction100: 100, twoDigitCarry: 100, twoDigitBorrow: 99, multiplication: 144, division: 144, fractionComparison: 12, unitConversion: 12000 } as Partial<Record<ProblemType, number>>)[type] ?? 1000 });
    const generate = (seed: string) => {
      const context = createGenerationContext(seed);
      return QUESTION_DEFINITIONS.map(definition => {
        const config = makeConfig(definition.id);
        const question = getQuestionHandler(definition.id).generate({ type: definition.id, config, profile: profileFor(definition.id), random: context.random, createId: context.createId });
        expect(getQuestionHandler(definition.id).validate(question, config), definition.id).toEqual({ valid: true, errors: [] });
        return question;
      });
    };
    try {
      Object.defineProperty(Math, 'random', { ...randomDescriptor, value: () => { throw new Error('ambient Math.random must not be used'); } });
      const first = generate('registry-seed');
      const replay = generate('registry-seed');
      const changed = generate('registry-seed-other');
      expect(replay).toEqual(first);
      expect(new Set(first.map(question => question.id)).size).toBe(first.length);
      expect(first.map(question => question.id)).toEqual(first.map((question, index) => `q-${question.id.split('-')[1]}-${(index + 1).toString(36)}`));
      expect(changed.map(question => question.text)).not.toEqual(first.map(question => question.text));
    } finally {
      Object.defineProperty(Math, 'random', randomDescriptor);
    }
  });

  it('allocates IDs only after accepted candidates in a retrying worksheet', () => {
    const config: WorksheetConfig = {
      stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard', types: ['numberSequence'], count: 50,
      verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true, answerPage: false,
      allowDuplicates: false, randomMix: true, ordering: 'random', fields: { name: false, date: false, time: false, score: false, streak: false }, orientation: 'portrait', fontSize: 'standard'
    };
    const worksheet = generateWorksheet(config, { seed: 'retry-id-contract' });
    expect(worksheet.questions).toHaveLength(50);
    expect(worksheet.questions.map(question => Number.parseInt(question.id.split('-').at(-1) ?? '', 36)).sort((left, right) => left - right)).toEqual(Array.from({ length: 50 }, (_, index) => index + 1));
  });
});
