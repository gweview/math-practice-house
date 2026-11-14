import { DEFAULT_PI } from '../math-core/constants';
import { CURRICULUM_DOMAIN_LABELS, GRADE_DEFINITIONS, type CurriculumDomain, type CurriculumProfile } from './types';

/** Audited curriculum baseline used by the built-in worksheet catalog. */
export const NATIONAL_CURRICULUM_2022: CurriculumProfile = {
  id: 'cn-national-2022',
  label: '中国义务教育数学课程标准（2022）基线',
  scope: 'full-year',
  grades: GRADE_DEFINITIONS,
  domains: Object.keys(CURRICULUM_DOMAIN_LABELS) as CurriculumDomain[],
  pi: DEFAULT_PI.toString() as '3.14'
};

export const CURRICULUM_PROFILES: readonly CurriculumProfile[] = [NATIONAL_CURRICULUM_2022];

export function getCurriculumProfile(id: CurriculumProfile['id'] = 'cn-national-2022'): CurriculumProfile {
  const profile = CURRICULUM_PROFILES.find(candidate => candidate.id === id);
  if (!profile) throw new Error(`未找到课程档案：${id}`);
  return profile;
}
