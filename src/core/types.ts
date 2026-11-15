/** Compatibility facade for the pre-domain public imports. */
export type { Difficulty, ProblemType } from '../domain/questions/problem-type';
export type { AnswerDetails, Layout, ProblemProfile, Question, QuestionContent } from '../domain/questions/model';
export { MAX_VERTICAL_PAGES, VERTICAL_PAGE_SIZE } from '../domain/worksheet/config';
export type {
  AnswerMode,
  GenerationMode,
  OrderingMode,
  PracticeMode,
  RangeMode,
  Stage,
  VerticalDivisionMode,
  VerticalMultiplicationMode,
  VerticalOperation,
  VerticalSubtractionMode,
  Worksheet,
  WorksheetConfig,
  WorksheetPresetId
} from '../domain/worksheet/config';
