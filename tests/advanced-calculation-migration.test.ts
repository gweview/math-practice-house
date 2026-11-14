import { describe, expect, it } from 'vitest';
import { QUESTION_DEFINITIONS } from '../src/domain/questions/registry';
import type { ProblemType, Question } from '../src/domain/questions/model';
import type { WorksheetConfig } from '../src/domain/worksheet/config';
import { createGenerationContext } from '../src/shared/random/seeded-random';

const TYPES: Array<{ type: ProblemType; stage: WorksheetConfig['stage'] }> = [
  { type: 'rounding', stage: 'grade4' }, { type: 'decimalOperation', stage: 'grade5' },
  { type: 'fractionOperation', stage: 'grade5' }, { type: 'simpleEquation', stage: 'grade5' },
  { type: 'percent', stage: 'grade6' }, { type: 'makeTarget', stage: 'grade6' },
  { type: 'operationErrorDiagnosis', stage: 'grade1' }
];

function config(type: ProblemType, stage: WorksheetConfig['stage'], difficulty: WorksheetConfig['difficulty'] = 'standard'): WorksheetConfig {
  return {
    stage, rangeMode: 'free', difficulty, practiceMode: 'standard', types: [type], count: 1,
    verticalOperations: ['addition', 'subtraction', 'multiplication', 'division'], verticalPages: 1,
    showNumbers: true, showLines: true, answerPage: false, allowDuplicates: true, randomMix: false,
    fields: { name: false, date: false, time: false, score: false, streak: false }, orientation: 'portrait', fontSize: 'standard'
  };
}

function generate(type: ProblemType, stage: WorksheetConfig['stage'], seed: string, difficulty: WorksheetConfig['difficulty'] = 'standard') {
  const definition = QUESTION_DEFINITIONS.find(item => item.id === type)!;
  const worksheetConfig = config(type, stage, difficulty);
  const profile = definition.difficultyProfiles[difficulty] ?? definition.difficultyProfiles.standard!;
  const context = createGenerationContext(seed);
  const question = definition.generate({
    type, config: worksheetConfig,
    profile: {
      min: profile.min ?? 0, max: profile.max, terms: profile.terms ?? 3,
      carryRate: profile.carryRate ?? .5, highRangeRate: profile.highRangeRate ?? .5,
      wordSteps: profile.wordSteps ?? 1, maxFactor: profile.maxFactor ?? 9,
      trivialRate: profile.trivialRate ?? .1, equalityRate: profile.equalityRate ?? .2,
      mixedRate: profile.mixedRate ?? .4
    }, random: context.random, createId: context.createId
  });
  return { definition, worksheetConfig, question };
}

describe('self-contained advanced calculation migration', () => {
  it.each(TYPES)('$type replays with a fixed seed and validates its structure', ({ type, stage }) => {
    const first = generate(type, stage, `advanced-${type}`);
    const second = generate(type, stage, `advanced-${type}`);
    expect(second.question).toEqual(first.question);
    expect(first.question.id).toMatch(/^q-/);
    expect(first.question.answerDetails?.display).toBeTruthy();
    expect(first.definition.validate(first.question, first.worksheetConfig, first.definition)).toEqual({ valid: true, errors: [] });
  });

  it.each(TYPES)('$type rejects answer and operand tampering', ({ type, stage }) => {
    const { definition, worksheetConfig, question } = generate(type, stage, `tamper-${type}`);
    const wrongAnswer: Question = { ...question, answer: typeof question.answer === 'number' ? question.answer + 1 : `${question.answer}错` };
    expect(definition.validate(wrongAnswer, worksheetConfig, definition).valid).toBe(false);
    const wrongOperands: Question = { ...question, operands: question.operands.map((value, index) => index === 0 ? value + 1 : value) };
    expect(definition.validate(wrongOperands, worksheetConfig, definition).valid).toBe(false);
  });

  it.each(TYPES)('$type rejects malformed operands without throwing', ({ type, stage }) => {
    const { definition, worksheetConfig, question } = generate(type, stage, `malformed-${type}`);
    for (const operands of [undefined, []]) {
      const malformed = { ...question, operands } as unknown as Question;
      expect(() => definition.validate(malformed, worksheetConfig, definition)).not.toThrow();
      expect(definition.validate(malformed, worksheetConfig, definition).valid).toBe(false);
    }
  });

  it('rejects a validator call for the wrong type', () => {
    const generated = generate('rounding', 'grade4', 'wrong-type');
    expect(generated.definition.validate({ ...generated.question, type: 'percent' }, generated.worksheetConfig, generated.definition).valid).toBe(false);
  });

  it('covers difficulty-dependent formats and curriculum grade boundaries', () => {
    for (const { type, stage } of TYPES) {
      for (const difficulty of ['entry', 'standard', 'challenge'] as const) {
        const generated = generate(type, stage, `difficulty-${type}-${difficulty}`, difficulty);
        expect(generated.definition.validate(generated.question, generated.worksheetConfig, generated.definition).valid, `${type}/${difficulty}`).toBe(true);
      }
    }
    const generated = generate('percent', 'grade6', 'boundary');
    expect(generated.definition.validate(generated.question, { ...generated.worksheetConfig, stage: 'grade5' }, generated.definition).valid).toBe(false);
  });
});
