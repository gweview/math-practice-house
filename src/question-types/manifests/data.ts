/** Data and probability definitions live with their generators and validators. */
import { DATA_QUESTION_DEFINITIONS as BASE_DATA_QUESTION_DEFINITIONS } from '../data/foundation';
import { LIKELIHOOD_QUESTION_DEFINITIONS } from '../data/likelihood';

export const DATA_QUESTION_DEFINITIONS = [
  ...BASE_DATA_QUESTION_DEFINITIONS,
  ...LIKELIHOOD_QUESTION_DEFINITIONS
];
