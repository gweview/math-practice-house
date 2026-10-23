import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

// Own isolated loopback server and fresh browser contexts: no existing server required.
const server = await createServer({ server: { host: '127.0.0.1', port: 4196, strictPort: true } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const only = process.argv[2];
let failures = 0;
async function fresh() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(base);
  await page.waitForSelector('#availability-panel small');
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function generated(page) {
  await page.click('.generate');
  await page.waitForSelector('#print-root .student-page', { state: 'attached' });
  await page.waitForFunction(() => !document.querySelector('.print-measure'));
}
async function holdFonts(page) {
  await page.evaluate(() => {
    window.fontWaiters = [];
    window.printCalls = 0;
    window.print = () => window.printCalls++;
    Object.defineProperty(document.fonts, 'ready', { configurable: true, get() {
      if (window.fontWaiters.length < 2) return new Promise(resolve => window.fontWaiters.push(resolve));
      return Promise.resolve(document.fonts);
    } });
  });
}
async function releaseReverse(page) {
  await page.waitForFunction(() => window.fontWaiters.length === 2);
  await page.evaluate(() => window.fontWaiters[1]());
  await page.waitForFunction(() => document.querySelectorAll('.print-measure').length === 1);
  const interim = await page.locator('#print-root .answer-page').count();
  await page.evaluate(() => window.fontWaiters[0]());
  await page.waitForFunction(() => !document.querySelector('.print-measure'));
  // Drain the asynchronous paginate/commit continuations, not a timing-based sleep.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return interim;
}
const cases = {
  async capacity() {
    const evidence = [];
    for (const route of ['practice-topic', 'back-configure']) {
      const page = await fresh();
      try {
        const before = await page.locator('#availability-panel').innerText();
        await page.click('.nav-item[data-view="map"]');
        await page.selectOption('#map-grade', '3');
        if (route === 'practice-topic') {
          await page.click('[data-explore="cnm_p224"]');
          await page.click('[data-practice-topic="cnm_p224"]');
        } else await page.click('.map-view [data-view="configure"]');
        await page.waitForFunction(() => document.querySelector('#availability-panel')?.textContent.includes('实际可用'));
        const after = await page.locator('#availability-panel').innerText();
        const expected = await page.evaluate(async route => {
          const engine = await import('/src/engine.js');
          const { summarizeAvailability } = await import('/src/planner.js');
          const { scopeCatalog } = await import('/src/main.js');
          const catalog = await engine.loadCatalog();
          return (await summarizeAvailability(scopeCatalog(catalog, catalog.topics.filter(t => Number(t.grade) === 3)), { grade: 3, semester: 'all', domain: 'all', search: '', topicId: route === 'practice-topic' ? 'cnm_p224' : 'all', dimensions: ['fill'], level: 1, count: 6, seed: 'little-house-01', mode: 'custom' }, engine)).availableCount;
        }, route);
        const displayed = Number(after.match(/实际可用 (\d+) 题/)[1]);
        evidence.push({ route, initial: Number(before.match(/实际可用 (\d+) 题/)[1]), displayed, expected });
        assert.equal(await page.locator('#grade').inputValue(), '3');
        assert.equal(await page.locator('[name="dimensions"][value="fill"]').isChecked(), true);
      } finally { await page.close(); }
    }
    console.log('capacity evidence:', JSON.stringify(evidence));
    for (const row of evidence) assert.equal(row.displayed, row.expected, `${row.route}: stale grade2 capacity ${row.displayed}, actual grade3 ${row.expected}`);
    assert.equal(evidence[0].expected, 0, 'grade3 p224 fill must be unsupported, not 64');
    console.log('PASS capacity: map→topic practice and map→back configure refresh actual grade3 availability');
  },
  async geometry() {
    const page = await fresh();
    try {
      const measure = async () => {
        const engine = await import('/src/engine.js');
        const { planWorksheet } = await import('/src/planner.js');
        const { paginatePrint } = await import('/src/print-layout.js');
        const catalog = await engine.loadCatalog();
        const plan = await planWorksheet(catalog, { grade: 3, semester: 'all', topicId: 'cnm_p224', dimensions: ['reasoning'], level: 2, count: 18, mode: 'thinking', seed: 'ui-review' }, engine);
        const root = document.createElement('div');
        document.body.append(root);
        const rect = Element.prototype.getBoundingClientRect;
        const results = [];
        try {
          for (const columns of [1, 2]) {
            const measured = {};
            Element.prototype.getBoundingClientRect = function () {
              const result = rect.call(this);
              const q = this.closest('.print-measure') && this.querySelector('.print-question');
              if (q) measured[q.dataset.ordinal] = { height: rect.call(q).height, manual: [...q.querySelectorAll('.manual-space')].map(n => rect.call(n).height) };
              return result;
            };
            const pages = await paginatePrint({ questions: plan.questions, sections: plan.sections, columns, style: 'thinking', metadata: '3 年级 · 全学年 · 植树问题 · 18题 · ui-review · 来源 cn-math-taxonomy / CC BY-NC 4.0 · AI草稿，教师请核对', root });
            Element.prototype.getBoundingClientRect = rect;
            const cards = [...root.querySelectorAll('.student-page .print-question')].map(q => {
              const actual = q.getBoundingClientRect();
              const p = q.closest('.print-page');
              return { ordinal: q.dataset.ordinal, measured: measured[q.dataset.ordinal], height: actual.height, manual: [...q.querySelectorAll('.manual-space')].map(n => n.getBoundingClientRect().height), contentOverflow: actual.bottom - p.querySelector('.print-page-content').getBoundingClientRect().bottom, footerOverflow: actual.bottom - p.querySelector('.print-page-footer').getBoundingClientRect().top };
            });
            results.push({ columns, pages: pages.studentPageCount, cards });
          }
        } finally { Element.prototype.getBoundingClientRect = rect; root.remove(); }
        return results;
      };
      const results = [];
      for (const media of ['screen', 'print']) {
        await page.emulateMedia({ media });
        results.push(...(await page.evaluate(measure)).map(result => ({ ...result, media })));
      }
      console.log('geometry evidence:', JSON.stringify(results.map(r => ({ media: r.media, columns: r.columns, pages: r.pages, cards: r.cards.length, maxHeightDelta: Math.max(...r.cards.map(q => Math.abs(q.height - q.measured.height))), manualPx: r.cards[0].manual, maxContentOverflow: Math.max(...r.cards.map(q => q.contentOverflow)), maxFooterOverflow: Math.max(...r.cards.map(q => q.footerOverflow)), q16: r.cards[15] }))));
      for (const result of results) {
        assert.equal(result.cards.length, 18);
        assert.ok(result.cards.some(q => q.manual.length), 'fixture must exercise manual reasoning space');
        for (const q of result.cards) {
          assert.ok(Math.abs(q.height - q.measured.height) <= 1, `columns=${result.columns} q${q.ordinal}: measured ${q.measured.height}px vs final ${q.height}px`);
          assert.deepEqual(q.manual, q.measured.manual, 'manual-space measurement/final geometry must match');
          assert.ok(q.contentOverflow <= 1, `q${q.ordinal} exceeds content by ${q.contentOverflow}px`);
          assert.ok(q.footerOverflow < 0, `q${q.ordinal} overlaps footer by ${q.footerOverflow}px`);
        }
      }
      console.log('PASS geometry: grade3 cnm_p224 reasoning L2 count18 thinking ui-review, columns1/2; all cards measured accurately and above footer');
    } finally { await page.close(); }
  },
  async race() {
    const page = await fresh();
    try {
      await generated(page);
      await holdFonts(page);
      await page.check('#print-answers');
      await page.uncheck('#print-answers');
      const interim = await releaseReverse(page);
      const restored = await page.locator('#print-root .answer-page').count();
      assert.equal(interim, 0);
      console.log(`race evidence: older checked answerPages=${restored}`);
      await page.check('#print-answers');
      await page.waitForFunction(() => !document.querySelector('.print-measure'));
      await holdFonts(page);
      await page.click('[data-action="print"]');
      await page.uncheck('#print-answers');
      await releaseReverse(page);
      const calls = await page.evaluate(() => window.printCalls);
      console.log(`race evidence: stale printCalls=${calls}`);
      assert.deepEqual({ restored, calls }, { restored: 0, calls: 0 }, 'stale render must neither restore answer pages nor print');
      assert.equal(await page.locator('#print-root .answer-page').count(), 0);
      assert.equal(await page.locator('#print-root').getAttribute('data-answer-pages'), '0');
      await page.click('[data-action="print"]');
      await page.waitForFunction(() => window.printCalls === 1);
      console.log('PASS race: reversed fonts.ready completion; unchecked answerPages=0; stale printCalls=0; current printCalls=1');
    } finally { await page.close(); }
  },
};
try {
  for (const [name, run] of Object.entries(cases)) {
    if (only && only !== name) continue;
    try { await run(); } catch (error) { failures++; console.error(`FAIL ${name}: ${error.stack}`); }
  }
} finally { await browser.close(); await server.close(); }
if (failures) process.exitCode = 1;
