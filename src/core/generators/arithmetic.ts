import { id, randomInt } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';
import type { ProblemType, Question } from '../types';
import { allowTrivial, highFloor } from './tuning';

type ArithmeticLayout = 'inline' | 'vertical';

export function hasAdditionRegrouping(a: number, b: number): boolean {
  while (a > 0 || b > 0) {
    if (a % 10 + b % 10 >= 10) return true;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return false;
}

export function hasSubtractionRegrouping(a: number, b: number): boolean {
  while (a > 0 || b > 0) {
    if (a % 10 < b % 10) return true;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return false;
}

function requiresCarryForPositiveSum(value: number): boolean {
  if (value < 10) return false;
  while (value % 10 === 0) value = Math.floor(value / 10);
  return value === 1;
}

const make = (type: ProblemType, a: number, b: number, op: '+' | '-', layout: ArithmeticLayout, random: RandomSource): Question => ({
  id: id(random),
  type,
  text: `${a} ${op} ${b} =`,
  answer: op === '+' ? a + b : a - b,
  operands: [a, b],
  operators: [op],
  signature: `${type}:${a}${op}${b}`,
  layout,
  metadata: {
    regrouping: op === '+' ? hasAdditionRegrouping(a, b) : hasSubtractionRegrouping(a, b),
    trivial: a === 0 || b === 0,
    magnitude: op === '+' ? a + b : a
  }
});

export function generateAddition(
  max: number,
  carry: boolean,
  type: ProblemType = 'addition100',
  layout: ArithmeticLayout = 'inline',
  min = 0,
  highRangeRate = .3,
  trivialRate = .1,
  random: RandomSource = Math.random
): Question {
  const trivial = !carry && allowTrivial(trivialRate, random);
  const lower = Math.max(min, carry ? 10 : trivial ? 0 : 2);
  const targetFloor = random() < highRangeRate ? highFloor(lower, max) : lower;
  let sum = randomInt(Math.min(targetFloor, max), max, random);
  if (carry) {
    for (let i = 0; i < 50 && sum % 10 === 9; i++) sum = randomInt(Math.min(targetFloor, max), max, random);
    if (sum % 10 === 9) sum = Math.max(10, sum - 1);
  } else if (!trivial) {
    for (let i = 0; i < 50 && requiresCarryForPositiveSum(sum); i++) sum = randomInt(Math.min(targetFloor, max), max, random);
    if (requiresCarryForPositiveSum(sum)) sum = Math.max(lower, sum - 1);
  }
  if (trivial) return random() < .5 ? make(type, sum, 0, '+', layout, random) : make(type, 0, sum, '+', layout, random);

  for (let i = 0; i < 300; i++) {
    const a = randomInt(1, Math.max(1, sum - 1), random);
    const b = sum - a;
    if (b < 1) continue;
    if (hasAdditionRegrouping(a, b) === carry) return make(type, a, b, '+', layout, random);
  }

  for (let a = 1; a < sum; a++) {
    const b = sum - a;
    if (hasAdditionRegrouping(a, b) === carry) return make(type, a, b, '+', layout, random);
  }
  return carry ? make(type, 9, Math.max(1, sum - 9), '+', layout, random) : make(type, Math.max(1, sum - 1), Math.min(1, sum), '+', layout, random);
}

export function generateSubtraction(
  max: number,
  borrow: boolean,
  type: ProblemType = 'subtraction100',
  layout: ArithmeticLayout = 'inline',
  min = 0,
  highRangeRate = .3,
  trivialRate = .1,
  random: RandomSource = Math.random
): Question {
  const trivial = !borrow && allowTrivial(trivialRate, random);
  const lower = Math.max(min, borrow ? 10 : trivial ? 0 : 2);
  const targetFloor = random() < highRangeRate ? highFloor(lower, max) : lower;
  let a = randomInt(Math.min(targetFloor, max), max, random);
  if (borrow) {
    for (let i = 0; i < 50 && a % 10 === 9; i++) a = randomInt(Math.min(targetFloor, max), max, random);
    if (a % 10 === 9) a = Math.max(10, a - 1);
  }
  if (trivial) return make(type, a, 0, '-', layout, random);

  for (let i = 0; i < 300; i++) {
    const b = randomInt(1, Math.max(1, a), random);
    if (hasSubtractionRegrouping(a, b) === borrow) return make(type, a, b, '-', layout, random);
  }
  for (let b = 1; b <= a; b++) {
    if (hasSubtractionRegrouping(a, b) === borrow) return make(type, a, b, '-', layout, random);
  }
  return borrow ? make(type, Math.max(10, a), Math.min(Math.max(1, a % 10 + 1), a), '-', layout, random) : make(type, a, Math.min(a, 1), '-', layout, random);
}

export function generateNoCarryAddition(
  max: number,
  type: ProblemType,
  layout: ArithmeticLayout = 'inline',
  highRangeRate = .3,
  trivialRate = .1,
  min = 0,
  random: RandomSource = Math.random
): Question {
  return generateAddition(max, false, type, layout, min, highRangeRate, trivialRate, random);
}

export function generateNoBorrowSubtraction(
  max: number,
  type: ProblemType,
  layout: ArithmeticLayout = 'inline',
  highRangeRate = .3,
  trivialRate = .1,
  min = 0,
  random: RandomSource = Math.random
): Question {
  return generateSubtraction(max, false, type, layout, min, highRangeRate, trivialRate, random);
}
