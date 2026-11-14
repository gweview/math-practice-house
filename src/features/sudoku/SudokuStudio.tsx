import { useMemo, useState, type CSSProperties } from 'react';
import {
  createSudokuConfigStorage,
  DEFAULT_SUDOKU_CONFIG,
  getSudokuDifficultyProfile,
  getSudokuDifficultyProfiles,
  MAX_SUDOKU_TOTAL_COUNT,
} from './difficulty';
import { generateSudokuSet } from './generator';
import { planSudokuSheets, type SudokuSheet, type SudokuSheetSlot } from './layout';
import type {
  SudokuConfig,
  SudokuDifficulty,
  SudokuGrid,
  SudokuPuzzle,
  SudokuSelection,
  SudokuSize
} from './types';
import './sudoku.css';
import { useWorksheetSession } from '../../shared/session/useWorksheetSession';
import PreviewStatus from '../../shared/ui/PreviewStatus';
import PrintGuide from '../../shared/ui/PrintGuide';
import StickyActionBar from '../../shared/ui/StickyActionBar';

const MAX_PROFILE_COUNT = MAX_SUDOKU_TOTAL_COUNT;
const MAX_TOTAL_COUNT = MAX_SUDOKU_TOTAL_COUNT;

function cloneDefaultConfig(): SudokuConfig {
  return {
    ...DEFAULT_SUDOKU_CONFIG,
    selections: DEFAULT_SUDOKU_CONFIG.selections.map(selection => ({ ...selection })),
    fields: { ...DEFAULT_SUDOKU_CONFIG.fields }
  };
}

function selectionKey(selection: Pick<SudokuSelection, 'size' | 'difficulty'>): string {
  return `${selection.size}-${selection.difficulty}`;
}

function selectionSignature(selections: readonly SudokuSelection[]): string {
  return selections
    .map(selection => `${selectionKey(selection)}:${selection.count}`)
    .sort()
    .join('|');
}

function selectionCount(config: SudokuConfig, size: SudokuSize, difficulty: SudokuDifficulty): number {
  return config.selections.find(selection => selection.size === size && selection.difficulty === difficulty)?.count ?? 0;
}

function totalSelectionCount(config: SudokuConfig): number {
  return config.selections.reduce((total, selection) => total + selection.count, 0);
}

type SudokuResult = { puzzles: SudokuPuzzle[]; config: SudokuConfig };
const SUDOKU_STORAGE = createSudokuConfigStorage();
const sudokuSessionOptions = {
  load: SUDOKU_STORAGE.load,
  save: (config: SudokuConfig) => { SUDOKU_STORAGE.save(config); },
  defaults: cloneDefaultConfig,
  generate: (config: SudokuConfig): SudokuResult => {
    const snapshot = structuredClone(config);
    return { puzzles: generateSudokuSet(snapshot), config: snapshot };
  },
  resultConfig: (result: SudokuResult) => result.config,
  equivalent: (draft: SudokuConfig, rendered: SudokuConfig) => selectionSignature(draft.selections) === selectionSignature(rendered.selections)
};

function StudentField({ show, label }: { show: boolean; label: string }) {
  return show ? <span>{label}：<b aria-hidden="true" /></span> : null;
}

interface BoardStyle extends CSSProperties {
  '--sudoku-board-size': string;
  '--sudoku-board-preview-size': string;
}

function SudokuBoard({
  puzzle,
  solution,
  size,
  answer,
  boardSizeMm,
  sheetOrientation
}: {
  puzzle: SudokuGrid;
  solution: SudokuGrid;
  size: SudokuSize;
  answer?: boolean;
  boardSizeMm: number;
  sheetOrientation: SudokuSheet['orientation'];
}) {
  const values = answer ? solution : puzzle;
  const sheetWidthMm = sheetOrientation === 'portrait' ? 210 : 297;
  const boardStyle: BoardStyle = {
    '--sudoku-board-size': `${boardSizeMm}mm`,
    '--sudoku-board-preview-size': `${(boardSizeMm / sheetWidthMm) * 100}cqw`
  };

  return <div
    className={`sudoku-board sudoku-board-${size}`}
    role="grid"
    aria-label={`${size}×${size} ${answer ? '数独答案棋盘' : '数独题目棋盘'}`}
    style={boardStyle}
  >
    {values.map((value, cell) => {
      const row = Math.floor(cell / size);
      const column = cell % size;
      const given = puzzle[cell] !== 0;
      return <span
        className={`sudoku-cell${given ? ' given' : answer ? ' solved' : ' blank'}`}
        data-row={row + 1}
        data-col={column + 1}
        role="gridcell"
        aria-label={`第 ${row + 1} 行第 ${column + 1} 列${value ? `，数字 ${value}${answer ? given ? '，题目给定' : '，答案补全' : ''}` : '，空格'}`}
        key={cell}
      >{value || ''}</span>;
    })}
  </div>;
}

function SudokuSlotCard({ slot, sheet, answer }: {
  slot: SudokuSheetSlot;
  sheet: SudokuSheet;
  answer: boolean;
}) {
  const profile = getSudokuDifficultyProfile(slot.size, slot.puzzle.difficulty);
  const label = profile?.label ?? `${slot.size}×${slot.size}`;
  const titleId = `${sheet.id}-puzzle-${slot.puzzleNumber}`;
  const childFriendly = slot.size === 9 && (
    slot.puzzle.difficulty === 'entry' ||
    slot.puzzle.difficulty === 'easy' ||
    slot.puzzle.difficulty === 'standard'
  );
  const startingRow = childFriendly
    ? Array.from({ length: 9 }, (_, row) => row)
      .find(row => slot.puzzle.puzzle.slice(row * 9, row * 9 + 9).filter(value => value === 0).length === 1)
    : undefined;

  return <article
    className={`sudoku-slot sudoku-slot--${slot.size} sudoku-slot--${slot.area} ${answer ? 'sudoku-answer-page' : 'sudoku-puzzle-page'}`}
    data-testid={answer ? 'sudoku-answer-page' : 'sudoku-puzzle-page'}
    aria-labelledby={titleId}
  >
    <h3 id={titleId}>
      题 {slot.puzzleNumber} · {label}
      {childFriendly && !answer && startingRow !== undefined &&
        <span className="sudoku-title-start sudoku-start-hint"> · 起步：第 {startingRow + 1} 行只缺 1 格</span>}
    </h3>
    <SudokuBoard
      puzzle={slot.puzzle.puzzle}
      solution={slot.puzzle.solution}
      size={slot.size}
      answer={answer}
      boardSizeMm={slot.boardSizeMm}
      sheetOrientation={sheet.orientation}
    />
    <div className={`sudoku-meta ${childFriendly ? 'sudoku-meta--child-friendly' : ''}`} aria-label="题目信息">
      <span className="sudoku-meta-clues">提示数：{slot.puzzle.metrics.clueCount}</span>
      {childFriendly && !answer && startingRow !== undefined &&
        <span className="sudoku-meta-start sudoku-start-hint">起步：第 {startingRow + 1} 行只缺 1 格</span>}
      <span className="sudoku-meta-unique">唯一解 ✓</span>
    </div>
  </article>;
}

function SudokuSheetPage({
  sheet,
  pageNumber,
  pageTotal,
  config,
  showAnswers,
  isLast
}: {
  sheet: SudokuSheet;
  pageNumber: number;
  pageTotal: number;
  config: SudokuConfig;
  showAnswers: boolean;
  isLast: boolean;
}) {
  const answer = sheet.kind === 'answers';
  const mixedClass = sheet.template === 'mixed' ? ' sudoku-mixed-layout' : '';
  const answerVisibilityClass = answer
    ? ` sudoku-answer-pages${showAnswers ? ' visible-on-screen' : ''}`
    : '';

  return <section
    className={`sudoku-sheet sudoku-paper sudoku-print-group sudoku-sheet--${sheet.orientation} sudoku-sheet--${sheet.kind} sudoku-template-${sheet.template}${mixedClass}${answerVisibilityClass}${isLast ? ' sudoku-last-sheet' : ''}`}
    data-testid="sudoku-sheet"
    data-sheet-kind={sheet.kind}
    data-sheet-orientation={sheet.orientation}
    data-sheet-template={sheet.template}
  >
    <header className="sudoku-sheet-header">
      <div>
        <p>{answer ? 'REFERENCE ANSWERS' : 'SUDOKU PRACTICE'}</p>
        <h2>{answer ? '数独参考答案' : '数独练习'}</h2>
      </div>
      <strong>{answer ? '答案' : '练习'} {pageNumber} / {pageTotal}</strong>
    </header>
    {!answer && (config.fields.name || config.fields.date || config.fields.time) && <div className="sudoku-student-fields">
      <StudentField show={config.fields.name} label="姓名" />
      <StudentField show={config.fields.date} label="日期" />
      <StudentField show={config.fields.time} label="用时" />
    </div>}
    <div className={`sudoku-sheet-grid sudoku-sheet-grid--${sheet.template}`}>
      {sheet.slots.map(slot => <SudokuSlotCard
        slot={slot}
        sheet={sheet}
        answer={answer}
        key={`${sheet.kind}-${slot.puzzle.id}-${slot.puzzleNumber}`}
      />)}
    </div>
  </section>;
}

function SelectionGroup({
  size,
  config,
  total,
  onChange
}: {
  size: SudokuSize;
  config: SudokuConfig;
  total: number;
  onChange: (size: SudokuSize, difficulty: SudokuDifficulty, count: number) => void;
}) {
  const profiles = getSudokuDifficultyProfiles(size);
  return <div className="sudoku-profile-group">
    <h3><span aria-hidden="true">{size === 4 ? '🌱' : '🧠'}</span>{size}×{size} · {size === 4 ? '宫格启蒙' : '经典数独'}</h3>
    <div className="sudoku-profile-list">
      {profiles.map(profile => {
        const count = selectionCount(config, size, profile.difficulty);
        return <div className={`sudoku-profile-option${count ? ' selected' : ''}`} key={selectionKey(profile)}>
          <div className="sudoku-profile-copy">
            <strong>{profile.label}</strong>
            <span>{profile.description}</span>
          </div>
          <div className="sudoku-counter" role="group" aria-label={`${profile.label}题目数量`}>
            <button
              type="button"
              aria-label={`减少${profile.label}数量`}
              disabled={count === 0 || total === 1}
              onClick={() => onChange(size, profile.difficulty, count - 1)}
            >−</button>
            <output aria-label={`${profile.label}数量`}>{count}</output>
            <button
              type="button"
              aria-label={`增加${profile.label}数量`}
              disabled={count >= MAX_PROFILE_COUNT || total >= MAX_TOTAL_COUNT}
              onClick={() => onChange(size, profile.difficulty, count + 1)}
            >＋</button>
          </div>
        </div>;
      })}
    </div>
  </div>;
}

interface SudokuStudioProps {
  active: boolean;
  onPrint: () => void;
}

export default function SudokuStudio({ active, onPrint }: SudokuStudioProps) {
  const session = useWorksheetSession(sudokuSessionOptions);
  const { config, setConfig, result, renderedConfig: generatedConfig, previewIsStale, showAnswers, setShowAnswers, error, setError, create, reset: resetSession } = session;
  const [generating, setGenerating] = useState(false);

  const update = <K extends keyof SudokuConfig>(key: K, value: SudokuConfig[K]) => {
    setConfig(current => ({ ...current, [key]: value }));
  };

  const total = totalSelectionCount(config);
  const setProfileCount = (size: SudokuSize, difficulty: SudokuDifficulty, requestedCount: number) => {
    setConfig(current => {
      const currentCount = selectionCount(current, size, difficulty);
      const otherCount = totalSelectionCount(current) - currentCount;
      const nextCount = Math.max(0, Math.min(MAX_PROFILE_COUNT, requestedCount, MAX_TOTAL_COUNT - otherCount));
      if (nextCount === 0 && otherCount === 0) return current;

      const nextByKey = new Map(current.selections.map(selection => [selectionKey(selection), selection]));
      const key = selectionKey({ size, difficulty });
      if (nextCount === 0) nextByKey.delete(key);
      else nextByKey.set(key, { size, difficulty, count: nextCount });

      const selections = ([4, 9] as const).flatMap(profileSize =>
        getSudokuDifficultyProfiles(profileSize)
          .map(profile => nextByKey.get(selectionKey(profile)))
          .filter((selection): selection is SudokuSelection => Boolean(selection))
      );
      return { ...current, selections };
    });
    setError('');
  };

  const generate = () => {
    if (generating) return;
    if (total < 1 || total > MAX_TOTAL_COUNT) {
      setError(`请选择 1～${MAX_TOTAL_COUNT} 盘数独。`);
      return;
    }
    setGenerating(true);
    window.setTimeout(() => {
      try {
        const snapshot = structuredClone(config);
        if (create(snapshot)) window.setTimeout(() => {
          const title = document.querySelector<HTMLElement>('.sudoku-preview-title');
          title?.scrollIntoView({ behavior: 'smooth' });
          title?.focus({ preventScroll: true });
        }, 20);
      } finally {
        setGenerating(false);
      }
    }, 0);
  };

  const reset = () => {
    resetSession();
  };

  // Difficulty and counts describe generated content, so they stay frozen in result.config.
  // Page/print controls intentionally remain live and re-plan the same generated puzzles.
  const renderedConfig = useMemo<SudokuConfig>(() => result ? {
    ...(generatedConfig ?? config),
    orientation: config.orientation,
    density: config.density,
    answerPage: config.answerPage,
    fields: { ...config.fields }
  } : config, [config, generatedConfig, result]);
  const sheets = useMemo(
    () => result ? planSudokuSheets(result.puzzles, renderedConfig) : [],
    [renderedConfig, result]
  );
  const questionSheets = sheets.filter(sheet => sheet.kind === 'questions');
  const answerSheets = sheets.filter(sheet => sheet.kind === 'answers');
  const selectionChanged = result !== null && previewIsStale;

  return <div id="sudoku-panel" role="tabpanel" aria-labelledby="sudoku-tab" className={`sudoku-mode-content sudoku-${config.orientation} sudoku-density-${config.density}${active ? '' : ' mode-hidden'}`} aria-hidden={!active}>
    <section className="sudoku-config-panel sudoku-no-print" aria-labelledby="sudoku-config-title">
      <div className="section-heading"><span aria-hidden="true">▦</span><div><h2 id="sudoku-config-title">数独练习设置</h2><p>4×4 与 9×9 可以混合选题；每盘均经过唯一解验证。</p></div></div>
      <div className="sudoku-config-grid">
        <fieldset className="sudoku-selection-fieldset"><legend>① 规格、难度与数量</legend>
          <div className="sudoku-selection-summary"><strong>已选 {total} / {MAX_TOTAL_COUNT} 盘</strong><span>每档 0～{MAX_PROFILE_COUNT} 盘</span></div>
          <div className="sudoku-profile-groups">
            <SelectionGroup size={4} config={config} total={total} onChange={setProfileCount} />
            <SelectionGroup size={9} config={config} total={total} onChange={setProfileCount} />
          </div>
          <p className="hint">题组设置在点击“生成”后生效；题目按纸面阅读顺序连续编号，答案保持相同题号。</p>
        </fieldset>
        <fieldset><legend>② 页面排版</legend>
          <div className="sudoku-setting-block"><span>页面方向</span><div className="choice-row">{([
            ['auto', '自动方向'], ['portrait', 'A4 纵向'], ['landscape', 'A4 横向']
          ] as const).map(([orientation, label]) => <button type="button" aria-pressed={config.orientation === orientation} className={config.orientation === orientation ? 'selected' : ''} onClick={() => update('orientation', orientation)} key={orientation}>{label}</button>)}</div></div>
          <div className="sudoku-setting-block"><span>页面密度</span><div className="choice-row">{([
            ['comfortable', '舒适排版'], ['compact', '紧凑排版']
          ] as const).map(([density, label]) => <button type="button" aria-pressed={config.density === density} className={config.density === density ? 'selected' : ''} onClick={() => update('density', density)} key={density}>{label}</button>)}</div></div>
          <p className="hint">自动方向优先保证书写尺寸；9×9 练习每页最多 2 盘，紧凑模式主要增加 4×4 容量。</p>
        </fieldset>
        <fieldset><legend>③ 打印内容</legend>
          <div className="sudoku-settings-grid">
            <label className="switch"><input type="checkbox" checked={config.answerPage} onChange={event => update('answerPage', event.target.checked)} /><span>生成答案页</span></label>
            {Object.entries({ name: '姓名栏', date: '日期栏', time: '用时栏' }).map(([key, label]) => <label className="switch" key={key}><input type="checkbox" checked={config.fields[key as keyof SudokuConfig['fields']]} onChange={event => update('fields', { ...config.fields, [key]: event.target.checked })} /><span>{label}</span></label>)}
          </div>
          <p className="hint">方向、密度、答案页和学生字段会即时重新规划当前预览，不会改变已经生成的题目。</p>
        </fieldset>
      </div>
      {error && <p role="alert" className="error">⚠ {error}</p>}
      <div className="actions"><button type="button" className="primary desktop-generate" onClick={generate} disabled={generating}>{generating ? '⏳ 正在生成…' : '✨ 生成数独'}</button><button type="button" onClick={reset} disabled={generating}>↺ 恢复默认设置</button></div>
      <PrintGuide />
      <StickyActionBar className="sudoku-sticky-actions" label="数独生成操作"><button type="button" className="primary" onClick={generate} disabled={generating}>{generating ? '⏳ 正在生成…' : '✨ 生成数独'}</button></StickyActionBar>
    </section>

    <section className="sudoku-preview" aria-labelledby="sudoku-preview-title">
      <div className="preview-bar sudoku-no-print"><div><p className="eyebrow">A4 SUDOKU PREVIEW</p><h2 className="sudoku-preview-title" id="sudoku-preview-title" tabIndex={-1}>数独打印预览</h2>{result && <PreviewStatus summary={`${questionSheets.length} 张练习纸${answerSheets.length ? ` + ${answerSheets.length} 张答案纸` : ''} · A4 ${renderedConfig.orientation === 'portrait' ? '纵向' : '横向'}`} stale={selectionChanged} staleMessage={`题组设置已修改；当前仍预览上次生成的 ${result.puzzles.length} 盘题。点击“按当前题组重新生成”后更新题目。`} />}</div>{result && <div className="actions small"><button type="button" onClick={generate} disabled={generating}>🎲 按当前题组重新生成</button>{renderedConfig.answerPage && <button type="button" aria-pressed={showAnswers} onClick={() => setShowAnswers(value => !value)}>{showAnswers ? '🙈 隐藏答案页' : '💡 显示答案页'}</button>}<button type="button" className="primary" onClick={onPrint}>🖨️ 打印数独</button></div>}</div>
      {!result ? <div className="sudoku-empty"><span aria-hidden="true">🧩</span><h3>还没有数独题</h3><p>选择规格、难度和数量，然后点击“生成数独”。</p></div> : <div className={`sudoku-paper-stack sudoku-count-${result.puzzles.length}`} data-testid="sudoku-workbook">
        {sheets.map((sheet, index) => {
          const pagesOfKind = sheet.kind === 'questions' ? questionSheets : answerSheets;
          return <SudokuSheetPage
            sheet={sheet}
            pageNumber={pagesOfKind.findIndex(candidate => candidate.id === sheet.id) + 1}
            pageTotal={pagesOfKind.length}
            config={renderedConfig}
            showAnswers={showAnswers}
            isLast={index === sheets.length - 1}
            key={sheet.id}
          />;
        })}
      </div>}
    </section>
  </div>;
}
