import { id, pick, randomInt } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';
import type { Difficulty, Question } from '../types';
import { sampleInt } from './tuning';
import { UNIT_FACTORS } from '../../domain/math-core/constants';

type ArithmeticLayout = 'inline' | 'vertical';

export function generateMultiDigitMultiplication(
  max: number,
  difficulty: Difficulty,
  highRangeRate: number,
  layout: ArithmeticLayout,
  random: RandomSource = Math.random
): Question {
  const upper = Math.max(10, Math.min(99, max));
  const a = sampleInt(10, upper, highRangeRate, random);
  const factorFloor = difficulty === 'entry' ? 2 : difficulty === 'easy' ? 2 : difficulty === 'standard' ? 3 : 5;
  const b = randomInt(factorFloor, 9, random);
  return {
    id: id(random), type: 'multiDigitMultiplication', text: `${a} × ${b} =`, answer: a * b,
    operands: [a, b], operators: ['×'], signature: `multiDigitMultiplication:${a}×${b}`, layout,
    metadata: { factor: b, magnitude: a, regrouping: a % 10 * b >= 10 }
  };
}

function multiplicationRegroupingCount(multiplicand: number, multiplier: number): number {
  let value = multiplicand;
  let carry = 0;
  let count = 0;
  while (value > 0) {
    const total = (value % 10) * multiplier + carry;
    if (total >= 10) count++;
    carry = Math.floor(total / 10);
    value = Math.floor(value / 10);
  }
  return count;
}

export function generateThreeDigitByOneMultiplication(
  max: number,
  difficulty: Difficulty,
  highRangeRate: number,
  layout: ArithmeticLayout,
  random: RandomSource = Math.random
): Question {
  const upper = Math.max(100, Math.min(999, max));
  const multiplicand = sampleInt(100, upper, highRangeRate, random);
  const multiplierFloor = difficulty === 'entry' || difficulty === 'easy' ? 2 : difficulty === 'standard' ? 3 : 5;
  const multiplier = randomInt(multiplierFloor, 9, random);
  const regroupingCount = multiplicationRegroupingCount(multiplicand, multiplier);
  return {
    id: id(random), type: 'threeDigitByOneMultiplication', text: `${multiplicand} × ${multiplier} =`,
    answer: multiplicand * multiplier, operands: [multiplicand, multiplier], operators: ['×'],
    signature: `threeDigitByOneMultiplication:${multiplicand}×${multiplier}`, layout,
    metadata: { factor: multiplier, magnitude: multiplicand, regrouping: regroupingCount > 0, regroupingCount }
  };
}

export function generateTwoDigitByTwoMultiplication(
  max: number,
  highRangeRate: number,
  layout: ArithmeticLayout,
  random: RandomSource = Math.random
): Question {
  const upper = Math.max(10, Math.min(99, max));
  const left = sampleInt(10, upper, highRangeRate, random);
  const right = sampleInt(10, upper, highRangeRate, random);
  return {
    id: id(random), type: 'twoDigitByTwoMultiplication', text: `${left} × ${right} =`,
    answer: left * right, operands: [left, right], operators: ['×'],
    signature: `twoDigitByTwoMultiplication:${Math.min(left, right)}×${Math.max(left, right)}`, layout,
    metadata: { magnitude: Math.max(left, right), trivial: false }
  };
}

export function generateRemainderDivision(max: number, difficulty: Difficulty, random: RandomSource = Math.random): Question {
  const divisorMin = difficulty === 'entry' ? 2 : difficulty === 'easy' ? 2 : 3;
  const divisor = randomInt(divisorMin, 9, random);
  const remainder = randomInt(1, divisor - 1, random);
  const quotientMax = Math.max(1, Math.min(99, Math.floor((max - remainder) / divisor)));
  const quotientMin = difficulty === 'advanced' || difficulty === 'challenge' ? Math.min(10, quotientMax) : 1;
  const quotient = randomInt(quotientMin, quotientMax, random);
  const dividend = divisor * quotient + remainder;
  return {
    id: id(random), type: 'remainderDivision', text: `${dividend} ÷ ${divisor} =`, answer: `${quotient}……${remainder}`,
    operands: [dividend, divisor], operators: ['÷'], signature: `remainderDivision:${dividend}÷${divisor}`, layout: 'inline',
    metadata: { quotient, remainder, magnitude: dividend }
  };
}

const CONVERSIONS = [
  { large: '米', small: '厘米', factor: UNIT_FACTORS.length['米:厘米'].toNumber() },
  { large: '千米', small: '米', factor: UNIT_FACTORS.length['千米:米'].toNumber() },
  { large: '千克', small: '克', factor: UNIT_FACTORS.mass['千克:克'].toNumber() },
  { large: '元', small: '角', factor: UNIT_FACTORS.money['元:角'].toNumber() },
  { large: '小时', small: '分钟', factor: UNIT_FACTORS.time['小时:分钟'].toNumber() },
  { large: '米', small: '分米', factor: UNIT_FACTORS.length['米:分米'].toNumber() },
  { large: '分米', small: '厘米', factor: UNIT_FACTORS.length['分米:厘米'].toNumber() },
  { large: '厘米', small: '毫米', factor: UNIT_FACTORS.length['厘米:毫米'].toNumber() },
  { large: '吨', small: '千克', factor: UNIT_FACTORS.mass['吨:千克'].toNumber() },
  { large: '升', small: '毫升', factor: UNIT_FACTORS.volume['升:毫升'].toNumber() },
  { large: '分钟', small: '秒', factor: UNIT_FACTORS.time['分钟:秒'].toNumber() },
  { large: '角', small: '分', factor: UNIT_FACTORS.money['角:分'].toNumber() }
] as const;

export function generateUnitConversion(difficulty: Difficulty, max = 12000, random: RandomSource = Math.random): Question {
  // The smallest supported factor is 10 (元↔角).  Profiles normally expose a
  // minimumMax of 10, but direct callers and migrated configs can be smaller;
  // clamp the range so we never select from an empty candidate list.
  const effectiveMax = Math.max(10, Number.isFinite(max) ? max : 12000);
  const conversion = pick(CONVERSIONS.filter(item => item.factor <= effectiveMax), random);
  const reverse = (difficulty === 'advanced' || difficulty === 'challenge') && random() < .55;
  const valueMax = Math.max(1, Math.min(difficulty === 'challenge' ? 12 : 9, Math.floor(effectiveMax / conversion.factor)));
  const value = randomInt(valueMax >= 2 ? 2 : 1, valueMax, random);
  if (reverse) {
    const total = value * conversion.factor;
    return {
      id: id(random), type: 'unitConversion', text: `${total} ${conversion.small} = □ ${conversion.large}`, answer: value,
      operands: [total, conversion.factor], operators: ['÷'], signature: `unit:${conversion.small}:${total}`, layout: 'inline',
      metadata: { direction: 'small-to-large', unit: conversion.small, magnitude: total }
    };
  }
  return {
    id: id(random), type: 'unitConversion', text: `${value} ${conversion.large} = □ ${conversion.small}`, answer: value * conversion.factor,
    operands: [value, conversion.factor], operators: ['×'], signature: `unit:${conversion.large}:${value}`, layout: 'inline',
    metadata: { direction: 'large-to-small', unit: conversion.large, magnitude: value * conversion.factor }
  };
}

function fractionRelation(a: number, b: number, c: number, d: number): '<' | '>' | '=' {
  const left = a * d, right = c * b;
  return left === right ? '=' : left > right ? '>' : '<';
}

export function generateFractionComparison(
  maxDenominator: number,
  difficulty: Difficulty,
  equalityRate: number,
  random: RandomSource = Math.random
): Question {
  const maxD = Math.max(4, Math.min(12, maxDenominator));
  let a: number, b: number, c: number, d: number;
  if (random() < equalityRate) {
    b = randomInt(2, Math.max(2, Math.floor(maxD / 2)), random);
    a = randomInt(1, b - 1, random);
    const multiplier = randomInt(2, Math.max(2, Math.floor(maxD / b)), random);
    c = a * multiplier; d = b * multiplier;
  } else if (difficulty === 'entry' || random() < .4) {
    b = d = randomInt(3, maxD, random);
    a = randomInt(1, b - 1, random);
    do c = randomInt(1, d - 1, random); while (c === a);
  } else if (difficulty === 'easy' || random() < .4) {
    a = c = randomInt(1, Math.max(1, Math.floor(maxD / 2)), random);
    b = randomInt(a + 1, maxD, random);
    do d = randomInt(c + 1, maxD, random); while (d === b);
  } else {
    do {
      b = randomInt(2, maxD, random); d = randomInt(2, maxD, random);
      a = randomInt(1, b - 1, random); c = randomInt(1, d - 1, random);
    } while (a * d === c * b);
  }
  const answer = fractionRelation(a, b, c, d);
  return {
    id: id(random), type: 'fractionComparison', text: `${a}/${b}　○　${c}/${d}`, answer,
    operands: [a, b, c, d], signature: `fraction:${a}/${b}:${c}/${d}`, layout: 'inline',
    metadata: { relation: answer, denominator: Math.max(b, d), semantic: 'fraction-comparison' }
  };
}

export function generatePerimeter(max: number, highRangeRate: number, random: RandomSource = Math.random): Question {
  if (random() < .35) {
    const side = sampleInt(2, Math.max(2, Math.min(30, max)), highRangeRate, random);
    return {
      id: id(random), type: 'perimeter', text: `一个正方形的边长是 ${side} 厘米，它的周长是多少厘米？`,
      answer: side * 4, operands: [side], signature: `perimeter:square:${side}`, layout: 'word',
      metadata: { shape: 'square', semantic: 'perimeter', magnitude: side }
    };
  }
  const length = sampleInt(3, Math.max(3, Math.min(40, max)), highRangeRate, random);
  const width = randomInt(2, Math.max(2, length - 1), random);
  return {
    id: id(random), type: 'perimeter', text: `一个长方形长 ${length} 厘米，宽 ${width} 厘米，它的周长是多少厘米？`,
    answer: (length + width) * 2, operands: [length, width], signature: `perimeter:rectangle:${length}:${width}`, layout: 'word',
    metadata: { shape: 'rectangle', semantic: 'perimeter', magnitude: length }
  };
}
