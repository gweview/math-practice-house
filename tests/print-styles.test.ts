import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('print styles', () => {
  it('removes the accessibility skip link from printed sheets', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');
    const printStart = css.indexOf('@media print');
    const printEnd = css.indexOf('\n}', printStart);
    expect(printStart).toBeGreaterThanOrEqual(0);
    expect(css.slice(printStart, printEnd)).toContain('.skip-link{display:none!important}');
  });
});
