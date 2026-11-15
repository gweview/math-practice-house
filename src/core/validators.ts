import { isTypeAllowedForStage } from './grade-config';
import { MAX_VERTICAL_PAGES, VERTICAL_PAGE_SIZE, type PracticeMode, type VerticalOperation, type WorksheetConfig } from './types';
import { estimatePageTargetCount } from '../domain/worksheet/blueprint';
import { getQuestionDefinition, getQuestionHandler, isRegisteredProblemType } from '../domain/questions/registry';

const STAGES = ['preschool', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'];
const DIFFICULTIES = ['entry', 'easy', 'standard', 'advanced', 'challenge'];
const PRACTICE_MODES: PracticeMode[] = ['standard', 'verticalAddSub', 'verticalMulDiv'];
const VERTICAL_OPERATIONS: VerticalOperation[] = ['addition', 'subtraction', 'multiplication', 'division'];
const VERTICAL_TYPES = new Set(['verticalAddition', 'verticalSubtraction', 'verticalMultiplication', 'verticalDivision']);

export function normalizeConfig(config: WorksheetConfig): WorksheetConfig {
  const practiceMode = config.practiceMode ?? 'standard';
  const verticalPages = Math.min(MAX_VERTICAL_PAGES, Math.max(1, Math.round(Number(config.verticalPages) || 1)));
  const defaultOperations: VerticalOperation[] = practiceMode === 'verticalMulDiv' ? ['multiplication', 'division'] : ['addition', 'subtraction'];
  const verticalOperations = Array.isArray(config.verticalOperations) ? config.verticalOperations : defaultOperations;
  const generationMode = config.generationMode === 'pages' ? 'pages' : 'count';
  const answerMode = config.answerMode === 'none' || config.answerMode === 'compact' || config.answerMode === 'detailed' ? config.answerMode : config.answerPage ? 'detailed' : 'none';
  const ordering = config.ordering === 'grouped' || config.ordering === 'progressive' || config.ordering === 'random' ? config.ordering : config.randomMix ? 'random' : 'grouped';
  const normalized: WorksheetConfig = { ...config, practiceMode, verticalOperations, verticalPages, generationMode, pageTarget: config.pageTarget === 2 ? 2 : 1, answerMode, answerPage: answerMode !== 'none', ordering, randomMix: ordering === 'random', preset: config.preset ?? 'custom', seed: typeof config.seed === 'string' ? config.seed.trim().slice(0, 80) : undefined, rangeMode: config.rangeMode === 'free' ? 'free' : 'curriculum', count: practiceMode === 'standard' ? generationMode === 'pages' ? Math.min(100, Math.max(1, Math.round(Number(config.count) || 1))) : Math.min(100, Math.max(5, Math.round(Number(config.count) || 20))) : verticalPages * VERTICAL_PAGE_SIZE };
  if (practiceMode === 'standard' && generationMode === 'pages' && normalized.types.every(isRegisteredProblemType)) normalized.count = estimatePageTargetCount(normalized);
  return normalized;
}

export function validateQuestion(question: import('./types').Question, config: WorksheetConfig): { valid: boolean; errors: string[] } {
  if (!question || !isRegisteredProblemType(question.type)) return { valid: false, errors: ['未注册题型'] };
  try {
    return getQuestionHandler(question.type).validate(question, config, getQuestionDefinition(question.type));
  } catch {
    return { valid: false, errors: ['题目结构无效'] };
  }
}

export function validateConfig(config: WorksheetConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = []; const validStage = STAGES.includes(config.stage); const validPracticeMode = PRACTICE_MODES.includes(config.practiceMode);
  if (!validStage) errors.push('学习阶段无效'); if (!DIFFICULTIES.includes(config.difficulty)) errors.push('难度设置无效'); if (!validPracticeMode) errors.push('练习模式无效');
  if (!Array.isArray(config.types)) errors.push('所选题型无效'); else if (config.practiceMode === 'standard' && config.types.length === 0) errors.push('请至少选择一种题型'); else if (config.types.some(type => !isRegisteredProblemType(type) || VERTICAL_TYPES.has(type))) errors.push('所选题型无效');
  const minimumCount = config.generationMode === 'pages' ? 1 : 5;
  if (!Number.isFinite(config.count) || config.count < minimumCount || config.count > 100) errors.push(`题目数量必须为 ${minimumCount}～100`); if (!Number.isFinite(config.verticalPages) || config.verticalPages < 1 || config.verticalPages > MAX_VERTICAL_PAGES) errors.push(`竖式页数必须为 1～${MAX_VERTICAL_PAGES}`);
  if (!['curriculum', 'free'].includes(config.rangeMode)) errors.push('出题范围模式无效'); if (!['portrait', 'landscape'].includes(config.orientation)) errors.push('页面方向无效'); if (!['standard', 'large'].includes(config.fontSize)) errors.push('字体设置无效');
  if (config.generationMode && !['count', 'pages'].includes(config.generationMode)) errors.push('出题数量模式无效'); if (config.generationMode === 'pages' && ![1, 2].includes(Number(config.pageTarget))) errors.push('纸张目标无效'); if (config.answerMode && !['none', 'compact', 'detailed'].includes(config.answerMode)) errors.push('答案页模式无效'); if (config.ordering && !['random', 'grouped', 'progressive'].includes(config.ordering)) errors.push('题目排序方式无效');
  if (config.typeDifficulties !== undefined) {
    if (!config.typeDifficulties || typeof config.typeDifficulties !== 'object' || Array.isArray(config.typeDifficulties)
      || Object.entries(config.typeDifficulties).some(([type, level]) => !isRegisteredProblemType(type) || !DIFFICULTIES.includes(String(level)))) {
      errors.push('题型难度设置无效');
    }
  }
  if (config.difficultyDistribution !== undefined) {
    if (!config.difficultyDistribution || typeof config.difficultyDistribution !== 'object' || Array.isArray(config.difficultyDistribution)) {
      errors.push('混合难度比例无效');
    } else {
      const entries = Object.entries(config.difficultyDistribution);
      const invalidEntry = entries.some(([level, weight]) => !DIFFICULTIES.includes(level) || typeof weight !== 'number' || !Number.isFinite(weight) || weight < 0);
      const totalWeight = entries.reduce((sum, [, weight]) => sum + (typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? weight : 0), 0);
      if (invalidEntry || (entries.length > 0 && totalWeight <= 0)) errors.push('混合难度比例无效');
    }
  }
  if (config.practiceMode !== 'standard') {
    const operations = Array.isArray(config.verticalOperations) ? config.verticalOperations : []; const allowed: VerticalOperation[] = config.practiceMode === 'verticalAddSub' ? ['addition', 'subtraction'] : ['multiplication', 'division'];
    if (!operations.length) errors.push('请至少选择一种竖式运算'); else if (operations.some(operation => !VERTICAL_OPERATIONS.includes(operation) || !allowed.includes(operation))) errors.push('竖式运算与练习模式不一致'); if (config.count !== config.verticalPages * VERTICAL_PAGE_SIZE) errors.push(`竖式练习必须每页 ${VERTICAL_PAGE_SIZE} 题`);
    if (config.rangeMode === 'curriculum' && validStage) { if (config.practiceMode === 'verticalAddSub' && config.stage === 'preschool') errors.push('数学启蒙阶段尚未开放加减法竖式'); if (config.practiceMode === 'verticalMulDiv' && !['grade3', 'grade4', 'grade5', 'grade6'].includes(config.stage)) errors.push('严格按年级时，乘除法竖式从三年级起开放'); }
  }
  if (config.practiceMode === 'standard' && config.rangeMode === 'curriculum' && validStage && Array.isArray(config.types)) { const beyondStage = config.types.filter(type => !isTypeAllowedForStage(type, config.stage)); if (beyondStage.length) errors.push('所选题型包含当前学习阶段尚未覆盖的内容'); }
  return { valid: errors.length === 0, errors };
}
