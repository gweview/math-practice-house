import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import { CURRICULUM_MAXIMUMS } from '../../domain/questions/difficulty';
import type { Question, QuestionContent } from '../../domain/questions/model';
import type { Grade } from '../../domain/curriculum/types';
import type { WorksheetConfig } from '../../domain/worksheet/config';

type DataType = 'dataTableReading' | 'barChartReading' | 'average' | 'lineChartReading' | 'probability' | 'chartAnalysis' | 'quantityEstimate' | 'pictureClassification' | 'pieChartReading' | 'multiChartAnalysis';
const DIFFICULTIES = ['entry', 'easy', 'standard', 'advanced', 'challenge'] as const;
const STAGES: readonly Grade[] = ['preschool', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'];
const MAXIMUMS: Readonly<Record<DataType, number>> = {
  dataTableReading: 1000, barChartReading: 1000, average: 10_000, lineChartReading: 10_000,
  probability: 100, chartAnalysis: 10_000, quantityEstimate: 100, pictureClassification: 20,
  pieChartReading: 10_000, multiChartAnalysis: 10_000
};

function difficultyRank(config: WorksheetConfig): number { return Math.max(0, DIFFICULTIES.indexOf(config.difficulty)); }
function randomInt(min: number, max: number, random: QuestionGenerationInput['random']): number {
  const lower = Math.ceil(Math.min(min, max));
  const upper = Math.floor(Math.max(min, max));
  return Math.floor(random() * (upper - lower + 1)) + lower;
}
function pick<T>(values: readonly T[], random: QuestionGenerationInput['random']): T { return values[randomInt(0, values.length - 1, random)]; }
function capFor(input: QuestionGenerationInput, type: DataType): number {
  const curriculum = input.config.rangeMode === 'curriculum' ? CURRICULUM_MAXIMUMS[input.config.stage] : MAXIMUMS[type];
  return Math.max(1, Math.min(input.profile.max, curriculum, MAXIMUMS[type]));
}
function makeQuestion(input: QuestionGenerationInput, type: DataType, text: string, answer: number | string, operands: number[], options: Partial<Pick<Question, 'layout' | 'metadata' | 'content' | 'answerDetails'>> = {}): Question {
  const display = options.answerDetails?.display ?? String(answer);
  return {
    id: input.createId(), type, text, answer, operands,
    signature: `${type}:${text}|${display}|${operands.join(',')}`,
    layout: options.layout ?? 'wide', metadata: options.metadata, content: options.content,
    answerDetails: { display, ...options.answerDetails }
  };
}
function profile(max: number, minimumMax?: number): QuestionDefinition['difficultyProfiles'] {
  return Object.fromEntries(DIFFICULTIES.map((difficulty, index) => [difficulty, {
    max, minimumMax, terms: index < 3 ? 3 : 4, carryRate: index / 4, highRangeRate: index / 5,
    wordSteps: 1, maxFactor: 9, trivialRate: .1, equalityRate: .2, mixedRate: index / 4
  }])) as QuestionDefinition['difficultyProfiles'];
}
function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => same(value, right[index]));
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left as object); const rightKeys = Object.keys(right as object);
  return leftKeys.length === rightKeys.length && leftKeys.every(key => Object.prototype.hasOwnProperty.call(right, key) && same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}
function common(question: Question, type: DataType, config: WorksheetConfig, definition: QuestionDefinition | undefined, count: number): string[] {
  const errors: string[] = [];
  if (!question || question.type !== type) return [`校验器题型不匹配：${type}`];
  if (!Array.isArray(question.operands) || question.operands.length !== count || question.operands.some(value => !Number.isFinite(value) || !Number.isInteger(value))) errors.push('操作数结构无效');
  if (definition && !definition.allowedGrades.includes(config.stage)) errors.push('题型不符合年级要求');
  const max = definition?.difficultyProfiles[config.difficulty]?.max;
  if (Array.isArray(question.operands) && Number.isFinite(max) && question.operands.some(value => Math.abs(value) > Number(max))) errors.push('题目超过该题型难度上限');
  if (config.rangeMode === 'curriculum' && Array.isArray(question.operands) && question.operands.some(value => Math.abs(value) > CURRICULUM_MAXIMUMS[config.stage])) errors.push('题目超过当前学习阶段范围');
  if (!config.types.includes(type)) errors.push('题型不在配置中');
  return errors;
}
function structureErrors(question: Question, type: DataType, text: string, display: string, operands: number[], metadata: Record<string, string | number | boolean> | undefined, content: QuestionContent | undefined, layout: Question['layout'] = 'wide', steps?: string[], unit?: string): string[] {
  const errors: string[] = [];
  const allowedKeys = new Set(['id', 'type', 'text', 'answer', 'operands', 'operators', 'signature', 'layout', 'metadata', 'content', 'answerDetails']);
  if (Object.keys(question).some(key => !allowedKeys.has(key))) errors.push('题目顶层字段结构错误');
  const expectedDetails = { display, ...(unit ? { unit } : {}), ...(steps ? { steps } : {}) };
  if (question.text !== text) errors.push('题面格式错误');
  if (question.layout !== layout) errors.push('题目布局错误');
  if (question.signature !== `${type}:${text}|${display}|${operands.join(',')}`) errors.push('题目签名错误');
  if (!same(question.metadata, metadata)) errors.push('题目元数据结构错误');
  if (!same(question.content, content)) errors.push('题目内容结构错误');
  if (!same(question.answerDetails, expectedDetails)) errors.push('答案详情结构错误');
  if (question.operators !== undefined) errors.push('题目运算符结构错误');
  return errors;
}
function finish(errors: string[]): QuestionValidationResult { return { valid: errors.length === 0, errors }; }
function shouldStop(errors: string[]): boolean { return errors.some(error => error.startsWith('校验器题型不匹配')); }
function valid(question: Question, config: WorksheetConfig, definition: QuestionDefinition | undefined, type: DataType, count: number): string[] {
  return common(question, type, config, definition, count);
}
function boundedValues(values: number[], max: number): boolean { return values.length > 0 && values.every(value => Number.isInteger(value) && value > 0 && value <= max); }
function effectiveCap(type: DataType, config: WorksheetConfig, definition?: QuestionDefinition): number {
  return Math.max(1, Math.min(definition?.difficultyProfiles[config.difficulty]?.max ?? MAXIMUMS[type], config.rangeMode === 'curriculum' ? CURRICULUM_MAXIMUMS[config.stage] : MAXIMUMS[type], MAXIMUMS[type]));
}

const ACTIVITY_LABELS = ['跳绳', '跑步', '踢球', '阅读'];
function dataValues(input: QuestionGenerationInput, type: 'dataTableReading' | 'barChartReading'): Question {
  const cap = capFor(input, type); const values = ACTIVITY_LABELS.map(() => randomInt(1, cap, input.random));
  const maxIndex = values.indexOf(Math.max(...values));
  if (values.every(value => value === values[maxIndex])) values[maxIndex] = cap;
  values.forEach((value, index) => { if (index !== maxIndex && value === values[maxIndex]) values[index] = Math.max(1, value - 1); });
  const askTotal = input.random() < .5;
  const answer = askTotal ? values.reduce((sum, value) => sum + value, 0) : ACTIVITY_LABELS[values.indexOf(Math.max(...values))];
  const text = askTotal ? '根据数据，四项活动一共有多少人参加？' : '根据数据，参加人数最多的是哪项活动？';
  const content: QuestionContent = type === 'barChartReading'
    ? { kind: 'chart', chartType: 'bar', labels: ACTIVITY_LABELS, values, unit: '人' }
    : { kind: 'table', headers: ['活动', ...ACTIVITY_LABELS], rows: [['人数', ...values]] };
  return makeQuestion(input, type, text, answer, values, { metadata: { askTotal, labels: ACTIVITY_LABELS.join('|') }, content });
}
export function generateDataTableReading(input: QuestionGenerationInput): Question { return dataValues(input, 'dataTableReading'); }
export function generateBarChartReading(input: QuestionGenerationInput): Question { return dataValues(input, 'barChartReading'); }

export function solveDataTableReading(question: Question): number | string | undefined {
  if (!Array.isArray(question.operands) || question.operands.length !== 4 || question.operands.some(value => !Number.isInteger(value))) return undefined;
  const askTotal = question.metadata?.askTotal;
  if (typeof askTotal !== 'boolean') return undefined;
  return askTotal ? question.operands.reduce((sum, value) => sum + value, 0) : ACTIVITY_LABELS[question.operands.indexOf(Math.max(...question.operands))];
}
export const solveBarChartReading = solveDataTableReading;
function validateDataReading(question: Question, config: WorksheetConfig, definition: QuestionDefinition | undefined, type: 'dataTableReading' | 'barChartReading'): QuestionValidationResult {
  const errors = valid(question, config, definition, type, 4); if (shouldStop(errors) || errors.some(error => error === '操作数结构无效')) return finish(errors);
  const values = question.operands; const cap = effectiveCap(type, config, definition);
  const content: QuestionContent = type === 'barChartReading' ? { kind: 'chart', chartType: 'bar', labels: ACTIVITY_LABELS, values, unit: '人' } : { kind: 'table', headers: ['活动', ...ACTIVITY_LABELS], rows: [['人数', ...values]] };
  const answer = solveDataTableReading(question); const askTotal = question.metadata?.askTotal; const text = askTotal === true ? '根据数据，四项活动一共有多少人参加？' : askTotal === false ? '根据数据，参加人数最多的是哪项活动？' : '';
  if (!boundedValues(values, cap) || typeof askTotal !== 'boolean' || question.metadata?.labels !== ACTIVITY_LABELS.join('|') || answer === undefined || question.answer !== answer) errors.push('数据表答案或范围错误');
  errors.push(...structureErrors(question, type, text, String(answer), values, { askTotal: askTotal as boolean, labels: ACTIVITY_LABELS.join('|') }, content)); return finish(errors);
}
export const validateDataTableReading: QuestionValidator = (question, config, definition) => validateDataReading(question, config, definition, 'dataTableReading');
export const validateBarChartReading: QuestionValidator = (question, config, definition) => validateDataReading(question, config, definition, 'barChartReading');

export function generateAverage(input: QuestionGenerationInput): Question {
  const count = difficultyRank(input.config) < 3 ? 3 : 4; const cap = capFor(input, 'average'); const mean = randomInt(4, Math.max(4, Math.min(30, cap)), input.random);
  const offsets = count === 3 ? [-randomInt(1, Math.min(3, Math.max(1, mean - 1)), input.random), 0, 0] : [-2, -1, 1, 2];
  offsets[offsets.length - 1] = -offsets.slice(0, -1).reduce((sum, value) => sum + value, 0);
  const values = offsets.map(offset => mean + offset); const text = '根据表中数据，求这几天的平均数量。';
  return makeQuestion(input, 'average', text, mean, values, { content: { kind: 'table', headers: ['日期', ...values.map((_, index) => `第${index + 1}天`)], rows: [['数量', ...values]] }, answerDetails: { display: String(mean), steps: [`(${values.join(' + ')}) ÷ ${count} = ${mean}`] } });
}
export function solveAverage(question: Question): number | undefined { return Array.isArray(question.operands) && question.operands.length >= 2 && question.operands.every(Number.isFinite) ? question.operands.reduce((sum, value) => sum + value, 0) / question.operands.length : undefined; }
export const validateAverage: QuestionValidator = (question, config, definition) => {
  const count = difficultyRank(config) < 3 ? 3 : 4;
  const errors = valid(question, config, definition, 'average', count); const values = question.operands;
  if (shouldStop(errors) || errors.some(error => error === '操作数结构无效')) return finish(errors);
  const expected = solveAverage(question); const cap = effectiveCap('average', config, definition);
  const text = '根据表中数据，求这几天的平均数量。'; const content: QuestionContent = { kind: 'table', headers: ['日期', ...values.map((_, index) => `第${index + 1}天`)], rows: [['数量', ...values]] };
  const steps = [`(${values.join(' + ')}) ÷ ${count} = ${String(expected)}`];
  if (![3, 4].includes(count) || !boundedValues(values, cap) || !Number.isInteger(expected) || question.answer !== expected) errors.push('平均数边界或答案错误');
  errors.push(...structureErrors(question, 'average', text, String(expected), values, undefined, content, 'wide', steps)); return finish(errors);
};

export function generateLineChartReading(input: QuestionGenerationInput): Question {
  const labels = ['周一', '周二', '周三', '周四', '周五']; const cap = Math.max(5, Math.min(40, capFor(input, 'lineChartReading'))); const values = labels.map(() => randomInt(5, cap, input.random)); const left = randomInt(0, 3, input.random);
  if (values[left + 1] === values[left]) values[left + 1] = values[left] === cap ? cap - 1 : values[left] + 1;
  const signed = values[left + 1] - values[left]; const answer = Math.abs(signed); const text = `${labels[left + 1]}和${labels[left]}相差多少？`;
  return makeQuestion(input, 'lineChartReading', text, answer, values, { metadata: { left, signedDifference: signed }, content: { kind: 'chart', chartType: 'line', labels, values, unit: '页' }, answerDetails: { display: `${answer} 页`, unit: '页' } });
}
export function solveLineChartReading(question: Question): number | undefined { const left = question.metadata?.left; return Array.isArray(question.operands) && question.operands.length === 5 && typeof left === 'number' && Number.isInteger(left) && left >= 0 && left < 4 ? Math.abs(question.operands[left + 1] - question.operands[left]) : undefined; }
export const validateLineChartReading: QuestionValidator = (question, config, definition) => {
  const errors = valid(question, config, definition, 'lineChartReading', 5); if (shouldStop(errors) || errors.some(error => error === '操作数结构无效')) return finish(errors); const values = question.operands; const left = question.metadata?.left; const signed = typeof left === 'number' ? values[left + 1] - values[left] : NaN; const answer = solveLineChartReading(question); const cap = Math.min(definition?.difficultyProfiles[config.difficulty]?.max ?? MAXIMUMS.lineChartReading, config.rangeMode === 'curriculum' ? CURRICULUM_MAXIMUMS[config.stage] : MAXIMUMS.lineChartReading); const labels = ['周一', '周二', '周三', '周四', '周五']; const text = typeof left === 'number' && left >= 0 && left < 4 ? `${labels[left + 1]}和${labels[left]}相差多少？` : '';
  if (!boundedValues(values, cap) || answer === undefined || question.metadata?.signedDifference !== signed || question.answer !== answer) errors.push('折线图边界或答案错误');
  errors.push(...structureErrors(question, 'lineChartReading', text, `${String(answer)} 页`, values, { left: left as number, signedDifference: signed }, { kind: 'chart', chartType: 'line', labels, values, unit: '页' }, 'wide', undefined, '页')); return finish(errors);
};

export function generateProbability(input: QuestionGenerationInput): Question { const cap = Math.max(2, Math.min(9, capFor(input, 'probability'))); const red = randomInt(1, cap, input.random); let blue = randomInt(1, cap, input.random); if (blue === red) blue = blue === cap ? Math.max(1, blue - 1) : blue + 1; const answer = red > blue ? '红球' : '蓝球'; return makeQuestion(input, 'probability', `袋中有 ${red} 个红球和 ${blue} 个蓝球，任意摸一个，摸到哪种球的可能性更大？`, answer, [red, blue], { metadata: { comparison: 'greater-count' } }); }
export function solveProbability(question: Question): string | undefined { return question.operands?.length === 2 && question.operands[0] !== question.operands[1] ? question.operands[0] > question.operands[1] ? '红球' : '蓝球' : undefined; }
export const validateProbability: QuestionValidator = (question, config, definition) => { const errors = valid(question, config, definition, 'probability', 2); if (shouldStop(errors) || errors.some(error => error === '操作数结构无效')) return finish(errors); const [red, blue] = question.operands; const answer = solveProbability(question); const cap = effectiveCap('probability', config, definition); if (red < 1 || blue < 1 || red > cap || blue > cap || red === blue || answer === undefined || question.answer !== answer) errors.push('可能性边界或答案错误'); errors.push(...structureErrors(question, 'probability', `袋中有 ${red} 个红球和 ${blue} 个蓝球，任意摸一个，摸到哪种球的可能性更大？`, answer ?? '', [red, blue], { comparison: 'greater-count' }, undefined)); return finish(errors); };

export function generateChartAnalysis(input: QuestionGenerationInput): Question { const labels = ['一月', '二月', '三月', '四月', '五月']; const cap = Math.max(21, Math.min(100, capFor(input, 'chartAnalysis'))); const values = labels.map(() => randomInt(20, cap, input.random)); const highest = values.indexOf(Math.max(...values)); const lowest = values.indexOf(Math.min(...values)); if (highest === lowest) { if (values[highest] < cap) values[highest] += 1; else values[(highest + 1) % values.length] = values[highest] - 1; } const actualHighest = values.indexOf(Math.max(...values)); const actualLowest = values.indexOf(Math.min(...values)); const answer = values[actualHighest] - values[actualLowest]; const text = '观察统计图，最高值比最低值多多少？'; return makeQuestion(input, 'chartAnalysis', text, answer, values, { metadata: { highest: actualHighest, lowest: actualLowest }, content: { kind: 'chart', chartType: 'bar', labels, values, unit: '本' }, answerDetails: { display: `${answer} 本`, unit: '本', steps: [`${values[actualHighest]} - ${values[actualLowest]} = ${answer}（本）`] } }); }
export function solveChartAnalysis(question: Question): number | undefined { return question.operands?.length === 5 && question.operands.every(Number.isFinite) ? Math.max(...question.operands) - Math.min(...question.operands) : undefined; }
export const validateChartAnalysis: QuestionValidator = (question, config, definition) => { const errors = valid(question, config, definition, 'chartAnalysis', 5); if (shouldStop(errors) || errors.some(error => error === '操作数结构无效')) return finish(errors); const values = question.operands; const answer = solveChartAnalysis(question); const highest = values.indexOf(Math.max(...values)); const lowest = values.indexOf(Math.min(...values)); const cap = effectiveCap('chartAnalysis', config, definition); const labels = ['一月', '二月', '三月', '四月', '五月']; const text = '观察统计图，最高值比最低值多多少？'; if (!boundedValues(values, cap) || values.some(value => value < 20) || highest === lowest || answer === undefined || question.answer !== answer || question.metadata?.highest !== highest || question.metadata?.lowest !== lowest) errors.push('统计图边界或答案错误'); errors.push(...structureErrors(question, 'chartAnalysis', text, `${String(answer)} 本`, values, { highest, lowest }, { kind: 'chart', chartType: 'bar', labels, values, unit: '本' }, 'wide', [`${values[highest]} - ${values[lowest]} = ${answer}（本）`], '本')); return finish(errors); };

export function generateQuantityEstimate(input: QuestionGenerationInput): Question { const upper = Math.max(2, Math.min(40, capFor(input, 'quantityEstimate'))); const actual = randomInt(2, upper, input.random); const step = actual < 5 ? 2 : actual < 20 ? 5 : 10; const estimate = Math.round(actual / step) * step; const options = [Math.max(1, estimate - step), estimate, estimate + step]; const text = `观察图示，这组物品大约有多少个？（按整${step}估测，选择最接近的数量）`; return makeQuestion(input, 'quantityEstimate', text, estimate, [actual, step], { content: { kind: 'pictograph', labels: ['物品'], counts: [actual], symbol: '●', options } }); }
export function solveQuantityEstimate(question: Question): number | undefined { return question.operands?.length === 2 && question.operands[1] > 0 ? Math.round(question.operands[0] / question.operands[1]) * question.operands[1] : undefined; }
export const validateQuantityEstimate: QuestionValidator = (question, config, definition) => { const errors = valid(question, config, definition, 'quantityEstimate', 2); if (shouldStop(errors) || errors.some(error => error === '操作数结构无效')) return finish(errors); const [actual, step] = question.operands; const answer = solveQuantityEstimate(question); const options = [Math.max(1, Math.round(actual / step) * step - step), Math.round(actual / step) * step, Math.round(actual / step) * step + step]; const text = `观察图示，这组物品大约有多少个？（按整${step}估测，选择最接近的数量）`; const upper = Math.min(definition?.difficultyProfiles[config.difficulty]?.max ?? MAXIMUMS.quantityEstimate, config.rangeMode === 'curriculum' ? CURRICULUM_MAXIMUMS[config.stage] : MAXIMUMS.quantityEstimate); if (actual < 2 || actual > Math.min(40, upper) || ![2, 5, 10].includes(step) || answer === undefined || question.answer !== answer) errors.push('数量估测边界或答案错误'); errors.push(...structureErrors(question, 'quantityEstimate', text, String(answer), [actual, step], undefined, { kind: 'pictograph', labels: ['物品'], counts: [actual], symbol: '●', options })); return finish(errors); };

export function generatePictureClassification(input: QuestionGenerationInput): Question { const cap = Math.max(2, Math.min(8, capFor(input, 'pictureClassification'))); const fruit = randomInt(1, cap, input.random); let stationery = randomInt(1, cap, input.random); if (stationery === fruit) stationery = stationery === cap ? Math.max(1, stationery - 1) : stationery + 1; const answer = fruit > stationery ? '水果' : '文具'; return makeQuestion(input, 'pictureClassification', '观察图形分类，数量较多的是哪一类？', answer, [fruit, stationery], { content: { kind: 'pictograph', labels: ['水果', '文具'], counts: [fruit, stationery], symbol: '●', symbols: ['●', '■'] } }); }
export function solvePictureClassification(question: Question): string | undefined { return question.operands?.length === 2 && question.operands[0] !== question.operands[1] ? question.operands[0] > question.operands[1] ? '水果' : '文具' : undefined; }
export const validatePictureClassification: QuestionValidator = (question, config, definition) => { const errors = valid(question, config, definition, 'pictureClassification', 2); if (shouldStop(errors) || errors.some(error => error === '操作数结构无效')) return finish(errors); const [fruit, stationery] = question.operands; const answer = solvePictureClassification(question); const cap = effectiveCap('pictureClassification', config, definition); if (!boundedValues([fruit, stationery], cap) || fruit > 8 || stationery > 8 || answer === undefined || question.answer !== answer) errors.push('图片分类边界或答案错误'); errors.push(...structureErrors(question, 'pictureClassification', '观察图形分类，数量较多的是哪一类？', answer ?? '', [fruit, stationery], undefined, { kind: 'pictograph', labels: ['水果', '文具'], counts: [fruit, stationery], symbol: '●', symbols: ['●', '■'] })); return finish(errors); };

export function generatePieChartReading(input: QuestionGenerationInput): Question { const values = pick([[20, 25, 30, 25], [10, 20, 30, 40], [15, 25, 35, 25]], input.random); const labels = ['文具', '图书', '体育用品', '其他']; const index = randomInt(0, values.length - 1, input.random); const display = `${values[index]}%`; return makeQuestion(input, 'pieChartReading', `扇形统计图中${labels[index]}占全部的百分之几？`, display, [...values], { metadata: { index }, content: { kind: 'chart', chartType: 'pie', labels, values, unit: '%' }, answerDetails: { display, unit: '%' } }); }
export function solvePieChartReading(question: Question): string | undefined { const index = question.metadata?.index; return question.operands?.length === 4 && typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < 4 ? `${question.operands[index]}%` : undefined; }
export const validatePieChartReading: QuestionValidator = (question, config, definition) => { const errors = valid(question, config, definition, 'pieChartReading', 4); if (shouldStop(errors) || errors.some(error => error === '操作数结构无效')) return finish(errors); const values = question.operands; const index = question.metadata?.index; const answer = solvePieChartReading(question); const cap = effectiveCap('pieChartReading', config, definition); const labels = ['文具', '图书', '体育用品', '其他']; if (!boundedValues(values, cap) || values.some(value => value > 100) || values.reduce((sum, value) => sum + value, 0) !== 100 || typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= 4 || answer === undefined || question.answer !== answer) errors.push('扇形图边界或答案错误'); errors.push(...structureErrors(question, 'pieChartReading', typeof index === 'number' && index >= 0 && index < 4 ? `扇形统计图中${labels[index]}占全部的百分之几？` : '', answer ?? '', values, { index: index as number }, { kind: 'chart', chartType: 'pie', labels, values, unit: '%' }, 'wide', undefined, '%')); return finish(errors); };

export function generateMultiChartAnalysis(input: QuestionGenerationInput): Question { const cap = Math.max(4, Math.min(30, capFor(input, 'multiChartAnalysis'))); const firstSeries = Array.from({ length: 4 }, () => randomInt(1, cap, input.random)); const secondSeries = Array.from({ length: 4 }, () => randomInt(1, cap, input.random)); let signed = firstSeries[0] + firstSeries[1] - secondSeries[0] - secondSeries[1]; if (signed === 0) secondSeries[1] = secondSeries[1] === cap ? Math.max(1, secondSeries[1] - 1) : secondSeries[1] + 1; signed = firstSeries[0] + firstSeries[1] - secondSeries[0] - secondSeries[1]; const direction = signed >= 0 ? '多' : '少'; const answer = Math.abs(signed); const text = `观察两组数据图，A组前两项合计比B组前两项合计${direction}多少？`; const labels = ['项目一', '项目二', '项目三', '项目四']; return makeQuestion(input, 'multiChartAnalysis', text, answer, [...firstSeries, ...secondSeries], { metadata: { direction }, content: { kind: 'chart', chartType: 'bar', labels, values: firstSeries, unit: '件', series: [{ label: 'A组', values: firstSeries }, { label: 'B组', values: secondSeries }] }, answerDetails: { display: `${answer} 件`, unit: '件' } }); }
export function solveMultiChartAnalysis(question: Question): number | undefined { return question.operands?.length === 8 ? Math.abs(question.operands[0] + question.operands[1] - question.operands[4] - question.operands[5]) : undefined; }
export const validateMultiChartAnalysis: QuestionValidator = (question, config, definition) => { const errors = valid(question, config, definition, 'multiChartAnalysis', 8); if (shouldStop(errors) || errors.some(error => error === '操作数结构无效')) return finish(errors); const values = question.operands; const first = values.slice(0, 4); const second = values.slice(4); const signed = first[0] + first[1] - second[0] - second[1]; const direction = signed >= 0 ? '多' : '少'; const answer = solveMultiChartAnalysis(question); const cap = effectiveCap('multiChartAnalysis', config, definition); const labels = ['项目一', '项目二', '项目三', '项目四']; if (!boundedValues(values, cap) || signed === 0 || answer === undefined || question.metadata?.direction !== direction || question.answer !== answer) errors.push('多序列图边界或答案错误'); errors.push(...structureErrors(question, 'multiChartAnalysis', `观察两组数据图，A组前两项合计比B组前两项合计${direction}多少？`, `${answer} 件`, values, { direction }, { kind: 'chart', chartType: 'bar', labels, values: first, unit: '件', series: [{ label: 'A组', values: first }, { label: 'B组', values: second }] }, 'wide', undefined, '件')); return finish(errors); };

function definition(input: Omit<QuestionDefinition, 'description' | 'skills' | 'difficulties'>): QuestionDefinition { return { ...input, description: `通过${input.label}读取、整理和解释数据。`, skills: [input.label, '数据读取', '数据解释'], difficulties: [...DIFFICULTIES] }; }
const ALL_GRADES: readonly Grade[] = [...STAGES]; const G2_PLUS: readonly Grade[] = STAGES.slice(2); const G4_PLUS: readonly Grade[] = STAGES.slice(4); const G5_PLUS: readonly Grade[] = STAGES.slice(5); const G6_PLUS: readonly Grade[] = STAGES.slice(6);
const TABLE = { columns: 'full' as const, heightMm: { standard: 31, large: 36 }, preventBreakInside: true }; const VISUAL = { columns: 'full' as const, heightMm: { standard: 38, large: 43 }, preventBreakInside: true }; const WIDE = { columns: 'full' as const, heightMm: { standard: 11, large: 13 }, preventBreakInside: true };
export const DATA_QUESTION_DEFINITIONS: readonly QuestionDefinition[] = [
  definition({ id: 'dataTableReading', label: '简单表格阅读', group: 'data-probability', domain: 'data-probability', contentCategory: 'data', allowedGrades: ALL_GRADES, recommendedGrades: ALL_GRADES, difficultyProfiles: profile(MAXIMUMS.dataTableReading), practice: 'standard', generate: generateDataTableReading, validate: validateDataTableReading, renderKind: 'table', footprint: TABLE }),
  definition({ id: 'barChartReading', label: '条形统计图', group: 'data-probability', domain: 'data-probability', contentCategory: 'data', allowedGrades: G2_PLUS, recommendedGrades: G2_PLUS, difficultyProfiles: profile(MAXIMUMS.barChartReading), practice: 'standard', generate: generateBarChartReading, validate: validateBarChartReading, renderKind: 'chart', footprint: VISUAL }),
  definition({ id: 'average', label: '平均数', group: 'data-probability', domain: 'data-probability', contentCategory: 'data', allowedGrades: G4_PLUS, recommendedGrades: G4_PLUS, difficultyProfiles: profile(MAXIMUMS.average), practice: 'standard', generate: generateAverage, validate: validateAverage, renderKind: 'table', footprint: TABLE }),
  definition({ id: 'lineChartReading', label: '折线统计图', group: 'data-probability', domain: 'data-probability', contentCategory: 'data', allowedGrades: G5_PLUS, recommendedGrades: G5_PLUS, difficultyProfiles: profile(MAXIMUMS.lineChartReading), practice: 'standard', generate: generateLineChartReading, validate: validateLineChartReading, renderKind: 'chart', footprint: VISUAL }),
  definition({ id: 'probability', label: '可能性', group: 'data-probability', domain: 'data-probability', contentCategory: 'data', allowedGrades: G5_PLUS, recommendedGrades: G5_PLUS, difficultyProfiles: profile(MAXIMUMS.probability), practice: 'standard', generate: generateProbability, validate: validateProbability, renderKind: 'choice', footprint: WIDE }),
  definition({ id: 'chartAnalysis', label: '多数据综合分析', group: 'data-probability', domain: 'data-probability', contentCategory: 'data', allowedGrades: G6_PLUS, recommendedGrades: G6_PLUS, difficultyProfiles: profile(MAXIMUMS.chartAnalysis), practice: 'standard', generate: generateChartAnalysis, validate: validateChartAnalysis, renderKind: 'chart', footprint: VISUAL }),
  definition({ id: 'quantityEstimate', label: '数量估测', group: 'data-probability', domain: 'data-probability', contentCategory: 'data', allowedGrades: ALL_GRADES, recommendedGrades: ALL_GRADES, difficultyProfiles: profile(MAXIMUMS.quantityEstimate), practice: 'standard', generate: generateQuantityEstimate, validate: validateQuantityEstimate, renderKind: 'pictograph', footprint: VISUAL }),
  definition({ id: 'pictureClassification', label: '图片分类统计', group: 'data-probability', domain: 'data-probability', contentCategory: 'data', allowedGrades: ALL_GRADES, recommendedGrades: ALL_GRADES, difficultyProfiles: profile(MAXIMUMS.pictureClassification, 8), practice: 'standard', generate: generatePictureClassification, validate: validatePictureClassification, renderKind: 'pictograph', footprint: VISUAL }),
  definition({ id: 'pieChartReading', label: '扇形统计图', group: 'data-probability', domain: 'data-probability', contentCategory: 'data', allowedGrades: G6_PLUS, recommendedGrades: G6_PLUS, difficultyProfiles: profile(MAXIMUMS.pieChartReading), practice: 'standard', generate: generatePieChartReading, validate: validatePieChartReading, renderKind: 'chart', footprint: VISUAL }),
  definition({ id: 'multiChartAnalysis', label: '折线、扇形和多图表分析', group: 'data-probability', domain: 'data-probability', contentCategory: 'data', allowedGrades: G6_PLUS, recommendedGrades: G6_PLUS, difficultyProfiles: profile(MAXIMUMS.multiChartAnalysis), practice: 'standard', generate: generateMultiChartAnalysis, validate: validateMultiChartAnalysis, renderKind: 'chart', footprint: VISUAL })
];
