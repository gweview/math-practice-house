/* global process, document, localStorage, console, getComputedStyle, URL */
import { chromium } from 'playwright-core';

const url = process.env.APP_URL || 'http://127.0.0.1:8088';
const executablePath = process.env.CHROME_PATH || '/home/ubuntu/.local/bin/google-chrome';
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });

const baseConfig = {
  stage: 'grade2',
  rangeMode: 'free',
  difficulty: 'challenge',
  practiceMode: 'standard',
  verticalOperations: ['addition', 'subtraction'],
  verticalPages: 1,
  count: 100,
  showNumbers: true,
  showLines: true,
  answerPage: true,
  answerMode: 'detailed',
  allowDuplicates: true,
  randomMix: true,
  fields: { name: true, date: true, time: true, score: true, streak: true },
  fontSize: 'large'
};
const scenarios = [
  {
    name: '长横式',
    types: ['numberRecognition', 'comparison', 'addition1000', 'subtraction1000', 'chainAddition', 'chainSubtraction', 'mixedAddSub', 'multiplication', 'division', 'multiDigitMultiplication', 'threeDigitByOneMultiplication', 'twoDigitByTwoMultiplication', 'remainderDivision', 'mixedMulDiv', 'mixedFour', 'fillBlank', 'compareSigns', 'unitConversion', 'fractionComparison']
  },
  { name: '应用题', types: ['wordProblem'] },
  { name: '三年级拓展', stage: 'grade3', types: ['addition1000', 'subtraction1000', 'multiDigitMultiplication', 'threeDigitByOneMultiplication', 'twoDigitByTwoMultiplication', 'remainderDivision', 'unitConversion', 'fractionComparison', 'perimeter', 'wordProblem'] },
  { name: '结构化题型-详解', stage: 'grade6', types: ['numberLine', 'clockReading', 'shapeRecognition', 'dataTableReading', 'barChartReading', 'lineChartReading', 'area', 'average', 'chartAnalysis', 'circle', 'fractionOperation', 'wordProblem'] },
  { name: '结构化题型-紧凑', stage: 'grade6', answerMode: 'compact', types: ['numberLine', 'clockReading', 'shapeRecognition', 'dataTableReading', 'barChartReading', 'lineChartReading', 'area', 'average', 'chartAnalysis', 'circle', 'fractionOperation', 'wordProblem'] },
  { name: '加减法竖式', stage: 'grade2', rangeMode: 'curriculum', practiceMode: 'verticalAddSub', verticalOperations: ['addition', 'subtraction'], verticalPages: 5 },
  { name: '乘除法竖式', stage: 'grade3', rangeMode: 'curriculum', practiceMode: 'verticalMulDiv', verticalOperations: ['multiplication', 'division'], verticalPages: 5 }
];
const mmToPx = value => value / 25.4 * 96;
const appOrigin = new URL(url).origin;
const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const badResponses = [];
const externalRequests = [];

function monitor(page) {
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('requestfailed', request => failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText || 'failed'}`));
  page.on('response', response => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });
  page.on('request', request => {
    const requestUrl = request.url();
    if (!requestUrl.startsWith(appOrigin) && !requestUrl.startsWith('data:') && !requestUrl.startsWith('blob:')) {
      externalRequests.push(requestUrl);
    }
  });
}

function pdfPageCount(pdf) {
  return (pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
}

function pdfMediaBoxes(pdf) {
  return [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)]
    .map(match => [Number(match[1]), Number(match[2])]);
}

function expectedMediaBox(orientation) {
  return orientation === 'portrait' ? [594.96, 841.92] : [841.92, 594.96];
}

async function verifyLayout(orientation, scenario) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  monitor(page);
  const config = { ...baseConfig, ...scenario, orientation };
  delete config.name;
  await page.addInitScript(value => {
    localStorage.removeItem('math-worksheet-config-v1');
    localStorage.removeItem('math-worksheet-config-v2');
    localStorage.setItem('math-worksheet-config-v1', JSON.stringify(value));
  }, config);
  await page.goto(url, { waitUntil: 'networkidle' });
  const desktopMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  if (desktopMetrics.scrollWidth > desktopMetrics.clientWidth + 1 ||
    desktopMetrics.bodyScrollWidth > desktopMetrics.clientWidth + 1) {
    throw new Error(`${scenario.name}/${orientation}：桌面界面横向溢出 ${JSON.stringify(desktopMetrics)}`);
  }
  await page.getByRole('button', { name: /生成(?:练习题| \d+ 道练习)/ }).click();
  await page.getByTestId('worksheet').waitFor();

  const result = await page.locator('.worksheet-page').evaluateAll(sheets => {
    const wrapped = [];
    const overflowed = [];
    const lineCount = element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const bands = [];
      for (const rect of [...range.getClientRects()].filter(item => item.width > 0 && item.height > 0).sort((a, b) => a.top - b.top)) {
        const band = bands.find(item => rect.top < item.bottom - 1 && rect.bottom > item.top + 1);
        if (band) { band.top = Math.min(band.top, rect.top); band.bottom = Math.max(band.bottom, rect.bottom); }
        else bands.push({ top: rect.top, bottom: rect.bottom });
      }
      return bands.length;
    };
    let count = 0;
    for (const sheet of sheets) {
      for (const element of sheet.querySelectorAll('.question')) {
        count++;
        const text = element.querySelector('.q-text');
        if (text && !element.classList.contains('word') && !element.classList.contains('structured') && !element.classList.contains('wide')) {
          if (lineCount(text) > 1) wrapped.push(text.textContent?.trim() || '');
        }
        if (element.scrollWidth > element.clientWidth + 1) overflowed.push(text?.textContent?.trim() || element.textContent?.trim() || '');
      }
    }
    return {
      count,
      wrapped,
      overflowed,
      pageHeights: sheets.map(sheet => sheet.getBoundingClientRect().height),
      pageQuestionCounts: sheets.map(sheet => sheet.querySelectorAll('.question').length),
      verticalOnly: sheets.every(sheet => [...sheet.querySelectorAll('.question')].every(question => question.classList.contains('vertical') || question.classList.contains('long-division'))),
      longDivisionCount: sheets.reduce((total, sheet) => total + sheet.querySelectorAll('.long-division').length, 0)
    };
  });

  const label = scenario.name + '/' + orientation;
  if (result.wrapped.length) throw new Error(label + '：发现非应用题换行，例如：' + result.wrapped.slice(0, 5).join(' | '));
  if (result.overflowed.length) throw new Error(label + '：发现题目横向溢出，例如：' + result.overflowed.slice(0, 5).join(' | '));
  if (config.practiceMode !== 'standard') {
    if (result.pageHeights.length !== config.verticalPages) throw new Error(label + `：预计 ${config.verticalPages} 页，实际 ${result.pageHeights.length} 页`);
    if (result.pageQuestionCounts.some(count => count !== 8)) throw new Error(label + '：竖式页面不是固定 8 题：' + result.pageQuestionCounts.join(','));
    if (!result.verticalOnly) throw new Error(label + '：竖式练习混入了普通横式题');
    if (config.practiceMode === 'verticalMulDiv' && result.longDivisionCount !== config.verticalPages * 4) throw new Error(label + '：长除法题量不正确');
  }
  const physicalHeight = mmToPx(orientation === 'portrait' ? 297 : 210);
  const oversized = result.pageHeights.filter(height => height > physicalHeight + 2);
  if (oversized.length) throw new Error(label + '：有页面超过 A4 高度，最高 ' + Math.max(...oversized).toFixed(1) + 'px');

  await page.emulateMedia({ media: 'print' });
  const printResult = await page.locator('.paper').evaluateAll(sheets => ({
    paperCount: sheets.length,
    exercisePaperCount: sheets.filter(sheet => sheet.classList.contains('worksheet-page')).length,
    answerPaperCount: sheets.filter(sheet => sheet.classList.contains('answer-page')).length,
    compactAnswerNumbers: sheets.filter(sheet => sheet.classList.contains('answer-page'))
      .flatMap(sheet => [...sheet.querySelectorAll('.compact-answer-item b')]
        .map(item => Number(item.textContent?.replace(/\D/g, '')))),
    detailedAnswerNumbers: sheets.filter(sheet => sheet.classList.contains('answer-page'))
      .flatMap(sheet => [...sheet.querySelectorAll('.question')]
        .map(question => Number(question.dataset.questionNumber))),
    heights: sheets.map(sheet => sheet.getBoundingClientRect().height),
    widths: sheets.map(sheet => sheet.getBoundingClientRect().width),
    contentFits: sheets.every(sheet => { const content = sheet.querySelector('.math-sheet-content'); return Boolean(content) && content.scrollHeight <= content.clientHeight + 1 && content.scrollWidth <= content.clientWidth + 1; }),
    contentInside: sheets.every(sheet => { const content = sheet.querySelector('.math-sheet-content'); if (!content) return false; const pageRect = sheet.getBoundingClientRect(), contentRect = content.getBoundingClientRect(); return contentRect.left >= pageRect.left - 1 && contentRect.top >= pageRect.top - 1 && contentRect.right <= pageRect.right + 1 && contentRect.bottom <= pageRect.bottom + 1; }),
    nowrap: [...document.querySelectorAll('.question:not(.word):not(.structured):not(.wide):not(.vertical):not(.long-division) .q-text')]
      .every(text => getComputedStyle(text).whiteSpace === 'nowrap'),
    nowrapCount: document.querySelectorAll('.question:not(.word):not(.structured):not(.wide):not(.vertical):not(.long-division) .q-text').length,
    geometry: sheets.map(sheet => {
      const pageRect = sheet.getBoundingClientRect();
      const content = sheet.querySelector('.math-sheet-content');
      const contentRect = content?.getBoundingClientRect();
      const tolerance = 1;
      const inside = rect => !rect || (rect.left >= pageRect.left - tolerance && rect.top >= pageRect.top - tolerance &&
        rect.right <= pageRect.right + tolerance && rect.bottom <= pageRect.bottom + tolerance);
      const questions = [...sheet.querySelectorAll('.question')];
      const visuals = [...sheet.querySelectorAll('.question-visual, .question-visual svg, .question-visual table')];
      const descendants = [...sheet.querySelectorAll('.question, .question-visual, .question-visual svg, .question-visual table, .question-visual *')];
      const outside = descendants.filter(element => element.getBoundingClientRect().width > 0 && !inside(element.getBoundingClientRect())).length;
      const overflowing = [...questions, ...visuals].filter(element =>
        element.scrollWidth > element.clientWidth + tolerance || element.scrollHeight > element.clientHeight + tolerance).length;
      const overlap = questions.some((left, index) => {
        const a = left.getBoundingClientRect();
        return questions.slice(index + 1).some(right => {
          const b = right.getBoundingClientRect();
          const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          return width > tolerance && height > tolerance;
        });
      });
      return { outside, overflowing, overlap, contentInside: Boolean(contentRect) && inside(contentRect) };
    }),
    atomicSheets: sheets.every(sheet => ['avoid', 'avoid-page'].includes(getComputedStyle(sheet).breakInside)),
    atomicVerticalQuestions: [...document.querySelectorAll('.vertical-worksheet-page .question')].every(question => ['avoid', 'avoid-page'].includes(getComputedStyle(question).breakInside)),
    forcedSheetBreaks: sheets.slice(0, -1).every(sheet => ['page', 'always'].includes(getComputedStyle(sheet).breakAfter)),
    lastSheetBreak: sheets.length === 0 || ['auto', 'avoid'].includes(getComputedStyle(sheets.at(-1)).breakAfter),
    footerCount: document.querySelectorAll('.math-sheet footer').length,
    answersVisible: [...document.querySelectorAll('.answer-page')].every(sheet => getComputedStyle(sheet).display === 'flex')
  }));
  const physicalWidth = mmToPx(orientation === 'portrait' ? 210 : 297);
  const printHeight = mmToPx((orientation === 'portrait' ? 297 : 210) - 1);
  const invalidPrintHeights = printResult.heights.filter(height => Math.abs(height - printHeight) > 2);
  const invalidPrintWidths = printResult.widths.filter(width => Math.abs(width - physicalWidth) > 2);
  if (invalidPrintHeights.length) throw new Error(label + '：打印纸张没有保留 1mm 分页余量：' + invalidPrintHeights.map(value => value.toFixed(1)).join(','));
  if (invalidPrintWidths.length) throw new Error(label + '：打印纸张宽度不是 A4 物理尺寸：' + invalidPrintWidths.map(value => value.toFixed(1)).join(','));
  if (!printResult.nowrap) throw new Error(label + '：纯短表达式打印媒体未保持横式单行');
  if (!printResult.atomicSheets) throw new Error(label + '：打印纸张未禁止内部跨页，竖式题存在被拆分风险');
  if (config.practiceMode !== 'standard' && !printResult.atomicVerticalQuestions) throw new Error(label + '：单道竖式未禁止跨页');
  if (!printResult.contentFits) throw new Error(label + '：安全区内容发生滚动溢出');
  if (!printResult.contentInside) throw new Error(label + '：安全区超出纸张物理边界');
  if (!printResult.forcedSheetBreaks || !printResult.lastSheetBreak) throw new Error(label + '：纸张分页边界不明确');
  if (printResult.footerCount) throw new Error(label + `：打印纸张仍包含 ${printResult.footerCount} 个非必要页尾`);
  if (!printResult.answersVisible) throw new Error(label + '：打印媒体未显示答案页');
  const geometryErrors = printResult.geometry.filter(item => item.outside || item.overflowing || item.overlap || !item.contentInside);
  if (geometryErrors.length) throw new Error(label + '：题卡/图形存在越界、滚动溢出或重叠：' + JSON.stringify(geometryErrors));
  if (printResult.exercisePaperCount !== result.pageHeights.length) throw new Error(label + '：练习页数量发生变化');
  const expectedAnswerNumbers = Array.from({ length: result.count }, (_, index) => index + 1);
  if (config.answerMode === 'detailed') {
    if (!printResult.answerPaperCount) throw new Error(label + '：详解答案页未生成');
    if (printResult.detailedAnswerNumbers.length !== result.count ||
      printResult.detailedAnswerNumbers.join(',') !== expectedAnswerNumbers.join(',')) {
      throw new Error(label + `：详解答案题号/数量不完整 ${printResult.detailedAnswerNumbers.length}/${result.count}`);
    }
  }
  if (config.answerMode === 'compact') {
    if (!printResult.answerPaperCount) throw new Error(label + '：紧凑答案页未生成');
    if (result.count === 100 && printResult.answerPaperCount !== 1) throw new Error(label + `：100题紧凑答案应为单页，实际 ${printResult.answerPaperCount} 页`);
    if (printResult.compactAnswerNumbers.length !== result.count ||
      printResult.compactAnswerNumbers.join(',') !== expectedAnswerNumbers.join(',')) {
      throw new Error(label + `：紧凑答案题号/数量不完整 ${printResult.compactAnswerNumbers.length}/${result.count}`);
    }
  }

  const pdf = await page.pdf({ format: 'A4', landscape: orientation === 'landscape', preferCSSPageSize: true, printBackground: true });
  const pdfPages = pdfPageCount(pdf);
  if (pdfPages !== printResult.paperCount) throw new Error(label + '：检测到额外空白/孤立尾页，预计 ' + printResult.paperCount + ' 张纸，PDF 实际生成 ' + pdfPages + ' 页');
  const mediaBoxes = pdfMediaBoxes(pdf);
  const expectedBox = expectedMediaBox(orientation);
  if (mediaBoxes.length !== pdfPages || mediaBoxes.some(([width, height]) => Math.abs(width - expectedBox[0]) > 1 || Math.abs(height - expectedBox[1]) > 1)) {
    throw new Error(label + '：PDF MediaBox 尺寸/方向错误：' + JSON.stringify(mediaBoxes));
  }
  if (!printResult.paperCount || !await page.locator('.paper').last().locator('.math-sheet-content').evaluate(element => element.textContent?.trim().length > 0)) {
    throw new Error(label + '：存在空白尾页');
  }

  await page.close();
  return { scenario: scenario.name, orientation, checked: result.count, pages: result.pageHeights.length, pdfPages };
}

async function verifySingleSheetPagination(orientation, answerPage) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  monitor(page);
  const config = {
    ...baseConfig,
    stage: 'grade2',
    rangeMode: 'curriculum',
    difficulty: 'entry',
    practiceMode: 'standard',
    types: ['addition100'],
    count: 8,
    orientation,
    answerPage,
    answerMode: answerPage ? 'detailed' : 'none',
    fontSize: 'standard'
  };
  await page.addInitScript(value => {
    localStorage.removeItem('math-worksheet-config-v1');
    localStorage.removeItem('math-worksheet-config-v2');
    localStorage.setItem('math-worksheet-config-v1', JSON.stringify(value));
  }, config);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /生成(?:练习题| \d+ 道练习)/ }).click();
  await page.getByTestId('worksheet').waitFor();
  if (await page.locator('.worksheet-page').count() !== 1) throw new Error(`${orientation} 单页场景被拆成多张逻辑纸`);

  await page.emulateMedia({ media: 'print' });
  const printState = await page.locator('.math-sheet').evaluateAll(sheets => ({
    count: sheets.length,
    footerCount: sheets.reduce((total, sheet) => total + sheet.querySelectorAll('footer').length, 0),
    questionCounts: sheets.map(sheet => sheet.querySelectorAll('.question').length),
    lastBreak: sheets.length === 0 ? 'auto' : getComputedStyle(sheets.at(-1)).breakAfter
  }));
  const expectedPages = answerPage ? 2 : 1;
  if (printState.count !== expectedPages) throw new Error(`${orientation} 单页场景逻辑纸数量错误：${printState.count}/${expectedPages}`);
  if (printState.footerCount) throw new Error(`${orientation} 单页场景仍存在非必要页尾`);
  if (printState.questionCounts.some(count => count !== 8)) throw new Error(`${orientation} 单页题目或答案内容不完整`);
  if (!['auto', 'avoid'].includes(printState.lastBreak)) throw new Error(`${orientation} 最后一张纸仍强制分页`);

  const pdf = await page.pdf({ format: 'A4', landscape: orientation === 'landscape', preferCSSPageSize: true, printBackground: true });
  const pdfPages = pdfPageCount(pdf);
  if (pdfPages !== expectedPages) throw new Error(`${orientation} 单页场景出现空白/孤立尾页：${pdfPages}/${expectedPages}`);
  const expectedBox = expectedMediaBox(orientation);
  const mediaBoxes = pdfMediaBoxes(pdf);
  if (mediaBoxes.length !== expectedPages || mediaBoxes.some(([width, height]) => Math.abs(width - expectedBox[0]) > 1 || Math.abs(height - expectedBox[1]) > 1)) {
    throw new Error(`${orientation} 单页场景 PDF MediaBox 错误：${JSON.stringify(mediaBoxes)}`);
  }
  await page.close();
  return { scenario: '单页无孤立尾页', orientation, answerPage, pdfPages };
}

async function verifyMobile(width, scenario = scenarios[0]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  monitor(page);
  const config = { ...baseConfig, ...scenario, orientation: 'portrait' };
  delete config.name;
  await page.addInitScript(value => {
    localStorage.removeItem('math-worksheet-config-v1');
    localStorage.removeItem('math-worksheet-config-v2');
    localStorage.setItem('math-worksheet-config-v1', JSON.stringify(value));
  }, config);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /生成(?:练习题| \d+ 道练习)/ }).click();
  await page.getByTestId('worksheet').waitFor();
  const result = await page.locator('.worksheet-page .question:not(.word)').evaluateAll(elements => {
    const wrapped = [];
    const overflowed = [];
    const lineCount = element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      const bands = [];
      for (const rect of [...range.getClientRects()].filter(item => item.width > 0 && item.height > 0).sort((a, b) => a.top - b.top)) {
        const band = bands.find(item => rect.top < item.bottom - 1 && rect.bottom > item.top + 1);
        if (band) { band.top = Math.min(band.top, rect.top); band.bottom = Math.max(band.bottom, rect.bottom); }
        else bands.push({ top: rect.top, bottom: rect.bottom });
      }
      return bands.length;
    };
    for (const element of elements) {
      const text = element.querySelector('.q-text');
      if (element.scrollWidth > element.clientWidth + 1) overflowed.push(text?.textContent?.trim() || element.textContent?.trim() || '竖式题');
      if (!text) continue;
      if (lineCount(text) > 1) wrapped.push(text.textContent?.trim() || '');
    }
    return { count: elements.length, wrapped, overflowed };
  });
  const sheetMetrics = await page.locator('.worksheet-page').evaluateAll(sheets => sheets.map(sheet => {
    const rect = sheet.getBoundingClientRect();
    const content = sheet.querySelector('.math-sheet-content');
    const verticalGrid = sheet.querySelector('.questions.math-sheet-grid');
    return {
      ratio: rect.width / rect.height,
      contentFits: Boolean(content) && content.scrollHeight <= content.clientHeight + 1 && content.scrollWidth <= content.clientWidth + 1,
      verticalColumns: verticalGrid ? getComputedStyle(verticalGrid).gridTemplateColumns.split(' ').filter(Boolean).length : null
    };
  }));
  const documentMetrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth
  }));
  if (documentMetrics.scrollWidth > documentMetrics.clientWidth + 1 ||
    documentMetrics.bodyScrollWidth > documentMetrics.clientWidth + 1) {
    throw new Error(`${width}px：页面出现横向溢出 ${JSON.stringify(documentMetrics)}`);
  }
  const portraitRatio = 210 / 297;
  const invalidRatios = sheetMetrics.filter(metric => Math.abs(metric.ratio - portraitRatio) > 0.01);
  if (invalidRatios.length) throw new Error(`${width}px：预览纸张比例不是 A4`);
  if (sheetMetrics.some(metric => !metric.contentFits)) throw new Error(`${width}px：预览安全区发生内容溢出`);
  if (config.practiceMode !== 'standard' && sheetMetrics.some(metric => metric.verticalColumns !== 2)) {
    throw new Error(`${width}px：竖式纸张结构发生响应式重排`);
  }
  if (result.wrapped.length) throw new Error(width + 'px：发现横式换行，例如：' + result.wrapped.slice(0, 5).join(' | '));
  if (result.overflowed.length) throw new Error(width + 'px：发现横式溢出，例如：' + result.overflowed.slice(0, 5).join(' | '));
  await page.close();
  if (config.practiceMode !== 'standard' && result.count !== config.verticalPages * 8) throw new Error(`${width}px：竖式题量不正确，实际 ${result.count}`);
  return { scenario: config.practiceMode === 'standard' ? '窄屏横式' : `窄屏${scenario.name}`, width, checked: result.count };
}

async function verifyFillBlankBoxes() {
  const results = [];
  for (const difficulty of ['entry', 'challenge']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    monitor(page);
    const config = {
      ...baseConfig, stage: 'grade3', rangeMode: 'curriculum', difficulty,
      practiceMode: 'standard', types: ['fillBlank'], orientation: 'portrait'
    };
    await page.addInitScript(value => {
      localStorage.removeItem('math-worksheet-config-v1');
      localStorage.removeItem('math-worksheet-config-v2');
      localStorage.setItem('math-worksheet-config-v1', JSON.stringify(value));
    }, config);
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /生成(?:练习题| \d+ 道练习)/ }).click();
    await page.getByTestId('worksheet').waitFor();
    const result = await page.locator('.worksheet-page .question').evaluateAll(elements => {
      const boxes = elements.flatMap(element => [...element.querySelectorAll('.fill-box')]);
      const resultQuestions = elements.filter(element => !element.querySelector('.fill-box') && element.querySelector('.q-text')?.textContent?.trim().endsWith('='));
      return {
        count: elements.length,
        boxCount: boxes.length,
        minBoxWidth: boxes.length ? Math.min(...boxes.map(box => box.getBoundingClientRect().width)) : 0,
        minBoxHeight: boxes.length ? Math.min(...boxes.map(box => box.getBoundingClientRect().height)) : 0,
        resultCount: resultQuestions.length,
        resultLines: resultQuestions.filter(element => element.querySelector('.answer-line')).length,
        rawGlyphs: elements.filter(element => element.textContent?.includes('□')).length,
        overflowed: elements.filter(element => element.scrollWidth > element.clientWidth + 1).length
      };
    });
    if (difficulty === 'challenge') {
      if (result.boxCount !== 100) throw new Error(`逆向填空应有 100 个书写框，实际 ${result.boxCount}`);
      if (result.minBoxWidth < 59 || result.minBoxHeight < 33) throw new Error(`逆向填空书写框过小：${result.minBoxWidth.toFixed(1)}×${result.minBoxHeight.toFixed(1)}px`);
      const answeredBoxes = await page.locator('.answer-page .fill-box').evaluateAll(boxes => boxes.filter(box => box.textContent?.trim()).length);
      if (answeredBoxes !== 100) throw new Error('答案页没有把答案写入对应方框');
    } else if (result.resultCount !== 100 || result.resultLines !== 100 || result.boxCount !== 0) {
      throw new Error(`结果题应直接作答：结果题 ${result.resultCount}、横线 ${result.resultLines}、方框 ${result.boxCount}`);
    }
    if (result.rawGlyphs || result.overflowed) throw new Error(`逆向填空渲染异常：原始方框字符 ${result.rawGlyphs}、溢出 ${result.overflowed}`);
    results.push({ scenario: `逆向填空-${difficulty}`, checked: result.count, boxes: result.boxCount, resultLines: result.resultLines });
    await page.close();
  }
  return results;
}

async function verifyCurriculumTypeVisibility() {
  const page = await browser.newPage({ viewport: { width: 360, height: 900 } });
  monitor(page);
  await page.addInitScript(() => { localStorage.removeItem('math-worksheet-config-v1'); localStorage.removeItem('math-worksheet-config-v2'); });
  await page.goto(url, { waitUntil: 'networkidle' });
  const strictCount = await page.locator('.type-grid .check').count();
  const disabledCount = await page.locator('.type-grid .check.disabled').count();
  if (disabledCount) throw new Error(`严格按年级时仍展示了 ${disabledCount} 个不可选的超纲题型`);
  await page.getByRole('button', { name: /自由组合/ }).click();
  const freeCount = await page.locator('.type-grid .check').count();
  if (freeCount <= strictCount) throw new Error(`自由组合没有展示更多题型：严格 ${strictCount}，自由 ${freeCount}`);
  await page.close();
  return { scenario: '严格年级题型可见性', strictCount, freeCount, disabledCount };
}

async function verifyVerticalControls() {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  monitor(page);
  await page.addInitScript(() => { localStorage.removeItem('math-worksheet-config-v1'); localStorage.removeItem('math-worksheet-config-v2'); });
  await page.goto(url, { waitUntil: 'networkidle' });
  const addSubMode = page.getByRole('button', { name: /加减法竖式/ });
  // The compact V2 card title is “乘除竖式”, while its descriptive text uses
  // “乘除法竖式”. Match both so this guard tests the control rather than a
  // presentation-only wording change.
  const mulDivMode = page.getByRole('button', { name: /乘除(?:法)?竖式/ });
  if (await addSubMode.isDisabled()) throw new Error('一年级加减法竖式入口不应禁用');
  if (!await mulDivMode.isDisabled()) throw new Error('严格按一年级时乘除法竖式入口应禁用');
  await addSubMode.click();
  await page.getByRole('button', { name: '2 页', exact: true }).click();
  await page.getByRole('button', { name: /生成(?:练习题| \d+ 道练习)/ }).click();
  await page.getByTestId('worksheet').waitFor();
  const addSubCounts = await page.locator('.worksheet-page').evaluateAll(sheets => sheets.map(sheet => sheet.querySelectorAll('.question.vertical').length));
  if (addSubCounts.length !== 2 || addSubCounts.some(count => count !== 8)) throw new Error('界面生成的加减法竖式没有保持每页 8 题');

  await page.getByRole('button', { name: '三年级', exact: true }).click();
  if (await mulDivMode.isDisabled()) throw new Error('三年级乘除法竖式入口应开放');
  await mulDivMode.click();
  await page.getByRole('button', { name: '1 页', exact: true }).click();
  await page.getByRole('button', { name: /生成(?:练习题| \d+ 道练习)/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.worksheet-page').length === 1 && document.querySelectorAll('.worksheet-page .long-division').length === 4);
  const result = await page.locator('.worksheet-page').first().evaluate(sheet => ({
    total: sheet.querySelectorAll('.question').length,
    vertical: sheet.querySelectorAll('.question.vertical').length,
    longDivision: sheet.querySelectorAll('.question.long-division').length
  }));
  if (result.total !== 8 || result.vertical !== 4 || result.longDivision !== 4) throw new Error('界面生成的乘除法竖式配比不正确');
  await page.getByRole('button', { name: /自由组合/ }).click();
  await page.getByRole('button', { name: '二年级', exact: true }).click();
  await page.getByRole('button', { name: '严格按年级', exact: true }).click();
  if (await addSubMode.getAttribute('aria-pressed') !== 'true') throw new Error('切回低年级严格模式时没有自动迁移到加减法竖式');
  if (await page.locator('.vertical-operation-grid input:checked').count() !== 2) throw new Error('自动迁移竖式模式时遗留了不兼容的运算选项');
  if (await page.getByText('包含竖式题', { exact: true }).count()) throw new Error('旧的随机竖式开关仍然存在');
  await page.close();
  return { scenario: '竖式配置界面', addSubPages: addSubCounts.length, mulDivQuestions: result.total, longDivision: result.longDivision };
}

const results = [];
try {
  results.push(await verifyCurriculumTypeVisibility());
  results.push(await verifyVerticalControls());
  results.push(...await verifyFillBlankBoxes());
  results.push(await verifySingleSheetPagination('portrait', false));
  results.push(await verifySingleSheetPagination('landscape', true));
  for (const width of [360, 390, 768]) results.push(await verifyMobile(width));
  results.push(await verifyMobile(320, scenarios[6]));
  for (const scenario of scenarios) {
    for (const orientation of ['portrait', 'landscape']) results.push(await verifyLayout(orientation, scenario));
  }
  const matrixTypes = ['addition100', 'wordProblem', 'numberLine', 'dataTableReading'];
  for (const fontSize of ['standard', 'large']) {
    for (const orientation of ['portrait', 'landscape']) {
      for (const answerMode of ['none', 'compact', 'detailed']) {
        results.push(await verifyLayout(orientation, {
          name: `三模式矩阵-${orientation}-${fontSize}-${answerMode}`,
          stage: 'grade6',
          rangeMode: 'free',
          types: matrixTypes,
          count: 12,
          fontSize,
          answerMode,
          answerPage: answerMode !== 'none'
        }));
      }
    }
  }
  if (consoleErrors.length || pageErrors.length || failedRequests.length || badResponses.length || externalRequests.length) {
    throw new Error('数学布局浏览器监控失败：' + JSON.stringify({ consoleErrors, pageErrors, failedRequests, badResponses, externalRequests }));
  }
  console.log(JSON.stringify({ results, wrapped: 0, overflowed: 0, oversizedPages: 0, browserMonitor: {
    consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, failedRequests: failedRequests.length,
    badResponses: badResponses.length, externalRequests: externalRequests.length
  } }));
} finally {
  await browser.close();
}
