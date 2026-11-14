import { describe, expect, it } from 'vitest';
import type { Layout, Question, WorksheetConfig } from '../src/core/types';
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
});
