import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import type { Question } from '../../domain/questions/model';
import type { WorksheetConfig } from '../../domain/worksheet/config';
import type { RandomSource } from '../../shared/random/seeded-random';

/**
 * Polygon perimeter for grade 3: the built-in `perimeter` type only covers
 * rectangles and squares, while the taxonomy expects perimeters of triangles
 * and general polygons (sum of side lengths). Self-contained in the same
 * style as the concept number-sense family.
 */

type PerimeterForm = 'triangle' | 'equilateral' | 'regular' | 'quadrilateral' | 'isosceles';

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

function perimeterText(form: PerimeterForm, sides: number[], unit: string): string {
  if (form === 'triangle') return `一个三角形的三条边长度分别是 ${sides[0]} ${unit}、${sides[1]} ${unit}、${sides[2]} ${unit}，它的周长是多少${unit}？`;
  if (form === 'equilateral') return `一个等边三角形的边长是 ${sides[0]} ${unit}，它的周长是多少${unit}？`;
  if (form === 'regular') return `一个正${sides[0] === 5 ? '五' : '六'}边形的边长是 ${sides[1]} ${unit}，它的周长是多少${unit}？`;
  if (form === 'quadrilateral') return `一个四边形的四条边长度分别是 ${sides[0]} ${unit}、${sides[1]} ${unit}、${sides[2]} ${unit}、${sides[3]} ${unit}，它的周长是多少${unit}？`;
  return `一个等腰三角形的两条腰长都是 ${sides[0]} ${unit}，底边长 ${sides[1]} ${unit}，它的周长是多少${unit}？`;
}

function perimeterAnswer(form: PerimeterForm, sides: number[]): number {
  if (form === 'equilateral') return sides[0] * 3;
  if (form === 'regular') return sides[0] * sides[1];
  if (form === 'isosceles') return sides[0] * 2 + sides[1];
  return sides.reduce((sum, side) => sum + side, 0);
}

function perimeterSteps(form: PerimeterForm, sides: number[], unit: string): string[] {
  const answer = perimeterAnswer(form, sides);
  if (form === 'equilateral') return [`${sides[0]} × 3 = ${answer}`];
  if (form === 'regular') return [`${sides[1]} × ${sides[0]} = ${answer}`];
  if (form === 'isosceles') return [`${sides[0]} × 2 + ${sides[1]} = ${answer}`];
  return [`${sides.join(' + ')} = ${answer}`];
  void unit;
}

export function generatePolygonPerimeter(input: QuestionGenerationInput): Question {
  const max = maxFor(input);
  const unit = (input.config.difficulty === 'advanced' || input.config.difficulty === 'challenge') && input.random() < .3 ? '米' : '厘米';
  const side = () => randomInt(2, Math.max(2, max), input.random);
  const form = pick(['triangle', 'equilateral', 'regular', 'quadrilateral', 'isosceles'] as const, input.random);
  let sides: number[];
  if (form === 'triangle') {
    const a = side(); const b = side();
    const cMin = Math.max(2, Math.abs(a - b) + 1);
    const cMax = Math.max(cMin, Math.min(max, a + b - 1));
    sides = [a, b, randomInt(cMin, cMax, input.random)];
  } else if (form === 'equilateral') {
    sides = [side()];
  } else if (form === 'regular') {
    sides = [pick([5, 6], input.random), side()];
  } else if (form === 'quadrilateral') {
    sides = [side(), side(), side(), side()];
  } else {
    const waist = side();
    const base = randomInt(2, Math.max(2, Math.min(max, waist * 2 - 1)), input.random);
    sides = [waist, base];
  }
  const answer = perimeterAnswer(form, sides);
  const canonicalSides = form === 'triangle' || form === 'quadrilateral'
    ? [...sides].sort((left, right) => left - right)
    : sides;
  const question: Question = {
    id: input.createId(), type: 'polygonPerimeter',
    text: perimeterText(form, sides, unit),
    answer, operands: sides, layout: 'word',
    signature: `polygonPerimeter:${form}:${unit}:${canonicalSides.join(',')}`,
    metadata: { form, unit },
    answerDetails: { display: `${answer} ${unit}`, unit, steps: perimeterSteps(form, sides, unit) }
  };
  return question;
}

function mismatch(question: Question): QuestionValidationResult {
  return { valid: false, errors: ['校验器题型不匹配：polygonPerimeter', `实际题型：${String(question?.type)}`] };
}

function validatePolygonPerimeterImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'polygonPerimeter') return mismatch(question);
  const errors: string[] = [];
  if (!Array.isArray(question.operands) || question.operands.some(value => !Number.isFinite(value) || value < 0)) errors.push('操作数无效');
  const difficulty = definition?.difficultyProfiles[config.difficulty] ?? definition?.difficultyProfiles.standard;
  if (Number.isFinite(difficulty?.max) && Array.isArray(question.operands) && question.operands.some(value => Math.abs(value) > Number(difficulty?.max))) errors.push('题目超过该题型难度上限');
  if (config.rangeMode === 'curriculum' && Array.isArray(question.operands) && question.operands.some(value => Math.abs(value) > CURRICULUM_MAXIMUMS[config.stage])) errors.push('题目超过当前学习阶段范围');
  if (!config.types.includes('polygonPerimeter')) errors.push('题型不在配置中');
  const form = question.metadata?.form;
  const unit = question.metadata?.unit;
  if (unit !== '厘米' && unit !== '米') errors.push('单位元数据错误');
  const sides = question.operands;
  const counts: Record<PerimeterForm, number> = { triangle: 3, equilateral: 1, regular: 2, quadrilateral: 4, isosceles: 2 };
  if (form === 'triangle' || form === 'equilateral' || form === 'regular' || form === 'quadrilateral' || form === 'isosceles') {
    if (!Array.isArray(sides) || sides.length !== counts[form] || sides.some(value => !Number.isInteger(value) || value < 2)) errors.push('边长结构无效');
    if (Array.isArray(sides) && sides.length === counts[form] && sides.every(value => Number.isInteger(value) && value >= 2)) {
      if (form === 'triangle' && !(sides[0] + sides[1] > sides[2] && sides[0] + sides[2] > sides[1] && sides[1] + sides[2] > sides[0])) errors.push('三角形边长关系无效');
      if (form === 'isosceles' && !(sides[0] * 2 > sides[1])) errors.push('等腰三角形边长关系无效');
      if (form === 'regular' && sides[0] !== 5 && sides[0] !== 6) errors.push('正多边形边数无效');
      const expected = perimeterAnswer(form, sides);
      if (question.answer !== expected) errors.push('周长答案错误');
      if ((unit === '厘米' || unit === '米') && question.text !== perimeterText(form, sides, unit)) errors.push('题面格式错误');
      if (question.answerDetails?.display !== `${expected} ${unit}` || question.answerDetails?.unit !== unit) errors.push('答案展示错误');
    }
  } else {
    errors.push('题型形式元数据错误');
  }
  if (STAGES.indexOf(config.stage) < STAGES.indexOf('grade3')) errors.push('题型不符合年级要求');
  return { valid: errors.length === 0, errors };
}

export const validatePolygonPerimeter: QuestionValidator = validatePolygonPerimeterImpl;
