import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QUESTION_DEFINITIONS } from '../src/domain/questions/registry';
import { CONTENT_CATEGORIES } from '../src/domain/questions/coverage';
import { CURRICULUM_MAXIMUMS } from '../src/domain/questions/difficulty';
import { getProblemProfile } from '../src/core/difficulty-config';
import { validateQuestion } from '../src/core/validators';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import type { WorksheetConfig } from '../src/core/types';

const root = join(process.cwd(), 'src');

describe('question definition architecture boundary', () => {
  it('does not leave central definition metadata or type upper-bound maps', () => {
    const registry = readFileSync(join(root, 'domain/questions/registry.ts'), 'utf8');
    const difficulty = readFileSync(join(root, 'core/difficulty-config.ts'), 'utf8');
    const validator = readFileSync(join(root, 'core/validators.ts'), 'utf8');
    expect(registry).not.toMatch(/define\(\{\s*id:/);
    expect(registry).not.toContain('generateLegacyQuestion');
    expect(validator).not.toMatch(/legacy|expanded|TYPE_MAX|GENERATORS/i);
    expect(difficulty).not.toContain('TYPE_MAX');
    expect(validator).not.toContain('TYPE_MAX');
  });

  it('keeps manifests and question implementations below orchestration layers', () => {
    const directories = [join(root, 'question-types')];
    const files = directories.flatMap(directory => {
      const walk = (current: string): string[] => readdirSync(current, { withFileTypes: true }).flatMap(entry => {
        const path = join(current, entry.name);
        if (entry.isDirectory()) return walk(path);
        return entry.name.endsWith('.ts') ? [path] : [];
      });
      return walk(directory);
    });
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source, file).not.toMatch(/from ['"][^'"]*(domain\/questions\/registry|core\/generate(?:['"]|\/index)|core\/validators|core\/difficulty-config)/);
    }
  });

  it('requires category and type-owned difficulty metadata for every definition', () => {
    for (const definition of QUESTION_DEFINITIONS) {
      expect(definition.label).not.toBe(definition.id);
      expect(definition.label).toMatch(/[\u3400-\u9fff]/);
      expect(definition.description).not.toContain('练习并应用相关数量关系');
      expect(definition.skills.length, definition.id).toBeGreaterThanOrEqual(3);
      expect(CONTENT_CATEGORIES).toContain(definition.contentCategory);
      expect(definition.difficultyProfiles.standard?.max, definition.id).toBeGreaterThan(0);
      expect(definition.generate, definition.id).toEqual(expect.any(Function));
      expect(definition.validate, definition.id).toEqual(expect.any(Function));
    }
  });

  it('uses one curriculum ceiling source for profile resolution and validators', () => {
    expect(Object.keys(CURRICULUM_MAXIMUMS)).toEqual(['preschool', 'grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6']);
    const validator = readFileSync(join(root, 'core/validators.ts'), 'utf8');
    const gradeConfig = readFileSync(join(root, 'core/grade-config.ts'), 'utf8');
    expect(validator).not.toMatch(/const\s+STAGE_LIMITS/);
    expect(gradeConfig).not.toMatch(/export const STAGE_LIMITS\s*:\s*Record/);
    expect(gradeConfig).toContain('CURRICULUM_MAXIMUMS');
  });

  it('keeps representative type-owned minimum difficulty constraints', () => {
    expect(getProblemProfile('twoDigitCarry', 'entry', 'grade2', 'free')).toMatchObject({ min: 10, max: 40 });
    expect(getProblemProfile('addition1000', 'entry', 'grade3', 'free')).toMatchObject({ min: 10, max: 300 });
    expect(getProblemProfile('threeDigitByOneMultiplication', 'entry', 'grade3', 'free')).toMatchObject({ min: 100, max: 300 });
  });

  it('keeps every registered definition executable without a compatibility dispatcher', () => {
    expect(QUESTION_DEFINITIONS).toHaveLength(109);
    for (const definition of QUESTION_DEFINITIONS) {
      const stage = definition.allowedGrades.at(-1) ?? 'grade6';
      const vertical = definition.practice === 'vertical';
      const type = definition.id;
      const config: WorksheetConfig = {
        stage, rangeMode: 'free', difficulty: 'standard', practiceMode: vertical
          ? (type === 'verticalAddition' || type === 'verticalSubtraction' ? 'verticalAddSub' : 'verticalMulDiv') : 'standard',
        types: [type], count: 5, verticalOperations: vertical
          ? (type === 'verticalAddition' ? ['addition'] : type === 'verticalSubtraction' ? ['subtraction'] : type === 'verticalMultiplication' ? ['multiplication'] : ['division'])
          : ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true,
        answerPage: false, answerMode: 'none', allowDuplicates: true, randomMix: false,
        ordering: 'grouped', generationMode: 'count', pageTarget: 1,
        fields: { name: false, date: false, time: false, score: false, streak: false },
        orientation: 'portrait', fontSize: 'standard'
      };
      const context = createGenerationContext(`definition-boundary-${type}`);
      const question = definition.generate({ type, config, profile: getProblemProfile(type, 'standard', stage, 'free'), random: context.random, createId: context.createId });
      expect(question.type, type).toBe(type);
      expect(definition.validate(question, config, definition), type).toEqual({ valid: true, errors: [] });
    }
  });

  it('rejects unregistered, malformed, and extra-operand questions at the single entry point', () => {
    const definition = QUESTION_DEFINITIONS.find(item => item.id === 'addition10')!;
    const config: WorksheetConfig = {
      stage: 'grade1', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard', types: ['addition10'], count: 5,
      verticalOperations: ['addition'], verticalPages: 1, showNumbers: true, showLines: true, answerPage: false, answerMode: 'none',
      allowDuplicates: true, randomMix: false, ordering: 'grouped', generationMode: 'count', pageTarget: 1,
      fields: { name: false, date: false, time: false, score: false, streak: false }, orientation: 'portrait', fontSize: 'standard'
    };
    const context = createGenerationContext('malformed-boundary');
    const valid = definition.generate({ type: 'addition10', config, profile: getProblemProfile('addition10', 'standard', 'grade1', 'free'), random: context.random, createId: context.createId });
    expect(validateQuestion({ ...valid, type: 'notRegistered' as typeof valid.type }, config).valid).toBe(false);
    expect(validateQuestion({ ...valid, operands: [valid.operands[0], valid.operands[1], 1] }, config).valid).toBe(false);
    expect(validateQuestion({ ...valid, operands: [Number.NaN, valid.operands[1]] }, config).valid).toBe(false);
  });

  it('applies the selected definition profile in the definition validator', () => {
    const config: WorksheetConfig = {
      stage: 'grade1', rangeMode: 'free', difficulty: 'standard', practiceMode: 'standard', types: ['addition10'], count: 5,
      verticalOperations: ['addition'], verticalPages: 1, showNumbers: true, showLines: true, answerPage: false,
      allowDuplicates: true, randomMix: false, fields: { name: false, date: false, time: false, score: false, streak: false },
      orientation: 'portrait', fontSize: 'standard'
    };
    const definition = QUESTION_DEFINITIONS.find(item => item.id === 'addition10');
    const result = definition!.validate({ id: 'too-large', type: 'addition10', text: '11 + 0 =', answer: 11, operands: [11, 0], operators: ['+'], signature: 'too-large', layout: 'inline' }, config, definition);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('题目超过该题型难度上限');
  });
});
