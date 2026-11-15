import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import { CURRICULUM_MAXIMUMS } from '../../domain/questions/difficulty';
import { Decimal } from '../../domain/math-core/decimal';
import type { Question, QuestionContent } from '../../domain/questions/model';
import type { Grade } from '../../domain/curriculum/types';
import type { WorksheetConfig } from '../../domain/worksheet/config';

type ApplicationType = 'wordProblem' | 'moneyCalculation' | 'priceQuantityTotal' | 'proportionalReasoning' | 'discount' | 'inverseProportion' | 'concentration' | 'budgetPlan';
const DIFFICULTIES = ['entry', 'easy', 'standard', 'advanced', 'challenge'] as const;
const GRADES: readonly Grade[] = ['preschool', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'];
const ALL = GRADES;
const G1 = GRADES.slice(1);
const G4 = GRADES.slice(4);
const G6 = ['grade6'] as const;
const MAX: Record<ApplicationType, number> = { wordProblem: 1000, moneyCalculation: 10000, priceQuantityTotal: 100000, proportionalReasoning: 100000, discount: 100000, inverseProportion: 10000, concentration: 10000, budgetPlan: 100000 };
const WORD_ENTITIES = [
  { name: '彩色铅笔', unit: '支', container: '文具盒', add: '放入', remove: '用掉' },
  { name: '星星贴纸', unit: '张', container: '收纳册', add: '贴上', remove: '取下' },
  { name: '课外书', unit: '本', container: '书架', add: '放上', remove: '借出' },
  { name: '小花', unit: '朵', container: '花坛', add: '种下', remove: '摘下' }
] as const;
export type WordSemantic = 'combine' | 'decrease' | 'unknown-start' | 'unknown-change' | 'difference' | 'equal-groups' | 'sharing' | 'grouping' | 'groups-plus' | 'groups-minus' | 'add-then-subtract' | 'subtract-then-add' | 'three-step-change';

const rank = (config: WorksheetConfig) => DIFFICULTIES.indexOf(config.difficulty);
const int = (min: number, max: number, random: QuestionGenerationInput['random']) => Math.floor(random() * (Math.floor(max) - Math.ceil(min) + 1)) + Math.ceil(min);
const choose = <T>(values: readonly T[], random: QuestionGenerationInput['random']) => values[int(0, values.length - 1, random)];
const capFor = (input: QuestionGenerationInput, type: ApplicationType) => Math.max(1, Math.min(input.profile.max, MAX[type], input.config.rangeMode === 'curriculum' ? CURRICULUM_MAXIMUMS[input.config.stage] : MAX[type]));
const scaled = (cents: number) => {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('金额必须是非负整数分');
  return Decimal.fromScaled(BigInt(cents), 2).toFixed(2);
};
const trimCurrency = (value: string) => value.replace(/\.00$/, '');
const same = (a: unknown, b: unknown): boolean => Object.is(a, b) || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => same(v, b[i]))) || (!!a && !!b && typeof a === 'object' && typeof b === 'object' && Object.keys(a as object).length === Object.keys(b as object).length && Object.keys(a as object).every(k => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])));

function make(input: QuestionGenerationInput, type: ApplicationType, text: string, answer: number | string, operands: number[], options: Partial<Pick<Question, 'layout' | 'operators' | 'metadata' | 'content' | 'answerDetails'>> = {}): Question {
  const display = options.answerDetails?.display ?? String(answer);
  return { id: input.createId(), type, text, answer, operands, operators: options.operators, signature: `${type}:${text}|${display}|${operands.join(',')}`, layout: options.layout ?? 'word', metadata: options.metadata, content: options.content, answerDetails: { display, ...options.answerDetails } };
}

const wordText = (semantic: WordSemantic, i: number, e: typeof WORD_ENTITIES[number], v: number[]): string => {
  if (!isWordSemantic(semantic) || !Number.isInteger(i) || i < 0 || i > 7 || !e || !Array.isArray(v)) return '';
  const [a, b, c, d] = v;
  const templates: Record<WordSemantic, readonly string[]> = {
    combine: [`${e.container}里有${a}${e.unit}${e.name}，${e.add}${b}${e.unit}${e.name}。现在一共有多少${e.unit}${e.name}？`, `小明收集了${a}${e.unit}${e.name}，小红又送来${b}${e.unit}${e.name}。两人共有多少${e.unit}${e.name}？`],
    decrease: [`${e.container}原来有${a}${e.unit}${e.name}，${e.remove}${b}${e.unit}${e.name}。还剩多少${e.unit}${e.name}？`, `准备了${a}${e.unit}${e.name}，分发${b}${e.unit}${e.name}后还剩多少${e.unit}${e.name}？`],
    'unknown-start': [`${e.remove}${b}${e.unit}${e.name}后还剩${a}${e.unit}${e.name}。原来有多少${e.unit}${e.name}？`, `送出${b}${e.unit}${e.name}后还余${a}${e.unit}${e.name}。原来准备多少${e.unit}${e.name}？`],
    'unknown-change': [`原来有${a}${e.unit}${e.name}，后来有${b}${e.unit}${e.name}。增加多少${e.unit}${e.name}？`, `${e.container}原有${a}${e.unit}${e.name}，补充后有${b}${e.unit}${e.name}。增加多少${e.unit}${e.name}？`],
    difference: [`一组有${a}${e.unit}${e.name}，另一组有${b}${e.unit}${e.name}。相差多少${e.unit}${e.name}？`, `小明有${a}${e.unit}${e.name}，小红有${b}${e.unit}${e.name}。小明多多少${e.unit}${e.name}？`],
    'equal-groups': [`${e.container}里有${a}组${e.name}，每组${b}${e.unit}。一共有多少${e.unit}${e.name}？`, `活动安排${a}组${e.name}，每组${b}${e.unit}。一共有多少${e.unit}${e.name}？`],
    sharing: [`把${a}${e.unit}${e.name}平均分成${b}份，每份多少${e.unit}${e.name}？`, `老师把${a}${e.unit}${e.name}分给${b}组，每组多少${e.unit}${e.name}？`],
    grouping: [`有${a}${e.unit}${e.name}，每${b}${e.unit}${e.name}为一组，可以分成多少组？`, `整理${a}${e.unit}${e.name}，每${b}${e.unit}为一组，需要多少组？`],
    'groups-plus': [`${e.container}里有${a}组${e.name}，每组${b}${e.unit}，另有${c}${e.unit}${e.name}。总共有多少${e.unit}${e.name}？`, `活动准备${a}份${e.name}，每份${b}${e.unit}，再补充${c}${e.unit}${e.name}。现在共有多少${e.unit}${e.name}？`],
    'groups-minus': [`${e.container}里有${a}组${e.name}，每组${b}${e.unit}，取出${c}${e.unit}${e.name}后还剩多少${e.unit}${e.name}？`, `活动准备${a}份${e.name}，每份${b}${e.unit}，用去${c}${e.unit}${e.name}后还剩多少${e.unit}${e.name}？`],
    'add-then-subtract': [`${e.container}原有${a}${e.unit}${e.name}，${e.add}${b}${e.unit}${e.name}后${e.remove}${c}${e.unit}${e.name}。现在有多少${e.unit}${e.name}？`, `活动开始有${a}${e.unit}${e.name}，先增加${b}${e.unit}，再减少${c}${e.unit}。现在有多少${e.unit}${e.name}？`],
    'subtract-then-add': [`${e.container}原有${a}${e.unit}${e.name}，先${e.remove}${b}${e.unit}${e.name}，再${e.add}${c}${e.unit}${e.name}。现在有多少${e.unit}${e.name}？`, `活动开始有${a}${e.unit}${e.name}，先减少${b}${e.unit}，再增加${c}${e.unit}。现在有多少${e.unit}${e.name}？`],
    'three-step-change': [`${e.container}原有${a}${e.unit}${e.name}，${e.add}${b}${e.unit}${e.name}、${e.remove}${c}${e.unit}${e.name}、再${e.add}${d}${e.unit}${e.name}。现在有多少${e.unit}${e.name}？`, `活动开始有${a}${e.unit}${e.name}，先增加${b}${e.unit}${e.name}，再减少${c}${e.unit}${e.name}，最后增加${d}${e.unit}${e.name}。现在有多少${e.unit}${e.name}？`]
  };
  const extras: Record<WordSemantic, readonly string[]> = {
    combine: [`${e.container}原有${a}${e.unit}${e.name}，后来又有${b}${e.unit}${e.name}。合计多少${e.unit}${e.name}？`, `上午有${a}${e.unit}${e.name}，下午增加${b}${e.unit}${e.name}。现在共有多少${e.unit}${e.name}？`, `桌面上摆着${a}${e.unit}${e.name}，老师再${e.add}${b}${e.unit}${e.name}。一共有多少${e.unit}${e.name}？`, `第一组有${a}${e.unit}${e.name}，第二组有${b}${e.unit}${e.name}。两组共有多少${e.unit}${e.name}？`, `小朋友有${a}${e.unit}${e.name}，又得到${b}${e.unit}${e.name}。现在有多少${e.unit}${e.name}？`, `篮子里放着${a}${e.unit}${e.name}，再放入${b}${e.unit}${e.name}。共多少${e.unit}${e.name}？`],
    decrease: [`${e.container}里有${a}${e.unit}${e.name}，后来${e.remove}${b}${e.unit}${e.name}。还剩多少${e.unit}${e.name}？`, `小明收集${a}${e.unit}${e.name}，送出${b}${e.unit}${e.name}后还有多少${e.unit}${e.name}？`, `原有${a}${e.unit}${e.name}，用去${b}${e.unit}${e.name}。还剩多少${e.unit}${e.name}？`, `活动准备${a}${e.unit}${e.name}，拿走${b}${e.unit}${e.name}。还剩多少${e.unit}${e.name}？`, `书架上有${a}${e.unit}${e.name}，借出${b}${e.unit}${e.name}。还剩多少${e.unit}${e.name}？`, `花坛里有${a}${e.unit}${e.name}，摘下${b}${e.unit}${e.name}。还剩多少${e.unit}${e.name}？`],
    'unknown-start': [`还剩${a}${e.unit}${e.name}，取走了${b}${e.unit}${e.name}。原来有多少${e.unit}${e.name}？`, `用掉${b}${e.unit}${e.name}后剩${a}${e.unit}${e.name}。原来准备多少${e.unit}${e.name}？`, `借出${b}${e.unit}${e.name}后书架还剩${a}${e.unit}${e.name}。原来有多少${e.unit}${e.name}？`, `送出${b}${e.unit}${e.name}后还余${a}${e.unit}${e.name}。开始有多少${e.unit}${e.name}？`, `摘下${b}${e.unit}${e.name}后花坛还有${a}${e.unit}${e.name}。原来有多少${e.unit}${e.name}？`, `拿走${b}${e.unit}${e.name}后还剩${a}${e.unit}${e.name}。最初有多少${e.unit}${e.name}？`],
    'unknown-change': [`原来有${a}${e.unit}${e.name}，增加后有${b}${e.unit}${e.name}。增加多少${e.unit}${e.name}？`, `已有${a}${e.unit}${e.name}，补充后变成${b}${e.unit}${e.name}。补充多少${e.unit}${e.name}？`, `${e.container}原有${a}${e.unit}${e.name}，现在有${b}${e.unit}${e.name}。后来增加多少${e.unit}${e.name}？`, `小明原有${a}${e.unit}${e.name}，得到一些后有${b}${e.unit}${e.name}。得到多少${e.unit}${e.name}？`, `花坛原来有${a}${e.unit}${e.name}，种下后有${b}${e.unit}${e.name}。种下多少${e.unit}${e.name}？`, `书架有${a}${e.unit}${e.name}，放入一些后有${b}${e.unit}${e.name}。放入多少${e.unit}${e.name}？`],
    difference: [`甲组有${a}${e.unit}${e.name}，乙组有${b}${e.unit}${e.name}。甲组多多少${e.unit}${e.name}？`, `一边有${a}${e.unit}${e.name}，另一边有${b}${e.unit}${e.name}。相差多少${e.unit}${e.name}？`, `周一收集${a}${e.unit}${e.name}，周二收集${b}${e.unit}${e.name}。多多少${e.unit}${e.name}？`, `大盒有${a}${e.unit}${e.name}，小盒有${b}${e.unit}${e.name}。相差多少${e.unit}${e.name}？`, `第一排有${a}${e.unit}${e.name}，第二排有${b}${e.unit}${e.name}。第一排多多少${e.unit}${e.name}？`, `哥哥有${a}${e.unit}${e.name}，弟弟有${b}${e.unit}${e.name}。哥哥多多少${e.unit}${e.name}？`],
    'equal-groups': [`${a}组${e.name}，每组${b}${e.unit}，一共有多少${e.unit}${e.name}？`, `每份${b}${e.unit}${e.name}，有${a}份，合计多少${e.unit}${e.name}？`, `${a}个相同小组各有${b}${e.unit}${e.name}，总数是多少？`, `把${e.name}分成${a}组，每组${b}${e.unit}。一共有多少${e.unit}${e.name}？`, `老师准备${a}份材料，每份${b}${e.unit}${e.name}。共有多少${e.unit}${e.name}？`, `有${a}排${e.name}，每排${b}${e.unit}。合计多少${e.unit}${e.name}？`],
    sharing: [`${a}${e.unit}${e.name}平均分给${b}组，每组多少${e.unit}${e.name}？`, `有${a}${e.unit}${e.name}，平均装入${b}个盒子，每盒多少${e.unit}${e.name}？`, `把${a}${e.unit}${e.name}分成${b}等份，一份多少${e.unit}${e.name}？`, `老师把${a}${e.unit}${e.name}平均分给${b}名同学，每人多少${e.unit}${e.name}？`, `${a}${e.unit}${e.name}平均放入${b}个篮子，每篮多少${e.unit}${e.name}？`, `将${a}${e.unit}${e.name}均分为${b}份，每份多少${e.unit}${e.name}？`],
    grouping: [`${a}${e.unit}${e.name}按每组${b}${e.unit}分组，能分多少组？`, `有${a}${e.unit}${e.name}，每${b}${e.unit}装一盒，可以装多少盒？`, `把${a}${e.unit}${e.name}每${b}${e.unit}分一份，共多少份？`, `${a}${e.unit}${e.name}平均每${b}${e.unit}一组，可分成多少组？`, `整理${a}${e.unit}${e.name}，每袋${b}${e.unit}，需要多少袋？`, `收纳${a}${e.unit}${e.name}，每盒${b}${e.unit}，可装多少盒？`],
    'groups-plus': [`${a}组${e.name}每组${b}${e.unit}，又增加${c}${e.unit}${e.name}。一共有多少${e.unit}${e.name}？`, `有${a}份${e.name}，每份${b}${e.unit}，再添${c}${e.unit}${e.name}。合计多少${e.unit}${e.name}？`, `先准备${a}组${e.name}、每组${b}${e.unit}，朋友送来${c}${e.unit}${e.name}。总数多少${e.unit}${e.name}？`, `${a}排${e.name}每排${b}${e.unit}，旁边还有${c}${e.unit}${e.name}。共多少${e.unit}${e.name}？`, `仓库中${a}组${e.name}每组${b}${e.unit}，新到${c}${e.unit}${e.name}。现在多少${e.unit}${e.name}？`, `老师分好${a}份${e.name}、每份${b}${e.unit}，又放入${c}${e.unit}${e.name}。共有多少${e.unit}${e.name}？`],
    'groups-minus': [`${a}组${e.name}每组${b}${e.unit}，取出${c}${e.unit}${e.name}。还剩多少${e.unit}${e.name}？`, `有${a}份${e.name}、每份${b}${e.unit}，用掉${c}${e.unit}${e.name}。剩下多少${e.unit}${e.name}？`, `准备${a}组${e.name}每组${b}${e.unit}，送出${c}${e.unit}${e.name}。还剩多少${e.unit}${e.name}？`, `${a}排${e.name}每排${b}${e.unit}，拿走${c}${e.unit}${e.name}。剩多少${e.unit}${e.name}？`, `仓库${a}组${e.name}每组${b}${e.unit}，运走${c}${e.unit}${e.name}。余下多少${e.unit}${e.name}？`, `老师分好${a}份${e.name}、每份${b}${e.unit}，分发${c}${e.unit}${e.name}。还剩多少${e.unit}${e.name}？`],
    'add-then-subtract': [`原有${a}${e.unit}${e.name}，增加${b}${e.unit}${e.name}后用掉${c}${e.unit}${e.name}。现在有多少${e.unit}${e.name}？`, `先收集${a}${e.unit}${e.name}，再增加${b}${e.unit}${e.name}，然后取下${c}${e.unit}${e.name}。还剩多少${e.unit}${e.name}？`, `${e.container}有${a}${e.unit}${e.name}，放入${b}${e.unit}${e.name}后取出${c}${e.unit}${e.name}。现在有多少${e.unit}${e.name}？`, `活动有${a}${e.unit}${e.name}，补充${b}${e.unit}${e.name}，用去${c}${e.unit}${e.name}。剩下多少${e.unit}${e.name}？`, `书架有${a}${e.unit}${e.name}，放上${b}${e.unit}${e.name}，借出${c}${e.unit}${e.name}。还剩多少${e.unit}${e.name}？`, `花坛有${a}${e.unit}${e.name}，种下${b}${e.unit}${e.name}，摘下${c}${e.unit}${e.name}。还有多少${e.unit}${e.name}？`],
    'subtract-then-add': [`原有${a}${e.unit}${e.name}，先用掉${b}${e.unit}${e.name}，再补充${c}${e.unit}${e.name}。现在有多少${e.unit}${e.name}？`, `先取下${b}${e.unit}${e.name}，再放入${c}${e.unit}${e.name}，原有${a}${e.unit}${e.name}。剩下多少${e.unit}${e.name}？`, `${e.container}有${a}${e.unit}${e.name}，借出${b}${e.unit}${e.name}后放回${c}${e.unit}${e.name}。现在有多少${e.unit}${e.name}？`, `活动有${a}${e.unit}${e.name}，用去${b}${e.unit}${e.name}后补充${c}${e.unit}${e.name}。还剩多少${e.unit}${e.name}？`, `书架有${a}${e.unit}${e.name}，借出${b}${e.unit}${e.name}，又放上${c}${e.unit}${e.name}。现在有多少${e.unit}${e.name}？`, `花坛有${a}${e.unit}${e.name}，摘下${b}${e.unit}${e.name}后种下${c}${e.unit}${e.name}。还有多少${e.unit}${e.name}？`],
    'three-step-change': [`有${a}${e.unit}${e.name}，增加${b}${e.unit}${e.name}、减少${c}${e.unit}${e.name}、再增加${d}${e.unit}${e.name}。现在有多少${e.unit}${e.name}？`, `原有${a}${e.unit}${e.name}，先放入${b}${e.unit}${e.name}，取出${c}${e.unit}${e.name}，又放入${d}${e.unit}${e.name}。还剩多少${e.unit}${e.name}？`, `${e.container}有${a}${e.unit}${e.name}，增加${b}${e.unit}${e.name}后用掉${c}${e.unit}${e.name}，再补${d}${e.unit}${e.name}。现在有多少${e.unit}${e.name}？`, `活动开始有${a}${e.unit}${e.name}，得到${b}${e.unit}${e.name}，送出${c}${e.unit}${e.name}，又得到${d}${e.unit}${e.name}。共有多少${e.unit}${e.name}？`, `书架原有${a}${e.unit}${e.name}，放上${b}${e.unit}${e.name}，借出${c}${e.unit}${e.name}，再放上${d}${e.unit}${e.name}。现在有多少${e.unit}${e.name}？`, `花坛有${a}${e.unit}${e.name}，种下${b}${e.unit}${e.name}，摘下${c}${e.unit}${e.name}，又种下${d}${e.unit}${e.name}。还有多少${e.unit}${e.name}？`]
  };
  return [...templates[semantic], ...extras[semantic]][i % 8];
};
export const WORD_APPLICATION_SEMANTICS: readonly WordSemantic[] = ['combine', 'decrease', 'unknown-start', 'unknown-change', 'difference', 'equal-groups', 'sharing', 'grouping', 'groups-plus', 'groups-minus', 'add-then-subtract', 'subtract-then-add', 'three-step-change'];
export function renderWordApplicationTemplate(semantic: WordSemantic, templateIndex: number, values: number[], entityIndex = 0): string {
  const entity = WORD_ENTITIES[entityIndex];
  return entity ? wordText(semantic, templateIndex, entity, values) : '';
}
const wordSolve = (semantic: WordSemantic, o: number[]) => ({
  combine: o[0] + o[1], decrease: o[0] - o[1], 'unknown-start': o[0] + o[1], 'unknown-change': o[1] - o[0], difference: o[0] - o[1],
  'equal-groups': o[0] * o[1], sharing: o[0] / o[1], grouping: o[0] / o[1], 'groups-plus': o[0] * o[1] + o[2], 'groups-minus': o[0] * o[1] - o[2],
  'add-then-subtract': o[0] + o[1] - o[2], 'subtract-then-add': o[0] - o[1] + o[2], 'three-step-change': o[0] + o[1] - o[2] + o[3]
}[semantic]);
const wordOps: Record<WordSemantic, string[]> = { combine: ['+'], decrease: ['−'], 'unknown-start': ['+'], 'unknown-change': ['−'], difference: ['−'], 'equal-groups': ['×'], sharing: ['÷'], grouping: ['÷'], 'groups-plus': ['×', '+'], 'groups-minus': ['×', '−'], 'add-then-subtract': ['+', '−'], 'subtract-then-add': ['−', '+'], 'three-step-change': ['+', '−', '+'] };
const isWordSemantic = (value: unknown): value is WordSemantic => typeof value === 'string' && Object.prototype.hasOwnProperty.call(wordOps, value);
const wordOperandCount = (semantic: WordSemantic) => semantic === 'groups-plus' || semantic === 'groups-minus' || semantic === 'add-then-subtract' || semantic === 'subtract-then-add' ? 3 : semantic === 'three-step-change' ? 4 : 2;
const wordStep = (operands: number[], operators: readonly string[], answer: number) => `${operands.map((value, index) => index === 0 ? String(value) : `${operators[index - 1]} ${value}`).join(' ')} = ${answer}`;
const wordSemantics = (stage: Grade, steps: number): readonly WordSemantic[] => {
  const basic: WordSemantic[] = ['combine', 'decrease', 'unknown-start', 'unknown-change', 'difference'];
  if (stage === 'preschool' || stage === 'grade1') return basic;
  const groups: WordSemantic[] = [...basic, 'equal-groups', 'sharing', 'grouping'];
  if (steps < 2 || stage === 'grade2') return groups;
  return [...groups, 'groups-plus', 'groups-minus', 'add-then-subtract', 'subtract-then-add', ...(steps >= 3 ? ['three-step-change' as const] : [])];
};
/** Semantics that require reasoning backwards from a result to an unknown start/change. */
export const REVERSE_WORD_SEMANTICS: readonly WordSemantic[] = ['unknown-start', 'unknown-change', 'difference'];
/** Semantics that require two or more reasoning steps. */
export const MULTI_STEP_WORD_SEMANTICS: readonly WordSemantic[] = ['groups-plus', 'groups-minus', 'add-then-subtract', 'subtract-then-add', 'three-step-change'];
/**
 * Apply difficulty directives to the semantic pool. No directive means the
 * legacy uniform pool. reverse and steps compose: reverse filters the pool
 * first, then steps filters what remains; an empty intersection keeps the
 * previous pool, so reverse wins over steps (no reverse multi-step
 * semantics exist yet) and stage gating always wins over both.
 */
function selectWordSemantics(input: QuestionGenerationInput): readonly WordSemantic[] {
  let available = wordSemantics(input.config.stage, input.profile.wordSteps);
  const directive = input.directive;
  if (directive?.reverse === true) {
    const filtered = available.filter(semantic => REVERSE_WORD_SEMANTICS.includes(semantic));
    if (filtered.length) available = filtered;
  } else if (directive?.reverse === false) {
    const filtered = available.filter(semantic => !REVERSE_WORD_SEMANTICS.includes(semantic));
    if (filtered.length) available = filtered;
  }
  const steps = directive?.steps;
  if (typeof steps === 'number') {
    const filtered = steps <= 1
      ? available.filter(semantic => wordOps[semantic].length === 1)
      : steps === 2
        ? available.filter(semantic => wordOps[semantic].length === 2)
        : available.filter(semantic => wordOps[semantic].length >= 2);
    if (filtered.length) available = filtered;
  }
  return available;
}
export function generateWordProblem(input: QuestionGenerationInput): Question {
  const semantic = choose(selectWordSemantics(input), input.random); const entity = choose(WORD_ENTITIES, input.random); const templateIndex = int(0, 7, input.random); const cap = Math.max(2, capFor(input, 'wordProblem'));
  const baseCeiling = Math.max(2, Math.floor(Math.min(cap, Math.max(80, Math.floor(cap * .5))) * .6));
  const baseFloor = input.directive?.highRange ? Math.max(2, Math.floor(baseCeiling * .5)) : 2;
  const base = int(baseFloor, baseCeiling, input.random);
  let operands: number[]; let answer: number;
  if (semantic === 'combine' || semantic === 'decrease' || semantic === 'difference') { const b = int(1, Math.max(1, Math.min(base - 1, cap - base)), input.random); operands = semantic === 'combine' ? [base, b] : [base + b, b]; answer = wordSolve(semantic, operands) as number; }
  else if (semantic === 'unknown-start') { const removed = int(1, Math.max(1, Math.min(20, cap - base)), input.random); operands = [base, removed]; answer = base + removed; }
  else if (semantic === 'unknown-change') { const final = base + int(1, Math.max(1, Math.min(20, cap - base)), input.random); operands = [base, final]; answer = final - base; }
  else if (semantic === 'equal-groups') { const each = int(2, Math.min(input.profile.maxFactor, 9), input.random); const groups = int(2, Math.max(2, Math.min(10, Math.floor(cap / each))), input.random); operands = [groups, each]; answer = groups * each; }
  else if (semantic === 'sharing' || semantic === 'grouping') { const groups = int(2, Math.min(9, input.profile.maxFactor), input.random); const each = int(2, Math.max(2, Math.min(20, Math.floor(cap / groups))), input.random); operands = semantic === 'sharing' ? [groups * each, groups] : [groups * each, each]; answer = wordSolve(semantic, operands) as number; }
  else if (semantic === 'groups-plus' || semantic === 'groups-minus') {
    const productCap = semantic === 'groups-plus' ? Math.max(4, cap - 1) : Math.max(4, cap);
    const each = int(2, Math.max(2, Math.min(8, Math.floor(productCap / 2))), input.random);
    const groups = int(2, Math.max(2, Math.floor(productCap / each)), input.random);
    const product = groups * each;
    const extra = semantic === 'groups-minus'
      ? int(1, Math.max(1, product - 1), input.random)
      : int(1, Math.max(1, Math.min(12, cap - product)), input.random);
    operands = [groups, each, extra];
    answer = wordSolve(semantic, operands) as number;
  }
  else if (semantic === 'add-then-subtract') {
    const a = Math.max(2, Math.min(base, cap - 1));
    const b = int(1, Math.max(1, Math.min(10, cap - 1)), input.random);
    const cMin = Math.max(1, a + b - cap);
    const cMax = Math.max(cMin, a + b - 1);
    const c = int(cMin, cMax, input.random);
    operands = [a, b, c];
    answer = wordSolve(semantic, operands) as number;
  }
  else if (semantic === 'subtract-then-add') {
    const a = Math.max(2, Math.min(base, cap - 1));
    const b = int(1, Math.max(1, a - 1), input.random);
    const c = int(1, Math.max(1, Math.min(10, cap - (a - b))), input.random);
    operands = [a, b, c];
    answer = wordSolve(semantic, operands) as number;
  }
  else {
    const a = Math.max(2, Math.min(base, Math.max(2, cap - 2)));
    const b = int(1, Math.max(1, Math.min(8, cap - 1)), input.random);
    const d = int(1, Math.max(1, Math.min(8, Math.max(1, cap - 1))), input.random);
    const cMin = Math.max(1, a + b + d - cap);
    const cMax = Math.max(cMin, a + b - 1);
    const c = int(cMin, cMax, input.random);
    operands = [a, b, c, d];
    answer = wordSolve(semantic, operands) as number;
  }
  const text = wordText(semantic, templateIndex, entity, operands); const unit = entity.unit; return make(input, 'wordProblem', text, answer, operands, { operators: wordOps[semantic], metadata: { semantic, templateIndex, entity: entity.name, unit, steps: wordOps[semantic].length }, answerDetails: { display: `${answer} ${unit}`, unit, steps: [wordStep(operands, wordOps[semantic], answer)] } });
}
export function solveWordProblem(question: Question): number | undefined { const semantic = question.metadata?.semantic; if (!isWordSemantic(semantic) || !Array.isArray(question.operands) || question.operands.length !== wordOperandCount(semantic) || question.operands.some(value => !Number.isFinite(value) || !Number.isInteger(value) || value <= 0)) return undefined; const answer = wordSolve(semantic, question.operands) as number; return (semantic === 'sharing' || semantic === 'grouping') && (!Number.isInteger(answer) || answer <= 0) ? undefined : Number.isFinite(answer) && answer > 0 ? answer : undefined; }

function currencyQuestion(input: QuestionGenerationInput, type: 'moneyCalculation' | 'budgetPlan'): Question {
  const cap = Math.max(200, Math.min(capFor(input, type) * 100, 100000));
  if (type === 'moneyCalculation') { const price = int(100, cap - 100, input.random); const extra = int(100, Math.max(100, Math.min(1000, cap - price)), input.random); const paid = Math.min(cap, Math.ceil((price + extra) / 100) * 100); const change = paid - price; const text = `一件文具 ${scaled(price)} 元，付 ${scaled(paid)} 元，应找回多少元？`; return make(input, type, text, `${scaled(change)} 元`, [price, paid, change], { metadata: { unit: '元' }, answerDetails: { display: `${scaled(change)} 元`, unit: '元', steps: [`${scaled(paid)} - ${scaled(price)} = ${scaled(change)}（元）`] } }); }
  const a = int(100, cap, input.random), b = int(100, cap, input.random), c = int(100, cap, input.random); let d = int(100, cap, input.random); if (a + b === c + d) d = d + 100 <= cap ? d + 100 : Math.max(100, d - 100); const at = a + b, bt = c + d, diff = Math.abs(at - bt), cheaper = at < bt ? '方案A' : '方案B'; const text = `比较两种出行方案：方案A交通${scaled(a)}元、餐费${scaled(b)}元；方案B交通${scaled(c)}元、餐费${scaled(d)}元。哪种方案较便宜？比另一方案少多少元？`; return make(input, type, text, `${cheaper}，少${scaled(diff)} 元`, [a, b, c, d], { metadata: { unit: '元', cheaper }, answerDetails: { display: `${cheaper}，少${scaled(diff)} 元`, unit: '元', steps: [`方案A合计${scaled(at)}元，方案B合计${scaled(bt)}元`, `差额为${scaled(diff)}元`] } });
}
export const generateMoneyCalculation = (input: QuestionGenerationInput) => currencyQuestion(input, 'moneyCalculation');
export const generateBudgetPlan = (input: QuestionGenerationInput) => currencyQuestion(input, 'budgetPlan');
export function solveMoneyCalculation(question: Question): string | undefined { const o = question.operands; return Array.isArray(o) && o.length === 3 ? `${scaled(o[1] - o[0])} 元` : undefined; }
export function solveBudgetPlan(question: Question): string | undefined { const o = question.operands; if (!Array.isArray(o) || o.length !== 4) return undefined; const a = o[0] + o[1], b = o[2] + o[3]; return `${a < b ? '方案A' : '方案B'}，少${scaled(Math.abs(a - b))} 元`; }

export function generatePriceQuantityTotal(input: QuestionGenerationInput): Question { const price = int(3, 90, input.random); const quantity = int(2, 30, input.random); const answer = price * quantity; const text = `每本练习册 ${price} 元，买 ${quantity} 本一共需要多少元？`; return make(input, 'priceQuantityTotal', text, `${answer} 元`, [price, quantity], { metadata: { unit: '元' }, answerDetails: { display: `${answer} 元`, unit: '元', steps: [`${price} × ${quantity} = ${answer}（元）`] } }); }
export const solvePriceQuantityTotal = (q: Question) => Array.isArray(q.operands) && q.operands.length === 2 ? `${q.operands[0] * q.operands[1]} 元` : undefined;
export function generateProportionalReasoning(input: QuestionGenerationInput): Question { const unit = int(2, 20, input.random); const quantities = [1, 2, 3, int(4, 9, input.random)]; const values = quantities.map(q => q * unit); const blankIndex = 3; const content: QuestionContent = { kind: 'table', headers: ['数量', ...quantities.map(String)], rows: [['总价/元', ...values.map((v, i) => i === blankIndex ? '□' : v)]] }; return make(input, 'proportionalReasoning', '总价与数量成正比例，填写表格中的空格。', values[blankIndex], [...quantities, ...values], { layout: 'wide', metadata: { unit: '元', blankIndex }, content, answerDetails: { display: `${values[blankIndex]} 元`, unit: '元', steps: [`每份 ${unit} 元，${quantities[blankIndex]} × ${unit} = ${values[blankIndex]}（元）`] } }); }
export function solveProportionalReasoning(q: Question): number | undefined { return Array.isArray(q.operands) && q.operands.length === 8 ? q.operands[7] : undefined; }
export function generateDiscount(input: QuestionGenerationInput): Question { const original = int(5, 100, input.random) * 10; const rate = choose([50, 60, 70, 75, 80, 90], input.random); const cents = original * rate; const display = `${(cents / 100).toFixed(2).replace(/\.00$/, '')} 元`; const text = `一件商品原价 ${original} 元，按原价的 ${rate}% 出售，现价是多少元？`; return make(input, 'discount', text, display, [original, rate], { metadata: { unit: '元', rate }, answerDetails: { display, unit: '元', steps: [`${original} × ${rate}% = ${display}`] } }); }
export const solveDiscount = (q: Question) => Array.isArray(q.operands) && q.operands.length === 2 && q.operands.every(value => Number.isSafeInteger(value)) ? `${trimCurrency(Decimal.from(q.operands[0]).multiply(q.operands[1]).divide(100, 2).toFixed(2))} 元` : undefined;
export function generateInverseProportion(input: QuestionGenerationInput): Question { const first = int(2, 6, input.random); let people = int(2, 8, input.random); if (people === first) people = people === 8 ? 7 : people + 1; const baseDays = int(2, 5, input.random) * people; const product = first * baseDays; const answer = product / people; const content: QuestionContent = { kind: 'table', headers: ['人数', String(first), String(people)], rows: [['天数', String(baseDays), '□']] }; const text = `工作总量一定，${first}人需要${baseDays}天，若有${people}人需要多少天？`; return make(input, 'inverseProportion', text, answer, [first, baseDays, product, people], { layout: 'wide', metadata: { product, unit: '天' }, content, answerDetails: { display: `${answer} 天`, unit: '天', steps: [`${first} × ${baseDays} ÷ ${people} = ${answer}（天）`] } }); }
export const solveInverseProportion = (q: Question) => Array.isArray(q.operands) && q.operands.length === 4 && q.operands[3] ? q.operands[0] * q.operands[1] / q.operands[3] : undefined;
export function generateConcentration(input: QuestionGenerationInput): Question { const total = int(2, Math.max(2, 4 + rank(input.config) * 2), input.random) * 100; const salt = int(1, Math.max(2, 2 + rank(input.config)), input.random) * 10; const value = (salt * 100 / total).toFixed(2); const display = `${value}%`; const text = `盐水中含盐${salt}克，盐水总重${total}克，浓度是多少？（百分号前保留两位小数）`; return make(input, 'concentration', text, display, [salt, total], { metadata: { unit: '%', concentration: value }, answerDetails: { display, unit: '%', steps: [`${salt}÷${total}×100%=${value}%`] } }); }
export const solveConcentration = (q: Question) => Array.isArray(q.operands) && q.operands.length === 2 && q.operands[1] ? `${(q.operands[0] * 100 / q.operands[1]).toFixed(2)}%` : undefined;

function baseErrors(q: Question, config: WorksheetConfig, definition: QuestionDefinition | undefined, type: ApplicationType, count: number | readonly number[]): string[] { const e: string[] = []; if (!q || q.type !== type) return [`校验器题型不匹配：${type}`]; const counts = Array.isArray(count) ? count : [count]; const scale = type === 'moneyCalculation' || type === 'budgetPlan' ? 100 : 1; if (!Array.isArray(q.operands) || !counts.includes(q.operands.length) || q.operands.some(v => !Number.isFinite(v) || !Number.isInteger(v))) e.push('操作数结构无效'); if (definition && !definition.allowedGrades.includes(config.stage)) e.push('题型不符合年级要求'); const max = definition?.difficultyProfiles[config.difficulty]?.max ?? MAX[type]; if (Array.isArray(q.operands) && q.operands.some(v => Math.abs(v) > max * scale)) e.push('题目超过难度上限'); if (config.rangeMode === 'curriculum' && Array.isArray(q.operands) && q.operands.some(v => Math.abs(v) > CURRICULUM_MAXIMUMS[config.stage] * scale)) e.push('题目超过课程范围'); if (!config.types.includes(type)) e.push('题型不在配置中'); return e; }
const badShape = (q: Question, expected: { text: string; answer: number | string; display?: string; operands: number[]; metadata?: Record<string, string | number | boolean>; content?: QuestionContent; layout?: Question['layout']; unit?: string; operators?: string[]; steps?: string[] }) => { const keys = new Set(['id', 'type', 'text', 'answer', 'operands', 'operators', 'signature', 'layout', 'metadata', 'content', 'answerDetails']); const e: string[] = []; if (Object.keys(q).some(k => !keys.has(k))) e.push('题目顶层字段结构错误'); const display = expected.display ?? String(expected.answer); const details = { display, ...(expected.unit ? { unit: expected.unit } : {}), ...(expected.steps ? { steps: expected.steps } : {}) }; if (q.text !== expected.text || q.layout !== (expected.layout ?? 'word') || q.signature !== `${q.type}:${expected.text}|${display}|${expected.operands.join(',')}` || !same(q.metadata, expected.metadata) || !same(q.content, expected.content) || !same(q.answerDetails, details) || !same(q.operators, expected.operators)) e.push('题目结构与答案详情不一致'); return e; };
function finish(e: string[]): QuestionValidationResult { return { valid: e.length === 0, errors: e }; }
function validateWord(q: Question, c: WorksheetConfig, d?: QuestionDefinition): QuestionValidationResult { const e = baseErrors(q, c, d, 'wordProblem', [2, 3, 4]); if (e.some(x => x.startsWith('校验器题型不匹配')) || e.includes('操作数结构无效')) return finish(e); const semantic = q.metadata?.semantic; const entity = WORD_ENTITIES.find(x => x.name === q.metadata?.entity); const rawIndex = q.metadata?.templateIndex; const i = typeof rawIndex === 'number' ? rawIndex : Number.NaN; const ops = isWordSemantic(semantic) ? wordOps[semantic] : undefined; const expectedCount = isWordSemantic(semantic) ? wordOperandCount(semantic) : -1; const answer = solveWordProblem(q); const resultCap = Math.min(d?.difficultyProfiles[c.difficulty]?.max ?? MAX.wordProblem, c.rangeMode === 'curriculum' ? CURRICULUM_MAXIMUMS[c.stage] : MAX.wordProblem); if ((typeof q.answer === 'number' && q.answer > CURRICULUM_MAXIMUMS[c.stage]) || (answer !== undefined && c.rangeMode === 'curriculum' && answer > CURRICULUM_MAXIMUMS[c.stage])) e.push('题目超过当前学习阶段范围'); if (!entity || !isWordSemantic(semantic) || !ops || q.operands.length !== expectedCount || q.operands.some(v => v <= 0) || !Number.isInteger(i) || i < 0 || i > 7 || q.metadata?.unit !== entity.unit || q.metadata?.steps !== ops.length || answer === undefined || answer <= 0 || answer > resultCap || q.answer !== answer || q.operators?.join('|') !== ops.join('|')) e.push('应用题数量关系或答案错误'); else e.push(...badShape(q, { text: wordText(semantic, i, entity, q.operands), answer, display: `${answer} ${entity.unit}`, operands: q.operands, operators: ops, metadata: { semantic, templateIndex: i, entity: entity.name, unit: entity.unit, steps: ops.length }, unit: entity.unit, steps: [wordStep(q.operands, ops, answer)] })); return finish(e); }
export const validateWordProblem: QuestionValidator = validateWord;
function simpleValidate(q: Question, c: WorksheetConfig, d: QuestionDefinition | undefined, type: ApplicationType, count: number, solver: (q: Question) => number | string | undefined, expected: (q: Question, answer: number | string) => Omit<Parameters<typeof badShape>[1], 'answer'> & { answer?: number | string }, semanticCheck: (q: Question) => boolean = x => x.operands.every(v => v > 0)): QuestionValidationResult { const e = baseErrors(q, c, d, type, count); if (e.some(x => x.startsWith('校验器题型不匹配')) || e.includes('操作数结构无效')) return finish(e); const answer = solver(q); if (answer === undefined || q.operands.some(v => v <= 0) || !semanticCheck(q) || q.answer !== answer) e.push('答案或数量关系错误'); else e.push(...badShape(q, { ...expected(q, answer), answer })); return finish(e); }
export const validateMoneyCalculation: QuestionValidator = (q, c, d) => simpleValidate(q, c, d, 'moneyCalculation', 3, solveMoneyCalculation, (x, answer) => ({ text: `一件文具 ${scaled(x.operands[0])} 元，付 ${scaled(x.operands[1])} 元，应找回多少元？`, operands: x.operands, metadata: { unit: '元' }, answer, unit: '元', steps: [`${scaled(x.operands[1])} - ${scaled(x.operands[0])} = ${scaled(x.operands[2])}（元）`] }), x => x.operands[1] > x.operands[0] && x.operands[2] === x.operands[1] - x.operands[0]);
export const validatePriceQuantityTotal: QuestionValidator = (q, c, d) => simpleValidate(q, c, d, 'priceQuantityTotal', 2, solvePriceQuantityTotal, (x, answer) => ({ text: `每本练习册 ${x.operands[0]} 元，买 ${x.operands[1]} 本一共需要多少元？`, operands: x.operands, metadata: { unit: '元' }, answer, unit: '元', display: `${x.operands[0] * x.operands[1]} 元`, steps: [`${x.operands[0]} × ${x.operands[1]} = ${x.operands[0] * x.operands[1]}（元）`] }), x => x.operands[0] <= 1000 && x.operands[1] <= 100);
export const validateProportionalReasoning: QuestionValidator = (q, c, d) => simpleValidate(q, c, d, 'proportionalReasoning', 8, solveProportionalReasoning, (x, answer) => { const qs = x.operands.slice(0, 4), vs = x.operands.slice(4), index = Number(x.metadata?.blankIndex), unit = Number(vs[0]) / Number(qs[0]); return { text: '总价与数量成正比例，填写表格中的空格。', operands: x.operands, metadata: { unit: '元', blankIndex: index }, content: { kind: 'table', headers: ['数量', ...qs.map(String)], rows: [['总价/元', ...vs.map((v, i) => i === index ? '□' : v)]] }, answer, display: `${answer} 元`, unit: '元', layout: 'wide', steps: [`每份 ${unit} 元，${qs[index]} × ${unit} = ${answer}（元）`] }; }, x => { const qs = x.operands.slice(0, 4), vs = x.operands.slice(4), index = x.metadata?.blankIndex; if (index !== 3 || qs.some(v => v <= 0) || vs.some(v => v <= 0)) return false; const unit = vs[0] / qs[0]; return Number.isInteger(unit) && vs.every((v, i) => v === qs[i] * unit) && x.answer === vs[index]; });
export const validateDiscount: QuestionValidator = (q, c, d) => simpleValidate(q, c, d, 'discount', 2, solveDiscount, (x, answer) => ({ text: `一件商品原价 ${x.operands[0]} 元，按原价的 ${x.operands[1]}% 出售，现价是多少元？`, operands: x.operands, metadata: { unit: '元', rate: x.operands[1] }, answer, unit: '元', steps: [`${x.operands[0]} × ${x.operands[1]}% = ${answer}`] }), x => [50, 60, 70, 75, 80, 90].includes(x.operands[1]));
export const validateInverseProportion: QuestionValidator = (q, c, d) => simpleValidate(q, c, d, 'inverseProportion', 4, solveInverseProportion, (x, answer) => ({ text: `工作总量一定，${x.operands[0]}人需要${x.operands[1]}天，若有${x.operands[3]}人需要多少天？`, operands: x.operands, metadata: { product: x.operands[2], unit: '天' }, content: { kind: 'table', headers: ['人数', String(x.operands[0]), String(x.operands[3])], rows: [['天数', String(x.operands[1]), '□']] }, answer, display: `${answer} 天`, unit: '天', layout: 'wide', steps: [`${x.operands[0]} × ${x.operands[1]} ÷ ${x.operands[3]} = ${answer}（天）`] }), x => x.operands[2] === x.operands[0] * x.operands[1] && x.operands[2] % x.operands[3] === 0);
export const validateConcentration: QuestionValidator = (q, c, d) => simpleValidate(q, c, d, 'concentration', 2, solveConcentration, (x, answer) => ({ text: `盐水中含盐${x.operands[0]}克，盐水总重${x.operands[1]}克，浓度是多少？（百分号前保留两位小数）`, operands: x.operands, metadata: { unit: '%', concentration: String(answer).slice(0, -1) }, answer, unit: '%', steps: [`${x.operands[0]}÷${x.operands[1]}×100%=${String(answer).slice(0, -1)}%`] }), x => x.operands[0] < x.operands[1]);
export const validateBudgetPlan: QuestionValidator = (q, c, d) => simpleValidate(q, c, d, 'budgetPlan', 4, solveBudgetPlan, (x, answer) => { const a = x.operands[0] + x.operands[1], b = x.operands[2] + x.operands[3]; const diff = scaled(Math.abs(a - b)); return { text: `比较两种出行方案：方案A交通${scaled(x.operands[0])}元、餐费${scaled(x.operands[1])}元；方案B交通${scaled(x.operands[2])}元、餐费${scaled(x.operands[3])}元。哪种方案较便宜？比另一方案少多少元？`, operands: x.operands, metadata: { unit: '元', cheaper: a < b ? '方案A' : '方案B' }, answer, unit: '元', steps: [`方案A合计${scaled(a)}元，方案B合计${scaled(b)}元`, `差额为${diff}元`] }; }, x => x.operands[0] + x.operands[1] !== x.operands[2] + x.operands[3]);

const REVERSE_RATE: Record<(typeof DIFFICULTIES)[number], number> = { entry: 0, easy: .1, standard: .25, advanced: .35, challenge: .45 };
const MULTI_STEP_RATE: Record<(typeof DIFFICULTIES)[number], number> = { entry: 0, easy: .1, standard: .3, advanced: .5, challenge: .55 };
const profile = (max: number, min = 1) => Object.fromEntries(DIFFICULTIES.map(d => [d, { max, minimumMax: min, terms: 2, carryRate: 0, highRangeRate: .5, wordSteps: d === 'challenge' ? 3 : d === 'advanced' ? 2 : 1, maxFactor: 9, trivialRate: .1, equalityRate: .2, mixedRate: .3, reverseRate: REVERSE_RATE[d], multiStepRate: MULTI_STEP_RATE[d] }])) as QuestionDefinition['difficultyProfiles'];
const wordDef = (id: ApplicationType, label: string, allowedGrades: readonly Grade[], renderKind: QuestionDefinition['renderKind'], footprint: QuestionDefinition['footprint'], generate: QuestionDefinition['generate'], validate: QuestionValidator, max: number, directives?: QuestionDefinition['directives']): QuestionDefinition => ({ id, label, description: `通过${label}练习建立数量关系模型并分步解决生活问题。`, group: 'fill-application', domain: 'integrated-practice', contentCategory: 'application', skills: [label, '建模列式', '单位意识', '问题解决'], allowedGrades, recommendedGrades: allowedGrades, difficulties: DIFFICULTIES, difficultyProfiles: profile(max), practice: 'standard', generate, validate, renderKind, footprint, ...(directives ? { directives } : {}) });
const WORD = { columns: 'full' as const, heightMm: { standard: 28, large: 31 }, preventBreakInside: true };
const TABLE = { columns: 'full' as const, heightMm: { standard: 31, large: 36 }, preventBreakInside: true };
export const APPLICATION_QUESTION_DEFINITIONS: readonly QuestionDefinition[] = [
  wordDef('wordProblem', '综合应用题', ALL, 'word', WORD, generateWordProblem, validateWordProblem, MAX.wordProblem, { reverse: true, multiStep: true }),
  wordDef('moneyCalculation', '人民币与找零', G1, 'word', WORD, generateMoneyCalculation, validateMoneyCalculation, MAX.moneyCalculation),
  wordDef('priceQuantityTotal', '单价、数量与总价', G4, 'word', WORD, generatePriceQuantityTotal, validatePriceQuantityTotal, MAX.priceQuantityTotal),
  wordDef('proportionalReasoning', '正比例关系', G6, 'table', TABLE, generateProportionalReasoning, validateProportionalReasoning, MAX.proportionalReasoning),
  wordDef('discount', '折扣与百分率应用', G6, 'word', WORD, generateDiscount, validateDiscount, MAX.discount),
  wordDef('inverseProportion', '反比例关系', G6, 'table', TABLE, generateInverseProportion, validateInverseProportion, MAX.inverseProportion),
  wordDef('concentration', '配比与浓度', G6, 'word', WORD, generateConcentration, validateConcentration, MAX.concentration),
  wordDef('budgetPlan', '预算与方案比较', G6, 'word', WORD, generateBudgetPlan, validateBudgetPlan, MAX.budgetPlan)
];
