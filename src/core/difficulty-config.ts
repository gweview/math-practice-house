import type { Difficulty, ProblemProfile, ProblemType, RangeMode, Stage } from './types';
import { getQuestionDefinition } from '../domain/questions/registry';
import { getDefinitionMaximum, resolveProblemProfile } from '../domain/questions/difficulty';

/** Compatibility facade; difficulty data is owned by QuestionDefinition. */
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  entry: '入门', easy: '简单', standard: '标准', advanced: '提高', challenge: '挑战'
};

export function getProblemProfile(
  type: ProblemType,
  difficulty: Difficulty,
  stage: Stage = 'grade3',
  rangeMode: RangeMode = 'free'
): ProblemProfile {
  return resolveProblemProfile(getQuestionDefinition(type), difficulty, stage, rangeMode);
}

/** Compatibility lookup retained while callers move to definition metadata. */
export function getTypeMaximum(type: ProblemType): number {
  return getDefinitionMaximum(getQuestionDefinition(type));
}

export const DIFFICULTY_DESCRIPTIONS: Record<Difficulty, string> = {
  entry: '小数字、直接求结果，保留少量 0 和基础事实',
  easy: '较小数字，少量进退位与逆向填空',
  standard: '完整范围，进退位、题型与数字区间均衡',
  advanced: '高位数字更多，进退位、逆向题与两步题增加',
  challenge: '高位数字为主，避免无效零运算，包含多项与多步推理'
};
