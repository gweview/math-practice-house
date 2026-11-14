import type {
  SudokuConfig,
  SudokuDifficulty,
  SudokuDifficultyProfile,
  SudokuSelection,
  SudokuSize
} from './types';
import { createVersionedStorage, type StorageLike } from '../../shared/storage/versioned-storage';

export const SUDOKU_DIFFICULTIES: readonly SudokuDifficulty[] = [
  'starter', 'basic', 'entry', 'easy', 'standard', 'advanced', 'challenge'
];

export const SUDOKU_DIFFICULTY_PROFILES: readonly SudokuDifficultyProfile[] = [
  {
    size: 4,
    difficulty: 'starter',
    label: '启蒙 4×4',
    description: '保留较多提示，只需寻找一眼可见的唯一数字。',
    minClues: 10,
    maxClues: 10,
    targetClues: 10,
    minScore: 65,
    maxHiddenSingles: 0,
    maxLogicalRounds: 1,
    maxBranchNodes: 0,
    maxUnresolvedAfterLogic: 0
  },
  {
    size: 4,
    difficulty: 'basic',
    label: '基础 4×4',
    description: '提示适中，需要连续观察行、列和 2×2 小宫。',
    minClues: 8,
    maxClues: 8,
    targetClues: 8,
    minScore: 85,
    minLogicalRounds: 2,
    maxBranchNodes: 0,
    maxUnresolvedAfterLogic: 0
  },
  {
    size: 4,
    difficulty: 'challenge',
    label: '挑战 4×4',
    description: '提示更少，需要连续完成至少三轮行、列和小宫观察。',
    minClues: 6,
    maxClues: 7,
    targetClues: 6,
    minScore: 115,
    minLogicalRounds: 3,
    maxBranchNodes: 0,
    maxUnresolvedAfterLogic: 0
  },
  {
    size: 9,
    difficulty: 'entry',
    label: '入门 9×9',
    description: '第一次玩 9×9：只留 16 个空格，每行、列和宫都只缺 1～2 格。',
    minClues: 63,
    maxClues: 67,
    targetClues: 65,
    minScore: 180,
    minInitialFriendlyMoves: 6,
    minInitialFriendlyUnits: 6,
    minInitialFriendlyRows: 2,
    minInitialFriendlyColumns: 2,
    minInitialFriendlyBoxes: 2,
    maxInitialCompleteUnits: 0,
    maxUnitBlanks: 2,
    minFriendlySingles: 16,
    maxUnresolvedAfterFriendly: 0,
    maxHiddenSingles: 0,
    maxLogicalRounds: 2,
    maxBranchNodes: 0,
    maxUnresolvedAfterLogic: 0
  },
  {
    size: 9,
    difficulty: 'easy',
    label: '简单 9×9',
    description: '只留 20 个空格，三种区域都有直接起点，再练习简单交叉排除。',
    minClues: 59,
    maxClues: 63,
    targetClues: 61,
    minScore: 220,
    minInitialFriendlyMoves: 4,
    minInitialFriendlyUnits: 6,
    minInitialFriendlyRows: 2,
    minInitialFriendlyColumns: 2,
    minInitialFriendlyBoxes: 2,
    maxInitialCompleteUnits: 0,
    maxUnitBlanks: 3,
    minFriendlySingles: 8,
    maxHiddenSingles: 0,
    maxLogicalRounds: 4,
    maxBranchNodes: 0,
    maxUnresolvedAfterLogic: 0
  },
  {
    size: 9,
    difficulty: 'standard',
    label: '标准 9×9',
    description: '只留 24 个空格，仍从明显缺数开始，全程不用隐性技巧或猜测。',
    minClues: 55,
    maxClues: 59,
    targetClues: 57,
    minScore: 270,
    minInitialFriendlyMoves: 2,
    minInitialFriendlyUnits: 6,
    minInitialFriendlyRows: 2,
    minInitialFriendlyColumns: 2,
    minInitialFriendlyBoxes: 2,
    maxInitialCompleteUnits: 0,
    maxUnitBlanks: 4,
    minFriendlySingles: 4,
    maxHiddenSingles: 0,
    maxLogicalRounds: 5,
    maxBranchNodes: 0,
    maxUnresolvedAfterLogic: 0
  },
  {
    size: 9,
    difficulty: 'advanced',
    label: '提高 9×9',
    description: '单数策略无法完全解出，至少出现一个稳定的候选决策点。',
    minClues: 28,
    maxClues: 33,
    targetClues: 31,
    minScore: 1_050,
    minBranchNodes: 1,
    maxBranchNodes: 1,
    minDepth: 1,
    minUnresolvedAfterLogic: 2
  },
  {
    size: 9,
    difficulty: 'challenge',
    label: '挑战 9×9',
    description: '提示最少，需要连续处理多个候选决策点。',
    minClues: 24,
    maxClues: 30,
    targetClues: 29,
    minScore: 1_450,
    minBranchNodes: 2,
    minDepth: 2,
    minUnresolvedAfterLogic: 4
  }
];

export const DEFAULT_SUDOKU_CONFIG: SudokuConfig = {
  selections: [{ size: 4, difficulty: 'starter', count: 1 }],
  answerPage: true,
  fields: { name: true, date: true, time: true },
  orientation: 'auto',
  density: 'comfortable'
};

export const SUDOKU_STORAGE_KEY = 'math-worksheet-sudoku-config-v2';
export const SUDOKU_LEGACY_STORAGE_KEY = 'math-worksheet-sudoku-config-v1';

export const MAX_SUDOKU_SELECTION_COUNT = 12;
export const MAX_SUDOKU_TOTAL_COUNT = 12;

export function isSudokuSize(value: unknown): value is SudokuSize {
  return value === 4 || value === 9;
}

export function isSudokuDifficulty(value: unknown): value is SudokuDifficulty {
  return typeof value === 'string' && SUDOKU_DIFFICULTIES.includes(value as SudokuDifficulty);
}

export function getSudokuDifficultyProfile(
  size: SudokuSize,
  difficulty: SudokuDifficulty
): SudokuDifficultyProfile | undefined {
  return SUDOKU_DIFFICULTY_PROFILES.find(profile => profile.size === size && profile.difficulty === difficulty);
}

export function getSudokuDifficultyProfiles(size: SudokuSize): readonly SudokuDifficultyProfile[] {
  return SUDOKU_DIFFICULTY_PROFILES.filter(profile => profile.size === size);
}

export function isSudokuDifficultyForSize(size: SudokuSize, difficulty: SudokuDifficulty): boolean {
  return getSudokuDifficultyProfile(size, difficulty) !== undefined;
}

export function validateSudokuSelection(value: unknown): value is SudokuSelection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Partial<SudokuSelection>;
  return isSudokuSize(raw.size) &&
    isSudokuDifficulty(raw.difficulty) &&
    isSudokuDifficultyForSize(raw.size, raw.difficulty) &&
    Number.isInteger(raw.count) &&
    (raw.count ?? 0) >= 1 &&
    (raw.count ?? 0) <= MAX_SUDOKU_SELECTION_COUNT;
}

export const isValidSudokuSelection = validateSudokuSelection;

function cloneDefaultConfig(): SudokuConfig {
  return {
    ...DEFAULT_SUDOKU_CONFIG,
    selections: DEFAULT_SUDOKU_CONFIG.selections.map(selection => ({ ...selection })),
    fields: { ...DEFAULT_SUDOKU_CONFIG.fields }
  };
}

function normalizeSelections(raw: Record<string, unknown>): SudokuSelection[] {
  if (Array.isArray(raw.selections)) {
    const selections: SudokuSelection[] = [];
    let total = 0;
    for (const value of raw.selections) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const candidate = value as Partial<SudokuSelection>;
      if (!isSudokuSize(candidate.size) || !isSudokuDifficulty(candidate.difficulty) ||
        !isSudokuDifficultyForSize(candidate.size, candidate.difficulty) ||
        !Number.isInteger(candidate.count) || (candidate.count ?? 0) < 1) continue;
      const remaining = MAX_SUDOKU_TOTAL_COUNT - total;
      if (remaining <= 0) break;
      const count = Math.min(candidate.count as number, remaining);
      const existing = selections.find(selection =>
        selection.size === candidate.size && selection.difficulty === candidate.difficulty);
      if (existing) existing.count += count;
      else selections.push({ size: candidate.size, difficulty: candidate.difficulty, count });
      total += count;
    }
    if (selections.length) return selections;
  }

  // V1 persisted { difficulty, count } configs remain usable after the V2 upgrade.
  if (isSudokuDifficulty(raw.difficulty)) {
    const size: SudokuSize = raw.difficulty === 'starter' || raw.difficulty === 'basic' ? 4 : 9;
    const count = Number.isInteger(raw.count) && (raw.count as number) >= 1
      ? Math.min(raw.count as number, MAX_SUDOKU_TOTAL_COUNT)
      : 1;
    if (isSudokuDifficultyForSize(size, raw.difficulty)) return [{ size, difficulty: raw.difficulty, count }];
  }

  return DEFAULT_SUDOKU_CONFIG.selections.map(selection => ({ ...selection }));
}

export function normalizeSudokuConfig(input: unknown): SudokuConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return cloneDefaultConfig();
  const raw = input as Record<string, unknown>;
  const fieldsRaw = raw.fields && typeof raw.fields === 'object' && !Array.isArray(raw.fields)
    ? raw.fields as Record<string, unknown>
    : {};

  return {
    selections: normalizeSelections(raw),
    answerPage: typeof raw.answerPage === 'boolean' ? raw.answerPage : DEFAULT_SUDOKU_CONFIG.answerPage,
    fields: {
      name: typeof fieldsRaw.name === 'boolean' ? fieldsRaw.name : DEFAULT_SUDOKU_CONFIG.fields.name,
      date: typeof fieldsRaw.date === 'boolean' ? fieldsRaw.date : DEFAULT_SUDOKU_CONFIG.fields.date,
      time: typeof fieldsRaw.time === 'boolean' ? fieldsRaw.time : DEFAULT_SUDOKU_CONFIG.fields.time
    },
    orientation: raw.orientation === 'portrait' || raw.orientation === 'landscape' || raw.orientation === 'auto'
      ? raw.orientation
      : DEFAULT_SUDOKU_CONFIG.orientation,
    density: raw.density === 'compact' || raw.density === 'comfortable'
      ? raw.density
      : DEFAULT_SUDOKU_CONFIG.density
  };
}

/** Versioned, best-effort persistence for the Sudoku draft configuration. */
export function createSudokuConfigStorage(storage?: StorageLike) {
  const versioned = createVersionedStorage<SudokuConfig>({
    key: SUDOKU_STORAGE_KEY,
    version: 2,
    legacyKeys: [SUDOKU_LEGACY_STORAGE_KEY],
    defaults: cloneDefaultConfig,
    normalize: normalizeSudokuConfig,
    migrate: value => value,
    storage
  });
  return versioned;
}
