import { describe, expect, it } from 'vitest';
import type { ProblemProfile, Question, WorksheetConfig } from '../src/core/types';
import { getQuestionDefinition } from '../src/domain/questions/registry';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import type { ProblemType } from '../src/domain/questions/problem-type';

const TYPES: ProblemType[] = [
  'numberRecognition', 'comparison', 'compareSigns', 'numberSequence', 'numberComposition',
  'placeValue', 'numberLine', 'numberPattern', 'arithmeticFamily', 'estimation'
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
    carryRate: .5, highRangeRate: .5, wordSteps: 2, maxFactor: 12, trivialRate: .1, equalityRate: .2, mixedRate: .4
  };
}

function generate(type: ProblemType, seed: string, overrides: Partial<WorksheetConfig> = {}, directive?: Record<string, unknown>): Question {
  const context = createGenerationContext(seed);
  const currentConfig = config(overrides);
  return getQuestionDefinition(type).generate({
    type, config: currentConfig, profile: profile(type), random: context.random, createId: context.createId, directive
  });
}

describe('number-sense migration', () => {
  it('replays each migrated generator with a fixed seed and validates its answer', () => {
    for (const type of TYPES) {
      const first = generate(type, `number-sense-${type}`);
      const replay = generate(type, `number-sense-${type}`);
      const validation = getQuestionDefinition(type).validate(first, config(), getQuestionDefinition(type));
      expect(replay).toEqual(first);
      expect(validation.valid, type).toBe(true);
      expect(first.id).toMatch(/^q-/);
      expect(first.type).toBe(type);
    }
  });

  it('keeps concept-specific structure and semantics', () => {
    const recognition = generate('numberRecognition', 'recognition-structure');
    expect(new Set(recognition.operands).size).toBe(3);
    expect(recognition.operands).toContain(recognition.answer);

    const comparison = generate('comparison', 'comparison-structure');
    expect(comparison.answer).toBe(Math.max(...comparison.operands));
    expect(comparison.metadata?.relation).toBe(comparison.operands[0] > comparison.operands[1] ? '>' : '<');
    const comparisonDefinition = getQuestionDefinition('comparison');
    expect(comparisonDefinition.validate({ ...comparison, metadata: { ...comparison.metadata, magnitude: Number(comparison.metadata?.magnitude) + 1 } }, config(), comparisonDefinition).valid).toBe(false);

    const signs = generate('compareSigns', 'forced-relation', {}, { relation: '>' });
    expect(signs.answer).toBe('>');
    expect(signs.operands[0]).toBeGreaterThan(signs.operands[1]);
    const signsDefinition = getQuestionDefinition('compareSigns');
    expect(signsDefinition.validate({ ...signs, metadata: { ...signs.metadata, magnitude: Number(signs.metadata?.magnitude) + 1 } }, config(), signsDefinition).valid).toBe(false);

    const line = generate('numberLine', 'number-line-structure');
    expect(line.content?.kind).toBe('numberLine');
    if (line.content?.kind === 'numberLine') expect(line.content.values).toEqual(line.operands);

    const family = generate('arithmeticFamily', 'family-structure');
    expect(family.content?.kind).toBe('multiPart');
    if (family.content?.kind === 'multiPart') expect(family.content.parts).toHaveLength(4);

    const estimate = generate('estimation', 'estimate-structure');
    expect(estimate.answer).toBe(Math.round(estimate.operands[0] / estimate.operands[1]) * estimate.operands[1]);
    expect([10, 100]).toContain(estimate.operands[1]);
  });

  it('rejects answer, operands, metadata and structured-content tampering', () => {
    for (const type of TYPES) {
      const definition = getQuestionDefinition(type);
      const question = generate(type, `tamper-${type}`);
      expect(definition.validate({ ...question, answer: typeof question.answer === 'number' ? question.answer + 1 : `${question.answer}!` }, config(), definition).valid, `${type} answer`).toBe(false);
      expect(definition.validate({ ...question, operands: [NaN] }, config(), definition).valid, `${type} operands`).toBe(false);
      const wrongType = type === 'numberRecognition' ? 'comparison' : 'numberRecognition';
      expect(definition.validate({ ...question, type: wrongType }, config(), definition).valid, `${type} type`).toBe(false);
    }
    const line = generate('numberLine', 'content-tamper');
    const lineDefinition = getQuestionDefinition('numberLine');
    expect(lineDefinition.validate({ ...line, content: { kind: 'numberLine', start: 0, end: 1, step: 1, values: [0, 1], blankIndex: 1 } }, config(), lineDefinition).valid).toBe(false);
    const pattern = generate('numberPattern', 'metadata-tamper');
    const patternDefinition = getQuestionDefinition('numberPattern');
    expect(patternDefinition.validate({ ...pattern, metadata: { ...pattern.metadata, descending: !pattern.metadata?.descending } }, config(), patternDefinition).valid).toBe(false);
    const family = generate('arithmeticFamily', 'multipart-tamper');
    const familyDefinition = getQuestionDefinition('arithmeticFamily');
    expect(familyDefinition.validate({ ...family, content: { kind: 'multiPart', parts: [] } }, config(), familyDefinition).valid).toBe(false);
  });

  it('does not throw for malformed operands and enforces stage/config boundaries', () => {
    for (const type of TYPES) {
      const definition = getQuestionDefinition(type);
      const question = generate(type, `malformed-${type}`);
      expect(() => definition.validate({ ...question, operands: undefined as unknown as number[] }, config(), definition)).not.toThrow();
      expect(definition.validate({ ...question, operands: undefined as unknown as number[] }, config(), definition).valid).toBe(false);
    }
    const preschool = config({ stage: 'preschool', types: ['estimation'] });
    const estimation = generate('estimation', 'stage-boundary');
    expect(getQuestionDefinition('estimation').validate(estimation, preschool, getQuestionDefinition('estimation')).valid).toBe(false);
    const omitted = config({ types: ['numberRecognition'] });
    const comparison = generate('comparison', 'config-boundary');
    expect(getQuestionDefinition('comparison').validate(comparison, omitted, getQuestionDefinition('comparison')).valid).toBe(false);
  });

  it('validates descending pattern semantics rather than absolute operand order', () => {
    let descending: Question | undefined;
    for (let index = 0; index < 30 && !descending; index += 1) {
      const candidate = generate('numberPattern', `descending-${index}`);
      if (candidate.metadata?.descending === true) descending = candidate;
    }
    expect(descending).toBeDefined();
    if (descending) {
      expect(descending.operands.every((value, index) => index === 0 || value < descending!.operands[index - 1])).toBe(true);
      expect(getQuestionDefinition('numberPattern').validate(descending, config(), getQuestionDefinition('numberPattern')).valid).toBe(true);
    }
  });
});
