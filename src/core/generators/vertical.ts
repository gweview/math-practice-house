import { id, pick, randomInt, shuffle } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';
import {
  additionRegroupingCount,
  multiplicationRegroupingCount,
  subtractionRegroupingCount
} from '../../domain/math-core/regrouping';
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

function generateVerticalAddition(params: VerticalParameters, complex: boolean, random: RandomSource): Question {
  const { max, minOperand: min } = params;
  const floor = addSubFloor(params);
  const required = complex ? (params.doubleRegrouping ? 2 : 1) : 0;

  for (let attempt = 0; attempt < 4000; attempt++) {
    const a = randomInt(min, Math.max(min, max - min), random);
    const b = randomInt(min, Math.max(min, max - min), random);
    const sum = a + b;
    if (sum < floor || sum > max || a % 10 === 0 || b % 10 === 0 || a === b) continue;
    const regroupingCount = additionRegroupingCount(a, b);
    if (complex ? regroupingCount < required : regroupingCount !== 0) continue;
    const low = Math.min(a, b), high = Math.max(a, b);
    return {
      id: id(random), type: 'verticalAddition', text: `${a} + ${b} =`, answer: sum,
      operands: [a, b], operators: ['+'], signature: `verticalAddition:${low}+${high}`, layout: 'vertical',
      metadata: { regrouping: regroupingCount > 0, regroupingCount, trivial: false, magnitude: sum }
    };
  }
  throw new Error('当前范围无法生成符合难度的加法竖式，请调整年级或难度');
}

function generateVerticalSubtraction(
  params: VerticalParameters,
  complex: boolean,
  random: RandomSource,
  mode: VerticalSubtractionMode = 'mixed'
): Question {
  const { max, minOperand: min } = params;
  const floor = addSubFloor(params);
  const required = complex ? (params.doubleRegrouping ? 2 : 1) : 0;

  if (mode === 'acrossZero') {
    const cap = Math.max(40, max);
    const minimumDifference = cap <= 20 ? 2 : cap <= 100 ? 10 : 10;
    for (let attempt = 0; attempt < 2000; attempt++) {
      let a: number;
      if (cap >= 200) {
        const hundreds = randomInt(2, Math.max(2, Math.floor(cap / 100)), random);
        const zeroTens = random() < .65;
        const ones = zeroTens ? randomInt(0, 8, random) : 0;
        const tens = zeroTens ? 0 : randomInt(1, 8, random);
        a = Math.min(cap, hundreds * 100 + tens * 10 + ones);
        if (a % 10 !== 0 && Math.floor(a / 10) % 10 !== 0) a = hundreds * 100 + randomInt(0, 8, random);
      } else {
        const tens = randomInt(3, Math.max(3, Math.floor(cap / 10)), random);
        a = Math.min(cap, tens * 10);
      }
      if (a <= min + minimumDifference) continue;
      const bOnes = randomInt(Math.max(1, a % 10 + 1), 9, random);
      const bTens = a >= 100 ? randomInt(Math.max(1, Math.floor(a / 10) % 10 + 1), 9, random) : randomInt(1, Math.max(1, Math.floor((a - minimumDifference) / 10)), random);
      const bHundreds = a >= 200 ? randomInt(0, Math.max(0, Math.floor((a - minimumDifference - bTens * 10 - bOnes) / 100)), random) : 0;
      const b = bHundreds * 100 + bTens * 10 + bOnes;
      const difference = a - b;
      if (b < min || difference < minimumDifference || b % 10 === 0) continue;
      const regroupingCount = subtractionRegroupingCount(a, b);
      if (regroupingCount < 1) continue;
      return {
        id: id(random), type: 'verticalSubtraction', text: `${a} - ${b} =`, answer: difference,
        operands: [a, b], operators: ['-'], signature: `verticalSubtraction:${a}-${b}`, layout: 'vertical',
        metadata: { regrouping: true, regroupingCount, trivial: false, magnitude: a }
      };
    }
  }

  for (let attempt = 0; attempt < 4000; attempt++) {
    const a = randomInt(Math.max(floor, min + 1), max, random);
    const b = randomInt(min, a - 1, random);
    const difference = a - b;
    const minimumDifference = max <= 20 ? 2 : max <= 100 ? 10 : 100;
    if (difference < minimumDifference || a % 10 === 0 || b % 10 === 0) continue;
    const regroupingCount = subtractionRegroupingCount(a, b);
    if (complex ? regroupingCount < required : regroupingCount !== 0) continue;
    return {
      id: id(random), type: 'verticalSubtraction', text: `${a} - ${b} =`, answer: difference,
      operands: [a, b], operators: ['-'], signature: `verticalSubtraction:${a}-${b}`, layout: 'vertical',
      metadata: { regrouping: regroupingCount > 0, regroupingCount, trivial: false, magnitude: a }
    };
  }
  throw new Error('当前范围无法生成符合难度的减法竖式，请调整年级或难度');
}

function generateVerticalMultiplication(
  params: VerticalParameters,
  complex: boolean,
  random: RandomSource,
  mode: VerticalMultiplicationMode = 'mixed'
): Question {
  const { factorMin, factorMax, max } = params;

  if (mode === 'threeByOne') {
    const upperA = Math.max(199, Math.min(999, Math.floor(Math.max(max, 600) / factorMin)));
    const lowerA = Math.min(101, upperA - 20);
    for (let attempt = 0; attempt < 2500; attempt++) {
      const b = randomInt(factorMin, factorMax, random);
      const maxA = Math.min(999, Math.max(120, Math.floor(Math.max(max, 900) / b)));
      const a = randomInt(Math.min(lowerA, maxA - 5), maxA, random);
      if (a < 100 || a % 10 === 0 || a * b > max) continue;
      const regroupingCount = multiplicationRegroupingCount(a, b);
      const regrouping = regroupingCount > 0;
      if (complex && !regrouping) continue;
      return {
        id: id(random), type: 'verticalMultiplication', text: `${a} × ${b} =`, answer: a * b,
        operands: [a, b], operators: ['×'], signature: `verticalMultiplication:${a}×${b}`, layout: 'vertical',
        metadata: { regrouping, regroupingCount, factor: b, trivial: false, magnitude: a * b }
      };
    }
  }

  if (mode === 'twoByTwo') {
    for (let attempt = 0; attempt < 2500; attempt++) {
      const a = randomInt(11, Math.min(99, Math.max(24, Math.floor(Math.sqrt(max) * 1.4))), random);
      const maxB = Math.min(99, Math.max(12, Math.floor(max / a)));
      const b = randomInt(11, maxB, random);
      if (a % 10 === 0 || b % 10 === 0 || a * b > max) continue;
      const regroupingCount = multiplicationRegroupingCount(a, b);
      const regrouping = regroupingCount > 0;
      if (complex && !regrouping) continue;
      return {
        id: id(random), type: 'verticalMultiplication', text: `${a} × ${b} =`, answer: a * b,
        operands: [a, b], operators: ['×'], signature: `verticalMultiplication:${a}×${b}`, layout: 'vertical',
        metadata: { regrouping, regroupingCount, factor: b, trivial: false, magnitude: a * b }
      };
    }
  }

  const complexFloor = Math.max(12, Math.ceil(99 * params.magnitudeFloorFactor));
  // Carry-free two-digit multiplicands depend only on the factor, so build
  // each factor's list once per question instead of on every attempt.
  const simpleCandidatesByFactor = new Map<number, number[]>();
  const simpleCandidatesFor = (factor: number): number[] => {
    const cached = simpleCandidatesByFactor.get(factor);
    if (cached) return cached;
    const candidates = Array.from({ length: 102 }, (_, index) => index + 10)
      .filter(value => value % 10 !== 0 && multiplicationRegroupingCount(value, factor) === 0);
    simpleCandidatesByFactor.set(factor, candidates);
    return candidates;
  };

  for (let attempt = 0; attempt < 3000; attempt++) {
    const b = randomInt(factorMin, factorMax, random);
    const a = complex
      ? randomInt(complexFloor, 99, random)
      : pick(simpleCandidatesFor(b), random);
    if (!Number.isFinite(a) || a % 10 === 0) continue;
    const regroupingCount = multiplicationRegroupingCount(a, b);
    const regrouping = regroupingCount > 0;
    if (regrouping !== complex) continue;
    return {
      id: id(random), type: 'verticalMultiplication', text: `${a} × ${b} =`, answer: a * b,
      operands: [a, b], operators: ['×'], signature: `verticalMultiplication:${a}×${b}`, layout: 'vertical',
      metadata: { regrouping, regroupingCount, factor: b, trivial: false, magnitude: a * b }
    };
  }
  throw new Error('当前难度无法生成符合要求的乘法竖式，请调整难度');
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
    for (let attempt = 0; attempt < 2500; attempt++) {
      const divisor = randomInt(divisorMin, divisorMax, random);
      const remainder = effectiveRemainder ? randomInt(1, divisor - 1, random) : 0;
      const maxQ = Math.floor((maxDividend - remainder) / divisor);
      const candidates: number[] = [];
      for (let q = Math.max(10, minQuotient); q <= maxQ; q++) {
        if (String(q).includes('0')) candidates.push(q);
      }
      if (!candidates.length) continue;
      const quotient = candidates[randomInt(0, candidates.length - 1, random)];
      const dividend = divisor * quotient + remainder;
      const answer = remainder ? `${quotient}……${remainder}` : quotient;
      return {
        id: id(random), type: 'verticalDivision', text: `${dividend} ÷ ${divisor} =`, answer,
        operands: [dividend, divisor], operators: ['÷'], signature: `verticalDivision:${dividend}÷${divisor}`, layout: 'longDivision',
        metadata: { quotient, remainder, trivial: false, magnitude: dividend, longDivision: true }
      };
    }
  }

  if (mode === 'twoDigitDivisor') {
    const cap = Math.max(200, maxDividend);
    for (let attempt = 0; attempt < 2500; attempt++) {
      const divisor = randomInt(11, Math.min(48, Math.max(16, Math.floor(cap / 4))), random);
      if (divisor % 10 === 0) continue;
      const remainder = effectiveRemainder ? randomInt(1, divisor - 1, random) : 0;
      const maxQ = Math.floor((cap - remainder) / divisor);
      if (maxQ < 2) continue;
      const minQ = maxQ >= 11 ? Math.min(11, maxQ) : 2;
      const quotient = randomInt(minQ, maxQ, random);
      const dividend = divisor * quotient + remainder;
      if (dividend > maxDividend) continue;
      const answer = remainder ? `${quotient}……${remainder}` : quotient;
      return {
        id: id(random), type: 'verticalDivision', text: `${dividend} ÷ ${divisor} =`, answer,
        operands: [dividend, divisor], operators: ['÷'], signature: `verticalDivision:${dividend}÷${divisor}`, layout: 'longDivision',
        metadata: { quotient, remainder, trivial: false, magnitude: dividend, longDivision: true }
      };
    }
  }

  for (let attempt = 0; attempt < 3000; attempt++) {
    const divisor = randomInt(divisorMin, divisorMax, random);
    const remainder = effectiveRemainder ? randomInt(1, divisor - 1, random) : 0;
    const quotientMax = Math.floor((maxDividend - remainder) / divisor);
    if (quotientMax < minQuotient) continue;
    const quotient = randomInt(minQuotient, quotientMax, random);
    const dividend = divisor * quotient + remainder;
    if (quotient % 10 === 0 || dividend % 10 === 0) continue;
    const answer = remainder ? `${quotient}……${remainder}` : quotient;
    return {
      id: id(random), type: 'verticalDivision', text: `${dividend} ÷ ${divisor} =`, answer,
      operands: [dividend, divisor], operators: ['÷'], signature: `verticalDivision:${dividend}÷${divisor}`, layout: 'longDivision',
      metadata: { quotient, remainder, trivial: false, magnitude: dividend, longDivision: true }
    };
  }
  throw new Error('当前难度无法生成符合要求的除法竖式，请调整难度');
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
  if (entry.operation === 'addition') return generateVerticalAddition(params, Boolean(entry.complex), random);
  if (entry.operation === 'subtraction') return generateVerticalSubtraction(params, Boolean(entry.complex), random, config.verticalSubtractionMode);
  if (entry.operation === 'multiplication') return generateVerticalMultiplication(params, Boolean(entry.complex), random, config.verticalMultiplicationMode);
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
  const complex = params.complexTier;
  if (type === 'verticalAddition') return generateVerticalAddition(params, complex, random);
  if (type === 'verticalSubtraction') return generateVerticalSubtraction(params, complex, random, modes.subtraction);
  if (type === 'verticalMultiplication') return generateVerticalMultiplication(params, complex, random, modes.multiplication);
  return generateVerticalDivision(params, complex, random, modes.division);
}

export function generateVerticalQuestions(config: WorksheetConfig, profile: ProblemProfile, random: RandomSource = Math.random): Question[] {
  const params = resolveVerticalParameters(profile);
  const questions: Question[] = [];
  const signatures = new Set<string>();
  for (let page = 0; page < config.verticalPages; page++) {
    for (const entry of buildPageEntries(config, params, random)) {
      let question: Question | undefined;
      for (let attempt = 0; attempt < 4000; attempt++) {
        const candidate = generateOne(params, entry, config, random);
        if (config.allowDuplicates || !signatures.has(candidate.signature)) {
          question = candidate;
          break;
        }
      }
      if (!question) throw new Error('当前竖式范围无法继续生成不重复题目，请减少页数或允许重复');
      questions.push(question);
      signatures.add(question.signature);
    }
  }
  return questions;
}
