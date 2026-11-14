import { generateFractionComparison as generateFractionCore, generatePerimeter as generatePerimeterCore, generateUnitConversion as generateUnitCore } from '../../core/generators/grade3';
import { attachCreateId } from '../../core/random-utils';
import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import type { Question } from '../../domain/questions/model';
import type { WorksheetConfig } from '../../domain/worksheet/config';

export function generateUnitConversion(input: QuestionGenerationInput): Question {
  return generateUnitCore(input.config.difficulty, Math.max(1, input.profile.max), attachCreateId(input.random, input.createId));
}

export function generateFractionComparison(input: QuestionGenerationInput): Question {
  const requested = input.directive?.equalFraction;
  const equalityRate = requested === undefined ? input.profile.equalityRate : Number(requested);
  return generateFractionCore(input.profile.max, input.config.difficulty, Number.isFinite(equalityRate) ? equalityRate : input.profile.equalityRate, attachCreateId(input.random, input.createId));
}

export function generatePerimeter(input: QuestionGenerationInput): Question {
  return generatePerimeterCore(Math.max(1, input.profile.max), input.profile.highRangeRate, attachCreateId(input.random, input.createId));
}

function validOperands(question: Question, count: number): number[] | undefined {
  if (!question || !Array.isArray(question.operands) || question.operands.length !== count) return undefined;
  return question.operands.every(value => Number.isFinite(value) && value >= 0) ? question.operands : undefined;
}

function out(valid: boolean, errors: string[]): QuestionValidationResult { return { valid: valid && errors.length === 0, errors }; }
function mismatch(expected: string, question: Question): QuestionValidationResult { return out(false, [`校验器题型不匹配：${expected}`, `实际题型：${String(question?.type)}`]); }

function curriculumCap(config: WorksheetConfig): number {
  if (config.rangeMode !== 'curriculum') return Number.POSITIVE_INFINITY;
  if (config.stage === 'preschool') return 10;
  if (config.stage === 'grade1') return 20;
  if (config.stage === 'grade2') return 100;
  if (config.stage === 'grade3') return 1000;
  return 100_000_000;
}

function commonRange(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): string[] {
  const errors: string[] = [];
  const maximum = definition?.difficultyProfiles.standard?.max;
  if (Number.isFinite(maximum) && question.operands.some(value => value > (maximum as number))) errors.push('题目超过该题型难度上限');
  const cap = curriculumCap(config);
  if (question.operands.some(value => value > cap)) errors.push('题目超过当前学习阶段范围');
  if (typeof question.answer === 'number' && question.answer > cap) errors.push('答案超过当前学习阶段范围');
  if (!config.types.includes(question.type)) errors.push('题型不在配置中');
  return errors;
}

const UNIT_CONVERSIONS: readonly { large: string; small: string; factor: number }[] = [
  { large: '米', small: '厘米', factor: 100 },
  { large: '千米', small: '米', factor: 1000 },
  { large: '千克', small: '克', factor: 1000 },
  { large: '元', small: '角', factor: 10 },
  { large: '小时', small: '分钟', factor: 60 },
  { large: '米', small: '分米', factor: 10 },
  { large: '分米', small: '厘米', factor: 10 },
  { large: '厘米', small: '毫米', factor: 10 },
  { large: '吨', small: '千克', factor: 1000 },
  { large: '升', small: '毫升', factor: 1000 },
  { large: '分钟', small: '秒', factor: 60 },
  { large: '角', small: '分', factor: 10 }
];

function validateUnit(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (!question || question.type !== 'unitConversion') return mismatch('unitConversion', question);
  const operands = validOperands(question, 2);
  if (!operands) return out(false, ['操作数无效']);
  const errors: string[] = [];
  const [value, factor] = operands;
  const direction = question.metadata?.direction;
  const expected = direction === 'small-to-large' ? value / factor : value * factor;
  if (!(factor > 0) || !Number.isInteger(factor) || !Number.isFinite(expected)) errors.push('单位换算参数无效');
  if (question.answer !== expected) errors.push('单位换算答案错误');
  if (direction !== 'small-to-large' && direction !== 'large-to-small') errors.push('换算方向元数据无效');
  const expectedOperator = direction === 'small-to-large' ? '÷' : '×';
  if (!Array.isArray(question.operators) || question.operators.length !== 1 || question.operators[0] !== expectedOperator) errors.push('单位换算运算符错误');
  const unit = question.metadata?.unit;
  const conversion = typeof unit === 'string'
    ? UNIT_CONVERSIONS.find(item => item.factor === factor && (direction === 'small-to-large' ? item.small === unit : item.large === unit))
    : undefined;
  if (!conversion) errors.push('换算单位元数据错误');
  if (conversion) {
    const expectedText = direction === 'small-to-large'
      ? `${value} ${conversion.small} = □ ${conversion.large}`
      : `${value} ${conversion.large} = □ ${conversion.small}`;
    if (question.text !== expectedText) errors.push('换算方向题面错误');
  }
  if (question.metadata?.magnitude !== undefined && question.metadata.magnitude !== (direction === 'small-to-large' ? value : expected)) errors.push('数量级元数据错误');
  errors.push(...commonRange(question, config, definition));
  return out(true, errors);
}

function validateFraction(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (!question || question.type !== 'fractionComparison') return mismatch('fractionComparison', question);
  const operands = validOperands(question, 4);
  if (!operands) return out(false, ['操作数无效']);
  const errors: string[] = [];
  const [ln, ld, rn, rd] = operands;
  if (!Number.isInteger(ln) || !Number.isInteger(ld) || !Number.isInteger(rn) || !Number.isInteger(rd) || ld <= 0 || rd <= 0 || ln <= 0 || rn <= 0 || ln >= ld || rn >= rd) errors.push('分数格式无效');
  const left = ln * rd, right = rn * ld;
  const expected = left === right ? '=' : left > right ? '>' : '<';
  if (question.answer !== expected) errors.push('分数比较答案错误');
  if (!['<', '>', '='].includes(String(question.answer))) errors.push('比较符号无效');
  if (question.metadata?.relation !== undefined && question.metadata.relation !== expected) errors.push('比较关系元数据错误');
  if (question.metadata?.denominator !== undefined && question.metadata.denominator !== Math.max(ld, rd)) errors.push('分母元数据错误');
  errors.push(...commonRange(question, config, definition));
  return out(true, errors);
}

function validatePerimeterQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (!question || question.type !== 'perimeter') return mismatch('perimeter', question);
  const shape = question.metadata?.shape;
  const expectedCount = shape === 'square' ? 1 : shape === 'rectangle' ? 2 : 0;
  const operands = validOperands(question, expectedCount);
  if (!operands) return out(false, [expectedCount ? '操作数无效' : '图形元数据无效']);
  const errors: string[] = [];
  const expected = shape === 'square' ? operands[0] * 4 : (operands[0] + operands[1]) * 2;
  if (operands.some(value => value <= 0)) errors.push('边长必须为正数');
  if (shape === 'rectangle' && operands[0] <= operands[1]) errors.push('长方形长宽格式无效');
  if (question.answer !== expected) errors.push('周长答案错误');
  if (question.layout !== 'word') errors.push('周长题面布局错误');
  if (question.metadata?.semantic !== 'perimeter') errors.push('周长语义元数据错误');
  if (question.metadata?.magnitude !== undefined && question.metadata.magnitude !== operands[0]) errors.push('数量级元数据错误');
  errors.push(...commonRange(question, config, definition));
  return out(true, errors);
}

export const validateUnitConversion: QuestionValidator = validateUnit;
export const validateFractionComparison: QuestionValidator = validateFraction;
export const validatePerimeter: QuestionValidator = validatePerimeterQuestion;
