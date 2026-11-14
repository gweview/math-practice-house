import { describe, expect, it } from 'vitest';
import type { ProblemType, Question, WorksheetConfig } from '../src/core/types';
import { getProblemProfile } from '../src/core/difficulty-config';
import { validateQuestion } from '../src/core/validators';
import { isTypeAllowedForStage } from '../src/core/grade-config';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import { DATA_QUESTION_DEFINITIONS, generateChartAnalysis } from '../src/question-types/data/foundation';

const difficulties = ['entry', 'easy', 'standard', 'advanced', 'challenge'] as const;
const stages = ['preschool', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'] as const;
const base: WorksheetConfig = {
  stage: 'grade6', rangeMode: 'curriculum', difficulty: 'standard', practiceMode: 'standard', types: ['dataTableReading'], count: 20,
  verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true, answerPage: false,
  allowDuplicates: true, randomMix: false, fields: { name: false, date: false, time: false, score: false, streak: false },
  orientation: 'portrait', fontSize: 'standard', generationMode: 'count', pageTarget: 1, answerMode: 'none', ordering: 'grouped'
};

function generate(type: ProblemType, config: WorksheetConfig, seed: string): Question {
  const definition = DATA_QUESTION_DEFINITIONS.find(item => item.id === type);
  if (!definition) throw new Error(`missing ${type}`);
  const context = createGenerationContext(seed);
  return definition.generate({ type, config, profile: getProblemProfile(type, config.difficulty, config.stage, config.rangeMode), random: context.random, createId: context.createId });
}

describe('data question migrations', () => {
  it('generates and validates every migrated type across its curriculum gate and difficulty profiles', () => {
    for (const definition of DATA_QUESTION_DEFINITIONS) for (const stage of stages) {
      if (!isTypeAllowedForStage(definition.id, stage)) continue;
      for (const difficulty of difficulties) {
        const config = { ...base, stage, difficulty, types: [definition.id] };
        const first = generate(definition.id, config, `data-${stage}-${definition.id}-${difficulty}`);
        const replay = generate(definition.id, config, `data-${stage}-${definition.id}-${difficulty}`);
        expect(replay).toEqual(first);
        expect(validateQuestion(first, config), `${stage}/${definition.id}/${difficulty}`).toEqual({ valid: true, errors: [] });
      }
    }
  });

  it('rejects answer, envelope, structure, operator, malformed and extra-operand tampering', () => {
    for (const definition of DATA_QUESTION_DEFINITIONS) {
      const config = { ...base, stage: definition.allowedGrades.at(-1)!, types: [definition.id] };
      const question = generate(definition.id, config, `tamper-${definition.id}`);
      const cases: Question[] = [
        { ...question, answer: typeof question.answer === 'number' ? question.answer + 1 : `${question.answer}错` },
        { ...question, text: `${question.text}（篡改）` },
        { ...question, layout: question.layout === 'wide' ? 'inline' : 'wide' },
        { ...question, signature: `${question.signature}-tampered` },
        { ...question, operators: ['+'] },
        { ...question, operands: [...question.operands, 1] },
        { ...question, operands: question.operands.map((value, index) => index === 0 ? Number.NaN : value) },
        { ...question, metadata: { ...(question.metadata ?? {}), injected: true } }
      ];
      for (const tampered of cases) expect(validateQuestion(tampered, config).valid, `${definition.id} accepted tampering`).toBe(false);
    }
  });

  it('keeps data visual structures and answer precision internally consistent', () => {
    for (const definition of DATA_QUESTION_DEFINITIONS) {
      const config = { ...base, stage: definition.allowedGrades.at(-1)!, types: [definition.id] };
      const question = generate(definition.id, config, `structure-${definition.id}`);
      if (question.content?.kind === 'chart') {
        expect(question.content.labels.length).toBeGreaterThan(0);
        expect(question.content.values.length).toBe(question.content.labels.length);
        if (question.content.chartType === 'pie') expect(question.content.values.reduce((sum, value) => sum + value, 0)).toBe(100);
        if (question.content.series) expect(question.content.series.every(series => series.values.length === question.content!.labels.length)).toBe(true);
      }
      if (question.content?.kind === 'table') expect(question.content.rows.every(row => row.length === question.content!.headers.length)).toBe(true);
      if (question.content?.kind === 'pictograph') expect(question.content.counts.length).toBe(question.content.labels.length);
      expect(question.answerDetails?.display).not.toBe('');
      if (question.answerDetails?.unit) expect(question.answerDetails.display.endsWith(question.answerDetails.unit)).toBe(true);
    }
  });

  it('keeps chart analysis valid with a narrow custom profile and never throws on malformed input', () => {
    const definition = DATA_QUESTION_DEFINITIONS.find(item => item.id === 'chartAnalysis')!;
    const config = { ...base, stage: 'grade6' as const, types: ['chartAnalysis' as ProblemType] };
    const context = createGenerationContext('chart-narrow-profile');
    const question = generateChartAnalysis({ type: 'chartAnalysis', config, profile: { min: 0, max: 20, terms: 3, carryRate: 0, highRangeRate: 0, wordSteps: 1, maxFactor: 9, trivialRate: 0, equalityRate: 0, mixedRate: 0 }, random: context.random, createId: context.createId });
    expect(Math.max(...question.operands)).toBeGreaterThan(Math.min(...question.operands));
    expect(definition.validate(question, config, definition)).toEqual({ valid: true, errors: [] });

    for (const current of DATA_QUESTION_DEFINITIONS) {
      const allowedConfig = { ...base, stage: current.allowedGrades.at(-1)!, types: [current.id] };
      const generated = generate(current.id, allowedConfig, `malformed-${current.id}`);
      const wrongType = { ...generated, type: (current.id === 'dataTableReading' ? 'probability' : 'dataTableReading') as ProblemType };
      expect(() => current.validate(wrongType, allowedConfig, current)).not.toThrow();
      expect(current.validate(wrongType, allowedConfig, current).valid).toBe(false);
      for (const operands of [undefined, [], [Number.NaN]]) {
        const malformed = { ...generated, operands: operands as unknown as number[] };
        expect(() => current.validate(malformed, allowedConfig, current)).not.toThrow();
        expect(current.validate(malformed, allowedConfig, current).valid).toBe(false);
      }
    }
  });
});
