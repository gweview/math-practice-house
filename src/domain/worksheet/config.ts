import type { Grade } from '../curriculum/types';
import type { Difficulty, ProblemType } from '../questions/problem-type';
import type { Question } from '../questions/model';

export type Stage = Grade;
export type RangeMode = 'curriculum' | 'free';
export type PracticeMode = 'standard' | 'verticalAddSub' | 'verticalMulDiv';
export type GenerationMode = 'count' | 'pages';
export type AnswerMode = 'none' | 'compact' | 'detailed';
export type OrderingMode = 'random' | 'grouped' | 'progressive';
export type WorksheetPresetId =
  | 'daily' | 'calculation' | 'comprehensive' | 'application'
  | 'geometry' | 'data' | 'challenge' | 'custom';
export type VerticalOperation = 'addition' | 'subtraction' | 'multiplication' | 'division';

export const VERTICAL_PAGE_SIZE = 8;
export const MAX_VERTICAL_PAGES = 5;

export interface WorksheetConfig {
  stage: Stage;
  rangeMode: RangeMode;
  difficulty: Difficulty;
  practiceMode: PracticeMode;
  types: ProblemType[];
  count: number;
  verticalOperations: VerticalOperation[];
  verticalPages: number;
  showNumbers: boolean;
  showLines: boolean;
  answerPage: boolean;
  allowDuplicates: boolean;
  randomMix: boolean;
  fields: { name: boolean; date: boolean; time: boolean; score: boolean; streak: boolean };
  orientation: 'portrait' | 'landscape';
  fontSize: 'standard' | 'large';
  seed?: string;
  generationMode?: GenerationMode;
  pageTarget?: 1 | 2;
  answerMode?: AnswerMode;
  ordering?: OrderingMode;
  preset?: WorksheetPresetId;
  typeWeights?: Partial<Record<ProblemType, number>>;
  typeDifficulties?: Partial<Record<ProblemType, Difficulty>>;
  difficultyDistribution?: Partial<Record<Difficulty, number>>;
}

export interface Worksheet {
  questions: Question[];
  createdAt: string;
  config: WorksheetConfig;
  seed: string;
}
