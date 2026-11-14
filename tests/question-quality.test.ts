import { describe, expect, it } from 'vitest';
import type { ProblemType, WorksheetConfig } from '../src/core/types';
import { validateQuestion } from '../src/core/validators';
import { QUESTION_DEFINITIONS, getQuestionDefinition } from '../src/domain/questions/registry';
import { getProblemProfile } from '../src/core/difficulty-config';
import { generateWordProblem, renderWordTemplate, WORD_ENTITIES, WORD_TEMPLATES } from '../src/core/generators/word-problem';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import type { Stage } from '../src/core/types';

const difficulties = ['entry', 'easy', 'standard', 'advanced', 'challenge'] as const;
const base: WorksheetConfig = {
  stage: 'grade6', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard', types: ['numberSequence'], count: 100,
  verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true, answerPage: true,
  answerMode: 'detailed', allowDuplicates: true, randomMix: true, ordering: 'random', generationMode: 'count', pageTarget: 1,
  fields: { name: true, date: true, time: true, score: true, streak: false }, orientation: 'portrait', fontSize: 'standard'
};

describe('question mathematical and language quality', () => {
  it('validates generated instances for every registered type', () => {
    for (const definition of QUESTION_DEFINITIONS) {
      const stage: Stage = 'grade6';
      const type = definition.id;
      for (const difficulty of difficulties) {
        const vertical = definition.practice === 'vertical';
        const config = {
          ...base, stage, difficulty, rangeMode: 'free', types: [type as ProblemType],
          practiceMode: vertical ? (type === 'verticalAddition' || type === 'verticalSubtraction' ? 'verticalAddSub' : 'verticalMulDiv') as const : 'standard' as const,
          verticalOperations: vertical
            ? (type === 'verticalAddition' ? ['addition'] : type === 'verticalSubtraction' ? ['subtraction'] : type === 'verticalMultiplication' ? ['multiplication'] : ['division']) as const
            : base.verticalOperations
        };
        const profile = getProblemProfile(type, difficulty, stage, 'free');
        const random = createGenerationContext(`quality-${stage}-${type}-${difficulty}`).random;
        for (let index = 0; index < 10; index++) {
          const question = getQuestionDefinition(type).generate({ type, config, profile, random, createId: () => `quality-${stage}-${type}-${difficulty}-${index}` });
          expect(validateQuestion(question, config), `${stage}/${type}/${difficulty}: ${question.text}`).toEqual({ valid: true, errors: [] });
          expect(question.answerDetails?.display).not.toBe('');
          if (question.answerDetails?.unit) expect(question.answerDetails.display.endsWith(question.answerDetails.unit)).toBe(true);
        }
      }
    }
  }, 30_000);

  it('replays word problems and uses varied, meaningful relation templates', () => {
    const config = { ...base, stage: 'grade3' as Stage, rangeMode: 'curriculum' as const, allowDuplicates: false, types: ['wordProblem' as ProblemType] };
    const profile = getProblemProfile('wordProblem', config.difficulty, config.stage, 'curriculum');
    const generate = (seed: string) => {
      const random = createGenerationContext(seed).random;
      return Array.from({ length: 100 }, () => generateWordProblem(profile.max, profile.wordSteps, config.difficulty, config.stage, profile.maxFactor, profile.highRangeRate, random));
    };
    const first = generate('word-quality');
    const replay = generate('word-quality');
    expect(replay).toEqual(first);
    expect(new Set(first.map(question => question.metadata?.semantic)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(first.map(question => question.metadata?.templateIndex)).size).toBeGreaterThanOrEqual(4);
    expect(first.every(question => {
      const details = question.answerDetails;
      return details?.unit !== undefined && details.display.endsWith(details.unit);
    })).toBe(true);
  });

  it('uses a broad set of natural multi-step templates with reliable units', () => {
    const random = createGenerationContext('word-multistep-diversity').random;
    const questions = Array.from({ length: 100 }, () => generateWordProblem(80, 3, 'challenge', 'grade4', 9, .8, random));
    const multi = questions.filter(question => Number(question.metadata?.steps) >= 2);
    expect(multi.length).toBeGreaterThan(70);
    expect(new Set(multi.map(question => `${question.metadata?.semantic}:${question.metadata?.templateIndex}`)).size).toBeGreaterThanOrEqual(8);
    expect(multi.every(question => question.answerDetails?.unit && question.answerDetails.display.endsWith(question.answerDetails.unit))).toBe(true);
    expect(multi.every(question => !/个胡萝卜|个课外书|朵课外书|张胡萝卜/.test(question.text))).toBe(true);
  });

  it('keeps multiplication two-step relationships stage-safe and bounded', () => {
    const make = (stage: Stage) => {
      const random = createGenerationContext(`word-two-step-${stage}`).random;
      return Array.from({ length: 500 }, () => generateWordProblem(100, 2, 'standard', stage, 9, .7, random));
    };
    const upper = make('grade3');
    expect(upper.some(question => question.operators?.join(',') === '×,+')).toBe(true);
    expect(upper.some(question => question.operators?.join(',') === '×,-')).toBe(true);
    expect(upper.filter(question => question.operators?.[0] === '×').every(question => question.answer >= 0 && question.operands.slice(0, 2).every(value => value <= 9) && question.answer <= 100)).toBe(true);
    const grade1 = make('grade1');
    expect(grade1.every(question => !question.operators?.includes('×') && !question.operators?.includes('÷'))).toBe(true);
  });

  it('renders every semantic/template/entity combination with a compatible final unit', () => {
    const fixtures: Record<string, Record<string, number>> = {
      combine: { left: 3, right: 4 }, decrease: { original: 9, removed: 2 },
      'unknown-start': { removed: 2, remaining: 5 }, 'unknown-change': { original: 3, final: 8 },
      difference: { larger: 8, smaller: 3 }, 'equal-groups': { groups: 3, each: 4 },
      sharing: { total: 12, groups: 3 }, grouping: { total: 12, each: 3 },
      'add-then-subtract': { start: 8, added: 4, removed: 3 },
      'subtract-then-add': { start: 8, removed: 3, added: 4 },
      'three-step-change': { start: 8, first: 4, second: 3, third: 2 },
      'groups-plus': { groups: 3, each: 4, extra: 2 },
      'groups-minus': { groups: 3, each: 4, removed: 2 }
    };
    for (const [semantic, templates] of Object.entries(WORD_TEMPLATES)) {
      const fixedEntityTexts = new Set<string>();
      for (let templateIndex = 0; templateIndex < templates.length; templateIndex++) {
        for (let entityIndex = 0; entityIndex < WORD_ENTITIES.length; entityIndex++) {
          const rendered = renderWordTemplate(semantic as keyof typeof WORD_TEMPLATES, templateIndex, entityIndex, fixtures[semantic]);
          expect(rendered.text).not.toMatch(/undefined|NaN/);
          expect(rendered.text).not.toMatch(/吃铅笔|摘铅笔|摘书|摘贴纸|书架胡萝卜|新开非花/);
          if (entityIndex === 0) fixedEntityTexts.add(rendered.text);
          const finalQuestion = rendered.text.match(/(?:多少|几)([^？]+)？$/)?.[1];
          expect(finalQuestion, `${semantic}/${templateIndex}/${entityIndex}`).toContain(rendered.unit);
        }
      }
      expect(fixedEntityTexts.size, `${semantic} templates`).toBe(8);
    }
    const bookGroups = renderWordTemplate('grouping', 1, 3, fixtures.grouping);
    expect(bookGroups.text).toContain('多少组？');
    expect(bookGroups.unit).toBe('组');
    expect(bookGroups.text).not.toMatch(/多少层|装一层/);
    const stickerShares = renderWordTemplate('grouping', 2, 2, fixtures.grouping);
    expect(stickerShares.text).toContain('多少份？');
    expect(stickerShares.unit).toBe('份');
    expect(stickerShares.text).not.toMatch(/多少页|装一页/);
  });
});
