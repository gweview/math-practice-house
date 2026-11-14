import type { SudokuGrid, SudokuMetrics } from './types';

const SIZE = 9;
const CELL_COUNT = 81;
const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;

function peers(cell: number): number[] {
  const row = Math.floor(cell / SIZE);
  const column = cell % SIZE;
  const boxRow = Math.floor(row / 3) * 3;
  const boxColumn = Math.floor(column / 3) * 3;
  const result = new Set<number>();
  for (let index = 0; index < SIZE; index++) {
    result.add(row * SIZE + index);
    result.add(index * SIZE + column);
    result.add((boxRow + Math.floor(index / 3)) * SIZE + boxColumn + index % 3);
  }
  result.delete(cell);
  return [...result];
}

const PEERS = Array.from({ length: CELL_COUNT }, (_, cell) => peers(cell));
const ROW_UNITS = Array.from({ length: SIZE }, (_, row) =>
  Array.from({ length: SIZE }, (_, column) => row * SIZE + column));
const COLUMN_UNITS = Array.from({ length: SIZE }, (_, column) =>
  Array.from({ length: SIZE }, (_, row) => row * SIZE + column));
const BOX_UNITS = Array.from({ length: SIZE }, (_, box) => {
  const startRow = Math.floor(box / 3) * 3;
  const startColumn = box % 3 * 3;
  return Array.from({ length: SIZE }, (_, index) =>
    (startRow + Math.floor(index / 3)) * SIZE + startColumn + index % 3);
});
const UNITS: number[][] = [...ROW_UNITS, ...COLUMN_UNITS, ...BOX_UNITS];

export interface SudokuUnitBlankCounts {
  rows: number[];
  columns: number[];
  boxes: number[];
}

export function getSudokuUnitBlankCounts(grid: SudokuGrid): SudokuUnitBlankCounts {
  if (!Array.isArray(grid) || grid.length !== CELL_COUNT) throw new Error('数独棋盘必须包含 81 个格子');
  const count = (units: number[][]) => units.map(unit => unit.filter(cell => grid[cell] === 0).length);
  return { rows: count(ROW_UNITS), columns: count(COLUMN_UNITS), boxes: count(BOX_UNITS) };
}

export function isValidGrid(grid: SudokuGrid, allowZero = true): boolean {
  if (!Array.isArray(grid) || grid.length !== CELL_COUNT) return false;
  if (grid.some(value => !Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > 9)) return false;
  for (const unit of UNITS) {
    const values = unit.map(cell => grid[cell]).filter(Boolean);
    if (new Set(values).size !== values.length) return false;
  }
  return true;
}

interface FriendlyProgress {
  initialFriendlyMoves: number;
  friendlySingles: number;
  friendlyRounds: number;
  unresolvedAfterFriendly: number;
}

function measureInitialUnitDistribution(input: SudokuGrid) {
  const counts = getSudokuUnitBlankCounts(input);
  const initialFriendlyRows = counts.rows.filter(value => value === 1).length;
  const initialFriendlyColumns = counts.columns.filter(value => value === 1).length;
  const initialFriendlyBoxes = counts.boxes.filter(value => value === 1).length;
  const allCounts = [...counts.rows, ...counts.columns, ...counts.boxes];
  return {
    initialFriendlyUnits: initialFriendlyRows + initialFriendlyColumns + initialFriendlyBoxes,
    initialFriendlyRows,
    initialFriendlyColumns,
    initialFriendlyBoxes,
    initialCompleteUnits: allCounts.filter(value => value === 0).length,
    maximumUnitBlanks: Math.max(...allCounts)
  };
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

function measureFriendlyProgress(input: SudokuGrid): FriendlyProgress {
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
    if (!isValidGrid(grid)) break;
  }
  return {
    initialFriendlyMoves,
    friendlySingles,
    friendlyRounds,
    unresolvedAfterFriendly: grid.filter(value => value === 0).length
  };
}

function candidateValues(grid: SudokuGrid, cell: number): number[] {
  if (grid[cell] !== 0) return [];
  const used = new Set(PEERS[cell].map(peer => grid[peer]).filter(Boolean));
  return DIGITS.filter(digit => !used.has(digit));
}

export function getCandidates(grid: SudokuGrid, cell: number): number[] {
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELL_COUNT || !isValidGrid(grid)) return [];
  return candidateValues(grid, cell);
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

export function solveSudoku(input: SudokuGrid): SudokuGrid | null {
  if (!isValidGrid(input)) return null;
  const grid = [...input];
  const search = (): boolean => {
    const next = selectMrvCell(grid);
    if (!next) return true;
    if (!next.candidates.length) return false;
    for (const digit of next.candidates) {
      grid[next.cell] = digit;
      if (search()) return true;
    }
    grid[next.cell] = 0;
    return false;
  };
  return search() ? grid : null;
}

export function countSolutions(input: SudokuGrid, limit = 2): number {
  if (!isValidGrid(input) || !Number.isInteger(limit) || limit < 1) return 0;
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
    for (const digit of next.candidates) {
      grid[next.cell] = digit;
      search();
      if (count >= limit) break;
    }
    grid[next.cell] = 0;
  };
  search();
  return count;
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
    const naked: Array<readonly [number, number]> = [];
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (grid[cell] !== 0) continue;
      const options = candidateValues(grid, cell);
      if (options.length === 1) naked.push([cell, options[0]]);
    }
    if (naked.length) {
      for (const [cell, digit] of naked) grid[cell] = digit;
      rounds++;
      if (!isValidGrid(grid)) break;
      continue;
    }

    const hidden = new Map<number, number>();
    for (const unit of UNITS) {
      for (const digit of DIGITS) {
        if (unit.some(cell => grid[cell] === digit)) continue;
        const possible = unit.filter(cell => grid[cell] === 0 && candidateValues(grid, cell).includes(digit));
        if (possible.length === 1 && (!hidden.has(possible[0]) || hidden.get(possible[0]) === digit)) {
          hidden.set(possible[0], digit);
        }
      }
    }
    if (!hidden.size) break;
    for (const [cell, digit] of hidden) grid[cell] = digit;
    rounds++;
    if (!isValidGrid(grid)) break;
  }
  return rounds;
}

/**
 * Applies one deterministic move at a time. This makes the technique counters
 * independent of batching and therefore suitable for stable difficulty gates.
 */
function applyLogicalSingles(grid: SudokuGrid): LogicalResult {
  let nakedSingles = 0;
  let hiddenSingles = 0;

  while (grid.includes(0)) {
    let move: readonly [number, number] | undefined;
    for (let cell = 0; cell < CELL_COUNT; cell++) {
      if (grid[cell] !== 0) continue;
      const candidates = candidateValues(grid, cell);
      if (!candidates.length) return { nakedSingles, hiddenSingles, valid: false };
      if (candidates.length === 1) {
        move = [cell, candidates[0]];
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
        let onlyCell = -1;
        let possibilities = 0;
        for (const cell of unit) {
          if (grid[cell] === 0 && candidateValues(grid, cell).includes(digit)) {
            onlyCell = cell;
            possibilities++;
            if (possibilities > 1) break;
          }
        }
        if (possibilities === 1) {
          move = [onlyCell, digit];
          break;
        }
      }
      if (move) break;
    }
    if (!move) break;
    grid[move[0]] = move[1];
    hiddenSingles++;
  }

  return { nakedSingles, hiddenSingles, valid: isValidGrid(grid) };
}

interface SearchMetrics {
  branchNodes: number;
  backtracks: number;
  maxDepth: number;
}

function measureSearch(input: SudokuGrid): SearchMetrics {
  const metrics: SearchMetrics = { branchNodes: 0, backtracks: 0, maxDepth: 0 };

  const search = (grid: SudokuGrid, depth: number): boolean => {
    const working = [...grid];
    const logical = applyLogicalSingles(working);
    if (!logical.valid) return false;
    const next = selectMrvCell(working);
    if (!next) return true;
    if (next.candidates.length < 2) return false;

    metrics.branchNodes++;
    const nextDepth = depth + 1;
    metrics.maxDepth = Math.max(metrics.maxDepth, nextDepth);
    for (const digit of next.candidates) {
      const child = [...working];
      child[next.cell] = digit;
      if (search(child, nextDepth)) return true;
      metrics.backtracks++;
    }
    return false;
  };

  search(input, 0);
  return metrics;
}

export function analyzeSudoku(input: SudokuGrid): SudokuMetrics {
  if (!isValidGrid(input)) throw new Error('无法分析不合法的数独棋盘');
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

  // Clues remain relevant, while technique and failed-search work have enough
  // weight to distinguish puzzles with an identical number of blanks.
  const score = blanks * 10 +
    logical.nakedSingles * 2 +
    logical.hiddenSingles * 12 +
    logicalRounds * 3 +
    candidatePressure * 2 +
    unresolvedAfterLogic * 5 +
    search.branchNodes * 90 +
    search.backtracks * 120 +
    search.maxDepth * 160;

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
