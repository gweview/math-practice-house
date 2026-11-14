import { DEFAULT_PI } from '../../domain/math-core/constants';
import { Fraction } from '../../domain/math-core/fraction';
import type { Grade } from '../../domain/curriculum/types';
import { isValidCubeNetPattern } from '../../domain/geometry/cube-net';
import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import type { Question, QuestionContent } from '../../domain/questions/model';
import type { WorksheetConfig } from '../../domain/worksheet/config';
import type { RandomSource } from '../../shared/random/seeded-random';

type AdvancedGeometryType = 'polygonArea' | 'cuboidVolume' | 'compositeArea' | 'cuboidNet' | 'surfaceArea' | 'circle' | 'scale' | 'sector' | 'cylinder';
const DIFFICULTIES: QuestionDefinition['difficulties'] = ['entry', 'easy', 'standard', 'advanced', 'challenge'];
const STAGES: readonly Grade[] = ['preschool', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'];
const CURRICULUM_MAXIMUMS: Readonly<Record<Grade, number>> = { preschool: 10, grade1: 20, grade2: 100, grade3: 1000, grade4: 100_000_000, grade5: 100_000_000, grade6: 100_000_000 };
const NET_PATTERNS = ['cross', 'strip', 'twin', 'zigzag'] as const;

function rank(config: WorksheetConfig): number { return Math.max(0, DIFFICULTIES.indexOf(config.difficulty)); }
function randomInt(min: number, max: number, random: RandomSource): number {
  const lower = Math.ceil(Math.min(min, max)); const upper = Math.floor(Math.max(min, max));
  return Math.floor(random() * (upper - lower + 1)) + lower;
}
function pick<T>(items: readonly T[], random: RandomSource): T { return items[randomInt(0, items.length - 1, random)]; }
function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((item, index) => same(item, right[index]));
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left as object); const rightKeys = Object.keys(right as object);
  return leftKeys.length === rightKeys.length && leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key) && same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}
function makeQuestion(input: QuestionGenerationInput, type: AdvancedGeometryType, text: string, answer: string, operands: number[], options: Partial<Pick<Question, 'layout' | 'metadata' | 'content' | 'answerDetails'>> = {}): Question {
  const display = options.answerDetails?.display ?? answer;
  const signatureData = options.metadata?.signatureData ?? `${text}|${display}|${operands.join(',')}`;
  return { id: input.createId(), type, text, answer, operands, signature: `${type}:${String(signatureData)}`, layout: options.layout ?? 'inline', metadata: options.metadata, content: options.content, answerDetails: { display, ...options.answerDetails } };
}
function profiles(max: number): QuestionDefinition['difficultyProfiles'] {
  return Object.fromEntries(DIFFICULTIES.map((difficulty, index) => [difficulty, { max, terms: index < 4 ? 3 : 4, carryRate: index / 4, highRangeRate: index / 4, wordSteps: index < 3 ? 1 : 2, maxFactor: 12, trivialRate: .1, equalityRate: .2, mixedRate: index / 4 }])) as QuestionDefinition['difficultyProfiles'];
}
function integerOperands(question: Question, count: number): question is Question & { operands: number[] } {
  return Array.isArray(question?.operands) && question.operands.length === count && question.operands.every(value => Number.isInteger(value) && Number.isFinite(value));
}
function structureErrors(question: Question, type: AdvancedGeometryType, text: string, display: string, operands: number[], layout: Question['layout'], metadata?: Record<string, string | number | boolean>, content?: QuestionContent, steps?: string[]): string[] {
  const errors: string[] = [];
  const allowedKeys = new Set(['id', 'type', 'text', 'answer', 'operands', 'operators', 'signature', 'layout', 'metadata', 'content', 'answerDetails']);
  if (Object.keys(question).some(key => !allowedKeys.has(key))) errors.push('题目结构包含意外字段');
  if (question.text !== text) errors.push('题面格式错误');
  if (question.layout !== layout) errors.push('题目布局错误');
  if (question.signature !== `${type}:${text}|${display}|${operands.join(',')}`) errors.push('题目签名错误');
  if (!same(question.metadata, metadata)) errors.push('题目元数据结构错误');
  if (!same(question.content, content)) errors.push('题目内容结构错误');
  if (!same(question.answerDetails, { display, ...(steps ? { unit: metadata?.unit, steps } : {}) })) errors.push('答案详情结构错误');
  if (question.operators !== undefined) errors.push('题目运算符结构错误');
  return errors;
}
function common(question: Question, type: AdvancedGeometryType, config: WorksheetConfig, definition: QuestionDefinition | undefined, count: number): string[] {
  const errors: string[] = [];
  if (!question || question.type !== type) return [`校验器题型不匹配：${type}`, `实际题型：${String(question?.type)}`];
  const operands = Array.isArray(question.operands) ? question.operands : [];
  if (operands.length !== count || operands.some(value => !Number.isFinite(value) || !Number.isInteger(value))) errors.push('操作数结构无效');
  if (definition && !definition.allowedGrades.includes(config.stage)) errors.push('题型不适用于当前学习阶段');
  if (!config.types.includes(type)) errors.push('题型不在配置中');
  const maximum = definition?.difficultyProfiles[config.difficulty]?.max;
  if (Number.isFinite(maximum) && operands.some(value => Math.abs(value) > Number(maximum))) errors.push('题目超过该题型难度上限');
  if (config.rangeMode === 'curriculum' && operands.some(value => Math.abs(value) > CURRICULUM_MAXIMUMS[config.stage])) errors.push('题目超过当前学习阶段范围');
  return errors;
}
function finish(errors: string[]): QuestionValidationResult { return { valid: errors.length === 0, errors }; }
function stageBefore(config: WorksheetConfig, minimum: Grade): boolean { return STAGES.indexOf(config.stage) < STAGES.indexOf(minimum); }

export function solvePolygonArea(question: Question): string | undefined {
  if (!integerOperands(question, question.metadata?.shape === 'trapezoid' ? 3 : 2)) return undefined;
  const [a, b, height] = question.operands;
  if (a <= 0 || b <= 0 || (height ?? b) <= 0) return undefined;
  return new Fraction(question.metadata?.shape === 'trapezoid' ? (a + b) * height : a * b, 2).toFractionString();
}
export function generatePolygonArea(input: QuestionGenerationInput): Question {
  const trapezoid = input.random() < .45; const height = randomInt(2, 20, input.random);
  if (trapezoid) {
    const top = randomInt(2, 15, input.random); const bottom = randomInt(top + 1, 25, input.random); const value = new Fraction((top + bottom) * height, 2).toFractionString();
    return makeQuestion(input, 'polygonArea', `梯形上底 ${top} 厘米、下底 ${bottom} 厘米、高 ${height} 厘米，面积是多少？`, `${value} 平方厘米`, [top, bottom, height], { layout: 'wide', metadata: { shape: 'trapezoid', unit: '平方厘米' }, content: { kind: 'geometry', shape: 'trapezoid', dimensions: [top, bottom, height], labels: [`上底 ${top}`, `下底 ${bottom}`, `高 ${height}`] }, answerDetails: { display: `${value} 平方厘米`, unit: '平方厘米', steps: [`(${top} + ${bottom}) × ${height} ÷ 2 = ${value}（平方厘米）`] } });
  }
  const base = randomInt(2, 30, input.random); const value = new Fraction(base * height, 2).toFractionString();
  return makeQuestion(input, 'polygonArea', `三角形底 ${base} 厘米、高 ${height} 厘米，面积是多少？`, `${value} 平方厘米`, [base, height], { layout: 'wide', metadata: { shape: 'triangle', unit: '平方厘米' }, content: { kind: 'geometry', shape: 'triangle', dimensions: [base, height], labels: [`底 ${base}`, `高 ${height}`] }, answerDetails: { display: `${value} 平方厘米`, unit: '平方厘米', steps: [`${base} × ${height} ÷ 2 = ${value}（平方厘米）`] } });
}
export const validatePolygonArea: QuestionValidator = (question, config, definition) => {
  const shape = question?.metadata?.shape; const count = shape === 'trapezoid' ? 3 : 2; const errors = common(question, 'polygonArea', config, definition, count);
  if (stageBefore(config, 'grade5')) errors.push('题型不符合年级要求');
  if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [a, b, height] = question.operands; const validShape = shape === 'triangle' || shape === 'trapezoid'; const value = solvePolygonArea(question);
  if (!validShape || !value || a <= 0 || b <= 0 || (height ?? b) <= 0 || (shape === 'trapezoid' && (b <= a || a > 15 || b > 25 || height > 20)) || (shape === 'triangle' && (a > 30 || b > 20)) || question.answer !== `${value} 平方厘米`) errors.push('多边形面积边界或答案错误');
  if (value && validShape) {
    const display = `${value} 平方厘米`; const text = shape === 'trapezoid' ? `梯形上底 ${a} 厘米、下底 ${b} 厘米、高 ${height} 厘米，面积是多少？` : `三角形底 ${a} 厘米、高 ${b} 厘米，面积是多少？`;
    const content = shape === 'trapezoid' ? { kind: 'geometry' as const, shape: 'trapezoid' as const, dimensions: [a, b, height], labels: [`上底 ${a}`, `下底 ${b}`, `高 ${height}`] } : { kind: 'geometry' as const, shape: 'triangle' as const, dimensions: [a, b], labels: [`底 ${a}`, `高 ${b}`] };
    const steps = shape === 'trapezoid' ? [`(${a} + ${b}) × ${height} ÷ 2 = ${value}（平方厘米）`] : [`${a} × ${b} ÷ 2 = ${value}（平方厘米）`];
    errors.push(...structureErrors(question, 'polygonArea', text, display, question.operands, 'wide', { shape, unit: '平方厘米' }, content, steps));
  }
  return finish(errors);
};

export function solveCuboidVolume(question: Question): string | undefined { return integerOperands(question, 3) && question.operands.every(value => value > 0) ? `${question.operands[0] * question.operands[1] * question.operands[2]} 立方厘米` : undefined; }
export function generateCuboidVolume(input: QuestionGenerationInput): Question {
  const length = randomInt(2, 15, input.random); const width = randomInt(2, 12, input.random); const height = randomInt(2, 10, input.random); const value = `${length * width * height} 立方厘米`;
  return makeQuestion(input, 'cuboidVolume', `长方体长 ${length} 厘米、宽 ${width} 厘米、高 ${height} 厘米，体积是多少？`, value, [length, width, height], { layout: 'wide', metadata: { unit: '立方厘米' }, content: { kind: 'geometry', shape: 'cuboid', dimensions: [length, width, height], labels: [`${length}`, `${width}`, `${height}`] }, answerDetails: { display: value, unit: '立方厘米', steps: [`${length} × ${width} × ${height} = ${length * width * height}（立方厘米）`] } });
}
export const validateCuboidVolume: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'cuboidVolume', config, definition, 3); if (stageBefore(config, 'grade5')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [length, width, height] = question.operands; const value = solveCuboidVolume(question); const display = value ?? `${length * width * height} 立方厘米`; if (!value || length < 2 || length > 15 || width < 2 || width > 12 || height < 2 || height > 10 || question.answer !== value) errors.push('长方体体积边界或答案错误');
  const numeric = length * width * height; errors.push(...structureErrors(question, 'cuboidVolume', `长方体长 ${length} 厘米、宽 ${width} 厘米、高 ${height} 厘米，体积是多少？`, display, question.operands, 'wide', { unit: '立方厘米' }, { kind: 'geometry', shape: 'cuboid', dimensions: [length, width, height], labels: [`${length}`, `${width}`, `${height}`] }, [`${length} × ${width} × ${height} = ${numeric}（立方厘米）`])); return finish(errors);
};

export function solveCompositeArea(question: Question): string | undefined { return integerOperands(question, 4) && question.operands.every(value => value > 0) ? `${question.operands[0] * question.operands[1] - question.operands[2] * question.operands[3]} 平方厘米` : undefined; }
export function generateCompositeArea(input: QuestionGenerationInput): Question {
  const length = randomInt(8, 24, input.random); const width = randomInt(6, 16, input.random); const cutLength = randomInt(2, length - 2, input.random); const cutWidth = randomInt(1, width - 2, input.random); const numeric = length * width - cutLength * cutWidth; const display = `${numeric} 平方厘米`;
  return makeQuestion(input, 'compositeArea', `一个长${length}厘米、宽${width}厘米的长方形，剪去一个${cutLength}×${cutWidth}厘米的小长方形，剩余面积是多少？`, display, [length, width, cutLength, cutWidth], { layout: 'wide', metadata: { unit: '平方厘米' }, content: { kind: 'geometry', shape: 'composite', dimensions: [length, width, cutLength, cutWidth] }, answerDetails: { display, unit: '平方厘米', steps: [`${length}×${width}-${cutLength}×${cutWidth}=${numeric}（平方厘米）`] } });
}
export const validateCompositeArea: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'compositeArea', config, definition, 4); if (stageBefore(config, 'grade5')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [length, width, cutLength, cutWidth] = question.operands; const value = solveCompositeArea(question); const numeric = length * width - cutLength * cutWidth; const display = `${numeric} 平方厘米`;
  if (!value || length < 8 || length > 24 || width < 6 || width > 16 || cutLength < 2 || cutLength > length - 2 || cutWidth < 1 || cutWidth > width - 2 || numeric <= 0 || question.answer !== value) errors.push('组合面积边界或答案错误');
  errors.push(...structureErrors(question, 'compositeArea', `一个长${length}厘米、宽${width}厘米的长方形，剪去一个${cutLength}×${cutWidth}厘米的小长方形，剩余面积是多少？`, display, question.operands, 'wide', { unit: '平方厘米' }, { kind: 'geometry', shape: 'composite', dimensions: [length, width, cutLength, cutWidth] }, [`${length}×${width}-${cutLength}×${cutWidth}=${numeric}（平方厘米）`])); return finish(errors);
};

export function solveCuboidNet(question: Question): '能' | '不能' | undefined { return integerOperands(question, 4) && [0, 1].includes(question.operands[0]) && typeof question.metadata?.pattern === 'string' ? (isValidCubeNetPattern(question.metadata.pattern) ? '能' : '不能') : undefined; }
export function generateCuboidNet(input: QuestionGenerationInput): Question {
  const pattern = pick(NET_PATTERNS, input.random); const valid = isValidCubeNetPattern(pattern); const cap = 4 + Math.min(5, rank(input.config)); const length = randomInt(2, cap, input.random); const width = randomInt(2, cap, input.random); const height = randomInt(2, cap, input.random); const answer = valid ? '能' : '不能';
  return makeQuestion(input, 'cuboidNet', '观察这个展开图，它能折成正方体吗？', answer, [valid ? 1 : 0, length, width, height], { layout: 'wide', metadata: { pattern }, content: { kind: 'geometry', shape: 'net', dimensions: [length, width, height], netPattern: pattern } });
}
export const validateCuboidNet: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'cuboidNet', config, definition, 4); if (stageBefore(config, 'grade5')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [validFlag, length, width, height] = question.operands; const pattern = question.metadata?.pattern; const value = solveCuboidNet(question); const cap = 4 + Math.min(5, rank(config)); if (!NET_PATTERNS.includes(pattern as typeof NET_PATTERNS[number]) || !value || validFlag !== (value === '能' ? 1 : 0) || [length, width, height].some(item => item < 2 || item > cap) || question.answer !== value) errors.push('展开图边界或答案错误');
  const content = { kind: 'geometry' as const, shape: 'net' as const, dimensions: [length, width, height], netPattern: pattern as string }; errors.push(...structureErrors(question, 'cuboidNet', '观察这个展开图，它能折成正方体吗？', value ?? String(question.answer), question.operands, 'wide', { pattern: pattern as string }, content)); return finish(errors);
};

export function solveSurfaceArea(question: Question): string | undefined { return integerOperands(question, 3) && question.operands.every(value => value > 0) ? `${2 * (question.operands[0] * question.operands[1] + question.operands[0] * question.operands[2] + question.operands[1] * question.operands[2])} 平方厘米` : undefined; }
export function generateSurfaceArea(input: QuestionGenerationInput): Question {
  const cube = input.random() < .35; const cap = 5 + Math.min(10, rank(input.config) * 2); const length = randomInt(2, cap, input.random); const width = cube ? length : randomInt(2, cap, input.random); const height = cube ? length : randomInt(2, cap, input.random); const numeric = 2 * (length * width + length * height + width * height); const display = `${numeric} 平方厘米`;
  return makeQuestion(input, 'surfaceArea', `${cube ? '正方体棱长' : '长方体长、宽、高'} ${cube ? `${length}厘米` : `${length}、${width}、${height}厘米`}，表面积是多少？`, display, [length, width, height], { layout: 'wide', metadata: { cube, unit: '平方厘米' }, content: { kind: 'geometry', shape: 'cuboid', dimensions: [length, width, height] }, answerDetails: { display, unit: '平方厘米', steps: [`2×(${length}×${width}+${length}×${height}+${width}×${height})=${numeric}（平方厘米）`] } });
}
export const validateSurfaceArea: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'surfaceArea', config, definition, 3); if (stageBefore(config, 'grade5')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [length, width, height] = question.operands; const cube = question.metadata?.cube; const value = solveSurfaceArea(question); const numeric = 2 * (length * width + length * height + width * height); const display = `${numeric} 平方厘米`; const cap = 5 + Math.min(10, rank(config) * 2); if (typeof cube !== 'boolean' || !value || (cube && (length !== width || width !== height)) || [length, width, height].some(item => item < 2 || item > cap) || question.answer !== value) errors.push('表面积边界或答案错误');
  const cubeValue = typeof cube === 'boolean' ? cube : false;
  errors.push(...structureErrors(question, 'surfaceArea', `${cubeValue ? '正方体棱长' : '长方体长、宽、高'} ${cubeValue ? `${length}厘米` : `${length}、${width}、${height}厘米`}，表面积是多少？`, display, question.operands, 'wide', { cube: cubeValue, unit: '平方厘米' }, { kind: 'geometry', shape: 'cuboid', dimensions: [length, width, height] }, [`2×(${length}×${width}+${length}×${height}+${width}×${height})=${numeric}（平方厘米）`])); return finish(errors);
};

export function solveCircle(question: Question): string | undefined { return integerOperands(question, 2) && question.operands[0] > 0 && [0, 1].includes(question.operands[1]) ? `${DEFAULT_PI.multiply(question.operands[1] === 1 ? question.operands[0] * question.operands[0] : 2 * question.operands[0]).toString()} ${question.operands[1] === 1 ? '平方厘米' : '厘米'}` : undefined; }
export function generateCircle(input: QuestionGenerationInput): Question {
  const radius = randomInt(2, 20, input.random); const askArea = input.random() < .5; const numeric = DEFAULT_PI.multiply(askArea ? radius * radius : 2 * radius); const unit = askArea ? '平方厘米' : '厘米'; const display = `${numeric.toString()} ${unit}`;
  return makeQuestion(input, 'circle', `圆的半径是 ${radius} 厘米，求它的${askArea ? '面积' : '周长'}。（π 取 ${DEFAULT_PI.toString()}）`, display, [radius, askArea ? 1 : 0], { layout: 'wide', metadata: { askArea, pi: DEFAULT_PI.toString(), unit }, content: { kind: 'geometry', shape: 'circle', dimensions: [radius], labels: [`r = ${radius} cm`] }, answerDetails: { display, unit, steps: [askArea ? `${DEFAULT_PI.toString()} × ${radius}² = ${numeric.toString()}（平方厘米）` : `2 × ${DEFAULT_PI.toString()} × ${radius} = ${numeric.toString()}（厘米）`] } });
}
export const validateCircle: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'circle', config, definition, 2); if (stageBefore(config, 'grade6')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [radius, areaFlag] = question.operands; const askArea = question.metadata?.askArea; const value = solveCircle(question); const unit = areaFlag === 1 ? '平方厘米' : '厘米'; const numeric = DEFAULT_PI.multiply(areaFlag === 1 ? radius * radius : 2 * radius).toString(); const display = `${numeric} ${unit}`; if (radius < 2 || radius > 20 || ![0, 1].includes(areaFlag) || typeof askArea !== 'boolean' || askArea !== (areaFlag === 1) || question.metadata?.pi !== DEFAULT_PI.toString() || question.answer !== value) errors.push('圆周长面积边界或答案错误');
  const askAreaValue = typeof askArea === 'boolean' ? askArea : false;
  const text = `圆的半径是 ${radius} 厘米，求它的${areaFlag === 1 ? '面积' : '周长'}。（π 取 ${DEFAULT_PI.toString()}）`; const steps = [areaFlag === 1 ? `${DEFAULT_PI.toString()} × ${radius}² = ${numeric}（平方厘米）` : `2 × ${DEFAULT_PI.toString()} × ${radius} = ${numeric}（厘米）`]; errors.push(...structureErrors(question, 'circle', text, display, question.operands, 'wide', { askArea: askAreaValue, pi: DEFAULT_PI.toString(), unit }, { kind: 'geometry', shape: 'circle', dimensions: [radius], labels: [`r = ${radius} cm`] }, steps)); return finish(errors);
};

export function solveScale(question: Question): string | undefined { return integerOperands(question, 2) && question.operands.every(value => value > 0) ? `${new Fraction(question.operands[0] * question.operands[1], 100_000).toFractionString()} 千米` : undefined; }
export function generateScale(input: QuestionGenerationInput): Question {
  const denominator = pick([100_000, 200_000, 500_000], input.random); const mapCentimeters = randomInt(1, 15, input.random); const value = new Fraction(mapCentimeters * denominator, 100_000).toFractionString(); const display = `${value} 千米`;
  return makeQuestion(input, 'scale', `一幅地图的比例尺是 1:${denominator.toLocaleString('zh-CN')}，图上距离 ${mapCentimeters} 厘米，实际距离是多少千米？`, display, [denominator, mapCentimeters], { layout: 'word', metadata: { unit: '千米' }, answerDetails: { display, unit: '千米', steps: [`${mapCentimeters} × ${denominator} ÷ 100000 = ${value}（千米）`] } });
}
export const validateScale: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'scale', config, definition, 2); if (stageBefore(config, 'grade6')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [denominator, distance] = question.operands; const value = solveScale(question); const expected = new Fraction(denominator * distance, 100_000).toFractionString(); const display = `${expected} 千米`; if (![100_000, 200_000, 500_000].includes(denominator) || distance < 1 || distance > 15 || question.answer !== value) errors.push('比例尺边界或答案错误');
  errors.push(...structureErrors(question, 'scale', `一幅地图的比例尺是 1:${denominator.toLocaleString('zh-CN')}，图上距离 ${distance} 厘米，实际距离是多少千米？`, display, question.operands, 'word', { unit: '千米' }, undefined, [`${distance} × ${denominator} ÷ 100000 = ${expected}（千米）`])); return finish(errors);
};

export function solveSector(question: Question): string | undefined { return integerOperands(question, 2) && question.operands[0] > 0 && question.operands[1] > 0 && question.operands[1] <= 360 ? `${DEFAULT_PI.multiply(question.operands[0] * question.operands[0] * question.operands[1]).divide(360, 2).toString()} 平方厘米` : undefined; }
export function generateSector(input: QuestionGenerationInput): Question {
  const radius = randomInt(2, 5 + rank(input.config) * 2, input.random); const angle = pick([60, 90, 120, 180, 270], input.random); const numeric = DEFAULT_PI.multiply(radius * radius * angle).divide(360, 2); const display = `${numeric.toString()} 平方厘米`;
  return makeQuestion(input, 'sector', `扇形半径${radius}厘米、圆心角${angle}°，面积是多少？（π取${DEFAULT_PI}，结果保留两位小数）`, display, [radius, angle], { layout: 'wide', metadata: { radius, angle, pi: DEFAULT_PI.toString(), unit: '平方厘米' }, content: { kind: 'geometry', shape: 'sector', dimensions: [radius, angle] }, answerDetails: { display, unit: '平方厘米', steps: [`${DEFAULT_PI}×${radius}²×${angle}÷360=${numeric.toString()}（平方厘米）`] } });
}
export const validateSector: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'sector', config, definition, 2); if (stageBefore(config, 'grade6')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [radius, angle] = question.operands; const value = solveSector(question); const numeric = DEFAULT_PI.multiply(radius * radius * angle).divide(360, 2).toString(); const display = `${numeric} 平方厘米`; const radiusCap = 5 + rank(config) * 2; if (radius < 2 || radius > radiusCap || ![60, 90, 120, 180, 270].includes(angle) || question.metadata?.pi !== DEFAULT_PI.toString() || question.answer !== value) errors.push('扇形边界或答案错误');
  const text = `扇形半径${radius}厘米、圆心角${angle}°，面积是多少？（π取${DEFAULT_PI}，结果保留两位小数）`; errors.push(...structureErrors(question, 'sector', text, display, question.operands, 'wide', { radius, angle, pi: DEFAULT_PI.toString(), unit: '平方厘米' }, { kind: 'geometry', shape: 'sector', dimensions: [radius, angle] }, [`${DEFAULT_PI}×${radius}²×${angle}÷360=${numeric}（平方厘米）`])); return finish(errors);
};

export function solveCylinder(question: Question): string | undefined { return integerOperands(question, 2) && question.operands.every(value => value > 0) ? `${DEFAULT_PI.multiply(question.operands[0] * question.operands[0] * question.operands[1]).toString()} 立方厘米` : undefined; }
export function generateCylinder(input: QuestionGenerationInput): Question {
  const radius = randomInt(2, 4 + rank(input.config), input.random); const height = randomInt(3, 8 + rank(input.config) * 2, input.random); const numeric = DEFAULT_PI.multiply(radius * radius * height); const display = `${numeric.toString()} 立方厘米`;
  return makeQuestion(input, 'cylinder', `圆柱底面半径${radius}厘米、高${height}厘米，体积是多少？（π取${DEFAULT_PI}）`, display, [radius, height], { layout: 'wide', metadata: { radius, height, pi: DEFAULT_PI.toString(), unit: '立方厘米' }, content: { kind: 'geometry', shape: 'cylinder', dimensions: [radius, height] }, answerDetails: { display, unit: '立方厘米', steps: [`${DEFAULT_PI}×${radius}²×${height}=${numeric.toString()}（立方厘米）`] } });
}
export const validateCylinder: QuestionValidator = (question, config, definition) => {
  const errors = common(question, 'cylinder', config, definition, 2); if (stageBefore(config, 'grade6')) errors.push('题型不符合年级要求'); if (errors.some(error => error === '操作数结构无效')) return finish(errors);
  const [radius, height] = question.operands; const value = solveCylinder(question); const numeric = DEFAULT_PI.multiply(radius * radius * height).toString(); const display = `${numeric} 立方厘米`; const radiusCap = 4 + rank(config); const heightCap = 8 + rank(config) * 2; if (radius < 2 || radius > radiusCap || height < 3 || height > heightCap || question.metadata?.pi !== DEFAULT_PI.toString() || question.answer !== value) errors.push('圆柱体积边界或答案错误');
  const text = `圆柱底面半径${radius}厘米、高${height}厘米，体积是多少？（π取${DEFAULT_PI}）`; errors.push(...structureErrors(question, 'cylinder', text, display, question.operands, 'wide', { radius, height, pi: DEFAULT_PI.toString(), unit: '立方厘米' }, { kind: 'geometry', shape: 'cylinder', dimensions: [radius, height] }, [`${DEFAULT_PI}×${radius}²×${height}=${numeric}（立方厘米）`])); return finish(errors);
};

type DirectGeometryInput = Omit<QuestionDefinition, 'description' | 'skills' | 'difficulties' | 'footprint'> & { footprint?: QuestionDefinition['footprint'] };
export function advancedGeometryQuestion(input: DirectGeometryInput): QuestionDefinition {
  return { ...input, description: `在${input.label}情境中建立图形、空间和测量单位之间的联系。`, skills: [input.label, '空间观念', '测量推理'], difficulties: DIFFICULTIES, footprint: input.footprint ?? { columns: 'full', heightMm: { standard: 38, large: 43 }, preventBreakInside: true } };
}

export const ADVANCED_GEOMETRY_TYPES: readonly AdvancedGeometryType[] = ['polygonArea', 'cuboidVolume', 'compositeArea', 'cuboidNet', 'surfaceArea', 'circle', 'scale', 'sector', 'cylinder'];
export const ADVANCED_GEOMETRY_PROFILES = { polygonArea: profiles(10_000), cuboidVolume: profiles(10_000), compositeArea: profiles(10_000), cuboidNet: profiles(1_000), surfaceArea: profiles(10_000), circle: profiles(10_000), scale: profiles(1_000_000), sector: profiles(360), cylinder: profiles(100_000) } as const;
