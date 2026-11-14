import { describe, expect, it } from 'vitest';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import { deduplicate } from '../src/core/deduplication';
import type { QuestionGenerationInput } from '../src/domain/questions/contracts';
import type { ProblemProfile, Question } from '../src/domain/questions/model';
import type { WorksheetConfig } from '../src/domain/worksheet/config';
import {
  generateDivisionQuestion, generateMixedMulDivQuestion, generateMultiDigitMultiplicationQuestion,
  generateMultiplicationQuestion, generateRemainderDivisionQuestion, generateThreeDigitByOneMultiplicationQuestion,
  generateTwoDigitByTwoMultiplicationQuestion, validateDivision, validateMixedMulDiv,
  validateMultiDigitMultiplication, validateMultiplication, validateRemainderDivision,
  validateThreeDigitByOneMultiplication, validateTwoDigitByTwoMultiplication
} from '../src/question-types/calculation/multiplication';

const config: WorksheetConfig = {
  stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard', types: [], count: 5,
  verticalOperations: ['multiplication', 'division'], verticalPages: 1, showNumbers: true, showLines: true,
  answerPage: false, allowDuplicates: false, randomMix: false,
  fields: { name: false, date: false, time: false, score: false, streak: false }, orientation: 'portrait', fontSize: 'standard'
};

const profile = (max: number): ProblemProfile => ({
  min: 0, max, terms: 3, carryRate: .5, highRangeRate: .5, wordSteps: 1,
  maxFactor: 12, trivialRate: .08, equalityRate: .2, mixedRate: .4
});

function input(type: QuestionGenerationInput['type'], max: number, seed: string): QuestionGenerationInput {
  const context = createGenerationContext(seed);
  return { type, config, profile: profile(max), random: context.random, createId: context.createId };
}

const cases = [
  ['multiplication', generateMultiplicationQuestion, validateMultiplication, 144],
  ['division', generateDivisionQuestion, validateDivision, 144],
  ['multiDigitMultiplication', generateMultiDigitMultiplicationQuestion, validateMultiDigitMultiplication, 100],
  ['threeDigitByOneMultiplication', generateThreeDigitByOneMultiplicationQuestion, validateThreeDigitByOneMultiplication, 999],
  ['twoDigitByTwoMultiplication', generateTwoDigitByTwoMultiplicationQuestion, validateTwoDigitByTwoMultiplication, 99],
  ['remainderDivision', generateRemainderDivisionQuestion, validateRemainderDivision, 1000],
  ['mixedMulDiv', generateMixedMulDivQuestion, validateMixedMulDiv, 1728]
] as const;

describe('self-contained multiplication and division calculation module', () => {
  it.each(cases)('generates and validates %s with a fixed seed', (type, generate, validate, max) => {
    const question = generate(input(type, max, `multiplication-${type}`));
    expect(question.type).toBe(type);
    expect(validate(question, config)).toEqual({ valid: true, errors: [] });
    expect(generate(input(type, max, `multiplication-${type}`))).toMatchObject({
      type, operands: question.operands, answer: question.answer, signature: question.signature
    });
  });

  it.each(cases)('rejects wrong answer, type, and metadata for %s', (type, generate, validate, max) => {
    const question = generate(input(type, max, `invalid-${type}`));
    const wrongAnswer = typeof question.answer === 'number' ? question.answer + 1 : `${question.answer}错误`;
    expect(validate({ ...question, answer: wrongAnswer } as Question, config).valid).toBe(false);
    const wrongType = type === 'multiplication' ? 'division' : 'multiplication';
    expect(validate({ ...question, type: wrongType } as Question, config).valid).toBe(false);
    expect(validate({ ...question, metadata: { ...question.metadata, magnitude: 'wrong' } }, config).valid).toBe(false);
  });

  it('rejects boundary violations while allowing deduplication by stable signature', () => {
    const valid = generateMultiDigitMultiplicationQuestion(input('multiDigitMultiplication', 100, 'boundary'));
    expect(validateMultiDigitMultiplication({ ...valid, operands: [9, valid.operands[1]] }, config).valid).toBe(false);
    const same = generateThreeDigitByOneMultiplicationQuestion(input('threeDigitByOneMultiplication', 999, 'same-seed'));
    const duplicate = generateThreeDigitByOneMultiplicationQuestion(input('threeDigitByOneMultiplication', 999, 'same-seed'));
    expect(same.signature).toBe(duplicate.signature);
    expect(deduplicate([same, duplicate])).toHaveLength(1);
  });

  it('accepts golden arithmetic and rejects malformed golden boundaries', () => {
    const golden: Array<[Question, (question: Question) => { valid: boolean; errors: string[] }]> = [
      [{ id: 'g1', type: 'multiplication', text: '2 × 3 =', answer: 6, operands: [2, 3], operators: ['×'], signature: 'g1', layout: 'inline', metadata: { factor: 2, trivial: false, magnitude: 6 } }, q => validateMultiplication(q, config)],
      [{ id: 'g2', type: 'division', text: '12 ÷ 3 =', answer: 4, operands: [12, 3], operators: ['÷'], signature: 'g2', layout: 'inline', metadata: { factor: 3, trivial: false, magnitude: 12 } }, q => validateDivision(q, config)],
      [{ id: 'g3', type: 'multiDigitMultiplication', text: '12 × 3 =', answer: 36, operands: [12, 3], operators: ['×'], signature: 'g3', layout: 'inline', metadata: { factor: 3, magnitude: 12, regrouping: false } }, q => validateMultiDigitMultiplication(q, config)],
      [{ id: 'g4', type: 'threeDigitByOneMultiplication', text: '105 × 2 =', answer: 210, operands: [105, 2], operators: ['×'], signature: 'g4', layout: 'inline', metadata: { factor: 2, magnitude: 105, regrouping: true, regroupingCount: 1 } }, q => validateThreeDigitByOneMultiplication(q, config)],
      [{ id: 'g5', type: 'twoDigitByTwoMultiplication', text: '12 × 34 =', answer: 408, operands: [12, 34], operators: ['×'], signature: 'g5', layout: 'inline', metadata: { magnitude: 34, trivial: false } }, q => validateTwoDigitByTwoMultiplication(q, config)],
      [{ id: 'g6', type: 'remainderDivision', text: '17 ÷ 5 =', answer: '3……2', operands: [17, 5], operators: ['÷'], signature: 'g6', layout: 'inline', metadata: { quotient: 3, remainder: 2, magnitude: 17 } }, q => validateRemainderDivision(q, config)],
      [{ id: 'g7', type: 'mixedMulDiv', text: '12 × 3 ÷ 2 =', answer: 18, operands: [12, 3, 2], operators: ['×', '÷'], signature: 'g7', layout: 'inline', metadata: { terms: 3, mixed: true, trivial: false, magnitude: 12 } }, q => validateMixedMulDiv(q, config)]
    ];
    for (const [question, validate] of golden) expect(validate(question), question.type).toEqual({ valid: true, errors: [] });
    expect(validateMultiDigitMultiplication({ ...golden[2][0], operands: [9, 3] }, config).valid).toBe(false);
    expect(validateRemainderDivision({ ...golden[5][0], answer: '3……5' }, config).valid).toBe(false);
  });
});
