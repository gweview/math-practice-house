import { id, randomInt, shuffle } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';
import { VERTICAL_PAGE_SIZE, type ProblemProfile, type Question, type VerticalOperation, type WorksheetConfig } from '../types';

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

function regroupingCountForAddition(a: number, b: number): number {
  let left = a, right = b, carry = 0, count = 0;
  while (left > 0 || right > 0) {
    const sum = left % 10 + right % 10 + carry;
    carry = sum >= 10 ? 1 : 0;
    if (carry) count++;
    left = Math.floor(left / 10);
    right = Math.floor(right / 10);
  }
  return count;
}

function regroupingCountForSubtraction(a: number, b: number): number {
  let left = a, right = b, borrow = 0, count = 0;
  while (left > 0 || right > 0) {
    const topDigit = left % 10 - borrow;
    const bottomDigit = right % 10;
    if (topDigit < bottomDigit) {
      borrow = 1;
      count++;
    } else borrow = 0;
    left = Math.floor(left / 10);
    right = Math.floor(right / 10);
  }
  return count;
}

function regroupingCountForMultiplication(multiplicand: number, factor: number): number {
  let carry = 0, count = 0;
  while (multiplicand > 0) {
    const product = multiplicand % 10 * factor + carry;
    carry = Math.floor(product / 10);
    if (carry > 0) count++;
    multiplicand = Math.floor(multiplicand / 10);
  }
  return count;
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
    const regroupingCount = regroupingCountForAddition(a, b);
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

function generateVerticalSubtraction(params: VerticalParameters, complex: boolean, random: RandomSource): Question {
  const { max, minOperand: min } = params;
  const floor = addSubFloor(params);
  const required = complex ? (params.doubleRegrouping ? 2 : 1) : 0;

  for (let attempt = 0; attempt < 4000; attempt++) {
    const a = randomInt(Math.max(floor, min + 1), max, random);
    const b = randomInt(min, a - 1, random);
    const difference = a - b;
    const minimumDifference = max <= 20 ? 2 : max <= 100 ? 10 : 100;
    if (difference < minimumDifference || a % 10 === 0 || b % 10 === 0) continue;
    const regroupingCount = regroupingCountForSubtraction(a, b);
    if (complex ? regroupingCount < required : regroupingCount !== 0) continue;
    return {
      id: id(random), type: 'verticalSubtraction', text: `${a} - ${b} =`, answer: difference,
      operands: [a, b], operators: ['-'], signature: `verticalSubtraction:${a}-${b}`, layout: 'vertical',
      metadata: { regrouping: regroupingCount > 0, regroupingCount, trivial: false, magnitude: a }
    };
  }
  throw new Error('当前范围无法生成符合难度的减法竖式，请调整年级或难度');
}

function generateVerticalMultiplication(params: VerticalParameters, complex: boolean, random: RandomSource): Question {
  const { factorMin, factorMax } = params;
  const complexFloor = Math.max(12, Math.ceil(99 * params.magnitudeFloorFactor));

  for (let attempt = 0; attempt < 3000; attempt++) {
    const b = randomInt(factorMin, factorMax, random);
    const simpleCandidates = complex ? [] : Array.from({ length: 102 }, (_, index) => index + 10)
      .filter(value => value % 10 !== 0 && regroupingCountForMultiplication(value, b) === 0);
    const a = complex
      ? randomInt(complexFloor, 99, random)
      : simpleCandidates[randomInt(0, simpleCandidates.length - 1, random)];
    if (!Number.isFinite(a) || a % 10 === 0) continue;
    const regroupingCount = regroupingCountForMultiplication(a, b);
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

function generateVerticalDivision(params: VerticalParameters, withRemainder: boolean, random: RandomSource): Question {
  const { factorMin: divisorMin, factorMax: divisorMax, maxDividend, minQuotient } = params;
  for (let attempt = 0; attempt < 3000; attempt++) {
    const divisor = randomInt(divisorMin, divisorMax, random);
    const remainder = withRemainder ? randomInt(1, divisor - 1, random) : 0;
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
  const result = operations.length === 1
    ? Array<VerticalOperation>(VERTICAL_PAGE_SIZE).fill(operations[0])
    : [...Array<VerticalOperation>(4).fill(operations[0]), ...Array<VerticalOperation>(4).fill(operations[1])];
  return randomMix ? shuffle(result, random) : result;
}

function markQuota(entries: PageEntry[], indices: number[], requested: number, field: 'complex' | 'remainder', random: RandomSource): void {
  for (const index of shuffle(indices, random).slice(0, requested)) entries[index][field] = true;
}

function buildPageEntries(config: WorksheetConfig, params: VerticalParameters, random: RandomSource): PageEntry[] {
  const entries = pageOperations(config.verticalOperations, config.randomMix, random).map(operation => ({ operation }));
  if (config.practiceMode === 'verticalAddSub') {
    const requested = params.complexPerPage;
    if (config.verticalOperations.length === 1) {
      markQuota(entries, entries.map((_, index) => index), requested, 'complex', random);
    } else {
      const [firstOperation, secondOperation] = random() < .5 ? config.verticalOperations : [...config.verticalOperations].reverse();
      const firstIndices = entries.flatMap((entry, index) => entry.operation === firstOperation ? [index] : []);
      const secondIndices = entries.flatMap((entry, index) => entry.operation === secondOperation ? [index] : []);
      markQuota(entries, firstIndices, Math.ceil(requested / 2), 'complex', random);
      markQuota(entries, secondIndices, Math.floor(requested / 2), 'complex', random);
    }
  } else {
    const multiplicationIndices = entries.flatMap((entry, index) => entry.operation === 'multiplication' ? [index] : []);
    const divisionIndices = entries.flatMap((entry, index) => entry.operation === 'division' ? [index] : []);
    markQuota(entries, multiplicationIndices, Math.round(multiplicationIndices.length * params.complexPerPage / VERTICAL_PAGE_SIZE), 'complex', random);
    markQuota(entries, divisionIndices, Math.round(divisionIndices.length * params.remainderRate), 'remainder', random);
  }
  return entries;
}

function generateOne(params: VerticalParameters, entry: PageEntry, random: RandomSource): Question {
  if (entry.operation === 'addition') return generateVerticalAddition(params, Boolean(entry.complex), random);
  if (entry.operation === 'subtraction') return generateVerticalSubtraction(params, Boolean(entry.complex), random);
  if (entry.operation === 'multiplication') return generateVerticalMultiplication(params, Boolean(entry.complex), random);
  return generateVerticalDivision(params, Boolean(entry.remainder), random);
}

/** Generate exactly one vertical question for registry handlers. */
export function generateVerticalQuestion(type: Question['type'], profile: ProblemProfile, random: RandomSource = Math.random): Question {
  const params = resolveVerticalParameters(profile);
  const complex = params.complexTier;
  if (type === 'verticalAddition') return generateVerticalAddition(params, complex, random);
  if (type === 'verticalSubtraction') return generateVerticalSubtraction(params, complex, random);
  if (type === 'verticalMultiplication') return generateVerticalMultiplication(params, complex, random);
  return generateVerticalDivision(params, complex, random);
}

export function generateVerticalQuestions(config: WorksheetConfig, profile: ProblemProfile, random: RandomSource = Math.random): Question[] {
  const params = resolveVerticalParameters(profile);
  const questions: Question[] = [];
  const signatures = new Set<string>();
  for (let page = 0; page < config.verticalPages; page++) {
    for (const entry of buildPageEntries(config, params, random)) {
      let question: Question | undefined;
      for (let attempt = 0; attempt < 4000; attempt++) {
        const candidate = generateOne(params, entry, random);
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
