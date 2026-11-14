import type { BinaryDifficultyProfile, ReasoningProblem } from './types';

export function solveReasoningProblem(problem: Pick<ReasoningProblem, 'equations'>): { a: number; b: number } | null {
  if (problem.equations.length < 2) return null;
  for (let left = 0; left < problem.equations.length - 1; left++) {
    for (let right = left + 1; right < problem.equations.length; right++) {
      const first = problem.equations[left];
      const second = problem.equations[right];
      const determinant = first.a * second.b - second.a * first.b;
      if (determinant === 0) continue;
      const a = (first.total * second.b - second.total * first.b) / determinant;
      const b = (first.a * second.total - second.a * first.total) / determinant;
      if (Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0) return { a, b };
      return null;
    }
  }
  return null;
}

export function validateReasoningProblem(problem: ReasoningProblem, profile: BinaryDifficultyProfile): string[] {
  const errors: string[] = [];
  if (problem.symbols.a === problem.symbols.b) errors.push('两个图形必须不同');
  if (problem.values.a === problem.values.b) errors.push('两个图形不能代表相同的数');
  if (!Number.isInteger(problem.values.a) || !Number.isInteger(problem.values.b) || problem.values.a < 0 || problem.values.b < 0) errors.push('答案必须是非负整数');
  if (problem.equations.length < 2) errors.push('至少需要两个等式');
  if (problem.equations.some(eq => ![eq.a, eq.b, eq.total].every(Number.isInteger) || eq.total < 0 || (eq.a === 0 && eq.b === 0))) errors.push('等式必须由整数构成');
  if (problem.method !== 'sumDifference' && problem.equations.some(eq => eq.a < 0 || eq.b < 0)) errors.push('只有和差推算可以使用减法关系');
  if (problem.equations.some(eq => eq.a * problem.values.a + eq.b * problem.values.b !== eq.total)) errors.push('题面等式与设定值不一致');
  const solved = solveReasoningProblem(problem);
  if (!solved) {
    const determinantExists = problem.equations.some((first, index) => problem.equations.slice(index + 1).some(second => first.a * second.b - second.a * first.b !== 0));
    errors.push(determinantExists ? '答案必须是非负整数' : '等式不能唯一确定两个图形');
  } else {
    if (solved.a !== problem.values.a || solved.b !== problem.values.b) errors.push('独立求解结果与设定值不一致');
    for (const variable of problem.ask) if (problem.answers[variable] !== solved[variable]) errors.push('标准答案与独立求解结果不一致');
  }
  if (!problem.ask.length) errors.push('至少需要询问一个图形');
  const actualMaxValue = Math.max(problem.values.a, problem.values.b);
  const actualMaxTotal = Math.max(0, ...problem.equations.map(item => Math.abs(item.total)));
  const actualMaxCoefficient = Math.max(0, ...problem.equations.flatMap(item => [Math.abs(item.a), Math.abs(item.b)]));
  const actualUsesDifference = problem.equations.some(item => item.a < 0 || item.b < 0);
  if (actualMaxValue > profile.maxValue || actualMaxTotal > profile.maxTotal) errors.push('题目超出阶段或难度范围');
  if (actualMaxCoefficient > profile.maxCoefficient) errors.push('题目系数超出阶段或难度范围');
  if (problem.metrics.usesDifference !== actualUsesDifference) errors.push('题目难度指标与等式结构不一致');
  if (problem.steps.length > profile.maxSteps) errors.push('推理步骤超出难度范围');
  return [...new Set(errors)];
}
