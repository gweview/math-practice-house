import { generateFillBlank as generateFillBlankCore } from '../../core/generators/fill-blank';
import { generateVerticalQuestion } from '../../core/generators/vertical';
import { attachCreateId, randomInt } from '../../core/random-utils';
import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import type { Question } from '../../domain/questions/model';
import type { WorksheetConfig } from '../../domain/worksheet/config';
import type { RandomSource } from '../../shared/random/seeded-random';

type FillType = 'fillBlank' | 'multiplicationBlank' | 'verticalAddition' | 'verticalSubtraction' | 'verticalMultiplication' | 'verticalDivision';

function randomWithId(input: QuestionGenerationInput): RandomSource {
  return attachCreateId(input.random, input.createId);
}

/** The legacy fillBlank generator is retained as an algorithm, but receives
 * worksheet-scoped randomness and IDs at this boundary. */
export function generateFillBlank(input: QuestionGenerationInput): Question {
  const highRangeRate = input.directive?.highRange === undefined ? input.profile.highRangeRate : Number(input.directive.highRange);
  return generateFillBlankCore(
    input.profile.max,
    input.config.difficulty,
    input.profile.maxFactor,
    Number.isFinite(highRangeRate) ? highRangeRate : input.profile.highRangeRate,
    !['preschool', 'grade1'].includes(input.config.stage),
    randomWithId(input),
    typeof input.directive?.reverse === 'boolean' ? input.directive.reverse : undefined
  );
}

export function generateMultiplicationBlank(input: QuestionGenerationInput): Question {
  const random = input.random;
  const factor = randomInt(2, Math.max(2, input.profile.maxFactor), random);
  const other = randomInt(2, Math.max(2, input.profile.maxFactor), random);
  const reverse = input.directive?.reverse === undefined
    ? random() < .5
    : Boolean(input.directive.reverse);
  return {
    id: input.createId(), type: 'multiplicationBlank',
    text: reverse ? `${factor * other} ÷ □ = ${factor}` : `${factor} × □ = ${factor * other}`,
    answer: other, operands: [factor, other, factor * other],
    operators: [reverse ? '÷' : '×'],
    signature: `multiplicationBlank:${reverse ? `${factor * other} ÷ □ = ${factor}` : `${factor} × □ = ${factor * other}`}|${other}|${factor},${other},${factor * other}`,
    layout: 'inline', metadata: { reverse }, answerDetails: { display: String(other) }
  };
}

function generateVertical(input: QuestionGenerationInput): Question {
  return generateVerticalQuestion(input.type as Question['type'], input.profile, randomWithId(input));
}

export const generateVerticalAddition = (input: QuestionGenerationInput): Question => generateVertical(input);
export const generateVerticalSubtraction = (input: QuestionGenerationInput): Question => generateVertical(input);
export const generateVerticalMultiplication = (input: QuestionGenerationInput): Question => generateVertical(input);
export const generateVerticalDivision = (input: QuestionGenerationInput): Question => generateVertical(input);

function finiteOperands(question: Question, count: number): number[] | undefined {
  if (!Array.isArray(question.operands) || question.operands.length !== count) return undefined;
  if (!question.operands.every(value => Number.isFinite(value) && value >= 0)) return undefined;
  return question.operands;
}

function result(valid: boolean, errors: string[]): QuestionValidationResult {
  return { valid: valid && errors.length === 0, errors };
}

function typeError(type: FillType, question: Question): QuestionValidationResult {
  return result(false, [`校验器题型不匹配：${type}`, `实际题型：${String(question?.type)}`]);
}

function calculate(a: number, b: number, op: string): number | undefined {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '×') return a * b;
  if (op === '÷' && b !== 0 && a % b === 0) return a / b;
  return undefined;
}

function validateFillBlankQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (!question || question.type !== 'fillBlank') return typeError('fillBlank', question);
  const errors: string[] = [];
  const operands = finiteOperands(question, 3);
  const operator = question.operators?.[0];
  const position = question.metadata?.blankPosition;
  if (!operands) return result(false, ['操作数无效']);
  if (!Array.isArray(question.operators) || question.operators.length !== 1 || !['+', '-', '×', '÷'].includes(String(operator))) errors.push('运算符无效');
  if (!['first', 'second', 'result', 'operator'].includes(String(position))) errors.push('填空位置元数据无效');
  const expectedResult = calculate(operands[0], operands[1], String(operator));
  if (expectedResult === undefined || expectedResult !== operands[2]) errors.push('填空等式不成立');
  const expectedAnswer: number | string = position === 'first' ? operands[0]
    : position === 'second' ? operands[1] : position === 'operator' ? String(operator) : operands[2];
  if (question.answer !== expectedAnswer) errors.push('填空答案错误');
  if (question.metadata?.operation !== undefined && question.metadata.operation !== operator) errors.push('运算元数据错误');
  if (question.metadata?.magnitude !== undefined && question.metadata.magnitude !== Math.max(...operands)) errors.push('数量级元数据错误');
  errors.push(...rangeErrors(question, config, definition));
  if (!config.types.includes(question.type)) errors.push('题型不在配置中');
  return result(true, errors);
}

function validateMultiplicationBlankQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (!question || question.type !== 'multiplicationBlank') return typeError('multiplicationBlank', question);
  const errors: string[] = [];
  const operands = finiteOperands(question, 3);
  if (!operands) return result(false, ['操作数无效']);
  const [factor, other, product] = operands;
  const reverse = question.metadata?.reverse;
  if (typeof reverse !== 'boolean') errors.push('逆向元数据无效');
  if (factor < 2 || other < 2 || product !== factor * other) errors.push('乘除口诀等式不成立');
  if (question.answer !== other) errors.push('乘除口诀填空答案错误');
  const expectedOperator = reverse ? '÷' : '×';
  if (!Array.isArray(question.operators) || question.operators.length !== 1 || question.operators[0] !== expectedOperator) errors.push('运算符错误');
  if (!question.text.includes(reverse ? '÷ □ =' : '× □ =')) errors.push('题面题型错误');
  errors.push(...rangeErrors(question, config, definition));
  if (!config.types.includes(question.type)) errors.push('题型不在配置中');
  return result(true, errors);
}

function regroupingAdd(a: number, b: number): number {
  let carry = 0, count = 0;
  while (a > 0 || b > 0) { const sum = a % 10 + b % 10 + carry; carry = sum >= 10 ? 1 : 0; if (carry) count++; a = Math.floor(a / 10); b = Math.floor(b / 10); }
  return count;
}

function regroupingSub(a: number, b: number): number {
  let borrow = 0, count = 0;
  while (a > 0 || b > 0) { if (a % 10 - borrow < b % 10) { borrow = 1; count++; } else borrow = 0; a = Math.floor(a / 10); b = Math.floor(b / 10); }
  return count;
}

function regroupingMul(a: number, b: number): number {
  let carry = 0, count = 0;
  while (a > 0) { const total = a % 10 * b + carry; carry = Math.floor(total / 10); if (carry > 0) count++; a = Math.floor(a / 10); }
  return count;
}

function curriculumMaximum(config: WorksheetConfig): number {
  if (config.rangeMode !== 'curriculum') return Number.POSITIVE_INFINITY;
  if (config.stage === 'preschool') return 10;
  if (config.stage === 'grade1') return 20;
  if (config.stage === 'grade2') return 100;
  if (config.stage === 'grade3') return 1000;
  return 100_000_000;
}

function rangeErrors(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): string[] {
  const errors: string[] = [];
  const maximum = definition?.difficultyProfiles[config.difficulty]?.max ?? definition?.difficultyProfiles.standard?.max;
  if (Number.isFinite(maximum) && question.operands.some(value => value > (maximum as number))) errors.push('题目超过该题型难度上限');
  const cap = curriculumMaximum(config);
  if (question.operands.some(value => value > cap)) errors.push('题目超过当前学习阶段范围');
  if (typeof question.answer === 'number' && question.answer > cap) errors.push('答案超过当前学习阶段范围');
  return errors;
}

function validateVertical(question: Question, config: WorksheetConfig, definition?: QuestionDefinition, expectedType?: FillType): QuestionValidationResult {
  if (!question) return typeError(expectedType ?? 'verticalAddition', question);
  const type = question.type as FillType;
  if (expectedType && question.type !== expectedType) return typeError(expectedType, question);
  if (!['verticalAddition', 'verticalSubtraction', 'verticalMultiplication', 'verticalDivision'].includes(type)) return typeError(expectedType ?? type, question);
  const errors: string[] = [];
  const operands = finiteOperands(question, 2);
  if (!operands) return result(false, ['操作数无效']);
  const [a, b] = operands;
  const operation = type === 'verticalAddition' ? 'addition' : type === 'verticalSubtraction' ? 'subtraction' : type === 'verticalMultiplication' ? 'multiplication' : 'division';
  const expectedMode = operation === 'addition' || operation === 'subtraction' ? 'verticalAddSub' : 'verticalMulDiv';
  if (config.practiceMode !== expectedMode) errors.push('竖式题型与练习模式不一致');
  if (!config.verticalOperations.includes(operation)) errors.push('竖式运算未被选择');
  if (question.layout !== (operation === 'division' ? 'longDivision' : 'vertical')) errors.push('竖式布局无效');
  if (!Array.isArray(question.operators) || question.operators.length !== 1 || question.operators[0] !== ({ addition: '+', subtraction: '-', multiplication: '×', division: '÷' } as const)[operation]) errors.push('竖式运算符错误');
  if (type === 'verticalAddition') {
    const count = regroupingAdd(a, b);
    if (a <= 0 || b <= 0 || a === b || a % 10 === 0 || b % 10 === 0) errors.push('加法竖式格式无效');
    if (question.answer !== a + b) errors.push('加法竖式答案错误');
    if (question.metadata?.regroupingCount !== count || question.metadata?.regrouping !== (count > 0)) errors.push('进位元数据错误');
    if (question.metadata?.magnitude !== undefined && question.metadata.magnitude !== a + b) errors.push('数量级元数据错误');
  } else if (type === 'verticalSubtraction') {
    const count = regroupingSub(a, b);
    const minDifference = config.rangeMode === 'curriculum' ? config.stage === 'grade1' ? 2 : config.stage === 'grade2' ? 10 : 100 : config.difficulty === 'entry' || config.difficulty === 'easy' ? 10 : 100;
    if (b <= 0 || a <= b || a - b < minDifference || a % 10 === 0 || b % 10 === 0) errors.push('减法竖式格式无效');
    if (question.answer !== a - b) errors.push('减法竖式答案错误');
    if (question.metadata?.regroupingCount !== count || question.metadata?.regrouping !== (count > 0)) errors.push('退位元数据错误');
    if (question.metadata?.magnitude !== undefined && question.metadata.magnitude !== a) errors.push('数量级元数据错误');
  } else if (type === 'verticalMultiplication') {
    const count = regroupingMul(a, b);
    if (a < 10 || b < 2 || b > 9 || a % 10 === 0) errors.push('乘法竖式格式无效');
    if (question.answer !== a * b) errors.push('乘法竖式答案错误');
    if (question.metadata?.regroupingCount !== count || question.metadata?.regrouping !== (count > 0)) errors.push('进位元数据错误');
    if (question.metadata?.factor !== undefined && question.metadata.factor !== b) errors.push('因数元数据错误');
    if (question.metadata?.magnitude !== undefined && question.metadata.magnitude !== a * b) errors.push('数量级元数据错误');
  } else {
    if (b < 2 || b > 9 || a <= 0) errors.push('除法竖式格式无效');
    const quotient = b > 0 ? Math.floor(a / b) : 0;
    const remainder = b > 0 ? a % b : 0;
    if (quotient < 10 || quotient % 10 === 0 || a % 10 === 0 || remainder >= b) errors.push('除法竖式格式无效');
    const expected: number | string = remainder ? `${quotient}……${remainder}` : quotient;
    if (question.answer !== expected) errors.push('除法竖式答案错误');
    if (question.metadata?.quotient !== quotient || question.metadata?.remainder !== remainder) errors.push('商和余数元数据错误');
    if (question.metadata?.magnitude !== undefined && question.metadata.magnitude !== a) errors.push('数量级元数据错误');
    if (question.metadata?.longDivision !== undefined && question.metadata.longDivision !== true) errors.push('长除法元数据错误');
  }
  errors.push(...rangeErrors(question, config, definition));
  if (config.rangeMode === 'curriculum' && ((type === 'verticalAddition' && Number(question.answer) > curriculumMaximum(config)) || (type === 'verticalSubtraction' && a > curriculumMaximum(config)))) errors.push('竖式数字超过年级范围');
  return result(true, errors);
}

export const validateFillBlank: QuestionValidator = validateFillBlankQuestion;
export const validateMultiplicationBlank: QuestionValidator = validateMultiplicationBlankQuestion;
function validatorFor(expectedType: FillType): QuestionValidator {
  return (question, config, definition) => validateVertical(question, config, definition, expectedType);
}

export const validateVerticalAddition: QuestionValidator = validatorFor('verticalAddition');
export const validateVerticalSubtraction: QuestionValidator = validatorFor('verticalSubtraction');
export const validateVerticalMultiplication: QuestionValidator = validatorFor('verticalMultiplication');
export const validateVerticalDivision: QuestionValidator = validatorFor('verticalDivision');
