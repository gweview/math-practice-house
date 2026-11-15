import { describe, expect, it } from 'vitest';
import { allocateDifficultyCounts, generateWorksheet } from '../src/core/generate';
import { getProblemProfile } from '../src/core/difficulty-config';
import type { Difficulty, Question, WorksheetConfig } from '../src/core/types';
import { difficultyProfiles, questionDefinition } from '../src/question-types/manifests/_shared';
import { resolveProblemProfile } from '../src/domain/questions/difficulty';
import { QUESTION_DEFINITIONS } from '../src/domain/questions/registry';
import { effectiveQuestionMagnitude, isReverseQuestion, scoreQuestionDifficulty } from '../src/domain/questions/difficulty-score';
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

describe('Phase C: custom difficulty profiles, extended directives, and mixed-difficulty worksheets', () => {
  it('honors custom per-difficulty max in resolveProblemProfile instead of overwriting with standard.max', () => {
    const baseDef = QUESTION_DEFINITIONS.find(item => item.id === 'addition100')!;
    const customDef = questionDefinition({
      ...baseDef,
      difficultyProfiles: difficultyProfiles(100, {
        tiers: {
          entry: 15,
          easy: 40,
          standard: 100,
          advanced: { max: 250, carryRate: .8 },
          challenge: { max: 500, carryRate: .95 }
        }
      })
    });
    expect(LEVELS.map(level => resolveProblemProfile(customDef, level, 'grade3', 'free').max))
      .toEqual([15, 40, 100, 250, 500]);
    // Curriculum mode caps or scales against stage ceiling (grade2 = 100)
    expect(resolveProblemProfile(customDef, 'challenge', 'grade2', 'curriculum').max).toBe(100);
  });

  it('scores reverse-thinking questions higher and normalizes non-arithmetic operand magnitudes', () => {
    const profile = { max: 100 };
    const forwardBlank: Question = {
      id: 'q-f', type: 'fillBlank', text: '20 + 30 =', answer: 50,
      operands: [20, 30, 50], operators: ['+'], signature: 'fillBlank:result:20+30=50',
      layout: 'inline', metadata: { blankPosition: 'result', operation: '+', magnitude: 50 }
    };
    const reverseBlank: Question = {
      ...forwardBlank, id: 'q-r', text: '□ + 30 = 50', answer: 20,
      metadata: { blankPosition: 'first', operation: '+', magnitude: 50 }
    };
    expect(isReverseQuestion(forwardBlank)).toBe(false);
    expect(isReverseQuestion(reverseBlank)).toBe(true);
    expect(scoreQuestionDifficulty(reverseBlank, profile))
      .toBeCloseTo(scoreQuestionDifficulty(forwardBlank, profile) + .15, 10);

    // Currency cents are normalized to yuan; discrete indices and SVG rotation angles are ignored
    const money: Question = {
      id: 'q-m', type: 'moneyCalculation', text: '', answer: '5.00 元',
      operands: [1500, 2000, 500], signature: 'm', layout: 'word'
    };
    expect(effectiveQuestionMagnitude(money)).toBe(20);
    const likelihood: Question = {
      id: 'q-l', type: 'likelihoodLanguage', text: '', answer: '一定',
      operands: [17], signature: 'l', layout: 'wide'
    };
    expect(effectiveQuestionMagnitude(likelihood)).toBe(0);
    const shape: Question = {
      id: 'q-s', type: 'shapeRecognition', text: '', answer: '圆形',
      operands: [3, 355], signature: 's', layout: 'wide'
    };
    expect(effectiveQuestionMagnitude(shape)).toBe(3);
  });

  it('enforces exact reverse directive quotas on fillBlank, multiplicationBlank, multiplicativeComparison, and moneySense', () => {
    const fillSheet = generateWorksheet({
      ...baseConfig, types: ['fillBlank'], difficulty: 'standard', count: 20
    }, { seed: 'fill-quota' });
    expect(fillSheet.questions.filter(q => q.metadata?.blankPosition !== 'result')).toHaveLength(10);

    const mulBlankSheet = generateWorksheet({
      ...baseConfig, types: ['multiplicationBlank'], difficulty: 'advanced', count: 20
    }, { seed: 'mul-blank-quota' });
    expect(mulBlankSheet.questions.filter(q => q.metadata?.reverse === true)).toHaveLength(7);

    const timesSheet = generateWorksheet({
      ...baseConfig, types: ['multiplicativeComparison'], difficulty: 'challenge', count: 20
    }, { seed: 'times-quota' });
    expect(timesSheet.questions.filter(q => q.metadata?.form === 'how-many-times')).toHaveLength(9);

    const moneySheet = generateWorksheet({
      ...baseConfig, types: ['moneySense'], difficulty: 'standard', count: 20
    }, { seed: 'money-quota' });
    expect(moneySheet.questions.filter(q => q.metadata?.form === 'jiao-split')).toHaveLength(5);
  });

  it('supports mixed-difficulty distribution and per-type difficulty overrides', () => {
    expect(allocateDifficultyCounts(10, { entry: 2, standard: 5, challenge: 3 }, 'standard')).toEqual([
      { difficulty: 'entry', count: 2 },
      { difficulty: 'standard', count: 5 },
      { difficulty: 'challenge', count: 3 }
    ]);

    const mixedSheet = generateWorksheet({
      ...baseConfig,
      types: ['wordProblem'],
      count: 20,
      ordering: 'progressive',
      difficultyDistribution: { entry: 1, challenge: 1 }
    }, { seed: 'mixed-difficulty-sheet' });
    expect(mixedSheet.questions).toHaveLength(20);
    // Entry half has 0 reverse and 0 multi-step; challenge half (10 questions) has round(10*0.45)=5 reverse and min(round(10*0.55), 5)=5 multi-step
    expect(mixedSheet.questions.filter(isReverse)).toHaveLength(5);
    expect(mixedSheet.questions.filter(isMultiStep)).toHaveLength(5);

    const perTypeSheet = generateWorksheet({
      ...baseConfig,
      types: ['fillBlank', 'wordProblem'],
      count: 20,
      difficulty: 'standard',
      typeDifficulties: { fillBlank: 'entry', wordProblem: 'challenge' }
    }, { seed: 'per-type-difficulty' });
    const fillQuestions = perTypeSheet.questions.filter(q => q.type === 'fillBlank');
    const wordQuestions = perTypeSheet.questions.filter(q => q.type === 'wordProblem');
    expect(fillQuestions).toHaveLength(10);
    expect(fillQuestions.every(q => q.metadata?.blankPosition === 'result')).toBe(true);
    expect(wordQuestions.filter(isMultiStep).length).toBeGreaterThan(0);
  });
});
