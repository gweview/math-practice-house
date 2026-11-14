import type { Difficulty, ProblemProfile, ProblemType, Question } from './model';
import type { CurriculumDomain, Grade } from '../curriculum/types';
import type { WorksheetConfig } from '../worksheet/config';
import type { RandomSource } from '../../shared/random/seeded-random';

export type ContentCategory = 'calculation' | 'concept' | 'geometry-measurement' | 'data' | 'application';

export type QuestionRenderKind =
  | 'expression' | 'equation' | 'choice' | 'word' | 'multiPart' | 'numberLine'
  | 'clock' | 'fractionVisual' | 'geometry' | 'table' | 'chart' | 'pictograph'
  | 'vertical' | 'longDivision';

export type QuestionGroupId =
  | 'number-comparison' | 'addition-subtraction' | 'multiplication-division'
  | 'mixed-operations' | 'fill-application' | 'measurement-geometry' | 'data-probability';

export interface PrintFootprint {
  columns: 1 | 2 | 3 | 'full';
  heightMm: Record<'standard' | 'large', number>;
  preventBreakInside: boolean;
}

export interface QuestionGenerationInput {
  type: ProblemType;
  config: WorksheetConfig;
  profile: ProblemProfile;
  random: RandomSource;
  createId: () => string;
  directive?: Readonly<Record<string, unknown>>;
}

export interface QuestionValidationResult {
  valid: boolean;
  errors: string[];
}

export type QuestionGenerator = (input: QuestionGenerationInput) => Question;
export type QuestionValidator = (question: Question, config: WorksheetConfig, definition?: QuestionDefinition) => QuestionValidationResult;

export interface DifficultyProfile {
  max: number;
  /** Smallest useful result for this type at this difficulty. */
  minimumMax?: number;
  /** Smallest useful operand for this type at this difficulty. */
  minimumOperand?: number;
  min?: number;
  terms?: number;
  carryRate?: number;
  highRangeRate?: number;
  wordSteps?: number;
  maxFactor?: number;
  trivialRate?: number;
  equalityRate?: number;
  mixedRate?: number;
}

export interface QuestionDefinition {
  id: ProblemType;
  label: string;
  description: string;
  group: QuestionGroupId;
  domain: CurriculumDomain;
  contentCategory: ContentCategory;
  skills: readonly string[];
  allowedGrades: readonly Grade[];
  recommendedGrades: readonly Grade[];
  difficulties: readonly Difficulty[];
  difficultyProfiles: Readonly<Partial<Record<Difficulty, DifficultyProfile>>>;
  practice: 'standard' | 'vertical';
  generate: QuestionGenerator;
  validate: QuestionValidator;
  renderKind: QuestionRenderKind;
  footprint: PrintFootprint;
}

export type QuestionHandler = Pick<QuestionDefinition, 'generate' | 'validate' | 'renderKind' | 'footprint'>;
