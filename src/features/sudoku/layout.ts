import type { SudokuConfig, SudokuPuzzle } from './types';

export type SudokuSheetOrientation = 'portrait' | 'landscape';
export type SudokuSheetTemplate = 'single' | 'double' | 'quad' | 'six' | 'mixed';
export type SudokuSheetKind = 'questions' | 'answers';

export interface SudokuSheetSlot {
  /** The generated puzzle. Question sheets use `puzzle`; answer sheets use `solution`. */
  puzzle: SudokuPuzzle;
  /** Stable, one-based position in the workbook's visual reading order. */
  puzzleNumber: number;
  /** Physical board edge length. Consumers should render this value in millimetres. */
  boardSizeMm: number;
  size: 4 | 9;
  /** Mixed sheets use this to place the large board without reordering puzzle numbers. */
  area: 'standard' | 'primary' | 'secondary';
}

export interface SudokuSheet {
  /** Deterministic within one plan; useful as a React key and print-page identifier. */
  id: string;
  kind: SudokuSheetKind;
  orientation: SudokuSheetOrientation;
  template: SudokuSheetTemplate;
  slots: SudokuSheetSlot[];
}

type SudokuDensity = 'comfortable' | 'compact';

interface IndexedPuzzle {
  puzzle: SudokuPuzzle;
  puzzleNumber: number;
}

const QUESTION_BOARD_SIZES = {
  4: {
    single: 112,
    double: 92,
    quad: 80,
    six: 74
  },
  9: {
    single: { portrait: 164, landscape: 150 },
    double: { portrait: 119, landscape: 124 },
    quad: 99,
    six: 99
  }
} as const;

const ANSWER_BOARD_SIZES = {
  4: {
    single: 80,
    double: 68,
    quad: 60,
    six: 52
  },
  9: {
    single: 108,
    double: 90,
    quad: 74,
    six: 74
  }
} as const;

function isMixedGroup(items: readonly IndexedPuzzle[]): boolean {
  if (items.length < 3) return false;
  let miniCount = 0;
  let classicCount = 0;
  for (let index = 0; index < 3; index++) {
    if (items[index].puzzle.size === 4) miniCount++;
    else classicCount++;
  }
  return miniCount === 2 && classicCount === 1;
}

function orderMixedGroupForReading(items: readonly IndexedPuzzle[]): IndexedPuzzle[] {
  return [
    ...items.filter(item => item.puzzle.size === 9),
    ...items.filter(item => item.puzzle.size === 4)
  ];
}

function containsPlannedMixedGroup(
  items: readonly IndexedPuzzle[],
  density: SudokuDensity
): boolean {
  let cursor = 0;
  while (cursor < items.length) {
    const remaining = items.slice(cursor);
    if (isMixedGroup(remaining)) return true;

    const size = items[cursor].puzzle.size;
    const capacity = capacityFor(size, 'questions', density);
    let groupLength = 0;
    while (
      cursor + groupLength < items.length &&
      groupLength < capacity &&
      items[cursor + groupLength].puzzle.size === size
    ) {
      groupLength++;
    }
    cursor += groupLength;
  }
  return false;
}

function resolveOrientation(
  items: readonly IndexedPuzzle[],
  requested: SudokuConfig['orientation'],
  density: SudokuDensity
): SudokuSheetOrientation {
  if (requested === 'portrait' || requested === 'landscape') return requested;

  // One 9×9 beside two stacked 4×4 boards is the most natural mixed layout.
  if (containsPlannedMixedGroup(items, density)) return 'landscape';

  // Two full-size 9×9 boards remain comfortably writable side by side.
  const classicCount = items.filter(item => item.puzzle.size === 9).length;
  return classicCount >= 2 ? 'landscape' : 'portrait';
}

function templateForCount(count: number): SudokuSheetTemplate {
  if (count === 1) return 'single';
  if (count === 2) return 'double';
  if (count <= 4) return 'quad';
  return 'six';
}

function boardSizeFor(
  size: 4 | 9,
  kind: SudokuSheetKind,
  template: SudokuSheetTemplate,
  orientation: SudokuSheetOrientation
): number {
  if (template === 'mixed') {
    if (kind === 'questions') return size === 9 ? 126 : 74;
    return size === 9 ? 108 : 60;
  }

  if (kind === 'answers') return ANSWER_BOARD_SIZES[size][template];
  const questionSize = QUESTION_BOARD_SIZES[size][template];
  return typeof questionSize === 'number' ? questionSize : questionSize[orientation];
}

function makeSheet(
  items: readonly IndexedPuzzle[],
  kind: SudokuSheetKind,
  orientation: SudokuSheetOrientation,
  template: SudokuSheetTemplate,
  pageIndex: number
): SudokuSheet {
  const numberRange = items.map(item => item.puzzleNumber).join('-');
  return {
    id: `${kind}-${pageIndex + 1}-${numberRange}`,
    kind,
    orientation,
    template,
    slots: items.map(item => ({
      puzzle: item.puzzle,
      puzzleNumber: item.puzzleNumber,
      boardSizeMm: boardSizeFor(item.puzzle.size, kind, template, orientation),
      size: item.puzzle.size,
      area: template === 'mixed'
        ? item.puzzle.size === 9 ? 'primary' : 'secondary'
        : 'standard'
    }))
  };
}

function capacityFor(size: 4 | 9, kind: SudokuSheetKind, density: SudokuDensity): number {
  if (kind === 'answers') return size === 9 ? 4 : 6;
  if (size === 9) return 2;
  return density === 'compact' ? 6 : 4;
}

function planSection(
  items: readonly IndexedPuzzle[],
  kind: SudokuSheetKind,
  orientation: SudokuSheetOrientation,
  density: SudokuDensity
): SudokuSheet[] {
  const sheets: SudokuSheet[] = [];
  let cursor = 0;

  while (cursor < items.length) {
    const remaining = items.slice(cursor);
    const canUseMixed = isMixedGroup(remaining) &&
      (kind === 'questions' || remaining[0].puzzle.size === 9);
    if (canUseMixed) {
      const group = orderMixedGroupForReading(remaining.slice(0, 3));
      sheets.push(makeSheet(group, kind, orientation, 'mixed', sheets.length));
      cursor += group.length;
      continue;
    }

    const size = items[cursor].puzzle.size;
    const capacity = capacityFor(size, kind, density);
    const group: IndexedPuzzle[] = [];
    while (
      cursor + group.length < items.length &&
      group.length < capacity &&
      items[cursor + group.length].puzzle.size === size
    ) {
      group.push(items[cursor + group.length]);
    }

    const template = templateForCount(group.length);
    sheets.push(makeSheet(group, kind, orientation, template, sheets.length));
    cursor += group.length;
  }

  return sheets;
}

function renumberQuestionSheets(sheets: readonly SudokuSheet[]): SudokuSheet[] {
  let nextNumber = 1;
  return sheets.map((sheet, pageIndex) => {
    const slots = sheet.slots.map(slot => ({ ...slot, puzzleNumber: nextNumber++ }));
    const numberRange = slots.map(slot => slot.puzzleNumber).join('-');
    return { ...sheet, id: `questions-${pageIndex + 1}-${numberRange}`, slots };
  });
}

/**
 * Plans generated puzzles into physical print sheets without mutating the puzzles or config.
 * Question sheets always precede answer sheets. A single resolved orientation is shared by
 * every sheet so browsers do not have to switch `@page` orientation inside one print job.
 */
export function planSudokuSheets(
  puzzles: readonly SudokuPuzzle[],
  config: SudokuConfig
): SudokuSheet[] {
  const items = puzzles.map((puzzle, index) => ({ puzzle, puzzleNumber: index + 1 }));
  if (items.length === 0) return [];

  const density = config.density === 'compact' ? 'compact' : 'comfortable';
  const orientation = resolveOrientation(items, config.orientation, density);
  const questions = renumberQuestionSheets(
    planSection(items, 'questions', orientation, density)
  );
  if (!config.answerPage) return questions;
  const answerItems = questions.flatMap(sheet => sheet.slots.map(slot => ({
    puzzle: slot.puzzle,
    puzzleNumber: slot.puzzleNumber
  })));
  return [...questions, ...planSection(answerItems, 'answers', orientation, density)];
}
