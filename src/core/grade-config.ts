import { GRADE_LABELS, gradeIndex } from '../domain/curriculum/types';
import { QUESTION_DEFINITIONS } from '../domain/questions/registry';
import { CURRICULUM_MAXIMUMS } from '../domain/questions/difficulty';
import type { ProblemType, Stage } from './types';

/** Compatibility name; the curriculum ceiling is owned by question domain. */
export const STAGE_LIMITS = CURRICULUM_MAXIMUMS;

export const STAGE_LABELS: Record<Stage, string> = GRADE_LABELS;

export const STAGE_ALLOWED_TYPES = Object.fromEntries(
  Object.keys(STAGE_LABELS).map(stage => [
    stage,
    QUESTION_DEFINITIONS
      .filter(definition => definition.practice === 'standard' && definition.allowedGrades.includes(stage as Stage))
      .map(definition => definition.id)
  ])
) as Record<Stage, ProblemType[]>;

export const STAGE_RECOMMENDED_TYPES = Object.fromEntries(
  Object.keys(STAGE_LABELS).map(stage => {
    const exact = QUESTION_DEFINITIONS
      .filter(definition => definition.practice === 'standard' && definition.recommendedGrades.includes(stage as Stage))
      .map(definition => definition.id);
    if (exact.length) return [stage, exact];
    return [
      stage,
      QUESTION_DEFINITIONS
        .filter(definition => definition.practice === 'standard')
        .filter(definition => definition.recommendedGrades.some(grade => gradeIndex(grade) <= gradeIndex(stage as Stage)))
        .map(definition => definition.id)
    ];
  })
) as Record<Stage, ProblemType[]>;

export function isTypeAllowedForStage(type: ProblemType, stage: Stage): boolean {
  return STAGE_ALLOWED_TYPES[stage].includes(type);
}
