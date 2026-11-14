/* global console, document, localStorage, getComputedStyle, window, Event, process, URL */
import { chromium } from 'playwright-core';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.env.APP_URL || 'http://127.0.0.1:8088';
const appOrigin = new URL(url).origin;
const executablePath = process.env.CHROME_PATH || '/home/ubuntu/.local/bin/google-chrome';
const artifactDirectory = mkdtempSync(join(tmpdir(), 'math-worksheet-binary-'));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const badResponses = [];
const externalRequests = [];
function monitor(monitoredPage) {
  monitoredPage.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  monitoredPage.on('pageerror', error => pageErrors.push(String(error)));
  monitoredPage.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || 'failed'}`));
  monitoredPage.on('response', response => { if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`); });
  monitoredPage.on('request', request => {
    const target = request.url();
    if (!target.startsWith(appOrigin) && !target.startsWith('data:') && !target.startsWith('blob:')) externalRequests.push(target);
  });
}
monitor(page);
function assert(condition, message) { if (!condition) throw new Error(message); }
function pdfPageCount(pdf) { return (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length; }
function pdfMediaBoxes(pdf) {
  return [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)]
    .map(match => [Number(match[1]), Number(match[2])]);
}

await page.addInitScript(() => {
  localStorage.removeItem('math-worksheet-config-v1');
  localStorage.removeItem('math-worksheet-config-v2');
  localStorage.removeItem('math-worksheet-sudoku-config-v1');
  localStorage.removeItem('math-worksheet-sudoku-config-v2');
  localStorage.removeItem('math-worksheet-binary-reasoning-config-v1');
  localStorage.setItem('math-worksheet-binary-reasoning-config-v1', JSON.stringify({
    stage: 'grade3', difficulty: 'challenge', methods: ['sameValue', 'substitution', 'sumDifference', 'chain'], count: 40,
    randomMix: false, allowDuplicates: false, answerPage: true,
    fields: { name: true, date: true, time: true }, orientation: 'portrait', fontSize: 'standard'
  }));
});
await page.goto(url, { waitUntil: 'networkidle' });
assert(await page.getByRole('tab', { name: /数学练习/ }).getAttribute('aria-pressed') === 'true', '默认模式不再是数学练习');
assert(await page.locator('.mode-switch button').count() === 3, '顶部应有三个并列模块');
await page.getByRole('tab', { name: /二元推算/ }).click();
await page.getByRole('button', { name: /生成二元推算/ }).click();
await page.getByTestId('binary-workbook').waitFor({ state: 'visible', timeout: 10_000 });
const cards = page.getByTestId('binary-problem-card');
assert(await cards.count() === 40, '应生成40道题');
const methods = await cards.evaluateAll(items => [...new Set(items.map(item => item.getAttribute('data-method'))) ]);
assert(methods.length === 4, '四种推算方法没有全部生成');
assert(await page.locator('.binary-sheet--questions .binary-equation').count() === 80, '每题应有两个结构化等式');
const differenceEquations = await page.locator('.binary-sheet--questions [data-method="sumDifference"] .binary-equation:nth-child(2)').allTextContents();
assert(differenceEquations.every(text => text.includes('-')), '和差推算的差式必须在视觉题面中显示减号');

await page.getByRole('button', { name: /显示答案页/ }).click();
assert(await page.locator('.binary-sheet--answers:visible').count() > 0, '答案页未显示');
assert(await page.locator('.binary-solution-step:visible').count() >= 40, '答案页缺少分步解析');

await page.emulateMedia({ media: 'print' });
const geometry = await page.locator('.binary-sheet').evaluateAll(sheets => sheets.map(sheet => {
  const rect = sheet.getBoundingClientRect();
  const cards = [...sheet.querySelectorAll('.binary-problem-card')];
  return {
    kind: sheet.getAttribute('data-sheet-kind'),
    visible: getComputedStyle(sheet).display !== 'none',
    width: rect.width, height: rect.height,
    footerCount: sheet.querySelectorAll('footer').length,
    overflow: sheet.scrollWidth > sheet.clientWidth + 1 || sheet.scrollHeight > sheet.clientHeight + 1,
    cardsInside: cards.every(card => {
      const child = card.getBoundingClientRect();
      return child.left >= rect.left - 1 && child.top >= rect.top - 1 && child.right <= rect.right + 1 && child.bottom <= rect.bottom + 1;
    })
  };
}));
assert(geometry.every(item => item.visible && !item.overflow && item.cardsInside), '打印布局存在隐藏、溢出或越界题卡');
assert(await page.locator('.math-mode-content').evaluate(element => getComputedStyle(element).display) === 'none', '打印二元推算时夹带数学模块');
assert(await page.locator('.sudoku-mode-content').evaluate(element => getComputedStyle(element).display) === 'none', '打印二元推算时夹带数独模块');
assert(geometry.every(item => item.footerCount === 0), '二元推理打印页仍包含非必要页尾');
assert(geometry.every(item => Math.abs(item.height - 296 / 25.4 * 96) <= 2), '二元推理打印页没有保留 1mm 分页余量');
assert(await page.locator('.binary-config-panel').evaluate(element => getComputedStyle(element).display) === 'none', '打印时设置面板未隐藏');
const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
assert(pdfPageCount(pdf) === geometry.length, `PDF页数不符：${pdfPageCount(pdf)} != ${geometry.length}`);
writeFileSync(join(artifactDirectory, 'binary-reasoning-sample.pdf'), pdf);
await page.screenshot({ path: join(artifactDirectory, 'binary-reasoning-print.png'), fullPage: true });

await page.emulateMedia({ media: 'screen' });
await page.getByRole('button', { name: 'A4 横向' }).click();
await page.locator('.binary-sheet--landscape').first().waitFor({ state: 'visible' });
await page.waitForFunction(() => {
  try {
    const current = JSON.parse(localStorage.getItem('math-worksheet-binary-reasoning-config-v2') || '{}');
    return current.version === 2 && current.value?.orientation === 'landscape';
  } catch {
    return false;
  }
});
await page.emulateMedia({ media: 'print' });
const landscapeSheets = await page.locator('.binary-sheet').count();
const landscapePdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
assert(pdfPageCount(landscapePdf) === landscapeSheets, '横向 PDF 页数与物理 sheet 不一致');
assert(pdfMediaBoxes(landscapePdf).every(([width, height]) => width > height), '横向 PDF MediaBox 方向错误');

await page.emulateMedia({ media: 'screen' });
await page.evaluate(() => {
  window.print = () => window.dispatchEvent(new Event('afterprint'));
});
await page.getByRole('button', { name: /打印二元推算/ }).click();
assert(await page.evaluate(() => document.body.dataset.printTarget) === undefined, 'afterprint 后目标标记未清理');
await page.emulateMedia({ media: 'print' });
assert(await page.locator('.binary-config-panel').evaluate(element => getComputedStyle(element).display) === 'none', '清理打印标记后设置面板重新出现');
for (const [target, visibleSelector, modeName] of [['math', '.math-mode-content', /数学练习/], ['sudoku', '.sudoku-mode-content', /数独练习/], ['binary-reasoning', '.binary-mode-content', /二元推算/]]) {
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('tab', { name: modeName }).click();
  await page.emulateMedia({ media: 'print' });
  await page.evaluate(value => { document.body.dataset.printTarget = value; }, target);
  for (const selector of ['.math-mode-content', '.sudoku-mode-content', '.binary-mode-content']) {
    const display = await page.locator(selector).evaluate(element => getComputedStyle(element).display);
    assert((selector === visibleSelector) === (display !== 'none'), `${target} 打印目标隔离失败：${selector} display=${display}`);
  }
}
await page.evaluate(() => { delete document.body.dataset.printTarget; });

await page.emulateMedia({ media: 'screen' });
for (const width of [360, 390, 768]) {
  await page.setViewportSize({ width, height: 800 });
  const mobileMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  assert(mobileMetrics.scrollWidth <= mobileMetrics.clientWidth + 1 &&
    mobileMetrics.bodyScrollWidth <= mobileMetrics.clientWidth + 1,
  `${width}px屏幕出现水平溢出：${JSON.stringify(mobileMetrics)}`);
}
assert(consoleErrors.length === 0 && pageErrors.length === 0 && failedRequests.length === 0 && badResponses.length === 0,
  `浏览器运行时错误：${JSON.stringify({ consoleErrors, pageErrors, failedRequests, badResponses })}`);
assert(externalRequests.length === 0, `发现第三方请求：${externalRequests.join(' | ')}`);
const recoveryContext = await browser.newContext();
await recoveryContext.addInitScript(() => localStorage.setItem('math-worksheet-binary-reasoning-config-v1', '{broken-json'));
const recoveryPage = await recoveryContext.newPage();
monitor(recoveryPage);
await recoveryPage.goto(url, { waitUntil: 'networkidle' });
await recoveryPage.getByRole('tab', { name: /二元推算/ }).click();
const recoveredDefault = recoveryPage.locator('.binary-mode-content').getByRole('button', { name: '标准', exact: true });
assert(await recoveredDefault.getAttribute('aria-pressed') === 'true', '损坏配置未恢复默认难度');
await recoveryContext.close();
console.log(JSON.stringify({ cards: 40, methods, portraitSheets: geometry.length, portraitPdfPages: pdfPageCount(pdf), landscapeSheets, landscapePdfPages: pdfPageCount(landscapePdf), configRecovery: 'ok', mobile: 360, artifacts: artifactDirectory, externalRequests: externalRequests.length, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, failedRequests: failedRequests.length, badResponses: badResponses.length }));
await browser.close();
