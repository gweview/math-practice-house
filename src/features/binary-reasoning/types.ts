export type ReasoningMethod = 'sameValue' | 'substitution' | 'sumDifference' | 'chain';
export type ReasoningDifficulty = 'entry' | 'easy' | 'standard' | 'advanced' | 'challenge';
export type ReasoningStage = 'preschool' | 'grade1' | 'grade2' | 'grade3';
export type SymbolId = 'apple' | 'star' | 'flower' | 'pencil' | 'balloon' | 'bear';
export type VariableId = 'a' | 'b';

export interface LinearEquation {
  a: number;
  b: number;
  total: number;
}

export interface ReasoningMetrics {
  maxValue: number;
  maxTotal: number;
  equationCount: number;
  reasoningSteps: number;
  usesDifference: boolean;
}

export interface ReasoningProblem {
  id: string;
  method: ReasoningMethod;
  symbols: Record<VariableId, SymbolId>;
  values: Record<VariableId, number>;
  equations: LinearEquation[];
  ask: VariableId[];
  answers: Partial<Record<VariableId, number>>;
  steps: string[];
  signature: string;
  metrics: ReasoningMetrics;
}

export interface BinaryReasoningConfig {
  stage: ReasoningStage;
  difficulty: ReasoningDifficulty;
  methods: ReasoningMethod[];
  count: number;
  randomMix: boolean;
  allowDuplicates: boolean;
  answerPage: boolean;
  fields: { name: boolean; date: boolean; time: boolean };
  orientation: 'portrait' | 'landscape';
  fontSize: 'standard' | 'large';
}

export interface BinaryDifficultyProfile {
  difficulty: ReasoningDifficulty;
  label: string;
  description: string;
  maxValue: number;
  maxTotal: number;
  maxCoefficient: number;
  maxSteps: number;
}
