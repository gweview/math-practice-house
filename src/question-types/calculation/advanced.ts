import { Decimal } from '../../domain/math-core/decimal';
import { Fraction } from '../../domain/math-core/fraction';
import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import type { Question } from '../../domain/questions/model';
import type { WorksheetConfig } from '../../domain/worksheet/config';
import type { RandomSource } from '../../shared/random/seeded-random';

type AdvancedType = 'rounding' | 'decimalOperation' | 'fractionOperation' | 'simpleEquation' | 'percent' | 'makeTarget' | 'operationErrorDiagnosis';

const DIFFICULTIES = ['entry', 'easy', 'standard', 'advanced', 'challenge'] as const;
const CURRICULUM_MAXIMUMS: Record<WorksheetConfig['stage'], number> = {
  preschool: 10, grade1: 20, grade2: 100, grade3: 1000,
  grade4: 100_000_000, grade5: 100_000_000, grade6: 100_000_000
};

function difficultyRank(config: WorksheetConfig): number {
  return DIFFICULTIES.indexOf(config.difficulty);
}

function randomInt(min: number, max: number, random: RandomSource): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[], random: RandomSource): T {
  return items[randomInt(0, items.length - 1, random)];
}

function scaledCoefficient(value: Decimal, scale: number): number {
  return Number(value.toFixed(scale).replace('.', ''));
}

function makeQuestion(
  input: QuestionGenerationInput,
  type: AdvancedType,
  text: string,
  answer: number | string,
  operands: number[],
  options: Partial<Pick<Question, 'layout' | 'operators' | 'metadata' | 'content' | 'answerDetails'>> = {}
): Question {
  const display = options.answerDetails?.display ?? String(answer);
  const signatureData = options.metadata?.signatureData ?? `${text}|${display}|${operands.join(',')}`;
  return {
    id: input.createId(), type, text, answer, operands,
    signature: `${type}:${String(signatureData)}`,
    layout: options.layout ?? 'inline', operators: options.operators,
    metadata: options.metadata, content: options.content,
    answerDetails: { display, ...options.answerDetails }
  };
}

export function generateRounding(input: QuestionGenerationInput): Question {
  const { config, random } = input;
  const places = difficultyRank(config) < 2 ? [10, 100] : [10, 100, 1000, 10_000];
  const place = pick(places, random);
  const value = randomInt(place, Math.max(place, Math.min(99_999_999, place * 999)), random);
  const answer = Math.round(value / place) * place;
  const unit = place === 10 ? '十' : place === 100 ? '百' : place === 1000 ? '千' : '万';
  return makeQuestion(input, 'rounding', `把 ${value.toLocaleString('zh-CN')} 四舍五入到${unit}位。`, answer, [value, place], {
    layout: 'wide', metadata: { place }
  });
}

export function generateDecimalOperation(input: QuestionGenerationInput): Question {
  const { config, random } = input;
  const scale = difficultyRank(config) < 3 ? 1 : 2;
  const left = Decimal.fromScaled(BigInt(randomInt(10, 999, random)), scale);
  const right = Decimal.fromScaled(BigInt(randomInt(1, 99, random)), scale);
  const operation = random() < .55 ? '+' : '-';
  const [first, second] = operation === '-' && left.compare(right) < 0 ? [right, left] : [left, right];
  const result = operation === '+' ? first.add(second) : first.subtract(second);
  return makeQuestion(input, 'decimalOperation', `${first.toString()} ${operation} ${second.toString()} =`, result.toString(), [scaledCoefficient(first, scale), scaledCoefficient(second, scale), scale, operation === '+' ? 0 : 1], {
    metadata: { left: first.toString(), right: second.toString(), operation, scale },
    answerDetails: { display: result.toString(), steps: [`${first.toString()} ${operation} ${second.toString()} = ${result.toString()}`] }
  });
}

export function generateFractionOperation(input: QuestionGenerationInput): Question {
  const { config, random } = input;
  let denominator = randomInt(2, difficultyRank(config) < 3 ? 9 : 12, random);
  let leftNumerator = randomInt(1, denominator - 1, random);
  const denominatorLimit = difficultyRank(config) < 3 ? 9 : 12;
  let rightDenominator = difficultyRank(config) < 2 ? denominator : randomInt(2, denominatorLimit, random);
  let rightNumerator = randomInt(1, rightDenominator - 1, random);
  const operation = config.stage === 'grade5' ? (random() < .5 ? '+' : '-') : pick(['+', '-', '×', '÷'] as const, random);
  if (operation === '-' && leftNumerator * rightDenominator < rightNumerator * denominator) {
    [leftNumerator, rightNumerator] = [rightNumerator, leftNumerator];
    [denominator, rightDenominator] = [rightDenominator, denominator];
  }
  const left = new Fraction(leftNumerator, denominator);
  const right = new Fraction(rightNumerator, rightDenominator);
  const result = operation === '+' ? left.add(right) : operation === '-' ? left.subtract(right) : operation === '×' ? left.multiply(right) : left.divide(right);
  return makeQuestion(input, 'fractionOperation', `${left.toFractionString()} ${operation} ${right.toFractionString()} =`, result.toMixedString(), [leftNumerator, denominator, rightNumerator, rightDenominator], {
    layout: 'wide', metadata: { operation },
    answerDetails: { display: result.toMixedString(), steps: [`最简结果：${result.toFractionString()}`] }
  });
}

export function generateSimpleEquation(input: QuestionGenerationInput): Question {
  const { config, random } = input;
  if (difficultyRank(config) >= 2 && random() < .45) {
    const factor = randomInt(2, 12, random);
    const solution = randomInt(2, 50, random);
    return makeQuestion(input, 'simpleEquation', `${factor}x = ${factor * solution}`, solution, [factor, factor * solution], {
      layout: 'wide', metadata: { equation: 'multiplication' },
      answerDetails: { display: `x = ${solution}`, steps: [`x = ${factor * solution} ÷ ${factor}`, `x = ${solution}`] }
    });
  }
  const addend = randomInt(2, 100, random);
  const solution = randomInt(1, 100, random);
  return makeQuestion(input, 'simpleEquation', `x + ${addend} = ${addend + solution}`, solution, [addend, addend + solution], {
    layout: 'wide', metadata: { equation: 'addition' },
    answerDetails: { display: `x = ${solution}`, steps: [`x = ${addend + solution} - ${addend}`, `x = ${solution}`] }
  });
}

export function generatePercent(input: QuestionGenerationInput): Question {
  const { random } = input;
  const rate = pick([10, 20, 25, 40, 50, 60, 75, 80], random);
  const base = randomInt(2, 50, random) * 20;
  const result = new Fraction(base * rate, 100);
  return makeQuestion(input, 'percent', `${base} 的 ${rate}% 是多少？`, result.toFractionString(), [base, rate], {
    layout: 'wide', metadata: { rate }, answerDetails: { display: result.toFractionString(), steps: [`${base} × ${rate}% = ${result.toFractionString()}`] }
  });
}

export function generateMakeTarget(input: QuestionGenerationInput): Question {
  const { profile, random } = input;
  const target = randomInt(5, Math.max(5, Math.min(100, profile.max)), random);
  const left = randomInt(1, target - 1, random);
  const right = target - left;
  return makeQuestion(input, 'makeTarget', `想一想：用两个数凑成${target}，填空：${left}+□=${target}。`, right, [target, left], {
    layout: 'wide', metadata: { target }, answerDetails: { display: String(right), steps: [`${left}+${right}=${target}`] }
  });
}

export function generateOperationErrorDiagnosis(input: QuestionGenerationInput): Question {
  const { profile, random } = input;
  const left = randomInt(2, Math.max(2, Math.min(50, profile.max)), random);
  const right = randomInt(1, Math.max(1, left - 1), random);
  const correct = left + right;
  const isCorrect = random() < .5;
  const shown = isCorrect ? correct : correct + (random() < .5 ? 1 : 2);
  const answer = isCorrect ? '正确' : `错误，应为${correct}`;
  return makeQuestion(input, 'operationErrorDiagnosis', `${left}+${right}=${shown}，计算正确吗？若不正确请改正。`, answer, [left, right, shown], {
    layout: 'wide', metadata: { shown },
    content: { kind: 'multiPart', parts: [{ prompt: '判断：', answer: isCorrect ? '正确' : '错误' }, { prompt: isCorrect ? '正确结果：' : '改正为：', answer: correct }] }
  });
}

function typeMismatch(type: AdvancedType, question: Question): QuestionValidationResult {
  return { valid: false, errors: [`校验器题型不匹配：${type}`, `实际题型：${String(question?.type)}`] };
}

function commonErrors(question: Question, type: AdvancedType, config: WorksheetConfig, definition?: QuestionDefinition): string[] {
  const errors: string[] = [];
  if (!question || question.type !== type) return [`校验器题型不匹配：${type}`];
  if (!Array.isArray(question.operands) || question.operands.some(value => !Number.isFinite(value))) errors.push('操作数无效');
  const maximum = definition?.difficultyProfiles[config.difficulty]?.max ?? definition?.difficultyProfiles.standard?.max;
  if (Array.isArray(question.operands)) {
    if (Number.isFinite(maximum) && question.operands.some(value => value > Number(maximum))) errors.push('题目超过该题型难度上限');
    if (config.rangeMode === 'curriculum' && question.operands.some(value => value > CURRICULUM_MAXIMUMS[config.stage])) errors.push('题目超过当前学习阶段范围');
  }
  if (!config.types.includes(type)) errors.push('题型不在配置中');
  return errors;
}

function stageBefore(config: WorksheetConfig, minimum: WorksheetConfig['stage']): boolean {
  const stages = ['preschool', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'] as const;
  return stages.indexOf(config.stage) < stages.indexOf(minimum);
}

function detailErrors(question: Question, display: string, steps?: string[]): string[] {
  const errors: string[] = [];
  if (question.answerDetails?.display !== display) errors.push('答案展示错误');
  if (steps && question.answerDetails?.steps?.join('|') !== steps.join('|')) errors.push('答案步骤错误');
  return errors;
}

function validateRoundingQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  const errors = commonErrors(question, 'rounding', config, definition);
  if (errors.some(error => error === '操作数无效')) return { valid: false, errors };
  if (stageBefore(config, 'grade4')) errors.push('题型不符合年级要求');
  if (question.operands.length !== 2) return { valid: false, errors: [...errors, '操作数个数无效'] };
  const [value, place] = question.operands;
  const places = difficultyRank(config) < 2 ? [10, 100] : [10, 100, 1000, 10_000];
  const unit = place === 10 ? '十' : place === 100 ? '百' : place === 1000 ? '千' : place === 10_000 ? '万' : '';
  if (!Number.isInteger(value) || !Number.isInteger(place) || !places.includes(place) || value < place || value > Math.min(99_999_999, place * 999) || !unit) errors.push('四舍五入边界无效');
  const answer = Math.round(value / place) * place;
  if (question.answer !== answer) errors.push('四舍五入答案错误');
  if (question.metadata?.place !== place) errors.push('舍入位数元数据错误');
  if (question.text !== `把 ${value.toLocaleString('zh-CN')} 四舍五入到${unit}位。`) errors.push('题面格式错误');
  errors.push(...detailErrors(question, String(answer)));
  return { valid: errors.length === 0, errors };
}

function validateDecimalOperationQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  const errors = commonErrors(question, 'decimalOperation', config, definition);
  if (errors.some(error => error === '操作数无效')) return { valid: false, errors };
  if (stageBefore(config, 'grade5')) errors.push('题型不符合年级要求');
  if (question.operands.length !== 4 || !question.operands.every(Number.isInteger)) return { valid: false, errors: [...errors, '小数操作数格式无效'] };
  const [a, b, scale, flag] = question.operands;
  const operation = flag === 0 ? '+' : flag === 1 ? '-' : '';
  const expectedScale = difficultyRank(config) < 3 ? 1 : 2;
  const validScale = scale === 1 || scale === 2;
  const left = validScale ? Decimal.fromScaled(BigInt(a), scale) : undefined;
  const right = validScale ? Decimal.fromScaled(BigInt(b), scale) : undefined;
  if (!left || !right || scale !== expectedScale || a < 10 || a > 999 || b < 1 || b > 99 || !operation) errors.push('小数运算边界无效');
  if (left && right && operation && !errors.includes('小数运算边界无效')) {
    if (operation === '-' && left.compare(right) < 0) errors.push('减法结果应为非负数');
    const result = operation === '+' ? left.add(right) : left.subtract(right);
    const display = result.toString();
    if (question.answer !== display) errors.push('小数运算答案错误');
    if (question.metadata?.left !== left.toString() || question.metadata?.right !== right.toString() || question.metadata?.operation !== operation || question.metadata?.scale !== scale) errors.push('小数运算元数据错误');
    if (question.text !== `${left.toString()} ${operation} ${right.toString()} =`) errors.push('题面格式错误');
    errors.push(...detailErrors(question, display, [`${left.toString()} ${operation} ${right.toString()} = ${display}`]));
  }
  return { valid: errors.length === 0, errors };
}

function validateFractionOperationQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  const errors = commonErrors(question, 'fractionOperation', config, definition);
  if (errors.some(error => error === '操作数无效')) return { valid: false, errors };
  if (stageBefore(config, 'grade5')) errors.push('题型不符合年级要求');
  if (question.operands.length !== 4) return { valid: false, errors: [...errors, '分数操作数个数无效'] };
  const [a, b, c, d] = question.operands;
  const operation = question.metadata?.operation;
  const maxDenominator = difficultyRank(config) < 3 ? 9 : 12;
  if (![a, c].every(value => Number.isInteger(value) && value >= 1) || ![b, d].every(value => Number.isInteger(value) && value >= 2 && value <= 12) || b > maxDenominator || (difficultyRank(config) < 2 && d !== b) || (operation === '-' && a * d < c * b) || (config.stage === 'grade5' && !['+', '-'].includes(String(operation))) || !['+', '-', '×', '÷'].includes(String(operation)) || (operation === '÷' && c === 0)) errors.push('分数运算边界无效');
  try {
    const left = new Fraction(a, b); const right = new Fraction(c, d);
    const result = operation === '+' ? left.add(right) : operation === '-' ? left.subtract(right) : operation === '×' ? left.multiply(right) : operation === '÷' ? left.divide(right) : undefined;
    if (!result) errors.push('分数运算符无效');
    else {
      const display = result.toMixedString();
      if (question.answer !== display) errors.push('分数运算答案错误');
      if (question.text !== `${left.toFractionString()} ${String(operation)} ${right.toFractionString()} =`) errors.push('题面格式错误');
      if (question.metadata?.operation !== operation) errors.push('分数运算元数据错误');
      errors.push(...detailErrors(question, display, [`最简结果：${result.toFractionString()}`]));
    }
  } catch { errors.push('分数操作数无效'); }
  return { valid: errors.length === 0, errors };
}

function validateSimpleEquationQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  const errors = commonErrors(question, 'simpleEquation', config, definition);
  if (errors.some(error => error === '操作数无效')) return { valid: false, errors };
  if (stageBefore(config, 'grade5')) errors.push('题型不符合年级要求');
  if (question.operands.length !== 2) return { valid: false, errors: [...errors, '方程操作数个数无效'] };
  const [a, b] = question.operands; const equation = question.metadata?.equation;
  if (!Number.isInteger(a) || !Number.isInteger(b) || typeof question.answer !== 'number' || !Number.isInteger(question.answer)) errors.push('方程数值格式无效');
  if (equation === 'multiplication' && (difficultyRank(config) < 2 || a < 2 || a > 12 || b !== a * Math.round(Number(question.answer)))) errors.push('乘法方程边界无效');
  if (equation === 'addition' && (a < 2 || a > 100 || b <= a || b - a > 100)) errors.push('加法方程边界无效');
  if (!['addition', 'multiplication'].includes(String(equation))) errors.push('方程元数据无效');
  const expected = equation === 'multiplication' ? b / a : b - a;
  if (question.answer !== expected) errors.push('方程答案错误');
  const text = equation === 'multiplication' ? `${a}x = ${b}` : `x + ${a} = ${b}`;
  if (question.text !== text) errors.push('题面格式错误');
  const display = `x = ${expected}`;
  const steps = equation === 'multiplication' ? [`x = ${b} ÷ ${a}`, `x = ${expected}`] : [`x = ${b} - ${a}`, `x = ${expected}`];
  errors.push(...detailErrors(question, display, steps));
  return { valid: errors.length === 0, errors };
}

function validatePercentQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  const errors = commonErrors(question, 'percent', config, definition);
  if (errors.some(error => error === '操作数无效')) return { valid: false, errors };
  if (stageBefore(config, 'grade6')) errors.push('题型不符合年级要求');
  if (question.operands.length !== 2) return { valid: false, errors: [...errors, '百分数操作数个数无效'] };
  const [base, rate] = question.operands;
  const allowed = [10, 20, 25, 40, 50, 60, 75, 80];
  if (!Number.isInteger(base) || !Number.isInteger(rate) || base < 40 || base > 1000 || base % 20 !== 0 || !allowed.includes(rate)) errors.push('百分数边界无效');
  if (!errors.includes('百分数边界无效')) {
    const result = new Fraction(base * rate, 100).toFractionString();
    if (question.answer !== result) errors.push('百分数答案错误');
    if (question.metadata?.rate !== rate) errors.push('百分数元数据错误');
    if (question.text !== `${base} 的 ${rate}% 是多少？`) errors.push('题面格式错误');
    errors.push(...detailErrors(question, result, [`${base} × ${rate}% = ${result}`]));
  }
  return { valid: errors.length === 0, errors };
}

function validateMakeTargetQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  const errors = commonErrors(question, 'makeTarget', config, definition);
  if (errors.some(error => error === '操作数无效')) return { valid: false, errors };
  if (stageBefore(config, 'grade6')) errors.push('题型不符合年级要求');
  if (question.operands.length !== 2) return { valid: false, errors: [...errors, '凑数操作数个数无效'] };
  const [target, left] = question.operands; const right = target - left;
  if (!Number.isInteger(target) || !Number.isInteger(left) || typeof question.answer !== 'number' || !Number.isInteger(question.answer) || target < 5 || target > 100 || left < 1 || left >= target || question.metadata?.target !== target) errors.push('凑数题边界或元数据无效');
  if (question.answer !== right) errors.push('凑数题答案错误');
  if (question.text !== `想一想：用两个数凑成${target}，填空：${left}+□=${target}。`) errors.push('题面格式错误');
  errors.push(...detailErrors(question, String(right), [`${left}+${right}=${target}`]));
  return { valid: errors.length === 0, errors };
}

function validateOperationErrorDiagnosisQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  const errors = commonErrors(question, 'operationErrorDiagnosis', config, definition);
  if (errors.some(error => error === '操作数无效')) return { valid: false, errors };
  if (stageBefore(config, 'grade1')) errors.push('题型不符合年级要求');
  if (question.operands.length !== 3) return { valid: false, errors: [...errors, '运算诊断操作数个数无效'] };
  const [left, right, shown] = question.operands; const correct = left + right;
  const validWrong = shown === correct + 1 || shown === correct + 2;
  if (![left, right, shown].every(value => Number.isInteger(value)) || left < 2 || left > 50 || right < 1 || right >= left || (!validWrong && shown !== correct)) errors.push('运算诊断边界无效');
  const isCorrect = shown === correct;
  const answer = isCorrect ? '正确' : `错误，应为${correct}`;
  if (question.answer !== answer || question.metadata?.shown !== shown) errors.push('运算诊断答案或元数据错误');
  if (question.text !== `${left}+${right}=${shown}，计算正确吗？若不正确请改正。`) errors.push('题面格式错误');
  const parts = question.content?.kind === 'multiPart' ? question.content.parts : undefined;
  if (!parts || parts.length !== 2 || parts[0].prompt !== '判断：' || parts[0].answer !== (isCorrect ? '正确' : '错误') || parts[1].prompt !== (isCorrect ? '正确结果：' : '改正为：') || parts[1].answer !== correct) errors.push('运算诊断多小问结构错误');
  errors.push(...detailErrors(question, answer));
  return { valid: errors.length === 0, errors };
}

function validatorFor(type: AdvancedType, validator: (question: Question, config: WorksheetConfig, definition?: QuestionDefinition) => QuestionValidationResult): QuestionValidator {
  return (question, config, definition) => question?.type === type ? validator(question, config, definition) : typeMismatch(type, question);
}

export const validateRounding = validatorFor('rounding', validateRoundingQuestion);
export const validateDecimalOperation = validatorFor('decimalOperation', validateDecimalOperationQuestion);
export const validateFractionOperation = validatorFor('fractionOperation', validateFractionOperationQuestion);
export const validateSimpleEquation = validatorFor('simpleEquation', validateSimpleEquationQuestion);
export const validatePercent = validatorFor('percent', validatePercentQuestion);
export const validateMakeTarget = validatorFor('makeTarget', validateMakeTargetQuestion);
export const validateOperationErrorDiagnosis = validatorFor('operationErrorDiagnosis', validateOperationErrorDiagnosisQuestion);
