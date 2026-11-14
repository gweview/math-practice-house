import type { SudokuDifficulty, SudokuGrid, SudokuMetrics } from './types';

type RandomSource = () => number;
export type MiniSudokuDifficulty = Extract<SudokuDifficulty, 'starter' | 'basic' | 'challenge'>;

const SIZE = 4;
const CELL_COUNT = 16;
const DIGITS = [1, 2, 3, 4] as const;
const ROW_UNITS = Array.from({ length: SIZE }, (_, row) =>
  Array.from({ length: SIZE }, (_, column) => row * SIZE + column));
const COLUMN_UNITS = Array.from({ length: SIZE }, (_, column) =>
  Array.from({ length: SIZE }, (_, row) => row * SIZE + column));
const BOX_UNITS = Array.from({ length: SIZE }, (_, box) => {
  const startRow = Math.floor(box / 2) * 2;
  const startColumn = box % 2 * 2;
  return [0, 1, 4, 5].map(offset => startRow * 4 + startColumn + offset);
});
const UNITS: number[][] = [...ROW_UNITS, ...COLUMN_UNITS, ...BOX_UNITS];

function shuffled<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function candidateValues(grid: SudokuGrid, cell: number): number[] {
  if (grid[cell] !== 0) return [];
  const row = Math.floor(cell / SIZE);
  const column = cell % SIZE;
  const used = new Set<number>();
  for (let index = 0; index < SIZE; index++) {
    used.add(grid[row * SIZE + index]);
    used.add(grid[index * SIZE + column]);
  }
  const boxRow = Math.floor(row / 2) * 2;
  const boxColumn = Math.floor(column / 2) * 2;
  for (let rowOffset = 0; rowOffset < 2; rowOffset++) {
    for (let columnOffset = 0; columnOffset < 2; columnOffset++) {
      used.add(grid[(boxRow + rowOffset) * SIZE + boxColumn + columnOffset]);
    }
  }
  return DIGITS.filter(value => !used.has(value));
}

export function isValidMiniGrid(grid: SudokuGrid, allowEmpty = true): boolean {
  if (!Array.isArray(grid) || grid.length !== CELL_COUNT ||
    grid.some(value => !Number.isInteger(value) || value < (allowEmpty ? 0 : 1) || value > SIZE)) return false;
  return UNITS.every(unit => {
    const values = unit.map(cell => grid[cell]).filter(Boolean);
    return new Set(values).size === values.length;
  });
}

function findFriendlyMoves(grid: SudokuGrid): Map<number, number> {
  const moves = new Map<number, number>();
  for (const unit of UNITS) {
    const blanks = unit.filter(cell => grid[cell] === 0);
    if (blanks.length !== 1) continue;
    const used = new Set(unit.map(cell => grid[cell]).filter(Boolean));
    const digit = DIGITS.find(value => !used.has(value));
    if (digit === undefined) continue;
    const existing = moves.get(blanks[0]);
    if (existing === undefined || existing === digit) moves.set(blanks[0], digit);
  }
  return moves;
}

function measureInitialUnitDistribution(input: SudokuGrid) {
  const count = (units: number[][]) => units.map(unit => unit.filter(cell => input[cell] === 0).length);
  const rows = count(ROW_UNITS);
  const columns = count(COLUMN_UNITS);
  const boxes = count(BOX_UNITS);
  const initialFriendlyRows = rows.filter(value => value === 1).length;
  const initialFriendlyColumns = columns.filter(value => value === 1).length;
  const initialFriendlyBoxes = boxes.filter(value => value === 1).length;
  const allCounts = [...rows, ...columns, ...boxes];
  return {
    initialFriendlyUnits: initialFriendlyRows + initialFriendlyColumns + initialFriendlyBoxes,
    initialFriendlyRows,
    initialFriendlyColumns,
    initialFriendlyBoxes,
    initialCompleteUnits: allCounts.filter(value => value === 0).length,
    maximumUnitBlanks: Math.max(...allCounts)
  };
}

function measureFriendlyProgress(input: SudokuGrid) {
  const grid = [...input];
  let initialFriendlyMoves = 0;
  let friendlySingles = 0;
  let friendlyRounds = 0;
  while (grid.includes(0)) {
    const moves = findFriendlyMoves(grid);
    if (friendlyRounds === 0) initialFriendlyMoves = moves.size;
    if (!moves.size) break;
    for (const [cell, digit] of moves) grid[cell] = digit;
    friendlySingles += moves.size;
    friendlyRounds++;
    if (!isValidMiniGrid(grid)) break;
  }
  return {
    initialFriendlyMoves,
    friendlySingles,
    friendlyRounds,
    unresolvedAfterFriendly: grid.filter(value => value === 0).length
  };
}

function selectMrvCell(grid: SudokuGrid): { cell: number; candidates: number[] } | null {
  let selected: { cell: number; candidates: number[] } | null = null;
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (grid[cell] !== 0) continue;
    const candidates = candidateValues(grid, cell);
    if (!candidates.length) return { cell, candidates };
    if (!selected || candidates.length < selected.candidates.length) selected = { cell, candidates };
    if (selected.candidates.length === 1) break;
  }
  return selected;
}

export function countMiniSolutions(input: SudokuGrid, limit = 2): number {
  if (!isValidMiniGrid(input) || !Number.isInteger(limit) || limit < 1) return 0;
  const grid = [...input];
  let count = 0;
  const search = () => {
    if (count >= limit) return;
    const next = selectMrvCell(grid);
    if (!next) {
      count++;
      return;
    }
    if (!next.candidates.length) return;
    for (const value of next.candidates) {
      grid[next.cell] = value;
      search();
      grid[next.cell] = 0;
      if (count >= limit) return;
    }
  };
  search();
  return count;
}

function generateSolution(random: RandomSource): SudokuGrid {
  const bands = shuffled([0, 1], random);
  const stacks = shuffled([0, 1], random);
  const rows = bands.flatMap(band => shuffled([0, 1], random).map(row => band * 2 + row));
  const columns = stacks.flatMap(stack => shuffled([0, 1], random).map(column => stack * 2 + column));
  const digits = shuffled(DIGITS, random);
  const pattern = (row: number, column: number) => (row * 2 + Math.floor(row / 2) + column) % SIZE;
  return rows.flatMap(row => columns.map(column => digits[pattern(row, column)]));
}

interface LogicalResult {
  nakedSingles: number;
  hiddenSingles: number;
  valid: boolean;
}

function measureLogicalRounds(input: SudokuGrid): number {
  const grid = [...input];
  let rounds = 0;
  while (grid.includes(0)) {
    const moves: Array<readonly [number, number]> = [];
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (grid[cell] !== 0) continue;
      const options = candidateValues(grid, cell);
      if (options.length === 1) moves.push([cell, options[0]]);
    }
    if (!moves.length) break;
    for (const [cell, value] of moves) grid[cell] = value;
    rounds++;
    if (!isValidMiniGrid(grid)) break;
  }
  return rounds;
}

function applyLogicalSingles(grid: SudokuGrid): LogicalResult {
  let nakedSingles = 0;
  let hiddenSingles = 0;
  while (grid.includes(0)) {
    let move: readonly [number, number] | undefined;
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (grid[cell] !== 0) continue;
      const options = candidateValues(grid, cell);
      if (!options.length) return { nakedSingles, hiddenSingles, valid: false };
      if (options.length === 1) {
        move = [cell, options[0]];
        break;
      }
    }
    if (move) {
      grid[move[0]] = move[1];
      nakedSingles++;
      continue;
    }

    for (const unit of UNITS) {
      for (const digit of DIGITS) {
        if (unit.some(cell => grid[cell] === digit)) continue;
        const possible = unit.filter(cell => grid[cell] === 0 && candidateValues(grid, cell).includes(digit));
        if (possible.length === 1) {
          move = [possible[0], digit];
          break;
        }
      }
      if (move) break;
    }
    if (!move) break;
    grid[move[0]] = move[1];
    hiddenSingles++;
  }
  return { nakedSingles, hiddenSingles, valid: isValidMiniGrid(grid) };
}

function measureSearch(input: SudokuGrid): Pick<SudokuMetrics, 'branchNodes' | 'backtracks' | 'maxDepth'> {
  const metrics = { branchNodes: 0, backtracks: 0, maxDepth: 0 };
  const search = (grid: SudokuGrid, depth: number): boolean => {
    const working = [...grid];
    if (!applyLogicalSingles(working).valid) return false;
    const next = selectMrvCell(working);
    if (!next) return true;
    if (next.candidates.length < 2) return false;
    metrics.branchNodes++;
    const nextDepth = depth + 1;
    metrics.maxDepth = Math.max(metrics.maxDepth, nextDepth);
    for (const value of next.candidates) {
      const child = [...working];
      child[next.cell] = value;
      if (search(child, nextDepth)) return true;
      metrics.backtracks++;
    }
    return false;
  };
  search(input, 0);
  return metrics;
}

export function analyzeMiniSudoku(input: SudokuGrid): SudokuMetrics {
  if (!isValidMiniGrid(input)) throw new Error('无法分析不合法的 4×4 数独棋盘');
  const clueCount = input.filter(Boolean).length;
  const unitDistribution = measureInitialUnitDistribution(input);
  const friendly = measureFriendlyProgress(input);
  const logicalRounds = measureLogicalRounds(input);
  const candidatePressure = input.reduce((sum, value, cell) =>
    value === 0 ? sum + Math.max(0, candidateValues(input, cell).length - 1) : sum, 0);
  const logicalGrid = [...input];
  const logical = applyLogicalSingles(logicalGrid);
  const unresolvedAfterLogic = logicalGrid.filter(value => value === 0).length;
  const search = unresolvedAfterLogic ? measureSearch(logicalGrid) : { branchNodes: 0, backtracks: 0, maxDepth: 0 };
  const blanks = CELL_COUNT - clueCount;
  const score = blanks * 10 +
    logical.nakedSingles * 2 +
    logical.hiddenSingles * 12 +
    logicalRounds * 5 +
    candidatePressure * 2 +
    unresolvedAfterLogic * 5 +
    search.branchNodes * 60 +
    search.backtracks * 90 +
    search.maxDepth * 110;
  return {
    clueCount,
    ...unitDistribution,
    ...friendly,
    nakedSingles: logical.nakedSingles,
    hiddenSingles: logical.hiddenSingles,
    logicalRounds,
    candidatePressure,
    unresolvedAfterLogic,
    ...search,
    score
  };
}

function everyRowAndColumnHasBlank(grid: SudokuGrid): boolean {
  for (let index = 0; index < SIZE; index++) {
    if (!grid.slice(index * SIZE, index * SIZE + SIZE).includes(0)) return false;
    if (!Array.from({ length: SIZE }, (_, row) => grid[row * SIZE + index]).includes(0)) return false;
  }
  return true;
}

function meetsMiniDifficulty(metrics: SudokuMetrics, difficulty: MiniSudokuDifficulty): boolean {
  if (metrics.branchNodes !== 0 || metrics.unresolvedAfterLogic !== 0) return false;
  if (difficulty === 'starter') return metrics.clueCount === 10 && metrics.hiddenSingles === 0 && metrics.logicalRounds <= 1;
  if (difficulty === 'basic') return metrics.clueCount === 8 && metrics.logicalRounds >= 2;
  return metrics.clueCount >= 6 && metrics.clueCount <= 7 && metrics.logicalRounds >= 3;
}

export function generateMiniSudoku(
  difficultyOrRandom: MiniSudokuDifficulty | RandomSource = 'starter',
  suppliedRandom: RandomSource = Math.random
): { puzzle: SudokuGrid; solution: SudokuGrid; metrics: SudokuMetrics } {
  const difficulty = typeof difficultyOrRandom === 'function' ? 'starter' : difficultyOrRandom;
  const random = typeof difficultyOrRandom === 'function' ? difficultyOrRandom : suppliedRandom;
  const targetClues = difficulty === 'starter' ? 10 : difficulty === 'basic' ? 8 : 6;

  for (let attempt = 0; attempt < 240; attempt++) {
    const solution = generateSolution(random);
    const puzzle = [...solution];
    const diagonalGroups: Array<readonly number[]> = [];
    for (let row = 0; row < SIZE; row++) {
      for (let column = row; column < SIZE; column++) {
        diagonalGroups.push(row === column
          ? [row * SIZE + column]
          : [row * SIZE + column, column * SIZE + row]);
      }
    }
    const removalGroups: ReadonlyArray<readonly number[]> = difficulty === 'challenge'
      ? shuffled(diagonalGroups, random)
      : shuffled(Array.from({ length: 8 }, (_, cell) => [cell, 15 - cell] as const), random);
    let clues = CELL_COUNT;
    for (const cells of removalGroups) {
      if (clues <= targetClues) break;
      if (clues - cells.length < targetClues) continue;
      const previous = cells.map(cell => puzzle[cell]);
      for (const cell of cells) puzzle[cell] = 0;
      if (countMiniSolutions(puzzle, 2) === 1) clues -= cells.length;
      else cells.forEach((cell, index) => { puzzle[cell] = previous[index]; });
    }
    if (clues !== targetClues || !everyRowAndColumnHasBlank(puzzle)) continue;
    const metrics = analyzeMiniSudoku(puzzle);
    if (meetsMiniDifficulty(metrics, difficulty)) return { puzzle, solution, metrics };
  }
  throw new Error(`暂时无法生成${difficulty === 'starter' ? '启蒙' : difficulty === 'basic' ? '基础' : '挑战'} 4×4 数独，请重试`);
}
