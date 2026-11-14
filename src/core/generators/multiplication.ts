import { id, pick, randomInt } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';
import type { Difficulty, ProblemType, Question } from '../types';

function focusFactors(maxFactor: number, difficulty: Difficulty): number[] {
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

export function generateMultiplication(
  maxFactor: number,
  type: ProblemType = 'multiplication',
  difficulty: Difficulty = 'standard',
  trivialRate = .08,
  random: RandomSource = Math.random
): Question {
  const a = pick(focusFactors(maxFactor, difficulty), random);
  const trivial = random() < trivialRate;
  const b = trivial ? 1 : randomInt(Math.min(2, maxFactor), Math.max(1, maxFactor), random);
  return {
    id: id(random), type, text: `${a} × ${b} =`, answer: a * b,
    operands: [a, b], operators: ['×'], signature: `${type}:${Math.min(a,b)}×${Math.max(a,b)}`, layout: 'inline',
    metadata: { factor: a, trivial: a === 1 || b === 1, magnitude: a * b }
  };
}
