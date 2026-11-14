import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUDOKU_CONFIG,
  getSudokuDifficultyProfile,
  getSudokuDifficultyProfiles,
  isSudokuDifficultyForSize,
  MAX_SUDOKU_TOTAL_COUNT,
  normalizeSudokuConfig,
  SUDOKU_DIFFICULTIES,
  SUDOKU_DIFFICULTY_PROFILES,
  validateSudokuSelection
} from '../src/features/sudoku/difficulty';
import { generateSudoku, generateSudokuSet } from '../src/features/sudoku/generator';
import { analyzeMiniSudoku, countMiniSolutions, isValidMiniGrid } from '../src/features/sudoku/mini';
import {
  analyzeSudoku,
  countSolutions,
  getCandidates,
  getSudokuUnitBlankCounts,
  isValidGrid,
  solveSudoku
} from '../src/features/sudoku/solver';
import type { RandomSource } from '../src/features/sudoku/generator';
import type { SudokuDifficultyProfile, SudokuGrid, SudokuPuzzle, SudokuSize } from '../src/features/sudoku/types';

const puzzle: SudokuGrid = [
  5,3,0,0,7,0,0,0,0,
  6,0,0,1,9,5,0,0,0,
  0,9,8,0,0,0,0,6,0,
  8,0,0,0,6,0,0,0,3,
  4,0,0,8,0,3,0,0,1,
  7,0,0,0,2,0,0,0,6,
  0,6,0,0,0,0,2,8,0,
  0,0,0,4,1,9,0,0,5,
  0,0,0,0,8,0,0,7,9
];
const solution: SudokuGrid = [
  5,3,4,6,7,8,9,1,2,
  6,7,2,1,9,5,3,4,8,
  1,9,8,3,4,2,5,6,7,
  8,5,9,7,6,1,4,2,3,
  4,2,6,8,5,3,7,9,1,
  7,1,3,9,2,4,8,5,6,
  9,6,1,5,3,7,2,8,4,
  2,8,7,4,1,9,6,3,5,
  3,4,5,2,8,6,1,7,9
];

function seeded(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function unitsAreComplete(grid: SudokuGrid, size: SudokuSize): boolean {
  const boxSize = size === 4 ? 2 : 3;
  const expected = Array.from({ length: size }, (_, index) => index + 1).join('');
  const rows = Array.from({ length: size }, (_, row) => grid.slice(row * size, row * size + size));
  const columns = Array.from({ length: size }, (_, column) => Array.from({ length: size }, (_, row) => grid[row * size + column]));
  const boxes = Array.from({ length: size }, (_, box) => {
    const startRow = Math.floor(box / boxSize) * boxSize;
    const startColumn = box % boxSize * boxSize;
    return Array.from({ length: size }, (_, index) =>
      grid[(startRow + Math.floor(index / boxSize)) * size + startColumn + index % boxSize]);
  });
  return [...rows, ...columns, ...boxes].every(unit => [...unit].sort().join('') === expected);
}

function unitBlankCounts(grid: SudokuGrid, size: SudokuSize) {
  const boxSize = size === 4 ? 2 : 3;
  const rows = Array.from({ length: size }, (_, row) =>
    grid.slice(row * size, row * size + size).filter(value => value === 0).length);
  const columns = Array.from({ length: size }, (_, column) =>
    Array.from({ length: size }, (_, row) => grid[row * size + column])
      .filter(value => value === 0).length);
  const boxes = Array.from({ length: size }, (_, box) => {
    const startRow = Math.floor(box / boxSize) * boxSize;
    const startColumn = box % boxSize * boxSize;
    return Array.from({ length: size }, (_, index) =>
      grid[(startRow + Math.floor(index / boxSize)) * size + startColumn + index % boxSize])
      .filter(value => value === 0).length;
  });
  return { rows, columns, boxes };
}

function expectMetricsInProfile(item: SudokuPuzzle, profile: SudokuDifficultyProfile): void {
  expect(item.metrics.clueCount).toBeGreaterThanOrEqual(profile.minClues);
  expect(item.metrics.clueCount).toBeLessThanOrEqual(profile.maxClues);
  expect(item.metrics.score).toBeGreaterThanOrEqual(profile.minScore);
  if (profile.minInitialFriendlyMoves !== undefined) {
    expect(item.metrics.initialFriendlyMoves).toBeGreaterThanOrEqual(profile.minInitialFriendlyMoves);
  }
  if (profile.minInitialFriendlyUnits !== undefined) {
    expect(item.metrics.initialFriendlyUnits).toBeGreaterThanOrEqual(profile.minInitialFriendlyUnits);
  }
  if (profile.minInitialFriendlyRows !== undefined) {
    expect(item.metrics.initialFriendlyRows).toBeGreaterThanOrEqual(profile.minInitialFriendlyRows);
  }
  if (profile.minInitialFriendlyColumns !== undefined) {
    expect(item.metrics.initialFriendlyColumns).toBeGreaterThanOrEqual(profile.minInitialFriendlyColumns);
  }
  if (profile.minInitialFriendlyBoxes !== undefined) {
    expect(item.metrics.initialFriendlyBoxes).toBeGreaterThanOrEqual(profile.minInitialFriendlyBoxes);
  }
  if (profile.maxInitialCompleteUnits !== undefined) {
    expect(item.metrics.initialCompleteUnits).toBeLessThanOrEqual(profile.maxInitialCompleteUnits);
  }
  if (profile.maxUnitBlanks !== undefined) {
    expect(item.metrics.maximumUnitBlanks).toBeLessThanOrEqual(profile.maxUnitBlanks);
  }
  if (profile.minFriendlySingles !== undefined) {
    expect(item.metrics.friendlySingles).toBeGreaterThanOrEqual(profile.minFriendlySingles);
  }
  if (profile.maxUnresolvedAfterFriendly !== undefined) {
    expect(item.metrics.unresolvedAfterFriendly).toBeLessThanOrEqual(profile.maxUnresolvedAfterFriendly);
  }
  if (profile.minHiddenSingles !== undefined) expect(item.metrics.hiddenSingles).toBeGreaterThanOrEqual(profile.minHiddenSingles);
  if (profile.maxHiddenSingles !== undefined) expect(item.metrics.hiddenSingles).toBeLessThanOrEqual(profile.maxHiddenSingles);
  if (profile.minLogicalRounds !== undefined) expect(item.metrics.logicalRounds).toBeGreaterThanOrEqual(profile.minLogicalRounds);
  if (profile.maxLogicalRounds !== undefined) expect(item.metrics.logicalRounds).toBeLessThanOrEqual(profile.maxLogicalRounds);
  if (profile.minBranchNodes !== undefined) expect(item.metrics.branchNodes).toBeGreaterThanOrEqual(profile.minBranchNodes);
  if (profile.maxBranchNodes !== undefined) expect(item.metrics.branchNodes).toBeLessThanOrEqual(profile.maxBranchNodes);
  if (profile.minDepth !== undefined) expect(item.metrics.maxDepth).toBeGreaterThanOrEqual(profile.minDepth);
  if (profile.minUnresolvedAfterLogic !== undefined) expect(item.metrics.unresolvedAfterLogic).toBeGreaterThanOrEqual(profile.minUnresolvedAfterLogic);
  if (profile.maxUnresolvedAfterLogic !== undefined) expect(item.metrics.unresolvedAfterLogic).toBeLessThanOrEqual(profile.maxUnresolvedAfterLogic);
}

function canonicalCluePattern(grid: SudokuGrid, size: SudokuSize): string {
  const mask = grid.map(value => value ? '1' : '0');
  const edge = size - 1;
  return Array.from({ length: 8 }, (_, transform) => {
    const output = Array(size * size).fill('0');
    for (let source = 0; source < size * size; source++) {
      const row = Math.floor(source / size);
      const column = source % size;
      const coordinates: ReadonlyArray<readonly [number, number]> = [
        [row, column], [column, edge - row], [edge - row, edge - column], [edge - column, row],
        [row, edge - column], [edge - row, column], [column, row], [edge - column, edge - row]
      ];
      const [targetRow, targetColumn] = coordinates[transform];
      output[targetRow * size + targetColumn] = mask[source];
    }
    return output.join('');
  }).sort()[0];
}

describe('sudoku V2 configuration', () => {
  it('defines separate ordered profile lists for 4x4 and 9x9', () => {
    expect(SUDOKU_DIFFICULTIES).toEqual(['starter', 'basic', 'entry', 'easy', 'standard', 'advanced', 'challenge']);
    expect(getSudokuDifficultyProfiles(4).map(item => item.difficulty)).toEqual(['starter', 'basic', 'challenge']);
    expect(getSudokuDifficultyProfiles(9).map(item => item.difficulty)).toEqual(['entry', 'easy', 'standard', 'advanced', 'challenge']);
    expect(SUDOKU_DIFFICULTY_PROFILES).toHaveLength(8);
    expect(getSudokuDifficultyProfile(4, 'challenge')?.label).toBe('挑战 4×4');
    expect(getSudokuDifficultyProfile(9, 'challenge')?.label).toBe('挑战 9×9');
    const childProfiles = getSudokuDifficultyProfiles(9).slice(0, 3);
    expect(childProfiles.map(profile => profile.targetClues)).toEqual([65, 61, 57]);
    expect(childProfiles.map(profile => profile.minInitialFriendlyMoves)).toEqual([6, 4, 2]);
    expect(childProfiles.map(profile => profile.minInitialFriendlyUnits)).toEqual([6, 6, 6]);
    expect(childProfiles.map(profile => profile.minInitialFriendlyRows)).toEqual([2, 2, 2]);
    expect(childProfiles.map(profile => profile.minInitialFriendlyColumns)).toEqual([2, 2, 2]);
    expect(childProfiles.map(profile => profile.minInitialFriendlyBoxes)).toEqual([2, 2, 2]);
    expect(childProfiles.map(profile => profile.maxInitialCompleteUnits)).toEqual([0, 0, 0]);
    expect(childProfiles.map(profile => profile.maxUnitBlanks)).toEqual([2, 3, 4]);
    expect(childProfiles.map(profile => profile.minFriendlySingles)).toEqual([16, 8, 4]);
    expect(childProfiles[0].maxUnresolvedAfterFriendly).toBe(0);
    expect(childProfiles.map(profile => profile.maxHiddenSingles)).toEqual([0, 0, 0]);
    expect(childProfiles.map(profile => profile.minLogicalRounds)).toEqual([undefined, undefined, undefined]);
    expect(childProfiles.map(profile => profile.maxLogicalRounds)).toEqual([2, 4, 5]);
    expect(childProfiles.every(profile => profile.maxBranchNodes === 0 &&
      profile.maxUnresolvedAfterLogic === 0)).toBe(true);
    expect(isSudokuDifficultyForSize(4, 'entry')).toBe(false);
    expect(isSudokuDifficultyForSize(9, 'starter')).toBe(false);

    for (const size of [4, 9] as const) {
      const profiles = getSudokuDifficultyProfiles(size);
      for (let index = 1; index < profiles.length; index++) {
        expect(profiles[index].targetClues).toBeLessThan(profiles[index - 1].targetClues);
        expect(profiles[index].minScore).toBeGreaterThan(profiles[index - 1].minScore);
      }
    }
  });

  it('validates selections including the size/difficulty pairing', () => {
    expect(validateSudokuSelection({ size: 4, difficulty: 'basic', count: 2 })).toBe(true);
    expect(validateSudokuSelection({ size: 9, difficulty: 'challenge', count: 12 })).toBe(true);
    expect(validateSudokuSelection({ size: 4, difficulty: 'entry', count: 1 })).toBe(false);
    expect(validateSudokuSelection({ size: 9, difficulty: 'entry', count: 0 })).toBe(false);
    expect(validateSudokuSelection({ size: 9, difficulty: 'entry', count: 13 })).toBe(false);
  });

  it('normalizes V2, merges duplicate selections and caps the whole worksheet at 12', () => {
    const normalized = normalizeSudokuConfig({
      selections: [
        { size: 4, difficulty: 'starter', count: 2 },
        { size: 9, difficulty: 'entry', count: 8 },
        { size: 4, difficulty: 'starter', count: 8 },
        { size: 4, difficulty: 'entry', count: 2 }
      ],
      answerPage: false,
      fields: { name: false, date: true, time: false },
      orientation: 'landscape',
      density: 'compact'
    });
    expect(normalized).toEqual({
      selections: [
        { size: 4, difficulty: 'starter', count: 4 },
        { size: 9, difficulty: 'entry', count: 8 }
      ],
      answerPage: false,
      fields: { name: false, date: true, time: false },
      orientation: 'landscape',
      density: 'compact'
    });
    expect(normalized.selections.reduce((sum, item) => sum + item.count, 0)).toBe(MAX_SUDOKU_TOTAL_COUNT);
  });

  it('migrates V1 difficulty/count and safely restores corrupt settings', () => {
    expect(normalizeSudokuConfig({
      difficulty: 'challenge', count: 4, answerPage: false,
      fields: { name: false, date: true, time: false }, orientation: 'landscape'
    })).toEqual({
      selections: [{ size: 9, difficulty: 'challenge', count: 4 }],
      answerPage: false,
      fields: { name: false, date: true, time: false },
      orientation: 'landscape',
      density: 'comfortable'
    });
    expect(normalizeSudokuConfig({ difficulty: 'starter', count: 2 }).selections)
      .toEqual([{ size: 4, difficulty: 'starter', count: 2 }]);
    expect(normalizeSudokuConfig({ difficulty: 'impossible', count: 3, answerPage: 'yes' }))
      .toEqual(DEFAULT_SUDOKU_CONFIG);
  });
});

describe('9x9 sudoku solver and analysis', () => {
  it('validates shape, values, rows, columns and boxes', () => {
    expect(isValidGrid(puzzle)).toBe(true);
    expect(isValidGrid(puzzle.slice(0, 80))).toBe(false);
    expect(isValidGrid([...puzzle.slice(0, 80), 10])).toBe(false);
    for (const [left, right] of [[0, 1], [0, 9], [0, 10]]) {
      const invalid = [...puzzle];
      invalid[right] = invalid[left];
      expect(isValidGrid(invalid)).toBe(false);
    }
    expect(isValidGrid(solution, false)).toBe(true);
    expect(isValidGrid(puzzle, false)).toBe(false);
  });

  it('returns candidates, solves and counts solutions without mutation', () => {
    const before = [...puzzle];
    expect(getCandidates(puzzle, 2)).toEqual([1, 2, 4]);
    expect(solveSudoku(puzzle)).toEqual(solution);
    expect(puzzle).toEqual(before);
    expect(unitsAreComplete(solveSudoku(puzzle) ?? [], 9)).toBe(true);
    expect(countSolutions(puzzle)).toBe(1);
    expect(countSolutions(Array(81).fill(0), 2)).toBe(2);
  });

  it('reports stable technique and actual decision-depth metrics', () => {
    const metrics = analyzeSudoku(puzzle);
    expect(analyzeSudoku(puzzle)).toEqual(metrics);
    expect(metrics.clueCount).toBe(30);
    expect(metrics.initialFriendlyMoves).toBe(0);
    expect(metrics.initialFriendlyUnits).toBe(0);
    expect(metrics.initialFriendlyRows).toBe(0);
    expect(metrics.initialFriendlyColumns).toBe(0);
    expect(metrics.initialFriendlyBoxes).toBe(0);
    expect(metrics.friendlySingles).toBeGreaterThanOrEqual(metrics.initialFriendlyMoves);
    expect(metrics.friendlyRounds).toBeGreaterThanOrEqual(0);
    expect(metrics.unresolvedAfterFriendly).toBeGreaterThanOrEqual(0);
    expect(metrics.nakedSingles + metrics.hiddenSingles).toBeGreaterThan(0);
    expect(metrics.logicalRounds).toBeGreaterThan(0);
    expect(metrics.candidatePressure).toBeGreaterThanOrEqual(0);
    expect(metrics.unresolvedAfterLogic).toBeGreaterThanOrEqual(0);
    expect(metrics.branchNodes).toBeGreaterThanOrEqual(0);
    expect(metrics.backtracks).toBeGreaterThanOrEqual(0);
    expect(metrics.maxDepth).toBeLessThanOrEqual(metrics.branchNodes);

    const sameClueCount = [...puzzle];
    sameClueCount[0] = 0;
    sameClueCount[2] = solution[2];
    expect(sameClueCount.filter(Boolean)).toHaveLength(metrics.clueCount);
    expect(analyzeSudoku(sameClueCount).score).not.toBe(metrics.score);
  });

  it('separates one-blank units from distinct moves and detects complete boxes', () => {
    const singleBlank = [...solution];
    singleBlank[0] = 0;
    const singleMetrics = analyzeSudoku(singleBlank);
    expect(singleMetrics.initialFriendlyMoves).toBe(1);
    expect(singleMetrics.initialFriendlyUnits).toBe(3);
    expect(singleMetrics.initialFriendlyRows).toBe(1);
    expect(singleMetrics.initialFriendlyColumns).toBe(1);
    expect(singleMetrics.initialFriendlyBoxes).toBe(1);

    const completeBoxBlindSpot = [...solution];
    const blankColumns = [3, 4, 5, 6, 7, 8, 0, 1, 2];
    for (let row = 0; row < 9; row++) completeBoxBlindSpot[row * 9 + blankColumns[row]] = 0;
    const rawCounts = unitBlankCounts(completeBoxBlindSpot, 9);
    expect(rawCounts.rows.every(count => count === 1)).toBe(true);
    expect(rawCounts.columns.every(count => count === 1)).toBe(true);
    expect(rawCounts.boxes).toContain(0);
    expect(getSudokuUnitBlankCounts(completeBoxBlindSpot)).toEqual(rawCounts);
    expect(analyzeSudoku(completeBoxBlindSpot).initialCompleteUnits).toBeGreaterThan(0);
  });
});

describe('4x4 sudoku generation', () => {
  for (const [levelIndex, difficulty] of (['starter', 'basic', 'challenge'] as const).entries()) {
    it(`generates unique ${difficulty} puzzles inside the logic profile`, () => {
      const profile = getSudokuDifficultyProfile(4, difficulty)!;
      for (let seed = 0; seed < 12; seed++) {
        const item = generateSudoku(4, difficulty, seeded(4_000 + levelIndex * 100 + seed));
        expect(item.size).toBe(4);
        expect(item.puzzle).toHaveLength(16);
        expect(isValidMiniGrid(item.puzzle)).toBe(true);
        expect(isValidMiniGrid(item.solution, false)).toBe(true);
        expect(countMiniSolutions(item.puzzle, 2)).toBe(1);
        expect(unitsAreComplete(item.solution, 4)).toBe(true);
        expect(analyzeMiniSudoku(item.puzzle)).toEqual(item.metrics);
        expectMetricsInProfile(item, profile);
        for (let cell = 0; cell < 16; cell++) {
          if (difficulty === 'challenge') {
            const row = Math.floor(cell / 4);
            const column = cell % 4;
            expect(item.puzzle[cell] === 0).toBe(item.puzzle[column * 4 + row] === 0);
          } else expect(item.puzzle[cell] === 0).toBe(item.puzzle[15 - cell] === 0);
          if (item.puzzle[cell]) expect(item.puzzle[cell]).toBe(item.solution[cell]);
        }
      }
    });
  }
});

describe('9x9 sudoku generation', () => {
  const profiles = getSudokuDifficultyProfiles(9);

  for (const [levelIndex, profile] of profiles.entries()) {
    it(`generates unique, symmetric ${profile.difficulty} puzzles in profile`, () => {
      const samples = profile.difficulty === 'advanced' || profile.difficulty === 'challenge' ? 4 : 8;
      for (let seed = 0; seed < samples; seed++) {
        const item = generateSudoku(9, profile.difficulty, seeded(9_000 + levelIndex * 100 + seed));
        expect(item.size).toBe(9);
        expect(isValidGrid(item.puzzle)).toBe(true);
        expect(isValidGrid(item.solution, false)).toBe(true);
        expect(countSolutions(item.puzzle, 2)).toBe(1);
        expect(solveSudoku(item.puzzle)).toEqual(item.solution);
        expectMetricsInProfile(item, profile);
        for (let cell = 0; cell < 81; cell++) {
          expect(item.puzzle[cell] === 0).toBe(item.puzzle[80 - cell] === 0);
          if (item.puzzle[cell]) expect(item.puzzle[cell]).toBe(item.solution[cell]);
        }
        const rawCounts = unitBlankCounts(item.puzzle, 9);
        const allCounts = [...rawCounts.rows, ...rawCounts.columns, ...rawCounts.boxes];
        expect(allCounts.every(count => count > 0)).toBe(true);
        expect(getSudokuUnitBlankCounts(item.puzzle)).toEqual(rawCounts);
        if (profile.maxUnitBlanks !== undefined) {
          expect(Math.max(...allCounts)).toBeLessThanOrEqual(profile.maxUnitBlanks);
        }
      }
    }, 20_000);
  }

  it('shows increasing score bands across generated difficulty samples', () => {
    const averages = profiles.map((profile, levelIndex) => {
      const scores = Array.from({ length: 4 }, (_, seed) =>
        generateSudoku(9, profile.difficulty, seeded(20_000 + levelIndex * 100 + seed)).metrics.score);
      return scores.reduce((sum, score) => sum + score, 0) / scores.length;
    });
    for (let index = 1; index < averages.length; index++) {
      expect(averages[index], `${profiles[index].difficulty}: ${averages.join(', ')}`)
        .toBeGreaterThan(averages[index - 1]);
    }
  }, 30_000);

  it('keeps entry puzzles obvious from the first move through the last', () => {
    for (let seed = 0; seed < 12; seed++) {
      const item = generateSudoku(9, 'entry', seeded(30_000 + seed));
      const counts = unitBlankCounts(item.puzzle, 9);
      expect(item.metrics.clueCount).toBe(65);
      expect(item.metrics.initialFriendlyMoves).toBe(6);
      expect(item.metrics.initialFriendlyUnits).toBe(6);
      expect(item.metrics.initialFriendlyRows).toBe(2);
      expect(item.metrics.initialFriendlyColumns).toBe(2);
      expect(item.metrics.initialFriendlyBoxes).toBe(2);
      expect([...counts.rows, ...counts.columns, ...counts.boxes]
        .every(count => count >= 1 && count <= 2)).toBe(true);
      expect(counts.rows.filter(count => count === 1)).toHaveLength(2);
      expect(counts.columns.filter(count => count === 1)).toHaveLength(2);
      expect(counts.boxes.filter(count => count === 1)).toHaveLength(2);
      expect(item.metrics.friendlySingles).toBe(16);
      expect(item.metrics.unresolvedAfterFriendly).toBe(0);
      expect(item.metrics.hiddenSingles).toBe(0);
      expect(item.metrics.branchNodes).toBe(0);
    }
  }, 20_000);

  it('reliably generates maximum-size low-age worksheets', () => {
    for (const [level, difficulty] of (['entry', 'easy', 'standard'] as const).entries()) {
      const profile = getSudokuDifficultyProfile(9, difficulty)!;
      for (let seed = 0; seed < 2; seed++) {
        const generated = generateSudokuSet({
          ...DEFAULT_SUDOKU_CONFIG,
          selections: [{ size: 9, difficulty, count: MAX_SUDOKU_TOTAL_COUNT }]
        }, seeded(40_000 + level * 100 + seed));
        expect(generated).toHaveLength(MAX_SUDOKU_TOTAL_COUNT);
        expect(new Set(generated.map(item => item.puzzle.join(''))).size).toBe(MAX_SUDOKU_TOTAL_COUNT);
        for (const item of generated) {
          expectMetricsInProfile(item, profile);
          const counts = unitBlankCounts(item.puzzle, 9);
          expect([...counts.rows, ...counts.columns, ...counts.boxes].every(count => count > 0)).toBe(true);
        }
      }
    }
  }, 30_000);
});

describe('mixed sudoku sets', () => {
  it('preserves selection order and removes duplicates across the whole set', () => {
    const generated = generateSudokuSet({
      ...DEFAULT_SUDOKU_CONFIG,
      selections: [
        { size: 4, difficulty: 'starter', count: 2 },
        { size: 9, difficulty: 'entry', count: 1 },
        { size: 4, difficulty: 'challenge', count: 1 }
      ]
    }, seeded(55_555));
    expect(generated.map(item => [item.size, item.difficulty])).toEqual([
      [4, 'starter'], [4, 'starter'], [9, 'entry'], [4, 'challenge']
    ]);
    expect(new Set(generated.map(item => `${item.size}:${item.puzzle.join('')}`)).size).toBe(generated.length);
  });

  it('diversifies four challenge boards by both content and clue layout', () => {
    const started = performance.now();
    const generated = generateSudokuSet({
      ...DEFAULT_SUDOKU_CONFIG,
      selections: [{ size: 9, difficulty: 'challenge', count: 4 }]
    }, seeded(98_765));
    expect(new Set(generated.map(item => item.puzzle.join(''))).size).toBe(4);
    expect(new Set(generated.map(item => canonicalCluePattern(item.puzzle, 9))).size).toBe(4);
    expect(performance.now() - started).toBeLessThan(5_000);
  }, 15_000);

  it('rejects empty, mismatched and oversized runtime configs', () => {
    expect(() => generateSudokuSet({ ...DEFAULT_SUDOKU_CONFIG, selections: [] }, seeded(1))).toThrow(/配置无效/);
    expect(() => generateSudokuSet({
      ...DEFAULT_SUDOKU_CONFIG,
      selections: [{ size: 4, difficulty: 'entry', count: 1 }]
    }, seeded(1))).toThrow(/配置无效/);
    expect(() => generateSudokuSet({
      ...DEFAULT_SUDOKU_CONFIG,
      selections: [
        { size: 4, difficulty: 'starter', count: 7 },
        { size: 9, difficulty: 'entry', count: 6 }
      ]
    }, seeded(1))).toThrow(/总题数/);
  });
});
