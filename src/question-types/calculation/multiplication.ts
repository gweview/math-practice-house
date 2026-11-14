import type { Difficulty, Question } from '../../domain/questions/model';
import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult } from '../../domain/questions/contracts';
import type { WorksheetConfig } from '../../domain/worksheet/config';
import type { RandomSource } from '../../shared/random/seeded-random';

type MultiplicationType =
  | 'multiplication' | 'division' | 'multiDigitMultiplication'
  | 'threeDigitByOneMultiplication' | 'twoDigitByTwoMultiplication'
  | 'remainderDivision' | 'mixedMulDiv';

function randomInt(min: number, max: number, random: RandomSource): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[], random: RandomSource): T {
  return items[randomInt(0, items.length - 1, random)];
}

function highFloor(min: number, max: number): number {
  return Math.max(min, Math.ceil(min + (max - min) * .6));
}

function sampleInt(min: number, max: number, highRangeRate: number, random: RandomSource): number {
  if (max <= min) return min;
  const lower = random() < highRangeRate ? highFloor(min, max) : min;
  return randomInt(lower, max, random);
}

function focusFactors(maxFactor: number, difficulty: Difficulty): number[] {
  const preferred: Record<Difficulty, number[]> = {
    entry: [2, 5],
    easy: [2, 5, 3, 4],
    standard: [2, 3, 4, 5, 6, 7, 8, 9],
    advanced: [6, 7, 8, 9, 3, 4],
    challenge: [6, 7, 8, 9, 10, 11, 12]
  };
  const available = preferred[difficulty].filter(value => value <= maxFactor);
  return available.length ? available : [Math.max(1, maxFactor)];
}

function expressionQuestion(input: QuestionGenerationInput, type: 'mixedMulDiv', operands: number[], operators: string[]): Question {
  const values = [...operands];
  const ops = [...operators];
  for (let index = 0; index < ops.length;) {
    if (ops[index] === '×' || ops[index] === '÷') {
      values.splice(index, 2, ops[index] === '×' ? values[index] * values[index + 1] : values[index] / values[index + 1]);
      ops.splice(index, 1);
    } else index++;
  }
  const answer = ops.reduce((result, op, index) => op === '+' ? result + values[index + 1] : result - values[index + 1], values[0]);
  const text = operands.map((value, index) => index ? `${operators[index - 1]} ${value}` : String(value)).join(' ') + ' =';
  return {
    id: input.createId(), type, text, answer, operands, operators,
    signature: `${type}:${text}`, layout: text.length > 15 ? 'wide' : 'inline',
    metadata: {
      terms: operands.length,
      mixed: new Set(operators).size > 1,
      trivial: operands.slice(1).some(value => value === 0),
      magnitude: Math.max(...operands)
    }
  };
}

export function generateMultiplication(input: QuestionGenerationInput): Question {
  const { profile, random } = effectiveInput(input);
  const a = pick(focusFactors(profile.maxFactor, input.config.difficulty), random);
  const trivial = random() < profile.trivialRate;
  const b = trivial ? 1 : randomInt(Math.min(2, profile.maxFactor), Math.max(1, profile.maxFactor), random);
  return {
    id: input.createId(), type: 'multiplication', text: `${a} × ${b} =`, answer: a * b,
    operands: [a, b], operators: ['×'], signature: `multiplication:${Math.min(a, b)}×${Math.max(a, b)}`, layout: 'inline',
    metadata: { factor: a, trivial: a === 1 || b === 1, magnitude: a * b }
  };
}

export function generateDivision(input: QuestionGenerationInput): Question {
  const { profile, random } = effectiveInput(input);
  const divisor = pick(focusFactors(profile.maxFactor, input.config.difficulty), random);
  const trivial = random() < profile.trivialRate;
  const quotient = trivial ? 1 : randomInt(Math.min(2, profile.maxFactor), Math.max(1, profile.maxFactor), random);
  const dividend = divisor * quotient;
  return {
    id: input.createId(), type: 'division', text: `${dividend} ÷ ${divisor} =`, answer: quotient,
    operands: [dividend, divisor], operators: ['÷'], signature: `division:${dividend}÷${divisor}`, layout: 'inline',
    metadata: { factor: divisor, trivial: quotient === 1, magnitude: dividend }
  };
}

export function generateMultiDigitMultiplication(input: QuestionGenerationInput): Question {
  const { profile, random } = effectiveInput(input);
  const upper = Math.max(10, Math.min(99, profile.max));
  const a = sampleInt(10, upper, profile.highRangeRate, random);
  const factorFloor = input.config.difficulty === 'entry' || input.config.difficulty === 'easy' ? 2 : input.config.difficulty === 'standard' ? 3 : 5;
  const b = randomInt(factorFloor, 9, random);
  return {
    id: input.createId(), type: 'multiDigitMultiplication', text: `${a} × ${b} =`, answer: a * b,
    operands: [a, b], operators: ['×'], signature: `multiDigitMultiplication:${a}×${b}`, layout: 'inline',
    metadata: { factor: b, magnitude: a, regrouping: a % 10 * b >= 10 }
  };
}

function multiplicationRegroupingCount(multiplicand: number, multiplier: number): number {
  let value = multiplicand;
  let carry = 0;
  let count = 0;
  while (value > 0) {
    const total = (value % 10) * multiplier + carry;
    if (total >= 10) count++;
    carry = Math.floor(total / 10);
    value = Math.floor(value / 10);
  }
  return count;
}

export function generateThreeDigitByOneMultiplication(input: QuestionGenerationInput): Question {
  const { profile, random } = effectiveInput(input);
  const upper = Math.max(100, Math.min(999, profile.max));
  const multiplicand = sampleInt(100, upper, profile.highRangeRate, random);
  const multiplierFloor = input.config.difficulty === 'entry' || input.config.difficulty === 'easy' ? 2 : input.config.difficulty === 'standard' ? 3 : 5;
  const multiplier = randomInt(multiplierFloor, 9, random);
  const regroupingCount = multiplicationRegroupingCount(multiplicand, multiplier);
  return {
    id: input.createId(), type: 'threeDigitByOneMultiplication', text: `${multiplicand} × ${multiplier} =`,
    answer: multiplicand * multiplier, operands: [multiplicand, multiplier], operators: ['×'],
    signature: `threeDigitByOneMultiplication:${multiplicand}×${multiplier}`, layout: 'inline',
    metadata: { factor: multiplier, magnitude: multiplicand, regrouping: regroupingCount > 0, regroupingCount }
  };
}

export function generateTwoDigitByTwoMultiplication(input: QuestionGenerationInput): Question {
  const { profile, random } = effectiveInput(input);
  const upper = Math.max(10, Math.min(99, profile.max));
  const left = sampleInt(10, upper, profile.highRangeRate, random);
  const right = sampleInt(10, upper, profile.highRangeRate, random);
  return {
    id: input.createId(), type: 'twoDigitByTwoMultiplication', text: `${left} × ${right} =`,
    answer: left * right, operands: [left, right], operators: ['×'],
    signature: `twoDigitByTwoMultiplication:${Math.min(left, right)}×${Math.max(left, right)}`, layout: 'inline',
    metadata: { magnitude: Math.max(left, right), trivial: false }
  };
}

export function generateRemainderDivision(input: QuestionGenerationInput): Question {
  const { profile, random } = effectiveInput(input);
  const divisorMin = input.config.difficulty === 'entry' || input.config.difficulty === 'easy' ? 2 : 3;
  const divisor = randomInt(divisorMin, 9, random);
  const remainder = randomInt(1, divisor - 1, random);
  const quotientMax = Math.max(1, Math.min(99, Math.floor((profile.max - remainder) / divisor)));
  const quotientMin = input.config.difficulty === 'advanced' || input.config.difficulty === 'challenge' ? Math.min(10, quotientMax) : 1;
  const quotient = randomInt(quotientMin, quotientMax, random);
  const dividend = divisor * quotient + remainder;
  return {
    id: input.createId(), type: 'remainderDivision', text: `${dividend} ÷ ${divisor} =`, answer: `${quotient}……${remainder}`,
    operands: [dividend, divisor], operators: ['÷'], signature: `remainderDivision:${dividend}÷${divisor}`, layout: 'inline',
    metadata: { quotient, remainder, magnitude: dividend }
  };
}

export function generateMixedMulDiv(input: QuestionGenerationInput): Question {
  const { profile, random } = effectiveInput(input);
  const minimum = random() < profile.trivialRate ? 1 : 2;
  let a = minimum;
  let b = minimum;
  let divisor = minimum;
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidateA = randomInt(minimum, profile.maxFactor, random);
    const candidateB = randomInt(minimum, profile.maxFactor, random);
    const candidateDivisor = randomInt(minimum, profile.maxFactor, random);
    if (candidateA * candidateB * candidateDivisor <= profile.max) {
      a = candidateA;
      b = candidateB;
      divisor = candidateDivisor;
      break;
    }
  }
  const product = a * b * divisor;
  return random() < .5
    ? expressionQuestion(input, 'mixedMulDiv', [a * divisor, b, divisor], ['×', '÷'])
    : expressionQuestion(input, 'mixedMulDiv', [product, divisor, b], ['÷', '÷']);
}

function effectiveInput(input: QuestionGenerationInput): QuestionGenerationInput {
  const directive = input.directive;
  return {
    ...input,
    profile: {
      ...input.profile,
      highRangeRate: directive?.highRange === undefined ? input.profile.highRangeRate : Number(directive.highRange),
      trivialRate: directive?.trivial === undefined ? input.profile.trivialRate : Number(directive.trivial),
      mixedRate: directive?.mixed === undefined ? input.profile.mixedRate : Number(directive.mixed)
    }
  };
}

export const generateMultiplicationQuestion = generateMultiplication;
export const generateDivisionQuestion = generateDivision;
export const generateMultiDigitMultiplicationQuestion = generateMultiDigitMultiplication;
export const generateThreeDigitByOneMultiplicationQuestion = generateThreeDigitByOneMultiplication;
export const generateTwoDigitByTwoMultiplicationQuestion = generateTwoDigitByTwoMultiplication;
export const generateRemainderDivisionQuestion = generateRemainderDivision;
export const generateMixedMulDivQuestion = generateMixedMulDiv;

const CURRICULUM_MAXIMUMS: Readonly<Record<WorksheetConfig['stage'], number>> = {
  preschool: 10, grade1: 20, grade2: 100, grade3: 1000,
  grade4: 100_000_000, grade5: 100_000_000, grade6: 100_000_000
};

function expectedMixedAnswer(operands: number[], operators: string[]): number {
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

function metadataErrors(question: Question, expected: Record<string, string | number | boolean | undefined>): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(expected)) {
    if (value !== undefined && question.metadata?.[key] !== value) errors.push(`${key}元数据错误`);
  }
  return errors;
}

function commonValidation(question: Question, type: MultiplicationType, config: WorksheetConfig, definition?: QuestionDefinition): string[] {
  const errors: string[] = [];
  if (question.type !== type) return [`校验器题型不匹配：${type}`];
  if (!Array.isArray(question.operands)) return ['操作数无效'];
  if (question.operands.some(value => !Number.isFinite(value) || value < 0)) errors.push('操作数无效');
  const maximum = definition?.difficultyProfiles.standard?.max;
  if (Number.isFinite(maximum) && question.operands.some(value => value > (maximum as number))) errors.push('题目超过该题型难度上限');
  if (config.rangeMode === 'curriculum') {
    const cap = CURRICULUM_MAXIMUMS[config.stage];
    if (question.operands.some(value => value > cap)) errors.push('题目超过当前学习阶段范围');
  }
  return errors;
}

function validateMultiplicationQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  const errors = commonValidation(question, 'multiplication', config, definition);
  if (!Array.isArray(question.operands)) return { valid: false, errors };
  const [a, b] = question.operands;
  if (question.operands.length !== 2 || question.operators?.[0] !== '×' || question.operators.length !== 1) errors.push('乘法格式无效');
  if (a < 1 || a > 12 || b < 1 || b > 12) errors.push('表内乘法边界无效');
  if (question.answer !== a * b) errors.push('答案错误');
  errors.push(...metadataErrors(question, { factor: a, trivial: a === 1 || b === 1, magnitude: a * b }));
  return { valid: errors.length === 0, errors };
}

function validateDivisionQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  const errors = commonValidation(question, 'division', config, definition);
  if (!Array.isArray(question.operands)) return { valid: false, errors };
  const [dividend, divisor] = question.operands;
  if (question.operands.length !== 2 || question.operators?.[0] !== '÷' || question.operators.length !== 1) errors.push('除法格式无效');
  if (divisor < 1 || divisor > 12 || dividend < 1 || dividend > 144 || dividend % divisor !== 0) errors.push('除法边界或整除条件无效');
  if (question.answer !== dividend / divisor) errors.push('答案错误');
  errors.push(...metadataErrors(question, { factor: divisor, trivial: dividend / divisor === 1, magnitude: dividend }));
  return { valid: errors.length === 0, errors };
}

function validateProductQuestion(question: Question, type: 'multiDigitMultiplication' | 'threeDigitByOneMultiplication' | 'twoDigitByTwoMultiplication', config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  const errors = commonValidation(question, type, config, definition);
  if (!Array.isArray(question.operands)) return { valid: false, errors };
  const [a, b] = question.operands;
  if (question.operands.length !== 2 || question.operators?.[0] !== '×' || question.operators.length !== 1) errors.push('乘法格式无效');
  const validBounds = type === 'multiDigitMultiplication'
    ? a >= 10 && a <= 99 && b >= 2 && b <= 9
    : type === 'threeDigitByOneMultiplication'
      ? a >= 100 && a <= 999 && b >= 2 && b <= 9
      : a >= 10 && a <= 99 && b >= 10 && b <= 99;
  if (!validBounds) errors.push('乘法位数边界无效');
  if (question.answer !== a * b) errors.push('答案错误');
  const regrouping = type === 'multiDigitMultiplication' ? a % 10 * b >= 10 : undefined;
  const regroupingCount = type === 'threeDigitByOneMultiplication' ? multiplicationRegroupingCount(a, b) : undefined;
  errors.push(...metadataErrors(question, type === 'multiDigitMultiplication'
    ? { factor: b, magnitude: a, regrouping }
    : type === 'threeDigitByOneMultiplication'
      ? { factor: b, magnitude: a, regrouping: regroupingCount !== undefined && regroupingCount > 0, regroupingCount }
      : { magnitude: Math.max(a, b), trivial: false }));
  return { valid: errors.length === 0, errors };
}

function validateRemainderDivisionQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  const errors = commonValidation(question, 'remainderDivision', config, definition);
  if (!Array.isArray(question.operands)) return { valid: false, errors };
  const [dividend, divisor] = question.operands;
  const quotient = divisor ? Math.floor(dividend / divisor) : NaN;
  const remainder = divisor ? dividend % divisor : NaN;
  if (question.operands.length !== 2 || question.operators?.[0] !== '÷' || question.operators.length !== 1) errors.push('除法格式无效');
  if (dividend < 3 || divisor < 2 || divisor > 9 || remainder <= 0 || remainder >= divisor || quotient < 1) errors.push('余数除法边界无效');
  if (question.answer !== `${quotient}……${remainder}`) errors.push('余数答案错误');
  errors.push(...metadataErrors(question, { quotient, remainder, magnitude: dividend }));
  return { valid: errors.length === 0, errors };
}

function validateMixedMulDivQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  const errors = commonValidation(question, 'mixedMulDiv', config, definition);
  if (!Array.isArray(question.operands)) return { valid: false, errors };
  const [a, b, c] = question.operands;
  const operators = Array.isArray(question.operators) ? question.operators : [];
  const shape = operators.length === 2 && ((operators[0] === '×' && operators[1] === '÷') || (operators[0] === '÷' && operators[1] === '÷'));
  const firstMaximum = definition?.difficultyProfiles.standard?.max ?? 1728;
  if (question.operands.length !== 3 || !shape || a < 1 || a > firstMaximum || b < 1 || b > 12 || c < 1 || c > 12) errors.push('乘除混合边界无效');
  if (operators[0] === '÷' && (b === 0 || a % b !== 0)) errors.push('除法不能整除');
  if (operators[1] === '÷') {
    const intermediate = operators[0] === '×' ? a * b : a / b;
    if (c === 0 || intermediate % c !== 0) errors.push('除法不能整除');
  }
  if (question.answer !== expectedMixedAnswer(question.operands, operators)) errors.push('答案错误');
  errors.push(...metadataErrors(question, { terms: 3, mixed: new Set(operators).size > 1, trivial: false, magnitude: Math.max(...question.operands) }));
  return { valid: errors.length === 0, errors };
}

export const validateMultiplication = (question: Question, config: WorksheetConfig, definition?: QuestionDefinition) => validateMultiplicationQuestion(question, config, definition);
export const validateDivision = (question: Question, config: WorksheetConfig, definition?: QuestionDefinition) => validateDivisionQuestion(question, config, definition);
export const validateMultiDigitMultiplication = (question: Question, config: WorksheetConfig, definition?: QuestionDefinition) => validateProductQuestion(question, 'multiDigitMultiplication', config, definition);
export const validateThreeDigitByOneMultiplication = (question: Question, config: WorksheetConfig, definition?: QuestionDefinition) => validateProductQuestion(question, 'threeDigitByOneMultiplication', config, definition);
export const validateTwoDigitByTwoMultiplication = (question: Question, config: WorksheetConfig, definition?: QuestionDefinition) => validateProductQuestion(question, 'twoDigitByTwoMultiplication', config, definition);
export const validateRemainderDivision = (question: Question, config: WorksheetConfig, definition?: QuestionDefinition) => validateRemainderDivisionQuestion(question, config, definition);
export const validateMixedMulDiv = (question: Question, config: WorksheetConfig, definition?: QuestionDefinition) => validateMixedMulDivQuestion(question, config, definition);

export type { MultiplicationType };
