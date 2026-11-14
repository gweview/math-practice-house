import type { QuestionDefinition, QuestionGenerationInput, QuestionValidationResult, QuestionValidator } from '../../domain/questions/contracts';
import type { Question } from '../../domain/questions/model';
import type { WorksheetConfig } from '../../domain/worksheet/config';
import type { RandomSource } from '../../shared/random/seeded-random';
import { questionDefinition, difficultyProfiles, GRADE_3_PLUS, WIDE } from '../manifests/_shared';

/**
 * Likelihood language for grade 3 （一定 / 可能 / 不可能）: the built-in
 * `probability` type is grade 5+ and only compares two counts, while the
 * taxonomy introduces likelihood language in grade 3. Text-only scenarios
 * with unambiguous classifications used in primary textbooks.
 */

type Likelihood = '一定' | '可能' | '不可能';

const SCENARIOS: ReadonlyArray<{ text: string; category: Likelihood }> = [
  { text: '太阳每天从东方升起', category: '一定' },
  { text: '三角形有 3 条边', category: '一定' },
  { text: '一年有 12 个月', category: '一定' },
  { text: '把一块石头抛向空中，石头会落回地面', category: '一定' },
  { text: '掷一枚骰子，朝上的点数小于 7', category: '一定' },
  { text: '袋子里装的都是红球，任意摸出一个，摸到红球', category: '一定' },
  { text: '明天会下雨', category: '可能' },
  { text: '抛一枚硬币，正面朝上', category: '可能' },
  { text: '袋子里有红球和白球，任意摸出一个，摸到红球', category: '可能' },
  { text: '掷一枚骰子，朝上的点数是 3', category: '可能' },
  { text: '从一副扑克牌中任意抽出一张，抽到红桃', category: '可能' },
  { text: '十字路口遇到的下一个信号灯是绿灯', category: '可能' },
  { text: '太阳从西方升起', category: '不可能' },
  { text: '一个月有 40 天', category: '不可能' },
  { text: '公鸡会下蛋', category: '不可能' },
  { text: '掷一枚骰子，朝上的点数是 8', category: '不可能' },
  { text: '袋子里装的都是白球，任意摸出一个，摸到红球', category: '不可能' },
  { text: '从只装黑球的袋子里摸出一个白球', category: '不可能' }
];

const STAGES = ['preschool', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'] as const;
const CURRICULUM_MAXIMUMS: Readonly<Record<WorksheetConfig['stage'], number>> = {
  preschool: 10, grade1: 20, grade2: 100, grade3: 1000,
  grade4: 100_000_000, grade5: 100_000_000, grade6: 100_000_000
};

function randomInt(min: number, max: number, random: RandomSource): number {
  const lower = Math.ceil(Math.min(min, max));
  const upper = Math.floor(Math.max(min, max));
  return Math.floor(random() * (upper - lower + 1)) + lower;
}

function scenarioText(scenario: string): string {
  return `判断下面这件事发生的可能性：${scenario}。（在“一定、可能、不可能”中选择）`;
}

export function generateLikelihoodLanguage(input: QuestionGenerationInput): Question {
  const index = randomInt(0, SCENARIOS.length - 1, input.random);
  const scenario = SCENARIOS[index];
  return {
    id: input.createId(), type: 'likelihoodLanguage',
    text: scenarioText(scenario.text),
    answer: scenario.category, operands: [index], layout: 'wide',
    signature: `likelihoodLanguage:${index}`,
    metadata: { category: scenario.category },
    answerDetails: { display: scenario.category }
  };
}

export const validateLikelihoodLanguage: QuestionValidator = (question, config, definition) => {
  if (!question || question.type !== 'likelihoodLanguage') {
    return { valid: false, errors: ['校验器题型不匹配：likelihoodLanguage', `实际题型：${String(question?.type)}`] };
  }
  const errors: string[] = [];
  if (!Array.isArray(question.operands) || question.operands.some(value => !Number.isFinite(value) || value < 0)) errors.push('操作数无效');
  const difficulty = definition?.difficultyProfiles[config.difficulty] ?? definition?.difficultyProfiles.standard;
  if (Number.isFinite(difficulty?.max) && Array.isArray(question.operands) && question.operands.some(value => Math.abs(value) > Number(difficulty?.max))) errors.push('题目超过该题型难度上限');
  if (config.rangeMode === 'curriculum' && Array.isArray(question.operands) && question.operands.some(value => Math.abs(value) > CURRICULUM_MAXIMUMS[config.stage])) errors.push('题目超过当前学习阶段范围');
  if (!config.types.includes('likelihoodLanguage')) errors.push('题型不在配置中');
  if (!Array.isArray(question.operands) || question.operands.length !== 1 || !Number.isInteger(question.operands[0])) {
    errors.push('情境索引无效');
  } else {
    const index = question.operands[0];
    if (index < 0 || index >= SCENARIOS.length) {
      errors.push('情境索引超出范围');
    } else {
      const scenario = SCENARIOS[index];
      if (question.answer !== scenario.category || question.metadata?.category !== scenario.category) errors.push('可能性判断答案错误');
      if (question.text !== scenarioText(scenario.text)) errors.push('题面格式错误');
    }
  }
  if (STAGES.indexOf(config.stage) < STAGES.indexOf('grade3')) errors.push('题型不符合年级要求');
  return { valid: errors.length === 0, errors };
};

export const LIKELIHOOD_QUESTION_DEFINITIONS: readonly QuestionDefinition[] = [
  questionDefinition({ id: 'likelihoodLanguage', label: '可能性判断', group: 'data-probability', domain: 'data-probability', allowedGrades: GRADE_3_PLUS, recommendedGrades: GRADE_3_PLUS, renderKind: 'choice', practice: 'standard', footprint: WIDE, contentCategory: 'data', difficultyProfiles: difficultyProfiles(1000), generate: generateLikelihoodLanguage, validate: validateLikelihoodLanguage })
];
