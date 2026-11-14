import {
  getSudokuDifficultyProfile,
  MAX_SUDOKU_TOTAL_COUNT,
  validateSudokuSelection
} from './difficulty';
import { analyzeSudoku, countSolutions, getSudokuUnitBlankCounts } from './solver';
import { generateMiniSudoku, type MiniSudokuDifficulty } from './mini';
import type {
  SudokuConfig,
  SudokuDifficulty,
  SudokuDifficultyProfile,
  SudokuGrid,
  SudokuPuzzle,
  SudokuSize
} from './types';

export type RandomSource = () => number;

function shuffled<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function pattern(row: number, column: number): number {
  return (row * 3 + Math.floor(row / 3) + column) % 9;
}

export function generateSolvedGrid(random: RandomSource = Math.random): SudokuGrid {
  const bands = shuffled([0, 1, 2], random);
  const stacks = shuffled([0, 1, 2], random);
  const rows = bands.flatMap(band => shuffled([0, 1, 2], random).map(row => band * 3 + row));
  const columns = stacks.flatMap(stack => shuffled([0, 1, 2], random).map(column => stack * 3 + column));
  const digits = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
  return rows.flatMap(row => columns.map(column => digits[pattern(row, column)]));
}

function carveSymmetric(
  solution: SudokuGrid,
  targetClues: number,
  random: RandomSource,
  maxUnitBlanks?: number
): SudokuGrid | null {
  const puzzle = [...solution];
  const pairs = shuffled(Array.from({ length: 40 }, (_, cell) => [cell, 80 - cell] as const), random);
  let clues = 81;
  if (targetClues % 2 === 0) {
    puzzle[40] = 0;
    const withinLimit = maxUnitBlanks === undefined || maximumUnitBlanks(puzzle) <= maxUnitBlanks;
    if (withinLimit && countSolutions(puzzle, 2) === 1) clues--;
    else puzzle[40] = solution[40];
  }
  for (const [left, right] of pairs) {
    if (clues - 2 < targetClues) continue;
    const leftValue = puzzle[left];
    const rightValue = puzzle[right];
    puzzle[left] = 0;
    puzzle[right] = 0;
    const withinLimit = maxUnitBlanks === undefined || maximumUnitBlanks(puzzle) <= maxUnitBlanks;
    if (withinLimit && countSolutions(puzzle, 2) === 1) clues -= 2;
    else {
      puzzle[left] = leftValue;
      puzzle[right] = rightValue;
    }
    if (clues === targetClues) return puzzle;
  }
  return clues === targetClues ? puzzle : null;
}

let generatedId = 0;
function puzzleId(random: RandomSource): string {
  generatedId++;
  return `sudoku-${Date.now().toString(36)}-${generatedId.toString(36)}-${Math.floor(random() * 0x100000000).toString(36)}`;
}

function unitBlankCounts(grid: SudokuGrid): number[] {
  const counts = getSudokuUnitBlankCounts(grid);
  return [...counts.rows, ...counts.columns, ...counts.boxes];
}

function everyUnitHasBlank(grid: SudokuGrid): boolean {
  return unitBlankCounts(grid).every(count => count > 0);
}

function maximumUnitBlanks(grid: SudokuGrid): number {
  return Math.max(...unitBlankCounts(grid));
}

interface DifficultTemplate {
  puzzle: string;
  solution: string;
}

const DIFFICULT_TEMPLATES: Record<'advanced' | 'challenge', readonly DifficultTemplate[]> = {
  advanced: [{
    puzzle: '406007000003020904810900007020009000530040079000300040300002056605010400000700803',
    solution: '496537128753128964812964537124679385538241679967385241381492756675813492249756813'
  }],
  challenge: [{
    puzzle: '940600003000083000000470102026007001000040000100200530403096000000820000500004016',
    solution: '947612853261583749358479162826357491735941628194268537473196285619825374582734916'
  }]
};

function transformedTemplate(template: DifficultTemplate, random: RandomSource): { puzzle: SudokuGrid; solution: SudokuGrid } {
  const puzzleSource = [...template.puzzle].map(Number);
  const solutionSource = [...template.solution].map(Number);
  const digitOrder = shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9], random);
  const transform = Math.floor(random() * 8);
  const puzzle = Array(81).fill(0) as SudokuGrid;
  const solution = Array(81).fill(0) as SudokuGrid;
  for (let source = 0; source < 81; source++) {
    const row = Math.floor(source / 9);
    const column = source % 9;
    const coordinates: ReadonlyArray<readonly [number, number]> = [
      [row, column], [column, 8 - row], [8 - row, 8 - column], [8 - column, row],
      [row, 8 - column], [8 - row, column], [column, row], [8 - column, 8 - row]
    ];
    const [targetRow, targetColumn] = coordinates[transform];
    const target = targetRow * 9 + targetColumn;
    puzzle[target] = puzzleSource[source] ? digitOrder[puzzleSource[source] - 1] : 0;
    solution[target] = digitOrder[solutionSource[source] - 1];
  }
  return { puzzle, solution };
}

/** Swap symmetric clue pairs while retaining clue count and uniqueness. */
function varyTemplate(
  input: SudokuGrid,
  solution: SudokuGrid,
  rounds: number,
  random: RandomSource
): SudokuGrid {
  let puzzle = [...input];
  for (let round = 0; round < rounds; round++) {
    const cluePairs = shuffled(Array.from({ length: 40 }, (_, cell) => [cell, 80 - cell] as const)
      .filter(([left, right]) => puzzle[left] !== 0 && puzzle[right] !== 0), random);
    const blankPairs = shuffled(Array.from({ length: 40 }, (_, cell) => [cell, 80 - cell] as const)
      .filter(([left, right]) => puzzle[left] === 0 && puzzle[right] === 0), random);
    let changed = false;
    for (const [addLeft, addRight] of blankPairs.slice(0, 8)) {
      for (const [removeLeft, removeRight] of cluePairs.slice(0, 8)) {
        const candidate = [...puzzle];
        candidate[addLeft] = solution[addLeft];
        candidate[addRight] = solution[addRight];
        candidate[removeLeft] = 0;
        candidate[removeRight] = 0;
        if (countSolutions(candidate, 2) === 1 && everyUnitHasBlank(candidate)) {
          puzzle = candidate;
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
    if (!changed) break;
  }
  return puzzle;
}

function meetsProfile(metrics: SudokuPuzzle['metrics'], profile: SudokuDifficultyProfile): boolean {
  return metrics.clueCount >= profile.minClues && metrics.clueCount <= profile.maxClues &&
    metrics.score >= profile.minScore &&
    (profile.minInitialFriendlyMoves === undefined ||
      metrics.initialFriendlyMoves >= profile.minInitialFriendlyMoves) &&
    (profile.minInitialFriendlyUnits === undefined ||
      metrics.initialFriendlyUnits >= profile.minInitialFriendlyUnits) &&
    (profile.minInitialFriendlyRows === undefined ||
      metrics.initialFriendlyRows >= profile.minInitialFriendlyRows) &&
    (profile.minInitialFriendlyColumns === undefined ||
      metrics.initialFriendlyColumns >= profile.minInitialFriendlyColumns) &&
    (profile.minInitialFriendlyBoxes === undefined ||
      metrics.initialFriendlyBoxes >= profile.minInitialFriendlyBoxes) &&
    (profile.maxInitialCompleteUnits === undefined ||
      metrics.initialCompleteUnits <= profile.maxInitialCompleteUnits) &&
    (profile.maxUnitBlanks === undefined || metrics.maximumUnitBlanks <= profile.maxUnitBlanks) &&
    (profile.minFriendlySingles === undefined || metrics.friendlySingles >= profile.minFriendlySingles) &&
    (profile.maxUnresolvedAfterFriendly === undefined ||
      metrics.unresolvedAfterFriendly <= profile.maxUnresolvedAfterFriendly) &&
    (profile.minHiddenSingles === undefined || metrics.hiddenSingles >= profile.minHiddenSingles) &&
    (profile.maxHiddenSingles === undefined || metrics.hiddenSingles <= profile.maxHiddenSingles) &&
    (profile.minLogicalRounds === undefined || metrics.logicalRounds >= profile.minLogicalRounds) &&
    (profile.maxLogicalRounds === undefined || metrics.logicalRounds <= profile.maxLogicalRounds) &&
    (profile.minBranchNodes === undefined || metrics.branchNodes >= profile.minBranchNodes) &&
    (profile.minDepth === undefined || metrics.maxDepth >= profile.minDepth) &&
    (profile.maxBranchNodes === undefined || metrics.branchNodes <= profile.maxBranchNodes) &&
    (profile.minUnresolvedAfterLogic === undefined || metrics.unresolvedAfterLogic >= profile.minUnresolvedAfterLogic) &&
    (profile.maxUnresolvedAfterLogic === undefined || metrics.unresolvedAfterLogic <= profile.maxUnresolvedAfterLogic);
}

function asNineByNinePuzzle(
  puzzle: SudokuGrid,
  solution: SudokuGrid,
  difficulty: SudokuDifficulty,
  random: RandomSource
): SudokuPuzzle {
  return {
    id: puzzleId(random),
    puzzle,
    solution,
    difficulty,
    metrics: analyzeSudoku(puzzle),
    size: 9,
    boxRows: 3,
    boxColumns: 3
  };
}

function generateDifficultSudoku(
  difficulty: 'advanced' | 'challenge',
  profile: SudokuDifficultyProfile,
  random: RandomSource
): SudokuPuzzle | null {
  // Random carving provides genuinely different boards. Curated templates remain
  // a bounded fallback so advanced levels are reliable even for adversarial RNGs.
  const randomAttempts = difficulty === 'advanced' ? 16 : 28;
  for (let attempt = 0; attempt < randomAttempts; attempt++) {
    const solution = generateSolvedGrid(random);
    const puzzle = carveSymmetric(solution, profile.targetClues, random);
    if (!puzzle || !everyUnitHasBlank(puzzle)) continue;
    const candidate = asNineByNinePuzzle(puzzle, solution, difficulty, random);
    if (meetsProfile(candidate.metrics, profile)) return candidate;
  }

  const templates = DIFFICULT_TEMPLATES[difficulty];
  for (let attempt = 0; attempt < 120; attempt++) {
    const template = templates[Math.floor(random() * templates.length)];
    const transformed = transformedTemplate(template, random);
    const puzzle = varyTemplate(transformed.puzzle, transformed.solution, attempt % 5, random);
    if (!everyUnitHasBlank(puzzle)) continue;
    const candidate = asNineByNinePuzzle(puzzle, transformed.solution, difficulty, random);
    if (countSolutions(puzzle, 2) === 1 && meetsProfile(candidate.metrics, profile)) return candidate;
  }
  return null;
}

export function generateSudoku(
  size: SudokuSize,
  difficulty: SudokuDifficulty,
  random: RandomSource = Math.random
): SudokuPuzzle {
  const profile = getSudokuDifficultyProfile(size, difficulty);
  if (!profile) throw new Error(`数独规格与难度不匹配：${size}×${size} / ${difficulty}`);

  if (size === 4) {
    const generated = generateMiniSudoku(difficulty as MiniSudokuDifficulty, random);
    if (!meetsProfile(generated.metrics, profile)) throw new Error(`暂时无法生成${profile.label}，请重试`);
    return {
      id: puzzleId(random),
      ...generated,
      difficulty,
      size: 4,
      boxRows: 2,
      boxColumns: 2
    };
  }

  if (difficulty === 'advanced' || difficulty === 'challenge') {
    const difficult = generateDifficultSudoku(difficulty, profile, random);
    if (difficult) return difficult;
    throw new Error(`暂时无法生成${profile.label}，请重试`);
  }

  // Low-age profiles constrain the blank distribution while carving, so every
  // row, column, and box stays useful without relying on a rare post-filter match.
  const attempts = 256;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const solution = generateSolvedGrid(random);
    const puzzle = carveSymmetric(solution, profile.targetClues, random, profile.maxUnitBlanks);
    if (!puzzle || !everyUnitHasBlank(puzzle)) continue;
    const candidate = asNineByNinePuzzle(puzzle, solution, difficulty, random);
    if (meetsProfile(candidate.metrics, profile)) return candidate;
  }
  throw new Error(`暂时无法生成${profile.label}，请重试`);
}

function transformMask(mask: string, size: SudokuSize, transform: number): string {
  const output = Array(size * size).fill('0');
  for (let source = 0; source < size * size; source++) {
    const row = Math.floor(source / size);
    const column = source % size;
    const edge = size - 1;
    const coordinates: ReadonlyArray<readonly [number, number]> = [
      [row, column], [column, edge - row], [edge - row, edge - column], [edge - column, row],
      [row, edge - column], [edge - row, column], [column, row], [edge - column, edge - row]
    ];
    const [targetRow, targetColumn] = coordinates[transform];
    output[targetRow * size + targetColumn] = mask[source];
  }
  return output.join('');
}

function canonicalCluePattern(grid: SudokuGrid, size: SudokuSize): string {
  const mask = grid.map(value => value === 0 ? '0' : '1').join('');
  return Array.from({ length: 8 }, (_, transform) => transformMask(mask, size, transform)).sort()[0];
}

function assertGeneratableConfig(config: SudokuConfig): number {
  if (!config || !Array.isArray(config.selections) || !config.selections.length ||
    !config.selections.every(validateSudokuSelection)) {
    throw new Error('数独生成配置无效');
  }
  const total = config.selections.reduce((sum, selection) => sum + selection.count, 0);
  if (total < 1 || total > MAX_SUDOKU_TOTAL_COUNT) throw new Error(`数独总题数须为 1～${MAX_SUDOKU_TOTAL_COUNT}`);
  return total;
}

export function generateSudokuSet(config: SudokuConfig, random: RandomSource = Math.random): SudokuPuzzle[] {
  const total = assertGeneratableConfig(config);
  const puzzles: SudokuPuzzle[] = [];
  const exactSignatures = new Set<string>();
  const difficultPatterns = new Set<string>();

  for (const selection of config.selections) {
    let accepted = 0;
    let attempts = 0;
    while (accepted < selection.count && attempts++ < selection.count * 48) {
      const puzzle = generateSudoku(selection.size, selection.difficulty, random);
      const exact = `${puzzle.size}:${puzzle.puzzle.join('')}`;
      const difficultPattern = puzzle.size === 9 && (puzzle.difficulty === 'advanced' || puzzle.difficulty === 'challenge')
        ? `${puzzle.difficulty}:${canonicalCluePattern(puzzle.puzzle, 9)}`
        : undefined;
      if (exactSignatures.has(exact) || (difficultPattern && difficultPatterns.has(difficultPattern))) continue;
      exactSignatures.add(exact);
      if (difficultPattern) difficultPatterns.add(difficultPattern);
      puzzles.push(puzzle);
      accepted++;
    }
    if (accepted !== selection.count) throw new Error(`无法生成足够多且版式不同的${selection.size}×${selection.size}数独，请重试`);
  }

  if (puzzles.length !== total) throw new Error('数独生成数量不一致，请重试');
  return puzzles;
}
