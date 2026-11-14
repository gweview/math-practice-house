import { describe, expect, it } from 'vitest';
import type { Question, WorksheetConfig } from '../src/core/types';
import { resolveProblemProfile } from '../src/domain/questions/difficulty';
import {
  answerProtocol, compareAnswers, decimalAnswer, formatAnswer, fractionAnswer, fromLegacyAnswer,
  fromLegacyParts, integerAnswer, multiPartAnswer, parseAnswer, parseAnswerProtocol, parseFractionText,
  percentageAnswer, quantityAnswer, ratioAnswer, comparisonAnswer
} from '../src/domain/questions/answers';
import { getQuestionDefinition } from '../src/domain/questions/registry';
import { createGenerationContext } from '../src/shared/random/seeded-random';

const config = (stage: WorksheetConfig['stage'], type: WorksheetConfig['types'][number]): WorksheetConfig => ({
  stage, rangeMode: 'curriculum', difficulty: 'standard', practiceMode: 'standard', types: [type], count: 1,
  verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true, answerPage: false,
  allowDuplicates: true, randomMix: false, fields: { name: false, date: false, time: false, score: false, streak: false },
  orientation: 'portrait', fontSize: 'standard'
});

function generated(type: Parameters<typeof getQuestionDefinition>[0], stage: WorksheetConfig['stage']): { question: Question; config: WorksheetConfig } {
  const current = config(stage, type);
  const definition = getQuestionDefinition(type);
  const context = createGenerationContext(`answer-golden-${type}`);
  const question = definition.generate({
    type, config: current, profile: resolveProblemProfile(definition, current.difficulty, stage, current.rangeMode),
    random: context.random, createId: context.createId
  });
  return { question, config: current };
}

describe('structured answer protocol', () => {
  it('supports scalar, fixed decimal, fraction, percentage, ratio and comparison answers', () => {
    expect(formatAnswer(integerAnswer(-7))).toBe('-7');
    expect(decimalAnswer('2.675', 2)).toEqual({ kind: 'decimal', value: '2.68', scale: 2 });
    expect(formatAnswer(fractionAnswer(12, 18))).toBe('2/3');
    expect(formatAnswer(fractionAnswer(-5, 2, 'mixed'))).toBe('-2 1/2');
    expect(() => fractionAnswer(1, 2, 'improper')).toThrow();
    expect(formatAnswer(percentageAnswer('12.5', 1))).toBe('12.5%');
    expect(formatAnswer(ratioAnswer(2, 4))).toBe('2:4');
    expect(formatAnswer(comparisonAnswer('<'))).toBe('<');
    expect(compareAnswers(fractionAnswer(1, 2), decimalAnswer('0.50', 2))).toBe(true);
    expect(compareAnswers(ratioAnswer(1, 2), ratioAnswer(2, 4))).toBe(true);
  });

  it('handles negative mixed signs, denominator boundaries and decimal rounding', () => {
    expect(parseFractionText('-0 1/2')).toEqual({ kind: 'fraction', numerator: -1, denominator: 2, form: 'mixed' });
    expect(() => fractionAnswer(1, 0)).toThrow();
    expect(formatAnswer(fractionAnswer(1, -2))).toBe('-1/2');
    expect(parseFractionText('1/-2')).toBeUndefined();
    expect(() => fractionAnswer(3, 2, 'proper')).toThrow();
    expect(decimalAnswer('-2.675', 2).value).toBe('-2.68');
    expect(parseAnswer({ kind: 'decimal', value: '1.2', scale: 3 })).toEqual(decimalAnswer('1.2', 3));
  });

  it('supports units, multi-part answers, steps, legacy scalar fields and safe malformed rejection', () => {
    const quantity = quantityAnswer(decimalAnswer('1.25', 2), '米');
    const multi = multiPartAnswer([integerAnswer(3), quantity, percentageAnswer('25')]);
    const protocol = answerProtocol(multi, { steps: [{ text: '先求总量', result: integerAnswer(3) }] });
    expect(formatAnswer(quantity)).toBe('1.25 米');
    expect(protocol.display).toBe('3；1.25 米；25%');
    expect(parseAnswerProtocol(protocol)).toEqual(protocol);
    expect(fromLegacyAnswer('15 元', { unit: '元' }).value).toEqual(quantityAnswer(integerAnswer(15), '元'));
    expect(fromLegacyParts([{ answer: 3 }, { answer: '25%', steps: ['转化'] }])?.value).toEqual(multiPartAnswer([integerAnswer(3), percentageAnswer(25)]));
    expect(parseAnswer({ kind: 'integer', value: 3, extra: true })).toBeUndefined();
    expect(parseAnswer({ kind: 'fraction', numerator: 1, denominator: 0, form: 'proper' })).toBeUndefined();
    expect(parseAnswer({ kind: 'quantity', value: { kind: 'comparison', value: '=' }, unit: '米' })).toBeUndefined();
    expect(parseAnswer({ kind: 'multiPart', parts: [integerAnswer(1), { kind: 'unknown' }] })).toBeUndefined();
    expect(parseAnswerProtocol({ value: integerAnswer(2), display: '3' })).toBeUndefined();
  });
});

describe('independent category golden fixtures', () => {
  it('checks generator output against hand-computed expectations before validator acceptance', () => {
    const calculation = generated('addition10', 'grade1');
    const [a, b] = calculation.question.operands;
    expect(calculation.question.answer).toBe(a + b);
    expect(calculation.question.answerDetails?.protocol?.value).toEqual(integerAnswer(a + b));
    expect(getQuestionDefinition('addition10').validate(calculation.question, calculation.config, getQuestionDefinition('addition10')).valid).toBe(true);
    const protocol = calculation.question.answerDetails?.protocol;
    expect(protocol).toBeDefined();
    const alteredValue = { ...protocol!, value: integerAnswer(a + b + 1), display: String(a + b + 1) };
    expect(getQuestionDefinition('addition10').validate({ ...calculation.question, answerDetails: { ...calculation.question.answerDetails!, protocol: alteredValue } }, calculation.config, getQuestionDefinition('addition10')).valid).toBe(false);
    const alteredDisplay = { ...protocol!, display: '篡改' };
    expect(getQuestionDefinition('addition10').validate({ ...calculation.question, answerDetails: { ...calculation.question.answerDetails!, protocol: alteredDisplay } }, calculation.config, getQuestionDefinition('addition10')).valid).toBe(false);
    const extraField = { ...protocol!, extra: true } as unknown as NonNullable<typeof protocol>;
    expect(getQuestionDefinition('addition10').validate({ ...calculation.question, answerDetails: { ...calculation.question.answerDetails!, protocol: extraField } }, calculation.config, getQuestionDefinition('addition10')).valid).toBe(false);
    const malformedProtocol = { ...protocol!, value: { kind: 'integer', value: Number.NaN }, display: 'NaN' } as unknown as NonNullable<typeof protocol>;
    expect(() => getQuestionDefinition('addition10').validate({ ...calculation.question, answer: Number.NaN, answerDetails: { ...calculation.question.answerDetails!, protocol: malformedProtocol } }, calculation.config, getQuestionDefinition('addition10'))).not.toThrow();
    expect(getQuestionDefinition('addition10').validate({ ...calculation.question, answer: Number.NaN, answerDetails: { ...calculation.question.answerDetails!, protocol: malformedProtocol } }, calculation.config, getQuestionDefinition('addition10')).valid).toBe(false);

    const concept = generated('compareSigns', 'grade1');
    const [left, right] = concept.question.operands;
    const relation = left === right ? '=' : left > right ? '>' : '<';
    expect(concept.question.answer).toBe(relation);
    expect(getQuestionDefinition('compareSigns').validate(concept.question, concept.config, getQuestionDefinition('compareSigns')).valid).toBe(true);

    const geometry = generated('perimeter', 'grade4');
    const [length, width] = geometry.question.operands;
    expect(geometry.question.answer).toBe(2 * (length + width));
    expect(getQuestionDefinition('perimeter').validate(geometry.question, geometry.config, getQuestionDefinition('perimeter')).valid).toBe(true);

    const data = generated('average', 'grade4');
    const dataExpected = data.question.operands.reduce((sum, value) => sum + value, 0) / data.question.operands.length;
    expect(data.question.answer).toBe(dataExpected);
    expect(getQuestionDefinition('average').validate(data.question, data.config, getQuestionDefinition('average')).valid).toBe(true);

    const application = generated('priceQuantityTotal', 'grade4');
    expect(application.question.answer).toBe(`${application.question.operands[0] * application.question.operands[1]} 元`);
    expect(getQuestionDefinition('priceQuantityTotal').validate(application.question, application.config, getQuestionDefinition('priceQuantityTotal')).valid).toBe(true);
  });
});
