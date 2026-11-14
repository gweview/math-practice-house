import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import QuestionVisual from '../src/features/math/QuestionVisual';
import { QUESTION_DEFINITIONS, getQuestionDefinition } from '../src/domain/questions/registry';
import { getProblemProfile } from '../src/core/difficulty-config';
import { createGenerationContext } from '../src/shared/random/seeded-random';
import type { ProblemType, Question, WorksheetConfig } from '../src/core/types';

const base: WorksheetConfig = {
  stage: 'grade6', rangeMode: 'curriculum', difficulty: 'standard', practiceMode: 'standard', types: ['axisSymmetry'], count: 5,
  verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true, answerPage: true, answerMode: 'compact', allowDuplicates: true,
  randomMix: true, ordering: 'random', generationMode: 'count', pageTarget: 1, fields: { name: true, date: true, time: true, score: true, streak: false }, orientation: 'portrait', fontSize: 'standard'
};

const visual = (content: NonNullable<Question['content']>, answer?: number | string) => React.createElement(QuestionVisual, { content, answer });
const generateQuestion = (type: ProblemType, config: WorksheetConfig, seed: string): Question => {
  const context = createGenerationContext(seed);
  const definition = getQuestionDefinition(type);
  return definition.generate({ type, config, profile: getProblemProfile(type, config.difficulty, config.stage, config.rangeMode), random: context.random, createId: context.createId });
};

describe('structured question visual contracts', () => {
  it('question-state visuals do not print final answers or answer labels', () => {
    const types: ProblemType[] = ['axisSymmetry', 'cuboidNet', 'pieChartReading', 'quantityEstimate', 'translationRotation'];
    for (const type of types) {
      const config = { ...base, types: [type], stage: type === 'quantityEstimate' ? 'grade2' as const : 'grade6' as const };
      const question = generateQuestion(type, config, `visual-${type}`);
      const markup = renderToStaticMarkup(visual(question.content!));
      const visibleText = markup.replace(/<[^>]*>/g, '');
      if (type !== 'quantityEstimate') expect(visibleText).not.toContain(String(question.answer));
      const semanticAttrs = [...markup.matchAll(/(?:aria-label|title|data-[^=]+)="([^"]*)"/g)].map(match => match[1]);
      if (type !== 'quantityEstimate') expect(semanticAttrs.join('|')).not.toContain(String(question.answer));
      expect(visibleText).not.toMatch(/(正方形|长方形|等边三角形)有?\d+条/);
      expect(visibleText).not.toMatch(/\d+%/);
    }
  });

  it('answer-state adds the requested answer to structured visuals', () => {
    const config = { ...base, types: ['axisSymmetry' as ProblemType] };
    const question = generateQuestion('axisSymmetry', config, 'visual-answer');
    const markup = renderToStaticMarkup(visual(question.content!, question.answer));
    expect((markup.match(/class="guide"/g) ?? []).length).toBe(Number(question.answer));
  });

  it('keeps line endpoints/arrows connected and chart encodings distinct', () => {
    for (const type of [0, 1, 2]) {
      const markup = renderToStaticMarkup(visual({ kind: 'geometry', shape: 'line', dimensions: [type, 8] }));
      expect(markup).toContain('x1="40"');
      expect(markup).toContain('x2="214"');
      if (type === 0) expect((markup.match(/<circle/g) ?? []).length).toBe(2);
      if (type === 1) expect(markup).toContain('M214 48l12 7-12 7');
      if (type === 2) expect(markup).toContain('M40 48l-12 7 12 7');
    }
    const pie = renderToStaticMarkup(visual({ kind: 'chart', chartType: 'pie', labels: ['A', 'B', 'C', 'D'], values: [10, 20, 30, 40] }));
    const piePatternMarkup = [...pie.matchAll(/<pattern[^>]*id="([^"]+)"[^>]*>[\s\S]*?<path d="([^"]+)"[\s\S]*?<\/pattern>/g)];
    expect(piePatternMarkup).toHaveLength(4);
    expect(new Set(piePatternMarkup.map(match => match[2])).size).toBe(4);
    for (const [, id] of piePatternMarkup) expect((pie.match(new RegExp(`fill="url\\(#${id}\\)"`, 'g')) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(pie).toContain('text-anchor="start"');
    const bars = renderToStaticMarkup(visual({ kind: 'chart', chartType: 'bar', labels: ['一', '二'], values: [3, 4], series: [{ label: 'A组', values: [3, 4] }, { label: 'B组', values: [5, 6] }] }));
    expect(bars).toContain('A组'); expect(bars).toContain('B组'); expect(bars).toMatch(/series-[^"]+-a/); expect(bars).toMatch(/series-[^"]+-b/);
    const barPatterns = [...bars.matchAll(/<pattern[^>]*id="([^"]+)"[^>]*>[\s\S]*?<path d="([^"]+)"[\s\S]*?<\/pattern>/g)];
    expect(barPatterns.map(match => match[2])).toEqual(expect.arrayContaining(['M0 0L8 8', 'M4 0v8']));
    for (const [, id] of barPatterns) expect(bars).toContain(`fill="url(#${id})"`);
  });

  it('uses bounded sector endpoints and only marks reflex sectors as large arcs', () => {
    for (const angle of [60, 90, 120, 180, 270]) {
      const markup = renderToStaticMarkup(visual({ kind: 'geometry', shape: 'sector', dimensions: [5, angle] }));
      const endpoint = markup.match(/A55 55 0 ([01]) 1 ([\d.]+) ([\d.]+)/);
      expect(endpoint).not.toBeNull();
      const x = Number(endpoint?.[2]); const y = Number(endpoint?.[3]);
      expect(x).toBeGreaterThanOrEqual(35); expect(x).toBeLessThanOrEqual(145);
      expect(y).toBeGreaterThanOrEqual(20); expect(y).toBeLessThanOrEqual(130);
      expect(endpoint?.[1]).toBe(angle === 270 ? '1' : '0');
      if (angle === 90) expect(markup).toContain('145 75');
      if (angle === 180) expect(markup).toContain('90 130');
    }
  });

  it('scopes chart pattern ids to each component instance', () => {
    const chart = { kind: 'chart' as const, chartType: 'pie' as const, labels: ['A', 'B', 'C', 'D'], values: [10, 20, 30, 40] };
    const bar = { kind: 'chart' as const, chartType: 'bar' as const, labels: ['一', '二'], values: [3, 4], series: [{ label: 'A', values: [3, 4] }, { label: 'B', values: [5, 6] }] };
    for (const content of [chart, bar]) {
      const markup = renderToStaticMarkup(React.createElement('section', null, visual(content), visual(content)));
      const ids = [...markup.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const [, id] of [...markup.matchAll(/url\(#([^)]*)\)/g)]) expect(ids).toContain(id);
    }
  });

  it('keeps every generated content visual free of answer-bearing attributes', () => {
    for (const { id: type } of QUESTION_DEFINITIONS) {
      const config = { ...base, types: [type], stage: 'grade6' as const };
      const question = generateQuestion(type, config, `all-visual-${type}`);
      if (!question.content) continue;
      const markup = renderToStaticMarkup(visual(question.content));
      expect(markup).not.toMatch(/data-(?:answer|correct)=/i);
      const attrs = [...markup.matchAll(/(?:aria-label|title|data-[^=]+)="([^"]*)"/gi)].map(match => match[1]).join('|');
      expect(attrs).not.toMatch(/answer|correct/i);
      if (question.content.kind === 'numberLine') expect(markup).toContain('>?</text>');
      if (question.content.kind === 'multiPart' && question.content.parts.some(part => part.answer !== undefined)) expect(markup).toContain('□');
      if (question.content.kind === 'table' && question.content.rows.some(row => row.includes('□'))) expect(markup).toContain('□');
    }
  });
});
