import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import type { Question } from '../../domain/questions/model';
import type { WorksheetConfig } from '../../domain/worksheet/config';
import type { RandomSource } from '../../shared/random/seeded-random';

type NumberSenseType =
  | 'numberRecognition' | 'comparison' | 'compareSigns' | 'numberSequence'
  | 'numberComposition' | 'placeValue' | 'numberLine' | 'numberPattern'
  | 'arithmeticFamily' | 'estimation';

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

function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(0, index, random);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function maxFor(input: QuestionGenerationInput): number {
  return Math.max(2, Math.floor(Number.isFinite(input.profile.max) ? input.profile.max : 2));
}

function makeQuestion(
  input: QuestionGenerationInput,
  type: NumberSenseType,
  text: string,
  answer: number | string,
  operands: number[],
  options: Partial<Pick<Question, 'layout' | 'metadata' | 'content' | 'answerDetails'>> & { signature?: string; includeAnswerDetails?: boolean } = {}
): Question {
  const display = options.answerDetails?.display ?? String(answer);
  const signatureData = options.metadata?.signatureData ?? `${text}|${display}|${operands.join(',')}`;
  return {
    id: input.createId(), type, text, answer, operands,
    signature: options.signature ?? `${type}:${String(signatureData)}`,
    layout: options.layout ?? 'inline', metadata: options.metadata,
    content: options.content,
    ...(options.includeAnswerDetails === false ? {} : { answerDetails: { display, ...options.answerDetails } })
  };
}

function highFloor(min: number, max: number): number {
  return Math.max(min, Math.ceil(min + (max - min) * .6));
}

function sampleInt(min: number, max: number, highRangeRate: number, random: RandomSource): number {
  if (max <= min) return min;
  const lower = random() < highRangeRate ? highFloor(min, max) : min;
  return randomInt(lower, max, random);
}

export function generateNumberRecognition(input: QuestionGenerationInput): Question {
  const max = maxFor(input);
  const target = sampleInt(0, max, input.profile.highRangeRate, input.random);
  const pool = Array.from({ length: max + 1 }, (_, value) => value).filter(value => value !== target);
  const nearby = [...pool].sort((left, right) => Math.abs(left - target) - Math.abs(right - target));
  const distractorPool = input.profile.highRangeRate >= .65
    ? nearby.slice(0, Math.max(2, Math.ceil(nearby.length / 3))) : pool;
  const first = pick(distractorPool, input.random);
  const second = pick(distractorPool.filter(value => value !== first), input.random);
  const options = shuffle([target, first, second], input.random);
  return makeQuestion(input, 'numberRecognition', `圈出数字 ${target}：　${options.join('　')}`, target, options, {
    layout: 'wide', metadata: {
      magnitude: target,
      distractorDistance: Math.max(Math.abs(first - target), Math.abs(second - target))
    }, signature: `number:${target}:${options.join(',')}`, includeAnswerDetails: false
  });
}

function distinctPair(max: number, highRangeRate: number, random: RandomSource): [number, number] {
  const larger = sampleInt(1, max, highRangeRate, random);
  const smaller = randomInt(0, Math.max(0, larger - 1), random);
  return random() < .5 ? [larger, smaller] : [smaller, larger];
}

export function generateComparison(input: QuestionGenerationInput): Question {
  const [left, right] = distinctPair(maxFor(input), input.profile.highRangeRate, input.random);
  const answer = Math.max(left, right);
  return makeQuestion(input, 'comparison', `圈出较大的数：　${left}　${right}`, answer, [left, right], {
    layout: 'wide', metadata: { relation: left > right ? '>' : '<', semantic: 'choose-larger', magnitude: answer }, signature: `comparison:${left}:${right}`, includeAnswerDetails: false
  });
}

export function generateCompareSigns(input: QuestionGenerationInput): Question {
  const forced = input.directive?.relation;
  let left: number;
  let right: number;
  let relation: '=' | '>' | '<';
  if (forced === '=' || forced === '>' || forced === '<') {
    if (forced === '=') {
      left = sampleInt(0, maxFor(input), input.profile.highRangeRate, input.random); right = left;
    } else {
      [left, right] = distinctPair(maxFor(input), input.profile.highRangeRate, input.random);
      if ((forced === '>' && left < right) || (forced === '<' && left > right)) [left, right] = [right, left];
    }
    relation = forced;
  } else if (input.random() < input.profile.equalityRate) {
    left = sampleInt(0, maxFor(input), input.profile.highRangeRate, input.random); right = left; relation = '=';
  } else {
    [left, right] = distinctPair(maxFor(input), input.profile.highRangeRate, input.random);
    relation = left > right ? '>' : '<';
  }
  return makeQuestion(input, 'compareSigns', `${left}　○　${right}`, relation, [left, right], {
    metadata: { relation, semantic: 'insert-sign', magnitude: Math.max(left, right) }, signature: `compareSigns:${left}:${right}`, includeAnswerDetails: false
  });
}

export function generateNumberSequence(input: QuestionGenerationInput): Question {
  const rangeMax = Math.max(4, maxFor(input));
  const step = randomInt(1, Math.min(10, Math.floor(rangeMax / 4)), input.random);
  const start = randomInt(0, rangeMax - step * 4, input.random);
  const values = Array.from({ length: 5 }, (_, index) => start + index * step);
  const blankIndex = randomInt(1, 3, input.random);
  return makeQuestion(input, 'numberSequence', `按顺序填数：${values.map((value, index) => index === blankIndex ? '□' : value).join('，')}`, values[blankIndex], values, {
    layout: 'wide', metadata: { blankIndex, step }
  });
}

export function generateNumberComposition(input: QuestionGenerationInput): Question {
  const target = randomInt(2, Math.min(maxFor(input), 1000), input.random);
  const known = randomInt(0, target, input.random);
  return makeQuestion(input, 'numberComposition', `${target} 可以分成 ${known} 和 □。`, target - known, [target, known], {
    metadata: { relation: 'part-whole' }
  });
}

export function generatePlaceValue(input: QuestionGenerationInput): Question {
  const value = randomInt(10, Math.max(20, Math.min(maxFor(input), 999)), input.random);
  const divisor = pick([1, 10, 100].filter(item => item <= value), input.random);
  const label = divisor === 1 ? '个位' : divisor === 10 ? '十位' : '百位';
  return makeQuestion(input, 'placeValue', `数字 ${value} 的${label}上是 □。`, Math.floor(value / divisor) % 10, [value, divisor], {
    layout: 'wide', metadata: { divisor, label }
  });
}

export function generateNumberLine(input: QuestionGenerationInput): Question {
  const rangeMax = Math.max(5, maxFor(input));
  const step = randomInt(1, Math.min(10, Math.floor(rangeMax / 5)), input.random);
  const start = randomInt(0, rangeMax - step * 5, input.random);
  const values = Array.from({ length: 6 }, (_, index) => start + index * step);
  const blankIndex = randomInt(1, 4, input.random);
  return makeQuestion(input, 'numberLine', '观察数轴，在空白刻度处填数。', values[blankIndex], values, {
    layout: 'wide', metadata: { blankIndex, step },
    content: { kind: 'numberLine', start, end: values[values.length - 1], step, values, blankIndex }
  });
}

export function generateNumberPattern(input: QuestionGenerationInput): Question {
  const rank = Math.max(1, Math.ceil(input.profile.highRangeRate * 5));
  const rangeMax = Math.max(4, maxFor(input));
  const step = randomInt(1, Math.min(Math.floor(rangeMax / 4), 2 + rank * 2), input.random);
  const descending = input.random() < .35;
  const start = descending ? randomInt(step * 4, rangeMax, input.random) : randomInt(0, rangeMax - step * 4, input.random);
  const values = Array.from({ length: 5 }, (_, index) => start + (descending ? -1 : 1) * index * step);
  const blankIndex = randomInt(1, 3, input.random);
  return makeQuestion(input, 'numberPattern', `找规律：${values.map((value, index) => index === blankIndex ? '□' : value).join('，')}`, values[blankIndex], values.map(Math.abs), {
    layout: 'wide', metadata: { blankIndex, step, descending }
  });
}

export function generateArithmeticFamily(input: QuestionGenerationInput): Question {
  const total = randomInt(3, Math.min(maxFor(input), 100), input.random);
  const left = randomInt(1, total - 1, input.random);
  const right = total - left;
  const display = `${left}+${right}=${total}；${right}+${left}=${total}；${total}-${left}=${right}；${total}-${right}=${left}`;
  return makeQuestion(input, 'arithmeticFamily', `用 ${left}、${right}、${total} 写出四个有联系的加减法算式。`, display, [left, right, total], {
    layout: 'word', content: { kind: 'multiPart', parts: [
      { prompt: `${left}+${right}=`, answer: total },
      { prompt: `${right}+${left}=`, answer: total },
      { prompt: `${total}-${left}=`, answer: right },
      { prompt: `${total}-${right}=`, answer: left }
    ] }, answerDetails: { display, steps: display.split('；') }
  });
}

export function generateEstimation(input: QuestionGenerationInput): Question {
  const place = maxFor(input) >= 100 ? pick([10, 100], input.random) : 10;
  const value = randomInt(place, Math.max(place, Math.min(maxFor(input), 999)), input.random);
  const answer = Math.round(value / place) * place;
  return makeQuestion(input, 'estimation', `${value} 最接近下面哪个数？（按 ${place === 10 ? '整十' : '整百'}估算）`, answer, [value, place], {
    layout: 'wide', metadata: { place }
  });
}

function mismatch(type: NumberSenseType, question: Question): QuestionValidationResult {
  return { valid: false, errors: [`校验器题型不匹配：${type}`, `实际题型：${String(question?.type)}`] };
}

function commonErrors(question: Question, type: NumberSenseType, config: WorksheetConfig, definition?: QuestionDefinition): string[] {
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

function result(question: Question, config: WorksheetConfig, definition: QuestionDefinition | undefined, type: NumberSenseType, checks: string[]): QuestionValidationResult {
  const errors = commonErrors(question, type, config, definition);
  if (errors.includes('操作数无效')) return { valid: false, errors };
  errors.push(...checks);
  return { valid: errors.length === 0, errors };
}

function validIntegerOperands(question: Question, count: number): boolean {
  return Array.isArray(question.operands) && question.operands.length === count && question.operands.every(Number.isInteger);
}

function validateNumberRecognitionImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'numberRecognition') return mismatch('numberRecognition', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 3) || new Set(question.operands).size !== 3) errors.push('选项结构无效');
  if (validIntegerOperands(question, 3)) {
    const parsedTarget = /^圈出数字 (-?\d+)：　/.exec(question.text)?.[1];
    const target = parsedTarget === undefined ? Number.NaN : Number(parsedTarget);
    const distractors = question.operands.filter(value => value !== target);
    const [first, second] = distractors;
    if (typeof question.answer !== 'number' || !Number.isInteger(target) || question.answer !== target || !question.operands.includes(target)) errors.push('答案不在选项中');
    if (question.metadata?.magnitude !== target) errors.push('数字量级元数据错误');
    if (question.metadata?.distractorDistance !== Math.max(Math.abs(first - target), Math.abs(second - target))) errors.push('干扰项元数据错误');
    if (question.text !== `圈出数字 ${target}：　${question.operands.join('　')}`) errors.push('题面格式错误');
  }
  return result(question, config, definition, 'numberRecognition', errors);
}

function validateComparisonImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'comparison') return mismatch('comparison', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 2) || question.operands[0] === question.operands[1]) errors.push('比较操作数无效');
  if (validIntegerOperands(question, 2)) {
    const [left, right] = question.operands; const expected = Math.max(left, right); const relation = left > right ? '>' : '<';
    if (question.answer !== expected) errors.push('比较答案错误');
    if (question.metadata?.relation !== relation || question.metadata?.semantic !== 'choose-larger' || question.metadata?.magnitude !== expected) errors.push('比较关系元数据错误');
    if (question.text !== `圈出较大的数：　${left}　${right}`) errors.push('题面格式错误');
  }
  return result(question, config, definition, 'comparison', errors);
}

function validateCompareSignsImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'compareSigns') return mismatch('compareSigns', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 2)) errors.push('比较操作数无效');
  if (validIntegerOperands(question, 2)) {
    const [left, right] = question.operands; const expected: '=' | '>' | '<' = left === right ? '=' : left > right ? '>' : '<';
    if (question.answer !== expected) errors.push('比较符号答案错误');
    if (question.metadata?.relation !== expected || question.metadata?.semantic !== 'insert-sign' || question.metadata?.magnitude !== Math.max(left, right)) errors.push('比较关系元数据错误');
    if (question.text !== `${left}　○　${right}`) errors.push('题面格式错误');
  }
  return result(question, config, definition, 'compareSigns', errors);
}

function validateSequenceImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'numberSequence') return mismatch('numberSequence', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 5)) errors.push('数列操作数个数无效');
  const blank = Number(question.metadata?.blankIndex); const step = Number(question.metadata?.step);
  if (!Number.isInteger(blank) || blank < 1 || blank > 3 || !Number.isInteger(step) || step <= 0) errors.push('数列元数据无效');
  if (validIntegerOperands(question, 5) && Number.isInteger(blank) && Number.isInteger(step)) {
    if (question.operands.every((value, index) => index === 0 || value - question.operands[index - 1] === step) === false) errors.push('数列规律错误');
    const expected = question.operands[blank];
    if (question.answer !== expected) errors.push('数列答案错误');
    if (question.text !== `按顺序填数：${question.operands.map((value, index) => index === blank ? '□' : value).join('，')}`) errors.push('题面格式错误');
  }
  return result(question, config, definition, 'numberSequence', errors);
}

function validateCompositionImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'numberComposition') return mismatch('numberComposition', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 2)) errors.push('组成操作数无效');
  if (validIntegerOperands(question, 2)) {
    const [target, known] = question.operands;
    if (target < 2 || known < 0 || known > target || question.answer !== target - known) errors.push('数的组成答案错误');
    if (question.metadata?.relation !== 'part-whole') errors.push('组成关系元数据错误');
    if (question.text !== `${target} 可以分成 ${known} 和 □。`) errors.push('题面格式错误');
  }
  return result(question, config, definition, 'numberComposition', errors);
}

function validatePlaceValueImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'placeValue') return mismatch('placeValue', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 2)) errors.push('数位操作数无效');
  if (validIntegerOperands(question, 2)) {
    const [value, divisor] = question.operands; const label = divisor === 1 ? '个位' : divisor === 10 ? '十位' : divisor === 100 ? '百位' : '';
    if (value < 10 || value > 999 || ![1, 10, 100].includes(divisor) || divisor > value || !label) errors.push('数位边界无效');
    if (question.answer !== Math.floor(value / divisor) % 10) errors.push('数位答案错误');
    if (question.metadata?.divisor !== divisor || question.metadata?.label !== label) errors.push('数位元数据错误');
    if (question.text !== `数字 ${value} 的${label}上是 □。`) errors.push('题面格式错误');
  }
  return result(question, config, definition, 'placeValue', errors);
}

function validateNumberLineImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'numberLine') return mismatch('numberLine', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 6)) errors.push('数轴操作数个数无效');
  const blank = Number(question.metadata?.blankIndex); const step = Number(question.metadata?.step); const content = question.content;
  if (!Number.isInteger(blank) || blank < 1 || blank > 4 || !Number.isInteger(step) || step <= 0) errors.push('数轴元数据无效');
  if (content?.kind !== 'numberLine' || !validIntegerOperands(question, 6)) errors.push('数轴内容缺失');
  if (content?.kind === 'numberLine' && validIntegerOperands(question, 6) && Number.isInteger(blank) && Number.isInteger(step)) {
    const values = question.operands;
    if (content.start !== values[0] || content.end !== values[5] || content.step !== step || content.blankIndex !== blank || content.values.join(',') !== values.join(',')) errors.push('数轴内容与题目不一致');
    if (values.some((value, index) => index > 0 && value - values[index - 1] !== step) || question.answer !== values[blank] || content.values[blank] !== question.answer) errors.push('数轴规律或答案错误');
  }
  return result(question, config, definition, 'numberLine', errors);
}

function validateNumberPatternImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'numberPattern') return mismatch('numberPattern', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 5) || question.operands.some(value => value < 0)) errors.push('规律操作数无效');
  const blank = Number(question.metadata?.blankIndex); const step = Number(question.metadata?.step); const descending = question.metadata?.descending;
  if (!Number.isInteger(blank) || blank < 1 || blank > 3 || !Number.isInteger(step) || step <= 0 || typeof descending !== 'boolean') errors.push('规律元数据无效');
  if (validIntegerOperands(question, 5) && typeof descending === 'boolean' && Number.isInteger(blank) && Number.isInteger(step)) {
    const expected = question.operands.map((value, index) => question.operands[0] + (descending ? -1 : 1) * index * step);
    if (expected.some((value, index) => Math.abs(value) !== question.operands[index])) errors.push('规律序列与 descending 不一致');
    if (question.answer !== expected[blank]) errors.push('规律答案错误');
    if (question.text !== `找规律：${expected.map((value, index) => index === blank ? '□' : value).join('，')}`) errors.push('题面格式错误');
  }
  return result(question, config, definition, 'numberPattern', errors);
}

function validateArithmeticFamilyImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'arithmeticFamily') return mismatch('arithmeticFamily', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 3)) errors.push('算式关系操作数无效');
  if (validIntegerOperands(question, 3)) {
    const [left, right, total] = question.operands;
    const display = `${left}+${right}=${total}；${right}+${left}=${total}；${total}-${left}=${right}；${total}-${right}=${left}`;
    const parts = question.content?.kind === 'multiPart' ? question.content.parts : undefined;
    if (left <= 0 || right <= 0 || total !== left + right) errors.push('加减关系不成立');
    if (question.answer !== display || question.answerDetails?.display !== display || question.answerDetails?.steps?.join('；') !== display) errors.push('算式关系答案展示错误');
    if (!parts || parts.length !== 4 || parts.some((part, index) => String(part.answer) !== String([total, total, right, left][index]) || part.prompt !== [`${left}+${right}=`, `${right}+${left}=`, `${total}-${left}=`, `${total}-${right}=`][index])) errors.push('多小问答案结构不一致');
    if (question.text !== `用 ${left}、${right}、${total} 写出四个有联系的加减法算式。`) errors.push('题面格式错误');
  }
  return result(question, config, definition, 'arithmeticFamily', errors);
}

function validateEstimationImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'estimation') return mismatch('estimation', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 2)) errors.push('估算操作数无效');
  if (validIntegerOperands(question, 2)) {
    const [value, place] = question.operands; const unit = place === 10 ? '整十' : place === 100 ? '整百' : '';
    const expected = Math.round(value / place) * place;
    if (value < place || ![10, 100].includes(place) || !unit) errors.push('估算边界无效');
    if (question.answer !== expected) errors.push('估算答案错误');
    if (question.metadata?.place !== place) errors.push('估算元数据错误');
    if (question.text !== `${value} 最接近下面哪个数？（按 ${unit}估算）`) errors.push('题面格式错误');
  }
  return result(question, config, definition, 'estimation', errors);
}

function gated(type: NumberSenseType, minimum: WorksheetConfig['stage'], validator: QuestionValidator): QuestionValidator {
  return (question, config, definition) => {
    const validation = validator(question, config, definition);
    if (validation.valid && stageBefore(config, minimum)) return { valid: false, errors: ['题型不符合年级要求'] };
    if (stageBefore(config, minimum) && !validation.errors.includes('题型不符合年级要求')) validation.errors.push('题型不符合年级要求');
    void type;
    return { valid: validation.errors.length === 0, errors: validation.errors };
  };
}

export const validateNumberRecognition: QuestionValidator = validateNumberRecognitionImpl;
export const validateComparison: QuestionValidator = validateComparisonImpl;
export const validateCompareSigns: QuestionValidator = gated('compareSigns', 'grade1', validateCompareSignsImpl);
export const validateNumberSequence: QuestionValidator = validateSequenceImpl;
export const validateNumberComposition: QuestionValidator = validateCompositionImpl;
export const validatePlaceValue: QuestionValidator = gated('placeValue', 'grade1', validatePlaceValueImpl);
export const validateNumberLine: QuestionValidator = gated('numberLine', 'grade1', validateNumberLineImpl);
export const validateNumberPattern: QuestionValidator = gated('numberPattern', 'grade1', validateNumberPatternImpl);
export const validateArithmeticFamily: QuestionValidator = gated('arithmeticFamily', 'grade1', validateArithmeticFamilyImpl);
export const validateEstimation: QuestionValidator = gated('estimation', 'grade2', validateEstimationImpl);

export type { NumberSenseType };
