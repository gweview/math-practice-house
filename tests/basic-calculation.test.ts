import { describe, expect, it } from 'vitest';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import type { QuestionGenerationInput } from '../src/domain/questions/contracts';
import type { ProblemType } from '../src/domain/questions/problem-type';
import type { Question, ProblemProfile } from '../src/domain/questions/model';
import type { WorksheetConfig } from '../src/domain/worksheet/config';
import {
  generateAddition10, generateSubtraction10, generateAddition20NoCarry, generateSubtraction20NoBorrow,
  generateAddition20Carry, generateSubtraction20Borrow, generateAddition100, generateSubtraction100,
  generateTwoDigitCarry, generateTwoDigitBorrow, generateAddition1000, generateSubtraction1000,
  generateChainAddition, generateChainSubtraction, generateMixedAddSub, generateMixedFour,
  validateBasicQuestion
} from '../src/question-types/calculation/basic';

const config: WorksheetConfig = {
  stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard', types: [], count: 5,
  verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true, answerPage: false,
  allowDuplicates: true, randomMix: false, fields: { name: false, date: false, time: false, score: false, streak: false },
  orientation: 'portrait', fontSize: 'standard'
};

const profile = (max: number, min = 0, terms = 2): ProblemProfile => ({
  min, max, terms, carryRate: .5, highRangeRate: .4, wordSteps: 1, maxFactor: 9,
  trivialRate: 0, equalityRate: .2, mixedRate: .7
});

const cases: readonly { type: ProblemType; make: (input: QuestionGenerationInput) => Question; profile: ProblemProfile }[] = [
  { type: 'addition10', make: generateAddition10, profile: profile(10) },
  { type: 'subtraction10', make: generateSubtraction10, profile: profile(10) },
  { type: 'addition20NoCarry', make: generateAddition20NoCarry, profile: profile(20) },
  { type: 'subtraction20NoBorrow', make: generateSubtraction20NoBorrow, profile: profile(20) },
  { type: 'addition20Carry', make: generateAddition20Carry, profile: profile(20) },
  { type: 'subtraction20Borrow', make: generateSubtraction20Borrow, profile: profile(20) },
  { type: 'addition100', make: generateAddition100, profile: profile(100) },
  { type: 'subtraction100', make: generateSubtraction100, profile: profile(100) },
  { type: 'twoDigitCarry', make: generateTwoDigitCarry, profile: profile(100, 10) },
  { type: 'twoDigitBorrow', make: generateTwoDigitBorrow, profile: profile(99, 10) },
  { type: 'addition1000', make: generateAddition1000, profile: profile(1000, 10) },
  { type: 'subtraction1000', make: generateSubtraction1000, profile: profile(1000, 10) },
  { type: 'chainAddition', make: generateChainAddition, profile: profile(1000, 0, 3) },
  { type: 'chainSubtraction', make: generateChainSubtraction, profile: profile(1000, 0, 3) },
  { type: 'mixedAddSub', make: generateMixedAddSub, profile: profile(1000, 0, 3) },
  { type: 'mixedFour', make: generateMixedFour, profile: profile(1000, 0, 4) }
];

function inputFor(item: typeof cases[number], seed: string): QuestionGenerationInput {
  const context = createGenerationContext(seed);
  return { type: item.type, config, profile: item.profile, random: context.random, createId: context.createId };
}

const golden: readonly { type: ProblemType; operands: number[]; operators: string[]; answer: number; magnitude: number }[] = [
  { type: 'addition10', operands: [2, 3], operators: ['+'], answer: 5, magnitude: 5 },
  { type: 'subtraction10', operands: [8, 3], operators: ['-'], answer: 5, magnitude: 8 },
  { type: 'addition20NoCarry', operands: [12, 3], operators: ['+'], answer: 15, magnitude: 15 },
  { type: 'subtraction20NoBorrow', operands: [18, 7], operators: ['-'], answer: 11, magnitude: 18 },
  { type: 'addition20Carry', operands: [8, 7], operators: ['+'], answer: 15, magnitude: 15 },
  { type: 'subtraction20Borrow', operands: [20, 1], operators: ['-'], answer: 19, magnitude: 20 },
  { type: 'addition100', operands: [40, 35], operators: ['+'], answer: 75, magnitude: 75 },
  { type: 'subtraction100', operands: [95, 25], operators: ['-'], answer: 70, magnitude: 95 },
  { type: 'twoDigitCarry', operands: [27, 15], operators: ['+'], answer: 42, magnitude: 42 },
  { type: 'twoDigitBorrow', operands: [42, 15], operators: ['-'], answer: 27, magnitude: 42 },
  { type: 'addition1000', operands: [345, 278], operators: ['+'], answer: 623, magnitude: 623 },
  { type: 'subtraction1000', operands: [800, 123], operators: ['-'], answer: 677, magnitude: 800 },
  { type: 'chainAddition', operands: [2, 3, 4], operators: ['+', '+'], answer: 9, magnitude: 4 },
  { type: 'chainSubtraction', operands: [20, 3, 2], operators: ['-', '-'], answer: 15, magnitude: 20 },
  { type: 'mixedAddSub', operands: [10, 3, 2], operators: ['-', '+'], answer: 9, magnitude: 10 },
  { type: 'mixedFour', operands: [5, 2, 3], operators: ['+', '×'], answer: 11, magnitude: 5 }
];

function goldenQuestion(item: typeof golden[number]): Question {
  return {
    id: `golden-${item.type}`, type: item.type, text: `${item.operands.join(' ')} =`, answer: item.answer,
    operands: item.operands, operators: item.operators, signature: `golden:${item.type}`, layout: 'inline',
    metadata: { terms: item.operands.length, mixed: new Set(item.operators).size > 1, trivial: false, magnitude: item.magnitude }
  };
}

describe('self-contained basic calculation question modules', () => {
  it.each(cases)('generates and independently validates $type', item => {
    const question = item.make(inputFor(item, `basic-${item.type}`));
    expect(question.type).toBe(item.type);
    expect(validateBasicQuestion(question, config)).toEqual({ valid: true, errors: [] });
    expect(validateBasicQuestion({ ...question, answer: typeof question.answer === 'number' ? question.answer + 1 : question.answer }, config).valid).toBe(false);
    expect(validateBasicQuestion({ ...question, operands: [question.operands[0] + 1, ...question.operands.slice(1)] }, config).valid).toBe(false);
    expect(validateBasicQuestion({ ...question, metadata: { ...question.metadata, magnitude: Number(question.metadata?.magnitude ?? 0) + 1 } }, config).valid).toBe(false);
  });

  it.each(golden)('accepts hand-authored golden $type', item => {
    expect(validateBasicQuestion(goldenQuestion(item), config)).toEqual({ valid: true, errors: [] });
  });
});
