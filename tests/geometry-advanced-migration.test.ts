import { describe, expect, it } from 'vitest';
import type { ProblemType, Question, WorksheetConfig } from '../src/core/types';
import { getQuestionDefinition } from '../src/domain/questions/registry';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import { DEFAULT_PI } from '../src/domain/math-core/constants';

const TYPES: ProblemType[] = ['polygonArea', 'cuboidVolume', 'compositeArea', 'cuboidNet', 'surfaceArea', 'circle', 'scale', 'sector', 'cylinder'];
const DIFFICULTIES = ['entry', 'easy', 'standard', 'advanced', 'challenge'] as const;
function config(overrides: Partial<WorksheetConfig> = {}): WorksheetConfig {
  return { stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard', types: TYPES, count: 20, verticalOperations: ['addition'], verticalPages: 1, showNumbers: true, showLines: true, answerPage: false, answerMode: 'none', allowDuplicates: true, randomMix: false, ordering: 'grouped', fields: { name: false, date: false, time: false, score: false, streak: false }, orientation: 'portrait', fontSize: 'standard', ...overrides };
}
function generate(type: ProblemType, seed: string, overrides: Partial<WorksheetConfig> = {}): Question {
  const current = config({ ...overrides, types: [type] }); const definition = getQuestionDefinition(type); const context = createGenerationContext(seed);
  return definition.generate({ type, config: current, profile: definition.difficultyProfiles[current.difficulty] as never, random: context.random, createId: context.createId });
}

describe('geometry advanced migration', () => {
  it('replays fixed seeds and independently validates all nine definitions', () => {
    for (const type of TYPES) {
      const first = generate(type, `geometry-advanced-${type}`); const second = generate(type, `geometry-advanced-${type}`); const definition = getQuestionDefinition(type);
      expect(second, type).toEqual(first); expect(definition.validate(first, config({ types: [type] }), definition), type).toEqual({ valid: true, errors: [] });
      expect(first.id).toMatch(/^q-/); expect(first.answerDetails?.display).not.toBe(''); if (type !== 'scale') expect(first.content?.kind).toBe('geometry');
    }
  });

  it('keeps structural content and π tied to operands', () => {
    for (const type of TYPES) {
      const question = generate(type, `geometry-structure-${type}`);
      if (type === 'polygonArea' || type === 'cuboidVolume' || type === 'compositeArea' || type === 'surfaceArea') expect(question.content).toMatchObject({ kind: 'geometry', dimensions: question.operands });
      if (type === 'circle' || type === 'sector' || type === 'cylinder') expect(question.metadata?.pi).toBe(DEFAULT_PI.toString());
      if (type === 'cuboidNet') expect(question.content).toMatchObject({ kind: 'geometry', shape: 'net', netPattern: question.metadata?.pattern });
    }
  });

  it('rejects answer, envelope, content, metadata, operators, wrong type and malformed operands', () => {
    for (const type of TYPES) {
      const question = generate(type, `geometry-tamper-${type}`); const definition = getQuestionDefinition(type); const current = config({ types: [type] });
      const alteredAnswer = { ...question, answer: `${question.answer}!` };
      const alteredText = { ...question, text: `${question.text}!` };
      const alteredLayout = { ...question, layout: question.layout === 'wide' ? 'inline' as const : 'wide' as const };
      const alteredSignature = { ...question, signature: `${question.signature}!` };
      const alteredDetails = { ...question, answerDetails: { ...(question.answerDetails ?? { display: String(question.answer) }), display: '篡改' } };
      const alteredMetadata = { ...question, metadata: { ...(question.metadata ?? {}), tampered: true } };
      const alteredContent = { ...question, content: question.content ? { ...question.content, dimensions: [999] } : undefined };
      const mutations = [alteredAnswer, alteredText, alteredLayout, alteredSignature, alteredDetails, alteredMetadata, { ...question, operators: ['+'] }, { ...question, type: 'area' as ProblemType }];
      if (question.content) mutations.push(alteredContent);
      for (const altered of mutations) expect(definition.validate(altered, current, definition).valid, `${type}: ${altered.text}`).toBe(false);
      for (const operands of [[], undefined]) {
        const malformed = { ...question, operands } as Question; expect(() => definition.validate(malformed, current, definition)).not.toThrow(); expect(definition.validate(malformed, current, definition).valid).toBe(false);
      }
      const extra = { ...question, operands: [...question.operands, 1] }; expect(definition.validate(extra, current, definition).valid).toBe(false);
    }
  });

  it('covers all difficulty profiles and enforces grade gates and π constant', () => {
    for (const type of TYPES) for (const difficulty of DIFFICULTIES) {
      const question = generate(type, `geometry-profile-${type}-${difficulty}`, { difficulty }); const definition = getQuestionDefinition(type);
      expect(definition.validate(question, config({ types: [type], difficulty }), definition).valid, `${type}/${difficulty}`).toBe(true);
    }
    for (const type of TYPES) {
      const question = generate(type, `geometry-stage-${type}`); const definition = getQuestionDefinition(type);
      expect(definition.validate(question, config({ types: [type], stage: 'grade4', rangeMode: 'curriculum' }), definition).valid, `${type}/stage`).toBe(false);
    }
    for (const type of ['circle', 'sector', 'cylinder'] as const) {
      const question = generate(type, `geometry-pi-${type}`); const definition = getQuestionDefinition(type); const metadata = { ...(question.metadata ?? {}), pi: '3.14159' };
      expect(definition.validate({ ...question, metadata }, config({ types: [type] }), definition).valid, type).toBe(false);
    }
  });

  it('rejects operands outside each generator domain even when the envelope is otherwise present', () => {
    const invalidOperands: Partial<Record<ProblemType, number[]>> = {
      polygonArea: [31, 20], cuboidVolume: [16, 12, 10], compositeArea: [24, 16, 23, 1],
      cuboidNet: [1, 10, 2, 2], surfaceArea: [2, 2, 16], circle: [21, 1], scale: [100_000, 16],
      sector: [6, 60], cylinder: [5, 17]
    };
    for (const type of TYPES) {
      const question = generate(type, `geometry-domain-${type}`, { difficulty: 'standard' }); const definition = getQuestionDefinition(type); const operands = invalidOperands[type];
      expect(operands, type).toBeDefined(); expect(definition.validate({ ...question, operands: operands! }, config({ types: [type] }), definition).valid, type).toBe(false);
    }
  });
});
