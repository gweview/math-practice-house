import { describe, expect, it } from 'vitest';
import type { ProblemType, WorksheetConfig } from '../src/core/types';
import { generateWorksheet } from '../src/core/generate';
import { validateQuestion } from '../src/core/validators';
import { getQuestionDefinition } from '../src/domain/questions/registry';

const types: ProblemType[] = ['clockReading', 'elapsedTime', 'shapeRecognition', 'area', 'angleClassification', 'lineRaySegment', 'angleMeasurement', 'triangleQuadrilateralClassification', 'translationRotation', 'directionRoute', 'shapeClassification', 'countShapes', 'axisSymmetry'];
const base: WorksheetConfig = { stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard', types, count: 20, verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true, answerPage: true, answerMode: 'compact', allowDuplicates: true, randomMix: false, ordering: 'random', generationMode: 'count', pageTarget: 1, fields: { name: false, date: false, time: false, score: false, streak: false }, orientation: 'portrait', fontSize: 'standard' };

describe('geometry foundation migration', () => {
  it('replays and validates every migrated type with structural content', () => {
    for (const type of types) {
      const config = { ...base, types: [type], count: 8 };
      const first = generateWorksheet(config, { seed: `foundation-${type}` });
      const replay = generateWorksheet(config, { seed: `foundation-${type}` });
      expect(replay.questions).toEqual(first.questions);
      expect(first.questions).toHaveLength(8);
      for (const question of first.questions) {
        expect(validateQuestion(question, config), `${type}: ${question.text}`).toEqual({ valid: true, errors: [] });
        expect(question.type).toBe(type);
        expect(question.answerDetails?.display).not.toBe('');
        if (type === 'clockReading') expect(question.content).toMatchObject({ kind: 'clock', hour: question.operands[0], minute: question.operands[1] });
        if (type === 'elapsedTime') expect(question.text).toContain(`${question.operands[1]} 分钟`);
        if (type === 'countShapes') expect(question.answer).toBe(question.operands[1] === 1 ? question.operands[0] * question.operands[2] * (question.operands[0] + 1) * (question.operands[2] + 1) / 4 : question.operands[0] * (question.operands[0] + 1) * (2 * question.operands[0] + 1) / 6);
      }
    }
  });

  it('rejects answer, operands, metadata, content, and wrong type mutations', () => {
    for (const type of types) {
      const config = { ...base, types: [type], count: 1 };
      const original = generateWorksheet(config, { seed: `tamper-${type}` }).questions[0];
      const mutations = [
        { ...original, answer: typeof original.answer === 'number' ? original.answer + 1 : `${original.answer}错` },
        { ...original, operands: [] },
        { ...original, metadata: { ...(original.metadata ?? {}), tampered: true } },
        ...(original.content ? [{ ...original, content: undefined }] : []),
        { ...original, type: (type === 'area' ? 'clockReading' : 'area') as ProblemType }
      ];
      for (const mutated of mutations) expect(validateQuestion(mutated, config).valid, `${type}: ${mutated.text}`).toBe(false);
    }
  });

  it('rejects malformed missing operands without throwing', () => {
    for (const type of types) {
      const config = { ...base, types: [type], count: 1 };
      const original = generateWorksheet(config, { seed: `malformed-${type}` }).questions[0];
      for (const operands of [[], undefined]) {
        const malformed = { ...original, operands } as typeof original;
        expect(() => validateQuestion(malformed, config)).not.toThrow();
        expect(validateQuestion(malformed, config).valid).toBe(false);
      }
      const extra = { ...original, operands: [...original.operands, 1] };
      expect(() => validateQuestion(extra, config)).not.toThrow();
      expect(validateQuestion(extra, config).valid).toBe(false);
    }
  });

  it('honors stage allow-lists and definition/profile boundaries', () => {
    for (const type of types) {
      const definition = getQuestionDefinition(type);
      const allowed = definition.allowedGrades[0];
      const config = { ...base, stage: allowed, rangeMode: 'curriculum', types: [type], count: 3 };
      const worksheet = generateWorksheet(config, { seed: `stage-${type}` });
      expect(worksheet.questions.every(question => validateQuestion(question, config).valid)).toBe(true);
      const wrongStage = { ...worksheet.questions[0], operands: worksheet.questions[0].operands.map(() => 999_999_999) };
      expect(validateQuestion(wrongStage, config).valid).toBe(false);
      const wrongType = { ...worksheet.questions[0], type: 'addition10' as ProblemType };
      expect(validateQuestion(wrongType, config).valid).toBe(false);
    }
  });

  it('keeps all foundation generators valid across the difficulty matrix', () => {
    for (const difficulty of ['entry', 'easy', 'standard', 'advanced', 'challenge'] as const) {
      for (const type of types) {
        const definition = getQuestionDefinition(type);
        const stage = definition.allowedGrades[0];
        const config = { ...base, stage, difficulty, rangeMode: 'curriculum' as const, types: [type], count: 2 };
        const worksheet = generateWorksheet(config, { seed: `matrix-${type}-${difficulty}` });
        for (const question of worksheet.questions) expect(validateQuestion(question, config), `${type}/${difficulty}: ${question.text}`).toEqual({ valid: true, errors: [] });
      }
    }
  });
});
