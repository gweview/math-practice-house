import { generateAddition, generateNoBorrowSubtraction, generateNoCarryAddition, generateSubtraction, hasAdditionRegrouping, hasSubtractionRegrouping } from '../../core/generators/arithmetic';
import { highFloor, sampleInt } from '../../core/generators/tuning';
import { attachCreateId, randomInt, shuffle } from '../../core/random-utils';
import { answerProtocol, compareAnswerProtocols, fromLegacyAnswer, integerAnswer, parseAnswerProtocol } from '../../domain/questions/answers';
import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import type { Question } from '../../domain/questions/model';
import type { WorksheetConfig } from '../../domain/worksheet/config';
import type { RandomSource } from '../../shared/random/seeded-random';

type BasicType =
  | 'addition10' | 'subtraction10' | 'addition20NoCarry' | 'subtraction20NoBorrow'
  | 'addition20Carry' | 'subtraction20Borrow' | 'addition100' | 'subtraction100'
  | 'twoDigitCarry' | 'twoDigitBorrow' | 'addition1000' | 'subtraction1000'
  | 'chainAddition' | 'chainSubtraction' | 'mixedAddSub' | 'mixedFour';

function effectiveInput(input: QuestionGenerationInput): QuestionGenerationInput {
  const directive = input.directive;
  return {
    ...input,
    profile: {
      ...input.profile,
      highRangeRate: directive?.highRange === undefined ? input.profile.highRangeRate : Number(directive.highRange),
      trivialRate: directive?.trivial === undefined ? input.profile.trivialRate : Number(directive.trivial),
      mixedRate: directive?.mixed === undefined ? input.profile.mixedRate : Number(directive.mixed)
    }
  };
}

function evaluate(operands: number[], operators: string[]): number {
  const values = [...operands];
  const ops = [...operators];
  for (let index = 0; index < ops.length;) {
    if (ops[index] === '×' || ops[index] === '÷') {
      values.splice(index, 2, ops[index] === '×' ? values[index] * values[index + 1] : values[index] / values[index + 1]);
      ops.splice(index, 1);
    } else index++;
  }
  return ops.reduce((result, op, index) => op === '+' ? result + values[index + 1] : result - values[index + 1], values[0]);
}

function expressionQuestion(input: QuestionGenerationInput, type: BasicType, operands: number[], operators: string[]): Question {
  const text = operands.map((value, index) => index ? `${operators[index - 1]} ${value}` : String(value)).join(' ') + ' =';
  const answer = evaluate(operands, operators);
  return {
    id: input.createId(), type, text, answer, operands, operators,
    signature: `${type}:${text}`, layout: text.length > 15 ? 'wide' : 'inline',
    answerDetails: { display: String(answer), protocol: answerProtocol(integerAnswer(answer)) },
    metadata: {
      terms: operands.length,
      mixed: new Set(operators).size > 1,
      trivial: operands.some(value => value === 0),
      magnitude: Math.max(...operands)
    }
  };
}

function partition(total: number, count: number, includeZero: boolean, random: RandomSource): number[] {
  if (includeZero && count > 1) return shuffle([0, ...partition(total, count - 1, false, random)], random);
  const minimum = includeZero ? 0 : 1;
  const parts: number[] = [];
  let remaining = total;
  for (let index = 0; index < count - 1; index++) {
    const maxPart = remaining - minimum * (count - index - 1);
    const value = randomInt(minimum, Math.max(minimum, maxPart), random);
    parts.push(value);
    remaining -= value;
  }
  parts.push(remaining);
  return shuffle(parts, random);
}

function chain(input: QuestionGenerationInput, subtraction: boolean): Question {
  const prepared = effectiveInput(input);
  const { profile, random } = prepared;
  const terms = profile.terms;
  const includeZero = random() < profile.trivialRate;
  if (subtraction) {
    const first = sampleInt(Math.max(terms, profile.min), profile.max, profile.highRangeRate, random);
    const deduction = randomInt(Math.max(1, includeZero ? terms - 2 : terms - 1), first, random);
    return expressionQuestion(prepared, 'chainSubtraction', [first, ...partition(deduction, terms - 1, includeZero, random)], Array(terms - 1).fill('-'));
  }
  const minimumTotal = includeZero ? terms - 1 : terms;
  const floor = random() < profile.highRangeRate ? highFloor(minimumTotal, profile.max) : minimumTotal;
  return expressionQuestion(prepared, 'chainAddition', partition(randomInt(Math.min(floor, profile.max), profile.max, random), terms, includeZero, random), Array(terms - 1).fill('+'));
}

function mixedAddSub(input: QuestionGenerationInput): Question {
  const prepared = effectiveInput(input);
  const { profile, random } = prepared;
  const terms = profile.terms;
  const requireMix = terms >= 3 && random() < profile.mixedRate;
  if (!requireMix) {
    const includeZero = random() < profile.trivialRate;
    if (random() < .5) {
      const minimum = includeZero ? terms - 1 : terms;
      const floor = random() < profile.highRangeRate ? highFloor(minimum, profile.max) : minimum;
      return expressionQuestion(prepared, 'mixedAddSub', partition(randomInt(Math.min(floor, profile.max), profile.max, random), terms, includeZero, random), Array(terms - 1).fill('+'));
    }
    const first = sampleInt(Math.max(terms, profile.min), profile.max, profile.highRangeRate, random);
    const deduction = randomInt(Math.max(1, includeZero ? terms - 2 : terms - 1), first, random);
    return expressionQuestion(prepared, 'mixedAddSub', [first, ...partition(deduction, terms - 1, includeZero, random)], Array(terms - 1).fill('-'));
  }
  const operands = [sampleInt(Math.max(2, Math.ceil(profile.max / 3)), profile.max, profile.highRangeRate, random)];
  const operators: string[] = [];
  let result = operands[0];
  const allowZero = random() < profile.trivialRate;
  for (let index = 1; index < terms; index++) {
    let operator = index % 2 ? '-' : '+';
    const minimum = allowZero ? 0 : 1;
    if (operator === '+' && profile.max - result < minimum) operator = '-';
    if (operator === '-' && result < minimum) operator = '+';
    const value = randomInt(minimum, Math.max(minimum, operator === '+' ? profile.max - result : result), random);
    operands.push(value);
    operators.push(operator);
    result = operator === '+' ? result + value : result - value;
  }
  return expressionQuestion(prepared, 'mixedAddSub', operands, operators);
}

function mixedFour(input: QuestionGenerationInput): Question {
  const prepared = effectiveInput(input);
  const { profile, random } = prepared;
  const factor = Math.max(2, Math.min(9, profile.maxFactor));
  const b = randomInt(2, factor, random);
  const c = randomInt(2, factor, random);
  const product = b * c;
  const a = randomInt(profile.trivialRate > random() ? 0 : 1, Math.max(1, profile.max - product), random);
  if (profile.terms >= 4) {
    const subtotal = a + product;
    const d = randomInt(1, Math.max(1, subtotal), random);
    return expressionQuestion(prepared, 'mixedFour', [a, b, c, d], ['+', '×', '-']);
  }
  if (random() < .5) return expressionQuestion(prepared, 'mixedFour', [a, b, c], ['+', '×']);
  return expressionQuestion(prepared, 'mixedFour', [randomInt(product, Math.max(product, profile.max), random), b, c], ['-', '×']);
}

function twoDigit(input: QuestionGenerationInput, subtraction: boolean): Question {
  const prepared = effectiveInput(input);
  const candidateRandom = attachCreateId(prepared.random, () => '');
  for (let attempt = 0; attempt < 300; attempt++) {
    const question = subtraction
      ? generateSubtraction(prepared.profile.max, true, 'twoDigitBorrow', 'inline', 10, prepared.profile.highRangeRate, 0, candidateRandom)
      : generateAddition(prepared.profile.max, true, 'twoDigitCarry', 'inline', 10, prepared.profile.highRangeRate, 0, candidateRandom);
    if (question.operands.every(value => value >= 10)) return { ...question, id: prepared.createId() };
  }
  const question = subtraction
    ? generateSubtraction(prepared.profile.max, true, 'twoDigitBorrow', 'inline', 10, prepared.profile.highRangeRate, 0, candidateRandom)
    : generateAddition(prepared.profile.max, true, 'twoDigitCarry', 'inline', 10, prepared.profile.highRangeRate, 0, candidateRandom);
  return { ...question, id: prepared.createId() };
}

function addition(input: QuestionGenerationInput, type: 'addition10' | 'addition20Carry' | 'addition100' | 'addition1000', carry?: boolean): Question {
  const prepared = effectiveInput(input);
  const directiveCarry = prepared.directive?.carry;
  const requestedCarry = directiveCarry === undefined ? (carry ?? prepared.random() < prepared.profile.carryRate) : Boolean(directiveCarry);
  return generateAddition(prepared.profile.max, requestedCarry, type, 'inline', prepared.profile.min, prepared.profile.highRangeRate, prepared.profile.trivialRate, attachCreateId(prepared.random, prepared.createId));
}

function subtraction(input: QuestionGenerationInput, type: 'subtraction10' | 'subtraction20Borrow' | 'subtraction100' | 'subtraction1000', borrow?: boolean): Question {
  const prepared = effectiveInput(input);
  const directiveCarry = prepared.directive?.carry;
  const requestedBorrow = directiveCarry === undefined ? (borrow ?? prepared.random() < prepared.profile.carryRate) : Boolean(directiveCarry);
  return generateSubtraction(prepared.profile.max, requestedBorrow, type, 'inline', prepared.profile.min, prepared.profile.highRangeRate, prepared.profile.trivialRate, attachCreateId(prepared.random, prepared.createId));
}

function withIntegerProtocol(question: Question): Question {
  if (typeof question.answer !== 'number' || !Number.isSafeInteger(question.answer)) return question;
  return { ...question, answerDetails: { display: String(question.answer), protocol: answerProtocol(integerAnswer(question.answer)) } };
}

export const generateAddition10 = (input: QuestionGenerationInput): Question => withIntegerProtocol(addition(input, 'addition10', Boolean(input.directive?.carry)));
export const generateSubtraction10 = (input: QuestionGenerationInput): Question => subtraction(input, 'subtraction10', Boolean(input.directive?.carry));
export const generateAddition20NoCarry = (input: QuestionGenerationInput): Question => { const prepared = effectiveInput(input); return generateNoCarryAddition(prepared.profile.max, 'addition20NoCarry', 'inline', prepared.profile.highRangeRate, prepared.profile.trivialRate, prepared.profile.min, attachCreateId(prepared.random, prepared.createId)); };
export const generateSubtraction20NoBorrow = (input: QuestionGenerationInput): Question => { const prepared = effectiveInput(input); return generateNoBorrowSubtraction(prepared.profile.max, 'subtraction20NoBorrow', 'inline', prepared.profile.highRangeRate, prepared.profile.trivialRate, prepared.profile.min, attachCreateId(prepared.random, prepared.createId)); };
export const generateAddition20Carry = (input: QuestionGenerationInput): Question => addition(input, 'addition20Carry', true);
export const generateSubtraction20Borrow = (input: QuestionGenerationInput): Question => subtraction(input, 'subtraction20Borrow', true);
export const generateAddition100 = (input: QuestionGenerationInput): Question => addition(input, 'addition100');
export const generateSubtraction100 = (input: QuestionGenerationInput): Question => subtraction(input, 'subtraction100');
export const generateAddition1000 = (input: QuestionGenerationInput): Question => addition(input, 'addition1000');
export const generateSubtraction1000 = (input: QuestionGenerationInput): Question => subtraction(input, 'subtraction1000');
export const generateTwoDigitCarry = (input: QuestionGenerationInput): Question => twoDigit(input, false);
export const generateTwoDigitBorrow = (input: QuestionGenerationInput): Question => twoDigit(input, true);
export const generateChainAddition = (input: QuestionGenerationInput): Question => chain(input, false);
export const generateChainSubtraction = (input: QuestionGenerationInput): Question => chain(input, true);
export const generateMixedAddSub = (input: QuestionGenerationInput): Question => mixedAddSub(input);
export const generateMixedFour = (input: QuestionGenerationInput): Question => mixedFour(input);

function metadataValid(question: Question): string[] {
  const errors: string[] = [];
  const metadata = question.metadata;
  if (!metadata) return errors;
  const expectedMixed = new Set(question.operators ?? []).size > 1;
  const expectedTrivial = question.operands.some(value => value === 0);
  const allSubtraction = (question.operators ?? [])[0] === '-' && (question.operators ?? []).every(operator => operator === '-');
  const expressionFamily = question.type === 'chainAddition' || question.type === 'chainSubtraction' || question.type === 'mixedAddSub' || question.type === 'mixedFour';
  const expectedMagnitude = expressionFamily ? Math.max(...question.operands) : allSubtraction ? question.operands[0] : evaluate(question.operands, question.operators ?? []);
  if (metadata.terms !== undefined && metadata.terms !== question.operands.length) errors.push('项数元数据错误');
  if (metadata.mixed !== undefined && metadata.mixed !== expectedMixed) errors.push('混合运算元数据错误');
  if (metadata.trivial !== undefined && metadata.trivial !== expectedTrivial) errors.push('简单题元数据错误');
  if (metadata.magnitude !== undefined && metadata.magnitude !== expectedMagnitude) errors.push('数量级元数据错误');
  return errors;
}

export function validateBasicQuestion(question: Question, config: WorksheetConfig, definition?: QuestionDefinition): QuestionValidationResult {
  void config;
  const errors: string[] = [];
  const fixedBinary = ['addition10', 'subtraction10', 'addition20NoCarry', 'subtraction20NoBorrow', 'addition20Carry', 'subtraction20Borrow', 'addition100', 'subtraction100', 'twoDigitCarry', 'twoDigitBorrow', 'addition1000', 'subtraction1000'].includes(question.type);
  if (fixedBinary && question.operands.length !== 2) errors.push('操作数个数无效');
  const operators = question.operators ?? [];
  if (!question.operands.every(value => Number.isFinite(value) && value >= 0)) errors.push('操作数无效');
  if (!operators.length || evaluate(question.operands, operators) !== question.answer) errors.push('答案错误');
  const [a, b] = question.operands;
  if (['addition20Carry', 'twoDigitCarry'].includes(question.type) && !hasAdditionRegrouping(a, b)) errors.push('题目没有进位');
  if (['subtraction20Borrow', 'twoDigitBorrow'].includes(question.type) && !hasSubtractionRegrouping(a, b)) errors.push('题目没有退位');
  if (['addition20NoCarry', 'subtraction20NoBorrow'].includes(question.type)) {
    const regrouping = question.type === 'addition20NoCarry' ? hasAdditionRegrouping(a, b) : hasSubtractionRegrouping(a, b);
    if (regrouping) errors.push('题目包含进退位');
  }
  if (['twoDigitCarry', 'twoDigitBorrow'].includes(question.type) && (a < 10 || b < 10)) errors.push('操作数不是两位数');
  if (question.type === 'mixedAddSub' && question.operands.length < 2) errors.push('混合运算项数无效');
  if (question.type === 'mixedFour' && !question.operands.length) errors.push('四则混合项数无效');
  if (question.answerDetails?.protocol !== undefined) {
    const parsed = parseAnswerProtocol(question.answerDetails.protocol);
    const legacyDetails = { display: question.answerDetails.display, compact: question.answerDetails.compact, steps: question.answerDetails.steps, unit: question.answerDetails.unit };
    let expected: ReturnType<typeof fromLegacyAnswer> | undefined;
    try {
      expected = fromLegacyAnswer(question.answer, legacyDetails);
    } catch {
      expected = undefined;
    }
    if (!parsed || !expected || !compareAnswerProtocols(parsed, expected)) errors.push('答案协议错误');
  }
  const maximum = definition?.difficultyProfiles.standard?.max;
  if (Number.isFinite(maximum) && question.operands.some(value => value > (maximum as number))) errors.push('题目超过该题型难度上限');
  errors.push(...metadataValid(question));
  return { valid: errors.length === 0, errors };
}

function validatorFor(type: BasicType): QuestionValidator {
  return (question, config, definition) => question.type === type
    ? validateBasicQuestion(question, config, definition)
    : { valid: false, errors: [`校验器题型不匹配：${type}`] };
}

export const validateAddition10 = validatorFor('addition10');
export const validateSubtraction10 = validatorFor('subtraction10');
export const validateAddition20NoCarry = validatorFor('addition20NoCarry');
export const validateSubtraction20NoBorrow = validatorFor('subtraction20NoBorrow');
export const validateAddition20Carry = validatorFor('addition20Carry');
export const validateSubtraction20Borrow = validatorFor('subtraction20Borrow');
export const validateAddition100 = validatorFor('addition100');
export const validateSubtraction100 = validatorFor('subtraction100');
export const validateTwoDigitCarry = validatorFor('twoDigitCarry');
export const validateTwoDigitBorrow = validatorFor('twoDigitBorrow');
export const validateAddition1000 = validatorFor('addition1000');
export const validateSubtraction1000 = validatorFor('subtraction1000');
export const validateChainAddition = validatorFor('chainAddition');
export const validateChainSubtraction = validatorFor('chainSubtraction');
export const validateMixedAddSub = validatorFor('mixedAddSub');
export const validateMixedFour = validatorFor('mixedFour');

export type { BasicType };
