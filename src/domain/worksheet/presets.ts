import type { ProblemType, WorksheetConfig, WorksheetPresetId } from '../../core/types';
import { STAGE_RECOMMENDED_TYPES } from '../../core/grade-config';
import { getQuestionDefinition, standardQuestionDefinitions } from '../questions/registry';

export interface WorksheetPresetDefinition {
  id: WorksheetPresetId;
  label: string;
  icon: string;
  description: string;
}

export const WORKSHEET_PRESETS: readonly WorksheetPresetDefinition[] = [
  { id: 'daily', label: '每日练习', icon: '☀️', description: '短时、基础、适合每天坚持' },
  { id: 'calculation', label: '计算专项', icon: '➗', description: '聚焦算式、填空与运算关系' },
  { id: 'comprehensive', label: '综合复习', icon: '🌈', description: '覆盖本年级多个知识领域' },
  { id: 'application', label: '应用题专项', icon: '🛒', description: '生活情境与数量关系' },
  { id: 'geometry', label: '图形与测量', icon: '📐', description: '图形、时间、单位与空间' },
  { id: 'data', label: '数据与统计', icon: '📊', description: '表格、统计图与可能性' },
  { id: 'challenge', label: '思维挑战', icon: '🧠', description: '进阶题型，由易到难' },
  { id: 'custom', label: '完全自定义', icon: '⚙️', description: '自行筛选每一个知识点' }
] as const;

function allowedFor(config: WorksheetConfig): ProblemType[] {
  const definitions = standardQuestionDefinitions();
  return definitions
    .filter(definition => config.rangeMode === 'free' || definition.allowedGrades.includes(config.stage))
    .map(definition => definition.id);
}

function representativesPerCategory(types: readonly ProblemType[], limit = 2): ProblemType[] {
  const counts = new Map<string, number>();
  return types.filter(type => {
    const category = getQuestionDefinition(type).contentCategory;
    const count = counts.get(category) ?? 0;
    if (count >= limit) return false;
    counts.set(category, count + 1);
    return true;
  });
}

export function typesForPreset(preset: WorksheetPresetId, config: WorksheetConfig): ProblemType[] {
  if (preset === 'custom') return config.types;
  const allowed = allowedFor(config);
  const recommended = new Set(STAGE_RECOMMENDED_TYPES[config.stage]);
  const preferred = allowed.filter(type => recommended.has(type));
  const source = preferred.length ? preferred : allowed;

  switch (preset) {
    case 'daily':
      return source.filter(type => {
        const definition = getQuestionDefinition(type);
        return definition.domain === 'number-algebra' && ['expression', 'equation', 'choice'].includes(definition.renderKind);
      }).slice(0, 8);
    case 'calculation':
      return source.filter(type => {
        const definition = getQuestionDefinition(type);
        return definition.domain === 'number-algebra' && !['numberLine', 'choice'].includes(definition.renderKind);
      }).slice(0, 8);
    case 'application':
      return allowed.filter(type => getQuestionDefinition(type).domain === 'integrated-practice').slice(0, 8);
    case 'geometry':
      return allowed.filter(type => getQuestionDefinition(type).domain === 'geometry-measurement').slice(0, 8);
    case 'data':
      return allowed.filter(type => getQuestionDefinition(type).domain === 'data-probability').slice(0, 8);
    case 'challenge':
      return source.filter(type => ['multiPart', 'word', 'geometry', 'chart', 'table', 'expression'].includes(getQuestionDefinition(type).renderKind));
    case 'comprehensive':
      return representativesPerCategory(allowed);
  }
}

export function applyWorksheetPreset(config: WorksheetConfig, preset: WorksheetPresetId): WorksheetConfig {
  const types = typesForPreset(preset, config);
  const typeWeights: Partial<Record<ProblemType, number>> = {};
  for (const type of types) {
    const definition = getQuestionDefinition(type);
    typeWeights[type] = preset === 'comprehensive'
      ? definition.contentCategory === 'calculation' ? 1.4 : definition.contentCategory === 'application' ? .7 : 1
      : 1;
  }
  return {
    ...config,
    preset,
    practiceMode: 'standard',
    types,
    typeWeights,
    difficulty: preset === 'challenge' ? 'challenge' : config.difficulty,
    ordering: preset === 'challenge' ? 'progressive' : preset === 'calculation' ? 'grouped' : 'random',
    randomMix: preset !== 'challenge' && preset !== 'calculation'
  };
}
