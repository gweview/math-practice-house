import type { Grade } from '../curriculum/types';
import type { RangeMode } from '../worksheet/config';
import type { ProblemProfile } from './model';
import type { Difficulty } from './problem-type';
import type { DifficultyProfile, QuestionDefinition } from './contracts';

const RANGE_FACTOR: Record<Difficulty, number> = { entry: .3, easy: .55, standard: 1, advanced: 1, challenge: 1 };
/** Curriculum-wide operand ceiling; validators and profile resolution share this source. */
export const CURRICULUM_MAXIMUMS: Readonly<Record<Grade, number>> = {
  preschool: 10, grade1: 20, grade2: 100, grade3: 1000,
  grade4: 100_000_000, grade5: 100_000_000, grade6: 100_000_000
};
const COMPLEXITY_CAP: Record<Grade, Pick<ProblemProfile, 'terms' | 'wordSteps'>> = {
  preschool: { terms: 2, wordSteps: 1 }, grade1: { terms: 3, wordSteps: 2 }, grade2: { terms: 3, wordSteps: 2 },
  grade3: { terms: 4, wordSteps: 3 }, grade4: { terms: 4, wordSteps: 3 }, grade5: { terms: 4, wordSteps: 3 }, grade6: { terms: 4, wordSteps: 3 }
};
const FALLBACK: Required<DifficultyProfile> = {
  max: 1000, minimumMax: 5, minimumOperand: 0, min: 0, terms: 3, carryRate: .5, highRangeRate: .5, wordSteps: 1,
  maxFactor: 9, trivialRate: .08, equalityRate: .2, mixedRate: .4, reverseRate: .25, multiStepRate: .3
};

function profileFor(definition: QuestionDefinition, difficulty: Difficulty): Required<DifficultyProfile> {
  return { ...FALLBACK, ...(definition.difficultyProfiles[difficulty] ?? definition.difficultyProfiles.standard) };
}

/** Resolves a type-owned difficulty profile against curriculum limits. */
export function resolveProblemProfile(
  definition: QuestionDefinition,
  difficulty: Difficulty,
  stage: Grade = 'grade3',
  rangeMode: RangeMode = 'free'
): ProblemProfile {
  const configured = profileFor(definition, difficulty);
  const standard = profileFor(definition, 'standard');
  const curriculumCap = rangeMode === 'curriculum' ? CURRICULUM_MAXIMUMS[stage] : standard.max;
  const cappedMax = Math.min(standard.max, curriculumCap);
  const minimumMax = Math.min(cappedMax, configured.minimumMax ?? standard.minimumMax ?? 5);
  const max = Math.max(minimumMax, Math.round(cappedMax * RANGE_FACTOR[difficulty]));
  const cap = COMPLEXITY_CAP[stage];
  const maxFactor = rangeMode === 'curriculum'
    ? Math.min(configured.maxFactor, stage === 'preschool' || stage === 'grade1' ? 5 : 9)
    : configured.maxFactor;
  return {
    terms: rangeMode === 'curriculum' ? Math.min(configured.terms, cap.terms) : configured.terms,
    wordSteps: rangeMode === 'curriculum' ? Math.min(configured.wordSteps, cap.wordSteps) : configured.wordSteps,
    carryRate: configured.carryRate,
    highRangeRate: configured.highRangeRate,
    maxFactor,
    trivialRate: configured.trivialRate,
    equalityRate: configured.equalityRate,
    mixedRate: configured.mixedRate,
    reverseRate: configured.reverseRate,
    multiStepRate: configured.multiStepRate,
    min: Math.min(max, configured.minimumOperand ?? standard.minimumOperand ?? configured.min ?? 0),
    max
  };
}

export function getDefinitionMaximum(definition: QuestionDefinition): number {
  return definition.difficultyProfiles.standard?.max ?? FALLBACK.max;
}
