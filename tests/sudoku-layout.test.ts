import { describe, expect, it } from 'vitest';
import { planSudokuSheets } from '../src/features/sudoku/layout';
import type { SudokuConfig, SudokuDifficulty, SudokuPuzzle } from '../src/features/sudoku/types';

let puzzleSequence = 0;

function puzzle(size: 4 | 9, difficulty: SudokuDifficulty = size === 4 ? 'starter' : 'standard'): SudokuPuzzle {
  return {
    id: `${size}-${difficulty}-${++puzzleSequence}`,
    puzzle: Array(size * size).fill(0),
    solution: Array(size * size).fill(1),
    difficulty,
    metrics: {
      clueCount: 0,
      initialFriendlyMoves: 0,
      initialFriendlyUnits: 0,
      initialFriendlyRows: 0,
      initialFriendlyColumns: 0,
      initialFriendlyBoxes: 0,
      initialCompleteUnits: 0,
      maximumUnitBlanks: 0,
      friendlySingles: 0,
      friendlyRounds: 0,
      unresolvedAfterFriendly: 0,
      nakedSingles: 0,
      hiddenSingles: 0,
      logicalRounds: 0,
      candidatePressure: 0,
      unresolvedAfterLogic: 0,
      branchNodes: 0,
      backtracks: 0,
      maxDepth: 0,
      score: 0
    },
    size,
    boxRows: size === 4 ? 2 : 3,
    boxColumns: size === 4 ? 2 : 3
  };
}

function config(overrides: Partial<SudokuConfig> = {}): SudokuConfig {
  return {
    selections: [{ size: 9, difficulty: 'standard', count: 1 }],
    answerPage: false,
    fields: { name: true, date: true, time: true },
    orientation: 'auto',
    density: 'comfortable',
    ...overrides
  };
}

// The board size includes a 0.8mm outer border on each side. Assert the
// writable cell box, not merely boardSize / gridSize.
function writableCellMm(slot: { boardSizeMm: number; size: 4 | 9 }): number {
  return (slot.boardSizeMm - 1.6) / slot.size;
}

describe('sudoku physical sheet planner', () => {
  it('keeps one 9x9 question large on a portrait single template', () => {
    const sheets = planSudokuSheets([puzzle(9)], config());
    expect(sheets).toHaveLength(1);
    expect(sheets[0]).toMatchObject({ kind: 'questions', orientation: 'portrait', template: 'single' });
    expect(writableCellMm(sheets[0].slots[0])).toBeGreaterThanOrEqual(11);
  });

  it('uses one automatic landscape direction for all sheets and limits 9x9 questions to two per page', () => {
    const puzzles = Array.from({ length: 4 }, () => puzzle(9, 'advanced'));
    const sheets = planSudokuSheets(puzzles, config({ answerPage: true }));
    const questions = sheets.filter(sheet => sheet.kind === 'questions');
    const answers = sheets.filter(sheet => sheet.kind === 'answers');

    expect(questions).toHaveLength(2);
    expect(questions.every(sheet => sheet.template === 'double' && sheet.slots.length === 2)).toBe(true);
    expect(questions.flatMap(sheet => sheet.slots).every(slot => writableCellMm(slot) >= 13)).toBe(true);
    expect(answers).toHaveLength(1);
    expect(answers[0].template).toBe('quad');
    expect(answers[0].slots).toHaveLength(4);
    expect(answers[0].slots.every(slot => writableCellMm(slot) >= 8)).toBe(true);
    expect(new Set(sheets.map(sheet => sheet.orientation))).toEqual(new Set(['landscape']));
  });

  it('respects an explicit orientation for every question and answer sheet', () => {
    const sheets = planSudokuSheets(Array.from({ length: 3 }, () => puzzle(9)), config({
      answerPage: true,
      orientation: 'portrait'
    }));
    expect(sheets.length).toBeGreaterThan(1);
    expect(sheets.every(sheet => sheet.orientation === 'portrait')).toBe(true);
  });

  it('chooses auto landscape only when pagination will actually consume a mixed group', () => {
    const falsePositive = planSudokuSheets(
      [puzzle(4), puzzle(4), puzzle(4), puzzle(9)],
      config()
    );
    expect(falsePositive.map(sheet => sheet.template)).toEqual(['quad', 'single']);
    expect(falsePositive.every(sheet => sheet.orientation === 'portrait')).toBe(true);

    const laterMixedGroup = planSudokuSheets(
      [puzzle(4), puzzle(4), puzzle(4), puzzle(4), puzzle(9), puzzle(4), puzzle(4)],
      config()
    );
    expect(laterMixedGroup.map(sheet => sheet.template)).toEqual(['quad', 'mixed']);
    expect(laterMixedGroup.every(sheet => sheet.orientation === 'landscape')).toBe(true);
  });

  it('places four comfortable 4x4 questions on a quad sheet with writable cells', () => {
    const sheets = planSudokuSheets(Array.from({ length: 4 }, () => puzzle(4)), config());
    expect(sheets).toHaveLength(1);
    expect(sheets[0].template).toBe('quad');
    expect(sheets[0].slots).toHaveLength(4);
    expect(sheets[0].slots.every(slot => writableCellMm(slot) >= 18)).toBe(true);
  });

  it('allows six compact 4x4 questions while retaining 18mm cells', () => {
    const sheets = planSudokuSheets(Array.from({ length: 6 }, () => puzzle(4)), config({ density: 'compact' }));
    expect(sheets).toHaveLength(1);
    expect(sheets[0].template).toBe('six');
    expect(sheets[0].slots).toHaveLength(6);
    expect(sheets[0].slots.every(slot => writableCellMm(slot) >= 18)).toBe(true);
  });

  it('packs up to six 4x4 answers independently from comfortable question pagination', () => {
    const sheets = planSudokuSheets(Array.from({ length: 6 }, () => puzzle(4)), config({ answerPage: true }));
    const questions = sheets.filter(sheet => sheet.kind === 'questions');
    const answers = sheets.filter(sheet => sheet.kind === 'answers');
    expect(questions.map(sheet => sheet.slots.length)).toEqual([4, 2]);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ template: 'six' });
    expect(answers[0].slots).toHaveLength(6);
  });

  it('orders every mixed input as 9x9 then 4x4 and keeps question-answer IDs aligned', () => {
    const inputOrders = [
      [4, 4, 9],
      [4, 9, 4],
      [9, 4, 4]
    ] as const;

    for (const inputOrder of inputOrders) {
      const puzzles = inputOrder.map(size => puzzle(
        size,
        size === 4 ? 'starter' : 'challenge'
      ));
      const sheets = planSudokuSheets(puzzles, config({ answerPage: true }));
      expect(sheets).toHaveLength(2);
      expect(sheets.map(sheet => sheet.template)).toEqual(['mixed', 'mixed']);
      expect(sheets.every(sheet => sheet.orientation === 'landscape')).toBe(true);
      expect(sheets[0].slots.map(slot => slot.size)).toEqual([9, 4, 4]);
      expect(sheets[0].slots.map(slot => slot.area)).toEqual(['primary', 'secondary', 'secondary']);
      expect(sheets[0].slots.map(slot => slot.puzzleNumber)).toEqual([1, 2, 3]);
      expect(sheets[0].slots.filter(slot => slot.size === 4).every(slot => writableCellMm(slot) >= 18)).toBe(true);
      expect(writableCellMm(sheets[0].slots[0])).toBeGreaterThanOrEqual(13);

      const questionIds = new Map(sheets[0].slots.map(slot => [slot.puzzleNumber, slot.puzzle.id]));
      for (const answerSlot of sheets[1].slots) {
        expect(answerSlot.puzzle.id).toBe(questionIds.get(answerSlot.puzzleNumber));
      }
    }
  });

  it('uses one global visual order when question and answer capacities would otherwise split differently', () => {
    const puzzles = [
      puzzle(4), puzzle(4), puzzle(4), puzzle(4), puzzle(4), puzzle(4),
      puzzle(9), puzzle(4), puzzle(4)
    ];
    const sheets = planSudokuSheets(puzzles, config({ answerPage: true }));
    const questionSlots = sheets
      .filter(sheet => sheet.kind === 'questions')
      .flatMap(sheet => sheet.slots);
    const answerSlots = sheets
      .filter(sheet => sheet.kind === 'answers')
      .flatMap(sheet => sheet.slots);

    expect(questionSlots.map(slot => slot.puzzleNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(answerSlots.map(slot => slot.puzzleNumber)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(answerSlots.map(slot => slot.puzzle)).toEqual(questionSlots.map(slot => slot.puzzle));
  });

  it('preserves original puzzle numbering across different question and answer pagination', () => {
    const puzzles = Array.from({ length: 4 }, () => puzzle(9));
    const sheets = planSudokuSheets(puzzles, config({ answerPage: true }));
    const questionNumbers = sheets
      .filter(sheet => sheet.kind === 'questions')
      .flatMap(sheet => sheet.slots.map(slot => slot.puzzleNumber));
    const answerNumbers = sheets
      .filter(sheet => sheet.kind === 'answers')
      .flatMap(sheet => sheet.slots.map(slot => slot.puzzleNumber));
    expect(questionNumbers).toEqual([1, 2, 3, 4]);
    expect(answerNumbers).toEqual(questionNumbers);
    expect(sheets.flatMap(sheet => sheet.slots).every(slot => slot.puzzle === puzzles[slot.puzzleNumber - 1])).toBe(true);
  });

  it('keeps numbering and answer mapping for every short mixed size sequence', () => {
    for (const density of ['comfortable', 'compact'] as const) {
      for (let length = 1; length <= 8; length++) {
        for (let mask = 0; mask < 2 ** length; mask++) {
          const sizes = Array.from(
            { length },
            (_, index): 4 | 9 => mask & (1 << index) ? 9 : 4
          );
          const puzzles = sizes.map(size => puzzle(size));
          const sheets = planSudokuSheets(puzzles, config({ answerPage: true, density }));
          const questions = sheets
            .filter(sheet => sheet.kind === 'questions')
            .flatMap(sheet => sheet.slots);
          const answers = sheets
            .filter(sheet => sheet.kind === 'answers')
            .flatMap(sheet => sheet.slots);
          const expectedNumbers = Array.from({ length }, (_, index) => index + 1).join(',');
          const valid = questions.map(slot => slot.puzzleNumber).join(',') === expectedNumbers &&
            answers.map(slot => slot.puzzleNumber).join(',') === expectedNumbers &&
            answers.every((slot, index) => slot.puzzle === questions[index].puzzle);
          if (!valid) {
            throw new Error(`题答映射错误：${density} / ${sizes.join(',')}`);
          }
        }
      }
    }
  });

  it('returns no physical sheets for an empty generated set', () => {
    expect(planSudokuSheets([], config({ answerPage: true }))).toEqual([]);
  });
});
