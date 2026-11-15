import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import type { Question } from '../../domain/questions/model';
import type { WorksheetConfig } from '../../domain/worksheet/config';
import type { RandomSource } from '../../shared/random/seeded-random';

/**
 * Early number-sense additions filling the grade 1-3 taxonomy gaps:
 * odd/even numbers, "how many more/less" by 1/10/100/1000, RMB recognition
 * and unit conversion between yuan/jiao/fen, and shape pattern completion.
 * Self-contained in the same style as number-sense.ts.
 */

type EarlyNumberType = 'oddEven' | 'tenMoreLess' | 'moneySense' | 'shapePattern';

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
  type: EarlyNumberType,
  text: string,
  answer: number | string,
  operands: number[],
  options: Partial<Pick<Question, 'layout' | 'metadata' | 'answerDetails'>> & { signature?: string } = {}
): Question {
  const display = options.answerDetails?.display ?? String(answer);
  return {
    id: input.createId(), type, text, answer, operands,
    signature: options.signature ?? `${type}:${text}|${display}|${operands.join(',')}`,
    layout: options.layout ?? 'inline', metadata: options.metadata,
    answerDetails: { display, ...options.answerDetails }
  };
}

function mismatch(type: EarlyNumberType, question: Question): QuestionValidationResult {
  return { valid: false, errors: [`校验器题型不匹配：${type}`, `实际题型：${String(question?.type)}`] };
}

function commonErrors(question: Question, type: EarlyNumberType, config: WorksheetConfig, definition?: QuestionDefinition): string[] {
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

function result(question: Question, config: WorksheetConfig, definition: QuestionDefinition | undefined, type: EarlyNumberType, checks: string[]): QuestionValidationResult {
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

/* ---------------- oddEven 单双数 ---------------- */

const PARITY_LABEL = (value: number): '单数' | '双数' => (value % 2 === 0 ? '双数' : '单数');

export function generateOddEven(input: QuestionGenerationInput): Question {
  const max = maxFor(input);
  if (input.random() < .5) {
    const value = randomInt(1, max, input.random);
    const parity = PARITY_LABEL(value);
    return makeQuestion(input, 'oddEven', `${value} 是单数还是双数？`, parity, [value], {
      layout: 'wide', metadata: { form: 'judge', parity }, signature: `oddEven:judge:${value}`
    });
  }
  const target: '单数' | '双数' = input.random() < .5 ? '单数' : '双数';
  const targetCount = randomInt(2, 3, input.random);
  const pool = shuffle(Array.from({ length: max }, (_, index) => index + 1), input.random);
  const targets = pool.filter(value => PARITY_LABEL(value) === target).slice(0, targetCount);
  const others = pool.filter(value => PARITY_LABEL(value) !== target).slice(0, 4 - targets.length);
  const options = shuffle([...targets, ...others], input.random);
  const answer = options.filter(value => PARITY_LABEL(value) === target).join('，');
  const sortedOptions = [...options].sort((left, right) => left - right);
  return makeQuestion(input, 'oddEven', `圈出下面的${target}：${options.join('　')}`, answer, options, {
    layout: 'wide', metadata: { form: 'find', parity: target }, signature: `oddEven:find:${target}:${sortedOptions.join(',')}`
  });
}

function validateOddEvenImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'oddEven') return mismatch('oddEven', question);
  const errors: string[] = [];
  const form = question.metadata?.form;
  const parity = question.metadata?.parity;
  if (form === 'judge') {
    if (!validIntegerOperands(question, 1) || question.operands[0] < 1) errors.push('奇偶判断操作数无效');
    if (validIntegerOperands(question, 1)) {
      const [value] = question.operands;
      if (parity !== PARITY_LABEL(value) || question.answer !== PARITY_LABEL(value)) errors.push('奇偶判断答案错误');
      if (question.text !== `${value} 是单数还是双数？`) errors.push('题面格式错误');
    }
  } else if (form === 'find') {
    if (!validIntegerOperands(question, 4) || new Set(question.operands).size !== 4) errors.push('找数选项结构无效');
    if (parity !== '单数' && parity !== '双数') errors.push('奇偶目标元数据错误');
    if (validIntegerOperands(question, 4) && (parity === '单数' || parity === '双数')) {
      const targets = question.operands.filter(value => PARITY_LABEL(value) === parity);
      if (targets.length < 2 || targets.length > 3) errors.push('目标数量无效');
      if (question.answer !== targets.join('，')) errors.push('找数答案错误');
      if (question.text !== `圈出下面的${parity}：${question.operands.join('　')}`) errors.push('题面格式错误');
    }
  } else {
    errors.push('题型形式元数据错误');
  }
  return result(question, config, definition, 'oddEven', errors);
}

export const validateOddEven: QuestionValidator = gated('grade1', validateOddEvenImpl);

/* ---------------- tenMoreLess 多几与少几 ---------------- */

function allowedDeltas(max: number, difficulty: WorksheetConfig['difficulty']): number[] {
  const all = [1, 10, 100, 1000].filter(delta => delta <= max);
  const deltas = all.length > 0 ? all : [1];
  if (difficulty === 'entry') return deltas.slice(0, Math.min(2, deltas.length));
  if (difficulty === 'easy') return deltas.slice(0, Math.min(3, deltas.length));
  return deltas;
}

export function generateTenMoreLess(input: QuestionGenerationInput): Question {
  const max = maxFor(input);
  const delta = pick(allowedDeltas(max, input.config.difficulty), input.random);
  const more = input.random() < .5;
  const base = more ? randomInt(1, max, input.random) : randomInt(delta, Math.max(delta, max), input.random);
  const answer = more ? base + delta : base - delta;
  const direction = more ? '多' : '少';
  return makeQuestion(input, 'tenMoreLess', `比 ${base} ${direction} ${delta} 的数是 □。`, answer, [base, delta], {
    metadata: { delta, direction: more ? 'more' : 'less' }, signature: `tenMoreLess:${base}:${more ? '+' : '-'}${delta}`
  });
}

function validateTenMoreLessImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'tenMoreLess') return mismatch('tenMoreLess', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 2)) errors.push('多几少几操作数无效');
  if (validIntegerOperands(question, 2)) {
    const [base, delta] = question.operands;
    const direction = question.metadata?.direction;
    if (![1, 10, 100, 1000].includes(delta) || base < 1 || (direction !== 'more' && direction !== 'less')) errors.push('多几少几边界无效');
    if (direction === 'more' || direction === 'less') {
      const expected = direction === 'more' ? base + delta : base - delta;
      if (expected < 0 || question.answer !== expected) errors.push('多几少几答案错误');
      if (question.text !== `比 ${base} ${direction === 'more' ? '多' : '少'} ${delta} 的数是 □。`) errors.push('题面格式错误');
      if (question.metadata?.delta !== delta) errors.push('增量元数据错误');
    }
  }
  return result(question, config, definition, 'tenMoreLess', errors);
}

export const validateTenMoreLess: QuestionValidator = gated('grade1', validateTenMoreLessImpl);

/* ---------------- moneySense 认识人民币 ---------------- */

type MoneyForm = 'yuan-to-jiao' | 'jiao-to-fen' | 'yuan-jiao-to-jiao' | 'jiao-split' | 'yuan-to-fen';

function moneyForms(difficulty: WorksheetConfig['difficulty']): MoneyForm[] {
  switch (difficulty) {
    case 'entry': return ['yuan-to-jiao', 'jiao-to-fen'];
    case 'easy': return ['yuan-to-jiao', 'jiao-to-fen', 'yuan-jiao-to-jiao'];
    case 'standard': return ['yuan-to-jiao', 'jiao-to-fen', 'yuan-jiao-to-jiao', 'jiao-split'];
    default: return ['yuan-to-jiao', 'jiao-to-fen', 'yuan-jiao-to-jiao', 'jiao-split', 'yuan-to-fen'];
  }
}

export function generateMoneySense(input: QuestionGenerationInput): Question {
  const max = maxFor(input);
  const baseForms = moneyForms(input.config.difficulty);
  const directiveReverse = input.directive?.reverse;
  const candidateForms = directiveReverse === true && max >= 21 && baseForms.includes('jiao-split')
    ? (['jiao-split'] as const)
    : directiveReverse === false
      ? baseForms.filter(item => item !== 'jiao-split')
      : baseForms;
  const form = pick(candidateForms.length ? candidateForms : baseForms, input.random);
  if (form === 'yuan-jiao-to-jiao') {
    const yuan = randomInt(1, Math.max(1, Math.min(max, 50)), input.random);
    const jiao = randomInt(1, 9, input.random);
    return makeQuestion(input, 'moneySense', `${yuan} 元 ${jiao} 角 = □ 角`, yuan * 10 + jiao, [yuan, jiao], {
      metadata: { form }, signature: `moneySense:yj:${yuan}:${jiao}`
    });
  }
  if (form === 'jiao-split') {
    const cap = Math.min(99, max);
    if (cap < 21) {
      const yuan = randomInt(1, Math.max(1, Math.min(max, 100)), input.random);
      return makeQuestion(input, 'moneySense', `${yuan} 元 = □ 角`, yuan * 10, [yuan, 10], {
        metadata: { form: 'yuan-to-jiao' }, signature: `moneySense:yjiao:${yuan}`
      });
    }
    let total = randomInt(21, cap, input.random);
    if (total % 10 === 0) total -= 1;
    const answer = `${Math.floor(total / 10)} 元 ${total % 10} 角`;
    return makeQuestion(input, 'moneySense', `${total} 角 = □ 元 □ 角`, answer, [total], {
      metadata: { form }, signature: `moneySense:split:${total}`
    });
  }
  if (form === 'yuan-to-fen') {
    const yuan = randomInt(1, Math.max(1, Math.min(max, 20)), input.random);
    return makeQuestion(input, 'moneySense', `${yuan} 元 = □ 分`, yuan * 100, [yuan, 100], {
      metadata: { form }, signature: `moneySense:yfen:${yuan}`
    });
  }
  if (form === 'jiao-to-fen') {
    const jiao = randomInt(1, Math.max(1, Math.min(max, 99)), input.random);
    return makeQuestion(input, 'moneySense', `${jiao} 角 = □ 分`, jiao * 10, [jiao, 10], {
      metadata: { form }, signature: `moneySense:jfen:${jiao}`
    });
  }
  const yuan = randomInt(1, Math.max(1, Math.min(max, 100)), input.random);
  return makeQuestion(input, 'moneySense', `${yuan} 元 = □ 角`, yuan * 10, [yuan, 10], {
    metadata: { form: 'yuan-to-jiao' }, signature: `moneySense:yjiao:${yuan}`
  });
}

function validateMoneySenseImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'moneySense') return mismatch('moneySense', question);
  const errors: string[] = [];
  const form = question.metadata?.form;
  if (form === 'yuan-to-jiao' || form === 'jiao-to-fen' || form === 'yuan-to-fen') {
    if (!validIntegerOperands(question, 2)) errors.push('人民币换算操作数无效');
    if (validIntegerOperands(question, 2)) {
      const [value, factor] = question.operands;
      const [from, to] = form === 'yuan-to-jiao' ? ['元', '角'] : form === 'jiao-to-fen' ? ['角', '分'] : ['元', '分'];
      const expectedFactor = form === 'yuan-to-fen' ? 100 : 10;
      if (value < 1 || factor !== expectedFactor) errors.push('人民币换算边界无效');
      if (question.answer !== value * factor) errors.push('人民币换算答案错误');
      if (question.text !== `${value} ${from} = □ ${to}`) errors.push('题面格式错误');
    }
  } else if (form === 'yuan-jiao-to-jiao') {
    if (!validIntegerOperands(question, 2)) errors.push('人民币合成操作数无效');
    if (validIntegerOperands(question, 2)) {
      const [yuan, jiao] = question.operands;
      if (yuan < 1 || jiao < 1 || jiao > 9) errors.push('人民币合成边界无效');
      if (question.answer !== yuan * 10 + jiao) errors.push('人民币合成答案错误');
      if (question.text !== `${yuan} 元 ${jiao} 角 = □ 角`) errors.push('题面格式错误');
    }
  } else if (form === 'jiao-split') {
    if (!validIntegerOperands(question, 1)) errors.push('人民币拆分操作数无效');
    if (validIntegerOperands(question, 1)) {
      const [total] = question.operands;
      if (total < 11 || total % 10 === 0) errors.push('人民币拆分边界无效');
      if (question.answer !== `${Math.floor(total / 10)} 元 ${total % 10} 角`) errors.push('人民币拆分答案错误');
      if (question.text !== `${total} 角 = □ 元 □ 角`) errors.push('题面格式错误');
    }
  } else {
    errors.push('题型形式元数据错误');
  }
  return result(question, config, definition, 'moneySense', errors);
}

export const validateMoneySense: QuestionValidator = gated('grade1', validateMoneySenseImpl);

/* ---------------- shapePattern 图形找规律 ---------------- */

const GLYPHS: ReadonlyArray<{ glyph: string; name: string }> = [
  { glyph: '○', name: '圆形' },
  { glyph: '△', name: '三角形' },
  { glyph: '□', name: '正方形' },
  { glyph: '☆', name: '五角星' },
  { glyph: '♥', name: '爱心' },
  { glyph: '◆', name: '菱形' }
];
const PATTERN_TEMPLATES: readonly string[] = ['ABABAB', 'AABAAB', 'ABBABB', 'ABCABC', 'ABABABAB'];

function patternSequence(template: string, shapes: string): string[] {
  return [...template].map(letter => shapes['ABC'.indexOf(letter)]);
}

export function generateShapePattern(input: QuestionGenerationInput): Question {
  const templates = input.config.difficulty === 'entry' || input.config.difficulty === 'easy'
    ? PATTERN_TEMPLATES.slice(0, 4) : PATTERN_TEMPLATES;
  const templateIndex = randomInt(0, templates.length - 1, input.random);
  const template = templates[templateIndex];
  const shapeCount = template.includes('C') ? 3 : 2;
  const shapes = shuffle(GLYPHS.map(item => item.glyph), input.random).slice(0, shapeCount).join('');
  const sequence = patternSequence(template, shapes);
  const blankIndex = randomInt(1, sequence.length - 2, input.random);
  const blankGlyph = sequence[blankIndex];
  const answer = GLYPHS.find(item => item.glyph === blankGlyph)?.name ?? '';
  const shown = sequence.map((glyph, index) => (index === blankIndex ? '□' : glyph)).join('　');
  return makeQuestion(input, 'shapePattern', `找规律：${shown}，□ 处应该填什么图形？`, answer, [templateIndex, blankIndex], {
    layout: 'wide', metadata: { template, shapes, blankIndex },
    signature: `shapePattern:${template}:${shapes}:${blankIndex}`
  });
}

function validateShapePatternImpl(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  if (question?.type !== 'shapePattern') return mismatch('shapePattern', question);
  const errors: string[] = [];
  if (!validIntegerOperands(question, 2)) errors.push('图形规律操作数无效');
  const template = question.metadata?.template;
  const shapes = question.metadata?.shapes;
  const blankIndex = question.metadata?.blankIndex;
  if (typeof template !== 'string' || !PATTERN_TEMPLATES.includes(template)) errors.push('规律模板元数据错误');
  if (typeof shapes !== 'string' || [...shapes].some(glyph => !GLYPHS.some(item => item.glyph === glyph)) || new Set([...shapes]).size !== [...shapes].length) errors.push('规律图形元数据错误');
  if (typeof template === 'string' && typeof shapes === 'string' && Number.isInteger(blankIndex)) {
    const needed = template.includes('C') ? 3 : 2;
    if ([...shapes].length !== needed) errors.push('规律图形个数错误');
    const sequence = patternSequence(template, shapes);
    const blank = Number(blankIndex);
    if (blank < 1 || blank > sequence.length - 2) errors.push('空白位置无效');
    if (blank >= 0 && blank < sequence.length) {
      const expected = GLYPHS.find(item => item.glyph === sequence[blank])?.name;
      if (question.answer !== expected) errors.push('图形规律答案错误');
      const shown = sequence.map((glyph, index) => (index === blank ? '□' : glyph)).join('　');
      if (question.text !== `找规律：${shown}，□ 处应该填什么图形？`) errors.push('题面格式错误');
      if (question.operands[1] !== blank) errors.push('空白位置元数据不一致');
    }
  } else {
    errors.push('图形规律元数据无效');
  }
  return result(question, config, definition, 'shapePattern', errors);
}

export const validateShapePattern: QuestionValidator = gated('grade1', validateShapePatternImpl);

export type { EarlyNumberType };
