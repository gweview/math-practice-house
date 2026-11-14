/** Application definitions own their generators, solvers and validators. */
import { APPLICATION_QUESTION_DEFINITIONS as BASE_APPLICATION_QUESTION_DEFINITIONS } from '../application/foundation';
import { EARLY_WORD_QUESTION_DEFINITIONS } from '../application/early-word';

export const APPLICATION_QUESTION_DEFINITIONS = [
  ...BASE_APPLICATION_QUESTION_DEFINITIONS,
  ...EARLY_WORD_QUESTION_DEFINITIONS
];
