import { useState } from 'react';
import AppShell from './app/AppShell';
import type { StudioMode } from './app/app-config';
import { printTarget } from './app/print';
import BinaryReasoningStudio from './features/binary-reasoning/BinaryReasoningStudio';
import SudokuStudio from './features/sudoku/SudokuStudio';
import MathWorksheetBuilder from './features/worksheet-builder/MathWorksheetBuilder';

export default function App() {
  const [mode, setMode] = useState<StudioMode>('math');
  return <AppShell mode={mode} onModeChange={setMode}>
      <MathWorksheetBuilder active={mode === 'math'} onPrint={() => printTarget('math')} />
      <SudokuStudio active={mode === 'sudoku'} onPrint={() => printTarget('sudoku')} />
      <BinaryReasoningStudio active={mode === 'binaryReasoning'} onPrint={() => printTarget('binary-reasoning')} />
  </AppShell>;
}
