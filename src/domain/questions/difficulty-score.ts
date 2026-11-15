import type { ProblemProfile, Question } from './model';

const REVERSE_SEMANTICS = new Set(['unknown-start', 'unknown-change', 'difference']);
const VISUAL_VARIANT_SECOND_OPERAND_TYPES = new Set([
  'shapeRecognition',
  'lineRaySegment',
  'triangleQuadrilateralClassification',
  'shapeClassification',
  'axisSymmetry'
]);

/**
 * Extract the numeric quantity magnitude of a question, normalizing scaled
 * currency operands and ignoring non-quantitative visual/index operands.
 */
export function effectiveQuestionMagnitude(question: Question): number {
  const metadata = question.metadata ?? {};
  if (typeof metadata.magnitude === 'number' && Number.isFinite(metadata.magnitude)) {
    return metadata.magnitude;
  }
  if (!Array.isArray(question.operands) || question.operands.length === 0) return 0;
  if (question.type === 'moneyCalculation' || question.type === 'budgetPlan') {
    return Math.max(...question.operands) / 100;
  }
  if (question.type === 'likelihoodLanguage' || question.type === 'shapePattern') {
    return 0;
  }
  if (VISUAL_VARIANT_SECOND_OPERAND_TYPES.has(question.type)) {
    return Number.isFinite(question.operands[0]) ? question.operands[0] : 0;
  }
  return Math.max(...question.operands);
}

/** True when a question requires reverse reasoning (working backwards from a result). */
export function isReverseQuestion(question: Question): boolean {
  const metadata = question.metadata ?? {};
  if (metadata.reverse === true) return true;
  if (typeof metadata.semantic === 'string' && REVERSE_SEMANTICS.has(metadata.semantic)) return true;
  if (typeof metadata.blankPosition === 'string' && metadata.blankPosition !== 'result') return true;
  if (question.type === 'multiplicativeComparison' && metadata.form === 'how-many-times') return true;
  if (question.type === 'moneySense' && metadata.form === 'jiao-split') return true;
  if (question.type === 'repeatedAddition' && (metadata.form === 'missing-addend' || metadata.form === 'missing-count')) return true;
  return false;
}

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
 * Formula (clamped to [0, 1]):
 *   0.50 * magnitude ratio — largest quantity magnitude vs the profile max
 *   0.35 * steps           — 1 step = 0, 2 steps = 0.5, 3+ steps = 1
 *   0.15 * regrouping      — carry/borrow recorded in metadata.regrouping
 *   0.15 * reverse         — reverse-thinking structure (unknown start/change, non-result blank, etc.)
 */
export function scoreQuestionDifficulty(
  question: Question,
  profile: Pick<ProblemProfile, 'max'>
): number {
  const metadata = question.metadata ?? {};
  const magnitude = effectiveQuestionMagnitude(question);
  const magnitudeRatio = profile.max > 0 ? Math.min(1, Math.max(0, magnitude / profile.max)) : 0;
  const steps = typeof metadata.steps === 'number' && Number.isFinite(metadata.steps)
    ? metadata.steps
    : question.operators?.length ? question.operators.length : 1;
  const stepsScore = steps <= 1 ? 0 : steps === 2 ? .5 : 1;
  const regrouping = metadata.regrouping === true ? 1 : 0;
  const reverse = isReverseQuestion(question) ? 1 : 0;
  return Math.min(1, Math.max(0, .5 * magnitudeRatio + .35 * stepsScore + .15 * regrouping + .15 * reverse));
}
