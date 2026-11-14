import { getBinaryProfile } from './difficulty';
import { pickSymbolPair, symbolById } from './symbols';
import type { BinaryReasoningConfig, LinearEquation, ReasoningMethod, ReasoningProblem, VariableId } from './types';
import { validateReasoningProblem } from './validator';

export type RandomSource = () => number;
let idCounter = 0;

function integer(random: RandomSource, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

function chooseValues(random: RandomSource, max: number): { a: number; b: number } {
  const a = integer(random, 1, max);
  let b = integer(random, 1, max);
  if (b === a) b = b === max ? 1 : b + 1;
  return { a, b };
}

function equation(a: number, b: number, values: { a: number; b: number }): LinearEquation {
  return { a, b, total: a * values.a + b * values.b };
}

function shuffled<T>(input: readonly T[], random: RandomSource): T[] {
  const result = [...input];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function build(method: ReasoningMethod, config: BinaryReasoningConfig, random: RandomSource): ReasoningProblem {
  const profile = getBinaryProfile(config.difficulty, config.stage);
  const values = chooseValues(random, profile.maxValue);
  const symbols = pickSymbolPair(random);
  const aLabel = symbolById(symbols.a).label;
  const bLabel = symbolById(symbols.b).label;
  const maxCoefficient = Math.max(2, profile.maxCoefficient);
  let equations: LinearEquation[];
  let steps: string[];
  const ask: VariableId[] = ['a', 'b'];

  if (method === 'sameValue') {
    const repeated = integer(random, 2, maxCoefficient);
    equations = [equation(repeated, 0, values), equation(1, 1, values)];
    steps = [`${repeated} 个${aLabel}一共 ${equations[0].total}，所以 ${equations[0].total}÷${repeated}=${values.a}。`, `把${aLabel}=${values.a}放入第二式，${bLabel}=${equations[1].total}-${values.a}=${values.b}。`];
  } else if (method === 'substitution') {
    const bCoefficient = integer(random, 1, maxCoefficient);
    equations = [equation(1, 0, values), equation(1, bCoefficient, values)];
    steps = profile.maxSteps <= 2
      ? [`第一式已经告诉我们：${aLabel}=${values.a}。`, `代入第二式：(${equations[1].total}-${values.a})÷${bCoefficient}=${values.b}，所以${bLabel}=${values.b}。`]
      : [`第一式已经告诉我们：${aLabel}=${values.a}。`, `代入第二式，剩下 ${equations[1].total}-${values.a}=${bCoefficient * values.b}。`, `${bCoefficient * values.b}÷${bCoefficient}=${values.b}，所以${bLabel}=${values.b}。`];
  } else if (method === 'sumDifference') {
    const highVariable: VariableId = values.a > values.b ? 'a' : 'b';
    const lowVariable: VariableId = highVariable === 'a' ? 'b' : 'a';
    const high = values[highVariable];
    const low = values[lowVariable];
    equations = highVariable === 'a'
      ? [equation(1, 1, values), equation(1, -1, values)]
      : [equation(1, 1, values), equation(-1, 1, values)];
    const highLabel = highVariable === 'a' ? aLabel : bLabel;
    const lowLabel = lowVariable === 'a' ? aLabel : bLabel;
    steps = profile.maxSteps <= 2
      ? [`${highLabel}=(${high + low}+${high - low})÷2=${high}。`, `${lowLabel}=(${high + low}-${high - low})÷2=${low}。`]
      : [`和是 ${high + low}，差是 ${high - low}。`, `${highLabel}=(${high + low}+${high - low})÷2=${high}。`, `${lowLabel}=(${high + low}-${high - low})÷2=${low}。`];
  } else {
    const repeated = integer(random, 2, maxCoefficient);
    const bCoefficient = integer(random, 2, maxCoefficient);
    equations = [equation(repeated, 0, values), equation(1, bCoefficient, values)];
    steps = profile.maxSteps <= 2
      ? [`先看第一式：${equations[0].total}÷${repeated}=${values.a}，所以${aLabel}=${values.a}。`, `代入第二式：(${equations[1].total}-${values.a})÷${bCoefficient}=${values.b}，所以${bLabel}=${values.b}。`]
      : [`先看简单的第一式：${equations[0].total}÷${repeated}=${values.a}，所以${aLabel}=${values.a}。`, `把${aLabel}=${values.a}代入第二式，剩下 ${equations[1].total}-${values.a}=${bCoefficient * values.b}。`, `${bCoefficient * values.b}÷${bCoefficient}=${values.b}，所以${bLabel}=${values.b}。`, `验算：${values.a}+${bCoefficient}×${values.b}=${equations[1].total}。`].slice(0, profile.maxSteps);
  }

  const maxTotal = Math.max(...equations.map(item => item.total));
  const signature = `${method}|${symbols.a}:${symbols.b}|${equations.map(item => `${item.a},${item.b},${item.total}`).join('|')}`;
  return {
    id: `binary-${Date.now().toString(36)}-${++idCounter}`,
    method, symbols, values, equations, ask,
    answers: { a: values.a, b: values.b }, steps, signature,
    metrics: {
      maxValue: Math.max(values.a, values.b), maxTotal,
      equationCount: equations.length, reasoningSteps: steps.length,
      usesDifference: equations.some(item => item.a < 0 || item.b < 0)
    }
  };
}

export function generateReasoningProblem(method: ReasoningMethod, config: BinaryReasoningConfig, random: RandomSource = Math.random): ReasoningProblem {
  const profile = getBinaryProfile(config.difficulty, config.stage);
  for (let attempt = 0; attempt < 200; attempt++) {
    const candidate = build(method, config, random);
    if (candidate.metrics.maxTotal <= profile.maxTotal && validateReasoningProblem(candidate, profile).length === 0) return candidate;
  }
  throw new Error('暂时无法生成符合当前范围的二元推算题，请重试');
}

export function generateReasoningSet(config: BinaryReasoningConfig, random: RandomSource = Math.random): ReasoningProblem[] {
  if (!config.methods.length || config.count < 4 || config.count > 40) throw new Error('二元推算配置无效');
  const output: ReasoningProblem[] = [];
  const signatures = new Set<string>();
  let attempts = 0;
  while (output.length < config.count && attempts++ < config.count * 300) {
    const method = config.methods[output.length % config.methods.length];
    const item = generateReasoningProblem(method, config, random);
    if (!config.allowDuplicates && signatures.has(item.signature)) continue;
    if (config.allowDuplicates && output.at(-1)?.signature === item.signature) continue;
    signatures.add(item.signature);
    output.push(item);
  }
  if (output.length !== config.count) throw new Error('无法生成足够多且不重复的二元推算题，请重试');
  return config.randomMix ? shuffled(output, random) : output;
}
