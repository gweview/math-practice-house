import type { ProblemProfile, Question } from './model';

/**
 * Difficulty score for one generated question, in [0, 1].
 *
 * The score is a pure function of the question's observable features and the
 * resolved profile max. It is deliberately not stored on the Question: the
 * strict per-type validators exact-match question shape, so a stored score
 * would fail re-validation. Callers that need ordering (the worksheet
 * generator's progressive mode) compute scores alongside generation and keep
 * them in a side map; anyone can recompute the same score later from the
 * question and its profile.
 *
 * Formula (weights sum to 1):
 *   0.50 * magnitude ratio — largest magnitude vs the profile max
 *   0.35 * steps           — 1 step = 0, 2 steps = 0.5, 3+ steps = 1
 *   0.15 * regrouping      — carry/borrow recorded in metadata.regrouping
 */
export function scoreQuestionDifficulty(
  question: Question,
  profile: Pick<ProblemProfile, 'max'>
): number {
  const metadata = question.metadata ?? {};
  const magnitude = typeof metadata.magnitude === 'number'
    ? metadata.magnitude
    : question.operands.length ? Math.max(...question.operands) : 0;
  const magnitudeRatio = profile.max > 0 ? Math.min(1, Math.max(0, magnitude / profile.max)) : 0;
  const steps = typeof metadata.steps === 'number' && Number.isFinite(metadata.steps)
    ? metadata.steps
    : question.operators?.length ? question.operators.length : 1;
  const stepsScore = steps <= 1 ? 0 : steps === 2 ? .5 : 1;
  const regrouping = metadata.regrouping === true ? 1 : 0;
  return Math.min(1, Math.max(0, .5 * magnitudeRatio + .35 * stepsScore + .15 * regrouping));
}
