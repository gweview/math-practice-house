import { describe, expect, it } from 'vitest';
import { generateWorksheet } from '../src/core/generate';
import { getProblemProfile } from '../src/core/difficulty-config';
import type { Difficulty, Question, WorksheetConfig } from '../src/core/types';
import { difficultyProfiles } from '../src/question-types/manifests/_shared';
import { QUESTION_DEFINITIONS } from '../src/domain/questions/registry';
import { scoreQuestionDifficulty } from '../src/domain/questions/difficulty-score';
import { MULTI_STEP_WORD_SEMANTICS, REVERSE_WORD_SEMANTICS } from '../src/question-types/application/foundation';

const LEVELS: Difficulty[] = ['entry', 'easy', 'standard', 'advanced', 'challenge'];

const baseConfig: WorksheetConfig = {
  stage: 'grade3', rangeMode: 'free', difficulty: 'challenge', practiceMode: 'standard',
  types: ['wordProblem'], count: 20, generationMode: 'count', pageTarget: 1,
  verticalOperations: ['addition', 'subtraction'], verticalPages: 1,
  showNumbers: true, showLines: true, answerPage: false, answerMode: 'none', allowDuplicates: true,
  randomMix: false, ordering: 'grouped', fields: { name: true, date: true, time: true, score: true, streak: false },
  orientation: 'portrait', fontSize: 'standard'
};

const isReverse = (question: Question) => REVERSE_WORD_SEMANTICS.includes(question.metadata?.semantic as never);
const isMultiStep = (question: Question) => (question.operators?.length ?? 1) >= 2;

describe('difficulty model dimensions', () => {
  it('gives every template level reverse and multi-step rates that rise with difficulty', () => {
    const profiles = difficultyProfiles(1000);
    const reverseRates = LEVELS.map(level => profiles[level]?.reverseRate);
    const multiStepRates = LEVELS.map(level => profiles[level]?.multiStepRate);
    expect(reverseRates).toEqual([0, .1, .25, .35, .45]);
    expect(multiStepRates).toEqual([0, .1, .3, .5, .55]);
  });

  it('resolves finite rates in [0, 1] for every registered type', () => {
    for (const definition of QUESTION_DEFINITIONS) {
      for (const level of LEVELS) {
        const profile = getProblemProfile(definition.id, level, 'grade3', 'free');
        expect(Number.isFinite(profile.reverseRate)).toBe(true);
        expect(profile.reverseRate).toBeGreaterThanOrEqual(0);
        expect(profile.reverseRate).toBeLessThanOrEqual(1);
        expect(Number.isFinite(profile.multiStepRate)).toBe(true);
        expect(profile.multiStepRate).toBeGreaterThanOrEqual(0);
        expect(profile.multiStepRate).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('difficulty directive quotas', () => {
  it('enforces exact reverse and multi-step quotas at challenge level', () => {
    const worksheet = generateWorksheet({ ...baseConfig, difficulty: 'challenge' }, { seed: 'difficulty-quotas' });
    expect(worksheet.questions).toHaveLength(20);
    expect(worksheet.questions.filter(isReverse)).toHaveLength(9);
    expect(worksheet.questions.filter(isMultiStep)).toHaveLength(11);
    expect(worksheet.questions.filter(question => isReverse(question) && isMultiStep(question))).toHaveLength(0);
  });

  it('enforces exact reverse quotas at advanced level', () => {
    const worksheet = generateWorksheet({ ...baseConfig, difficulty: 'advanced' }, { seed: 'difficulty-quotas' });
    expect(worksheet.questions.filter(isReverse)).toHaveLength(7);
    expect(worksheet.questions.filter(isMultiStep)).toHaveLength(10);
  });

  it('produces no reverse or multi-step items at entry level', () => {
    const worksheet = generateWorksheet({ ...baseConfig, difficulty: 'entry' }, { seed: 'difficulty-quotas' });
    expect(worksheet.questions.filter(isReverse)).toHaveLength(0);
    expect(worksheet.questions.filter(isMultiStep)).toHaveLength(0);
  });

  it('keeps standard word problems single-step but mixes in reverse items', () => {
    const worksheet = generateWorksheet({ ...baseConfig, difficulty: 'standard' }, { seed: 'difficulty-quotas' });
    expect(worksheet.questions.filter(isReverse)).toHaveLength(5);
    expect(worksheet.questions.filter(isMultiStep)).toHaveLength(0);
  });
});

describe('difficulty score', () => {
  const makeQuestion = (overrides: Partial<Question>): Question => ({
    id: 'q-1', type: 'addition100', text: '1 + 1 =', answer: 2, operands: [1, 1],
    operators: ['+'], signature: 'addition100:1+1', layout: 'inline', ...overrides
  });

  it('ranks larger magnitudes higher at the same step count', () => {
    const profile = { max: 1000 };
    expect(scoreQuestionDifficulty(makeQuestion({ operands: [900, 90] }), profile))
      .toBeGreaterThan(scoreQuestionDifficulty(makeQuestion({ operands: [100, 10] }), profile));
  });

  it('ranks more steps higher at the same magnitude', () => {
    const profile = { max: 1000 };
    const oneStep = makeQuestion({ operands: [500], operators: ['+'] });
    const twoStep = makeQuestion({ operands: [500], operators: ['+', '-'] });
    expect(scoreQuestionDifficulty(twoStep, profile)).toBeGreaterThan(scoreQuestionDifficulty(oneStep, profile));
  });

  it('adds a fixed bonus for regrouping', () => {
    const profile = { max: 1000 };
    const question = makeQuestion({ operands: [500], operators: ['+'] });
    const plain = scoreQuestionDifficulty(question, profile);
    expect(scoreQuestionDifficulty(makeQuestion({ operands: [500], operators: ['+'], metadata: { regrouping: true } }), profile))
      .toBeCloseTo(plain + .15, 10);
  });

  it('stays within [0, 1]', () => {
    const profile = { max: 1000 };
    expect(scoreQuestionDifficulty(makeQuestion({ operands: [9999], operators: ['+', '-', '+'], metadata: { regrouping: true } }), profile)).toBeLessThanOrEqual(1);
    expect(scoreQuestionDifficulty(makeQuestion({ operands: [0], operators: [] }), profile)).toBeGreaterThanOrEqual(0);
  });

  it('orders progressive worksheets by non-decreasing score', () => {
    const worksheet = generateWorksheet({
      ...baseConfig, types: ['compareSigns'], difficulty: 'standard', ordering: 'progressive'
    }, { seed: 'progressive-score' });
    const profile = getProblemProfile('compareSigns', 'standard', 'grade3', 'free');
    const scores = worksheet.questions.map(question => scoreQuestionDifficulty(question, profile));
    const sorted = [...scores].sort((a, b) => a - b);
    expect(scores).toEqual(sorted);
  });
});

describe('word problem directive contract', () => {
  it('declares reverse and multi-step directive support', () => {
    const definition = QUESTION_DEFINITIONS.find(item => item.id === 'wordProblem');
    expect(definition?.directives).toEqual({ reverse: true, multiStep: true });
    expect(MULTI_STEP_WORD_SEMANTICS.length).toBeGreaterThan(0);
  });
});
