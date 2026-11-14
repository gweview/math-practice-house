export type SudokuSize = 4 | 9;

export type SudokuDifficulty =
  | 'starter'
  | 'basic'
  | 'entry'
  | 'easy'
  | 'standard'
  | 'advanced'
  | 'challenge';

export type SudokuGrid = number[];

export interface SudokuMetrics {
  clueCount: number;
  /** Obvious starting cells where a row, column, or box has one blank left. */
  initialFriendlyMoves: number;
  /** One-blank rows, columns, and boxes available before the first move. */
  initialFriendlyUnits: number;
  initialFriendlyRows: number;
  initialFriendlyColumns: number;
  initialFriendlyBoxes: number;
  /** Fully prefilled units at the start; useful worksheets keep this at zero. */
  initialCompleteUnits: number;
  /** Largest number of blanks in any starting row, column, or box. */
  maximumUnitBlanks: number;
  /** Cells completed by repeatedly filling those one-blank units. */
  friendlySingles: number;
  /** Simultaneous full-house waves completed before that strategy stalls. */
  friendlyRounds: number;
  /** Cells still blank after the child-friendly full-house strategy stalls. */
  unresolvedAfterFriendly: number;
  nakedSingles: number;
  hiddenSingles: number;
  /** Number of simultaneous logical fill waves needed before logic stalls. */
  logicalRounds: number;
  /** Sum of extra initial candidates beyond one for every blank cell. */
  candidatePressure: number;
  /** Cells that cannot be completed by naked/hidden singles alone. */
  unresolvedAfterLogic: number;
  /** Decision nodes visited by the deterministic MRV search. */
  branchNodes: number;
  /** Failed candidates encountered by the deterministic MRV search. */
  backtracks: number;
  /** Maximum number of nested decisions, rather than recursive cell depth. */
  maxDepth: number;
  score: number;
}

export interface SudokuPuzzle {
  id: string;
  puzzle: SudokuGrid;
  solution: SudokuGrid;
  difficulty: SudokuDifficulty;
  metrics: SudokuMetrics;
  size: SudokuSize;
  boxRows: 2 | 3;
  boxColumns: 2 | 3;
}

export interface SudokuSelection {
  size: SudokuSize;
  difficulty: SudokuDifficulty;
  count: number;
}

export interface SudokuConfig {
  selections: SudokuSelection[];
  answerPage: boolean;
  fields: { name: boolean; date: boolean; time: boolean };
  orientation: 'auto' | 'portrait' | 'landscape';
  density: 'comfortable' | 'compact';
}

export interface SudokuDifficultyProfile {
  size: SudokuSize;
  difficulty: SudokuDifficulty;
  label: string;
  description: string;
  minClues: number;
  maxClues: number;
  targetClues: number;
  minScore: number;
  minInitialFriendlyMoves?: number;
  minInitialFriendlyUnits?: number;
  minInitialFriendlyRows?: number;
  minInitialFriendlyColumns?: number;
  minInitialFriendlyBoxes?: number;
  maxInitialCompleteUnits?: number;
  maxUnitBlanks?: number;
  minFriendlySingles?: number;
  maxUnresolvedAfterFriendly?: number;
  minHiddenSingles?: number;
  maxHiddenSingles?: number;
  minLogicalRounds?: number;
  maxLogicalRounds?: number;
  minBranchNodes?: number;
  minDepth?: number;
  maxBranchNodes?: number;
  minUnresolvedAfterLogic?: number;
  maxUnresolvedAfterLogic?: number;
}
