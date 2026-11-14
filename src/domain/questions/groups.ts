import type { QuestionGroupId } from './contracts';

export const QUESTION_GROUPS: readonly { id: QuestionGroupId; label: string; icon: string }[] = [
  { id: 'number-comparison', label: '数与比较', icon: '🔢' },
  { id: 'addition-subtraction', label: '加减法', icon: '➕' },
  { id: 'multiplication-division', label: '乘除法', icon: '✖️' },
  { id: 'mixed-operations', label: '连算与混合', icon: '🧩' },
  { id: 'fill-application', label: '填空与应用', icon: '💡' },
  { id: 'measurement-geometry', label: '单位与图形', icon: '📐' },
  { id: 'data-probability', label: '数据与可能性', icon: '📊' }
] as const;
