import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import type { Question } from '../../domain/questions/model';
import type { WorksheetConfig } from '../../domain/worksheet/config';
import type { RandomSource } from '../../shared/random/seeded-random';
import { questionDefinition, difficultyProfiles, GRADE_3_PLUS, WORD } from '../manifests/_shared';

/**
 * Grade 3 word-problem additions filling taxonomy gaps: finding a fraction of
 * a quantity, and multiplicative comparison ("times as many"). Self-contained
 * in the same style as the concept number-sense family.
 */

type EarlyWordType = 'fractionOfAmount' | 'multiplicativeComparison';

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
  type: EarlyWordType,
  text: string,
  answer: number,
  operands: number[],
  options: Partial<Pick<Question, 'metadata' | 'answerDetails'>> & { signature?: string } = {}
): Question {
  const display = options.answerDetails?.display ?? String(answer);
  return {
    id: input.createId(), type, text, answer, operands,
    signature: options.signature ?? `${type}:${text}|${display}|${operands.join(',')}`,
    layout: 'word', metadata: options.metadata,
    answerDetails: { display, ...options.answerDetails }
  };
}

function mismatch(type: EarlyWordType, question: Question): QuestionValidationResult {
  return { valid: false, errors: [`校验器题型不匹配：${type}`, `实际题型：${String(question?.type)}`] };
}

function commonErrors(question: Question, type: EarlyWordType, config: WorksheetConfig, definition?: QuestionDefinition): string[] {
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

function result(question: Question, config: WorksheetConfig, definition: QuestionDefinition | undefined, type: EarlyWordType, checks: string[]): QuestionValidationResult {
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

function validIntegerOperands(question: Question, count: number): boolean {
  return Array.isArray(question.operands) && question.operands.length === count && question.operands.every(Number.isInteger);
}

/* ---------------- fractionOfAmount 求一个数的几分之几 ---------------- */

interface FractionContext { unit: string; text: (total: number, num: number, den: number) => string }

const FRACTION_CONTEXTS: readonly FractionContext[] = [
  { unit: '块', text: (t, n, d) => `一袋糖有 ${t} 块，小明吃了其中的 ${n}/${d}，小明吃了多少块？` },
  { unit: '页', text: (t, n, d) => `一本书有 ${t} 页，小红已经看了其中的 ${n}/${d}，她看了多少页？` },
  { unit: '朵', text: (t, n, d) => `花坛里有 ${t} 朵花，其中 ${n}/${d} 是红花，红花有多少朵？` },
  { unit: '支', text: (t, n, d) => `一盒铅笔有 ${t} 支，小华用去了其中的 ${n}/${d}，用去了多少支？` },
  { unit: '人', text: (t, n, d) => `兴趣小组有 ${t} 人报名，其中 ${n}/${d} 是女生，女生有多少人？` },
  { unit: '', text: (t, n, d) => `求 ${t} 的 ${n}/${d} 是多少。` }
];

export function generateFractionOfAmount(input: QuestionGenerationInput): Question {
  const max = maxFor(input);
  const denCap = Math.max(2, Math.min(8, Math.floor(input.profile.maxFactor) || 8));
  const den = randomInt(2, denCap, input.random);
  const unitValue = randomInt(1, Math.max(1, Math.floor(max / den)), input.random);
  const total = den * unitValue;
  const num = input.config.difficulty === 'entry' ? 1 : randomInt(1, den - 1, input.random);
  const contextIndex = randomInt(0, FRACTION_CONTEXTS.length - 1, input.random);
  const context = FRACTION_CONTEXTS[contextIndex];
  const answer = unitValue * num;
  return makeQuestion(input, 'fractionOfAmount', context.text(total, num, den), answer, [total, den, num], {
    metadata: { context: contextIndex },
    answerDetails: context.unit
      ? { display: `${answer} ${context.unit}`, unit: context.unit, steps: [`${total} ÷ ${den} = ${unitValue}`, `${unitValue} × ${num} = ${answer}`] }
      : { display: String(answer), steps: [`${total} ÷ ${den} = ${unitValue}`, `${unitValue} × ${num} = ${answer}`] },
    signature: `fractionOfAmount:${contextIndex}:${total}:${num}/${den}`
  });
}

function validateFractionOfAmountImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'fractionOfAmount') return mismatch('fractionOfAmount', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 3)) errors.push('分数应用操作数无效');
  const contextIndex = question.metadata?.context;
  if (typeof contextIndex !== 'number' || !Number.isInteger(contextIndex) || contextIndex < 0 || contextIndex >= FRACTION_CONTEXTS.length) errors.push('情境元数据错误');
  if (validIntegerOperands(question, 3)) {
    const [total, den, num] = question.operands;
    if (den < 2 || den > 12 || num < 1 || num > den - 1 || total % den !== 0 || total < den) errors.push('分数应用边界无效');
    const expected = (total / den) * num;
    if (question.answer !== expected) errors.push('分数应用答案错误');
    if (typeof contextIndex === 'number' && Number.isInteger(contextIndex) && contextIndex >= 0 && contextIndex < FRACTION_CONTEXTS.length) {
      const context = FRACTION_CONTEXTS[contextIndex];
      if (question.text !== context.text(total, num, den)) errors.push('题面格式错误');
      const expectedDisplay = context.unit ? `${expected} ${context.unit}` : String(expected);
      if (question.answerDetails?.display !== expectedDisplay) errors.push('答案展示错误');
      if (context.unit && question.answerDetails?.unit !== context.unit) errors.push('答案单位错误');
    }
  }
  return result(question, config, definition, 'fractionOfAmount', errors);
}

export const validateFractionOfAmount: QuestionValidator = gated('grade3', validateFractionOfAmountImpl);

/* ---------------- multiplicativeComparison 倍的认识 ---------------- */

interface TimesContext { item: string; unit: string; nameA: string; nameB: string }

const TIMES_CONTEXTS: readonly TimesContext[] = [
  { item: '贴纸', unit: '张', nameA: '小明', nameB: '小红' },
  { item: '糖果', unit: '颗', nameA: '小华', nameB: '小丽' },
  { item: '画片', unit: '张', nameA: '哥哥', nameB: '弟弟' },
  { item: '气球', unit: '个', nameA: '小刚', nameB: '小芳' },
  { item: '故事书', unit: '本', nameA: '学校图书馆', nameB: '班级图书角' }
];

type TimesForm = 'how-many-times' | 'times-value';

function timesText(form: TimesForm, context: TimesContext, base: number, mult: number): string {
  if (form === 'how-many-times') {
    return `${context.nameA}有 ${base * mult} ${context.unit}${context.item}，${context.nameB}有 ${base} ${context.unit}${context.item}。${context.nameA}的${context.item}数量是${context.nameB}的多少倍？`;
  }
  return `${context.nameB}有 ${base} ${context.unit}${context.item}，${context.nameA}的${context.item}数量是${context.nameB}的 ${mult} 倍。${context.nameA}有多少${context.unit}${context.item}？`;
}

export function generateMultiplicativeComparison(input: QuestionGenerationInput): Question {
  const max = maxFor(input);
  const base = randomInt(2, Math.max(2, Math.min(max, 60)), input.random);
  const mult = randomInt(2, 9, input.random);
  const contextIndex = randomInt(0, TIMES_CONTEXTS.length - 1, input.random);
  const context = TIMES_CONTEXTS[contextIndex];
  const form: TimesForm = input.random() < .5 ? 'how-many-times' : 'times-value';
  if (form === 'how-many-times') {
    return makeQuestion(input, 'multiplicativeComparison', timesText(form, context, base, mult), mult, [base, mult], {
      metadata: { form, context: contextIndex },
      answerDetails: { display: `${mult} 倍`, unit: '倍', steps: [`${base * mult} ÷ ${base} = ${mult}`] },
      signature: `multiplicativeComparison:times:${contextIndex}:${base}:${mult}`
    });
  }
  const answer = base * mult;
  return makeQuestion(input, 'multiplicativeComparison', timesText(form, context, base, mult), answer, [base, mult], {
    metadata: { form, context: contextIndex },
    answerDetails: { display: `${answer} ${context.unit}`, unit: context.unit, steps: [`${base} × ${mult} = ${answer}`] },
    signature: `multiplicativeComparison:value:${contextIndex}:${base}:${mult}`
  });
}

function validateMultiplicativeComparisonImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'multiplicativeComparison') return mismatch('multiplicativeComparison', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 2)) errors.push('倍数应用操作数无效');
  const form = question.metadata?.form;
  const contextIndex = question.metadata?.context;
  if (typeof contextIndex !== 'number' || !Number.isInteger(contextIndex) || contextIndex < 0 || contextIndex >= TIMES_CONTEXTS.length) errors.push('情境元数据错误');
  if (validIntegerOperands(question, 2)) {
    const [base, mult] = question.operands;
    if (base < 2 || mult < 2 || mult > 12) errors.push('倍数应用边界无效');
    if ((form === 'how-many-times' || form === 'times-value')
      && typeof contextIndex === 'number' && Number.isInteger(contextIndex) && contextIndex >= 0 && contextIndex < TIMES_CONTEXTS.length) {
      const context = TIMES_CONTEXTS[contextIndex];
      const expected = form === 'how-many-times' ? mult : base * mult;
      if (question.answer !== expected) errors.push('倍数应用答案错误');
      if (question.text !== timesText(form, context, base, mult)) errors.push('题面格式错误');
      const expectedDisplay = form === 'how-many-times' ? `${mult} 倍` : `${base * mult} ${context.unit}`;
      if (question.answerDetails?.display !== expectedDisplay) errors.push('答案展示错误');
    } else if (form !== 'how-many-times' && form !== 'times-value') {
      errors.push('题型形式元数据错误');
    }
  }
  return result(question, config, definition, 'multiplicativeComparison', errors);
}

export const validateMultiplicativeComparison: QuestionValidator = gated('grade3', validateMultiplicativeComparisonImpl);

export const EARLY_WORD_QUESTION_DEFINITIONS: readonly QuestionDefinition[] = [
  questionDefinition({ id: 'fractionOfAmount', label: '求一个数的几分之几', group: 'fill-application', domain: 'integrated-practice', allowedGrades: GRADE_3_PLUS, recommendedGrades: GRADE_3_PLUS, renderKind: 'word', practice: 'standard', footprint: WORD, contentCategory: 'application', difficultyProfiles: difficultyProfiles(96), generate: generateFractionOfAmount, validate: validateFractionOfAmount }),
  questionDefinition({ id: 'multiplicativeComparison', label: '倍的认识', group: 'fill-application', domain: 'integrated-practice', allowedGrades: GRADE_3_PLUS, recommendedGrades: GRADE_3_PLUS, renderKind: 'word', practice: 'standard', footprint: WORD, contentCategory: 'application', difficultyProfiles: difficultyProfiles(100), generate: generateMultiplicativeComparison, validate: validateMultiplicativeComparison })
];

export type { EarlyWordType };
