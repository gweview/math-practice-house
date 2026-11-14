import { describe, expect, it } from 'vitest';
import { generateWorksheet } from '../src/core/generate';
import type { ProblemType, WorksheetConfig } from '../src/core/types';
import { validateQuestion } from '../src/core/validators';
import { CUBE_NET_PATTERNS, isValidCubeNetCells, isValidCubeNetPattern } from '../src/domain/geometry/cube-net';
import { QUESTION_DEFINITIONS } from '../src/domain/questions/registry';
import { STAGE_RECOMMENDED_TYPES } from '../src/core/grade-config';
import type { Grade } from '../src/domain/curriculum/types';

const base: WorksheetConfig = {
  stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard',
  types: ['numberSequence'], count: 12, verticalOperations: ['addition', 'subtraction'], verticalPages: 1,
  showNumbers: true, showLines: true, answerPage: true, answerMode: 'compact', allowDuplicates: false,
  randomMix: true, ordering: 'random', generationMode: 'count', pageTarget: 1,
  fields: { name: true, date: true, time: true, score: true, streak: false },
  orientation: 'portrait', fontSize: 'standard'
};

describe('expanded elementary question bank', () => {
  it('uses audited cube-net fold classifications independent of generated answers', () => {
    expect(isValidCubeNetPattern('cross')).toBe(true);
    expect(isValidCubeNetPattern('zigzag')).toBe(true);
    expect(isValidCubeNetPattern('strip')).toBe(false);
    expect(isValidCubeNetPattern('twin')).toBe(false);
    expect(isValidCubeNetPattern('unknown')).toBe(false);
    expect(CUBE_NET_PATTERNS.cross).toHaveLength(6);
    expect(isValidCubeNetCells([[0, 0], [1, 0], [2, 0], [0, 2], [1, 2], [2, 2]])).toBe(false);
  });
  for (const { id: type } of QUESTION_DEFINITIONS.filter(definition => definition.practice === 'standard')) {
    it(`${type} generates independently validated structured questions`, () => {
      const worksheet = generateWorksheet({ ...base, types: [type as ProblemType] }, { seed: `contract-${type}` });
      expect(worksheet.questions).toHaveLength(12);
      expect(new Set(worksheet.questions.map(question => question.signature)).size).toBe(12);
      for (const question of worksheet.questions) {
        expect(validateQuestion(question, worksheet.config), question.text).toEqual({ valid: true, errors: [] });
        expect(question.answerDetails?.display).not.toBe('');
      }
    });
  }

  it('replays a complete worksheet exactly with the same seed', () => {
    const config = { ...base, types: ['fractionOperation', 'circle', 'chartAnalysis'] as ProblemType[], count: 30 };
    const first = generateWorksheet(config, { seed: 'class-6-review' });
    const replay = generateWorksheet(config, { seed: 'class-6-review' });
    const different = generateWorksheet(config, { seed: 'class-6-review-b' });
    expect(replay.questions).toEqual(first.questions);
    expect(different.questions.map(question => question.signature)).not.toEqual(first.questions.map(question => question.signature));
  });

  it('rejects answers or corrupted structural facts independently of generator metadata', () => {
    const cases: Array<{ type: ProblemType; mutate: (question: ReturnType<typeof generateWorksheet>['questions'][number]) => void }> = [
      { type: 'numberLine', mutate: question => { if (question.content?.kind === 'numberLine') question.content = { ...question.content, values: question.content.values.map((value, index) => index === 1 ? value + 1 : value) }; } },
      { type: 'proportionalReasoning', mutate: question => { if (question.content?.kind === 'table') question.content = { ...question.content, rows: [['总价/元', 999, '□', 3, 4]] }; } },
      { type: 'calendarWeekday', mutate: question => { if (question.content?.kind === 'table') question.content = { ...question.content, headers: ['日期', '答案'], rows: [[String(question.content.rows[0][0]), '□']] }; } },
      { type: 'directionRoute', mutate: question => { if (question.content?.kind === 'geometry') question.content = { ...question.content, dimensions: [999, question.operands[1]], labels: ['起点', '西', '北'] }; } },
      { type: 'countShapes', mutate: question => { if (question.content?.kind === 'geometry') question.content = { ...question.content, dimensions: [question.operands[0], question.operands[2], question.operands[1] + 1] }; } },
      { type: 'translationRotation', mutate: question => { if (question.content?.kind === 'geometry') question.content = { ...question.content, dimensions: [...question.content.dimensions.slice(0, 2), 999] }; } },
      { type: 'circle', mutate: question => { if (question.content?.kind === 'geometry') question.content = { ...question.content, dimensions: [999] }; } },
      { type: 'cylinder', mutate: question => { if (question.content?.kind === 'geometry') question.content = { ...question.content, dimensions: [999, question.operands[1]] }; } },
      { type: 'chartAnalysis', mutate: question => { if (question.content?.kind === 'chart') question.content = { ...question.content, values: question.content.values.map((value, index) => index === 1 ? value + 1 : value) }; } },
      { type: 'shapeClassification', mutate: question => { question.metadata = { ...question.metadata, category: '错误' }; question.content = { kind: 'geometry', shape: 'circle' }; } },
      { type: 'lineRaySegment', mutate: question => { question.metadata = { ...question.metadata, lineType: '错误' }; } },
      { type: 'translationRotation', mutate: question => { question.metadata = { ...question.metadata, operation: '平移' }; question.content = { kind: 'geometry', shape: 'composite', dimensions: [question.operands[0], question.operands[1] === 0 ? 1 : 0] }; } },
      { type: 'fractionVisual', mutate: question => { question.answer = '99/100'; } },
      { type: 'fractionVisual', mutate: question => { if (question.content?.kind === 'fractionVisual') question.content = { ...question.content, shaded: question.content.shaded + 1 }; } },
      { type: 'area', mutate: question => { if (question.content?.kind === 'geometry') question.content = { ...question.content, shape: question.content.shape === 'square' ? 'rectangle' : 'square' }; } },
      { type: 'quantityEstimate', mutate: question => { if (question.content?.kind === 'pictograph') question.content = { ...question.content, options: [1, 2] }; } },
      { type: 'quantityEstimate', mutate: question => { if (question.content?.kind === 'pictograph') question.content = { ...question.content, counts: [question.operands[0] + 1] }; } },
      { type: 'pictureClassification', mutate: question => { if (question.content?.kind === 'pictograph') question.content = { ...question.content, counts: [question.operands[0], question.operands[1] + 1] }; } },
      { type: 'axisSymmetry', mutate: question => { if (question.content?.kind === 'geometry') question.content = { ...question.content, dimensions: [(question.operands[0] + 1) % 5, question.operands[1]] }; } },
      { type: 'triangleQuadrilateralClassification', mutate: question => { if (question.content?.kind === 'geometry') question.content = { ...question.content, dimensions: [(question.operands[0] + 1) % 4, question.operands[1]] }; } },
      { type: 'cuboidNet', mutate: question => { if (question.content?.kind === 'geometry') { const next = question.content.netPattern === 'strip' ? 'cross' : 'strip'; question.content = { ...question.content, netPattern: next }; } } },
      { type: 'compositeArea', mutate: question => { if (question.content?.kind === 'geometry') question.content = { ...question.content, dimensions: [1, 1, 1, 1] }; } },
      { type: 'lineChartReading', mutate: question => { if (question.content?.kind === 'chart') question.content = { ...question.content, values: question.content.values.map((value, index) => index === 0 ? value + 1 : value) }; } },
      { type: 'pieChartReading', mutate: question => { if (question.content?.kind === 'chart') question.content = { ...question.content, values: question.content.values.map((value, index) => index === 0 ? value + 5 : value - 5) }; } },
      { type: 'multiChartAnalysis', mutate: question => { if (question.content?.kind === 'chart' && question.content.series) question.content = { ...question.content, series: question.content.series.map(series => ({ ...series, values: series.values.map((value, index) => index === 0 ? value + 1 : value) })) }; } },
      { type: 'inverseProportion', mutate: question => { if (question.content?.kind === 'table') question.content = { ...question.content, rows: [['天数', '999', '□']] }; } },
      { type: 'arithmeticFamily', mutate: question => { if (question.content?.kind === 'multiPart') question.content = { ...question.content, parts: question.content.parts.map((part, index) => index === 0 ? { ...part, answer: 999 } : part) }; } },
      { type: 'operationErrorDiagnosis', mutate: question => { if (question.content?.kind === 'multiPart') question.content = { ...question.content, parts: question.content.parts.map((part, index) => index === 1 ? { ...part, answer: 999 } : part) }; } },
      { type: 'shapeRecognition', mutate: question => { if (question.content?.kind === 'geometry') question.content = { ...question.content, shape: question.content.shape === 'circle' ? 'square' : 'circle' }; } },
      { type: 'angleMeasurement', mutate: question => { if (question.content?.kind === 'geometry') question.content = { ...question.content, angle: question.operands[0] + 1 }; } },
      { type: 'area', mutate: question => { if (question.content?.kind === 'geometry') question.content = { ...question.content, dimensions: [1, 1] }; } },
      { type: 'average', mutate: question => { if (question.content?.kind === 'table') question.content = { ...question.content, rows: [['数量', 999, ...question.operands.slice(1)]] }; } },
      { type: 'cuboidVolume', mutate: question => { if (question.content?.kind === 'geometry') question.content = { ...question.content, dimensions: [1, 1, 1] }; } }
    ];
    for (const { type, mutate } of cases) {
      const worksheet = generateWorksheet({ ...base, types: [type], count: 5 }, { seed: `tamper-${type}` });
      const question = { ...worksheet.questions[0], metadata: worksheet.questions[0].metadata ? { ...worksheet.questions[0].metadata } : undefined };
      mutate(question);
      expect(validateQuestion(question, worksheet.config).valid, type).toBe(false);
    }
  });

  it('keeps every grade recommendation inside its strict curriculum profile', () => {
    const grades: Grade[] = ['preschool', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'];
    for (const stage of grades) {
      const worksheet = generateWorksheet({
        ...base,
        stage,
        rangeMode: 'curriculum',
        types: STAGE_RECOMMENDED_TYPES[stage],
        count: 40
      }, { seed: `strict-${stage}` });
      expect(worksheet.questions, stage).toHaveLength(40);
      for (const question of worksheet.questions) {
        expect(validateQuestion(question, worksheet.config), `${stage}: ${question.text}`).toEqual({ valid: true, errors: [] });
      }
    }
  });
});
