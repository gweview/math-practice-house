import { describe, expect, it } from 'vitest';
import type { ProblemType, Question, WorksheetConfig } from '../src/core/types';
import { getProblemProfile } from '../src/core/difficulty-config';
import { validateQuestion } from '../src/core/validators';
import { isTypeAllowedForStage } from '../src/core/grade-config';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import { APPLICATION_QUESTION_DEFINITIONS, renderWordApplicationTemplate, WORD_APPLICATION_SEMANTICS } from '../src/question-types/application/foundation';

const types = ['wordProblem', 'moneyCalculation', 'priceQuantityTotal', 'proportionalReasoning', 'discount', 'inverseProportion', 'concentration', 'budgetPlan'] as const;
const stages = ['preschool', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'] as const;
const difficulties = ['entry', 'easy', 'standard', 'advanced', 'challenge'] as const;
const base: WorksheetConfig = { stage: 'grade6', rangeMode: 'curriculum', difficulty: 'standard', practiceMode: 'standard', types: ['wordProblem'], count: 20, verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true, answerPage: false, allowDuplicates: true, randomMix: false, fields: { name: false, date: false, time: false, score: false, streak: false }, orientation: 'portrait', fontSize: 'standard', generationMode: 'count', pageTarget: 1, answerMode: 'none', ordering: 'grouped' };

function generate(type: ProblemType, config: WorksheetConfig, seed: string): Question {
  const definition = APPLICATION_QUESTION_DEFINITIONS.find(item => item.id === type)!;
  const context = createGenerationContext(seed);
  return definition.generate({ type, config, profile: getProblemProfile(type, config.difficulty, config.stage, config.rangeMode), random: context.random, createId: context.createId });
}

describe('application question migrations', () => {
  it('keeps eight complete natural-language templates for every word semantic', () => {
    const values: Record<string, number[]> = { combine: [8, 3], decrease: [8, 3], 'unknown-start': [8, 3], 'unknown-change': [3, 8], difference: [8, 3], 'equal-groups': [3, 4], sharing: [12, 3], grouping: [12, 3], 'groups-plus': [3, 4, 2], 'groups-minus': [3, 4, 2], 'add-then-subtract': [8, 3, 2], 'subtract-then-add': [8, 3, 2], 'three-step-change': [8, 3, 2, 4] };
    for (const semantic of WORD_APPLICATION_SEMANTICS) for (let index = 0; index < 8; index += 1) {
      const text = renderWordApplicationTemplate(semantic, index, values[semantic], 0);
      expect(text).toContain('彩色铅笔');
      expect(text).toContain('支');
      expect(text).not.toMatch(/现在多少？|共有多少？|总数多少？|共多少？|剩多少？/);
    }
  });

  it('generates deterministic, curriculum-gated questions for every difficulty', () => {
    for (const type of types) {
      const definition = APPLICATION_QUESTION_DEFINITIONS.find(item => item.id === type)!;
      for (const stage of stages) {
        if (!isTypeAllowedForStage(type, stage)) continue;
        for (const difficulty of difficulties) {
          const config = { ...base, stage, difficulty, types: [type] as [ProblemType] };
          const first = generate(type, config, `application-${stage}-${type}-${difficulty}`);
          const replay = generate(type, config, `application-${stage}-${type}-${difficulty}`);
          expect(replay).toEqual(first);
          expect(validateQuestion(first, config), `${stage}/${type}/${difficulty}`).toEqual({ valid: true, errors: [] });
          expect(first.id).toMatch(/^q-/);
          expect(first.answerDetails?.display).not.toBe('');
          expect(definition.allowedGrades).toContain(stage);
        }
      }
    }
  });

  it('keeps application semantics, units, and structured tables consistent', () => {
    for (const type of types) {
      const stage = APPLICATION_QUESTION_DEFINITIONS.find(item => item.id === type)!.allowedGrades.at(-1)!;
      const config = { ...base, stage, types: [type] as [ProblemType] };
      for (let index = 0; index < 24; index += 1) {
        const question = generate(type, config, `semantic-${type}-${index}`);
        expect(validateQuestion(question, config).valid).toBe(true);
        expect(question.answerDetails?.unit).toBeTruthy();
        if (type === 'wordProblem') expect([2, 3, 4]).toContain(question.operands.length);
        if (type === 'proportionalReasoning' || type === 'inverseProportion') expect(question.content?.kind).toBe('table');
        if (type === 'discount') expect([50, 60, 70, 75, 80, 90]).toContain(question.operands[1]);
        if (type === 'concentration') expect(question.operands[0]).toBeLessThan(question.operands[1]);
      }
    }
  });

  it('rejects answer, question, metadata, structure and malformed tampering without throwing', () => {
    for (const type of types) {
      const definition = APPLICATION_QUESTION_DEFINITIONS.find(item => item.id === type)!;
      const config = { ...base, stage: definition.allowedGrades.at(-1)!, types: [type] as [ProblemType] };
      const question = generate(type, config, `tamper-${type}`);
      const tampered: Question[] = [
        { ...question, answer: typeof question.answer === 'number' ? question.answer + 1 : `${question.answer}错` },
        { ...question, text: `${question.text}（篡改）` },
        { ...question, signature: `${question.signature}-tampered` },
        { ...question, metadata: { ...(question.metadata ?? {}), injected: true } },
        { ...question, operands: [...question.operands, 1] },
        { ...question, operands: question.operands.map((v, index) => index === 0 ? Number.NaN : v) }
      ];
      for (const current of tampered) expect(() => definition.validate(current, config, definition)).not.toThrow();
      for (const current of tampered) expect(definition.validate(current, config, definition).valid).toBe(false);
      const wrongType = { ...question, type: (type === 'wordProblem' ? 'moneyCalculation' : 'wordProblem') as ProblemType };
      expect(definition.validate(wrongType, config, definition).valid).toBe(false);
      if (type === 'wordProblem') {
        expect(definition.validate({ ...question, metadata: { ...(question.metadata ?? {}), semantic: 'toString' } }, config, definition).valid).toBe(false);
        expect(definition.validate({ ...question, metadata: { ...(question.metadata ?? {}), templateIndex: 8 } }, config, definition).valid).toBe(false);
        const nonIntegerSharing = { ...question, metadata: { ...(question.metadata ?? {}), semantic: 'sharing' }, operands: [5, 2], answer: 2.5 };
        expect(() => definition.validate(nonIntegerSharing, config, definition)).not.toThrow();
        expect(definition.validate(nonIntegerSharing, config, definition).valid).toBe(false);
      }
      for (const operands of [undefined, [], [Number.NaN]]) {
        const malformed = { ...question, operands: operands as unknown as number[] };
        expect(() => definition.validate(malformed, config, definition)).not.toThrow();
        expect(definition.validate(malformed, config, definition).valid).toBe(false);
      }
    }
  });
});
