import { describe, expect, it } from 'vitest';
import {
  BINARY_DIFFICULTY_PROFILES,
  DEFAULT_BINARY_REASONING_CONFIG,
  getBinaryProfile,
  normalizeBinaryReasoningConfig
} from '../src/features/binary-reasoning/difficulty';
import { generateReasoningProblem, generateReasoningSet, type RandomSource } from '../src/features/binary-reasoning/generator';
import { pickSymbolPair, SYMBOL_CATALOG } from '../src/features/binary-reasoning/symbols';
import { solveReasoningProblem, validateReasoningProblem } from '../src/features/binary-reasoning/validator';
import type { BinaryReasoningConfig, ReasoningMethod, ReasoningProblem } from '../src/features/binary-reasoning/types';

function seeded(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

const fixture: ReasoningProblem = {
  id: 'fixture', method: 'chain', symbols: { a: 'apple', b: 'star' },
  values: { a: 4, b: 5 },
  equations: [
    { a: 2, b: 0, total: 8 },
    { a: 1, b: 2, total: 14 }
  ],
  ask: ['a', 'b'], answers: { a: 4, b: 5 },
  steps: ['2 个苹果一共 8，所以 8÷2=4。', '把苹果=4 代入第二式。', '剩下 10，10÷2=5。'],
  signature: 'fixture',
  metrics: { maxValue: 5, maxTotal: 14, equationCount: 2, reasoningSteps: 3, usesDifference: false }
};

describe('binary reasoning configuration', () => {
  it('defines five progressively larger difficulty profiles', () => {
    expect(BINARY_DIFFICULTY_PROFILES.map(item => item.difficulty)).toEqual(['entry', 'easy', 'standard', 'advanced', 'challenge']);
    for (let index = 1; index < BINARY_DIFFICULTY_PROFILES.length; index++) {
      expect(BINARY_DIFFICULTY_PROFILES[index].maxValue).toBeGreaterThan(BINARY_DIFFICULTY_PROFILES[index - 1].maxValue);
      expect(BINARY_DIFFICULTY_PROFILES[index].maxCoefficient).toBeGreaterThanOrEqual(BINARY_DIFFICULTY_PROFILES[index - 1].maxCoefficient);
    }
    expect(DEFAULT_BINARY_REASONING_CONFIG.methods).toEqual(['sameValue', 'substitution', 'sumDifference', 'chain']);
    for (const stage of ['preschool', 'grade1', 'grade2', 'grade3'] as const) {
      const signatures = BINARY_DIFFICULTY_PROFILES.map(profile => {
        const effective = getBinaryProfile(profile.difficulty, stage);
        return `${effective.maxValue}|${effective.maxTotal}|${effective.maxCoefficient}|${effective.maxSteps}`;
      });
      expect(new Set(signatures).size).toBe(BINARY_DIFFICULTY_PROFILES.length);
    }
  });

  it('normalizes corrupt and out-of-range persisted values safely', () => {
    expect(normalizeBinaryReasoningConfig(null)).toEqual(DEFAULT_BINARY_REASONING_CONFIG);
    expect(normalizeBinaryReasoningConfig({ count: 999, methods: ['chain', 'bad'], stage: 'bad' })).toMatchObject({
      count: 40, methods: ['chain'], stage: DEFAULT_BINARY_REASONING_CONFIG.stage
    });
    expect(normalizeBinaryReasoningConfig({ count: -5, methods: [], answerPage: 'yes' })).toMatchObject({
      count: 4, methods: DEFAULT_BINARY_REASONING_CONFIG.methods, answerPage: DEFAULT_BINARY_REASONING_CONFIG.answerPage
    });
  });
});

describe('binary reasoning symbols', () => {
  it('provides distinct accessible local symbols', () => {
    expect(new Set(SYMBOL_CATALOG.map(item => item.id)).size).toBe(SYMBOL_CATALOG.length);
    expect(SYMBOL_CATALOG.every(item => item.label && item.glyph && item.printGlyph)).toBe(true);
    for (let seed = 0; seed < 20; seed++) {
      const pair = pickSymbolPair(seeded(seed));
      expect(pair.a).not.toBe(pair.b);
    }
  });
});

describe('independent equation solving and validation', () => {
  it('solves a two-equation fixture without trusting stored answers', () => {
    expect(solveReasoningProblem({ ...fixture, answers: { a: 99, b: 99 } })).toEqual({ a: 4, b: 5 });
    expect(validateReasoningProblem(fixture, getBinaryProfile('challenge', 'grade3'))).toEqual([]);
  });

  it('rejects inconsistent, equal-valued, non-unique and fractional problems', () => {
    expect(validateReasoningProblem({ ...fixture, values: { a: 4, b: 4 } }, getBinaryProfile('challenge', 'grade3'))).toContain('两个图形不能代表相同的数');
    expect(validateReasoningProblem({ ...fixture, equations: [{ a: 1, b: 1, total: 9 }, { a: 2, b: 2, total: 18 }] }, getBinaryProfile('challenge', 'grade3'))).toContain('等式不能唯一确定两个图形');
    expect(solveReasoningProblem({ ...fixture, equations: [{ a: 2, b: 0, total: 7 }, { a: 0, b: 2, total: 9 }] })).toBeNull();
    expect(validateReasoningProblem({ ...fixture, equations: [{ a: 2, b: 0, total: 7 }, { a: 0, b: 2, total: 9 }] }, getBinaryProfile('challenge', 'grade3'))).toContain('答案必须是非负整数');
    const hiddenOverRange = { ...fixture, values: { a: 1, b: 2 }, equations: [{ a: 5, b: 0, total: 5 }, { a: 0, b: 1, total: 2 }] };
    expect(validateReasoningProblem(hiddenOverRange, getBinaryProfile('entry', 'preschool'))).toContain('题目系数超出阶段或难度范围');
    const illegalNegative = { ...fixture, method: 'chain' as const, equations: [{ a: 1, b: 1, total: 9 }, { a: -1, b: 1, total: 1 }] };
    expect(validateReasoningProblem(illegalNegative, getBinaryProfile('challenge', 'grade3'))).toContain('只有和差推算可以使用减法关系');
  });
});

describe('four binary reasoning generators', () => {
  const methods: ReasoningMethod[] = ['sameValue', 'substitution', 'sumDifference', 'chain'];
  for (const [methodIndex, method] of methods.entries()) {
    it(`generates valid ${method} problems across deterministic seeds`, () => {
      const config: BinaryReasoningConfig = { ...DEFAULT_BINARY_REASONING_CONFIG, stage: 'grade3', difficulty: 'challenge', methods: [method] };
      for (let seed = 0; seed < 30; seed++) {
        const problem = generateReasoningProblem(method, config, seeded(10_000 + methodIndex * 100 + seed));
        expect(problem.method).toBe(method);
        expect(problem.symbols.a).not.toBe(problem.symbols.b);
        expect(problem.values.a).not.toBe(problem.values.b);
        expect(solveReasoningProblem(problem)).toEqual(problem.values);
        expect(validateReasoningProblem(problem, getBinaryProfile(config.difficulty, config.stage))).toEqual([]);
        expect(problem.steps.length).toBeGreaterThanOrEqual(2);
      }
    });
  }

  it('balances methods, deduplicates and generates the maximum set quickly', () => {
    const config = { ...DEFAULT_BINARY_REASONING_CONFIG, stage: 'grade3' as const, difficulty: 'challenge' as const, count: 40, randomMix: false };
    const started = performance.now();
    const problems = generateReasoningSet(config, seeded(77_777));
    expect(problems).toHaveLength(40);
    expect(new Set(problems.map(item => item.signature)).size).toBe(40);
    expect(problems.reduce<Record<string, number>>((counts, item) => ({ ...counts, [item.method]: (counts[item.method] ?? 0) + 1 }), {})).toEqual({ sameValue: 10, substitution: 10, sumDifference: 10, chain: 10 });
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('never exceeds the selected stage and difficulty profile', () => {
    for (const stage of ['preschool', 'grade1', 'grade2', 'grade3'] as const) {
      for (const difficulty of ['entry', 'easy', 'standard', 'advanced', 'challenge'] as const) {
        const config = { ...DEFAULT_BINARY_REASONING_CONFIG, stage, difficulty, count: 12 };
        const profile = getBinaryProfile(difficulty, stage);
        const items = generateReasoningSet(config, seeded(stage.length * 1000 + difficulty.length));
        expect(items.every(item => item.metrics.maxValue <= profile.maxValue && item.metrics.maxTotal <= profile.maxTotal)).toBe(true);
      }
    }
  });

  it('keeps low-age explanations complete within the short step budget', () => {
    for (const method of methods) {
      const config = { ...DEFAULT_BINARY_REASONING_CONFIG, stage: 'preschool' as const, difficulty: 'entry' as const, methods: [method] };
      for (let seed = 0; seed < 20; seed++) {
        const item = generateReasoningProblem(method, config, seeded(88_000 + seed));
        const explanation = item.steps.join('');
        expect(explanation).toContain(`=${item.values.a}`);
        expect(explanation).toContain(`=${item.values.b}`);
        expect(item.steps.length).toBeLessThanOrEqual(getBinaryProfile(config.difficulty, config.stage).maxSteps);
      }
    }
  });
});
