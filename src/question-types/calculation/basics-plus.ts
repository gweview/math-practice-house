import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import type { Question } from '../../domain/questions/model';
import type { WorksheetConfig } from '../../domain/worksheet/config';
import type { RandomSource } from '../../shared/random/seeded-random';

/**
 * Calculation additions filling grade 2-3 taxonomy gaps: repeated addition as
 * the meaning of multiplication, and same-denominator fraction addition and
 * subtraction (the grade 3 fraction strand before grade 5 fractionOperation).
 */

type BasicsPlusType = 'repeatedAddition' | 'sameDenominatorFraction';

const STAGES = ['preschool', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'] as const;
const CURRICULUM_MAXIMUMS: Readonly<Record<WorksheetConfig['stage'], number>> = {
  preschool: 10, grade1: 20, grade2: 100, grade3: 1000,
  grade4: 100_000_000, grade5: 100_000_000, grade6: 100_000_000
};

function randomInt(min: number, max: number, random: RandomSource): number {
  const lower = Math.ceil(Math.min(min, max));
  const upper = Math.floor(Math.max(min, max));
  return Math.floor(random() * (upper - lower + 1)) + lower;
}

function pick<T>(items: readonly T[], random: RandomSource): T {
  return items[randomInt(0, items.length - 1, random)];
}

function maxFor(input: QuestionGenerationInput): number {
  return Math.max(2, Math.floor(Number.isFinite(input.profile.max) ? input.profile.max : 2));
}

function makeQuestion(
  input: QuestionGenerationInput,
  type: BasicsPlusType,
  text: string,
  answer: number | string,
  operands: number[],
  options: Partial<Pick<Question, 'layout' | 'metadata' | 'operators' | 'answerDetails'>> & { signature?: string } = {}
): Question {
  const display = options.answerDetails?.display ?? String(answer);
  return {
    id: input.createId(), type, text, answer, operands,
    operators: options.operators,
    signature: options.signature ?? `${type}:${text}|${display}|${operands.join(',')}`,
    layout: options.layout ?? 'inline', metadata: options.metadata,
    answerDetails: { display, ...options.answerDetails }
  };
}

function mismatch(type: BasicsPlusType, question: Question): QuestionValidationResult {
  return { valid: false, errors: [`校验器题型不匹配：${type}`, `实际题型：${String(question?.type)}`] };
}

function commonErrors(question: Question, type: BasicsPlusType, config: WorksheetConfig, definition?: QuestionDefinition): string[] {
  const errors: string[] = [];
  if (!question || question.type !== type) return [`校验器题型不匹配：${type}`];
  if (!Array.isArray(question.operands) || question.operands.some(value => !Number.isFinite(value) || value < 0)) errors.push('操作数无效');
  if (Array.isArray(question.operands)) {
    const difficulty = definition?.difficultyProfiles[config.difficulty] ?? definition?.difficultyProfiles.standard;
    const maximum = difficulty?.max;
    if (Number.isFinite(maximum) && question.operands.some(value => Math.abs(value) > Number(maximum))) errors.push('题目超过该题型难度上限');
    if (config.rangeMode === 'curriculum' && question.operands.some(value => Math.abs(value) > CURRICULUM_MAXIMUMS[config.stage])) errors.push('题目超过当前学习阶段范围');
  }
  if (!config.types.includes(type)) errors.push('题型不在配置中');
  return errors;
}

function stageBefore(config: WorksheetConfig, minimum: WorksheetConfig['stage']): boolean {
  return STAGES.indexOf(config.stage) < STAGES.indexOf(minimum);
}

function result(question: Question, config: WorksheetConfig, definition: QuestionDefinition | undefined, type: BasicsPlusType, checks: string[]): QuestionValidationResult {
  const errors = commonErrors(question, type, config, definition);
  if (errors.includes('操作数无效')) return { valid: false, errors };
  errors.push(...checks);
  return { valid: errors.length === 0, errors };
}

function gated(minimum: WorksheetConfig['stage'], validator: QuestionValidator): QuestionValidator {
  return (question, config, definition) => {
    const validation = validator(question, config, definition);
    if (stageBefore(config, minimum)) {
      if (!validation.errors.includes('题型不符合年级要求')) validation.errors.push('题型不符合年级要求');
      return { valid: false, errors: validation.errors };
    }
    return validation;
  };
}

function validIntegerOperands(question: Question, count?: number): boolean {
  return Array.isArray(question.operands)
    && (count === undefined || question.operands.length === count)
    && question.operands.every(Number.isInteger);
}

/* ---------------- repeatedAddition 连加与乘法 ---------------- */

type RepeatedForm = 'missing-addend' | 'missing-count' | 'meaning';

function repeatedText(form: RepeatedForm, addend: number, count: number): string {
  const sum = Array.from({ length: count }, () => addend).join(' + ');
  if (form === 'missing-addend') return `${sum} = ${count} × □`;
  if (form === 'missing-count') return `${sum} = □ × ${addend}`;
  return `${count} × ${addend} 表示 □ 个 ${addend} 相加。`;
}

export function generateRepeatedAddition(input: QuestionGenerationInput): Question {
  const factorCap = Math.max(2, Math.min(9, Math.floor(input.profile.maxFactor) || 9));
  const addend = randomInt(2, factorCap, input.random);
  const count = randomInt(2, factorCap, input.random);
  const form = pick(['missing-addend', 'missing-count', 'meaning'] as const, input.random);
  const answer = form === 'missing-addend' ? addend : count;
  return makeQuestion(input, 'repeatedAddition', repeatedText(form, addend, count), answer, [addend, count], {
    layout: 'wide', metadata: { form }, operators: ['×'],
    signature: `repeatedAddition:${form}:${addend}:${count}`
  });
}

function validateRepeatedAdditionImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'repeatedAddition') return mismatch('repeatedAddition', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 2)) errors.push('连加操作数无效');
  if (validIntegerOperands(question, 2)) {
    const [addend, count] = question.operands;
    const form = question.metadata?.form;
    if (addend < 2 || addend > 12 || count < 2 || count > 12) errors.push('连加边界无效');
    if (form === 'missing-addend' || form === 'missing-count' || form === 'meaning') {
      if (question.answer !== (form === 'missing-addend' ? addend : count)) errors.push('连加与乘法答案错误');
      if (question.text !== repeatedText(form, addend, count)) errors.push('题面格式错误');
    } else {
      errors.push('题型形式元数据错误');
    }
  }
  return result(question, config, definition, 'repeatedAddition', errors);
}

export const validateRepeatedAddition: QuestionValidator = gated('grade2', validateRepeatedAdditionImpl);

/* ---------------- sameDenominatorFraction 同分母分数加减 ---------------- */

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function canonicalFraction(numerator: number, denominator: number): string {
  if (numerator === 0) return '0';
  const divisor = gcd(Math.abs(numerator), denominator);
  const n = numerator / divisor;
  const d = denominator / divisor;
  return d === 1 ? String(n) : `${n}/${d}`;
}

type FractionForm = 'add' | 'subtract' | 'one-minus';

function fractionText(form: FractionForm, n1: number, n2: number, d: number): string {
  if (form === 'add') return `${n1}/${d} + ${n2}/${d} =`;
  if (form === 'subtract') return `${n1}/${d} - ${n2}/${d} =`;
  return `1 - ${n1}/${d} =`;
}

export function generateSameDenominatorFraction(input: QuestionGenerationInput): Question {
  const maxDenominator = Math.min(12, Math.max(3, maxFor(input)));
  const allowOverOne = input.config.difficulty === 'advanced' || input.config.difficulty === 'challenge';
  const form = pick(['add', 'subtract', 'one-minus'] as const, input.random);
  const d = randomInt(form === 'subtract' ? 3 : 2, maxDenominator, input.random);
  if (form === 'one-minus') {
    const n = randomInt(1, d - 1, input.random);
    return makeQuestion(input, 'sameDenominatorFraction', fractionText(form, n, 0, d), canonicalFraction(d - n, d), [n, d], {
      metadata: { form }, operators: ['-'], signature: `sameDenominatorFraction:one:${n}/${d}`
    });
  }
  if (form === 'subtract') {
    const n1 = randomInt(2, d - 1, input.random);
    const n2 = randomInt(1, n1 - 1, input.random);
    return makeQuestion(input, 'sameDenominatorFraction', fractionText(form, n1, n2, d), canonicalFraction(n1 - n2, d), [n1, n2, d], {
      metadata: { form }, operators: ['-'], signature: `sameDenominatorFraction:sub:${n1}/${d}:${n2}/${d}`
    });
  }
  const n1 = randomInt(1, d - 1, input.random);
  const n2Cap = allowOverOne ? d - 1 : Math.max(1, d - n1);
  const n2 = randomInt(1, n2Cap, input.random);
  // Fraction addition commutes, so the signature sorts the numerators;
  // subtraction forms keep order.
  const signature = `sameDenominatorFraction:add:${Math.min(n1, n2)}/${d}:${Math.max(n1, n2)}/${d}`;
  return makeQuestion(input, 'sameDenominatorFraction', fractionText(form, n1, n2, d), canonicalFraction(n1 + n2, d), [n1, n2, d], {
    metadata: { form }, operators: ['+'], signature
  });
}

function validateSameDenominatorFractionImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'sameDenominatorFraction') return mismatch('sameDenominatorFraction', question);
  const errors: string[] = [];
  const form = question.metadata?.form;
  if (form === 'one-minus') {
    if (!validIntegerOperands(question, 2)) errors.push('分数操作数无效');
    if (validIntegerOperands(question, 2)) {
      const [n, d] = question.operands;
      if (d < 2 || d > 12 || n < 1 || n > d - 1) errors.push('分数边界无效');
      if (question.answer !== canonicalFraction(d - n, d)) errors.push('分数答案错误');
      if (question.text !== fractionText('one-minus', n, 0, d)) errors.push('题面格式错误');
    }
  } else if (form === 'add' || form === 'subtract') {
    if (!validIntegerOperands(question, 3)) errors.push('分数操作数无效');
    if (validIntegerOperands(question, 3)) {
      const [n1, n2, d] = question.operands;
      if (d < 2 || d > 12 || n1 < 1 || n2 < 1 || n1 > d - 1 || n2 > d - 1) errors.push('分数边界无效');
      if (form === 'subtract' && n1 <= n2) errors.push('分数减法边界无效');
      if (form === 'add' && (config.difficulty === 'entry' || config.difficulty === 'easy' || config.difficulty === 'standard') && n1 + n2 > d) errors.push('分数加法边界无效');
      const expected = canonicalFraction(form === 'add' ? n1 + n2 : n1 - n2, d);
      if (question.answer !== expected) errors.push('分数答案错误');
      if (question.text !== fractionText(form, n1, n2, d)) errors.push('题面格式错误');
    }
  } else {
    errors.push('题型形式元数据错误');
  }
  return result(question, config, definition, 'sameDenominatorFraction', errors);
}

export const validateSameDenominatorFraction: QuestionValidator = gated('grade3', validateSameDenominatorFractionImpl);

export type { BasicsPlusType };
