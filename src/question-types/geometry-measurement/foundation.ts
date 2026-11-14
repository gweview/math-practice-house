import type { Grade } from '../../domain/curriculum/types';
import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import type { Question, QuestionContent } from '../../domain/questions/model';
import type { WorksheetConfig } from '../../domain/worksheet/config';
import type { RandomSource } from '../../shared/random/seeded-random';

type FoundationType = 'clockReading' | 'elapsedTime' | 'shapeRecognition' | 'area' | 'angleClassification' | 'lineRaySegment' | 'angleMeasurement' | 'triangleQuadrilateralClassification' | 'translationRotation' | 'directionRoute' | 'shapeClassification' | 'countShapes' | 'axisSymmetry';

const DIFFICULTIES: QuestionDefinition['difficulties'] = ['entry', 'easy', 'standard', 'advanced', 'challenge'];
const CURRICULUM_MAXIMUMS: Readonly<Record<Grade, number>> = { preschool: 10, grade1: 20, grade2: 100, grade3: 1000, grade4: 100_000_000, grade5: 100_000_000, grade6: 100_000_000 };

function rank(config: WorksheetConfig): number { return ['entry', 'easy', 'standard', 'advanced', 'challenge'].indexOf(config.difficulty); }
function randomInt(min: number, max: number, random: RandomSource): number {
  const lower = Math.ceil(Math.min(min, max)); const upper = Math.floor(Math.max(min, max));
  return Math.floor(random() * (upper - lower + 1)) + lower;
}
function pick<T>(items: readonly T[], random: RandomSource): T { return items[randomInt(0, items.length - 1, random)]; }
function formatClock(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  return `${Math.floor(normalized / 60)}:${String(normalized % 60).padStart(2, '0')}`;
}
function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) return left.length === right.length && left.every((value, index) => same(value, right[index]));
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const lk = Object.keys(left as object); const rk = Object.keys(right as object);
  return lk.length === rk.length && lk.every(key => Object.prototype.hasOwnProperty.call(right, key) && same((left as Record<string, unknown>)[key], (right as Record<string, unknown>)[key]));
}
function makeQuestion(input: QuestionGenerationInput, type: FoundationType, text: string, answer: number | string, operands: number[], options: Partial<Pick<Question, 'layout' | 'metadata' | 'content' | 'answerDetails'>> = {}): Question {
  const display = options.answerDetails?.display ?? String(answer);
  const signatureData = options.metadata?.signatureData ?? `${text}|${display}|${operands.join(',')}`;
  return { id: input.createId(), type, text, answer, operands, signature: `${type}:${String(signatureData)}`, layout: options.layout ?? 'inline', metadata: options.metadata, content: options.content, answerDetails: { display, ...options.answerDetails } };
}

export function generateClockReading(input: QuestionGenerationInput): Question {
  const hour = randomInt(1, 12, input.random); const minute = randomInt(0, 11, input.random) * 5;
  return makeQuestion(input, 'clockReading', '读一读钟面上的时间。', `${hour}:${String(minute).padStart(2, '0')}`, [hour, minute], { layout: 'wide', content: { kind: 'clock', hour, minute } });
}
export function generateElapsedTime(input: QuestionGenerationInput): Question {
  const start = randomInt(7 * 60, 18 * 60, input.random); const unit = rank(input.config) < 2 ? 5 : 1;
  const duration = randomInt(1, rank(input.config) < 3 ? 12 : 60, input.random) * unit; const end = start + duration; const display = formatClock(end);
  return makeQuestion(input, 'elapsedTime', `活动从 ${formatClock(start)} 开始，经过 ${duration} 分钟结束。结束时间是几点？`, display, [start, duration, end], { layout: 'word', answerDetails: { display, steps: [`${formatClock(start)} + ${duration} 分钟 = ${display}`] } });
}
const SHAPES = [['triangle', '三角形'], ['rectangle', '长方形'], ['square', '正方形'], ['circle', '圆形']] as const;
export function generateShapeRecognition(input: QuestionGenerationInput): Question {
  const [shape, answer] = pick(SHAPES, input.random); const variant = randomInt(1, 360, input.random);
  return makeQuestion(input, 'shapeRecognition', '观察图形，写出它的名称。', answer, [SHAPES.findIndex(item => item[0] === shape), variant], { layout: 'wide', metadata: { variant }, content: { kind: 'geometry', shape, dimensions: [variant] } });
}
export function generateArea(input: QuestionGenerationInput): Question {
  const square = input.random() < .35; const width = randomInt(3, square ? 25 : 30, input.random); const height = square ? width : randomInt(2, 25, input.random); const numeric = width * height; const display = `${numeric} 平方厘米`;
  return makeQuestion(input, 'area', square ? `正方形边长 ${width} 厘米，面积是多少？` : `长方形长 ${width} 厘米、宽 ${height} 厘米，面积是多少？`, display, [width, height], { layout: 'wide', metadata: { shape: square ? 'square' : 'rectangle', unit: '平方厘米' }, content: { kind: 'geometry', shape: square ? 'square' : 'rectangle', dimensions: [width, height], labels: [`${width} cm`, `${height} cm`] }, answerDetails: { display, unit: '平方厘米', steps: [`${width} × ${height} = ${numeric}（平方厘米）`] } });
}
export function generateAngleClassification(input: QuestionGenerationInput): Question {
  const r = rank(input.config); const category = input.random(); const near = r >= 3; const acute = near ? randomInt(80, 89, input.random) : randomInt(20 + r * 5, 80, input.random); const obtuse = near ? randomInt(91, 100, input.random) : randomInt(100, 160 - r * 5, input.random); const angle = category < .34 ? acute : category < .67 ? 90 : obtuse; const answer = angle < 90 ? '锐角' : angle === 90 ? '直角' : '钝角';
  return makeQuestion(input, 'angleClassification', `图中角的度数是 ${angle}°，它是什么角？`, answer, [angle], { layout: 'wide', content: { kind: 'geometry', shape: 'angle', angle }, metadata: { angle } });
}
export function generateLineRaySegment(input: QuestionGenerationInput): Question {
  const choices = [['两端都有端点', '线段'], ['一端有端点，另一端无限延伸', '射线'], ['没有端点，向两端无限延伸', '直线']] as const; const [, answer] = pick(choices, input.random); const index = choices.findIndex(item => item[1] === answer); const length = randomInt(4, 20, input.random);
  return makeQuestion(input, 'lineRaySegment', '观察图示，这是什么图形？', answer, [index, length], { layout: 'wide', metadata: { lineType: answer }, content: { kind: 'geometry', shape: 'line', dimensions: [index, length] } });
}
export function generateAngleMeasurement(input: QuestionGenerationInput): Question {
  const angle = randomInt(20, rank(input.config) < 2 ? 90 : 160, input.random); return makeQuestion(input, 'angleMeasurement', '量一量图中角的度数。', `${angle}°`, [angle], { layout: 'wide', metadata: { angle }, content: { kind: 'geometry', shape: 'angle', angle } });
}
export function generateTriangleQuadrilateralClassification(input: QuestionGenerationInput): Question {
  const choices = ['等边三角形', '直角三角形', '平行四边形', '梯形'] as const; const answer = pick(choices, input.random); const index = choices.findIndex(item => item === answer); const variant = randomInt(1, 20, input.random);
  return makeQuestion(input, 'triangleQuadrilateralClassification', '观察图形，判断它的类别。', answer, [index, variant], { layout: 'wide', metadata: { classification: answer }, content: { kind: 'geometry', shape: answer.includes('三角形') ? 'triangle' : 'quadrilateral', dimensions: [index, variant] } });
}
export function generateTranslationRotation(input: QuestionGenerationInput): Question {
  const operation = input.random() < .5 ? '平移' : '旋转'; const amount = operation === '平移' ? randomInt(1, 12, input.random) : pick([90, 180, 270], input.random); const scale = randomInt(1, 8, input.random);
  return makeQuestion(input, 'translationRotation', '观察图形运动前后的变化，判断这种运动。', operation, [amount, operation === '平移' ? 0 : 1, scale], { layout: 'wide', metadata: { operation, amount }, content: { kind: 'geometry', shape: 'composite', dimensions: [amount, operation === '平移' ? 0 : 1, scale], labels: [] } });
}
export function generateDirectionRoute(input: QuestionGenerationInput): Question {
  const cap = 2 + Math.max(0, rank(input.config)); const east = randomInt(1, cap, input.random); const north = randomInt(1, cap, input.random);
  return makeQuestion(input, 'directionRoute', `从学校到图书馆，先向东走${east}格，再向北走${north}格。路线中先向哪个方向？`, '先向东，再向北', [east, north], { layout: 'wide', metadata: { east, north, answer: '先向东，再向北' }, content: { kind: 'geometry', shape: 'line', dimensions: [east, north], labels: ['起点', '东', '北'] } });
}
const CLASSIFICATION_SHAPES = [['triangle', '平面图形'], ['rectangle', '平面图形'], ['circle', '平面图形'], ['cuboid', '立体图形'], ['cube', '立体图形']] as const;
export function generateShapeClassification(input: QuestionGenerationInput): Question {
  const [shape, answer] = pick(CLASSIFICATION_SHAPES, input.random); const variant = randomInt(1, 20, input.random);
  return makeQuestion(input, 'shapeClassification', '观察图形，它属于哪一类？', answer, [CLASSIFICATION_SHAPES.findIndex(item => item[0] === shape), variant], { layout: 'wide', metadata: { category: answer }, content: { kind: 'geometry', shape: shape === 'cube' ? 'cube' : shape, dimensions: [variant] } });
}
export function generateCountShapes(input: QuestionGenerationInput): Question {
  const size = randomInt(2, Math.min(5, 2 + Math.max(0, rank(input.config))), input.random); const rectangles = input.random() < .35; const columns = rectangles ? randomInt(2, 5, input.random) : size; const count = rectangles ? size * columns * (size + 1) * (columns + 1) / 4 : size * (size + 1) * (2 * size + 1) / 6;
  return makeQuestion(input, 'countShapes', `${size}×${columns}的小方格图中一共有多少个${rectangles ? '长方形（包括正方形）' : '正方形'}？`, count, [size, rectangles ? 1 : 0, columns], { layout: 'wide', metadata: { size, rectangles }, content: { kind: 'geometry', shape: 'grid', dimensions: [size, columns, rectangles ? 1 : 0], labels: [`${size}×${columns} 网格`] } });
}
export function generateAxisSymmetry(input: QuestionGenerationInput): Question {
  const choices = [['正方形', 4], ['长方形', 2], ['等边三角形', 3], ['普通三角形', 0]] as const; const [name, answer] = pick(choices, input.random); const size = randomInt(4, 20, input.random);
  return makeQuestion(input, 'axisSymmetry', '观察图形，它有几条对称轴？', answer, [answer, size], { layout: 'wide', metadata: { shape: name, axes: answer }, content: { kind: 'geometry', shape: 'symmetry', dimensions: [answer, size], labels: [name] } });
}

function mismatch(type: FoundationType, question: Question): QuestionValidationResult { return { valid: false, errors: [`校验器题型不匹配：${type}`, `实际题型：${String(question?.type)}`] }; }
function baseErrors(question: Question, config: WorksheetConfig, definition: QuestionDefinition | undefined, type: FoundationType, expectedCount: number, answer?: number): string[] {
  const errors: string[] = [];
  if (!question || question.type !== type) return [`校验器题型不匹配：${type}`];
  const values = Array.isArray(question.operands) ? question.operands : [];
  if (values.length !== expectedCount || values.some(value => !Number.isFinite(value) || !Number.isInteger(value))) errors.push('操作数无效');
  if (definition && !definition.allowedGrades.includes(config.stage)) errors.push('题型不适用于当前学习阶段');
  if (!config.types.includes(type)) errors.push('题型不在配置中');
  const max = definition?.difficultyProfiles[config.difficulty]?.max ?? definition?.difficultyProfiles.standard?.max;
  // The legacy profiles use a generic ceiling. Geometry encodes several
  // visual facts as operands (clock minutes, absolute time, shape variants,
  // angle degrees and movement amounts), so only quantity-bearing fields use
  // the profile ceiling here.
  const profileValues = type === 'clockReading' || type === 'angleClassification' || type === 'angleMeasurement'
    ? [] : type === 'elapsedTime' ? [values[1]] : type === 'shapeRecognition' || type === 'shapeClassification'
      ? [values[0]] : type === 'triangleQuadrilateralClassification' ? [values[0]]
        : type === 'translationRotation' ? [values[2]] : type === 'axisSymmetry' ? [values[0]] : values;
  if (Number.isFinite(max) && profileValues.some(value => value > Number(max))) errors.push('题目超过该题型难度上限');
  // Time encodings and visual variant/size markers are not quantities governed by
  // the curriculum ceiling; all other numeric answer-bearing operands are.
  const capValues = type === 'clockReading' ? [values[0]] : type === 'elapsedTime' ? [values[1]] : type === 'shapeRecognition' || type === 'shapeClassification' ? [values[0]] : values;
  const cap = config.rangeMode === 'curriculum' ? CURRICULUM_MAXIMUMS[config.stage] : Number.POSITIVE_INFINITY;
  if (capValues.some(value => Number.isFinite(value) && Math.abs(value) > cap)) errors.push('题目超过当前学习阶段范围');
  if (typeof answer === 'number' && answer > cap && !['countShapes', 'axisSymmetry'].includes(type)) errors.push('答案超过当前学习阶段范围');
  return errors;
}
function expected(type: FoundationType, question: Question): { answer: number | string; text: string; layout: Question['layout']; metadata?: Record<string, string | number | boolean>; content?: QuestionContent; details?: Question['answerDetails'] } | undefined {
  const o = Array.isArray(question.operands) ? question.operands : [];
  switch (type) {
    case 'clockReading': { const [h, m] = o; return { answer: `${h}:${String(m).padStart(2, '0')}`, text: '读一读钟面上的时间。', layout: 'wide', content: { kind: 'clock', hour: h, minute: m } }; }
    case 'elapsedTime': { const [start, duration, end] = o; const display = formatClock(end); return { answer: display, text: `活动从 ${formatClock(start)} 开始，经过 ${duration} 分钟结束。结束时间是几点？`, layout: 'word', details: { display, steps: [`${formatClock(start)} + ${duration} 分钟 = ${display}`] } }; }
    case 'shapeRecognition': { const item = SHAPES[o[0]]; if (!item) return undefined; return { answer: item[1], text: '观察图形，写出它的名称。', layout: 'wide', metadata: { variant: o[1] }, content: { kind: 'geometry', shape: item[0], dimensions: [o[1]] } }; }
    case 'area': { const shape = question.metadata?.shape; const display = `${o[0] * o[1]} 平方厘米`; return { answer: display, text: shape === 'square' ? `正方形边长 ${o[0]} 厘米，面积是多少？` : `长方形长 ${o[0]} 厘米、宽 ${o[1]} 厘米，面积是多少？`, layout: 'wide', metadata: { shape: String(shape), unit: '平方厘米' }, content: { kind: 'geometry', shape: shape === 'square' ? 'square' : 'rectangle', dimensions: [o[0], o[1]], labels: [`${o[0]} cm`, `${o[1]} cm`] }, details: { display, unit: '平方厘米', steps: [`${o[0]} × ${o[1]} = ${o[0] * o[1]}（平方厘米）`] } }; }
    case 'angleClassification': { const answer = o[0] < 90 ? '锐角' : o[0] === 90 ? '直角' : '钝角'; return { answer, text: `图中角的度数是 ${o[0]}°，它是什么角？`, layout: 'wide', content: { kind: 'geometry', shape: 'angle', angle: o[0] }, metadata: { angle: o[0] } }; }
    case 'lineRaySegment': { const answer = ['线段', '射线', '直线'][o[0]]; if (!answer) return undefined; return { answer, text: '观察图示，这是什么图形？', layout: 'wide', metadata: { lineType: answer }, content: { kind: 'geometry', shape: 'line', dimensions: [o[0], o[1]] } }; }
    case 'angleMeasurement': { const answer = `${o[0]}°`; return { answer, text: '量一量图中角的度数。', layout: 'wide', metadata: { angle: o[0] }, content: { kind: 'geometry', shape: 'angle', angle: o[0] } }; }
    case 'triangleQuadrilateralClassification': { const answer = ['等边三角形', '直角三角形', '平行四边形', '梯形'][o[0]]; if (!answer) return undefined; return { answer, text: '观察图形，判断它的类别。', layout: 'wide', metadata: { classification: answer }, content: { kind: 'geometry', shape: o[0] < 2 ? 'triangle' : 'quadrilateral', dimensions: [o[0], o[1]] } }; }
    case 'translationRotation': { const answer = o[1] === 0 ? '平移' : '旋转'; return { answer, text: '观察图形运动前后的变化，判断这种运动。', layout: 'wide', metadata: { operation: answer, amount: o[0] }, content: { kind: 'geometry', shape: 'composite', dimensions: [o[0], o[1], o[2]], labels: [] } }; }
    case 'directionRoute': return { answer: '先向东，再向北', text: `从学校到图书馆，先向东走${o[0]}格，再向北走${o[1]}格。路线中先向哪个方向？`, layout: 'wide', metadata: { east: o[0], north: o[1], answer: '先向东，再向北' }, content: { kind: 'geometry', shape: 'line', dimensions: [o[0], o[1]], labels: ['起点', '东', '北'] } };
    case 'shapeClassification': { const item = CLASSIFICATION_SHAPES[o[0]]; if (!item) return undefined; return { answer: item[1], text: '观察图形，它属于哪一类？', layout: 'wide', metadata: { category: item[1] }, content: { kind: 'geometry', shape: item[0], dimensions: [o[1]] } }; }
    case 'countShapes': { const rectangles = o[1] === 1; const count = rectangles ? o[0] * o[2] * (o[0] + 1) * (o[2] + 1) / 4 : o[0] * (o[0] + 1) * (2 * o[0] + 1) / 6; return { answer: count, text: `${o[0]}×${o[2]}的小方格图中一共有多少个${rectangles ? '长方形（包括正方形）' : '正方形'}？`, layout: 'wide', metadata: { size: o[0], rectangles }, content: { kind: 'geometry', shape: 'grid', dimensions: [o[0], o[2], o[1]], labels: [`${o[0]}×${o[2]} 网格`] } }; }
    case 'axisSymmetry': { const item = ([['正方形', 4], ['长方形', 2], ['等边三角形', 3], ['普通三角形', 0]] as const).find(entry => entry[1] === o[0]); if (!item) return undefined; return { answer: o[0], text: '观察图形，它有几条对称轴？', layout: 'wide', metadata: { shape: item[0], axes: o[0] }, content: { kind: 'geometry', shape: 'symmetry', dimensions: [o[0], o[1]], labels: [item[0]] } }; }
  }
}

function validate(type: FoundationType, question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (!question || question.type !== type) return mismatch(type, question);
  const o = Array.isArray(question.operands) ? question.operands : [];
  const shapeExpected = expected(type, question);
  const operandCount: Record<FoundationType, number> = {
    clockReading: 2, elapsedTime: 3, shapeRecognition: 2, area: 2, angleClassification: 1,
    lineRaySegment: 2, angleMeasurement: 1, triangleQuadrilateralClassification: 2,
    translationRotation: 3, directionRoute: 2, shapeClassification: 2, countShapes: 3, axisSymmetry: 2
  };
  const errors = baseErrors(question, config, definition, type, operandCount[type], typeof shapeExpected?.answer === 'number' ? shapeExpected.answer : undefined);
  if (errors.includes('操作数无效') || !shapeExpected) return { valid: false, errors: [...errors, ...(!shapeExpected ? ['题目数据无效'] : [])] };
  if (type === 'clockReading' && (o[0] < 1 || o[0] > 12 || o[1] < 0 || o[1] > 55 || o[1] % 5 !== 0)) errors.push('钟面参数无效');
  if (type === 'elapsedTime' && (o[0] < 420 || o[0] > 1080 || o[1] < 1 || o[1] > 60 || o[2] !== o[0] + o[1])) errors.push('经过时间参数无效');
  if (type === 'shapeRecognition' && (o[0] < 0 || o[0] > 3 || o[1] < 1 || o[1] > 360)) errors.push('图形参数无效');
  if (type === 'area' && (o.some(v => v <= 0) || o[0] > 30 || o[1] > 25 || (question.metadata?.shape === 'square' && o[0] !== o[1]) || !['square', 'rectangle'].includes(String(question.metadata?.shape)))) errors.push('面积参数无效');
  if (type === 'angleClassification' && (o[0] < 1 || o[0] >= 180)) errors.push('角度参数无效');
  if (type === 'lineRaySegment' && (o[0] < 0 || o[0] > 2 || o[1] < 4 || o[1] > 20)) errors.push('线型参数无效');
  if (type === 'angleMeasurement' && (o[0] < 20 || o[0] > (rank(config) < 2 ? 90 : 160))) errors.push('量角参数无效');
  if (type === 'triangleQuadrilateralClassification' && (o[0] < 0 || o[0] > 3 || o[1] < 1 || o[1] > 20)) errors.push('多边形参数无效');
  if (type === 'translationRotation' && (o[1] !== 0 && o[1] !== 1 || o[2] < 1 || o[2] > 8 || (o[1] === 0 ? o[0] < 1 || o[0] > 12 : ![90, 180, 270].includes(o[0])))) errors.push('图形运动参数无效');
  if (type === 'directionRoute' && (o[0] < 1 || o[1] < 1 || o[0] > 2 + Math.max(0, rank(config)) || o[1] > 2 + Math.max(0, rank(config)))) errors.push('路线参数无效');
  if (type === 'shapeClassification' && (o[0] < 0 || o[0] > 4 || o[1] < 1 || o[1] > 20)) errors.push('分类参数无效');
  if (type === 'countShapes' && (o[0] < 2 || o[0] > Math.min(5, 2 + Math.max(0, rank(config))) || ![0, 1].includes(o[1]) || o[2] < 2 || o[2] > 5 || (o[1] === 0 && o[2] !== o[0]))) errors.push('数图形参数无效');
  if (type === 'axisSymmetry' && (![0, 2, 3, 4].includes(o[0]) || o[1] < 4 || o[1] > 20)) errors.push('对称轴参数无效');
  if (question.answer !== shapeExpected.answer) errors.push('答案错误');
  const expectedDisplay = shapeExpected.details?.display ?? String(shapeExpected.answer);
  const expectedSignature = `${type}:${shapeExpected.text}|${expectedDisplay}|${o.join(',')}`;
  if (question.text !== shapeExpected.text) errors.push('题面格式错误');
  if (question.layout !== shapeExpected.layout) errors.push('题面布局错误');
  if (question.signature !== expectedSignature) errors.push('题目签名错误');
  if (!same(question.metadata, shapeExpected.metadata)) errors.push('元数据错误');
  if (!same(question.content, shapeExpected.content)) errors.push('结构化内容错误');
  if (!same(question.answerDetails, { display: expectedDisplay, ...shapeExpected.details })) errors.push('答案详情错误');
  return { valid: errors.length === 0, errors };
}

export const validateClockReading: QuestionValidator = (q, c, d) => validate('clockReading', q, c, d);
export const validateElapsedTime: QuestionValidator = (q, c, d) => validate('elapsedTime', q, c, d);
export const validateShapeRecognition: QuestionValidator = (q, c, d) => validate('shapeRecognition', q, c, d);
export const validateArea: QuestionValidator = (q, c, d) => validate('area', q, c, d);
export const validateAngleClassification: QuestionValidator = (q, c, d) => validate('angleClassification', q, c, d);
export const validateLineRaySegment: QuestionValidator = (q, c, d) => validate('lineRaySegment', q, c, d);
export const validateAngleMeasurement: QuestionValidator = (q, c, d) => validate('angleMeasurement', q, c, d);
export const validateTriangleQuadrilateralClassification: QuestionValidator = (q, c, d) => validate('triangleQuadrilateralClassification', q, c, d);
export const validateTranslationRotation: QuestionValidator = (q, c, d) => validate('translationRotation', q, c, d);
export const validateDirectionRoute: QuestionValidator = (q, c, d) => validate('directionRoute', q, c, d);
export const validateShapeClassification: QuestionValidator = (q, c, d) => validate('shapeClassification', q, c, d);
export const validateCountShapes: QuestionValidator = (q, c, d) => validate('countShapes', q, c, d);
export const validateAxisSymmetry: QuestionValidator = (q, c, d) => validate('axisSymmetry', q, c, d);

type FoundationDefinitionInput = Omit<QuestionDefinition, 'description' | 'skills' | 'difficulties'> & { description?: string; skills?: readonly string[] };
/** Direct definition helper for this migration batch; it only supplies category-aware metadata. */
export function foundationQuestion(input: FoundationDefinitionInput): QuestionDefinition {
  return { ...input, description: input.description ?? `在${input.label}情境中建立图形、空间和测量单位之间的联系。`, skills: input.skills ?? [input.label, '空间观念', '测量推理'], difficulties: DIFFICULTIES };
}

export type { FoundationType };
