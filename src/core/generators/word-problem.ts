import { id, pick, randomInt } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';
import type { Difficulty, Question, Stage } from '../types';
import { sampleInt } from './tuning';

export type CoreSemantic = 'combine' | 'decrease' | 'unknown-start' | 'unknown-change' | 'difference';
export type MultiplicationSemantic = 'equal-groups' | 'sharing' | 'grouping';
export type Semantic = CoreSemantic | MultiplicationSemantic | 'groups-plus' | 'groups-minus' | 'add-then-subtract' | 'subtract-then-add' | 'three-step-change';
export interface WordEntity { name: string; unit: string; container: string; groupUnit: string; addVerb: string; removeVerb: string; }
export const WORD_ENTITIES: readonly WordEntity[] = [
  { name: '胡萝卜', unit: '根', container: '菜篮', groupUnit: '袋', addVerb: '放入', removeVerb: '取出' },
  { name: '彩色铅笔', unit: '支', container: '文具盒', groupUnit: '盒', addVerb: '放入', removeVerb: '用掉' },
  { name: '星星贴纸', unit: '张', container: '收纳册', groupUnit: '页', addVerb: '贴上', removeVerb: '取下' },
  { name: '课外书', unit: '本', container: '书架', groupUnit: '层', addVerb: '放上', removeVerb: '借出' },
  { name: '小花', unit: '朵', container: '花坛', groupUnit: '排', addVerb: '种下', removeVerb: '摘下' },
  { name: '玻璃球', unit: '个', container: '收纳盒', groupUnit: '盒', addVerb: '放入', removeVerb: '取出' }
];
interface Model { semantic: Semantic; entity: WordEntity; values: Record<string, number>; }
export interface RenderedTemplate { text: string; unit: string; }
type Template = (model: Model) => RenderedTemplate;
const templateSet = (make: (m: Model, index: number) => string): readonly Template[] => Array.from({ length: 8 }, (_, index) => m => ({ text: make(m, index), unit: m.entity.unit }));
const multiContexts: readonly ((m: Model) => string)[] = [m => `${m.entity.container}原有`, () => '活动开始有', () => '小明收集', () => '桌面上摆着', () => '老师准备', () => '仓库里存有', () => '第一天有', m => `${m.entity.container}里放着`];
const addThenSubtractTemplates = templateSet((m, i) => `${multiContexts[i](m)}${m.values.start}${m.entity.unit}${m.entity.name}，${m.entity.addVerb}${m.values.added}${m.entity.unit}${m.entity.name}后${m.entity.removeVerb}${m.values.removed}${m.entity.unit}${m.entity.name}。现在有多少${m.entity.unit}${m.entity.name}？`);
const subtractThenAddTemplates = templateSet((m, i) => `${multiContexts[i](m)}${m.values.start}${m.entity.unit}${m.entity.name}，先${m.entity.removeVerb}${m.values.removed}${m.entity.unit}${m.entity.name}，再${m.entity.addVerb}${m.values.added}${m.entity.unit}${m.entity.name}。现在有多少${m.entity.unit}${m.entity.name}？`);
const threeStepTemplates = templateSet((m, i) => `${multiContexts[i](m)}${m.values.start}${m.entity.unit}${m.entity.name}，${m.entity.addVerb}${m.values.first}${m.entity.unit}${m.entity.name}、${m.entity.removeVerb}${m.values.second}${m.entity.unit}${m.entity.name}、再${m.entity.addVerb}${m.values.third}${m.entity.unit}${m.entity.name}。现在有多少${m.entity.unit}${m.entity.name}？`);
const groupsPlusTemplates = templateSet((m, i) => [
  `${m.entity.container}里有${m.values.groups}组${m.entity.name}，每组${m.values.each}${m.entity.unit}，另有${m.values.extra}${m.entity.unit}${m.entity.name}。总共有多少${m.entity.unit}${m.entity.name}？`,
  `活动准备${m.values.groups}份${m.entity.name}，每份${m.values.each}${m.entity.unit}，再补充${m.values.extra}${m.entity.unit}${m.entity.name}。现在共有多少${m.entity.unit}${m.entity.name}？`,
  `小明整理${m.values.groups}组${m.entity.name}，每组${m.values.each}${m.entity.unit}，朋友又送来${m.values.extra}${m.entity.unit}${m.entity.name}。一共多少${m.entity.unit}${m.entity.name}？`,
  `桌面摆着${m.values.groups}排${m.entity.name}，每排${m.values.each}${m.entity.unit}，旁边还有${m.values.extra}${m.entity.unit}${m.entity.name}。合计多少${m.entity.unit}${m.entity.name}？`,
  `老师把${m.entity.name}装成${m.values.groups}份，每份${m.values.each}${m.entity.unit}，再放入${m.values.extra}${m.entity.unit}${m.entity.name}。共有多少${m.entity.unit}${m.entity.name}？`,
  `仓库中有${m.values.groups}组${m.entity.name}，每组${m.values.each}${m.entity.unit}，新到${m.values.extra}${m.entity.unit}${m.entity.name}。现在有多少${m.entity.unit}${m.entity.name}？`,
  `第一天收集${m.values.groups}组${m.entity.name}，每组${m.values.each}${m.entity.unit}，第二天收集${m.values.extra}${m.entity.unit}${m.entity.name}。共收集多少${m.entity.unit}${m.entity.name}？`,
  `${m.entity.container}里有${m.values.groups}份${m.entity.name}，每份${m.values.each}${m.entity.unit}，又放入${m.values.extra}${m.entity.unit}${m.entity.name}。一共有多少${m.entity.unit}${m.entity.name}？`
][i]);
const groupsMinusTemplates = templateSet((m, i) => [
  `${m.entity.container}里有${m.values.groups}组${m.entity.name}，每组${m.values.each}${m.entity.unit}，取出${m.values.removed}${m.entity.unit}${m.entity.name}后还剩多少${m.entity.unit}${m.entity.name}？`,
  `活动准备${m.values.groups}份${m.entity.name}，每份${m.values.each}${m.entity.unit}，用去${m.values.removed}${m.entity.unit}${m.entity.name}后还剩多少${m.entity.unit}${m.entity.name}？`,
  `小明整理${m.values.groups}组${m.entity.name}，每组${m.values.each}${m.entity.unit}，送出${m.values.removed}${m.entity.unit}${m.entity.name}后还剩多少${m.entity.unit}${m.entity.name}？`,
  `桌面摆着${m.values.groups}排${m.entity.name}，每排${m.values.each}${m.entity.unit}，拿走${m.values.removed}${m.entity.unit}${m.entity.name}后剩多少${m.entity.unit}${m.entity.name}？`,
  `老师把${m.entity.name}装成${m.values.groups}份，每份${m.values.each}${m.entity.unit}，分发${m.values.removed}${m.entity.unit}${m.entity.name}后还剩多少${m.entity.unit}${m.entity.name}？`,
  `仓库中有${m.values.groups}组${m.entity.name}，每组${m.values.each}${m.entity.unit}，运走${m.values.removed}${m.entity.unit}${m.entity.name}后还剩多少${m.entity.unit}${m.entity.name}？`,
  `第一天收集${m.values.groups}组${m.entity.name}，每组${m.values.each}${m.entity.unit}，其中取出${m.values.removed}${m.entity.unit}${m.entity.name}后剩多少${m.entity.unit}${m.entity.name}？`,
  `${m.entity.container}里有${m.values.groups}份${m.entity.name}，每份${m.values.each}${m.entity.unit}，后来少了${m.values.removed}${m.entity.unit}${m.entity.name}。现在有多少${m.entity.unit}${m.entity.name}？`
][i]);
const groupingTemplates: readonly Template[] = [
  m => ({ text: `有${m.values.total}${m.entity.unit}${m.entity.name}，每${m.values.each}${m.entity.unit}${m.entity.name}为一组，可以分成多少组？`, unit: '组' }),
  m => ({ text: `把${m.values.total}${m.entity.unit}${m.entity.name}按每${m.values.each}${m.entity.unit}分组，能分成多少组？`, unit: '组' }),
  m => ({ text: `${m.values.total}${m.entity.unit}${m.entity.name}，每${m.values.each}${m.entity.unit}一份，共有多少份？`, unit: '份' }),
  m => ({ text: `整理${m.values.total}${m.entity.unit}${m.entity.name}，每${m.values.each}${m.entity.unit}为一组，需要多少组？`, unit: '组' }),
  m => ({ text: `将${m.values.total}${m.entity.unit}${m.entity.name}平均按每${m.values.each}${m.entity.unit}分组，可分成多少组？`, unit: '组' }),
  m => ({ text: `${m.entity.container}有${m.values.total}${m.entity.unit}${m.entity.name}，每${m.values.each}${m.entity.unit}一组，共几组？`, unit: '组' }),
  m => ({ text: `活动物品共${m.values.total}${m.entity.unit}${m.entity.name}，每组${m.values.each}${m.entity.unit}，组成多少组？`, unit: '组' }),
  m => ({ text: `清点${m.values.total}${m.entity.unit}${m.entity.name}，按每${m.values.each}${m.entity.unit}分组，多少组？`, unit: '组' })
];

export const WORD_TEMPLATES: Record<Semantic, readonly Template[]> = {
  combine: templateSet((m, i) => [`${m.entity.container}里有${m.values.left}${m.entity.unit}${m.entity.name}，${m.entity.addVerb}${m.values.right}${m.entity.unit}${m.entity.name}。现在一共有多少${m.entity.unit}${m.entity.name}？`, `小明收集了${m.values.left}${m.entity.unit}${m.entity.name}，小红又送来${m.values.right}${m.entity.unit}${m.entity.name}。两人共有多少${m.entity.unit}${m.entity.name}？`, `${m.entity.container}原有${m.values.left}${m.entity.unit}${m.entity.name}，后来补进${m.values.right}${m.entity.unit}${m.entity.name}。现在有多少${m.entity.unit}${m.entity.name}？`, `第一${m.entity.groupUnit}有${m.values.left}${m.entity.unit}${m.entity.name}，第二${m.entity.groupUnit}有${m.values.right}${m.entity.unit}${m.entity.name}。合起来有多少${m.entity.unit}${m.entity.name}？`, `活动开始摆好${m.values.left}${m.entity.unit}${m.entity.name}，工作人员又${m.entity.addVerb}${m.values.right}${m.entity.unit}${m.entity.name}。共摆了多少${m.entity.unit}${m.entity.name}？`, `桌面上有${m.values.left}${m.entity.unit}${m.entity.name}，同学再${m.entity.addVerb}${m.values.right}${m.entity.unit}${m.entity.name}。现在有多少${m.entity.unit}${m.entity.name}？`, `上午准备${m.values.left}${m.entity.unit}${m.entity.name}，下午准备${m.values.right}${m.entity.unit}${m.entity.name}。全天准备了多少${m.entity.unit}${m.entity.name}？`, `${m.entity.container}装着${m.values.left}${m.entity.unit}${m.entity.name}，再${m.entity.addVerb}${m.values.right}${m.entity.unit}${m.entity.name}后共有多少${m.entity.unit}${m.entity.name}？`][i]),
  decrease: templateSet((m, i) => [`${m.entity.container}原来有${m.values.original}${m.entity.unit}${m.entity.name}，${m.entity.removeVerb}${m.values.removed}${m.entity.unit}${m.entity.name}。还剩多少${m.entity.unit}${m.entity.name}？`, `原有${m.values.original}${m.entity.unit}${m.entity.name}，${m.entity.removeVerb}${m.values.removed}${m.entity.unit}${m.entity.name}后还剩多少${m.entity.unit}${m.entity.name}？`, `小明有${m.values.original}${m.entity.unit}${m.entity.name}，送给朋友${m.values.removed}${m.entity.unit}${m.entity.name}。现在还有多少${m.entity.unit}${m.entity.name}？`, `${m.entity.container}有${m.values.original}${m.entity.unit}${m.entity.name}，取走${m.values.removed}${m.entity.unit}${m.entity.name}后还剩多少${m.entity.unit}${m.entity.name}？`, `准备了${m.values.original}${m.entity.unit}${m.entity.name}，分发${m.values.removed}${m.entity.unit}${m.entity.name}后还剩多少${m.entity.unit}${m.entity.name}？`, `摆好${m.values.original}${m.entity.unit}${m.entity.name}，活动中拿走${m.values.removed}${m.entity.unit}${m.entity.name}。还剩多少${m.entity.unit}${m.entity.name}？`, `收集到${m.values.original}${m.entity.unit}${m.entity.name}，其中${m.entity.removeVerb}${m.values.removed}${m.entity.unit}${m.entity.name}。还留下多少${m.entity.unit}${m.entity.name}？`, `${m.entity.container}放着${m.values.original}${m.entity.unit}${m.entity.name}，后来少了${m.values.removed}${m.entity.unit}${m.entity.name}。现在有多少${m.entity.unit}${m.entity.name}？`][i]),
  'unknown-start': templateSet((m, i) => [`${m.entity.removeVerb}${m.values.removed}${m.entity.unit}${m.entity.name}后还剩${m.values.remaining}${m.entity.unit}${m.entity.name}。原来有多少${m.entity.unit}${m.entity.name}？`, `${m.entity.removeVerb}${m.values.removed}${m.entity.unit}${m.entity.name}后手里还剩${m.values.remaining}${m.entity.unit}${m.entity.name}。开始时有多少${m.entity.unit}${m.entity.name}？`, `${m.entity.removeVerb}${m.values.removed}${m.entity.unit}${m.entity.name}后${m.entity.container}还剩${m.values.remaining}${m.entity.unit}${m.entity.name}。原来有多少${m.entity.unit}${m.entity.name}？`, `送出${m.values.removed}${m.entity.unit}${m.entity.name}后还余${m.values.remaining}${m.entity.unit}${m.entity.name}。原来准备多少${m.entity.unit}${m.entity.name}？`, `${m.entity.removeVerb}${m.values.removed}${m.entity.unit}${m.entity.name}后${m.entity.container}还有${m.values.remaining}${m.entity.unit}${m.entity.name}。原来有多少${m.entity.unit}${m.entity.name}？`, `分发${m.values.removed}${m.entity.unit}${m.entity.name}后桌上还剩${m.values.remaining}${m.entity.unit}${m.entity.name}。开始有多少${m.entity.unit}${m.entity.name}？`, `拿走${m.values.removed}${m.entity.unit}${m.entity.name}后${m.entity.container}还有${m.values.remaining}${m.entity.unit}${m.entity.name}。原来有多少${m.entity.unit}${m.entity.name}？`, `送给朋友${m.values.removed}${m.entity.unit}${m.entity.name}后还剩${m.values.remaining}${m.entity.unit}${m.entity.name}。原来有多少${m.entity.unit}${m.entity.name}？`][i]),
  'unknown-change': templateSet((m, i) => [`原来有${m.values.original}${m.entity.unit}${m.entity.name}，后来有${m.values.final}${m.entity.unit}${m.entity.name}。增加多少${m.entity.unit}${m.entity.name}？`, `${m.entity.container}原有${m.values.original}${m.entity.unit}${m.entity.name}，补充后有${m.values.final}${m.entity.unit}${m.entity.name}。增加多少${m.entity.unit}${m.entity.name}？`, `小明收集了${m.values.original}${m.entity.unit}${m.entity.name}，后来共有${m.values.final}${m.entity.unit}${m.entity.name}。新收集多少${m.entity.unit}${m.entity.name}？`, `${m.entity.container}原来有${m.values.original}${m.entity.unit}${m.entity.name}，放入一些后有${m.values.final}${m.entity.unit}${m.entity.name}。放入多少${m.entity.unit}${m.entity.name}？`, `原有${m.values.original}${m.entity.unit}${m.entity.name}，添置后变成${m.values.final}${m.entity.unit}${m.entity.name}。添置多少${m.entity.unit}${m.entity.name}？`, `${m.entity.container}中原有${m.values.original}${m.entity.unit}${m.entity.name}，现在有${m.values.final}${m.entity.unit}${m.entity.name}。后来放入多少${m.entity.unit}${m.entity.name}？`, `班级有${m.values.original}${m.entity.unit}${m.entity.name}，领取后共有${m.values.final}${m.entity.unit}${m.entity.name}。领取多少${m.entity.unit}${m.entity.name}？`, `${m.entity.container}有${m.values.original}${m.entity.unit}${m.entity.name}，补进一些后有${m.values.final}${m.entity.unit}${m.entity.name}。补进多少${m.entity.unit}${m.entity.name}？`][i]),
  difference: templateSet((m, i) => [`一组有${m.values.larger}${m.entity.unit}${m.entity.name}，另一组有${m.values.smaller}${m.entity.unit}${m.entity.name}。第一组多多少${m.entity.unit}${m.entity.name}？`, `小明有${m.values.larger}${m.entity.unit}${m.entity.name}，小红有${m.values.smaller}${m.entity.unit}${m.entity.name}。小明多多少${m.entity.unit}${m.entity.name}？`, `甲处有${m.values.larger}${m.entity.unit}${m.entity.name}，乙处有${m.values.smaller}${m.entity.unit}${m.entity.name}。甲处多多少${m.entity.unit}${m.entity.name}？`, `大${m.entity.container}有${m.values.larger}${m.entity.unit}${m.entity.name}，小${m.entity.container}有${m.values.smaller}${m.entity.unit}${m.entity.name}。相差多少${m.entity.unit}${m.entity.name}？`, `一组收集${m.values.larger}${m.entity.unit}${m.entity.name}，另一组收集${m.values.smaller}${m.entity.unit}${m.entity.name}。前一组多多少${m.entity.unit}${m.entity.name}？`, `周一收集${m.values.larger}${m.entity.unit}${m.entity.name}，周二收集${m.values.smaller}${m.entity.unit}${m.entity.name}。周一多多少${m.entity.unit}${m.entity.name}？`, `一边摆着${m.values.larger}${m.entity.unit}${m.entity.name}，另一边摆着${m.values.smaller}${m.entity.unit}${m.entity.name}。相差多少${m.entity.unit}${m.entity.name}？`, `甲组有${m.values.larger}${m.entity.unit}${m.entity.name}，乙组有${m.values.smaller}${m.entity.unit}${m.entity.name}。甲组多多少${m.entity.unit}${m.entity.name}？`][i]),
  'equal-groups': templateSet((m, i) => [`${m.entity.container}里有${m.values.groups}组${m.entity.name}，每组${m.values.each}${m.entity.unit}。一共有多少${m.entity.unit}${m.entity.name}？`, `活动安排${m.values.groups}组${m.entity.name}，每组${m.values.each}${m.entity.unit}。一共有多少${m.entity.unit}${m.entity.name}？`, `每${m.entity.groupUnit}放${m.values.each}${m.entity.unit}${m.entity.name}，装满${m.values.groups}${m.entity.groupUnit}共有多少${m.entity.unit}${m.entity.name}？`, `小组有${m.values.groups}组，每组分到${m.values.each}${m.entity.unit}${m.entity.name}。共分出多少${m.entity.unit}${m.entity.name}？`, `${m.values.groups}个相同的${m.entity.groupUnit}各有${m.values.each}${m.entity.unit}${m.entity.name}，合计多少${m.entity.unit}${m.entity.name}？`, `把${m.entity.name}按每组${m.values.each}${m.entity.unit}摆成${m.values.groups}组，共有多少${m.entity.unit}${m.entity.name}？`, `清点${m.values.groups}份${m.entity.name}，每份${m.values.each}${m.entity.unit}，总数是多少${m.entity.unit}${m.entity.name}？`, `${m.entity.container}里有${m.values.groups}组${m.entity.name}，每组${m.values.each}${m.entity.unit}，一共多少${m.entity.unit}${m.entity.name}？`][i]),
  sharing: templateSet((m, i) => [`把${m.values.total}${m.entity.unit}${m.entity.name}平均分成${m.values.groups}份，每份多少${m.entity.unit}${m.entity.name}？`, `将${m.values.total}${m.entity.unit}${m.entity.name}均匀放入${m.values.groups}个相同容器，每个多少${m.entity.unit}${m.entity.name}？`, `把收集的${m.values.total}${m.entity.unit}${m.entity.name}逐份分到${m.values.groups}组，每组多少${m.entity.unit}${m.entity.name}？`, `老师把${m.values.total}${m.entity.unit}${m.entity.name}分给${m.values.groups}组，每组多少${m.entity.unit}${m.entity.name}？`, `整理${m.values.total}${m.entity.unit}${m.entity.name}，分成${m.values.groups}份，每份多少${m.entity.unit}${m.entity.name}？`, `有${m.values.total}${m.entity.unit}${m.entity.name}，均匀分成${m.values.groups}份，每份多少${m.entity.unit}${m.entity.name}？`, `${m.values.total}${m.entity.unit}${m.entity.name}分成${m.values.groups}等份，一份多少${m.entity.unit}${m.entity.name}？`, `把收集的${m.values.total}${m.entity.unit}${m.entity.name}平均给${m.values.groups}组，每组多少${m.entity.unit}${m.entity.name}？`][i]),
  grouping: groupingTemplates,
  'add-then-subtract': addThenSubtractTemplates,
  'subtract-then-add': subtractThenAddTemplates,
  'three-step-change': threeStepTemplates,
  'groups-plus': groupsPlusTemplates,
  'groups-minus': groupsMinusTemplates
};

export function renderWordTemplate(semantic: Semantic, templateIndex: number, entityIndex: number, values: Record<string, number>): RenderedTemplate {
  const templates = WORD_TEMPLATES[semantic];
  const entity = Number.isInteger(entityIndex) && entityIndex >= 0 && entityIndex < WORD_ENTITIES.length ? WORD_ENTITIES[entityIndex] : undefined;
  const template = Number.isInteger(templateIndex) && templateIndex >= 0 && templateIndex < (templates?.length ?? 0) ? templates[templateIndex] : undefined;
  if (!entity || !template) throw new Error(`未知应用题模板 ${semantic}/${templateIndex}/${entityIndex}`);
  return template({ semantic, entity, values });
}

function makeWord(text: string, answer: number, unit: string, operands: number[], operators: string[], semantic: string, templateIndex: number, entity: WordEntity, random: RandomSource): Question {
  return { id: id(random), type: 'wordProblem', text, answer, operands, operators, signature: `word:${semantic}:${templateIndex}:${entity.name}:${operands.join(':')}:${operators.join('')}`, layout: 'word', metadata: { semantic, templateIndex, steps: operators.length, magnitude: Math.max(...operands, answer), unit }, answerDetails: { display: `${answer} ${unit}`, unit } };
}
function render(model: Model, answer: number, operands: number[], operators: string[], random: RandomSource): Question {
  const templates = WORD_TEMPLATES[model.semantic], index = randomInt(0, templates.length - 1, random), result = templates[index](model);
  return makeWord(result.text, answer, result.unit, operands, operators, model.semantic, index, model.entity, random);
}
function oneStep(max: number, allowMulDiv: boolean, maxFactor: number, highRangeRate: number, random: RandomSource): Question {
  const entity = pick(WORD_ENTITIES, random), semantics: Array<CoreSemantic | MultiplicationSemantic> = ['combine', 'decrease', 'unknown-start', 'unknown-change', 'difference'];
  if (allowMulDiv) semantics.push('equal-groups', 'sharing', 'grouping');
  const semantic = pick(semantics, random), limit = Math.max(2, max);
  if (semantic === 'combine') { const total = sampleInt(2, limit, highRangeRate, random), left = randomInt(1, total - 1, random); return render({ semantic, entity, values: { left, right: total - left } }, total, [left, total - left], ['+'], random); }
  if (semantic === 'decrease') { const original = sampleInt(2, limit, highRangeRate, random), removed = randomInt(1, original, random); return render({ semantic, entity, values: { original, removed } }, original - removed, [original, removed], ['-'], random); }
  if (semantic === 'unknown-start') { const original = sampleInt(2, limit, highRangeRate, random), removed = randomInt(1, original - 1, random); return render({ semantic, entity, values: { removed, remaining: original - removed } }, original, [original - removed, removed], ['+'], random); }
  if (semantic === 'unknown-change') { const final = sampleInt(2, limit, highRangeRate, random), original = randomInt(1, final - 1, random); return render({ semantic, entity, values: { original, final } }, final - original, [final, original], ['-'], random); }
  if (semantic === 'difference') { const larger = sampleInt(2, limit, highRangeRate, random), smaller = randomInt(1, larger - 1, random); return render({ semantic, entity, values: { larger, smaller } }, larger - smaller, [larger, smaller], ['-'], random); }
  const factorLimit = Math.max(2, Math.min(maxFactor, Math.floor(Math.sqrt(Math.max(4, limit))))), groups = randomInt(2, factorLimit, random), each = randomInt(2, factorLimit, random), total = groups * each;
  if (semantic === 'equal-groups') return render({ semantic, entity, values: { groups, each } }, total, [groups, each], ['×'], random);
  if (semantic === 'sharing') return render({ semantic, entity, values: { total, groups, each } }, each, [total, groups], ['÷'], random);
  return render({ semantic, entity, values: { total, each, groups } }, groups, [total, each], ['÷'], random);
}
function twoStep(max: number, allowMulDiv: boolean, maxFactor: number, highRangeRate: number, random: RandomSource): Question {
  const entity = pick(WORD_ENTITIES, random), limit = Math.max(3, max), start = sampleInt(3, Math.max(3, Math.floor(limit * .7)), highRangeRate, random);
  if (allowMulDiv && random() < .35) {
    const factorLimit = Math.max(2, Math.min(maxFactor, Math.floor(Math.sqrt(limit))));
    const groups = randomInt(2, factorLimit, random);
    const each = randomInt(2, factorLimit, random);
    const product = groups * each;
    if (product < max) {
      if (random() < .5) {
        const extra = randomInt(1, Math.max(1, max - product), random);
        return render({ semantic: 'groups-plus', entity, values: { groups, each, extra } }, product + extra, [groups, each, extra], ['×', '+'], random);
      }
      const removed = randomInt(1, product - 1, random);
      return render({ semantic: 'groups-minus', entity, values: { groups, each, removed } }, product - removed, [groups, each, removed], ['×', '-'], random);
    }
  }
  const addThenRemove = random() < .5;
  if (addThenRemove) {
    const added = randomInt(1, Math.max(1, limit - start), random);
    const removed = randomInt(1, start + added, random);
    const result = render({ semantic: 'add-then-subtract', entity, values: { start, added, removed } }, start + added - removed, [start, added, removed], ['+', '-'], random);
    return result;
  }
  const removed = randomInt(1, start - 1, random);
  const added = randomInt(1, Math.max(1, limit - (start - removed)), random);
  return render({ semantic: 'subtract-then-add', entity, values: { start, removed, added } }, start - removed + added, [start, removed, added], ['-', '+'], random);
}
function threeStep(max: number, highRangeRate: number, random: RandomSource): Question {
  const entity = pick(WORD_ENTITIES, random), limit = Math.max(4, max), start = sampleInt(4, Math.max(4, Math.floor(limit * .65)), highRangeRate, random), first = randomInt(1, Math.max(1, limit - start), random), second = randomInt(1, Math.max(1, start + first - 1), random), third = randomInt(1, Math.max(1, limit - start - first + second), random);
  return render({ semantic: 'three-step-change', entity, values: { start, first, second, third } }, start + first - second + third, [start, first, second, third], ['+', '-', '+'], random);
}
export function generateWordProblem(max: number, steps: number, difficulty: Difficulty = 'standard', stage: Stage = 'grade1', maxFactor = 9, highRangeRate = .5, random: RandomSource = Math.random): Question {
  const allowMulDiv = !['preschool', 'grade1'].includes(stage);
  if (steps >= 3 && random() < .65) return threeStep(max, highRangeRate, random);
  if (steps >= 2 && random() < .8) return twoStep(max, allowMulDiv, maxFactor, highRangeRate, random);
  return oneStep(max, allowMulDiv && difficulty !== 'entry', maxFactor, highRangeRate, random);
}
