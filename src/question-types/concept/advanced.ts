import { Fraction } from '../../domain/math-core/fraction';
import { Decimal } from '../../domain/math-core/decimal';
import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import type { Question } from '../../domain/questions/model';
import type { WorksheetConfig } from '../../domain/worksheet/config';
import type { RandomSource } from '../../shared/random/seeded-random';

type AdvancedConceptType = 'largeNumberPlaceValue' | 'operationLaw' | 'decimalComparison' | 'factorsMultiples' | 'ratio' | 'negativeNumber' | 'calendarWeekday' | 'fractionVisual' | 'primeComposite' | 'commonFactorsMultiples';
const DIFFICULTIES = ['entry', 'easy', 'standard', 'advanced', 'challenge'] as const;
const STAGES = ['preschool', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'] as const;
const CURRICULUM_MAXIMUMS: Readonly<Record<WorksheetConfig['stage'], number>> = {
  preschool: 10, grade1: 20, grade2: 100, grade3: 1000, grade4: 100_000_000, grade5: 100_000_000, grade6: 100_000_000
};

function rank(config: WorksheetConfig): number { return Math.max(0, DIFFICULTIES.indexOf(config.difficulty)); }
function randomInt(min: number, max: number, random: RandomSource): number {
  const lower = Math.ceil(Math.min(min, max)); const upper = Math.floor(Math.max(min, max));
  return Math.floor(random() * (upper - lower + 1)) + lower;
}
function pick<T>(items: readonly T[], random: RandomSource): T { return items[randomInt(0, items.length - 1, random)]; }
function gcd(left: number, right: number): number {
  let a = Math.abs(left); let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a || 1;
}
function isPrime(value: number): boolean {
  if (value < 2 || !Number.isInteger(value)) return false;
  for (let divisor = 2; divisor * divisor <= value; divisor += 1) if (value % divisor === 0) return false;
  return true;
}
function makeQuestion(input: QuestionGenerationInput, type: AdvancedConceptType, text: string, answer: number | string, operands: number[], options: Partial<Pick<Question, 'layout' | 'metadata' | 'content' | 'answerDetails'>> = {}): Question {
  const display = options.answerDetails?.display ?? String(answer);
  const signatureData = options.metadata?.signatureData ?? `${text}|${display}|${operands.join(',')}`;
  return { id: input.createId(), type, text, answer, operands, signature: `${type}:${String(signatureData)}`, layout: options.layout ?? 'inline', metadata: options.metadata, content: options.content, answerDetails: { display, ...options.answerDetails } };
}
function profile(max: number): QuestionDefinition['difficultyProfiles'] {
  return Object.fromEntries(DIFFICULTIES.map(difficulty => [difficulty, { max, terms: 3, carryRate: rankForDifficulty(difficulty) / 4, highRangeRate: rankForDifficulty(difficulty) / 5, wordSteps: 1, maxFactor: 12, trivialRate: .1, equalityRate: .2, mixedRate: .4 }])) as QuestionDefinition['difficultyProfiles'];
}
function rankForDifficulty(difficulty: typeof DIFFICULTIES[number]): number { return DIFFICULTIES.indexOf(difficulty); }
function stageBefore(config: WorksheetConfig, minimum: WorksheetConfig['stage']): boolean { return STAGES.indexOf(config.stage) < STAGES.indexOf(minimum); }

function common(question: Question, type: AdvancedConceptType, config: WorksheetConfig, definition: QuestionDefinition | undefined, count: number): string[] {
  const errors: string[] = [];
  if (!question || question.type !== type) return [`校验器题型不匹配：${type}`, `实际题型：${String(question?.type)}`];
  if (!Array.isArray(question.operands) || question.operands.length !== count || question.operands.some(value => !Number.isFinite(value))) errors.push('操作数结构无效');
  const maximum = definition?.difficultyProfiles[config.difficulty]?.max;
  if (Array.isArray(question.operands) && Number.isFinite(maximum) && question.operands.some(value => Math.abs(value) > Number(maximum))) errors.push('题目超过该题型难度上限');
  if (config.rangeMode === 'curriculum' && Array.isArray(question.operands) && question.operands.some(value => Math.abs(value) > CURRICULUM_MAXIMUMS[config.stage])) errors.push('题目超过当前学习阶段范围');
  if (!config.types.includes(type)) errors.push('题型不在配置中');
  return errors;
}
function finish(errors: string[]): QuestionValidationResult { return { valid: errors.length === 0, errors }; }
function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => same(value, right[index]));
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left as object); const rightKeys = Object.keys(right as object);
  return leftKeys.length === rightKeys.length && leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key) && same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}
function structureErrors(question: Question, type: AdvancedConceptType, text: string, display: string, operands: number[], layout: Question['layout'], metadata?: Record<string, string | number | boolean>, content?: Question['content'], steps?: string[]): string[] {
  const errors: string[] = [];
  const expectedSignature = `${type}:${text}|${display}|${operands.join(',')}`;
  const expectedDetails = { display, ...(steps ? { steps } : {}) };
  if (question.text !== text) errors.push('题面格式错误');
  if (question.layout !== layout) errors.push('题目布局错误');
  if (question.signature !== expectedSignature) errors.push('题目签名错误');
  if (!same(question.metadata, metadata)) errors.push('题目元数据结构错误');
  if (!same(question.content, content)) errors.push('题目内容结构错误');
  if (!same(question.answerDetails, expectedDetails)) errors.push('答案详情结构错误');
  if (question.operators !== undefined) errors.push('题目运算符结构错误');
  return errors;
}
function integerOperands(question: Question, count: number): boolean { return Array.isArray(question.operands) && question.operands.length === count && question.operands.every(Number.isInteger); }

export function solveLargeNumberPlaceValue(question: Question): number | undefined { if (!integerOperands(question, 2)) return undefined; return Math.floor(question.operands[0] / question.operands[1]) % 10; }
export function generateLargeNumberPlaceValue(input: QuestionGenerationInput): Question {
  const value = randomInt(10_000, 99_999_999, input.random);
  const divisor = pick([10_000, 100_000, 1_000_000, 10_000_000].filter(item => item <= value), input.random);
  const labels: Record<number, string> = { 10_000: '万位', 100_000: '十万位', 1_000_000: '百万位', 10_000_000: '千万位' };
  return makeQuestion(input, 'largeNumberPlaceValue', `在数 ${value.toLocaleString('zh-CN')} 中，${labels[divisor]}上的数字是 □。`, Math.floor(value / divisor) % 10, [value, divisor], { layout: 'wide', metadata: { divisor } });
}
export const validateLargeNumberPlaceValue: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'largeNumberPlaceValue', config, definition, 2);
  if (stageBefore(config, 'grade4')) errors.push('题型不符合年级要求');
  if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [value, divisor] = question.operands; const labels: Record<number, string> = { 10_000: '万位', 100_000: '十万位', 1_000_000: '百万位', 10_000_000: '千万位' }; const expected = solveLargeNumberPlaceValue(question);
  if (!Number.isInteger(value) || value < 10_000 || value > 99_999_999 || !Object.hasOwn(labels, divisor) || divisor > value || question.answer !== expected) errors.push('大数数位边界或答案错误');
  errors.push(...structureErrors(question, 'largeNumberPlaceValue', `在数 ${value.toLocaleString('zh-CN')} 中，${labels[divisor]}上的数字是 □。`, String(expected), [value, divisor], 'wide', { divisor }));
  return finish(errors);
};

export function solveOperationLaw(question: Question): number | undefined { return integerOperands(question, 3) ? question.operands[0] * (question.operands[1] + question.operands[2]) : undefined; }
export function generateOperationLaw(input: QuestionGenerationInput): Question {
  const a = randomInt(2, rank(input.config) < 2 ? 20 : 60, input.random); const b = randomInt(2, 30, input.random); const c = randomInt(2, 30, input.random); const answer = a * (b + c);
  return makeQuestion(input, 'operationLaw', `${a} × ${b} + ${a} × ${c} =`, answer, [a, b, c], { layout: 'wide', metadata: { law: 'distributive' }, answerDetails: { display: String(answer), steps: [`${a} × (${b} + ${c})`, `${a} × ${b + c} = ${answer}`] } });
}
export const validateOperationLaw: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'operationLaw', config, definition, 3); if (stageBefore(config, 'grade4')) errors.push('题型不符合年级要求');
  if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [a, b, c] = question.operands; const expected = solveOperationLaw(question); const steps = [`${a} × (${b} + ${c})`, `${a} × ${b + c} = ${expected}`];
  if (![a, b, c].every(Number.isInteger) || a < 2 || b < 2 || c < 2 || question.answer !== expected) errors.push('运算律边界或答案错误');
  errors.push(...structureErrors(question, 'operationLaw', `${a} × ${b} + ${a} × ${c} =`, String(expected), [a, b, c], 'wide', { law: 'distributive' }, undefined, steps)); return finish(errors);
};

export function solveDecimalComparison(question: Question): '=' | '>' | '<' | undefined {
  if (!integerOperands(question, 3) || ![1, 2].includes(question.operands[2])) return undefined;
  const [left, right, scale] = question.operands; const l = Decimal.fromScaled(BigInt(left), scale); const r = Decimal.fromScaled(BigInt(right), scale); const comparison = l.compare(r); return comparison === 0 ? '=' : comparison > 0 ? '>' : '<';
}
export function generateDecimalComparison(input: QuestionGenerationInput): Question {
  const scale = rank(input.config) < 2 ? 1 : 2; const leftCoefficient = randomInt(1, 999, input.random); let rightCoefficient = randomInt(1, 999, input.random); if (rightCoefficient === leftCoefficient) rightCoefficient = rightCoefficient === 999 ? 1 : rightCoefficient + 1;
  const left = Decimal.fromScaled(BigInt(leftCoefficient), scale); const right = Decimal.fromScaled(BigInt(rightCoefficient), scale);
  return makeQuestion(input, 'decimalComparison', `${left.toString()} □ ${right.toString()}`, left.compare(right) > 0 ? '>' : '<', [leftCoefficient, rightCoefficient, scale], { metadata: { left: left.toString(), right: right.toString(), scale } });
}
export const validateDecimalComparison: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'decimalComparison', config, definition, 3); if (stageBefore(config, 'grade5')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [leftCoefficient, rightCoefficient, scale] = question.operands; let left: Decimal | undefined; let right: Decimal | undefined;
  try { left = Decimal.fromScaled(BigInt(leftCoefficient), scale); right = Decimal.fromScaled(BigInt(rightCoefficient), scale); } catch { errors.push('小数操作数无效'); }
  const expected = solveDecimalComparison(question); const expectedScale = rank(config) < 2 ? 1 : 2;
  if (!left || !right || ![1, 2].includes(scale) || scale !== expectedScale || leftCoefficient < 1 || rightCoefficient < 1 || leftCoefficient > 999 || rightCoefficient > 999 || leftCoefficient === rightCoefficient || question.answer !== expected) errors.push('小数比较边界或答案错误');
  if (left && right && expected) errors.push(...structureErrors(question, 'decimalComparison', `${left.toString()} □ ${right.toString()}`, expected, [leftCoefficient, rightCoefficient, scale], 'inline', { left: left.toString(), right: right.toString(), scale })); return finish(errors);
};

export function solveFactorsMultiples(question: Question): '是' | '否' | undefined { return integerOperands(question, 2) && question.operands[1] > 0 ? question.operands[0] % question.operands[1] === 0 ? '是' : '否' : undefined; }
export function generateFactorsMultiples(input: QuestionGenerationInput): Question {
  const base = randomInt(2, 20, input.random); const value = base * randomInt(2, 20, input.random); const isMultiple = input.random() < .65; let candidate = isMultiple ? base : base + 1; while (!isMultiple && value % candidate === 0) candidate += 1;
  return makeQuestion(input, 'factorsMultiples', `${value} 是 ${candidate} 的倍数吗？`, value % candidate === 0 ? '是' : '否', [value, candidate], { layout: 'wide', metadata: { relation: 'multiple' } });
}
export const validateFactorsMultiples: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'factorsMultiples', config, definition, 2); if (stageBefore(config, 'grade5')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [value, candidate] = question.operands; const expected = solveFactorsMultiples(question); if (!Number.isInteger(value) || !Number.isInteger(candidate) || value < 2 || candidate < 2 || question.answer !== expected) errors.push('因数倍数边界或答案错误');
  if (expected) errors.push(...structureErrors(question, 'factorsMultiples', `${value} 是 ${candidate} 的倍数吗？`, expected, [value, candidate], 'wide', { relation: 'multiple' })); return finish(errors);
};

export function solveRatio(question: Question): string | undefined { if (!integerOperands(question, 2) || question.operands.some(value => value <= 0)) return undefined; const divisor = gcd(question.operands[0], question.operands[1]); return `${question.operands[0] / divisor}:${question.operands[1] / divisor}`; }
export function generateRatio(input: QuestionGenerationInput): Question {
  const commonFactor = randomInt(2, 12, input.random); const left = commonFactor * randomInt(1, 12, input.random); let rightBase = randomInt(1, 12, input.random); const leftBase = left / commonFactor; if (rightBase === leftBase) rightBase = rightBase === 12 ? 11 : rightBase + 1; const right = commonFactor * rightBase; const divisor = gcd(left, right); const display = `${left / divisor}:${right / divisor}`;
  return makeQuestion(input, 'ratio', `把比 ${left}:${right} 化成最简整数比。`, display, [left, right], { metadata: { divisor }, answerDetails: { display, steps: [`同时除以最大公因数 ${divisor}`, display] } });
}
export const validateRatio: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'ratio', config, definition, 2); if (stageBefore(config, 'grade6')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [left, right] = question.operands; const divisor = gcd(left, right); const expected = solveRatio(question); if (!Number.isInteger(left) || !Number.isInteger(right) || left <= 0 || right <= 0 || question.answer !== expected) errors.push('化简比边界或答案错误');
  if (expected) errors.push(...structureErrors(question, 'ratio', `把比 ${left}:${right} 化成最简整数比。`, expected, [left, right], 'inline', { divisor }, undefined, [`同时除以最大公因数 ${divisor}`, expected])); return finish(errors);
};

export function solveNegativeNumber(question: Question): '=' | '>' | '<' | undefined { if (!integerOperands(question, 4) || ![0, 1].every(index => [0, 1].includes(question.operands[index + 2]))) return undefined; const left = question.operands[2] === 0 ? -question.operands[0] : question.operands[0]; const right = question.operands[3] === 0 ? -question.operands[1] : question.operands[1]; return left === right ? '=' : left > right ? '>' : '<'; }
export function generateNegativeNumber(input: QuestionGenerationInput): Question {
  const left = -randomInt(1, 20, input.random); const right = input.random() < .5 ? -randomInt(1, 20, input.random) : randomInt(0, 12, input.random); const answer = left === right ? '=' : left > right ? '>' : '<';
  return makeQuestion(input, 'negativeNumber', `${left} ℃ □ ${right} ℃`, answer, [Math.abs(left), Math.abs(right), left < 0 ? 0 : 1, right < 0 ? 0 : 1], { layout: 'wide', metadata: { left, right } });
}
export const validateNegativeNumber: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'negativeNumber', config, definition, 4); if (stageBefore(config, 'grade6')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [leftMagnitude, rightMagnitude, leftSign, rightSign] = question.operands; const left = leftSign === 0 ? -leftMagnitude : leftMagnitude; const right = rightSign === 0 ? -rightMagnitude : rightMagnitude; const expected = solveNegativeNumber(question);
  if (![leftMagnitude, rightMagnitude, leftSign, rightSign].every(Number.isInteger) || leftMagnitude < 0 || rightMagnitude < 0 || ![0, 1].includes(leftSign) || ![0, 1].includes(rightSign) || question.answer !== expected) errors.push('负数比较边界或答案错误');
  if (expected) errors.push(...structureErrors(question, 'negativeNumber', `${left} ℃ □ ${right} ℃`, expected, [leftMagnitude, rightMagnitude, leftSign, rightSign], 'wide', { left, right })); return finish(errors);
};

const MONTH_DAYS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
export function solveCalendarWeekday(question: Question): string | undefined { if (!integerOperands(question, 2)) return undefined; const [month, day] = question.operands; if (month < 1 || month > 12 || day < 1 || day > MONTH_DAYS[month - 1]) return undefined; const offset = MONTH_DAYS.slice(0, month - 1).reduce((sum, value) => sum + value, 0) + day - 1; return `星期${WEEKDAYS[offset % 7]}`; }
export function generateCalendarWeekday(input: QuestionGenerationInput): Question {
  const maxMonth = rank(input.config) < 2 ? 6 : rank(input.config) < 4 ? 9 : 12; const month = randomInt(1, maxMonth, input.random); const day = randomInt(1, MONTH_DAYS[month - 1], input.random); const answer = solveCalendarWeekday({ operands: [month, day] } as Question)!;
  return makeQuestion(input, 'calendarWeekday', `2024年${month}月${day}日是星期几？`, answer, [month, day], { layout: 'wide', metadata: { month, day, weekday: WEEKDAYS.indexOf(answer.slice(2)) }, content: { kind: 'table', headers: ['日期', '星期'], rows: [[`2024-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, '□']] } });
}
export const validateCalendarWeekday: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'calendarWeekday', config, definition, 2); if (stageBefore(config, 'grade1')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [month, day] = question.operands; const expected = solveCalendarWeekday(question); const weekday = expected ? WEEKDAYS.indexOf(expected.slice(2)) : -1;
  if (!Number.isInteger(month) || !Number.isInteger(day) || !expected || question.answer !== expected) errors.push('日期边界或答案错误'); if (question.metadata?.month !== month || question.metadata?.day !== day || question.metadata?.weekday !== weekday) errors.push('日期元数据错误');
  if (expected) errors.push(...structureErrors(question, 'calendarWeekday', `2024年${month}月${day}日是星期几？`, expected, [month, day], 'wide', { month, day, weekday }, { kind: 'table', headers: ['日期', '星期'], rows: [[`2024-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`, '□']] })); return finish(errors);
};

export function solveFractionVisual(question: Question): string | undefined { if (!integerOperands(question, 2) || question.operands[0] <= 0 || question.operands[1] <= 1 || question.operands[0] >= question.operands[1]) return undefined; return new Fraction(question.operands[0], question.operands[1]).toFractionString(); }
export function generateFractionVisual(input: QuestionGenerationInput): Question {
  const denominator = randomInt(2, rank(input.config) < 2 ? 6 : 12, input.random); const numerator = randomInt(1, denominator - 1, input.random); const answer = new Fraction(numerator, denominator).toFractionString();
  return makeQuestion(input, 'fractionVisual', '图中涂色部分表示几分之几？', answer, [numerator, denominator], { layout: 'wide', content: { kind: 'fractionVisual', numerator, denominator, shaded: numerator }, answerDetails: { display: answer, steps: [`${numerator}个部分 ÷ ${denominator}个等份 = ${answer}`] } });
}
export const validateFractionVisual: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'fractionVisual', config, definition, 2); if (stageBefore(config, 'grade3')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [numerator, denominator] = question.operands; const expected = solveFractionVisual(question); if (!expected || question.answer !== expected) errors.push('分数图示或答案错误');
  if (expected) errors.push(...structureErrors(question, 'fractionVisual', '图中涂色部分表示几分之几？', expected, [numerator, denominator], 'wide', undefined, { kind: 'fractionVisual', numerator, denominator, shaded: numerator }, [`${numerator}个部分 ÷ ${denominator}个等份 = ${expected}`])); return finish(errors);
};

export function solvePrimeComposite(question: Question): '质数' | '合数' | undefined { return integerOperands(question, 1) && question.operands[0] >= 2 ? isPrime(question.operands[0]) ? '质数' : '合数' : undefined; }
export function generatePrimeComposite(input: QuestionGenerationInput): Question { const value = randomInt(2, rank(input.config) < 2 ? 30 : 97, input.random); const answer = isPrime(value) ? '质数' : '合数'; return makeQuestion(input, 'primeComposite', `${value}是质数还是合数？`, answer, [value], { layout: 'wide', metadata: { classification: answer } }); }
export const validatePrimeComposite: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'primeComposite', config, definition, 1); if (stageBefore(config, 'grade5')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const value = question.operands[0]; const expected = solvePrimeComposite(question); if (!Number.isInteger(value) || value < 2 || value > (rank(config) < 2 ? 30 : 97) || question.answer !== expected) errors.push('质合数边界或答案错误'); if (expected) errors.push(...structureErrors(question, 'primeComposite', `${value}是质数还是合数？`, expected, [value], 'wide', { classification: expected })); return finish(errors);
};

export function solveCommonFactorsMultiples(question: Question): number | undefined { if (!integerOperands(question, 3) || question.operands[0] < 2 || question.operands[1] < 2 || ![0, 1].includes(question.operands[2])) return undefined; const [left, right, mode] = question.operands; return mode === 0 ? gcd(left, right) : left * right / gcd(left, right); }
export function generateCommonFactorsMultiples(input: QuestionGenerationInput): Question { const cap = rank(input.config) < 2 ? 10 : 30; const left = randomInt(2, cap, input.random); const right = randomInt(2, cap, input.random); const mode = input.random() < .5 ? 0 : 1; const answer = mode === 0 ? gcd(left, right) : left * right / gcd(left, right); return makeQuestion(input, 'commonFactorsMultiples', `${left}和${right}的${mode === 0 ? '最大公因数' : '最小公倍数'}是？`, answer, [left, right, mode], { layout: 'wide', metadata: { mode: mode === 0 ? 'gcd' : 'lcm' } }); }
export const validateCommonFactorsMultiples: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'commonFactorsMultiples', config, definition, 3); if (stageBefore(config, 'grade5')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [left, right, mode] = question.operands; const expected = solveCommonFactorsMultiples(question); const modeLabel = mode === 0 ? 'gcd' : mode === 1 ? 'lcm' : ''; if (!expected || question.answer !== expected) errors.push('公因数公倍数边界或答案错误'); if (expected) errors.push(...structureErrors(question, 'commonFactorsMultiples', `${left}和${right}的${mode === 0 ? '最大公因数' : '最小公倍数'}是？`, String(expected), [left, right, mode], 'wide', { mode: modeLabel })); return finish(errors);
};

export const ADVANCED_CONCEPT_DIFFICULTY_PROFILES = {
  largeNumberPlaceValue: profile(100_000_000), operationLaw: profile(100_000), decimalComparison: profile(10_000), factorsMultiples: profile(10_000), ratio: profile(10_000), negativeNumber: profile(10_000), calendarWeekday: profile(31), fractionVisual: profile(12), primeComposite: profile(100), commonFactorsMultiples: profile(100)
} as const;
