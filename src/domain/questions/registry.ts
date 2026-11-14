import type { ProblemType } from './problem-type';
import type { WorksheetConfig } from '../worksheet/config';
import type { QuestionDefinition } from './contracts';
import { createGenerationContext } from '../../shared/random/seeded-random';
import { CALCULATION_QUESTION_DEFINITIONS } from '../../question-types/manifests/calculation';
import { CONCEPT_QUESTION_DEFINITIONS } from '../../question-types/manifests/concept';
import { GEOMETRY_MEASUREMENT_QUESTION_DEFINITIONS } from '../../question-types/manifests/geometry-measurement';
import { DATA_QUESTION_DEFINITIONS } from '../../question-types/manifests/data';
import { APPLICATION_QUESTION_DEFINITIONS } from '../../question-types/manifests/application';
import { QUESTION_GROUPS } from './groups';
import { QUESTION_DISPLAY_ORDER } from './order';

export { QUESTION_GROUPS };

/** The registry is composition only; definitions own all per-type metadata. */
const MANIFEST_DEFINITIONS: readonly QuestionDefinition[] = [
  ...CALCULATION_QUESTION_DEFINITIONS,
  ...CONCEPT_QUESTION_DEFINITIONS,
  ...GEOMETRY_MEASUREMENT_QUESTION_DEFINITIONS,
  ...DATA_QUESTION_DEFINITIONS,
  ...APPLICATION_QUESTION_DEFINITIONS
] as const;

const MANIFEST_MAP = new Map<ProblemType, QuestionDefinition>(MANIFEST_DEFINITIONS.map(definition => [definition.id, definition]));
// Ordering is presentation-only. It intentionally contains IDs, never labels,
// curriculum data, handlers, or difficulty metadata.
export const QUESTION_DEFINITIONS: readonly QuestionDefinition[] = QUESTION_DISPLAY_ORDER.map(type => {
  const definition = MANIFEST_MAP.get(type);
  if (!definition) throw new Error(`题型 ${type} 未在 manifest 中注册`);
  return definition;
});

const QUESTION_DEFINITION_MAP = new Map<ProblemType, QuestionDefinition>(
  QUESTION_DEFINITIONS.map(definition => [definition.id, definition])
);

export function getQuestionDefinition(type: ProblemType): QuestionDefinition {
  const definition = QUESTION_DEFINITION_MAP.get(type);
  if (!definition) throw new Error(`未注册题型：${type}`);
  return definition;
}

export function getQuestionHandler(type: ProblemType): QuestionDefinition {
  const definition = getQuestionDefinition(type);
  if (typeof definition.generate !== 'function' || typeof definition.validate !== 'function'
    || !definition.renderKind || !definition.footprint || !definition.contentCategory
    || !Number.isFinite(definition.footprint.heightMm.standard)
    || !Number.isFinite(definition.footprint.heightMm.large)) {
    throw new Error(`题型 ${type} 未注册完整运行时能力`);
  }
  return definition;
}

/** Runtime capability smoke check. This remains a wiring check, not a teaching-quality proof. */
export function assertQuestionRegistryComplete(): void {
  const context = createGenerationContext('registry-capability-probe');
  const baseConfig: WorksheetConfig = {
    stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard', types: [...QUESTION_DEFINITIONS.map(item => item.id)], count: 20,
    verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true, answerPage: false,
    allowDuplicates: true, randomMix: false, fields: { name: false, date: false, time: false, score: false, streak: false }, orientation: 'portrait', fontSize: 'standard'
  };
  for (const definition of QUESTION_DEFINITIONS) {
    const handler = getQuestionHandler(definition.id);
    const isVertical = definition.practice === 'vertical';
    const config = isVertical
      ? { ...baseConfig, practiceMode: definition.id === 'verticalAddition' || definition.id === 'verticalSubtraction' ? 'verticalAddSub' as const : 'verticalMulDiv' as const, verticalOperations: [definition.id === 'verticalAddition' ? 'addition' : definition.id === 'verticalSubtraction' ? 'subtraction' : definition.id === 'verticalMultiplication' ? 'multiplication' : 'division'] as ['addition' | 'subtraction' | 'multiplication' | 'division'] }
      : baseConfig;
    const max = definition.difficultyProfiles.standard?.max ?? 1000;
    const question = handler.generate({ type: definition.id, config, profile: { min: 0, max, terms: 3, carryRate: .5, highRangeRate: .5, wordSteps: 2, maxFactor: 12, trivialRate: .1, equalityRate: .2, mixedRate: .4 }, random: context.random, createId: context.createId });
    if (!question || question.type !== definition.id) throw new Error(`题型 ${definition.id} 生成能力不可用`);
    const validation = handler.validate(question, config, definition);
    if (!validation.valid) throw new Error(`题型 ${definition.id} 校验能力不可用：${validation.errors.join('；')}`);
  }
}

export function isRegisteredProblemType(value: unknown): value is ProblemType {
  return typeof value === 'string' && QUESTION_DEFINITION_MAP.has(value as ProblemType);
}

export function standardQuestionDefinitions(): QuestionDefinition[] {
  return QUESTION_DEFINITIONS.filter(definition => definition.practice === 'standard');
}
