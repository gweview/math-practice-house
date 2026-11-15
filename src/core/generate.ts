import { getProblemProfile } from './difficulty-config';
import { generateVerticalQuestions } from './generators/vertical';
import { attachCreateId, shuffle } from './random-utils';
import { createGenerationContext, createRandomSeed, type GenerationContext, type RandomSource } from '../shared/random/seeded-random';
import { buildWorksheetBlueprint } from '../domain/worksheet/blueprint';
import { paginateByMeasuredFootprints, questionFootprint } from '../domain/worksheet/layout-metrics';
import { getQuestionDefinition, getQuestionHandler } from '../domain/questions/registry';
import { effectiveQuestionMagnitude, scoreQuestionDifficulty } from '../domain/questions/difficulty-score';
import { normalizeConfig, validateConfig, validateQuestion } from './validators';
import type { Difficulty, ProblemProfile, ProblemType, Question, VerticalOperation, Worksheet, WorksheetConfig } from './types';

const DIFFICULTY_LEVELS: readonly Difficulty[] = ['entry', 'easy', 'standard', 'advanced', 'challenge'];

export interface DifficultySlice {
  difficulty: Difficulty;
  count: number;
}

/**
 * Deterministic largest-remainder allocation of a slot count across difficulty
 * tiers. Returns a single slice at `fallback` when no distribution is active.
 */
export function packInlineRows(
  questions: readonly Question[],
  config: Pick<WorksheetConfig, 'orientation' | 'fontSize'>
): Question[] {
  const columnCount = config.orientation === 'portrait' ? 2 : 3;
  const inlineBuffer: Question[] = [];
  const result: Question[] = [];
  for (const question of questions) {
    const footprint = questionFootprint(question, config);
    if (footprint.columns !== 'full') {
      inlineBuffer.push(question);
      if (inlineBuffer.length === columnCount) {
        result.push(...inlineBuffer);
        inlineBuffer.length = 0;
      }
    } else {
      result.push(question);
    }
  }
  if (inlineBuffer.length > 0) {
    result.push(...inlineBuffer);
  }
  return result;
}

export function allocateDifficultyCounts(
  count: number,
  distribution: Partial<Record<Difficulty, number>> | undefined,
  fallback: Difficulty
): DifficultySlice[] {
  if (count <= 0) return [];
  if (!distribution) return [{ difficulty: fallback, count }];
  const active = DIFFICULTY_LEVELS
    .map(difficulty => ({ difficulty, weight: Number(distribution[difficulty] ?? 0) }))
    .filter(item => Number.isFinite(item.weight) && item.weight > 0);
  if (!active.length) return [{ difficulty: fallback, count }];
  const totalWeight = active.reduce((sum, item) => sum + item.weight, 0);
  const raw = active.map(item => count * item.weight / totalWeight);
  const base = raw.map(Math.floor);
  let remaining = count - base.reduce((sum, value) => sum + value, 0);
  const byRemainder = raw
    .map((value, index) => ({ index, remainder: value - base[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (const item of byRemainder) {
    if (remaining-- <= 0) break;
    base[item.index]++;
  }
  return active
    .map((item, index) => ({ difficulty: item.difficulty, count: base[index] }))
    .filter(item => item.count > 0);
}

export interface GenerationDirective {
  readonly [key: string]: unknown;
  highRange?: boolean;
  trivial?: boolean;
  carry?: boolean;
  mixed?: boolean;
  relation?: '=' | '>' | '<';
  equalFraction?: boolean;
  /** Force (true) or exclude (false) reverse-thinking items; only honored by opted-in types. */
  reverse?: boolean;
  /** Force single-step (1) or multi-step (>=2) items; only honored by opted-in types. */
  steps?: number;
}
const QUOTA_CARRY_TYPES = new Set<ProblemType>(['addition10', 'subtraction10', 'addition100', 'subtraction100', 'addition1000', 'subtraction1000']);
const SMALL_REGROUPING_TYPES = new Set<ProblemType>(['addition10', 'subtraction10']);
export function evaluateExpression(operands: number[], operators: string[]): number {
  const values = [...operands];
  const ops = [...operators];
  for (let index = 0; index < ops.length;) {
    if (ops[index] === '×' || ops[index] === '÷') {
      values.splice(index, 2, ops[index] === '×' ? values[index] * values[index + 1] : values[index] / values[index + 1]);
      ops.splice(index, 1);
    } else index++;
  }
  return ops.reduce((result, op, index) => op === '+' ? result + values[index + 1] : result - values[index + 1], values[0]);
}
function booleanQuotaCount(count: number, requested: number, excluded: boolean[] = [], random: RandomSource): boolean[] {
  const result = Array<boolean>(count).fill(false);
  const candidates = shuffle(
    Array.from({ length: count }, (_, value) => value).filter(index => !excluded[index]),
    random
  );
  for (const index of candidates.slice(0, Math.min(requested, count))) result[index] = true;
  return result;
}

function booleanQuota(count: number, rate: number, excluded: boolean[] = [], random: RandomSource): boolean[] {
  return booleanQuotaCount(count, Math.round(count * rate), excluded, random);
}

function preferredBooleanQuota(count: number, rate: number, preferred: boolean[], random: RandomSource): boolean[] {
  const result = Array<boolean>(count).fill(false);
  const indices = shuffle(Array.from({ length: count }, (_, value) => value), random);
  const ordered = [...indices.filter(value => preferred[value]), ...indices.filter(value => !preferred[value])];
  for (const index of ordered.slice(0, Math.round(count * rate))) result[index] = true;
  return result;
}
function regroupingQuota(type: ProblemType, target: number, profile: ProblemProfile): number {
  const requested = Math.round(target * profile.carryRate);
  if (!SMALL_REGROUPING_TYPES.has(type)) return requested;
  let capacity = 0;
  if (type === 'addition10') {
    // Addition signatures are canonical under commutativity, so capacity
    // counts unordered pairs (a <= b); subtraction below stays ordered.
    for (let a = 1; a <= profile.max; a++) {
      for (let b = a; a + b <= profile.max; b++) {
        if (a % 10 + b % 10 >= 10) capacity++;
      }
    }
  } else {
    for (let a = 1; a <= profile.max; a++) {
      for (let b = 1; b <= a; b++) {
        if (a % 10 < b % 10) capacity++;
      }
    }
  }
  return Math.min(requested, capacity);
}
function minimumTrivialQuota(type: ProblemType, target: number, profile: ProblemProfile): number {
  const requested = Math.round(target * profile.trivialRate);
  if (type !== 'addition10' && type !== 'addition20NoCarry') return requested;
  let nonTrivialCapacity = 0;
  // Both types are canonicalized addition: count unordered pairs (a <= b).
  for (let a = 1; a <= profile.max; a++) {
    for (let b = a; a + b <= profile.max; b++) {
      if (type === 'addition10' || a % 10 + b % 10 < 10) nonTrivialCapacity++;
    }
  }
  return Math.max(requested, target - nonTrivialCapacity);
}

/** One structural mode per worksheet slot. Reverse and multi-step are disjoint: no generator can produce both yet, so the two rates share the slot budget and the remainder stays forward single-step. */
type StructuralMode = 'reverse' | 'multiStep' | 'forward';

function structuralQuota(
  count: number,
  reverseRate: number,
  multiStepRate: number,
  supportReverse: boolean,
  supportMultiStep: boolean,
  random: RandomSource
): StructuralMode[] {
  const reverseCount = supportReverse ? Math.round(count * reverseRate) : 0;
  const multiCount = supportMultiStep ? Math.min(Math.round(count * multiStepRate), count - reverseCount) : 0;
  return shuffle([
    ...Array<StructuralMode>(reverseCount).fill('reverse'),
    ...Array<StructuralMode>(multiCount).fill('multiStep'),
    ...Array<StructuralMode>(Math.max(0, count - reverseCount - multiCount)).fill('forward')
  ], random);
}

function relationQuota(
  count: number,
  equalityRate: number,
  equalityCapacity: number,
  random: RandomSource
): Array<'=' | '>' | '<'> {
  const equalCount = Math.min(Math.round(count * equalityRate), equalityCapacity);
  const differentCount = count - equalCount;
  const greaterCount = Math.floor(differentCount / 2);
  return shuffle([
    ...Array<'='>(equalCount).fill('='),
    ...Array<'>'>(greaterCount).fill('>'),
    ...Array<'<'>(differentCount - greaterCount).fill('<')
  ], random);
}

export type GenerationContextOrRandom = GenerationContext | RandomSource;

function createDirectId(random: RandomSource): string {
  return `q-${Math.floor(random() * Number.MAX_SAFE_INTEGER).toString(36)}`;
}

export function generateOne(
  type: ProblemType,
  config: WorksheetConfig,
  directive: GenerationDirective = {},
  contextOrRandom: GenerationContextOrRandom = Math.random
): Question {
  const context: GenerationContext = typeof contextOrRandom === 'function'
    ? { seed: 'direct', random: contextOrRandom, createId: () => createDirectId(contextOrRandom) }
    : contextOrRandom;
  const profile = getProblemProfile(type, config.difficulty, config.stage, config.rangeMode);
  return getQuestionHandler(type).generate({ type, config, profile, directive, random: context.random, createId: context.createId });
}
export interface GenerateWorksheetOptions { seed?: string | number }
export function generateWorksheet(input: WorksheetConfig, options: GenerateWorksheetOptions = {}): Worksheet {
  const config = normalizeConfig(input);
  const seed = options.seed ?? (config.seed?.trim() || createRandomSeed());
  const context = createGenerationContext(seed);
  const random = context.random;
  const check = validateConfig(config);
  if (!check.valid) throw new Error(check.errors.join('；'));

  if (config.practiceMode !== 'standard') {
    // All four vertical types share difficultyProfiles(1000), so the first
    // operation's resolved profile stands for the whole vertical worksheet.
    const verticalType: Record<VerticalOperation, ProblemType> = {
      addition: 'verticalAddition', subtraction: 'verticalSubtraction',
      multiplication: 'verticalMultiplication', division: 'verticalDivision'
    };
    const profile = getProblemProfile(verticalType[config.verticalOperations[0]], config.difficulty, config.stage, config.rangeMode);
    const questions = generateVerticalQuestions(config, profile, attachCreateId(random, () => '')).map(question => ({ ...question, id: context.createId() }));
    for (const question of questions) {
      const validation = validateQuestion(question, config);
      if (!validation.valid) throw new Error(validation.errors.join('；'));
    }
    return { questions, createdAt: new Date().toISOString(), config, seed: context.seed };
  }

  const questions: Question[] = [];
  const difficultyScores = new Map<string, number>();
  const blueprint = buildWorksheetBlueprint(config);
  const hasMixedDifficulty = Boolean(
    (config.difficultyDistribution && Object.values(config.difficultyDistribution).some(weight => Number(weight) > 0))
    || (config.typeDifficulties && Object.keys(config.typeDifficulties).length > 0)
  );
  for (const { type, count: totalTarget } of blueprint.allocations) {
    if (totalTarget === 0) continue;
    const typeOverride = config.typeDifficulties?.[type];
    const slices = typeOverride
      ? [{ difficulty: typeOverride, count: totalTarget }]
      : allocateDifficultyCounts(totalTarget, config.difficultyDistribution, config.difficulty);
    const ceilingProfile = hasMixedDifficulty
      ? getProblemProfile(type, 'challenge', config.stage, config.rangeMode)
      : undefined;
    const typeQuestions: Question[] = [];
    for (const { difficulty: sliceDifficulty, count: target } of slices) {
      if (target === 0) continue;
      const sliceConfig = sliceDifficulty === config.difficulty ? config : { ...config, difficulty: sliceDifficulty };
      const profile = getProblemProfile(type, sliceDifficulty, config.stage, config.rangeMode);
      const carryQuota = QUOTA_CARRY_TYPES.has(type)
        ? booleanQuotaCount(target, regroupingQuota(type, target, profile), [], random)
        : [];
      const trivialQuota = booleanQuotaCount(target, minimumTrivialQuota(type, target, profile), carryQuota, random);
      const restrictiveQuota = carryQuota.map((value, index) => value || trivialQuota[index]);
      const highRangeQuota = SMALL_REGROUPING_TYPES.has(type)
        ? preferredBooleanQuota(target, profile.highRangeRate, restrictiveQuota, random)
        : booleanQuota(target, profile.highRangeRate, [], random);
      const relations = type === 'compareSigns'
        ? relationQuota(target, profile.equalityRate, sliceConfig.allowDuplicates ? Number.POSITIVE_INFINITY : profile.max + 1, random)
        : [];
      const equalFractions = type === 'fractionComparison' ? booleanQuota(target, profile.equalityRate, [], random) : [];
      const mixedQuota = type === 'mixedAddSub' && profile.terms >= 3 ? booleanQuota(target, profile.mixedRate, [], random) : [];
      const definition = getQuestionDefinition(type);
      const structural = definition.directives?.reverse || definition.directives?.multiStep
        ? structuralQuota(target, profile.reverseRate, profile.wordSteps >= 2 ? profile.multiStepRate : 0, definition.directives?.reverse === true, definition.directives?.multiStep === true, random)
        : [];
      const quotaOrder = [
        ...shuffle(Array.from({ length: target }, (_, index) => index).filter(index => highRangeQuota[index]), random),
        ...shuffle(Array.from({ length: target }, (_, index) => index).filter(index => !highRangeQuota[index]), random)
      ];
      let generated = 0;
      let attempts = 0;
      // The high-range preference is soft distribution shaping, not a quota: a
      // slot whose distinct high-range pool is exhausted (small types under
      // isomorphic dedup) relaxes to the full range after 50 failed attempts
      // instead of spinning until the attempt budget is gone. Carry, trivial,
      // relation and structural directives are never relaxed.
      let slotAttempts = 0;
      let highRangeRelaxed = false;
      while (generated < target && attempts++ < Math.max(500, target * 300)) {
        const quotaIndex = quotaOrder[generated];
        const mode = structural[quotaIndex];
        const directive: GenerationDirective = {
          highRange: type === 'compareSigns' && !sliceConfig.allowDuplicates
            ? undefined
            : highRangeRelaxed ? false : highRangeQuota[quotaIndex],
          trivial: trivialQuota[quotaIndex], carry: carryQuota[quotaIndex], mixed: mixedQuota[quotaIndex],
          relation: relations[quotaIndex], equalFraction: equalFractions[quotaIndex],
          reverse: definition.directives?.reverse ? mode === 'reverse' : undefined,
          steps: definition.directives?.multiStep ? (mode === 'multiStep' ? Math.max(2, profile.wordSteps) : 1) : undefined
        };
        const question = generateOne(type, sliceConfig, directive, { ...context, createId: () => '' });
        const valid = validateQuestion(question, sliceConfig).valid;
        const unique = sliceConfig.allowDuplicates || ![...questions, ...typeQuestions].some(item => item.signature === question.signature);
        if (valid && unique) {
          const generatedQuestion = { ...question, id: context.createId() };
          const scoreProfile = ceilingProfile ?? profile;
          const baseScore = scoreQuestionDifficulty(question, scoreProfile);
          const tierBonus = hasMixedDifficulty ? DIFFICULTY_LEVELS.indexOf(sliceDifficulty) * 0.02 : 0;
          difficultyScores.set(generatedQuestion.id, Math.min(1, baseScore + tierBonus));
          typeQuestions.push(generatedQuestion);
          generated++;
          slotAttempts = 0;
          highRangeRelaxed = false;
        } else {
          slotAttempts++;
          if (slotAttempts >= 50 && !highRangeRelaxed && highRangeQuota[quotaIndex]) {
            highRangeRelaxed = true;
            slotAttempts = 0;
          }
        }
      }
      if (generated < target) throw new Error(`题型 ${type} 只能生成 ${generated} 道不重复题目，请减少题量、增加题型或允许重复`);
    }
    questions.push(...shuffle(typeQuestions, random));
  }
  const ordered = blueprint.ordering === 'random'
    ? packInlineRows(shuffle(questions, random), config)
    : blueprint.ordering === 'progressive'
      ? [...questions].sort((left, right) => (difficultyScores.get(left.id) ?? 0) - (difficultyScores.get(right.id) ?? 0)
        || (questionFootprint(left, config).columns === 'full' ? 1 : 0) - (questionFootprint(right, config).columns === 'full' ? 1 : 0)
        || effectiveQuestionMagnitude(left) - effectiveQuestionMagnitude(right))
      : questions;
  if (config.generationMode === 'pages') {
    const questionPages = paginateByMeasuredFootprints(ordered, config, question => questionFootprint(question, config));
    const targetPages = config.pageTarget === 2 ? 2 : 1;
    if (questionPages.length > targetPages) {
      throw new Error(`生成的题目按当前排序无法排入目标 ${targetPages} 页（实际 ${questionPages.length} 页、${ordered.length} 题、${config.orientation}/${config.fontSize}/${blueprint.ordering}），请减少题量、调整页面设置或题型`);
    }
  }
  return { questions: ordered, createdAt: new Date().toISOString(), config, seed: context.seed };
}
