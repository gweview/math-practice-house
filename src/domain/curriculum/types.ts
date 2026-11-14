export type Grade = 'preschool' | 'grade1' | 'grade2' | 'grade3' | 'grade4' | 'grade5' | 'grade6';
export type GradeBand = 'early' | 'middle' | 'upper';
export type CurriculumDomain = 'number-algebra' | 'geometry-measurement' | 'data-probability' | 'integrated-practice';
export type CurriculumScope = 'full-year' | 'first-term' | 'second-term';

export interface GradeDefinition {
  id: Grade;
  label: string;
  shortLabel: string;
  band: GradeBand;
  description: string;
}

export interface CurriculumProfile {
  id: 'cn-national-2022';
  label: string;
  scope: 'full-year';
  grades: readonly GradeDefinition[];
  domains: readonly CurriculumDomain[];
  /** Primary-school worksheet constant, deliberately not Math.PI. */
  pi: '3.14';
}

export const GRADE_DEFINITIONS: readonly GradeDefinition[] = [
  { id: 'preschool', label: '数学启蒙', shortLabel: '启蒙', band: 'early', description: '数感、分类、比较与 10 以内启蒙' },
  { id: 'grade1', label: '一年级', shortLabel: '一年级', band: 'early', description: '20 以内运算、数感和生活数学' },
  { id: 'grade2', label: '二年级', shortLabel: '二年级', band: 'early', description: '100 以内运算、乘除初步和测量' },
  { id: 'grade3', label: '三年级', shortLabel: '三年级', band: 'middle', description: '多位数运算、分数初步、周长与数据' },
  { id: 'grade4', label: '四年级', shortLabel: '四年级', band: 'middle', description: '大数、运算律、角、面积与平均数' },
  { id: 'grade5', label: '五年级', shortLabel: '五年级', band: 'upper', description: '小数、因数倍数、分数、方程与体积' },
  { id: 'grade6', label: '六年级', shortLabel: '六年级', band: 'upper', description: '分数乘除、百分数、比例、圆与统计' }
] as const;

export const GRADE_LABELS = Object.fromEntries(
  GRADE_DEFINITIONS.map(grade => [grade.id, grade.label])
) as Record<Grade, string>;

export const CURRICULUM_DOMAIN_LABELS: Record<CurriculumDomain, string> = {
  'number-algebra': '数与代数',
  'geometry-measurement': '图形与测量',
  'data-probability': '数据与可能性',
  'integrated-practice': '综合与实践'
};

export function isGrade(value: unknown): value is Grade {
  return typeof value === 'string' && GRADE_DEFINITIONS.some(grade => grade.id === value);
}

export function gradeIndex(grade: Grade): number {
  return GRADE_DEFINITIONS.findIndex(item => item.id === grade);
}
