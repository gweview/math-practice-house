export type StudioMode = 'math' | 'sudoku' | 'binaryReasoning';
export type PrintTarget = 'math' | 'sudoku' | 'binary-reasoning';

export interface StudioModeOption {
  id: StudioMode;
  label: string;
  icon: string;
}

export const STUDIO_MODES: readonly StudioModeOption[] = [
  { id: 'math', label: '数学练习', icon: '＋' },
  { id: 'sudoku', label: '数独练习', icon: '▦' },
  { id: 'binaryReasoning', label: '二元推算', icon: '◇' }
];
