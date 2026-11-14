/** Compatibility facade; new code should import contracts/model directly. */
export * from './contracts';
export type { AnswerDetails, Difficulty, Layout, ProblemProfile, ProblemType, Question, QuestionContent } from './model';
export type { WorksheetConfig } from '../worksheet/config';
