import { describe, expect, it } from 'vitest';
import { generateAddition, generateSubtraction } from '../src/core/generators/arithmetic';
import { generateDivision } from '../src/core/generators/division';
import { generateRemainderDivision } from '../src/core/generators/grade3';
import { generateWordProblem } from '../src/core/generators/word-problem';
import { evaluateExpression, generateWorksheet } from '../src/core/generate';
import { deduplicate } from '../src/core/deduplication';
import { normalizeConfig, validateConfig } from '../src/core/validators';
import { validateQuestion } from '../src/core/validators';
import type { Difficulty, ProblemType, Question, WorksheetConfig } from '../src/core/types';

const base: WorksheetConfig = {
  stage: 'grade2', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard', types: ['addition100'], count: 20,
  verticalOperations: ['addition', 'subtraction'], verticalPages: 1,
  showNumbers: true, showLines: true, answerPage: true, allowDuplicates: false,
  randomMix: false, fields: { name: true, date: true, time: true, score: true, streak: false },
  orientation: 'portrait', fontSize: 'standard'
};

describe('arithmetic generators', () => {
  it('addition answer equals operands sum', () => {
    for (let i = 0; i < 50; i++) { const q = generateAddition(100, false); expect(q.answer).toBe(q.operands[0] + q.operands[1]); }
  });
  it('subtraction never produces a negative answer', () => {
    for (let i = 0; i < 100; i++) expect(Number(generateSubtraction(100, false).answer)).toBeGreaterThanOrEqual(0);
  });
  it('carrying addition always carries', () => {
    for (let i = 0; i < 60; i++) { const q = generateAddition(99, true); expect(q.operands[0] % 10 + q.operands[1] % 10).toBeGreaterThanOrEqual(10); }
  });
  it('borrowing subtraction always borrows', () => {
    for (let i = 0; i < 60; i++) { const q = generateSubtraction(99, true); expect(q.operands[0] % 10).toBeLessThan(q.operands[1] % 10); }
  });
});

describe('expanded multiplication practice', () => {
  it('generates three-digit by one-digit multiplication with valid answers', () => {
    const config: WorksheetConfig = {
      ...base, stage: 'grade3', rangeMode: 'curriculum', difficulty: 'challenge',
      types: ['threeDigitByOneMultiplication'], count: 100, allowDuplicates: true
    };
    const sheet = generateWorksheet(config);
    expect(sheet.questions).toHaveLength(100);
    for (const question of sheet.questions) {
      const [multiplicand, multiplier] = question.operands;
      expect(multiplicand).toBeGreaterThanOrEqual(100);
      expect(multiplicand).toBeLessThanOrEqual(999);
      expect(multiplier).toBeGreaterThanOrEqual(2);
      expect(multiplier).toBeLessThanOrEqual(9);
      expect(question.answer).toBe(multiplicand * multiplier);
      expect(validateQuestion(question, config)).toEqual({ valid: true, errors: [] });
    }
  });

  it('generates two-digit by two-digit multiplication with valid answers', () => {
    const config: WorksheetConfig = {
      ...base, stage: 'grade3', rangeMode: 'curriculum', difficulty: 'challenge',
      types: ['twoDigitByTwoMultiplication'], count: 100, allowDuplicates: true
    };
    const sheet = generateWorksheet(config);
    expect(sheet.questions).toHaveLength(100);
    for (const question of sheet.questions) {
      const [left, right] = question.operands;
      expect(left).toBeGreaterThanOrEqual(10);
      expect(left).toBeLessThanOrEqual(99);
      expect(right).toBeGreaterThanOrEqual(10);
      expect(right).toBeLessThanOrEqual(99);
      expect(question.answer).toBe(left * right);
      expect(validateQuestion(question, config)).toEqual({ valid: true, errors: [] });
    }
  });

  it('keeps entry difficulty inside its smaller operand bands', () => {
    const threeByOne = generateWorksheet({
      ...base, stage: 'grade3', rangeMode: 'curriculum', difficulty: 'entry',
      types: ['threeDigitByOneMultiplication'], count: 100, allowDuplicates: true
    });
    const twoByTwo = generateWorksheet({
      ...base, stage: 'grade3', rangeMode: 'curriculum', difficulty: 'entry',
      types: ['twoDigitByTwoMultiplication'], count: 100, allowDuplicates: true
    });
    expect(Math.max(...threeByOne.questions.map(question => question.operands[0]))).toBeLessThanOrEqual(300);
    expect(Math.max(...threeByOne.questions.map(question => Number(question.answer)))).toBeLessThanOrEqual(2700);
    expect(Math.max(...twoByTwo.questions.flatMap(question => question.operands))).toBeLessThanOrEqual(30);
    expect(Math.max(...twoByTwo.questions.map(question => Number(question.answer)))).toBeLessThanOrEqual(900);
  });

  it('generates 100 unique questions for each expanded multiplication type', () => {
    for (const type of ['threeDigitByOneMultiplication', 'twoDigitByTwoMultiplication'] as const) {
      const sheet = generateWorksheet({
        ...base, stage: 'grade3', rangeMode: 'curriculum', difficulty: 'entry',
        types: [type], count: 100, allowDuplicates: false
      });
      expect(sheet.questions).toHaveLength(100);
      expect(new Set(sheet.questions.map(question => question.signature)).size).toBe(100);
    }
  });
});

describe('division and constraints', () => {
  it('division has a nonzero divisor and divides evenly', () => {
    for (let i = 0; i < 100; i++) { const q = generateDivision(9); expect(q.operands[1]).not.toBe(0); expect(q.operands[0] % q.operands[1]).toBe(0); expect(q.answer).toBe(q.operands[0] / q.operands[1]); }
  });
  it('generated numbers respect stage range', () => {
    const sheet = generateWorksheet({ ...base, stage: 'grade1', difficulty: 'entry', types: ['addition10'], count: 50, allowDuplicates: true });
    expect(sheet.questions.every(q => q.operands.every(n => n >= 0 && n <= 10))).toBe(true);
  });
  it('keeps remainder-division dividends inside the selected range', () => {
    for (let i = 0; i < 500; i++) {
      const question = generateRemainderDivision(300, 'challenge');
      expect(question.operands[0]).toBeLessThanOrEqual(300);
      expect(question.operands[0] % question.operands[1]).toBeGreaterThan(0);
    }
  });
});

describe('worksheet behavior', () => {
  it('deduplication removes matching signatures', () => {
    const q = generateAddition(10, false); expect(deduplicate([q, q])).toHaveLength(1);
  });
  it('count boundaries are normalized and invalid config rejected', () => {
    expect(normalizeConfig({ ...base, count: 1 }).count).toBe(5);
    expect(normalizeConfig({ ...base, count: 200 }).count).toBe(100);
    expect(validateConfig({ ...base, types: [] }).valid).toBe(false);
  });
  it('rejects corrupt runtime enum values without crashing generation', () => {
    const corrupt = { ...base, stage: 'unknown', difficulty: 'impossible', types: ['not-a-type'] } as unknown as WorksheetConfig;
    expect(validateConfig(corrupt).errors).toEqual(expect.arrayContaining(['学习阶段无效', '难度设置无效', '所选题型无效']));
    expect(() => generateWorksheet(corrupt)).toThrow(/学习阶段无效/);
  });
  it('does not create vertical questions in standard practice mode', () => {
    const types: ProblemType[] = ['addition20NoCarry', 'subtraction20NoBorrow', 'addition100', 'subtraction100', 'twoDigitCarry', 'twoDigitBorrow'];
    for (const type of types) {
      const sheet = generateWorksheet({ ...base, types: [type], count: 20, allowDuplicates: true });
      expect(sheet.questions.every(question => question.layout === 'inline'), type).toBe(true);
    }
  });
  it('mixed expressions use correct operator precedence', () => {
    expect(evaluateExpression([2, 3, 4], ['+', '×'])).toBe(14);
    expect(evaluateExpression([20, 4, 2], ['-', '÷'])).toBe(18);
  });
  it('word problem text numbers and answer agree', () => {
    for (let i = 0; i < 30; i++) { const q = generateWordProblem(30, 1); expect(q.text).toContain(String(q.operands[0])); expect(q.text).toContain(String(q.operands[1])); expect(q.answer).toBe(q.operators?.[0] === '+' ? q.operands[0] + q.operands[1] : q.operands[0] - q.operands[1]); }
  });
  it('generates 100 valid, unique questions promptly', () => {
    const start = performance.now(); const sheet = generateWorksheet({ ...base, count: 100, allowDuplicates: false });
    expect(sheet.questions).toHaveLength(100); expect(new Set(sheet.questions.map(q => q.signature)).size).toBe(100); expect(performance.now() - start).toBeLessThan(1000);
  });
  it('can expand the default grade-one worksheet to 70 unique questions', () => {
    // Isomorphic dedup makes 3+5 and 5+3 one question, so addition10 has 36
    // distinct questions (unordered pairs summing to at most 10), not 66;
    // 35 per type stays within the true capacity of both types.
    const sheet = generateWorksheet({
      ...base,
      stage: 'grade1', rangeMode: 'curriculum', types: ['addition10', 'subtraction10'],
      count: 70, allowDuplicates: false
    });
    expect(sheet.questions).toHaveLength(70);
    expect(new Set(sheet.questions.map(question => question.signature)).size).toBe(70);
  });
  it('adapts equality quotas to a small unique comparison pool', () => {
    const sheet = generateWorksheet({
      ...base, stage: 'grade1', rangeMode: 'curriculum', difficulty: 'easy',
      types: ['compareSigns'], count: 100, allowDuplicates: false
    });
    expect(sheet.questions).toHaveLength(100);
    expect(new Set(sheet.questions.map(question => question.signature)).size).toBe(100);
    expect(sheet.questions.filter(question => question.answer === '=')).toHaveLength(12);
  });
  it('difficulty changes number ranges', () => {
    const entry = generateWorksheet({ ...base, difficulty: 'entry', count: 40 });
    const challenge = generateWorksheet({ ...base, difficulty: 'challenge', count: 40 });
    expect(Math.max(...challenge.questions.flatMap(q => q.operands))).toBeGreaterThan(Math.max(...entry.questions.flatMap(q => q.operands)));
  });
});

describe('dedicated vertical practice', () => {
  it('normalizes vertical worksheets to exactly eight questions per page', () => {
    const config = normalizeConfig({ ...base, practiceMode: 'verticalAddSub', verticalPages: 3, count: 99 });
    expect(config.count).toBe(24);
    expect(validateConfig(config)).toEqual({ valid: true, errors: [] });
  });

  it('creates balanced add/sub pages without inline or trivial questions', () => {
    const sheet = generateWorksheet({
      ...base, stage: 'grade2', rangeMode: 'curriculum', practiceMode: 'verticalAddSub',
      verticalOperations: ['addition', 'subtraction'], verticalPages: 2, count: 20
    });
    expect(sheet.questions).toHaveLength(16);
    for (let pageIndex = 0; pageIndex < 2; pageIndex++) {
      const page = sheet.questions.slice(pageIndex * 8, pageIndex * 8 + 8);
      expect(page.filter(question => question.type === 'verticalAddition')).toHaveLength(4);
      expect(page.filter(question => question.type === 'verticalSubtraction')).toHaveLength(4);
      expect(page.filter(question => question.metadata?.regrouping)).toHaveLength(4);
      expect(page.filter(question => question.type === 'verticalAddition' && question.metadata?.regrouping)).toHaveLength(2);
      expect(page.filter(question => question.type === 'verticalSubtraction' && question.metadata?.regrouping)).toHaveLength(2);
      expect(page.every(question => question.layout === 'vertical' && question.metadata?.trivial === false)).toBe(true);
      expect(page.every(question => question.operands.every(value => value > 0 && value <= 100))).toBe(true);
      expect(page.filter(question => question.type === 'verticalAddition').every(question => question.operands[0] !== question.operands[1])).toBe(true);
      expect(page.filter(question => question.type === 'verticalSubtraction').every(question => Number(question.answer) >= 10)).toBe(true);
    }
    for (const question of sheet.questions) expect(validateQuestion(question, sheet.config)).toEqual({ valid: true, errors: [] });
  });

  it('uses multi-column regrouping for hard grade-three add/sub work', () => {
    const sheet = generateWorksheet({
      ...base, stage: 'grade3', rangeMode: 'curriculum', difficulty: 'challenge',
      practiceMode: 'verticalAddSub', verticalOperations: ['addition', 'subtraction'], verticalPages: 1
    });
    expect(sheet.questions.filter(question => question.metadata?.regrouping)).toHaveLength(7);
    expect(sheet.questions.filter(question => Number(question.metadata?.regroupingCount) >= 2).length).toBeGreaterThanOrEqual(7);
    expect(sheet.questions.every(question => question.operands.every(value => value > 0))).toBe(true);
  });

  it('honors the configured per-page complexity quotas', () => {
    // Complex quotas now follow the registry carryRate (round(8 * carryRate)):
    // entry 0 and easy 2 replace the old vertical-only table (2 and 3).
    const expectedComplex = { entry: 0, easy: 2, standard: 4, advanced: 6, challenge: 7 } as const;
    const expectedRemainders = { entry: 0, easy: 1, standard: 2, advanced: 3, challenge: 4 } as const;
    for (const difficulty of Object.keys(expectedComplex) as Difficulty[]) {
      const addSub = generateWorksheet({
        ...base, stage: 'grade3', rangeMode: 'curriculum', difficulty, practiceMode: 'verticalAddSub',
        verticalOperations: ['addition', 'subtraction'], verticalPages: 1, allowDuplicates: true
      });
      expect(addSub.questions.filter(question => question.metadata?.regrouping)).toHaveLength(expectedComplex[difficulty]);
      const mulDiv = generateWorksheet({
        ...base, stage: 'grade3', rangeMode: 'curriculum', difficulty, practiceMode: 'verticalMulDiv',
        verticalOperations: ['multiplication', 'division'], verticalPages: 1, allowDuplicates: true
      });
      const multiplications = mulDiv.questions.filter(question => question.type === 'verticalMultiplication');
      const divisions = mulDiv.questions.filter(question => question.type === 'verticalDivision');
      const multiplicationRegroupingCount = (question: { operands: number[] }) => {
        let multiplicand = question.operands[0];
        const factor = question.operands[1];
        let carry = 0;
        let count = 0;
        while (multiplicand > 0) {
          const product = multiplicand % 10 * factor + carry;
          carry = Math.floor(product / 10);
          if (carry > 0) count++;
          multiplicand = Math.floor(multiplicand / 10);
        }
        return count;
      };
      expect(multiplications.filter(question => question.metadata?.regrouping)).toHaveLength(Math.round(4 * expectedComplex[difficulty] / 8));
      expect(multiplications.every(question => Number(question.metadata?.regroupingCount) === multiplicationRegroupingCount(question))).toBe(true);
      expect(multiplications.every(question => Boolean(question.metadata?.regrouping) === (multiplicationRegroupingCount(question) > 0))).toBe(true);
      expect(divisions.filter(question => Number(question.metadata?.remainder) > 0)).toHaveLength(expectedRemainders[difficulty]);
    }
  });

  it('creates four multiplication and four true long-division problems per page', () => {
    const sheet = generateWorksheet({
      ...base, stage: 'grade3', rangeMode: 'curriculum', practiceMode: 'verticalMulDiv',
      verticalOperations: ['multiplication', 'division'], verticalPages: 1
    });
    const multiplications = sheet.questions.filter(question => question.type === 'verticalMultiplication');
    const divisions = sheet.questions.filter(question => question.type === 'verticalDivision');
    expect(multiplications).toHaveLength(4);
    expect(divisions).toHaveLength(4);
    expect(multiplications.every(question => question.layout === 'vertical' && question.operands[0] >= 10 && question.operands[1] >= 2)).toBe(true);
    expect(divisions.every(question => question.layout === 'longDivision' && Number(question.metadata?.quotient) >= 10)).toBe(true);
    expect(divisions.filter(question => Number(question.metadata?.remainder) > 0)).toHaveLength(2);
    expect(sheet.questions.every(question => question.metadata?.trivial === false)).toBe(true);
    for (const question of sheet.questions) expect(validateQuestion(question, sheet.config)).toEqual({ valid: true, errors: [] });
  });

  it('fills a page with one selected vertical operation', () => {
    const sheet = generateWorksheet({
      ...base, stage: 'grade3', rangeMode: 'curriculum', practiceMode: 'verticalMulDiv',
      verticalOperations: ['division'], verticalPages: 1
    });
    expect(sheet.questions).toHaveLength(8);
    expect(sheet.questions.every(question => question.type === 'verticalDivision' && question.layout === 'longDivision')).toBe(true);
  });

  it('enforces curriculum availability for vertical modes', () => {
    expect(() => generateWorksheet({
      ...base, stage: 'grade2', rangeMode: 'curriculum', practiceMode: 'verticalMulDiv',
      verticalOperations: ['multiplication', 'division']
    })).toThrow(/从三年级起开放/);
    expect(() => generateWorksheet({
      ...base, stage: 'preschool', rangeMode: 'curriculum', practiceMode: 'verticalAddSub',
      verticalOperations: ['addition', 'subtraction']
    })).toThrow(/尚未开放加减法竖式/);
  });

  it('reliably generates every allowed stage and difficulty combination', () => {
    const difficulties: Difficulty[] = ['entry', 'easy', 'standard', 'advanced', 'challenge'];
    for (const stage of ['grade1', 'grade2', 'grade3'] as const) {
      for (const difficulty of difficulties) {
        for (let sample = 0; sample < 3; sample++) {
          const sheet = generateWorksheet({
            ...base, stage, rangeMode: 'curriculum', difficulty, practiceMode: 'verticalAddSub',
            verticalOperations: ['addition', 'subtraction'], verticalPages: 1
          });
          expect(sheet.questions).toHaveLength(8);
        }
      }
    }
    for (const difficulty of difficulties) {
      for (let sample = 0; sample < 3; sample++) {
        const sheet = generateWorksheet({
          ...base, stage: 'grade3', rangeMode: 'curriculum', difficulty, practiceMode: 'verticalMulDiv',
          verticalOperations: ['multiplication', 'division'], verticalPages: 1
        });
        expect(sheet.questions).toHaveLength(8);
      }
    }
  });

  it('supports the maximum five unique vertical pages in restrictive modes', () => {
    const configs: WorksheetConfig[] = [
      { ...base, stage: 'grade1', rangeMode: 'curriculum', difficulty: 'challenge', practiceMode: 'verticalAddSub', verticalOperations: ['addition', 'subtraction'], verticalPages: 5 },
      { ...base, stage: 'grade3', rangeMode: 'curriculum', difficulty: 'advanced', practiceMode: 'verticalMulDiv', verticalOperations: ['multiplication'], verticalPages: 5 },
      { ...base, stage: 'grade3', rangeMode: 'curriculum', difficulty: 'challenge', practiceMode: 'verticalMulDiv', verticalOperations: ['division'], verticalPages: 5 }
    ];
    for (const config of configs) {
      for (let sample = 0; sample < 3; sample++) {
        const sheet = generateWorksheet(config);
        expect(sheet.questions).toHaveLength(40);
        expect(new Set(sheet.questions.map(question => question.signature)).size).toBe(40);
      }
    }
  });
});

describe('all problem type contracts', () => {
  const types: ProblemType[] = ['numberRecognition','comparison','compareSigns','addition10','subtraction10','addition20NoCarry','subtraction20NoBorrow','addition20Carry','subtraction20Borrow','addition100','subtraction100','twoDigitCarry','twoDigitBorrow','addition1000','subtraction1000','chainAddition','chainSubtraction','mixedAddSub','multiplication','division','multiDigitMultiplication','threeDigitByOneMultiplication','twoDigitByTwoMultiplication','remainderDivision','mixedMulDiv','mixedFour','fillBlank','wordProblem','unitConversion','fractionComparison','perimeter'];
  const difficulties: Difficulty[] = ['entry','easy','standard','advanced','challenge'];
  for (const type of types) for (const difficulty of difficulties) {
    it(`${type} satisfies ${difficulty} constraints`, () => {
      const config={...base,types:[type],difficulty,count:30,allowDuplicates:true};
      const sheet=generateWorksheet(config);
      expect(sheet.questions).toHaveLength(30);
      for(const question of sheet.questions) expect(validateQuestion(question,config),`${question.text}`).toEqual({valid:true,errors:[]});
    });
  }
  it('100以内标准加法覆盖高位区间且不受年级截断',()=>{
    const sheet=generateWorksheet({...base,stage:'grade1',difficulty:'standard',types:['addition100'],count:100,allowDuplicates:true});
    expect(Math.max(...sheet.questions.map(q=>Number(q.answer)))).toBeGreaterThan(50);
    expect(sheet.questions.every(q=>Number(q.answer)<=100)).toBe(true);
  });
});

describe('difficulty distribution and curriculum behavior', () => {
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;

  it('raises magnitude and removes trivial zero operations at challenge level', () => {
    const entry = generateWorksheet({ ...base, difficulty: 'entry', count: 100, allowDuplicates: true });
    const challenge = generateWorksheet({ ...base, difficulty: 'challenge', count: 100, allowDuplicates: true });
    expect(average(challenge.questions.map(question => Number(question.metadata?.magnitude)))).toBeGreaterThan(average(entry.questions.map(question => Number(question.metadata?.magnitude))) + 25);
    expect(challenge.questions.filter(question => question.metadata?.trivial).length).toBe(0);
    expect(entry.questions.some(question => question.metadata?.trivial)).toBe(true);
  });

  it('makes fixed-range no-carry questions meaningfully harder', () => {
    const entry = generateWorksheet({ ...base, types: ['addition20NoCarry'], difficulty: 'entry', count: 100, allowDuplicates: true });
    const challenge = generateWorksheet({ ...base, types: ['addition20NoCarry'], difficulty: 'challenge', count: 100, allowDuplicates: true });
    expect(average(challenge.questions.map(question => Number(question.answer)))).toBeGreaterThan(average(entry.questions.map(question => Number(question.answer))) + 6);
  });

  it('keeps comparison signs balanced and separates the choose-larger task', () => {
    const signs = generateWorksheet({ ...base, types: ['compareSigns'], count: 100, allowDuplicates: true });
    expect(signs.questions.filter(question => question.answer === '=').length).toBe(20);
    expect(signs.questions.filter(question => question.answer === '>').length).toBe(40);
    expect(signs.questions.filter(question => question.answer === '<').length).toBe(40);
    const choose = generateWorksheet({ ...base, types: ['comparison'], count: 20, allowDuplicates: true });
    expect(choose.questions.every(question => question.text.startsWith('圈出较大的数') && question.operands[0] !== question.operands[1])).toBe(true);
  });

  it('uses exact regrouping and trivial-operation quotas across a worksheet', () => {
    const sheet = generateWorksheet({ ...base, types: ['addition100'], count: 100, allowDuplicates: true });
    expect(sheet.questions.filter(question => question.metadata?.regrouping).length).toBe(50);
    expect(sheet.questions.filter(question => question.metadata?.trivial).length).toBe(8);
  });

  it('applies regrouping quotas across every digit of multi-digit addition and subtraction', () => {
    const hasRegrouping = (question: { operands: number[] }) => {
      let [left, right] = question.operands;
      while (left > 0 || right > 0) {
        if (left % 10 + right % 10 >= 10) return true;
        left = Math.floor(left / 10);
        right = Math.floor(right / 10);
      }
      return false;
    };
    const hasBorrowing = (question: { operands: number[] }) => {
      let [left, right] = question.operands;
      while (left > 0 || right > 0) {
        if (left % 10 < right % 10) return true;
        left = Math.floor(left / 10);
        right = Math.floor(right / 10);
      }
      return false;
    };
    const addition = generateWorksheet({ ...base, types: ['addition1000'], count: 100, allowDuplicates: true });
    const subtraction = generateWorksheet({ ...base, types: ['subtraction1000'], count: 100, allowDuplicates: true });
    expect(addition.questions.filter(hasRegrouping)).toHaveLength(50);
    expect(subtraction.questions.filter(hasBorrowing)).toHaveLength(50);
    expect(addition.questions.every(question => question.metadata?.regrouping === hasRegrouping(question))).toBe(true);
    expect(subtraction.questions.every(question => question.metadata?.regrouping === hasBorrowing(question))).toBe(true);
  });

  it('balances equality in fraction comparisons by quota', () => {
    const sheet = generateWorksheet({ ...base, stage: 'grade3', types: ['fractionComparison'], count: 100, allowDuplicates: true });
    expect(sheet.questions.filter(question => question.answer === '=').length).toBe(20);
  });

  it('allocates question counts evenly between selected types', () => {
    const sheet = generateWorksheet({ ...base, types: ['addition100', 'subtraction100', 'compareSigns'], count: 29, allowDuplicates: true });
    expect(sheet.questions.filter(question => question.type === 'addition100')).toHaveLength(10);
    expect(sheet.questions.filter(question => question.type === 'subtraction100')).toHaveLength(10);
    expect(sheet.questions.filter(question => question.type === 'compareSigns')).toHaveLength(9);
  });

  it('uses an exact mixed-operation quota when three terms are available', () => {
    const sheet = generateWorksheet({ ...base, types: ['mixedAddSub'], count: 100, allowDuplicates: true });
    expect(sheet.questions.filter(question => question.metadata?.mixed).length).toBe(40);
    expect(sheet.questions.every(question => question.operands.length === 3)).toBe(true);
  });

  it('increases application-problem steps from advanced to challenge', () => {
    const advanced = generateWorksheet({ ...base, types: ['wordProblem'], stage: 'grade3', difficulty: 'advanced', count: 100, allowDuplicates: true });
    const challenge = generateWorksheet({ ...base, types: ['wordProblem'], stage: 'grade3', difficulty: 'challenge', count: 100, allowDuplicates: true });
    expect(average(challenge.questions.map(question => question.operators?.length ?? 0))).toBeGreaterThan(average(advanced.questions.map(question => question.operators?.length ?? 0)));
    expect(new Set(challenge.questions.map(question => question.metadata?.semantic)).size).toBeGreaterThan(3);
  });

  it('progresses fill blanks from direct results to inverse positions and operators', () => {
    const entry = generateWorksheet({ ...base, types: ['fillBlank'], difficulty: 'entry', count: 50, allowDuplicates: true });
    const challenge = generateWorksheet({ ...base, types: ['fillBlank'], difficulty: 'challenge', count: 100, allowDuplicates: true });
    expect(entry.questions.every(question => question.metadata?.blankPosition === 'result')).toBe(true);
    expect(entry.questions.every(question => !question.text.includes('□') && question.text.trim().endsWith('='))).toBe(true);
    expect(challenge.questions.every(question => question.metadata?.blankPosition !== 'result')).toBe(true);
    expect(challenge.questions.every(question => question.text.includes('□'))).toBe(true);
    expect(challenge.questions.some(question => question.metadata?.blankPosition === 'operator')).toBe(true);
  });

  it('enforces curriculum range while free mode permits cross-grade practice', () => {
    const curriculum = generateWorksheet({ ...base, rangeMode: 'curriculum', stage: 'grade1', types: ['wordProblem'], difficulty: 'challenge', count: 100, allowDuplicates: true });
    const free = generateWorksheet({ ...base, rangeMode: 'free', stage: 'grade1', types: ['wordProblem'], difficulty: 'challenge', count: 100, allowDuplicates: true });
    expect(Math.max(...curriculum.questions.flatMap(question => question.operands))).toBeLessThanOrEqual(20);
    expect(Math.max(...free.questions.flatMap(question => question.operands))).toBeGreaterThan(20);
    expect(() => generateWorksheet({ ...base, rangeMode: 'curriculum', stage: 'grade1', types: ['addition100'] })).toThrow(/尚未覆盖/);
  });

  it('rejects an otherwise valid question that exceeds the strict curriculum range', () => {
    const config: WorksheetConfig = { ...base, rangeMode: 'curriculum', stage: 'grade1', types: ['wordProblem'] };
    const question: Question = {
      id: 'over-range', type: 'wordProblem', text: '原来有 15 个，又增加 10 个。现在有多少个？',
      answer: 25, operands: [15, 10], operators: ['+'], signature: 'over-range', layout: 'word',
      metadata: { magnitude: 25, steps: 1 }
    };
    expect(validateQuestion(question, config).errors).toContain('题目超过当前学习阶段范围');
  });

  it('caps multi-step complexity to the selected curriculum stage', () => {
    const preschool = generateWorksheet({
      ...base, rangeMode: 'curriculum', stage: 'preschool', difficulty: 'challenge',
      types: ['wordProblem'], count: 100, allowDuplicates: true
    });
    const gradeOneWords = generateWorksheet({
      ...base, rangeMode: 'curriculum', stage: 'grade1', difficulty: 'challenge',
      types: ['wordProblem'], count: 100, allowDuplicates: true
    });
    const gradeOneChains = generateWorksheet({
      ...base, rangeMode: 'curriculum', stage: 'grade1', difficulty: 'challenge',
      types: ['mixedAddSub'], count: 100, allowDuplicates: true
    });
    expect(Math.max(...preschool.questions.map(question => question.operators?.length ?? 0))).toBe(1);
    expect(Math.max(...gradeOneWords.questions.map(question => question.operators?.length ?? 0))).toBeLessThanOrEqual(2);
    expect(Math.max(...gradeOneChains.questions.map(question => question.operands.length))).toBeLessThanOrEqual(3);
  });

  it('keeps grade-two mixed multiplication and division within 100', () => {
    const sheet = generateWorksheet({
      ...base, rangeMode: 'curriculum', stage: 'grade2', difficulty: 'challenge',
      types: ['mixedMulDiv'], count: 100, allowDuplicates: true
    });
    expect(Math.max(...sheet.questions.flatMap(question => question.operands))).toBeLessThanOrEqual(100);
  });

  it('does not hide multiplication or division inside grade-one fill blanks', () => {
    const grade1 = generateWorksheet({
      ...base, rangeMode: 'curriculum', stage: 'grade1', difficulty: 'challenge',
      types: ['fillBlank'], count: 100, allowDuplicates: true
    });
    const grade2 = generateWorksheet({
      ...base, rangeMode: 'curriculum', stage: 'grade2', difficulty: 'challenge',
      types: ['fillBlank'], count: 100, allowDuplicates: true
    });
    expect(grade1.questions.every(question => ['+', '-'].includes(question.operators?.[0] ?? ''))).toBe(true);
    expect(grade2.questions.some(question => ['×', '÷'].includes(question.operators?.[0] ?? ''))).toBe(true);
  });

  it('keeps strict-curriculum unit conversions inside the advertised range', () => {
    for (const difficulty of ['entry', 'challenge'] as const) {
      const sheet = generateWorksheet({
        ...base, rangeMode: 'curriculum', stage: 'grade3', difficulty,
        types: ['unitConversion'], count: 100, allowDuplicates: true
      });
      const configuredMax = difficulty === 'entry' ? 300 : 1000;
      expect(Math.max(...sheet.questions.flatMap(question => question.operands))).toBeLessThanOrEqual(configuredMax);
    }
  });
});
