import type { ProblemProfile, Question } from './model';
import {
  additionRegroupingCount,
  hasAcrossZeroPattern,
  multiplicationRegroupingCount,
  subtractionRegroupingCount
} from '../math-core/regrouping';

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
 * Generic formula (weights sum to 1, clamped to [0, 1]):
 *   0.45  * magnitude ratio — largest quantity magnitude vs the profile max
 *   0.30  * steps           — 1 step = 0, 2 steps = 0.5, 3+ steps = 1
 *   0.125 * regrouping      — carry/borrow recorded in metadata.regrouping
 *   0.125 * reverse         — reverse-thinking structure (unknown start/change, non-result blank, etc.)
 *
 * Vertical questions (layout 'vertical' / 'longDivision') use a dedicated
 * branch instead: steps and reverse are always 0 for a single forward
 * computation, while regrouping count, digit pattern and division structure
 * carry the difficulty. See scoreVerticalQuestionDifficulty.
 */
export function scoreQuestionDifficulty(
  question: Question,
  profile: Pick<ProblemProfile, 'max'>
): number {
  const magnitude = effectiveQuestionMagnitude(question);
  const magnitudeRatio = profile.max > 0 ? Math.min(1, Math.max(0, magnitude / profile.max)) : 0;
  if (question.layout === 'vertical' || question.layout === 'longDivision') {
    return scoreVerticalQuestionDifficulty(question, profile, magnitudeRatio);
  }
  const metadata = question.metadata ?? {};
  const steps = typeof metadata.steps === 'number' && Number.isFinite(metadata.steps)
    ? metadata.steps
    : question.operators?.length ? question.operators.length : 1;
  const stepsScore = steps <= 1 ? 0 : steps === 2 ? .5 : 1;
  const regrouping = metadata.regrouping === true ? 1 : 0;
  const reverse = isReverseQuestion(question) ? 1 : 0;
  return Math.min(1, Math.max(0, .45 * magnitudeRatio + .30 * stepsScore + .125 * regrouping + .125 * reverse));
}

function digitCount(value: number): number {
  return String(Math.abs(Math.trunc(value))).length;
}

/**
 * Difficulty score for vertical questions, in [0, 1]. Regrouping counts and
 * division structure are recomputed from the operands with the shared
 * counters, so the score never depends on possibly stale metadata.
 *
 * Formula (weights sum to 1, clamped to [0, 1]):
 *   0.35 * digit ratio      — largest operand digit count vs the profile max digit count
 *   0.35 * regrouping ratio — regrouping count / 2 (capped at 1); division
 *                             folds remainder (0.5) and zero quotient (0.5) instead
 *   0.15 * pattern          — partial-product rows (two-digit factor),
 *                             across-zero borrow, or two-digit divisor
 *   0.15 * magnitude ratio  — same as the generic formula
 */
function scoreVerticalQuestionDifficulty(
  question: Question,
  profile: Pick<ProblemProfile, 'max'>,
  magnitudeRatio: number
): number {
  const operands = Array.isArray(question.operands) ? question.operands : [];
  const [a, b] = operands;
  const operandDigits = operands.length ? Math.max(...operands.map(digitCount)) : 0;
  const profileDigits = Math.max(1, digitCount(profile.max));
  const digitRatio = Math.min(1, operandDigits / profileDigits);
  let regroupingRatio = 0;
  let pattern = 0;
  if (Number.isFinite(a) && Number.isFinite(b)) {
    if (question.type === 'verticalDivision' && b !== 0) {
      const quotient = Math.floor(a / b);
      regroupingRatio = (a % b > 0 ? .5 : 0) + (String(quotient).includes('0') ? .5 : 0);
      if (b >= 10) pattern = 1;
    } else if (question.type === 'verticalAddition') {
      regroupingRatio = Math.min(1, additionRegroupingCount(a, b) / 2);
    } else if (question.type === 'verticalSubtraction') {
      regroupingRatio = Math.min(1, subtractionRegroupingCount(a, b) / 2);
      if (hasAcrossZeroPattern(a, b)) pattern = 1;
    } else if (question.type === 'verticalMultiplication') {
      regroupingRatio = Math.min(1, multiplicationRegroupingCount(a, b) / 2);
      if (b >= 10) pattern = 1;
    }
  }
  return Math.min(1, Math.max(0, .35 * digitRatio + .35 * regroupingRatio + .15 * pattern + .15 * magnitudeRatio));
}
