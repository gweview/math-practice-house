import { describe, expect, it } from 'vitest';
import type { Layout, Question, WorksheetConfig } from '../src/core/types';
import { packInlineRows } from '../src/core/generate';
import { measuredTrackHeightMm, questionFootprint } from '../src/domain/worksheet/layout-metrics';
import { computeLongDivisionSteps } from '../src/features/math/MathWorkbook';
import { planMathSheets } from '../src/features/math/layout';

const baseConfig: WorksheetConfig = {
  stage: 'grade3',
  rangeMode: 'free',
  difficulty: 'standard',
  practiceMode: 'standard',
  types: ['addition100'],
  count: 20,
  verticalOperations: ['addition', 'subtraction'],
  verticalPages: 1,
  showNumbers: true,
  showLines: true,
  answerPage: true,
  allowDuplicates: false,
  randomMix: true,
  fields: { name: true, date: true, time: true, score: true, streak: false },
  orientation: 'portrait',
  fontSize: 'standard'
};

function makeQuestion(index: number, layout: Layout = 'inline'): Question {
  return {
    id: `question-${index}`,
    type: layout === 'word' ? 'wordProblem' : 'addition100',
    text: layout === 'word' ? `第 ${index} 道应用题` : `${index} + 1 =`,
    answer: index + 1,
    operands: [index, 1],
    operators: ['+'],
    signature: `question:${index}`,
    layout
  };
}

describe('math physical sheet planning', () => {
  it('returns no sheets for an empty worksheet', () => {
    expect(planMathSheets([], baseConfig)).toEqual([]);
  });

  it('keeps eight vertical problems on each exercise and answer sheet', () => {
    const questions = Array.from({ length: 16 }, (_, index) => makeQuestion(index, 'vertical'));
    const config: WorksheetConfig = {
      ...baseConfig,
      practiceMode: 'verticalAddSub',
      verticalPages: 2
    };
    const sheets = planMathSheets(questions, config);
    const exerciseSheets = sheets.filter(sheet => sheet.kind === 'questions');
    const answerSheets = sheets.filter(sheet => sheet.kind === 'answers');

    expect(exerciseSheets).toHaveLength(2);
    expect(answerSheets).toHaveLength(2);
    expect(sheets.map(sheet => sheet.slots.length)).toEqual([8, 8, 8, 8]);
    expect(exerciseSheets.flatMap(sheet => sheet.slots.map(slot => slot.questionNumber)))
      .toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
    expect(answerSheets.map(sheet => sheet.slots.map(slot => slot.questionNumber)))
      .toEqual(exerciseSheets.map(sheet => sheet.slots.map(slot => slot.questionNumber)));
    expect(sheets.filter(sheet => sheet.isLast).map(sheet => sheet.id)).toEqual(['math-answers-2']);
  });

  it('marks the final exercise sheet as last when answers are disabled', () => {
    const questions = Array.from({ length: 9 }, (_, index) => makeQuestion(index, 'vertical'));
    const sheets = planMathSheets(questions, {
      ...baseConfig,
      practiceMode: 'verticalAddSub',
      answerPage: false
    });

    expect(sheets.map(sheet => sheet.kind)).toEqual(['questions', 'questions']);
    expect(sheets.map(sheet => sheet.slots.length)).toEqual([8, 1]);
    expect(sheets.at(-1)?.isLast).toBe(true);
  });

  it('uses deterministic row budgets for standard portrait and landscape sheets', () => {
    const questions = Array.from({ length: 40 }, (_, index) => makeQuestion(index));
    const portrait = planMathSheets(questions, { ...baseConfig, answerPage: false });
    const landscape = planMathSheets(questions, {
      ...baseConfig,
      answerPage: false,
      orientation: 'landscape'
    });

    expect(portrait.map(sheet => sheet.slots.length)).toEqual([22, 18]);
    expect(landscape.map(sheet => sheet.slots.length)).toEqual([21, 19]);
    expect(portrait.flatMap(sheet => sheet.slots).map(slot => slot.question.id))
      .toEqual(questions.map(question => question.id));
  });

  it('reserves larger footprints for word problems and large type', () => {
    const questions = Array.from({ length: 12 }, (_, index) => makeQuestion(index, 'word'));
    const standard = planMathSheets(questions, { ...baseConfig, answerPage: false });
    const large = planMathSheets(questions, { ...baseConfig, answerPage: false, fontSize: 'large' });

    expect(standard.map(sheet => sheet.slots.length)).toEqual([6, 6]);
    expect(large.map(sheet => sheet.slots.length)).toEqual([5, 5, 2]);
  });

  it('plans from the rendered wide layout, not only the registry type', () => {
    const questions = Array.from({ length: 12 }, (_, index) => makeQuestion(index, 'wide'));
    const sheets = planMathSheets(questions, { ...baseConfig, answerPage: false });

    expect(sheets.map(sheet => sheet.slots.length)).toEqual([11, 1]);
  });

  it('keeps detailed vertical answer pages aligned with exercise pages', () => {
    const questions = Array.from({ length: 16 }, (_, index) => makeQuestion(index, 'vertical'));
    const sheets = planMathSheets(questions, {
      ...baseConfig,
      practiceMode: 'verticalAddSub',
      verticalPages: 2,
      answerMode: 'detailed'
    });
    const exerciseSheets = sheets.filter(sheet => sheet.kind === 'questions');
    const answerSheets = sheets.filter(sheet => sheet.kind === 'answers');

    expect(exerciseSheets.map(sheet => sheet.slots.length)).toEqual([8, 8]);
    expect(answerSheets.map(sheet => sheet.slots.length)).toEqual([8, 8]);
    expect(answerSheets.map(sheet => sheet.slots.map(slot => slot.questionNumber)))
      .toEqual(exerciseSheets.map(sheet => sheet.slots.map(slot => slot.questionNumber)));
  });

  it('keeps answer grouping identical without mutating questions or config', () => {
    const questions = [
      makeQuestion(0),
      makeQuestion(1, 'wide'),
      makeQuestion(2, 'word'),
      ...Array.from({ length: 24 }, (_, index) => makeQuestion(index + 3))
    ];
    const questionSnapshot = JSON.stringify(questions);
    const configSnapshot = JSON.stringify(baseConfig);
    const sheets = planMathSheets(questions, baseConfig);
    const exercise = sheets.filter(sheet => sheet.kind === 'questions');
    const answers = sheets.filter(sheet => sheet.kind === 'answers');

    expect(answers.map(sheet => sheet.slots.map(slot => slot.question.id)))
      .toEqual(exercise.map(sheet => sheet.slots.map(slot => slot.question.id)));
    expect(JSON.stringify(questions)).toBe(questionSnapshot);
    expect(JSON.stringify(baseConfig)).toBe(configSnapshot);
  });

  it('packs one hundred short answers onto one compact answer sheet', () => {
    const questions = Array.from({ length: 100 }, (_, index) => makeQuestion(index));
    const sheets = planMathSheets(questions, { ...baseConfig, answerMode: 'compact' });
    expect(sheets.filter(sheet => sheet.kind === 'answers')).toHaveLength(1);
    expect(sheets.filter(sheet => sheet.kind === 'answers')[0].slots).toHaveLength(100);
  });

  it('eliminates stranded single-column rows between full-width barriers via packInlineRows', () => {
    const alternating: Question[] = [
      makeQuestion(1, 'inline'),
      makeQuestion(2, 'word'),
      makeQuestion(3, 'inline'),
      makeQuestion(4, 'word'),
      makeQuestion(5, 'inline'),
      makeQuestion(6, 'inline')
    ];
    const beforeHeight = measuredTrackHeightMm(alternating, baseConfig, q => questionFootprint(q, baseConfig));
    const packed = packInlineRows(alternating, baseConfig);
    const afterHeight = measuredTrackHeightMm(packed, baseConfig, q => questionFootprint(q, baseConfig));
    expect(afterHeight).toBeLessThan(beforeHeight);
    expect(packed.map(q => q.id)).toEqual(['question-2', 'question-1', 'question-3', 'question-4', 'question-5', 'question-6']);
  });

  it('computes column-aligned long division steps for exact and remainder divisions', () => {
    const step75div6 = computeLongDivisionSteps(75, 6, 2);
    expect(step75div6.steps).toEqual([
      { minuend: undefined, product: '6 ' },
      { minuend: '15', product: '12' }
    ]);
    expect(step75div6.finalRemainder).toBe(' 3');

    const step245div6 = computeLongDivisionSteps(245, 6, 3);
    expect(step245div6.steps).toEqual([
      { minuend: undefined, product: '24 ' }
    ]);
    expect(step245div6.finalRemainder).toBe('  5');

    const step408div4 = computeLongDivisionSteps(408, 4, 3);
    expect(step408div4.steps).toEqual([
      { minuend: undefined, product: '4  ' },
      { minuend: '  8', product: '  8' }
    ]);
    expect(step408div4.finalRemainder).toBe('  0');
  });
});
