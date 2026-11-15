import { id, pick, randomInt } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';
import type { Difficulty, Question } from '../types';
import { sampleInt } from './tuning';

type FillOperator = '+' | '-' | '×' | '÷';
type BlankPosition = 'first' | 'second' | 'result' | 'operator';

function buildExpression(max: number, maxFactor: number, op: FillOperator, highRangeRate: number, random: RandomSource): [number, number, number] {
  if (op === '×') {
    const a = randomInt(2, Math.max(2, maxFactor), random);
    const b = randomInt(2, Math.max(2, maxFactor), random);
    return [a, b, a * b];
  }
  if (op === '÷') {
    const divisor = randomInt(2, Math.max(2, maxFactor), random);
    const quotient = randomInt(2, Math.max(2, maxFactor), random);
    return [divisor * quotient, divisor, quotient];
  }
  if (op === '+') {
    const result = sampleInt(2, Math.max(2, max), highRangeRate, random);
    const a = randomInt(1, Math.max(1, result - 1), random);
    return [a, result - a, result];
  }
  const a = sampleInt(2, Math.max(2, max), highRangeRate, random);
  const b = randomInt(1, Math.max(1, a), random);
  return [a, b, a - b];
}

export function generateFillBlank(
  max: number,
  difficulty: Difficulty = 'standard',
  maxFactor = 9,
  highRangeRate = .5,
  allowMulDiv = true,
  random: RandomSource = Math.random,
  reverse?: boolean
): Question {
  const operations: Record<Difficulty, FillOperator[]> = {
    entry: ['+'],
    easy: ['+', '-'],
    standard: ['+', '-'],
    advanced: ['+', '-', '×', '÷'],
    challenge: ['+', '-', '×', '÷']
  };
  const positions: Record<Difficulty, BlankPosition[]> = {
    entry: ['result'],
    easy: ['result', 'second'],
    standard: ['first', 'second', 'result'],
    advanced: ['first', 'second', 'result', 'operator'],
    challenge: ['first', 'second', 'operator']
  };
  const availableOperations = allowMulDiv ? operations[difficulty] : operations[difficulty].filter(op => op === '+' || op === '-');
  const op = pick(availableOperations, random);
  const reversePositions = positions[difficulty].filter((item): item is Exclude<BlankPosition, 'result'> => item !== 'result');
  const candidatePositions: BlankPosition[] = reverse === true
    ? (reversePositions.length ? reversePositions : ['first', 'second'])
    : reverse === false
      ? ['result']
      : positions[difficulty];
  const position = pick(candidatePositions, random);
  const [a, b, result] = buildExpression(max, maxFactor, op, highRangeRate, random);
  let text: string;
  let answer: number | string;
  if (position === 'first') { text = `□ ${op} ${b} = ${result}`; answer = a; }
  else if (position === 'second') { text = `${a} ${op} □ = ${result}`; answer = b; }
  else if (position === 'operator') { text = `${a} □ ${b} = ${result}`; answer = op; }
  else { text = `${a} ${op} ${b} =`; answer = result; }
  return {
    id: id(random), type: 'fillBlank', text, answer, operands: [a, b, result], operators: [op],
    signature: `fillBlank:${position}:${a}${op}${b}=${result}`, layout: 'inline',
    metadata: { blankPosition: position, operation: op, magnitude: Math.max(a, b, result) }
  };
}
