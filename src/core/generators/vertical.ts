import { id, randomInt, shuffle } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';
import {
  additionRegroupingCount,
  multiplicationRegroupingCount,
  subtractionRegroupingCount
} from '../../domain/math-core/regrouping';
import {
  sampleAddendPairWithRegrouping,
  sampleDivision,
  sampleMultiplicationPair,
  sampleSubtrahendWithBorrows,
  type DivisionSample,
  type RegroupingTarget
} from './sampling';
import {
  VERTICAL_PAGE_SIZE,
  type ProblemProfile,
  type Question,
  type VerticalDivisionMode,
  type VerticalMultiplicationMode,
  type VerticalOperation,
  type VerticalSubtractionMode,
  type WorksheetConfig
} from '../types';

/** Difficulty parameters for vertical generation, resolved from a registry
 * ProblemProfile. Vertical mode used to keep a second difficulty system keyed
 * by Difficulty; it now reads the same resolved profile every other type
 * reads, so curriculum caps and difficulty tiers stay in one place.
 *
 * reverseRate/multiStepRate do not apply here: a vertical question is a
 * single forward computation, so there is nothing to reverse or chain. */
export interface VerticalParameters {
  /** Operand/result ceiling: the resolved profile max. */
  max: number;
  /** Smallest add/sub operand: 2 up to 20, 10 up to 100, max/10 above. */
  minOperand: number;
  /** Fraction of max below which add/sub results are rejected. */
  magnitudeFloorFactor: number;
  /** Complex (regrouping) questions per 8-question page. */
  complexPerPage: number;
  /** Share of divisions carrying a remainder. */
  remainderRate: number;
  /** Single-digit factor range for multiplication, and divisor range. */
  factorMin: number;
  factorMax: number;
  /** Largest dividend for division. */
  maxDividend: number;
  /** Smallest quotient for division; never below 10 (validator floor). */
  minQuotient: number;
  /** Whether complex questions demand two regroupings instead of one. */
  doubleRegrouping: boolean;
  /** Whether single-question generation defaults to complex questions. */
  complexTier: boolean;
}

export function resolveVerticalParameters(profile: ProblemProfile): VerticalParameters {
  const max = profile.max;
  const factorMax = Math.min(9, profile.maxFactor);
  const complexTier = profile.carryRate >= .75;
  return {
    max,
    minOperand: max <= 20 ? 2 : max <= 100 ? 10 : Math.max(10, Math.floor(max / 10)),
    magnitudeFloorFactor: .35 + .5 * profile.highRangeRate,
    complexPerPage: Math.round(8 * profile.carryRate),
    remainderRate: profile.carryRate,
    factorMin: Math.max(2, factorMax - 4),
    factorMax,
    maxDividend: max,
    minQuotient: Math.max(10, Math.min(20, Math.round(max / 20))),
    doubleRegrouping: max >= 1000 && complexTier,
    complexTier
  };
}

interface VerticalDirective {
  complex?: boolean;
  remainder?: boolean;
}

interface PageEntry extends VerticalDirective {
  operation: VerticalOperation;
}

function addSubFloor(params: VerticalParameters): number {
  // Small ranges keep the old absolute floors (10, or 12 on the complex tier),
  // capped at max so scaled-down profiles (grade 1 entry: max 6) stay feasible.
  return params.max <= 20
    ? Math.min(params.max, params.complexTier ? 12 : 10)
    : Math.ceil(params.max * params.magnitudeFloorFactor);
}

/** Regrouping target for one vertical slot: complex slots need at least the
 * profile's required count, simple slots need exactly zero regroupings. */
function regroupingTargetFor(params: VerticalParameters, complex: boolean): RegroupingTarget {
  return complex ? { min: params.doubleRegrouping ? 2 : 1 } : { min: 0, max: 0 };
}

/**
 * Fallback chain for a regrouping target: the exact target first, then the
 * same count without the consecutive requirement, then lower counts down to
 * `floor`. Complex slots never relax below one regrouping; simple slots
 * never relax at all. At most three attempts; callers throw after the chain
 * is exhausted, naming the infeasible constraint.
 */
function relaxedTargets(target: RegroupingTarget, floor: number): RegroupingTarget[] {
  const chain: RegroupingTarget[] = [target];
  if (target.consecutive) chain.push({ ...target, consecutive: false });
  for (let min = target.min - 1; min >= floor; min--) {
    chain.push({ min, max: target.max, consecutive: false });
  }
  return chain;
}

function describeTarget(target: RegroupingTarget): string {
  if (target.max === 0) return '不进退位';
  const count = target.min >= 2 ? `至少 ${target.min} 次` : '至少 1 次';
  return `${count}进退位${target.consecutive ? '（连续）' : ''}`;
}

function buildAdditionQuestion(a: number, b: number, random: RandomSource): Question {
  const sum = a + b;
  const regroupingCount = additionRegroupingCount(a, b);
  const low = Math.min(a, b), high = Math.max(a, b);
  return {
    id: id(random), type: 'verticalAddition', text: `${a} + ${b} =`, answer: sum,
    operands: [a, b], operators: ['+'], signature: `verticalAddition:${low}+${high}`, layout: 'vertical',
    metadata: { regrouping: regroupingCount > 0, regroupingCount, trivial: false, magnitude: sum }
  };
}

function buildSubtractionQuestion(a: number, b: number, random: RandomSource): Question {
  const difference = a - b;
  const regroupingCount = subtractionRegroupingCount(a, b);
  return {
    id: id(random), type: 'verticalSubtraction', text: `${a} - ${b} =`, answer: difference,
    operands: [a, b], operators: ['-'], signature: `verticalSubtraction:${a}-${b}`, layout: 'vertical',
    metadata: { regrouping: regroupingCount > 0, regroupingCount, trivial: false, magnitude: a }
  };
}

function buildMultiplicationQuestion(a: number, b: number, random: RandomSource): Question {
  const regroupingCount = multiplicationRegroupingCount(a, b);
  return {
    id: id(random), type: 'verticalMultiplication', text: `${a} × ${b} =`, answer: a * b,
    operands: [a, b], operators: ['×'], signature: `verticalMultiplication:${a}×${b}`, layout: 'vertical',
    metadata: { regrouping: regroupingCount > 0, regroupingCount, factor: b, trivial: false, magnitude: a * b }
  };
}

function buildDivisionQuestion(sample: DivisionSample, random: RandomSource): Question {
  const { dividend, divisor, quotient, remainder } = sample;
  const answer = remainder ? `${quotient}……${remainder}` : quotient;
  return {
    id: id(random), type: 'verticalDivision', text: `${dividend} ÷ ${divisor} =`, answer,
    operands: [dividend, divisor], operators: ['÷'], signature: `verticalDivision:${dividend}÷${divisor}`, layout: 'longDivision',
    metadata: { quotient, remainder, trivial: false, magnitude: dividend, longDivision: true }
  };
}

function generateVerticalAddition(params: VerticalParameters, target: RegroupingTarget, random: RandomSource): Question {
  const { max, minOperand: min } = params;
  const floor = addSubFloor(params);
  const upper = Math.max(min, max - min);
  const filter = (a: number, b: number) => a <= upper && b <= upper && a % 10 !== 0 && b % 10 !== 0 && a !== b;
  const startSum = randomInt(floor, max, random);
  for (const relaxed of relaxedTargets(target, target.min > 0 ? 1 : 0)) {
    for (let offset = 0; offset <= 60; offset++) {
      for (const sum of offset === 0 ? [startSum] : [startSum + offset, startSum - offset]) {
        if (sum < floor || sum > max) continue;
        const pair = sampleAddendPairWithRegrouping(sum, relaxed, random, { minOperand: min, filter });
        if (pair) return buildAdditionQuestion(pair[0], pair[1], random);
      }
    }
  }
  throw new Error(`当前范围无法生成符合难度的加法竖式（和 ${floor}–${max}，${describeTarget(target)}），请调整年级或难度`);
}

function generateVerticalSubtraction(
  params: VerticalParameters,
  target: RegroupingTarget,
  random: RandomSource,
  mode: VerticalSubtractionMode = 'mixed'
): Question {
  const { max, minOperand: min } = params;
  const acrossZero = mode === 'acrossZero';
  const minimumDifference = acrossZero ? 10 : max <= 20 ? 2 : max <= 100 ? 10 : 100;
  // The acrossZero sub-mode always borrows (its dedicated branch ignored the
  // complex flag); the mixed branch keeps simple slots borrow-free.
  const effectiveTarget = acrossZero && target.min < 1 ? { min: 1 } : target;
  const floor = acrossZero ? min + minimumDifference + 1 : Math.max(addSubFloor(params), min + 1);
  const minuends: number[] = [];
  for (let a = floor; a <= max; a++) {
    if (acrossZero ? (a % 10 === 0 || Math.floor(a / 10) % 10 === 0) : a % 10 !== 0) minuends.push(a);
  }
  const ordered = shuffle(minuends, random);
  for (const relaxed of relaxedTargets(effectiveTarget, acrossZero || effectiveTarget.min > 0 ? 1 : 0)) {
    for (const a of ordered) {
      const b = sampleSubtrahendWithBorrows(a, relaxed, random, {
        minOperand: min,
        acrossZero,
        filter: candidate => candidate % 10 !== 0 && a - candidate >= minimumDifference
      });
      if (b !== null) return buildSubtractionQuestion(a, b, random);
    }
  }
  throw new Error(`当前范围无法生成符合难度的减法竖式（被减数 ${floor}–${max}，${describeTarget(effectiveTarget)}${acrossZero ? '，隔位退位' : ''}），请调整年级或难度`);
}

function generateVerticalMultiplication(
  params: VerticalParameters,
  target: RegroupingTarget,
  random: RandomSource,
  mode: VerticalMultiplicationMode = 'mixed'
): Question {
  const { factorMin, factorMax, max } = params;
  // The specialized branches only demand regrouping for complex slots and
  // accept any carry count for simple ones; the mixed branch pins simple
  // slots to exactly zero carries.
  const effectiveTarget = mode === 'mixed' ? target : target.max === 0 ? { min: 0 } : { min: 1 };
  const floor = effectiveTarget.min > 0 ? 1 : 0;

  if (mode === 'threeByOne') {
    for (const relaxed of relaxedTargets(effectiveTarget, floor)) {
      const pair = sampleMultiplicationPair(100, 999, factorMin, factorMax, relaxed, random, {
        filter: (a, b) => a % 10 !== 0 && a * b <= max
      });
      if (pair) return buildMultiplicationQuestion(pair[0], pair[1], random);
    }
  } else if (mode === 'twoByTwo') {
    const upperA = Math.min(99, Math.max(24, Math.floor(Math.sqrt(max) * 1.4)));
    for (const relaxed of relaxedTargets(effectiveTarget, floor)) {
      const pair = sampleMultiplicationPair(11, upperA, 11, 99, relaxed, random, {
        filter: (a, b) => a % 10 !== 0 && b % 10 !== 0 && a * b <= max
      });
      if (pair) return buildMultiplicationQuestion(pair[0], pair[1], random);
    }
  } else {
    const complexFloor = Math.max(12, Math.ceil(99 * params.magnitudeFloorFactor));
    const [multiplicandMin, multiplicandMax] = target.max === 0 ? [10, 111] : [complexFloor, 99];
    for (const relaxed of relaxedTargets(effectiveTarget, floor)) {
      const pair = sampleMultiplicationPair(multiplicandMin, multiplicandMax, factorMin, factorMax, relaxed, random, {
        filter: a => a % 10 !== 0
      });
      if (pair) return buildMultiplicationQuestion(pair[0], pair[1], random);
    }
  }
  throw new Error(`当前难度无法生成符合要求的乘法竖式（${describeTarget(effectiveTarget)}），请调整难度`);
}

function generateVerticalDivision(
  params: VerticalParameters,
  withRemainder: boolean,
  random: RandomSource,
  mode: VerticalDivisionMode = 'mixed'
): Question {
  const { factorMin: divisorMin, factorMax: divisorMax, maxDividend, minQuotient } = params;
  const effectiveRemainder = mode === 'exact' ? false : mode === 'remainder' ? true : withRemainder;

  if (mode === 'zeroQuotient') {
    const sample = sampleDivision(divisorMin, divisorMax, Math.max(10, minQuotient), Math.floor(maxDividend / divisorMin), {
      remainder: effectiveRemainder,
      zeroQuotient: true,
      filter: candidate => candidate.dividend <= maxDividend
    }, random);
    if (sample) return buildDivisionQuestion(sample, random);
    throw new Error(`当前难度无法生成符合要求的除法竖式（除数 ${divisorMin}–${divisorMax}，商含 0，${effectiveRemainder ? '有余数' : '整除'}），请调整难度`);
  }

  if (mode === 'twoDigitDivisor') {
    const cap = Math.max(200, maxDividend);
    const divisorCeiling = Math.min(48, Math.max(16, Math.floor(cap / 4)));
    const sample = sampleDivision(11, divisorCeiling, 2, Math.floor(cap / 11), {
      remainder: effectiveRemainder,
      filter: candidate => {
        if (candidate.divisor % 10 === 0 || candidate.dividend > maxDividend) return false;
        const maxQuotient = Math.floor((cap - candidate.remainder) / candidate.divisor);
        const minQuotientForDivisor = maxQuotient >= 11 ? Math.min(11, maxQuotient) : 2;
        return candidate.quotient >= minQuotientForDivisor;
      }
    }, random);
    if (sample) return buildDivisionQuestion(sample, random);
    throw new Error(`当前难度无法生成符合要求的除法竖式（除数 11–${divisorCeiling}，${effectiveRemainder ? '有余数' : '整除'}），请调整难度`);
  }

  const sample = sampleDivision(divisorMin, divisorMax, minQuotient, Math.floor(maxDividend / divisorMin), {
    remainder: effectiveRemainder,
    filter: candidate => candidate.dividend <= maxDividend && candidate.quotient % 10 !== 0 && candidate.dividend % 10 !== 0
  }, random);
  if (sample) return buildDivisionQuestion(sample, random);
  throw new Error(`当前难度无法生成符合要求的除法竖式（除数 ${divisorMin}–${divisorMax}，商 ≥ ${minQuotient}，${effectiveRemainder ? '有余数' : '整除'}），请调整难度`);
}

function pageOperations(operations: VerticalOperation[], randomMix: boolean, random: RandomSource): VerticalOperation[] {
  if (operations.length === 1) {
    return Array<VerticalOperation>(VERTICAL_PAGE_SIZE).fill(operations[0]);
  }
  if (operations.length === 2) {
    const result = [...Array<VerticalOperation>(4).fill(operations[0]), ...Array<VerticalOperation>(4).fill(operations[1])];
    return randomMix ? shuffle(result, random) : result;
  }
  const result: VerticalOperation[] = [];
  for (let index = 0; index < VERTICAL_PAGE_SIZE; index++) {
    result.push(operations[index % operations.length]);
  }
  return randomMix ? shuffle(result, random) : result;
}

function markQuota(entries: PageEntry[], indices: number[], requested: number, field: 'complex' | 'remainder', random: RandomSource): void {
  for (const index of shuffle(indices, random).slice(0, requested)) entries[index][field] = true;
}

function indicesOf(entries: PageEntry[], operation: VerticalOperation): number[] {
  return entries.flatMap((entry, index) => entry.operation === operation ? [index] : []);
}

/** Remainder share for divisions: the division sub-mode overrides the profile rate. */
function effectiveRemainderRate(config: WorksheetConfig, params: VerticalParameters): number {
  return config.verticalDivisionMode === 'exact'
    ? 0
    : config.verticalDivisionMode === 'remainder'
      ? 1
      : params.remainderRate;
}

interface PageQuota {
  indices: number[];
  requested: number;
  field: 'complex' | 'remainder';
}

function buildPageEntries(config: WorksheetConfig, params: VerticalParameters, random: RandomSource): PageEntry[] {
  const entries = pageOperations(config.verticalOperations, config.randomMix, random).map(operation => ({ operation }));
  const quotas: PageQuota[] = [];
  if (config.practiceMode === 'verticalAddSub') {
    const requested = params.complexPerPage;
    if (config.verticalOperations.length === 1) {
      quotas.push({ indices: entries.map((_, index) => index), requested, field: 'complex' });
    } else {
      const [firstOperation, secondOperation] = random() < .5 ? config.verticalOperations : [...config.verticalOperations].reverse();
      quotas.push(
        { indices: indicesOf(entries, firstOperation), requested: Math.ceil(requested / 2), field: 'complex' },
        { indices: indicesOf(entries, secondOperation), requested: Math.floor(requested / 2), field: 'complex' }
      );
    }
  } else {
    const complexIndices = config.practiceMode === 'verticalMulDiv'
      ? indicesOf(entries, 'multiplication')
      : entries.flatMap((entry, index) => entry.operation !== 'division' ? [index] : []);
    const divisionIndices = indicesOf(entries, 'division');
    quotas.push(
      { indices: complexIndices, requested: Math.round(complexIndices.length * params.complexPerPage / VERTICAL_PAGE_SIZE), field: 'complex' },
      { indices: divisionIndices, requested: Math.round(divisionIndices.length * effectiveRemainderRate(config, params)), field: 'remainder' }
    );
  }
  for (const quota of quotas) markQuota(entries, quota.indices, quota.requested, quota.field, random);
  return entries;
}

function generateOne(params: VerticalParameters, entry: PageEntry, config: WorksheetConfig, random: RandomSource): Question {
  const target = regroupingTargetFor(params, Boolean(entry.complex));
  if (entry.operation === 'addition') return generateVerticalAddition(params, target, random);
  if (entry.operation === 'subtraction') return generateVerticalSubtraction(params, target, random, config.verticalSubtractionMode);
  if (entry.operation === 'multiplication') return generateVerticalMultiplication(params, target, random, config.verticalMultiplicationMode);
  return generateVerticalDivision(params, Boolean(entry.remainder), random, config.verticalDivisionMode);
}

/** Sub-mode overrides for single-question generation; each defaults to 'mixed' when omitted. */
export interface VerticalQuestionModes {
  subtraction?: VerticalSubtractionMode;
  multiplication?: VerticalMultiplicationMode;
  division?: VerticalDivisionMode;
}

/** Generate exactly one vertical question for registry handlers. */
export function generateVerticalQuestion(
  type: Question['type'],
  profile: ProblemProfile,
  random: RandomSource = Math.random,
  modes: VerticalQuestionModes = {}
): Question {
  const params = resolveVerticalParameters(profile);
  const target = regroupingTargetFor(params, params.complexTier);
  if (type === 'verticalAddition') return generateVerticalAddition(params, target, random);
  if (type === 'verticalSubtraction') return generateVerticalSubtraction(params, target, random, modes.subtraction);
  if (type === 'verticalMultiplication') return generateVerticalMultiplication(params, target, random, modes.multiplication);
  return generateVerticalDivision(params, params.complexTier, random, modes.division);
}

export function generateVerticalQuestions(config: WorksheetConfig, profile: ProblemProfile, random: RandomSource = Math.random): Question[] {
  const params = resolveVerticalParameters(profile);
  const questions: Question[] = [];
  const signatures = new Set<string>();
  for (let page = 0; page < config.verticalPages; page++) {
    for (const entry of buildPageEntries(config, params, random)) {
      let question: Question | undefined;
      // Sampler exhaustion is handled inside the generators (fallback chain,
      // then a loud error), so this loop only retries on duplicates: a null
      // sampler result never consumes the dedup budget.
      for (let attempt = 0; attempt < 4000; attempt++) {
        const candidate = generateOne(params, entry, config, random);
        if (config.allowDuplicates || !signatures.has(candidate.signature)) {
          question = candidate;
          break;
        }
      }
      if (!question) throw new Error(`当前竖式范围无法继续生成不重复题目（${entry.operation}题池已耗尽），请减少页数或允许重复`);
      questions.push(question);
      signatures.add(question.signature);
    }
  }
  return questions;
}
