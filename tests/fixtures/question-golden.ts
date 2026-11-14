import type { ContentCategory } from '../../src/domain/questions/contracts';
import type { ProblemType } from '../../src/core/types';

/** Human-authored semantic anchors; these are deliberately independent of generators. */
export const CATEGORY_GOLDEN_FIXTURES: readonly { category: ContentCategory; type: ProblemType; operands: readonly number[]; answer: number | string }[] = [
  { category: 'calculation', type: 'addition10', operands: [2, 3], answer: 5 },
  { category: 'concept', type: 'compareSigns', operands: [7, 4], answer: '>' },
  { category: 'geometry-measurement', type: 'perimeter', operands: [4, 3], answer: 14 },
  { category: 'data', type: 'average', operands: [2, 4, 6], answer: 4 },
  { category: 'application', type: 'priceQuantityTotal', operands: [3, 5], answer: 15 }
];
