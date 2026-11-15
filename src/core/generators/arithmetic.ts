import { id, randomInt } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';
import type { ProblemType, Question } from '../types';
import { allowTrivial, highFloor } from './tuning';
import { hasAdditionRegrouping, hasSubtractionRegrouping, sampleAddendPair, sampleSubtrahend } from './sampling';

export { hasAdditionRegrouping, hasSubtractionRegrouping } from './sampling';

type ArithmeticLayout = 'inline' | 'vertical';

/** Build an addition/subtraction question from already-sampled operands. */
export function buildArithmeticQuestion(type: ProblemType, a: number, b: number, op: '+' | '-', layout: ArithmeticLayout, random: RandomSource): Question {
  return {
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
  };
}

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
  const sum = randomInt(Math.min(targetFloor, max), max, random);
  if (trivial) return random() < .5 ? buildArithmeticQuestion(type, sum, 0, '+', layout, random) : buildArithmeticQuestion(type, 0, sum, '+', layout, random);

  // Most sums admit a split with the requested regrouping status. The
  // exceptions — sums ending in 9 below 100 for carry, powers of ten for
  // no-carry — are handled by shifting the sum by one, which always admits a
  // valid split. Anything else is an impossible configuration and fails
  // loudly instead of emitting an off-spec question.
  for (const candidate of [sum, sum - 1, sum + 1]) {
    if (candidate < lower || candidate > max) continue;
    const pair = sampleAddendPair(candidate, carry, random);
    if (pair) return buildArithmeticQuestion(type, pair[0], pair[1], '+', layout, random);
  }
  throw new Error(`无法生成和在 ${lower} 到 ${max} 之间的${carry ? '进位' : '不进位'}加法题`);
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
  const minuend = randomInt(Math.min(targetFloor, max), max, random);
  if (trivial) return buildArithmeticQuestion(type, minuend, 0, '-', layout, random);

  // Same shift-by-one rule as addition: minuends ending in 9 below 100 admit
  // no borrowing subtrahend, so the minuend shifts instead of the question
  // degrading into a non-borrowing one.
  for (const candidate of [minuend, minuend - 1, minuend + 1]) {
    if (candidate < lower || candidate > max) continue;
    const subtrahend = sampleSubtrahend(candidate, borrow, random);
    if (subtrahend !== null) return buildArithmeticQuestion(type, candidate, subtrahend, '-', layout, random);
  }
  throw new Error(`无法生成被减数在 ${lower} 到 ${max} 之间的${borrow ? '退位' : '不退位'}减法题`);
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
