import { describe, expect, it } from 'vitest';
import type { ProblemType, Question, WorksheetConfig } from '../src/core/types';
import { getQuestionDefinition } from '../src/domain/questions/registry';
import { createGenerationContext } from '../src/shared/random/seeded-random';

const TYPES: ProblemType[] = ['largeNumberPlaceValue', 'operationLaw', 'decimalComparison', 'factorsMultiples', 'ratio', 'negativeNumber', 'calendarWeekday', 'fractionVisual', 'primeComposite', 'commonFactorsMultiples'];
const DIFFICULTIES = ['entry', 'easy', 'standard', 'advanced', 'challenge'] as const;

function config(overrides: Partial<WorksheetConfig> = {}): WorksheetConfig {
  return {
    stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard', types: TYPES,
    count: 20, verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true,
    answerPage: false, answerMode: 'none', allowDuplicates: true, randomMix: false, ordering: 'grouped',
    fields: { name: false, date: false, time: false, score: false, streak: false }, orientation: 'portrait', fontSize: 'standard', ...overrides
  };
}

function generate(type: ProblemType, seed: string, overrides: Partial<WorksheetConfig> = {}): Question {
  const context = createGenerationContext(seed); const current = config({ ...overrides, types: [type] }); const definition = getQuestionDefinition(type);
  return definition.generate({ type, config: current, profile: definition.difficultyProfiles[current.difficulty] as never, random: context.random, createId: context.createId });
}

describe('advanced concept migration', () => {
  it('replays every migrated generator from a fixed seed and validates it', () => {
    for (const type of TYPES) {
      const first = generate(type, `advanced-${type}`); const replay = generate(type, `advanced-${type}`); const definition = getQuestionDefinition(type);
      expect(replay, type).toEqual(first); expect(definition.validate(first, config({ types: [type] }), definition), type).toMatchObject({ valid: true }); expect(first.id).toMatch(/^q-/);
    }
  });

  it('exposes the expected structured content and independently derived answers', () => {
    const large = generate('largeNumberPlaceValue', 'large-structure'); expect(large.operands).toHaveLength(2); expect(large.metadata?.divisor).toBe(large.operands[1]);
    const fraction = generate('fractionVisual', 'fraction-structure'); expect(fraction.content?.kind).toBe('fractionVisual'); if (fraction.content?.kind === 'fractionVisual') { expect(fraction.content.numerator).toBe(fraction.operands[0]); expect(fraction.content.denominator).toBe(fraction.operands[1]); expect(fraction.content.shaded).toBe(fraction.operands[0]); }
    const calendar = generate('calendarWeekday', 'calendar-structure'); expect(calendar.content?.kind).toBe('table'); if (calendar.content?.kind === 'table') { expect(calendar.content.headers).toEqual(['日期', '星期']); expect(calendar.content.rows).toHaveLength(1); expect(calendar.content.rows[0]?.[1]).toBe('□'); }
    const ratio = generate('ratio', 'ratio-structure'); expect(ratio.answer).toMatch(/^\d+:\d+$/); expect(ratio.answerDetails?.steps).toHaveLength(2);
  });

  it('rejects answer, metadata, content, wrong type, malformed and extra operands', () => {
    for (const type of TYPES) {
      const definition = getQuestionDefinition(type); const question = generate(type, `tamper-${type}`); const current = config({ types: [type] });
      const alteredAnswer = typeof question.answer === 'number' ? question.answer + 1 : `${question.answer}!`;
      expect(definition.validate({ ...question, answer: alteredAnswer }, current, definition).valid, `${type} answer`).toBe(false);
      expect(definition.validate({ ...question, operands: [...question.operands, 999] }, current, definition).valid, `${type} extra operands`).toBe(false);
      expect(definition.validate({ ...question, operands: undefined as unknown as number[] }, current, definition).valid, `${type} malformed`).toBe(false);
      expect(definition.validate({ ...question, type: 'comparison' }, current, definition).valid, `${type} wrong type`).toBe(false);
      expect(definition.validate({ ...question, text: `${question.text}!` }, current, definition).valid, `${type} text`).toBe(false);
      expect(definition.validate({ ...question, layout: question.layout === 'wide' ? 'inline' : 'wide' }, current, definition).valid, `${type} layout`).toBe(false);
      expect(definition.validate({ ...question, signature: `${question.signature}!` }, current, definition).valid, `${type} signature`).toBe(false);
      expect(definition.validate({ ...question, answerDetails: { ...(question.answerDetails ?? { display: String(question.answer) }), display: `${question.answerDetails?.display ?? String(question.answer)}!` } }, current, definition).valid, `${type} answer display`).toBe(false);
      expect(definition.validate({ ...question, answerDetails: { ...(question.answerDetails ?? { display: String(question.answer) }), steps: [...(question.answerDetails?.steps ?? []), 'tampered'] } }, current, definition).valid, `${type} answer steps`).toBe(false);
      const metadata = { ...(question.metadata ?? {}) }; const key = Object.keys(metadata)[0];
      if (key) { const value = metadata[key]; metadata[key] = typeof value === 'number' ? value + 1 : typeof value === 'boolean' ? !value : `${String(value)}!`; }
      if (key) expect(definition.validate({ ...question, metadata }, current, definition).valid, `${type} metadata`).toBe(false);
      expect(definition.validate({ ...question, metadata: { ...(question.metadata ?? {}), tampered: true } }, current, definition).valid, `${type} extra metadata`).toBe(false);
    }
    const fraction = generate('fractionVisual', 'fraction-content-tamper'); const fractionDefinition = getQuestionDefinition('fractionVisual');
    expect(fractionDefinition.validate({ ...fraction, content: { kind: 'fractionVisual', numerator: 1, denominator: 2, shaded: 1 } }, config({ types: ['fractionVisual'] }), fractionDefinition).valid).toBe(false);
    const calendar = generate('calendarWeekday', 'calendar-content-tamper'); const calendarDefinition = getQuestionDefinition('calendarWeekday');
    expect(calendarDefinition.validate({ ...calendar, content: { kind: 'table', headers: ['日期', '星期'], rows: [['2024-99-99', '□']] } }, config({ types: ['calendarWeekday'] }), calendarDefinition).valid).toBe(false);
    const factors = generate('factorsMultiples', 'unexpected-content'); const factorsDefinition = getQuestionDefinition('factorsMultiples');
    expect(factorsDefinition.validate({ ...factors, content: { kind: 'table', headers: ['x'], rows: [['y']] } }, config({ types: ['factorsMultiples'] }), factorsDefinition).valid).toBe(false);
  });

  it('validates all five difficulty profiles and enforces curriculum stage gates', () => {
    for (const type of TYPES) for (const difficulty of DIFFICULTIES) {
      const question = generate(type, `profile-${type}-${difficulty}`, { difficulty }); const current = config({ types: [type], difficulty });
      expect(getQuestionDefinition(type).validate(question, current, getQuestionDefinition(type)).valid, `${type}/${difficulty}`).toBe(true);
    }
    for (const type of TYPES) {
      const definition = getQuestionDefinition(type); const question = generate(type, `stage-${type}`); const tooEarly = config({ types: [type], stage: 'preschool', rangeMode: 'curriculum' });
      expect(definition.validate(question, tooEarly, definition).valid, `${type} stage gate`).toBe(false);
    }
    const calendar = generate('calendarWeekday', 'calendar-boundary'); const calendarDefinition = getQuestionDefinition('calendarWeekday');
    expect(calendarDefinition.validate({ ...calendar, operands: [2, 30] }, config({ types: ['calendarWeekday'] }), calendarDefinition).valid).toBe(false);
  });
});
