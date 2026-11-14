import type { QuestionDefinition } from '../../domain/questions/contracts';
import { questionDefinition, difficultyProfiles, ALL_GRADES, GRADE_1_PLUS, GRADE_2_PLUS, GRADE_3_PLUS, GRADE_4_PLUS, GRADE_5_PLUS, GRADE_6_PLUS, INLINE, WIDE, VISUAL, TABLE } from './_shared';
import { generateFractionComparison, validateFractionComparison } from '../calculation/unit-fraction';
import {
  generateNumberRecognition, generateComparison, generateCompareSigns, generateNumberSequence,
  generateNumberComposition, generatePlaceValue, generateNumberLine, generateNumberPattern,
  generateArithmeticFamily, generateEstimation,
  validateNumberRecognition, validateComparison, validateCompareSigns, validateNumberSequence,
  validateNumberComposition, validatePlaceValue, validateNumberLine, validateNumberPattern,
  validateArithmeticFamily, validateEstimation
} from '../concept/number-sense';
import {
  generateOddEven, generateTenMoreLess, generateMoneySense, generateShapePattern,
  validateOddEven, validateTenMoreLess, validateMoneySense, validateShapePattern
} from '../concept/early-number';
import {
  ADVANCED_CONCEPT_DIFFICULTY_PROFILES,
  generateLargeNumberPlaceValue, validateLargeNumberPlaceValue,
  generateOperationLaw, validateOperationLaw,
  generateDecimalComparison, validateDecimalComparison,
  generateFactorsMultiples, validateFactorsMultiples,
  generateRatio, validateRatio,
  generateNegativeNumber, validateNegativeNumber,
  generateCalendarWeekday, validateCalendarWeekday,
  generateFractionVisual, validateFractionVisual,
  generatePrimeComposite, validatePrimeComposite,
  generateCommonFactorsMultiples, validateCommonFactorsMultiples
} from '../concept/advanced';

const DIRECT_DIFFICULTIES: QuestionDefinition['difficulties'] = ['entry', 'easy', 'standard', 'advanced', 'challenge'];
type DirectQuestionInput = Omit<QuestionDefinition, 'description' | 'skills' | 'difficulties'> & {
  description?: string;
  skills?: readonly string[];
};

/** Metadata helper for migrated concept types; it does not route generation or validation. */
function conceptQuestion(input: DirectQuestionInput): QuestionDefinition {
  return {
    ...input,
    description: input.description ?? `通过${input.label}辨析数学概念、规律与数量关系，并说明判断依据。`,
    skills: input.skills ?? [input.label, '概念辨析', '规律与关系'],
    difficulties: DIRECT_DIFFICULTIES
  };
}

export const CONCEPT_QUESTION_DEFINITIONS: readonly QuestionDefinition[] = [
  conceptQuestion({ id: 'numberRecognition', label: '数字认识', group: 'number-comparison', domain: 'number-algebra', allowedGrades: ALL_GRADES, recommendedGrades: ALL_GRADES, renderKind: 'choice', practice: 'standard', footprint: WIDE, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(100), generate: generateNumberRecognition, validate: validateNumberRecognition }),
  conceptQuestion({ id: 'comparison', label: '圈出较大数', group: 'number-comparison', domain: 'number-algebra', allowedGrades: ALL_GRADES, recommendedGrades: ALL_GRADES, renderKind: 'choice', practice: 'standard', footprint: WIDE, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(1000), generate: generateComparison, validate: validateComparison }),
  conceptQuestion({ id: 'compareSigns', label: '填写比较符号', group: 'number-comparison', domain: 'number-algebra', allowedGrades: GRADE_1_PLUS, recommendedGrades: GRADE_1_PLUS, renderKind: 'equation', practice: 'standard', footprint: INLINE, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(1000), generate: generateCompareSigns, validate: validateCompareSigns }),
  questionDefinition({ id: 'fractionComparison', label: '分数大小比较', group: 'measurement-geometry', domain: 'number-algebra', allowedGrades: GRADE_3_PLUS, recommendedGrades: GRADE_3_PLUS, renderKind: 'equation', practice: 'standard', footprint: INLINE, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(12, { minimumMax: 4 }), generate: generateFractionComparison, validate: validateFractionComparison }),
  conceptQuestion({ id: 'numberSequence', label: '相邻数与排序', group: 'number-comparison', domain: 'number-algebra', allowedGrades: ALL_GRADES, recommendedGrades: ALL_GRADES, renderKind: 'equation', practice: 'standard', footprint: WIDE, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(1000), generate: generateNumberSequence, validate: validateNumberSequence }),
  conceptQuestion({ id: 'numberComposition', label: '数的组成与分解', group: 'number-comparison', domain: 'number-algebra', allowedGrades: ALL_GRADES, recommendedGrades: ALL_GRADES, renderKind: 'equation', practice: 'standard', footprint: INLINE, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(1000), generate: generateNumberComposition, validate: validateNumberComposition }),
  conceptQuestion({ id: 'placeValue', label: '数位与计数单位', group: 'number-comparison', domain: 'number-algebra', allowedGrades: GRADE_1_PLUS, recommendedGrades: GRADE_1_PLUS, renderKind: 'equation', practice: 'standard', footprint: WIDE, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(1000), generate: generatePlaceValue, validate: validatePlaceValue }),
  conceptQuestion({ id: 'numberLine', label: '数轴填数', group: 'number-comparison', domain: 'number-algebra', allowedGrades: GRADE_1_PLUS, recommendedGrades: GRADE_1_PLUS, renderKind: 'numberLine', practice: 'standard', footprint: VISUAL, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(1000), generate: generateNumberLine, validate: validateNumberLine }),
  conceptQuestion({ id: 'numberPattern', label: '按规律填数', group: 'number-comparison', domain: 'number-algebra', allowedGrades: GRADE_1_PLUS, recommendedGrades: GRADE_1_PLUS, renderKind: 'equation', practice: 'standard', footprint: WIDE, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(1000), generate: generateNumberPattern, validate: validateNumberPattern }),
  conceptQuestion({ id: 'arithmeticFamily', label: '加减乘除关系', group: 'mixed-operations', domain: 'number-algebra', allowedGrades: GRADE_1_PLUS, recommendedGrades: GRADE_1_PLUS, renderKind: 'multiPart', practice: 'standard', footprint: VISUAL, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(1000), generate: generateArithmeticFamily, validate: validateArithmeticFamily }),
  conceptQuestion({ id: 'estimation', label: '估算与结果范围', group: 'mixed-operations', domain: 'number-algebra', allowedGrades: GRADE_2_PLUS, recommendedGrades: GRADE_2_PLUS, renderKind: 'choice', practice: 'standard', footprint: WIDE, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(1000), generate: generateEstimation, validate: validateEstimation }),
  conceptQuestion({ id: 'oddEven', label: '单双数（奇偶数）', group: 'number-comparison', domain: 'number-algebra', allowedGrades: GRADE_1_PLUS, recommendedGrades: GRADE_1_PLUS, renderKind: 'choice', practice: 'standard', footprint: WIDE, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(1000), generate: generateOddEven, validate: validateOddEven }),
  conceptQuestion({ id: 'tenMoreLess', label: '多几与少几', group: 'number-comparison', domain: 'number-algebra', allowedGrades: GRADE_1_PLUS, recommendedGrades: GRADE_1_PLUS, renderKind: 'equation', practice: 'standard', footprint: INLINE, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(10000), generate: generateTenMoreLess, validate: validateTenMoreLess }),
  conceptQuestion({ id: 'moneySense', label: '认识人民币', group: 'measurement-geometry', domain: 'number-algebra', allowedGrades: GRADE_1_PLUS, recommendedGrades: GRADE_1_PLUS, renderKind: 'equation', practice: 'standard', footprint: INLINE, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(100), generate: generateMoneySense, validate: validateMoneySense }),
  conceptQuestion({ id: 'shapePattern', label: '图形找规律', group: 'number-comparison', domain: 'number-algebra', allowedGrades: GRADE_1_PLUS, recommendedGrades: GRADE_1_PLUS, renderKind: 'choice', practice: 'standard', footprint: WIDE, contentCategory: 'concept', difficultyProfiles: difficultyProfiles(100), generate: generateShapePattern, validate: validateShapePattern }),
  conceptQuestion({ id: 'largeNumberPlaceValue', label: '大数读写与数位', group: 'number-comparison', domain: 'number-algebra', allowedGrades: GRADE_4_PLUS, recommendedGrades: GRADE_4_PLUS, renderKind: 'equation', practice: 'standard', footprint: WIDE, contentCategory: 'concept', difficultyProfiles: ADVANCED_CONCEPT_DIFFICULTY_PROFILES.largeNumberPlaceValue, generate: generateLargeNumberPlaceValue, validate: validateLargeNumberPlaceValue }),
  conceptQuestion({ id: 'operationLaw', label: '运算律与简便计算', group: 'mixed-operations', domain: 'number-algebra', allowedGrades: GRADE_4_PLUS, recommendedGrades: GRADE_4_PLUS, renderKind: 'equation', practice: 'standard', footprint: WIDE, contentCategory: 'concept', difficultyProfiles: ADVANCED_CONCEPT_DIFFICULTY_PROFILES.operationLaw, generate: generateOperationLaw, validate: validateOperationLaw }),
  conceptQuestion({ id: 'decimalComparison', label: '小数大小比较', group: 'number-comparison', domain: 'number-algebra', allowedGrades: GRADE_5_PLUS, recommendedGrades: GRADE_5_PLUS, renderKind: 'equation', practice: 'standard', footprint: INLINE, contentCategory: 'concept', difficultyProfiles: ADVANCED_CONCEPT_DIFFICULTY_PROFILES.decimalComparison, generate: generateDecimalComparison, validate: validateDecimalComparison }),
  conceptQuestion({ id: 'factorsMultiples', label: '因数与倍数', group: 'multiplication-division', domain: 'number-algebra', allowedGrades: GRADE_5_PLUS, recommendedGrades: GRADE_5_PLUS, renderKind: 'choice', practice: 'standard', footprint: WIDE, contentCategory: 'concept', difficultyProfiles: ADVANCED_CONCEPT_DIFFICULTY_PROFILES.factorsMultiples, generate: generateFactorsMultiples, validate: validateFactorsMultiples }),
  conceptQuestion({ id: 'ratio', label: '比与化简比', group: 'mixed-operations', domain: 'number-algebra', allowedGrades: GRADE_6_PLUS, recommendedGrades: GRADE_6_PLUS, renderKind: 'equation', practice: 'standard', footprint: INLINE, contentCategory: 'concept', difficultyProfiles: ADVANCED_CONCEPT_DIFFICULTY_PROFILES.ratio, generate: generateRatio, validate: validateRatio }),
  conceptQuestion({ id: 'negativeNumber', label: '负数初步', group: 'number-comparison', domain: 'number-algebra', allowedGrades: GRADE_6_PLUS, recommendedGrades: GRADE_6_PLUS, renderKind: 'equation', practice: 'standard', footprint: WIDE, contentCategory: 'concept', difficultyProfiles: ADVANCED_CONCEPT_DIFFICULTY_PROFILES.negativeNumber, generate: generateNegativeNumber, validate: validateNegativeNumber }),
  conceptQuestion({ id: 'calendarWeekday', label: '日历星期与日期', group: 'number-comparison', domain: 'number-algebra', allowedGrades: GRADE_1_PLUS, recommendedGrades: GRADE_1_PLUS, renderKind: 'table', practice: 'standard', footprint: TABLE, contentCategory: 'concept', difficultyProfiles: ADVANCED_CONCEPT_DIFFICULTY_PROFILES.calendarWeekday, generate: generateCalendarWeekday, validate: validateCalendarWeekday }),
  conceptQuestion({ id: 'fractionVisual', label: '分数涂色与分割', group: 'number-comparison', domain: 'number-algebra', allowedGrades: GRADE_3_PLUS, recommendedGrades: GRADE_3_PLUS, renderKind: 'fractionVisual', practice: 'standard', footprint: VISUAL, contentCategory: 'concept', difficultyProfiles: ADVANCED_CONCEPT_DIFFICULTY_PROFILES.fractionVisual, generate: generateFractionVisual, validate: validateFractionVisual }),
  conceptQuestion({ id: 'primeComposite', label: '质数与合数', group: 'mixed-operations', domain: 'number-algebra', allowedGrades: GRADE_5_PLUS, recommendedGrades: GRADE_5_PLUS, renderKind: 'choice', practice: 'standard', footprint: WIDE, contentCategory: 'concept', difficultyProfiles: ADVANCED_CONCEPT_DIFFICULTY_PROFILES.primeComposite, generate: generatePrimeComposite, validate: validatePrimeComposite }),
  conceptQuestion({ id: 'commonFactorsMultiples', label: '公因数与公倍数', group: 'mixed-operations', domain: 'number-algebra', allowedGrades: GRADE_5_PLUS, recommendedGrades: GRADE_5_PLUS, renderKind: 'equation', practice: 'standard', footprint: WIDE, contentCategory: 'concept', difficultyProfiles: ADVANCED_CONCEPT_DIFFICULTY_PROFILES.commonFactorsMultiples, generate: generateCommonFactorsMultiples, validate: validateCommonFactorsMultiples })
];
