/* global process, document, fetch, localStorage, console, URL */
import { chromium } from 'playwright-core';

const url = process.env.APP_URL || 'http://127.0.0.1:8088';
const appOrigin = new URL(url).origin;
const executablePath = process.env.CHROME_PATH || '/home/ubuntu/.local/bin/google-chrome';
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
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
    if (!request.url().startsWith(appOrigin) && !request.url().startsWith('data:') && !request.url().startsWith('blob:')) externalRequests.push(request.url());
  });
}
monitor(page);

await page.addInitScript(() => {
  localStorage.removeItem('math-worksheet-config-v1');
  localStorage.removeItem('math-worksheet-config-v2');
});
await page.goto(url, { waitUntil: 'networkidle' });
if (await page.title() !== '快乐数学练习屋') throw new Error('页面标题不正确');
if (await page.evaluate(() => document.documentElement.scrollWidth !== document.documentElement.clientWidth)) throw new Error('桌面界面发生横向溢出');

await page.locator('.advanced-settings > summary').click();
const streakToggle = page.getByLabel('坚持打卡天数');
if (await streakToggle.isChecked()) throw new Error('坚持打卡天数默认应关闭');
await streakToggle.check();
await page.getByRole('button', { name: /生成练习题/ }).click();
await page.getByTestId('worksheet').waitFor();
const initialCount = await page.locator('.worksheet-page .question').count();
if (initialCount !== 20) throw new Error(`默认题数应为 20，实际 ${initialCount}`);
if (!await page.locator('.worksheet-page .student-fields').first().getByText(/坚持打卡.*天/).count()) throw new Error('坚持打卡栏没有显示');
if (await page.locator('.preview-stale').count()) throw new Error('刚生成的预览不应过期');
const seed = (await page.locator('.seed-result code').textContent())?.trim();
if (!seed) throw new Error('没有显示可复现的试卷编号');

await page.getByRole('button', { name: /显示答案页/ }).click();
if (await page.locator('.answer-pages.visible-on-screen .compact-answer-item').count() !== 20) throw new Error('紧凑答案页没有完整显示');
if (await page.locator('.worksheet-page .answer-value').count()) throw new Error('答案污染了练习页');
await page.getByRole('button', { name: /隐藏答案页/ }).click();

const originalQuestions = await page.locator('.worksheet-page .question').allTextContents();
await page.getByRole('button', { name: '复现此卷' }).click();
await page.waitForFunction(expected => document.querySelector('.seed-result code')?.textContent?.trim() === expected, seed);
const replayQuestions = await page.locator('.worksheet-page .question').allTextContents();
if (JSON.stringify(replayQuestions) !== JSON.stringify(originalQuestions)) throw new Error('相同试卷编号没有复现相同题目');

await streakToggle.uncheck();
await page.locator('.preview-stale').waitFor();
await page.getByRole('button', { name: /生成练习题/ }).click();
await page.locator('.preview-stale').waitFor({ state: 'detached' });
if (await page.locator('.worksheet-page .student-fields').first().getByText(/坚持打卡.*天/).count()) throw new Error('新配置没有提交到预览快照');

const customCount = page.getByLabel('自定义题目数量');
await customCount.fill('100');
const start = Date.now();
await page.getByRole('button', { name: /生成练习题/ }).click();
await page.waitForFunction(() => document.querySelectorAll('.worksheet-page .question').length === 100);
const generationMs = Date.now() - start;
if (generationMs > 3000) throw new Error(`生成 100 题耗时过长：${generationMs}ms`);
if (await page.locator('.answer-page .compact-answer-item').count() !== 100) {
  throw new Error('紧凑答案页在生成 100 题后没有保持完整');
}

await page.locator('.builder-details').first().evaluate(element => { element.open = true; });
const strictTypeCount = await page.locator('.knowledge-groups .check').count();
await page.getByRole('button', { name: /跨年级自由组合/ }).click();
const freeTypeCount = await page.locator('.knowledge-groups .check').count();
if (freeTypeCount <= strictTypeCount) throw new Error(`自由组合没有展示更多题型：严格 ${strictTypeCount}，自由 ${freeTypeCount}`);

await page.getByRole('button', { name: '六年级', exact: true }).click();
await page.getByRole('button', { name: /综合复习/ }).click();
await customCount.fill('20');
await page.getByRole('button', { name: /生成练习题/ }).click();
await page.waitForFunction(() => document.querySelectorAll('.worksheet-page .question').length === 20);
if (!await page.locator('.worksheet-page .question.structured').count()) throw new Error('高年级综合卷没有生成结构化图表或图形题');

await page.getByRole('button', { name: '严格按年级', exact: true }).click();
await page.getByRole('button', { name: '按纸张目标', exact: true }).click();
await page.getByRole('button', { name: '目标 1 页', exact: true }).click();
await page.getByRole('button', { name: /生成练习题/ }).click();
await page.getByTestId('worksheet').waitFor();
if (await page.locator('.worksheet-page').count() !== 1) throw new Error('目标 1 页没有生成单页安全题量');

const migrated = await browser.newPage({ viewport: { width: 1200, height: 900 } });
monitor(migrated);
await migrated.addInitScript(() => {
  localStorage.removeItem('math-worksheet-config-v2');
  localStorage.setItem('math-worksheet-config-v1', JSON.stringify({
    stage: 'grade2', rangeMode: 'free', difficulty: 'standard', types: ['addition100', 'subtraction100'], count: 20,
    includeVertical: true, showNumbers: true, showLines: true, answerPage: true, allowDuplicates: false, randomMix: true,
    fields: { name: true, date: true, time: true, score: true }, orientation: 'portrait', fontSize: 'standard'
  }));
});
await migrated.goto(url, { waitUntil: 'networkidle' });
await migrated.waitForFunction(() => JSON.parse(localStorage.getItem('math-worksheet-config-v2') || '{}').version === 2);
await migrated.getByRole('button', { name: /生成练习题/ }).click();
await migrated.waitForFunction(() => document.querySelectorAll('.worksheet-page .question').length === 20);
if (await migrated.locator('.worksheet-page .question.vertical,.worksheet-page .question.long-division').count()) throw new Error('V1 配置迁移错误地混入竖式');
if (!await migrated.evaluate(() => localStorage.getItem('math-worksheet-config-v1'))) throw new Error('迁移时不应删除 V1 配置');
await migrated.close();

const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
monitor(mobile);
await mobile.goto(url, { waitUntil: 'networkidle' });
const mobileMetrics = await mobile.evaluate(() => ({ width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
if (mobileMetrics.width !== mobileMetrics.scrollWidth) throw new Error(`390px 界面横向溢出：${mobileMetrics.scrollWidth}/${mobileMetrics.width}`);
if (!await mobile.locator('.mobile-generate').isVisible()) throw new Error('移动端固定生成入口不可见');
await mobile.close();

const cssText = await page.evaluate(async () => {
  const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
  const linked = await Promise.all(links.map(async link => await (await fetch(link.href)).text()));
  const inline = [...document.querySelectorAll('style')].map(style => style.textContent || '');
  return [...linked, ...inline].join('\n');
});
if (!cssText.includes('@media print') || !/break-inside:\s*avoid/.test(cssText)) throw new Error('打印样式缺失');
if (externalRequests.length) throw new Error(`发现第三方请求：${externalRequests.join(', ')}`);
if (consoleErrors.length || pageErrors.length || failedRequests.length || badResponses.length) {
  throw new Error(`浏览器运行时错误：${JSON.stringify({ consoleErrors, pageErrors, failedRequests, badResponses })}`);
}

console.log(JSON.stringify({ title: await page.title(), initialCount, generatedCount: 100, generationMs, seededReplay: 'ok', compactAnswers: 'ok', grade6StructuredContent: 'ok', pageTarget: 'ok', configMigration: 'ok', mobile390: 'ok', thirdPartyRequests: externalRequests.length, consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, failedRequests: failedRequests.length, badResponses: badResponses.length }));
await page.close();
await browser.close();
