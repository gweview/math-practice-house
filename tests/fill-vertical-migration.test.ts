import { describe, expect, it } from 'vitest';
import { QUESTION_DEFINITIONS } from '../src/domain/questions/registry';
import type { Question } from '../src/domain/questions/model';
import type { ProblemType } from '../src/domain/questions/problem-type';
import type { WorksheetConfig } from '../src/domain/worksheet/config';
import { createGenerationContext } from '../src/shared/random/seeded-random';

const TYPES: ProblemType[] = ['fillBlank', 'multiplicationBlank', 'verticalAddition', 'verticalSubtraction', 'verticalMultiplication', 'verticalDivision', 'unitConversion', 'fractionComparison', 'perimeter'];
const base: WorksheetConfig = {
  stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard', types: TYPES, count: 10,
  verticalOperations: ['addition', 'subtraction', 'multiplication', 'division'], verticalPages: 1, showNumbers: true, showLines: true,
  answerPage: false, allowDuplicates: true, randomMix: false, fields: { name: false, date: false, time: false, score: false, streak: false }, orientation: 'portrait', fontSize: 'standard'
};

function generate(type: ProblemType, seed: string): { question: Question; validate: (q: Question, c: WorksheetConfig) => { valid: boolean; errors: string[] } } {
  const definition = QUESTION_DEFINITIONS.find(item => item.id === type)!;
  const context = createGenerationContext(seed);
  const config = type.startsWith('vertical')
    ? { ...base, practiceMode: type === 'verticalAddition' || type === 'verticalSubtraction' ? 'verticalAddSub' as const : 'verticalMulDiv' as const, verticalOperations: [type === 'verticalAddition' ? 'addition' : type === 'verticalSubtraction' ? 'subtraction' : type === 'verticalMultiplication' ? 'multiplication' : 'division'] as ('addition' | 'subtraction' | 'multiplication' | 'division')[] }
    : base;
  const profile = definition.difficultyProfiles.standard!;
  const question = definition.generate({ type, config, profile: { min: 0, max: profile.max, terms: profile.terms ?? 3, carryRate: profile.carryRate ?? .5, highRangeRate: profile.highRangeRate ?? .5, wordSteps: profile.wordSteps ?? 1, maxFactor: profile.maxFactor ?? 9, trivialRate: profile.trivialRate ?? .1, equalityRate: profile.equalityRate ?? .2, mixedRate: profile.mixedRate ?? .4 }, random: context.random, createId: context.createId });
  return { question, validate: (q, c) => definition.validate(q, c, definition) };
}

describe('stage 2/3 self-contained fill, unit, fraction, perimeter and vertical types', () => {
  it.each(TYPES)('replays and validates %s', type => {
    const first = generate(type, `migration-${type}`);
    const second = generate(type, `migration-${type}`);
    expect(second.question).toEqual(first.question);
    const config = type.startsWith('vertical') ? { ...base, practiceMode: type === 'verticalAddition' || type === 'verticalSubtraction' ? 'verticalAddSub' as const : 'verticalMulDiv' as const, verticalOperations: [type === 'verticalAddition' ? 'addition' : type === 'verticalSubtraction' ? 'subtraction' : type === 'verticalMultiplication' ? 'multiplication' : 'division'] as ('addition' | 'subtraction' | 'multiplication' | 'division')[] } : base;
    expect(first.validate(first.question, config).valid).toBe(true);
  });

  it('rejects wrong answers, type and metadata without throwing', () => {
    const { question, validate } = generate('fillBlank', 'migration-invalid');
    expect(validate({ ...question, answer: typeof question.answer === 'number' ? question.answer + 1 : '×' }, base).valid).toBe(false);
    expect(validate({ ...question, type: 'perimeter' }, base).valid).toBe(false);
    expect(validate({ ...question, metadata: { ...question.metadata, magnitude: 999999 } }, base).valid).toBe(false);
    expect(validate({ ...question, operands: [] }, base).valid).toBe(false);
    const multiplicationBlank = generate('multiplicationBlank', 'migration-invalid-blank');
    expect(multiplicationBlank.validate({ ...multiplicationBlank.question, operators: [] }, base).valid).toBe(false);
    expect(multiplicationBlank.validate({ ...multiplicationBlank.question, operators: undefined }, base).valid).toBe(false);
  });

  it('enforces vertical practice and selected operation', () => {
    const { question, validate } = generate('verticalAddition', 'migration-vertical-config');
    expect(validate(question, { ...base, practiceMode: 'standard' }).valid).toBe(false);
    expect(validate(question, { ...base, verticalOperations: ['subtraction'] }).valid).toBe(false);
  });

  it('binds both unit-conversion directions to units, operands, operators and metadata', () => {
    const definition = QUESTION_DEFINITIONS.find(item => item.id === 'unitConversion')!;
    const config = { ...base, difficulty: 'challenge' as const, types: ['unitConversion' as ProblemType] };
    const profile = definition.difficultyProfiles.challenge!;
    const questions = Array.from({ length: 100 }, (_, index) => {
      const context = createGenerationContext(`unit-direction-${index}`);
      return definition.generate({ type: 'unitConversion', config, profile: { ...profile, min: 0, max: profile.max, terms: profile.terms ?? 2, carryRate: profile.carryRate ?? 0, highRangeRate: profile.highRangeRate ?? .5, wordSteps: profile.wordSteps ?? 1, maxFactor: profile.maxFactor ?? 9, trivialRate: profile.trivialRate ?? 0, equalityRate: profile.equalityRate ?? 0, mixedRate: profile.mixedRate ?? 0 }, random: context.random, createId: context.createId });
    });
    expect(new Set(questions.map(question => question.metadata?.direction))).toEqual(new Set(['small-to-large', 'large-to-small']));
    for (const question of questions) {
      expect(definition.validate(question, config, definition).valid).toBe(true);
      expect(definition.validate({ ...question, text: question.text.replace('□', '999') }, config, definition).valid).toBe(false);
      expect(definition.validate({ ...question, metadata: { ...question.metadata, direction: question.metadata?.direction === 'small-to-large' ? 'large-to-small' : 'small-to-large' } }, config, definition).valid).toBe(false);
      expect(definition.validate({ ...question, operators: [question.operators?.[0] === '×' ? '÷' : '×'] }, config, definition).valid).toBe(false);
    }
  });
});
