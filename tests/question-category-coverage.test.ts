import { describe, expect, it } from 'vitest';
import type { ProblemType, WorksheetConfig } from '../src/core/types';
import { CONTENT_CATEGORIES, getCategoryCoverage, getCategoryCounts } from '../src/domain/questions/coverage';
import { GRADE_DEFINITIONS } from '../src/domain/curriculum/types';
import { QUESTION_DEFINITIONS } from '../src/domain/questions/registry';
import { typesForPreset } from '../src/domain/worksheet/presets';
import { allocateCategoryBalancedCounts } from '../src/domain/worksheet/blueprint';
import { REQUIRED_CORE_TYPES } from './fixtures/question-category-coverage';
import { CATEGORY_GOLDEN_FIXTURES } from './fixtures/question-golden';

const config: WorksheetConfig = {
  stage: 'grade6', rangeMode: 'curriculum', difficulty: 'standard', practiceMode: 'standard', types: QUESTION_DEFINITIONS.map(item => item.id), count: 20,
  verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true, answerPage: false,
  allowDuplicates: true, randomMix: false, ordering: 'grouped', fields: { name: false, date: false, time: false, score: false, streak: false }, orientation: 'portrait', fontSize: 'standard'
};

describe('five content categories', () => {
  it('keeps an independent core fixture covered by allowed and recommended metadata', () => {
    for (const grade of GRADE_DEFINITIONS.map(item => item.id)) {
      for (const category of CONTENT_CATEGORIES) {
        const expected = REQUIRED_CORE_TYPES[grade][category];
        expect(expected.length, `${grade}/${category} fixture`).toBeGreaterThan(0);
        for (const type of expected) {
          const definition = QUESTION_DEFINITIONS.find(item => item.id === type);
          expect(definition, `${grade}/${category}/${type}`).toBeDefined();
          expect(definition?.contentCategory).toBe(category);
          expect(definition?.allowedGrades).toContain(grade);
          expect(definition?.recommendedGrades).toContain(grade);
        }
      }
    }
  });

  it('has exactly one category per definition and all grades have five recommended categories', () => {
    expect(new Set(QUESTION_DEFINITIONS.map(item => item.id)).size).toBe(QUESTION_DEFINITIONS.length);
    for (const definition of QUESTION_DEFINITIONS) expect(CONTENT_CATEGORIES).toContain(definition.contentCategory);
    for (const grade of GRADE_DEFINITIONS.map(item => item.id)) {
      expect(Object.values(getCategoryCounts(grade, true)).every(count => count > 0), grade).toBe(true);
    }
  });

  it('uses categories for comprehensive balancing and keeps preset/filter source in registry', () => {
    const selected = typesForPreset('comprehensive', config);
    const selectedDefinitions = selected.map(type => QUESTION_DEFINITIONS.find(item => item.id === type));
    expect(selectedDefinitions.every(Boolean)).toBe(true);
    expect(new Set(selectedDefinitions.map(item => item?.contentCategory)).size).toBe(5);
    const allocations = allocateCategoryBalancedCounts(selected as ProblemType[], 10);
    expect(new Set(allocations.filter(item => item.count > 0).map(item => QUESTION_DEFINITIONS.find(definition => definition.id === item.type)?.contentCategory)).size).toBe(5);
    for (const type of selected) expect(QUESTION_DEFINITIONS.some(item => item.id === type)).toBe(true);
    for (const grade of GRADE_DEFINITIONS.map(item => item.id)) {
      const allowed = new Set(Object.values(getCategoryCoverage(grade, false)).flatMap(items => items.map(item => item.id)));
      const recommended = new Set(Object.values(getCategoryCoverage(grade, true)).flatMap(items => items.map(item => item.id)));
      const gradeTypes = typesForPreset('comprehensive', { ...config, stage: grade, rangeMode: 'curriculum' });
      expect(gradeTypes.length, `${grade} comprehensive`).toBeGreaterThanOrEqual(CONTENT_CATEGORIES.length);
      expect(gradeTypes.every(type => allowed.has(type)), `${grade} allowed`).toBe(true);
      expect(gradeTypes.every(type => recommended.has(type)), `${grade} recommended`).toBe(true);
      expect(new Set(gradeTypes.map(type => QUESTION_DEFINITIONS.find(item => item.id === type)?.contentCategory)).size, `${grade} categories`).toBe(CONTENT_CATEGORIES.length);
      expect(Object.values(getCategoryCoverage(grade, true)).every(items => items.length > 0), grade).toBe(true);
    }
  });

  it('keeps at least one human-authored semantic anchor per category', () => {
    expect(new Set(CATEGORY_GOLDEN_FIXTURES.map(item => item.category)).size).toBe(CONTENT_CATEGORIES.length);
    for (const fixture of CATEGORY_GOLDEN_FIXTURES) {
      expect(fixture.answer).not.toBeUndefined();
      expect(QUESTION_DEFINITIONS.find(item => item.id === fixture.type)?.contentCategory).toBe(fixture.category);
    }
  });
});
