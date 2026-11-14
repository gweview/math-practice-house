import type { Difficulty } from '../../domain/questions/problem-type';
import type { Grade } from '../../domain/curriculum/types';
import type { ContentCategory, DifficultyProfile, PrintFootprint, QuestionDefinition } from '../../domain/questions/contracts';

export const ALL_DIFFICULTIES: readonly Difficulty[] = ['entry', 'easy', 'standard', 'advanced', 'challenge'];
export const P: Grade = 'preschool';
export const G1: Grade = 'grade1';
export const G2: Grade = 'grade2';
export const G3: Grade = 'grade3';
export const G4: Grade = 'grade4';
export const G5: Grade = 'grade5';
export const G6: Grade = 'grade6';
export const ALL_GRADES: readonly Grade[] = [P, G1, G2, G3, G4, G5, G6];
export const GRADE_1_PLUS: readonly Grade[] = [G1, G2, G3, G4, G5, G6];
export const GRADE_2_PLUS: readonly Grade[] = [G2, G3, G4, G5, G6];
export const GRADE_3_PLUS: readonly Grade[] = [G3, G4, G5, G6];
export const GRADE_4_PLUS: readonly Grade[] = [G4, G5, G6];
export const GRADE_5_PLUS: readonly Grade[] = [G5, G6];
export const GRADE_6_PLUS: readonly Grade[] = [G6];

export const INLINE: PrintFootprint = { columns: 1, heightMm: { standard: 11, large: 13 }, preventBreakInside: true };
export const WIDE: PrintFootprint = { columns: 'full', heightMm: { standard: 11, large: 13 }, preventBreakInside: true };
export const WORD: PrintFootprint = { columns: 'full', heightMm: { standard: 28, large: 31 }, preventBreakInside: true };
export const VERTICAL: PrintFootprint = { columns: 1, heightMm: { standard: 34, large: 34 }, preventBreakInside: true };
export const VISUAL: PrintFootprint = { columns: 'full', heightMm: { standard: 38, large: 43 }, preventBreakInside: true };
export const TABLE: PrintFootprint = { columns: 'full', heightMm: { standard: 31, large: 36 }, preventBreakInside: true };
export const MULTIPART: PrintFootprint = VISUAL;

export interface DifficultyProfileOptions {
  minimumMax?: number;
  minimumOperand?: number;
}

export function difficultyProfiles(max: number, options: DifficultyProfileOptions = {}): Readonly<Partial<Record<Difficulty, DifficultyProfile>>> {
  const scale = (factor: number) => Math.max(1, Math.round(max * factor));
  return {
    entry: { max: scale(.3), minimumMax: options.minimumMax, minimumOperand: options.minimumOperand, terms: 2, carryRate: 0, highRangeRate: .15, wordSteps: 1, maxFactor: 5, trivialRate: .22, equalityRate: .25, mixedRate: 0, reverseRate: 0, multiStepRate: 0 },
    easy: { max: scale(.55), minimumMax: options.minimumMax, minimumOperand: options.minimumOperand, terms: 2, carryRate: .2, highRangeRate: .3, wordSteps: 1, maxFactor: 6, trivialRate: .14, equalityRate: .2, mixedRate: .1, reverseRate: .1, multiStepRate: .1 },
    standard: { max, minimumMax: options.minimumMax, minimumOperand: options.minimumOperand, terms: 3, carryRate: .5, highRangeRate: .5, wordSteps: 1, maxFactor: 9, trivialRate: .08, equalityRate: .2, mixedRate: .4, reverseRate: .25, multiStepRate: .3 },
    advanced: { max, minimumMax: options.minimumMax, minimumOperand: options.minimumOperand, terms: 3, carryRate: .75, highRangeRate: .7, wordSteps: 2, maxFactor: 9, trivialRate: .03, equalityRate: .2, mixedRate: .7, reverseRate: .35, multiStepRate: .5 },
    challenge: { max, minimumMax: options.minimumMax, minimumOperand: options.minimumOperand, terms: 4, carryRate: .9, highRangeRate: .85, wordSteps: 3, maxFactor: 12, trivialRate: 0, equalityRate: .2, mixedRate: .9, reverseRate: .45, multiStepRate: .55 }
  };
}

type DefinitionInput = Omit<QuestionDefinition, 'description' | 'skills' | 'recommendedGrades' | 'difficulties' | 'footprint'> & {
  description?: string;
  skills?: readonly string[];
  recommendedGrades?: readonly Grade[];
  footprint?: PrintFootprint;
  contentCategory: ContentCategory;
};

function manifestMetadata(label: string, category: ContentCategory): Pick<QuestionDefinition, 'description' | 'skills'> {
  switch (category) {
    case 'calculation':
      return { description: `通过${label}练习掌握运算顺序、算理和准确计算。`, skills: [label, '运算准确性', '算理表达'] };
    case 'concept':
      return { description: `通过${label}辨析数学概念、规律与数量关系，并说明判断依据。`, skills: [label, '概念辨析', '规律与关系'] };
    case 'geometry-measurement':
      return { description: `在${label}情境中建立图形、空间和测量单位之间的联系。`, skills: [label, '空间观念', '测量推理'] };
    case 'data':
      return { description: `从${label}中读取、整理和比较数据，形成有依据的结论。`, skills: [label, '数据读取', '数据解释'] };
    case 'application':
      return { description: `把${label}应用到生活情境，选择数量关系并分步解决问题。`, skills: [label, '建模列式', '问题解决'] };
  }
}

/** Shared definition factory. Metadata is category-aware and runtime behavior stays on the definition. */
export function questionDefinition(input: DefinitionInput): QuestionDefinition {
  const metadata = manifestMetadata(input.label, input.contentCategory);
  return {
    ...input,
    description: input.description ?? metadata.description,
    skills: input.skills ?? metadata.skills,
    recommendedGrades: input.recommendedGrades ?? input.allowedGrades,
    difficulties: ALL_DIFFICULTIES,
    footprint: input.footprint ?? INLINE,
    // Keep the handler callable as a standalone compatibility API. The
    // orchestration boundary supplies the definition when it needs profile
    // bounds; direct legacy callers retain the historical structural checks.
    validate: input.validate
  };
}
