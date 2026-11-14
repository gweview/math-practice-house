import type { BinaryReasoningConfig, ReasoningProblem } from './types';

export interface ReasoningSheetSlot {
  problem: ReasoningProblem;
  number: number;
}

export interface ReasoningSheet {
  id: string;
  kind: 'questions' | 'answers';
  orientation: BinaryReasoningConfig['orientation'];
  slots: ReasoningSheetSlot[];
  isLast: boolean;
}

function capacity(kind: ReasoningSheet['kind'], config: BinaryReasoningConfig): number {
  if (kind === 'answers') {
    if (config.orientation === 'landscape') return config.fontSize === 'large' ? 6 : 8;
    return config.fontSize === 'large' ? 4 : 5;
  }
  if (config.orientation === 'landscape') return config.fontSize === 'large' ? 8 : 10;
  return config.fontSize === 'large' ? 6 : 8;
}

function sheetsFor(kind: ReasoningSheet['kind'], problems: ReasoningProblem[], config: BinaryReasoningConfig): ReasoningSheet[] {
  const size = capacity(kind, config);
  const sheets: ReasoningSheet[] = [];
  for (let index = 0; index < problems.length; index += size) {
    sheets.push({
      id: `binary-${kind}-${sheets.length + 1}`,
      kind,
      orientation: config.orientation,
      slots: problems.slice(index, index + size).map((problem, offset) => ({ problem, number: index + offset + 1 })),
      isLast: false
    });
  }
  return sheets;
}

export function planReasoningSheets(problems: ReasoningProblem[], config: BinaryReasoningConfig): ReasoningSheet[] {
  const sheets = [
    ...sheetsFor('questions', problems, config),
    ...(config.answerPage ? sheetsFor('answers', problems, config) : [])
  ];
  if (sheets.length) sheets[sheets.length - 1].isLast = true;
  return sheets;
}
