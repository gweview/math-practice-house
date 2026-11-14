import { id, randomInt } from '../random-utils';
import type { RandomSource } from '../../shared/random/seeded-random';
import type { ProblemType, Question } from '../types';
import { sampleInt } from './tuning';

function distinctPair(max: number, highRangeRate: number, random: RandomSource): [number, number] {
  const larger = sampleInt(1, Math.max(1, max), highRangeRate, random);
  const smaller = randomInt(0, Math.max(0, larger - 1), random);
  return random() < .5 ? [larger, smaller] : [smaller, larger];
}

export function generateComparison(
  max: number,
  type: ProblemType = 'compareSigns',
  equalityRate = .2,
  highRangeRate = .5,
  forcedRelation?: '=' | '>' | '<',
  random: RandomSource = Math.random
): Question {
  if (type === 'comparison') {
    const [a, b] = distinctPair(max, highRangeRate, random);
    const answer = Math.max(a, b);
    return {
      id: id(random), type, text: `圈出较大的数：　${a}　${b}`, answer,
      operands: [a, b], signature: `${type}:${a}:${b}`, layout: 'wide',
      metadata: { relation: a > b ? '>' : '<', semantic: 'choose-larger', magnitude: answer }
    };
  }

  let a: number;
  let b: number;
  let answer: '=' | '>' | '<';
  if (forcedRelation === '=' || (!forcedRelation && random() < equalityRate)) {
    a = sampleInt(0, max, highRangeRate, random);
    b = a;
    answer = '=';
  } else {
    [a, b] = distinctPair(max, highRangeRate, random);
    if (forcedRelation === '>' && a < b) [a, b] = [b, a];
    if (forcedRelation === '<' && a > b) [a, b] = [b, a];
    answer = forcedRelation ?? (a > b ? '>' : '<');
  }
  return {
    id: id(random), type, text: `${a}　○　${b}`, answer,
    operands: [a, b], signature: `${type}:${a}:${b}`, layout: 'inline',
    metadata: { relation: answer, semantic: 'insert-sign', magnitude: Math.max(a, b) }
  };
}
