import { describe, expect, it } from 'vitest';
import { generateWorksheet } from '../src/core/generate';
import type { WorksheetConfig } from '../src/domain/worksheet/config';

const config: WorksheetConfig = {
  stage: 'grade3', rangeMode: 'curriculum', difficulty: 'standard', practiceMode: 'standard',
  types: ['addition100', 'subtraction100', 'multiplication', 'division'], count: 100,
  verticalOperations: ['addition', 'subtraction'], verticalPages: 1, showNumbers: true, showLines: true,
  answerPage: false, answerMode: 'none', allowDuplicates: true, randomMix: false,
  ordering: 'grouped', generationMode: 'count', pageTarget: 1,
  fields: { name: false, date: false, time: false, score: false, streak: false },
  orientation: 'portrait', fontSize: 'standard'
};

describe('core generation performance baseline', () => {
  it('generates 100 ordinary math questions within a stable 500ms budget', () => {
    // Warm up module/JIT work. The timed section measures generateWorksheet only;
    // browser/Vite startup and test collection are intentionally outside it.
    generateWorksheet(config, { seed: 'performance-warmup' });
    const samples = Array.from({ length: 5 }, (_, index) => {
      const start = performance.now();
      const worksheet = generateWorksheet(config, { seed: `performance-${index}` });
      const elapsed = performance.now() - start;
      expect(worksheet.questions).toHaveLength(100);
      return elapsed;
    });
    const slowest = Math.max(...samples);
    const median = [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)];
    console.info(`generateWorksheet 100-question samples: ${samples.map(value => value.toFixed(1)).join(', ')}ms; median=${median.toFixed(1)}ms; max=${slowest.toFixed(1)}ms`);
    expect(median).toBeLessThan(500);
    expect(slowest).toBeLessThan(500);
  });
});
