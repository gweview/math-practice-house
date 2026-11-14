/* global console, document, localStorage, getComputedStyle, window, Event, process, URL */
import { chromium } from 'playwright-core';

const url = process.env.APP_URL || 'http://127.0.0.1:8088';
const appOrigin = new URL(url).origin;
const executablePath = process.env.CHROME_PATH || '/home/ubuntu/.local/bin/google-chrome';
const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
const badResponses = [];
const externalRequests = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

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

function expectedBox(orientation) {
  return orientation === 'portrait' ? [594.96, 841.92] : [841.92, 594.96];
}

function config(selections, options = {}) {
  return {
    selections,
    answerPage: options.answerPage ?? true,
    fields: { name: true, date: true, time: true },
    orientation: options.orientation ?? 'auto',
    density: options.density ?? 'comfortable'
  };
}

function unitBlankCounts(values) {
  const grid = [...values].map(Number);
  const rows = Array.from({ length: 9 }, (_, row) =>
    grid.slice(row * 9, row * 9 + 9).filter(value => value === 0).length);
  const columns = Array.from({ length: 9 }, (_, column) =>
    Array.from({ length: 9 }, (_, row) => grid[row * 9 + column])
      .filter(value => value === 0).length);
  const boxes = Array.from({ length: 9 }, (_, box) => {
    const startRow = Math.floor(box / 3) * 3;
    const startColumn = box % 3 * 3;
    return Array.from({ length: 9 }, (_, index) =>
      grid[(startRow + Math.floor(index / 3)) * 9 + startColumn + index % 3])
      .filter(value => value === 0).length;
  });
  return { rows, columns, boxes };
}

const scenarios = [
  {
    name: 'mini-single',
    config: config([{ size: 4, difficulty: 'starter', count: 1 }]),
    expected: [
      ['questions', 'single', 'portrait', 1],
      ['answers', 'single', 'portrait', 1]
    ]
  },
  {
    name: 'mini-six-compact',
    config: config([{ size: 4, difficulty: 'basic', count: 6 }], {
      answerPage: false,
      density: 'compact'
    }),
    expected: [['questions', 'six', 'portrait', 6]]
  },
  {
    name: 'classic-four-auto',
    config: config([{ size: 9, difficulty: 'challenge', count: 4 }]),
    expected: [
      ['questions', 'double', 'landscape', 2],
      ['questions', 'double', 'landscape', 2],
      ['answers', 'quad', 'landscape', 4]
    ]
  },
  {
    name: 'classic-four-forced-portrait',
    config: config([{ size: 9, difficulty: 'advanced', count: 4 }], {
      answerPage: false,
      orientation: 'portrait'
    }),
    expected: [
      ['questions', 'double', 'portrait', 2],
      ['questions', 'double', 'portrait', 2]
    ]
  },
  {
    name: 'classic-two-entry-forced-portrait',
    config: config([{ size: 9, difficulty: 'entry', count: 2 }], {
      answerPage: false,
      orientation: 'portrait'
    }),
    expected: [['questions', 'double', 'portrait', 2]]
  },
  {
    name: 'mixed-three',
    config: config([
      { size: 4, difficulty: 'starter', count: 2 },
      { size: 9, difficulty: 'standard', count: 1 }
    ]),
    expected: [
      ['questions', 'mixed', 'landscape', 3],
      ['answers', 'mixed', 'landscape', 3]
    ]
  },
  {
    name: 'mixed-three-forced-portrait',
    config: config([
      { size: 4, difficulty: 'starter', count: 2 },
      { size: 9, difficulty: 'standard', count: 1 }
    ], {
      orientation: 'portrait'
    }),
    expected: [
      ['questions', 'mixed', 'portrait', 3],
      ['answers', 'mixed', 'portrait', 3]
    ]
  },
  {
    name: 'classic-two-landscape',
    config: config([{ size: 9, difficulty: 'entry', count: 2 }], {
      answerPage: false,
      orientation: 'landscape'
    }),
    expected: [['questions', 'double', 'landscape', 2]]
  }
];

async function installConfig(
  page,
  value,
  key = 'math-worksheet-sudoku-config-v2',
  randomSeed = 0x51d0c0de
) {
  await page.addInitScript(({ storageKey, stored, seed }) => {
    let state = seed >>> 0;
    Math.random = () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
    // Every scenario owns a clean fixture. Clear the other workbooks too so
    // a previous mode cannot leak persisted state into this page.
    for (const storageKey of [
      'math-worksheet-config-v1',
      'math-worksheet-config-v2',
      'math-worksheet-sudoku-config-v1',
      'math-worksheet-sudoku-config-v2',
      'math-worksheet-binary-reasoning-config-v1'
    ]) localStorage.removeItem(storageKey);
    localStorage.setItem(storageKey, JSON.stringify(stored));
  }, { storageKey: key, stored: value, seed: randomSeed });
}

async function enterSudoku(page) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('tablist', { name: '练习模式' })
    .getByRole('tab', { name: /数独/ }).click();
}

async function waitForGenerationOutcome(page, waitForSuccess) {
  const alert = page.getByRole('alert');
  const outcome = await Promise.race([
    waitForSuccess().then(() => ({ kind: 'success' })),
    alert.waitFor({ state: 'visible', timeout: 20_000 }).then(async () => ({
      kind: 'error',
      message: await alert.textContent()
    }))
  ]);
  if (outcome.kind === 'error') throw new Error('生成失败：' + outcome.message);
}

async function generate(page) {
  await page.getByRole('button', { name: /生成数独/ }).click();
  await waitForGenerationOutcome(
    page,
    () => page.getByTestId('sudoku-workbook').waitFor({ state: 'visible', timeout: 20_000 })
  );
}

async function printGeometry(page) {
  await page.evaluate(() => { document.body.dataset.printTarget = 'sudoku'; });
  await page.emulateMedia({ media: 'print' });
  return page.getByTestId('sudoku-sheet').evaluateAll(elements => elements.map(sheet => {
    const sheetRect = sheet.getBoundingClientRect();
    const orientation = sheet.dataset.sheetOrientation;
    const pxToMm = value => value * 25.4 / 96;
    const descendants = [...sheet.querySelectorAll('*')]
      .filter(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      });
    const minimumInsetPx = descendants.reduce((minimum, element) => {
      const rect = element.getBoundingClientRect();
      return Math.min(
        minimum,
        rect.left - sheetRect.left,
        rect.top - sheetRect.top,
        sheetRect.right - rect.right,
        sheetRect.bottom - rect.bottom
      );
    }, Number.POSITIVE_INFINITY);
    const slots = [...sheet.querySelectorAll('.sudoku-slot')].map(slot => {
      const slotRect = slot.getBoundingClientRect();
      const board = slot.querySelector('.sudoku-board');
      const boardRect = board.getBoundingClientRect();
      const cell = board.querySelector('.sudoku-cell');
      const cellRect = cell.getBoundingClientRect();
      const label = slot.querySelector('h3')?.textContent?.trim() || '';
      return {
        size: board.classList.contains('sudoku-board-4') ? 4 : 9,
        difficultyLabel: label,
        metaText: slot.querySelector('.sudoku-meta')?.textContent?.replace(/\s+/g, ' ').trim() || '',
        startHintVisible: [...slot.querySelectorAll('.sudoku-start-hint')].some(hint =>
          getComputedStyle(hint).display !== 'none' &&
          hint.parentElement && getComputedStyle(hint.parentElement).display !== 'none'),
        puzzleNumber: Number(label.match(/题\s*(\d+)/)?.[1]),
        values: [...board.querySelectorAll('.sudoku-cell')]
          .map(item => item.textContent?.trim() || '0').join(''),
        boardMm: pxToMm(boardRect.width),
        cellMm: pxToMm(cellRect.width),
        fontPx: Number.parseFloat(getComputedStyle(cell).fontSize),
        slotWidthMm: pxToMm(slotRect.width),
        slotHeightMm: pxToMm(slotRect.height),
        boardTopMm: pxToMm(boardRect.top - slotRect.top),
        boardBottomInsetMm: pxToMm(slotRect.bottom - boardRect.bottom),
        boardInsideSlot:
          boardRect.left >= slotRect.left - 1 && boardRect.top >= slotRect.top - 1 &&
          boardRect.right <= slotRect.right + 1 && boardRect.bottom <= slotRect.bottom + 1,
        overflow: slot.scrollWidth > slot.clientWidth + 1 || slot.scrollHeight > slot.clientHeight + 1
      };
    });
    return {
      kind: sheet.dataset.sheetKind,
      template: sheet.dataset.sheetTemplate,
      orientation,
      widthMm: pxToMm(sheetRect.width),
      heightMm: pxToMm(sheetRect.height),
      minimumInsetMm: pxToMm(minimumInsetPx),
      overflow: sheet.scrollWidth > sheet.clientWidth + 1 || sheet.scrollHeight > sheet.clientHeight + 1,
      outside: descendants.some(element => {
        const rect = element.getBoundingClientRect();
        return rect.left < sheetRect.left - 1 || rect.top < sheetRect.top - 1 ||
          rect.right > sheetRect.right + 1 || rect.bottom > sheetRect.bottom + 1;
      }),
      footerCount: sheet.querySelectorAll('footer').length,
      headerVisible: getComputedStyle(sheet.querySelector('.sudoku-sheet-header')).display !== 'none',
      fieldsVisible: sheet.dataset.sheetKind === 'questions'
        ? getComputedStyle(sheet.querySelector('.sudoku-student-fields')).display !== 'none'
        : !sheet.querySelector('.sudoku-student-fields'),
      slots
    };
  }));
}

function verifyGeometry(name, sheets, expected) {
  assert(sheets.length === expected.length, `${name}: sheet 数量错误 ${sheets.length}/${expected.length}`);
  for (let index = 0; index < sheets.length; index++) {
    const sheet = sheets[index];
    const [kind, template, orientation, slotCount] = expected[index];
    assert(sheet.kind === kind && sheet.template === template && sheet.orientation === orientation,
      `${name}: 第${index + 1}页模板错误 ${JSON.stringify(sheet)}`);
    assert(sheet.slots.length === slotCount, `${name}: 第${index + 1}页题数错误`);
    if (sheet.template === 'mixed') {
      assert(
        sheet.slots.map(slot => slot.size).join(',') === '9,4,4',
        name + ': 混排页未按主棋盘到辅助棋盘的阅读顺序排列'
      );
    }
    const [expectedWidth, expectedHeight] = orientation === 'portrait' ? [210, 296] : [297, 209];
    assert(Math.abs(sheet.widthMm - expectedWidth) <= .25 && Math.abs(sheet.heightMm - expectedHeight) <= .25,
      `${name}: 第${index + 1}页不是物理A4 ${sheet.widthMm}×${sheet.heightMm}`);
    assert(!sheet.overflow && !sheet.outside, `${name}: 第${index + 1}页发生溢出或越界`);
    assert(sheet.minimumInsetMm >= 9.5, `${name}: 第${index + 1}页安全边距不足 ${sheet.minimumInsetMm}mm`);
    assert(sheet.headerVisible && sheet.fieldsVisible, `${name}: 第${index + 1}页页头或学生字段异常`);
    assert(sheet.footerCount === 0, `${name}: 第${index + 1}页仍包含非必要页尾`);
    for (const slot of sheet.slots) {
      assert(
        slot.boardInsideSlot && !slot.overflow,
        `${name}: 题${slot.puzzleNumber}越出题卡 ${JSON.stringify(slot)}`
      );
      if (sheet.kind === 'questions' && slot.size === 4) {
        assert(slot.cellMm >= 18, `${name}: 4×4题面格宽不足 ${slot.cellMm}mm`);
        assert(slot.fontPx >= 21.2, `${name}: 4×4题面字号不足 ${slot.fontPx}px`);
      }
      if (sheet.kind === 'questions' && slot.size === 9) {
        const hard = /提高|挑战/.test(slot.difficultyLabel);
        assert(slot.cellMm >= (hard ? 13 : 11), `${name}: 9×9题面格宽不足 ${slot.cellMm}mm`);
        assert(slot.fontPx >= 15.9, `${name}: 9×9题面字号不足 ${slot.fontPx}px`);
      }
      if (sheet.kind === 'answers' && slot.size === 9) {
        assert(slot.cellMm >= 8, `${name}: 9×9答案格宽不足 ${slot.cellMm}mm`);
        assert(slot.fontPx >= 13.2, `${name}: 9×9答案字号不足 ${slot.fontPx}px`);
      }
    }
  }
}

async function runScenario(scenario) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  monitor(page);
  await installConfig(page, scenario.config);
  await enterSudoku(page);
  await generate(page);

  const totalPuzzles = scenario.config.selections.reduce((total, selection) => total + selection.count, 0);
  assert(await page.getByTestId('sudoku-puzzle-page').count() === totalPuzzles,
    `${scenario.name}: 题面数量错误`);
  assert(await page.getByTestId('sudoku-answer-page').count() === (scenario.config.answerPage ? totalPuzzles : 0),
    `${scenario.name}: 答案数量错误`);

  const geometry = await printGeometry(page);
  verifyGeometry(scenario.name, geometry, scenario.expected);

  const questionSlots = geometry.filter(sheet => sheet.kind === 'questions').flatMap(sheet => sheet.slots);
  const answerSlots = geometry.filter(sheet => sheet.kind === 'answers').flatMap(sheet => sheet.slots);
  const questionNumbers = questionSlots.map(slot => slot.puzzleNumber);
  const answerNumbers = answerSlots.map(slot => slot.puzzleNumber);
  assert(questionNumbers.join(',') === Array.from({ length: totalPuzzles }, (_, index) => index + 1).join(','),
    `${scenario.name}: 题号不连续 ${questionNumbers}`);
  for (const question of questionSlots.filter(slot => slot.size === 9)) {
    const counts = unitBlankCounts(question.values);
    const allCounts = [...counts.rows, ...counts.columns, ...counts.boxes];
    assert(allCounts.every(count => count > 0),
      `${scenario.name}: 题${question.puzzleNumber}出现完整填满的行、列或宫`);
    const maximum = /入门/.test(question.difficultyLabel) ? 2 :
      /简单/.test(question.difficultyLabel) ? 3 : /标准/.test(question.difficultyLabel) ? 4 : undefined;
    if (maximum !== undefined) {
      assert(Math.max(...allCounts) <= maximum,
        `${scenario.name}: 题${question.puzzleNumber}单一区域空格过多 ${allCounts}`);
      assert(counts.rows.filter(count => count === 1).length >= 2 &&
        counts.columns.filter(count => count === 1).length >= 2 &&
        counts.boxes.filter(count => count === 1).length >= 2,
      `${scenario.name}: 题${question.puzzleNumber}缺少行、列或宫的直接起点`);
      assert(question.metaText.includes('只缺 1 格'),
        `${scenario.name}: 题${question.puzzleNumber}未展示明确起步提示 ${question.metaText}`);
      assert(question.startHintVisible,
        `${scenario.name}: 题${question.puzzleNumber}起步提示存在但不可见`);
    }
  }
  if (scenario.config.answerPage) {
    assert(answerNumbers.join(',') === questionNumbers.join(','), `${scenario.name}: 题答编号不一致`);
    for (const question of questionSlots) {
      const answer = answerSlots.find(slot => slot.puzzleNumber === question.puzzleNumber);
      assert(answer && answer.size === question.size, `${scenario.name}: 题${question.puzzleNumber}答案规格错误`);
      assert(!answer.values.includes('0'), `${scenario.name}: 题${question.puzzleNumber}答案未填完整`);
      assert([...question.values].every((value, cell) => value === '0' || value === answer.values[cell]),
        `${scenario.name}: 题${question.puzzleNumber}的给定数与答案不一致`);
    }
  }

  const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true });
  assert(pdfPageCount(pdf) === scenario.expected.length,
    `${scenario.name}: PDF页数错误 ${pdfPageCount(pdf)}/${scenario.expected.length}`);
  const mediaBoxes = pdfMediaBoxes(pdf);
  assert(mediaBoxes.length === scenario.expected.length, `${scenario.name}: PDF MediaBox 数量异常`);
  for (let index = 0; index < mediaBoxes.length; index++) {
    const expected = expectedBox(scenario.expected[index][2]);
    assert(Math.abs(mediaBoxes[index][0] - expected[0]) <= 1 && Math.abs(mediaBoxes[index][1] - expected[1]) <= 1,
      `${scenario.name}: PDF 第${index + 1}页方向或尺寸错误 ${mediaBoxes[index]}`);
  }

  await page.close();
  return {
    name: scenario.name,
    pages: geometry.length,
    templates: geometry.map(sheet => sheet.template),
    orientation: geometry[0].orientation,
    minimumCellMm: Math.min(...geometry.flatMap(sheet => sheet.slots.map(slot => slot.cellMm)))
  };
}

async function verifyMigrationAndLivePlanning() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  monitor(page);
  await installConfig(page, {
    difficulty: 'challenge',
    count: 2,
    answerPage: false,
    fields: { name: false, date: true, time: false },
    orientation: 'landscape'
  }, 'math-worksheet-sudoku-config-v1');
  await enterSudoku(page);
  await page.waitForFunction(() => Boolean(localStorage.getItem('math-worksheet-sudoku-config-v2')));
  const migrated = await page.evaluate(() => {
    const envelope = JSON.parse(localStorage.getItem('math-worksheet-sudoku-config-v2') || '{}');
    return envelope.value || envelope;
  });
  assert(JSON.stringify(migrated.selections) === JSON.stringify([{ size: 9, difficulty: 'challenge', count: 2 }]),
    `V1迁移题组错误 ${JSON.stringify(migrated)}`);
  assert(migrated.density === 'comfortable' && migrated.orientation === 'landscape' && migrated.answerPage === false,
    `V1迁移布局错误 ${JSON.stringify(migrated)}`);

  await generate(page);
  await page.getByRole('button', { name: '增加入门 9×9数量' }).click();
  await page.getByText(/题组设置已修改/).waitFor();
  assert(await page.getByTestId('sudoku-puzzle-page').count() === 2, '题组修改不应篡改已生成题目');
  await page.getByRole('button', { name: /按当前题组重新生成/ }).click();
  await waitForGenerationOutcome(
    page,
    () => page.waitForFunction(
      () => document.querySelectorAll('[data-testid="sudoku-puzzle-page"]').length === 3,
      undefined,
      { timeout: 20_000 }
    )
  );
  await page.close();

  const fallbackPage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  monitor(fallbackPage);
  await fallbackPage.addInitScript(legacy => {
    localStorage.setItem('math-worksheet-sudoku-config-v2', '{invalid-json');
    localStorage.setItem('math-worksheet-sudoku-config-v1', JSON.stringify(legacy));
  }, {
    difficulty: 'basic',
    count: 2,
    answerPage: false,
    fields: { name: false, date: true, time: false },
    orientation: 'portrait'
  });
  await enterSudoku(fallbackPage);
  await fallbackPage.waitForFunction(() => {
    try {
      const current = JSON.parse(localStorage.getItem('math-worksheet-sudoku-config-v2') || '{}');
      const value = current.value || current;
      return value.selections?.[0]?.size === 4 &&
        value.selections[0].difficulty === 'basic' && value.selections[0].count === 2;
    } catch {
      return false;
    }
  });
  await fallbackPage.close();
  return 'migration-and-snapshot-ok';
}

async function verifyMobilePreview() {
  const results = [];
  for (const width of [320, 390, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    monitor(page);
    await installConfig(page, config([
      { size: 4, difficulty: 'basic', count: 2 },
      { size: 9, difficulty: 'entry', count: 1 }
    ], { answerPage: false }));
    await enterSudoku(page);
    await generate(page);
    const layout = await page.evaluate(() => {
      const sheet = document.querySelector('[data-testid="sudoku-sheet"]');
      const rect = sheet.getBoundingClientRect();
      const boards = [...sheet.querySelectorAll('.sudoku-board')].map(board => {
        const boardRect = board.getBoundingClientRect();
        return { width: boardRect.width, height: boardRect.height };
      });
      return {
        viewport: window.innerWidth,
        bodyWidth: document.documentElement.scrollWidth,
        width: rect.width,
        height: rect.height,
        orientation: sheet.dataset.sheetOrientation,
        overflow: sheet.scrollWidth > sheet.clientWidth + 1 || sheet.scrollHeight > sheet.clientHeight + 1,
        boards
      };
    });
    assert(layout.bodyWidth <= layout.viewport + 1, `${width}px预览出现水平滚动`);
    assert(!layout.overflow, `${width}px预览sheet溢出`);
    const expectedRatio = layout.orientation === 'portrait' ? 210 / 297 : 297 / 210;
    assert(Math.abs(layout.width / layout.height - expectedRatio) <= .02, `${width}px预览纸张比例错误`);
    assert(layout.boards.every(board => Math.abs(board.width - board.height) <= 1 && board.width <= width),
      `${width}px预览棋盘不是正方形或超宽`);
    results.push(width);
    await page.close();
  }
  return results;
}

async function verifyPrintIsolationAndMathRegression() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  monitor(page);
  await installConfig(page, config([{ size: 4, difficulty: 'starter', count: 1 }], { answerPage: false }));
  await enterSudoku(page);
  await generate(page);

  await page.evaluate(() => {
    window.__sudokuTargetAtPrint = null;
    window.print = () => {
      window.__sudokuTargetAtPrint = document.body.dataset.printTarget || null;
      window.dispatchEvent(new Event('afterprint'));
    };
  });
  await page.getByRole('button', { name: /打印数独/ }).click();
  const lifecycle = await page.evaluate(() => ({
    during: window.__sudokuTargetAtPrint,
    after: document.body.dataset.printTarget || null
  }));
  assert(lifecycle.during === 'sudoku' && lifecycle.after === null, `打印生命周期错误 ${JSON.stringify(lifecycle)}`);

  await page.evaluate(() => { document.body.dataset.printTarget = 'sudoku'; });
  await page.emulateMedia({ media: 'print' });
  const sudokuIsolation = await page.evaluate(() => ({
    math: getComputedStyle(document.querySelector('.math-mode-content')).display,
    sudoku: getComputedStyle(document.querySelector('.sudoku-mode-content')).display
  }));
  assert(sudokuIsolation.math === 'none' && sudokuIsolation.sudoku !== 'none', '数独打印未隔离数学内容');

  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => { delete document.body.dataset.printTarget; });
  await page.getByRole('tablist', { name: '练习模式' })
    .getByRole('tab', { name: /数学/ }).click();
  await page.getByRole('button', { name: /生成练习题/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.worksheet-page .question').length === 20);
  await page.evaluate(() => { document.body.dataset.printTarget = 'math'; });
  await page.emulateMedia({ media: 'print' });
  const mathIsolation = await page.evaluate(() => ({
    math: getComputedStyle(document.querySelector('.math-mode-content')).display,
    sudoku: getComputedStyle(document.querySelector('.sudoku-mode-content')).display
  }));
  assert(mathIsolation.math !== 'none' && mathIsolation.sudoku === 'none', '数学打印未隔离数独内容');
  await page.close();
  return 'print-isolation-and-math-ok';
}

try {
  const scenarioResults = [];
  for (const scenario of scenarios) scenarioResults.push(await runScenario(scenario));
  const migration = await verifyMigrationAndLivePlanning();
  const mobile = await verifyMobilePreview();
  const isolation = await verifyPrintIsolationAndMathRegression();
  assert(externalRequests.length === 0, `发现第三方请求：${externalRequests.join(', ')}`);
  assert(consoleErrors.length === 0 && pageErrors.length === 0 && failedRequests.length === 0 && badResponses.length === 0,
    `浏览器运行时错误：${JSON.stringify({ consoleErrors, pageErrors, failedRequests, badResponses })}`);
  console.log(JSON.stringify({
    scenarios: scenarioResults,
    migration,
    mobile,
    isolation,
    thirdPartyRequests: externalRequests.length,
    consoleErrors: consoleErrors.length,
    pageErrors: pageErrors.length,
    failedRequests: failedRequests.length,
    badResponses: badResponses.length
  }));
} finally {
  await browser.close();
}
