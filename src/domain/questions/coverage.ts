import { GRADE_DEFINITIONS, type Grade } from '../curriculum/types';
import { getQuestionDefinition, QUESTION_DEFINITIONS } from './registry';
import type { ContentCategory, QuestionDefinition } from './contracts';

export const CONTENT_CATEGORIES: readonly ContentCategory[] = [
  'calculation', 'concept', 'geometry-measurement', 'data', 'application'
];

export type CategoryCoverage = Readonly<Record<ContentCategory, readonly QuestionDefinition[]>>;

export function getCategoryCoverage(grade: Grade, recommended = false): CategoryCoverage {
  const coverage = Object.fromEntries(CONTENT_CATEGORIES.map(category => [category, [] as QuestionDefinition[]])) as Record<ContentCategory, QuestionDefinition[]>;
  for (const definition of QUESTION_DEFINITIONS) {
    const grades = recommended ? definition.recommendedGrades : definition.allowedGrades;
    if (grades.includes(grade)) coverage[definition.contentCategory].push(definition);
  }
  return coverage;
}

export function getCategoryCounts(grade: Grade, recommended = false): Record<ContentCategory, number> {
  const coverage = getCategoryCoverage(grade, recommended);
  return Object.fromEntries(CONTENT_CATEGORIES.map(category => [category, coverage[category].length])) as Record<ContentCategory, number>;
}

export function assertFiveCategoryCoverage(): void {
  for (const grade of GRADE_DEFINITIONS.map(item => item.id)) {
    const coverage = getCategoryCoverage(grade, true);
    const missing = CONTENT_CATEGORIES.filter(category => coverage[category].length === 0);
    if (missing.length) throw new Error(`${grade} 缺少内容类别：${missing.join('、')}`);
  }
  for (const definition of QUESTION_DEFINITIONS) {
    if (!CONTENT_CATEGORIES.includes(definition.contentCategory)) throw new Error(`题型 ${definition.id} 内容类别无效`);
    if (definition.contentCategory !== getQuestionDefinition(definition.id).contentCategory) throw new Error(`题型 ${definition.id} 内容类别不一致`);
  }
}
