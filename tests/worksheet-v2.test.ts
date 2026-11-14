import { describe, expect, it } from 'vitest';
import { generateWorksheet } from '../src/core/generate';
import type { ProblemType, WorksheetConfig } from '../src/core/types';
import { allocateDomainBalancedCounts, allocateTypeCounts, buildWorksheetBlueprint, estimatePageTargetCount } from '../src/domain/worksheet/blueprint';
import { typesForPreset } from '../src/domain/worksheet/presets';
import { getQuestionDefinition } from '../src/domain/questions/registry';
import { STAGE_ALLOWED_TYPES } from '../src/core/grade-config';
import { CURRICULUM_PROFILES, NATIONAL_CURRICULUM_2022 } from '../src/domain/curriculum/catalog';
import { planMathSheets } from '../src/features/math/layout';
import { paginateByMeasuredFootprints, questionFootprint } from '../src/domain/worksheet/layout-metrics';
import { createWorksheetConfigStorage, LEGACY_STORAGE_KEY, STORAGE_KEY } from '../src/features/worksheet-builder/config';
import type { StorageLike } from '../src/shared/storage/versioned-storage';

class MemoryStorage implements StorageLike {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const config: WorksheetConfig = {
  stage: 'grade2', rangeMode: 'curriculum', difficulty: 'standard', practiceMode: 'standard',
  types: ['addition100'], count: 20, generationMode: 'count', pageTarget: 1,
  verticalOperations: ['addition', 'subtraction'], verticalPages: 1,
  showNumbers: true, showLines: true, answerPage: false, answerMode: 'none', allowDuplicates: true,
  randomMix: false, ordering: 'grouped', fields: { name: true, date: true, time: true, score: true, streak: false },
  orientation: 'portrait', fontSize: 'standard'
};

describe('worksheet V2 blueprint', () => {
  it('allocates exact weighted quotas deterministically', () => {
    expect(allocateTypeCounts(['addition100', 'subtraction100', 'wordProblem'], 10, {
      addition100: 2, subtraction100: 1, wordProblem: 1
    })).toEqual([
      { type: 'addition100', count: 5 },
      { type: 'subtraction100', count: 3 },
      { type: 'wordProblem', count: 2 }
    ]);
  });

  it('turns a one-page target into a safe question count', () => {
    const targetConfig = { ...config, generationMode: 'pages' as const, pageTarget: 1 as const };
    expect(estimatePageTargetCount(targetConfig)).toBe(22);
    const worksheet = generateWorksheet(targetConfig, { seed: 'one-page' });
    const questionSheets = planMathSheets(worksheet.questions, worksheet.config).filter(sheet => sheet.kind === 'questions');
    expect(worksheet.questions).toHaveLength(22);
    expect(questionSheets).toHaveLength(1);
  });

  it('does not force page mode back to the five-question count minimum', () => {
    const visual = { ...config, types: ['numberLine'] as ProblemType[], generationMode: 'pages' as const, pageTarget: 1 as const, orientation: 'landscape' as const, fontSize: 'large' as const };
    expect(estimatePageTargetCount(visual)).toBeGreaterThanOrEqual(1);
    expect(() => estimatePageTargetCount({ ...visual, types: ['wordProblem'] as ProblemType[], orientation: 'landscape' as const, fontSize: 'large' as const })).not.toThrow();
    const portraitVisual = { ...visual, orientation: 'portrait' as const };
    expect(estimatePageTargetCount(portraitVisual)).toBe(4);
    const fiveQuestions = generateWorksheet({ ...portraitVisual, generationMode: 'count', count: 5 }, { seed: 'five-visual' });
    expect(planMathSheets(fiveQuestions.questions, fiveQuestions.config).filter(sheet => sheet.kind === 'questions')).toHaveLength(2);
  });

  it('uses exact same-footprint page capacity for landscape visual worksheets', () => {
    const visual = { ...config, types: ['numberLine'] as ProblemType[], generationMode: 'pages' as const, pageTarget: 2 as const, orientation: 'landscape' as const };
    const large = { ...visual, fontSize: 'large' as const };
    expect(estimatePageTargetCount(large)).toBe(4);
    const largeWorksheet = generateWorksheet(large, { seed: 'landscape-large-visual' });
    expect(largeWorksheet.questions).toHaveLength(4);
    expect(planMathSheets(largeWorksheet.questions, largeWorksheet.config).filter(sheet => sheet.kind === 'questions')).toHaveLength(2);
    expect(estimatePageTargetCount(visual)).toBe(6);
    const standardWorksheet = generateWorksheet(visual, { seed: 'landscape-standard-visual' });
    expect(standardWorksheet.questions).toHaveLength(6);
    expect(planMathSheets(standardWorksheet.questions, standardWorksheet.config).filter(sheet => sheet.kind === 'questions')).toHaveLength(2);
  });

  it('keeps the mixed one/full-span six-question counterexample on one page', () => {
    const mixed = {
      ...config,
      stage: 'grade6' as const,
      rangeMode: 'free' as const,
      types: ['addition100', 'numberLine', 'wordProblem', 'dataTableReading'] as ProblemType[],
      generationMode: 'pages' as const,
      pageTarget: 1 as const,
      ordering: 'random' as const,
      randomMix: true
    };
    expect(estimatePageTargetCount(mixed)).toBeGreaterThanOrEqual(6);
    for (const seed of ['mixed-six-a', 'mixed-six-b', 'mixed-six-c']) {
      const worksheet = generateWorksheet(mixed, { seed });
      expect(worksheet.questions.length).toBeGreaterThanOrEqual(6);
      expect(planMathSheets(worksheet.questions, worksheet.config).filter(sheet => sheet.kind === 'questions')).toHaveLength(1);
    }
    const sample = generateWorksheet({ ...mixed, generationMode: 'count', count: 6, ordering: 'grouped', randomMix: false }, { seed: 'mixed-six-permutations' });
    const permutations = (items: typeof sample.questions): Array<typeof sample.questions> => {
      if (items.length <= 1) return [items];
      return items.flatMap((item, index) => permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(rest => [item, ...rest]));
    };
    for (const permutation of permutations(sample.questions)) {
      expect(planMathSheets(permutation, sample.config).filter(sheet => sheet.kind === 'questions')).toHaveLength(1);
    }
  });

  it('rejects an injected footprint that cannot fit a physical page', () => {
    expect(() => paginateByMeasuredFootprints(['oversized'], { orientation: 'landscape' }, () => ({ columns: 'full', heightMm: 137 }))).toThrow('超过 landscape 页面可用高度');
  });

  it('keeps mixed footprint page targets safe across layout matrix', () => {
    const types: ProblemType[] = ['addition100', 'numberLine', 'wordProblem', 'dataTableReading', 'arithmeticFamily'];
    for (const orientation of ['portrait', 'landscape'] as const) {
      for (const fontSize of ['standard', 'large'] as const) {
        for (const ordering of ['random', 'grouped', 'progressive'] as const) {
          for (const pageTarget of [1, 2] as const) {
            const pageConfig = { ...config, stage: 'grade6' as const, rangeMode: 'free' as const, types, count: 20, orientation, fontSize, ordering, randomMix: ordering === 'random', generationMode: 'pages' as const, pageTarget };
            for (const seed of ['matrix-a', 'matrix-b']) {
              const worksheet = generateWorksheet(pageConfig, { seed });
              const questionPages = planMathSheets(worksheet.questions, worksheet.config).filter(sheet => sheet.kind === 'questions');
              expect(worksheet.questions.length).toBeGreaterThanOrEqual(1);
              expect(worksheet.questions.length).toBeLessThanOrEqual(100);
              expect(questionPages.length, `${orientation}/${fontSize}/${ordering}/${pageTarget}/${seed}`).toBeLessThanOrEqual(pageTarget);
            }
          }
        }
      }
    }
  });

  it('uses the rendered content bound for arithmetic-family questions', () => {
    const pageConfig = {
      ...config,
      stage: 'grade2' as const,
      rangeMode: 'curriculum' as const,
      types: ['arithmeticFamily', 'wordProblem'] as ProblemType[],
      generationMode: 'pages' as const,
      pageTarget: 1 as const,
      count: 20,
      ordering: 'grouped' as const,
      randomMix: false
    };
    const worksheet = generateWorksheet(pageConfig, { seed: 'arithmetic-footprint' });
    const arithmetic = worksheet.questions.find(question => question.type === 'arithmeticFamily');
    expect(arithmetic).toBeDefined();
    expect(questionFootprint(arithmetic!, worksheet.config)).toEqual({ columns: 'full', heightMm: 38 });
    expect(planMathSheets(worksheet.questions, worksheet.config).filter(sheet => sheet.kind === 'questions')).toHaveLength(1);
  });

  it('validates page targets without changing the requested question order', () => {
    for (const ordering of ['random', 'grouped', 'progressive'] as const) {
      const worksheet = generateWorksheet({
        ...config,
        stage: 'grade6', rangeMode: 'free', types: ['addition100', 'wordProblem'], count: 20,
        generationMode: 'pages', pageTarget: 2, ordering, randomMix: ordering === 'random'
      }, { seed: `order-${ordering}` });
      const slots = planMathSheets(worksheet.questions, worksheet.config)
        .filter(sheet => sheet.kind === 'questions').flatMap(sheet => sheet.slots);
      expect(slots.map(slot => slot.question.id)).toEqual(worksheet.questions.map(question => question.id));
      if (ordering === 'grouped') {
        const changes = worksheet.questions.reduce((total, question, index, all) => total + (index > 0 && question.type !== all[index - 1].type ? 1 : 0), 0);
        expect(changes).toBeLessThanOrEqual(1);
      }
      if (ordering === 'progressive') {
        const magnitudes = worksheet.questions.map(question => Number(question.metadata?.magnitude ?? Math.max(...question.operands)));
        expect(magnitudes).toEqual([...magnitudes].sort((left, right) => left - right));
      }
    }
  });

  it('balances comprehensive allocations across available domains', () => {
    for (const stage of ['preschool', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'] as const) {
      const allowed = STAGE_ALLOWED_TYPES[stage];
      const available = new Set(allowed.map(type => getQuestionDefinition(type).domain));
      const types = typesForPreset('comprehensive', { ...config, stage, rangeMode: 'curriculum' });
      for (const count of [5, 10, 20]) {
        const allocations = allocateDomainBalancedCounts(types, count);
        const blueprint = buildWorksheetBlueprint({ ...config, stage, rangeMode: 'curriculum', types, count, preset: 'comprehensive' });
        expect(allocations.reduce((sum, item) => sum + item.count, 0), `${stage}/${count}`).toBe(count);
        expect(blueprint.allocations.reduce((sum, item) => sum + item.count, 0), `${stage}/${count}/blueprint`).toBe(count);
        const covered = new Set(allocations.filter(item => item.count > 0).map(item => getQuestionDefinition(item.type).domain));
        if (count >= available.size) expect(covered, `${stage}/${count}`).toEqual(available);
      }
    }
  });

  it('keeps every curriculum preset non-empty and inside its declared domain', () => {
    const domains = { application: 'integrated-practice', geometry: 'geometry-measurement', data: 'data-probability' } as const;
    const stages = ['preschool', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6'] as const;
    for (const stage of stages) {
      for (const [preset, domain] of Object.entries(domains) as Array<[keyof typeof domains, string]>) {
        const types = typesForPreset(preset, { ...config, stage, rangeMode: 'curriculum' });
        expect(types, `${stage}/${preset}`).not.toHaveLength(0);
        expect(types.every(type => getQuestionDefinition(type).domain === domain), `${stage}/${preset}`).toBe(true);
      }
      const daily = typesForPreset('daily', { ...config, stage, rangeMode: 'curriculum' });
      const calculation = typesForPreset('calculation', { ...config, stage, rangeMode: 'curriculum' });
      expect(daily, `${stage}/daily`).not.toHaveLength(0);
      expect(calculation, `${stage}/calculation`).not.toHaveLength(0);
      expect(daily.every(type => {
        const definition = getQuestionDefinition(type);
        return definition.domain === 'number-algebra' && ['expression', 'equation', 'choice'].includes(definition.renderKind);
      }), `${stage}/daily semantic`).toBe(true);
      expect(calculation.every(type => {
        const definition = getQuestionDefinition(type);
        return definition.domain === 'number-algebra' && !['numberLine', 'choice'].includes(definition.renderKind);
      }), `${stage}/calculation semantic`).toBe(true);
    }
  });

  it('exposes only the audited full-year curriculum baseline', () => {
    expect(NATIONAL_CURRICULUM_2022.id).toBe('cn-national-2022');
    expect(NATIONAL_CURRICULUM_2022.scope).toBe('full-year');
    expect(NATIONAL_CURRICULUM_2022.pi).toBe('3.14');
    expect(NATIONAL_CURRICULUM_2022.grades).toHaveLength(7);
    expect(NATIONAL_CURRICULUM_2022.domains).toHaveLength(4);
    expect(CURRICULUM_PROFILES.every(profile => profile.scope === 'full-year')).toBe(true);
    expect(Object.keys(NATIONAL_CURRICULUM_2022).some(key => key === 'first-term' || key === 'second-term')).toBe(false);
  });
});

describe('worksheet V1 to V2 storage migration', () => {
  it('migrates legacy raw config, preserves it for rollback, and saves a V2 envelope', () => {
    const storage = new MemoryStorage();
    const { answerMode: _answerMode, generationMode: _generationMode, pageTarget: _pageTarget, ordering: _ordering, ...v1 } = config;
    void _answerMode; void _generationMode; void _pageTarget; void _ordering;
    const legacy = { ...v1, stage: 'grade3', types: ['fractionComparison'], answerPage: true };
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy));
    const settings = createWorksheetConfigStorage(storage);
    const loaded = settings.load();
    expect(loaded.stage).toBe('grade3');
    expect(loaded.types).toEqual(['fractionComparison']);
    expect(loaded.answerMode).toBe('compact');
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBe(JSON.stringify(legacy));
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}').version).toBe(2);
  });

  it('falls back to safe defaults for damaged legacy data', () => {
    const storage = new MemoryStorage();
    storage.setItem(LEGACY_STORAGE_KEY, '{broken');
    const loaded = createWorksheetConfigStorage(storage).load();
    expect(loaded.stage).toBe('grade1');
    expect(loaded.types.length).toBeGreaterThan(0);
  });

  it('recovers a valid legacy config when the current key is corrupt', () => {
    const storage = new MemoryStorage();
    const legacy = { ...config, stage: 'grade3' as const, types: ['fractionComparison' as const] };
    storage.setItem(STORAGE_KEY, '{broken');
    storage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacy));
    const loaded = createWorksheetConfigStorage(storage).load();
    expect(loaded.stage).toBe('grade3');
    expect(loaded.types).toEqual(['fractionComparison']);
    expect(storage.getItem(LEGACY_STORAGE_KEY)).toBe(JSON.stringify(legacy));
    expect(JSON.parse(storage.getItem(STORAGE_KEY) ?? '{}').version).toBe(2);
  });
});
