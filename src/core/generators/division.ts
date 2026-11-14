import { id, pick, randomInt } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';
import type { Difficulty, ProblemType, Question } from '../types';

function focusDivisors(maxFactor: number, difficulty: Difficulty): number[] {
  const preferred: Record<Difficulty, number[]> = {
    entry: [2, 5],
    easy: [2, 5, 3, 4],
    standard: [2, 3, 4, 5, 6, 7, 8, 9],
    advanced: [6, 7, 8, 9, 3, 4],
    challenge: [6, 7, 8, 9, 10, 11, 12]
  };
  const available = preferred[difficulty].filter(value => value <= maxFactor);
  return available.length ? available : [Math.max(1, maxFactor)];
}

export function generateDivision(
  maxFactor: number,
  type: ProblemType = 'division',
  difficulty: Difficulty = 'standard',
  trivialRate = .08,
  random: RandomSource = Math.random
): Question {
  const divisor = pick(focusDivisors(maxFactor, difficulty), random);
  const trivial = random() < trivialRate;
  const quotient = trivial ? 1 : randomInt(Math.min(2, maxFactor), Math.max(1, maxFactor), random);
  const dividend = divisor * quotient;
  return {
    id: id(random), type, text: `${dividend} ÷ ${divisor} =`, answer: quotient,
    operands: [dividend, divisor], operators: ['÷'], signature: `${type}:${dividend}÷${divisor}`, layout: 'inline',
    metadata: { factor: divisor, trivial: quotient === 1, magnitude: dividend }
  };
}
