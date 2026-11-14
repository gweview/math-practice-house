import { id, randomInt, shuffle } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';
import { VERTICAL_PAGE_SIZE, type Difficulty, type Question, type VerticalOperation, type WorksheetConfig } from '../types';

const COMPLEX_PER_PAGE: Record<Difficulty, number> = {
  entry: 2,
  easy: 3,
  standard: 4,
  advanced: 6,
  challenge: 7
};

const REMAINDER_RATE: Record<Difficulty, number> = {
  entry: 0,
  easy: .25,
  standard: .5,
  advanced: .75,
  challenge: .875
};

const MAGNITUDE_FLOOR: Record<Difficulty, number> = {
  entry: .35,
  easy: .5,
  standard: .62,
  advanced: .72,
  challenge: .8
};

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

function addSubMaximum(config: WorksheetConfig): number {
  if (config.rangeMode === 'curriculum') {
    if (config.stage === 'grade1') return 20;
    if (config.stage === 'grade2') return 100;
    return 1000;
  }
  return config.difficulty === 'entry' || config.difficulty === 'easy' ? 100 : 1000;
}

function minimumOperand(max: number, difficulty: Difficulty): number {
  if (max <= 20) return 2;
  if (max <= 100) return 10;
  return difficulty === 'entry' || difficulty === 'easy' ? 10 : 100;
}

function requiredRegroupings(max: number, difficulty: Difficulty, complex: boolean): number {
  if (!complex) return 0;
  return max >= 1000 && (difficulty === 'advanced' || difficulty === 'challenge') ? 2 : 1;
}

function generateVerticalAddition(config: WorksheetConfig, complex: boolean, random: RandomSource): Question {
  const max = addSubMaximum(config);
  const min = minimumOperand(max, config.difficulty);
  const floor = max <= 20
    ? config.difficulty === 'advanced' || config.difficulty === 'challenge' ? 12 : 10
    : Math.ceil(max * MAGNITUDE_FLOOR[config.difficulty]);
  const required = requiredRegroupings(max, config.difficulty, complex);

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

function generateVerticalSubtraction(config: WorksheetConfig, complex: boolean, random: RandomSource): Question {
  const max = addSubMaximum(config);
  const min = minimumOperand(max, config.difficulty);
  const floor = max <= 20
    ? config.difficulty === 'advanced' || config.difficulty === 'challenge' ? 12 : 10
    : Math.ceil(max * MAGNITUDE_FLOOR[config.difficulty]);
  const required = requiredRegroupings(max, config.difficulty, complex);

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

function multiplicationFactorRange(difficulty: Difficulty): [number, number] {
  if (difficulty === 'entry') return [2, 5];
  if (difficulty === 'easy') return [2, 6];
  if (difficulty === 'standard') return [3, 9];
  if (difficulty === 'advanced') return [5, 9];
  return [6, 9];
}

function generateVerticalMultiplication(config: WorksheetConfig, complex: boolean, random: RandomSource): Question {
  const [factorMin, factorMax] = multiplicationFactorRange(config.difficulty);
  const complexFloor = Math.max(12, Math.ceil(99 * MAGNITUDE_FLOOR[config.difficulty]));

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

function divisionLimits(difficulty: Difficulty): { maxDividend: number; minQuotient: number; divisorMin: number; divisorMax: number } {
  if (difficulty === 'entry') return { maxDividend: 200, minQuotient: 10, divisorMin: 2, divisorMax: 5 };
  if (difficulty === 'easy') return { maxDividend: 400, minQuotient: 12, divisorMin: 2, divisorMax: 6 };
  if (difficulty === 'standard') return { maxDividend: 600, minQuotient: 15, divisorMin: 3, divisorMax: 9 };
  if (difficulty === 'advanced') return { maxDividend: 800, minQuotient: 20, divisorMin: 4, divisorMax: 9 };
  return { maxDividend: 999, minQuotient: 30, divisorMin: 6, divisorMax: 9 };
}

function generateVerticalDivision(config: WorksheetConfig, withRemainder: boolean, random: RandomSource): Question {
  const limits = divisionLimits(config.difficulty);
  for (let attempt = 0; attempt < 3000; attempt++) {
    const divisor = randomInt(limits.divisorMin, limits.divisorMax, random);
    const remainder = withRemainder ? randomInt(1, divisor - 1, random) : 0;
    const quotientMax = Math.floor((limits.maxDividend - remainder) / divisor);
    if (quotientMax < limits.minQuotient) continue;
    const quotient = randomInt(limits.minQuotient, quotientMax, random);
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

function buildPageEntries(config: WorksheetConfig, random: RandomSource): PageEntry[] {
  const entries = pageOperations(config.verticalOperations, config.randomMix, random).map(operation => ({ operation }));
  if (config.practiceMode === 'verticalAddSub') {
    const requested = COMPLEX_PER_PAGE[config.difficulty];
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
    markQuota(entries, multiplicationIndices, Math.round(multiplicationIndices.length * COMPLEX_PER_PAGE[config.difficulty] / VERTICAL_PAGE_SIZE), 'complex', random);
    markQuota(entries, divisionIndices, Math.round(divisionIndices.length * REMAINDER_RATE[config.difficulty]), 'remainder', random);
  }
  return entries;
}

function generateOne(config: WorksheetConfig, entry: PageEntry, random: RandomSource): Question {
  if (entry.operation === 'addition') return generateVerticalAddition(config, Boolean(entry.complex), random);
  if (entry.operation === 'subtraction') return generateVerticalSubtraction(config, Boolean(entry.complex), random);
  if (entry.operation === 'multiplication') return generateVerticalMultiplication(config, Boolean(entry.complex), random);
  return generateVerticalDivision(config, Boolean(entry.remainder), random);
}

/** Generate exactly one vertical question for registry handlers. */
export function generateVerticalQuestion(type: Question['type'], config: WorksheetConfig, random: RandomSource = Math.random): Question {
  const operation: VerticalOperation = type === 'verticalAddition' ? 'addition'
    : type === 'verticalSubtraction' ? 'subtraction'
      : type === 'verticalMultiplication' ? 'multiplication' : 'division';
  const normalized: WorksheetConfig = {
    ...config,
    practiceMode: operation === 'addition' || operation === 'subtraction' ? 'verticalAddSub' : 'verticalMulDiv',
    verticalOperations: [operation], verticalPages: 1, count: VERTICAL_PAGE_SIZE, allowDuplicates: true
  };
  const complex = normalized.difficulty === 'challenge' || normalized.difficulty === 'advanced';
  if (operation === 'addition') return generateVerticalAddition(normalized, complex, random);
  if (operation === 'subtraction') return generateVerticalSubtraction(normalized, complex, random);
  if (operation === 'multiplication') return generateVerticalMultiplication(normalized, complex, random);
  return generateVerticalDivision(normalized, complex, random);
}

export function generateVerticalQuestions(config: WorksheetConfig, random: RandomSource = Math.random): Question[] {
  const questions: Question[] = [];
  const signatures = new Set<string>();
  for (let page = 0; page < config.verticalPages; page++) {
    for (const entry of buildPageEntries(config, random)) {
      let question: Question | undefined;
      for (let attempt = 0; attempt < 4000; attempt++) {
        const candidate = generateOne(config, entry, random);
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
