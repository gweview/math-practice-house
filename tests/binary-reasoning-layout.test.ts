import { describe, expect, it } from 'vitest';
import { DEFAULT_BINARY_REASONING_CONFIG } from '../src/features/binary-reasoning/difficulty';
import { generateReasoningSet } from '../src/features/binary-reasoning/generator';
import { planReasoningSheets } from '../src/features/binary-reasoning/layout';

function seeded(seed: number) {
  let state = seed >>> 0;
  return () => ((state = (state * 1664525 + 1013904223) >>> 0) / 0x100000000);
}

describe('binary reasoning physical sheet planning', () => {
  for (const orientation of ['portrait', 'landscape'] as const) {
    for (const fontSize of ['standard', 'large'] as const) {
      it(`keeps questions and answers ordered for ${orientation}/${fontSize}`, () => {
        const config = { ...DEFAULT_BINARY_REASONING_CONFIG, orientation, fontSize, count: 20 };
        const problems = generateReasoningSet(config, seeded(2026));
        const sheets = planReasoningSheets(problems, config);
        const questionSheets = sheets.filter(item => item.kind === 'questions');
        const answerSheets = sheets.filter(item => item.kind === 'answers');
        expect(questionSheets.length).toBeGreaterThan(0);
        expect(answerSheets.length).toBeGreaterThan(0);
        expect(questionSheets.flatMap(item => item.slots.map(slot => slot.number))).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
        expect(answerSheets.flatMap(item => item.slots.map(slot => slot.number))).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
        expect(sheets.every(item => item.slots.length > 0 && item.orientation === orientation)).toBe(true);
        expect(new Set(questionSheets.flatMap(item => item.slots.map(slot => slot.problem.id))).size).toBe(20);
      });
    }
  }

  it('omits answer sheets when disabled and scales to boundaries', () => {
    for (const count of [4, 8, 12, 40]) {
      const config = { ...DEFAULT_BINARY_REASONING_CONFIG, count, answerPage: false };
      const problems = generateReasoningSet(config, seeded(count));
      const sheets = planReasoningSheets(problems, config);
      expect(sheets.every(item => item.kind === 'questions')).toBe(true);
      expect(sheets.flatMap(item => item.slots)).toHaveLength(count);
      expect(sheets.at(-1)?.isLast).toBe(true);
      expect(sheets.slice(0, -1).every(item => !item.isLast)).toBe(true);
    }
  });
});
