import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DIFFICULTY_DESCRIPTIONS, DIFFICULTY_LABELS } from '../../core/difficulty-config';
import { generateWorksheet } from '../../core/generate';
import { isTypeAllowedForStage, STAGE_LABELS, STAGE_RECOMMENDED_TYPES } from '../../core/grade-config';
import {
  MAX_VERTICAL_PAGES,
  VERTICAL_PAGE_SIZE,
  type AnswerMode,
  type OrderingMode,
  type PracticeMode,
  type ProblemType,
  type VerticalDivisionMode,
  type VerticalMultiplicationMode,
  type VerticalOperation,
  type VerticalSubtractionMode,
  type Worksheet,
  type WorksheetConfig,
  type WorksheetPresetId
} from '../../core/types';
import { normalizeConfig } from '../../core/validators';
import type { QuestionGroupId } from '../../domain/questions/contracts';
import { getQuestionDefinition, QUESTION_GROUPS, standardQuestionDefinitions } from '../../domain/questions/registry';
import { estimatePageTargetCount } from '../../domain/worksheet/blueprint';
import { applyWorksheetPreset, WORKSHEET_PRESETS } from '../../domain/worksheet/presets';
import { createRandomSeed } from '../../shared/random/seeded-random';
import { useWorksheetSession } from '../../shared/session/useWorksheetSession';
import PreviewStatus from '../../shared/ui/PreviewStatus';
import PrintGuide from '../../shared/ui/PrintGuide';
import StickyActionBar from '../../shared/ui/StickyActionBar';
import MathWorkbook from '../math/MathWorkbook';
import { planMathSheets } from '../math/layout';
import { compatiblePracticeMode, createWorksheetConfigStorage, DEFAULT_WORKSHEET_CONFIG } from './config';

const STANDARD_DEFINITIONS = standardQuestionDefinitions();
const STORAGE = createWorksheetConfigStorage();
const PRACTICE_LABELS: Record<PracticeMode, string> = {
  standard: '常规练习',
  verticalAddSub: '加减法竖式',
  verticalMulDiv: '乘除法竖式',
  verticalAll: '四则综合竖式'
};
const VERTICAL_OPERATION_LABELS: Record<VerticalOperation, string> = { addition: '加法', subtraction: '减法', multiplication: '乘法', division: '除法' };
const VERTICAL_DIFFICULTY_HINTS: Record<WorksheetConfig['difficulty'], string> = {
  entry: '较小数字，保留基础列位步骤', easy: '提高数字范围，加入少量进退位或余数', standard: '数字范围与进退位、余数比例均衡', advanced: '高位数字更多，多次进退位与有余数除法增加', challenge: '高位数字为主，强化连续进退位和复杂竖式'
};
const TIERED_DISTRIBUTION: NonNullable<WorksheetConfig['difficultyDistribution']> = {
  easy: 3,
  standard: 4,
  advanced: 2,
  challenge: 1
};

const QUESTION_EXAMPLES: Partial<Record<ProblemType, string>> = {
  addition10: '例：3 + 5 = □', subtraction10: '例：9 - 4 = □',
  addition20NoCarry: '例：12 + 5 = □', subtraction20NoBorrow: '例：18 - 6 = □',
  addition20Carry: '例：8 + 7 = □', subtraction20Borrow: '例：15 - 8 = □',
  addition100: '例：42 + 35 = □', subtraction100: '例：78 - 24 = □',
  twoDigitCarry: '例：38 + 27 = □', twoDigitBorrow: '例：62 - 28 = □',
  addition1000: '例：345 + 278 = □', subtraction1000: '例：612 - 245 = □',
  multiplication: '例：6 × 7 = □', division: '例：42 ÷ 6 = □',
  multiDigitMultiplication: '例：24 × 3 = □', threeDigitByOneMultiplication: '例：236 × 4 = □',
  twoDigitByTwoMultiplication: '例：34 × 26 = □', remainderDivision: '例：23 ÷ 5 = □……□',
  mixedMulDiv: '例：24 ÷ 4 × 6 = □', chainAddition: '例：12 + 8 + 15 = □',
  chainSubtraction: '例：45 - 12 - 9 = □', mixedAddSub: '例：36 - 18 + 25 = □',
  mixedFour: '例：18 + 6 × 4 = □', fillBlank: '例：□ + 15 = 42',
  multiplicationBlank: '例：7 × □ = 56', wordProblem: '例：生活情境解决问题',
  compareSigns: '例：28 ○ 32（填 > < =）', numberSequence: '例：12, 15, □, 21',
  numberComposition: '例：8 可以分成 3 和 □', unitConversion: '例：3 米 = □ 厘米',
  fractionComparison: '例：2/5 ○ 3/5', perimeter: '例：长方形与正方形周长',
  clockReading: '例：看钟面写时间', decimalOperation: '例：3.5 + 1.28 = □',
  fractionOperation: '例：1/3 + 1/6 = □', simpleEquation: '例：3x + 5 = 20'
};

function getQuestionExample(id: ProblemType, fallbackLabel: string): string {
  return QUESTION_EXAMPLES[id] ?? `专项：${fallbackLabel}`;
}

const sessionOptions = {
  load: STORAGE.load,
  save: (config: WorksheetConfig) => { STORAGE.save(config); },
  defaults: () => ({ ...DEFAULT_WORKSHEET_CONFIG, fields: { ...DEFAULT_WORKSHEET_CONFIG.fields }, types: [...DEFAULT_WORKSHEET_CONFIG.types] }),
  generate: generateWorksheet,
  resultConfig: (worksheet: Worksheet) => worksheet.config,
  equivalent: (draft: WorksheetConfig, rendered: WorksheetConfig) => JSON.stringify(normalizeConfig(draft)) === JSON.stringify(normalizeConfig(rendered))
};

interface Props {
  active: boolean;
  onPrint: () => void;
}

function BoundedNumberInput({ label, min, max, value, suffix, onChange }: { label: string; min: number; max: number; value: number; suffix: string; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, Math.round(parsed))) : value;
    setDraft(String(next));
    onChange(next);
  };
  return <label className="number-input">自定义 <input aria-label={label} type="number" min={min} max={max} value={draft} onChange={event => {
    const nextDraft = event.target.value;
    setDraft(nextDraft);
    const parsed = Number(nextDraft);
    if (nextDraft !== '' && Number.isFinite(parsed) && parsed >= min && parsed <= max) onChange(Math.round(parsed));
  }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} /> {suffix}</label>;
}

function ChoiceButton<T extends string>({ value, current, onChange, children }: { value: T; current: T | undefined; onChange: (value: T) => void; children: ReactNode }) {
  return <button type="button" className={current === value ? 'selected' : ''} aria-pressed={current === value} onClick={() => onChange(value)}>{children}</button>;
}

export default function MathWorksheetBuilder({ active, onPrint }: Props) {
  const session = useWorksheetSession(sessionOptions);
  const { config, setConfig, result: worksheet, renderedConfig, previewIsStale, showAnswers, setShowAnswers, error } = session;
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<QuestionGroupId | 'all'>('all');
  const [drawerOpen, setDrawerOpen] = useState(config.preset === 'custom');
  const [sparkle, setSparkle] = useState(false);
  const [copied, setCopied] = useState(false);

  const sheets = useMemo(() => planMathSheets(worksheet?.questions ?? [], renderedConfig), [worksheet, renderedConfig]);
  const questionPageCount = sheets.filter(sheet => sheet.kind === 'questions').length;
  const answerPageCount = sheets.filter(sheet => sheet.kind === 'answers').length;
  const estimatedCount = config.practiceMode === 'standard' && config.generationMode === 'pages' ? estimatePageTargetCount(config) : config.count;
  const isTieredDifficulty = Boolean(config.difficultyDistribution && Object.values(config.difficultyDistribution).some(weight => Number(weight) > 0));
  const difficultyHint = isTieredDifficulty
    ? '按 3:4:2:1 自动配比简单、标准、提高与挑战题，并按先易后难排布'
    : config.practiceMode === 'standard' ? DIFFICULTY_DESCRIPTIONS[config.difficulty] : VERTICAL_DIFFICULTY_HINTS[config.difficulty];
  const canMulDiv = config.rangeMode === 'free' || ['grade3', 'grade4', 'grade5', 'grade6'].includes(config.stage);
  const canTwoDigitDivisor = config.rangeMode === 'free' || ['grade4', 'grade5', 'grade6'].includes(config.stage);

  const update = <K extends keyof WorksheetConfig>(key: K, value: WorksheetConfig[K]) => setConfig(current => ({ ...current, [key]: value }));
  const runGenerate = (nextConfig = config) => {
    if (nextConfig.practiceMode === 'standard' && !nextConfig.types.length) {
      return session.create({ ...nextConfig, types: STAGE_RECOMMENDED_TYPES[nextConfig.stage] });
    }
    const next = session.create(nextConfig);
    if (next) {
      setSparkle(true);
      window.setTimeout(() => setSparkle(false), 700);
      window.setTimeout(() => {
        const previewTitle = document.querySelector<HTMLElement>('.preview-title');
        previewTitle?.scrollIntoView({ behavior: 'smooth' });
        previewTitle?.focus({ preventScroll: true });
      }, 30);
    }
    return next;
  };

  const changeStage = (stage: WorksheetConfig['stage']) => setConfig(current => {
    const compatible = current.rangeMode === 'free' ? current.types : current.types.filter(type => isTypeAllowedForStage(type, stage));
    const practiceMode = compatiblePracticeMode(current.practiceMode, stage, current.rangeMode);
    const stageCanMulDiv = current.rangeMode === 'free' || ['grade3', 'grade4', 'grade5', 'grade6'].includes(stage);
    const base: WorksheetConfig = {
      ...current,
      stage,
      practiceMode,
      verticalOperations: practiceMode === 'verticalMulDiv'
        ? ['multiplication', 'division']
        : practiceMode === 'verticalAll' && stageCanMulDiv
          ? ['addition', 'subtraction', 'multiplication', 'division']
          : ['addition', 'subtraction'],
      verticalDivisionMode: current.verticalDivisionMode === 'twoDigitDivisor' && current.rangeMode === 'curriculum' && !['grade4', 'grade5', 'grade6'].includes(stage)
        ? 'mixed'
        : current.verticalDivisionMode,
      types: compatible.length ? compatible : STAGE_RECOMMENDED_TYPES[stage]
    };
    return current.preset && current.preset !== 'custom' ? applyWorksheetPreset(base, current.preset) : base;
  });

  const changeRangeMode = (rangeMode: WorksheetConfig['rangeMode']) => setConfig(current => {
    const compatible = rangeMode === 'free' ? current.types : current.types.filter(type => isTypeAllowedForStage(type, current.stage));
    const practiceMode = compatiblePracticeMode(current.practiceMode, current.stage, rangeMode);
    const stageCanMulDiv = rangeMode === 'free' || ['grade3', 'grade4', 'grade5', 'grade6'].includes(current.stage);
    const base: WorksheetConfig = {
      ...current,
      rangeMode,
      practiceMode,
      verticalOperations: practiceMode === 'verticalMulDiv'
        ? ['multiplication', 'division']
        : practiceMode === 'verticalAll' && stageCanMulDiv
          ? ['addition', 'subtraction', 'multiplication', 'division']
          : ['addition', 'subtraction'],
      types: compatible.length ? compatible : STAGE_RECOMMENDED_TYPES[current.stage]
    };
    return current.preset && current.preset !== 'custom' ? applyWorksheetPreset(base, current.preset) : base;
  });

  const changePracticeMode = (practiceMode: PracticeMode) => setConfig(current => ({
    ...current,
    practiceMode,
    preset: practiceMode === 'standard' ? current.preset : 'custom',
    verticalOperations: practiceMode === 'verticalMulDiv'
      ? ['multiplication', 'division']
      : practiceMode === 'verticalAll'
        ? (canMulDiv ? ['addition', 'subtraction', 'multiplication', 'division'] : ['addition', 'subtraction'])
        : practiceMode === 'verticalAddSub'
          ? ['addition', 'subtraction']
          : current.verticalOperations
  }));

  const choosePreset = (preset: WorksheetPresetId) => {
    setConfig(current => applyWorksheetPreset(current, preset));
    if (preset === 'custom') setDrawerOpen(true);
  };
  const setAnswerMode = (answerMode: AnswerMode) => setConfig(current => ({ ...current, answerMode, answerPage: answerMode !== 'none' }));
  const setOrdering = (ordering: OrderingMode) => setConfig(current => ({ ...current, ordering, randomMix: ordering === 'random' }));
  const toggleType = (type: ProblemType) => setConfig(current => ({
    ...current,
    preset: 'custom',
    types: current.types.includes(type) ? current.types.filter(item => item !== type) : [...current.types, type]
  }));
  const cycleTypeWeight = (type: ProblemType) => setConfig(current => {
    const currentWeight = Math.round(Number(current.typeWeights?.[type] ?? 1));
    const nextWeight = currentWeight >= 3 ? 1 : currentWeight + 1;
    return {
      ...current,
      typeWeights: { ...(current.typeWeights ?? {}), [type]: nextWeight }
    };
  });
  const toggleGroupTypes = (groupTypes: readonly ProblemType[], selectAll: boolean) => setConfig(current => ({
    ...current,
    preset: 'custom',
    types: selectAll
      ? [...new Set([...current.types, ...groupTypes])]
      : current.types.filter(type => !groupTypes.includes(type))
  }));
  const toggleVerticalOperation = (operation: VerticalOperation) => setConfig(current => current.verticalOperations.includes(operation)
    ? current.verticalOperations.length === 1 ? current : { ...current, verticalOperations: current.verticalOperations.filter(item => item !== operation) }
    : { ...current, verticalOperations: [...current.verticalOperations, operation] });
  const toggleTieredDifficulty = (tiered: boolean) => setConfig(current => ({
    ...current,
    difficultyDistribution: tiered ? TIERED_DISTRIBUTION : undefined,
    ordering: tiered ? 'progressive' : current.ordering,
    randomMix: tiered ? false : current.randomMix
  }));

  const allowedDefinitions = STANDARD_DEFINITIONS.filter(definition => config.rangeMode === 'free' || definition.allowedGrades.includes(config.stage));
  const searchedDefinitions = allowedDefinitions.filter(definition => !search.trim() || `${definition.label}${definition.description}${definition.skills.join('')}`.toLowerCase().includes(search.trim().toLowerCase()));
  const visibleDefinitions = searchedDefinitions.filter(definition => groupFilter === 'all' || definition.group === groupFilter);
  const visibleTypeGroups = QUESTION_GROUPS.map(group => ({
    ...group,
    totalInStage: searchedDefinitions.filter(definition => definition.group === group.id).length,
    definitions: visibleDefinitions.filter(definition => definition.group === group.id)
  })).filter(group => group.definitions.length);

  const availableVerticalOps: VerticalOperation[] = config.practiceMode === 'verticalAddSub'
    ? ['addition', 'subtraction']
    : config.practiceMode === 'verticalMulDiv'
      ? ['multiplication', 'division']
      : canMulDiv
        ? ['addition', 'subtraction', 'multiplication', 'division']
        : ['addition', 'subtraction'];

  const selectedLabels = config.types.slice(0, 4).map(type => getQuestionDefinition(type).label);
  const summary = config.practiceMode === 'standard'
    ? `${selectedLabels.join('、')}${config.types.length > 4 ? `等 ${config.types.length} 个知识点` : ''} · ${estimatedCount} 题`
    : `${PRACTICE_LABELS[config.practiceMode]} · ${config.verticalPages} 页 / ${config.verticalPages * VERTICAL_PAGE_SIZE} 题`;

  const reproduce = () => {
    if (!worksheet) return;
    const next = { ...config, seed: worksheet.seed };
    setConfig(next);
    runGenerate(next);
  };
  const reroll = () => {
    const next = { ...config, seed: createRandomSeed() };
    setConfig(next);
    runGenerate(next);
  };
  const copySeed = async () => {
    if (!worksheet || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(worksheet.seed);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return <div id="math-panel" role="tabpanel" aria-labelledby="math-tab" className={`math-mode-content ${renderedConfig.orientation} font-${renderedConfig.fontSize}${active ? '' : ' mode-hidden'}`} aria-hidden={!active}>
    <section className="builder-shell no-print" aria-labelledby="config-title">
      <div className="builder-heading"><div><p className="eyebrow">3 STEPS TO PRACTICE</p><h2 id="config-title">制作一份合适的练习</h2><p>先选年级和用途；支持一键微调已选题型比重，或进入竖式计算专列特训。</p></div><span aria-hidden="true">✏️</span></div>

      <div className="quick-builder">
        <section className="quick-step"><header><b>1</b><div><h3>选择练习形式与年级</h3><p>严格模式会自动隐藏超出当前年级的内容</p></div></header>
          <div className="practice-mode-grid compact-cards compact-cards--four">{([
            ['standard', '📝', '综合题单'], ['verticalAddSub', '➕', '加减竖式'], ['verticalMulDiv', '✖️', '乘除竖式'], ['verticalAll', '📏', '竖式专列']
          ] as [PracticeMode, string, string][]).map(([mode, icon, label]) => {
            const disabled = config.rangeMode === 'curriculum' && (
              (mode === 'verticalAddSub' || mode === 'verticalAll') ? config.stage === 'preschool' : mode === 'verticalMulDiv' && !canMulDiv
            );
            return <button type="button" key={mode} className={config.practiceMode === mode ? 'selected' : ''} disabled={disabled} aria-pressed={config.practiceMode === mode} onClick={() => changePracticeMode(mode)}><span>{icon}</span><strong>{label}</strong><small>{disabled ? '当前年级未开放' : PRACTICE_LABELS[mode]}</small></button>;
          })}</div>
          <div className="choice-row grade-row">{Object.entries(STAGE_LABELS).map(([key, label]) => <ChoiceButton key={key} value={key as WorksheetConfig['stage']} current={config.stage} onChange={changeStage}>{label}</ChoiceButton>)}</div>
          <div className="segmented-control" aria-label="课程范围"><ChoiceButton value="curriculum" current={config.rangeMode} onChange={changeRangeMode}>严格按年级</ChoiceButton><ChoiceButton value="free" current={config.rangeMode} onChange={changeRangeMode}>跨年级自由组合</ChoiceButton></div>
        </section>

        {config.practiceMode === 'standard' ? <section className="quick-step"><header><b>2</b><div><h3>这次想练什么</h3><p>先选主题方案，下方可直接增删题型或调节题量比重</p></div></header>
          <div className="preset-grid">{WORKSHEET_PRESETS.filter(item => item.id !== 'custom').map(item => <button type="button" className={config.preset === item.id ? 'selected' : ''} aria-pressed={config.preset === item.id} onClick={() => choosePreset(item.id)} key={item.id}><span>{item.icon}</span><strong>{item.label}</strong><small>{item.description}</small></button>)}</div>
          <div className="selected-types-tray" aria-label="已选题型工作台">
            <div className="tray-header">
              <span>已选 <b>{config.types.length}</b> 个题型（点击倍数可调占比）</span>
              <button type="button" className="tray-action-btn" onClick={() => setDrawerOpen(open => !open)}>{drawerOpen ? '收起题库 ▴' : '+ 增删题型 ▾'}</button>
            </div>
            <div className="tray-chips">
              {config.types.map(type => {
                const def = getQuestionDefinition(type);
                const weight = Math.round(Number(config.typeWeights?.[type] ?? 1));
                return <span className="selected-chip" key={type}>
                  <span className="chip-label">{def.label}</span>
                  <button type="button" className={`chip-weight${weight > 1 ? ' active' : ''}`} title="点击切换该题型出题比重（1倍/2倍/3倍）" onClick={() => cycleTypeWeight(type)}>×{weight}</button>
                  {config.types.length > 1 && <button type="button" className="chip-remove" aria-label={`移除${def.label}`} onClick={() => toggleType(type)}>×</button>}
                </span>;
              })}
            </div>
          </div>
        </section> : <section className="quick-step"><header><b>2</b><div><h3>竖式计算专列配置</h3><p>每页固定 {VERTICAL_PAGE_SIZE} 道，支持除法整除/有余数/商含0等专项细分</p></div></header>
          <div className="vertical-operation-grid">{availableVerticalOps.map(operation => <label className={config.verticalOperations.includes(operation) ? 'check selected' : 'check'} key={operation}><input type="checkbox" checked={config.verticalOperations.includes(operation)} onChange={() => toggleVerticalOperation(operation)} /><span>{VERTICAL_OPERATION_LABELS[operation]}竖式</span></label>)}</div>
          <div className="vertical-column-studio">
            {config.verticalOperations.includes('division') && <div className="vertical-submode-group">
              <span className="submode-label">除法竖式专项：</span>
              <div className="choice-row compact">{([
                ['mixed', '智能配比'],
                ['exact', '整除专项'],
                ['remainder', '有余数除法'],
                ['zeroQuotient', '商中间/末尾有0'],
                ...(canTwoDigitDivisor ? [['twoDigitDivisor', '除数是两位数'] as [VerticalDivisionMode, string]] : [])
              ] as [VerticalDivisionMode, string][]).map(([mode, label]) => <ChoiceButton key={mode} value={mode} current={config.verticalDivisionMode ?? 'mixed'} onChange={value => update('verticalDivisionMode', value)}>{label}</ChoiceButton>)}</div>
            </div>}
            {config.verticalOperations.includes('multiplication') && <div className="vertical-submode-group">
              <span className="submode-label">乘法竖式专项：</span>
              <div className="choice-row compact">{([
                ['mixed', '两位数×一位数'],
                ['threeByOne', '三位数×一位数'],
                ['twoByTwo', '两位数×两位数']
              ] as [VerticalMultiplicationMode, string][]).map(([mode, label]) => <ChoiceButton key={mode} value={mode} current={config.verticalMultiplicationMode ?? 'mixed'} onChange={value => update('verticalMultiplicationMode', value)}>{label}</ChoiceButton>)}</div>
            </div>}
            {config.verticalOperations.includes('subtraction') && <div className="vertical-submode-group">
              <span className="submode-label">减法竖式专项：</span>
              <div className="choice-row compact">{([
                ['mixed', '常规退位减法'],
                ['acrossZero', '隔位退位专项(如500-168)']
              ] as [VerticalSubtractionMode, string][]).map(([mode, label]) => <ChoiceButton key={mode} value={mode} current={config.verticalSubtractionMode ?? 'mixed'} onChange={value => update('verticalSubtractionMode', value)}>{label}</ChoiceButton>)}</div>
            </div>}
          </div>
        </section>}

        <section className="quick-step"><header><b>3</b><div><h3>难度与练习量</h3><p>{difficultyHint}</p></div></header>
          {config.practiceMode === 'standard' && <div className="segmented-control difficulty-mode-switch" aria-label="难度组合方式">
            <button type="button" className={!isTieredDifficulty ? 'selected' : ''} aria-pressed={!isTieredDifficulty} onClick={() => toggleTieredDifficulty(false)}>单一难度</button>
            <button type="button" className={isTieredDifficulty ? 'selected' : ''} aria-pressed={isTieredDifficulty} onClick={() => toggleTieredDifficulty(true)}>🎯 分层递进 (基础+提高+挑战)</button>
          </div>}
          {!isTieredDifficulty && <div className="choice-row difficulty-row">{Object.entries(DIFFICULTY_LABELS).map(([key, label]) => <ChoiceButton key={key} value={key as WorksheetConfig['difficulty']} current={config.difficulty} onChange={value => update('difficulty', value)}>{label}</ChoiceButton>)}</div>}
          {config.practiceMode === 'standard' ? <>
            <div className="segmented-control amount-mode" aria-label="练习量方式"><ChoiceButton value="count" current={config.generationMode} onChange={value => update('generationMode', value)}>按题量</ChoiceButton><ChoiceButton value="pages" current={config.generationMode} onChange={value => update('generationMode', value)}>按纸张目标</ChoiceButton></div>
            {config.generationMode === 'pages'
              ? <div className="choice-row"><ChoiceButton value="1" current={String(config.pageTarget)} onChange={() => update('pageTarget', 1)}>目标 1 页</ChoiceButton><ChoiceButton value="2" current={String(config.pageTarget)} onChange={() => update('pageTarget', 2)}>目标 2 页</ChoiceButton><span className="estimate-pill">预计 {estimatedCount} 题</span></div>
              : <><div className="choice-row compact">{[10, 20, 30, 50].map(count => <button type="button" className={config.count === count ? 'selected' : ''} aria-pressed={config.count === count} onClick={() => update('count', count)} key={count}>{count} 题</button>)}</div><BoundedNumberInput label="自定义题目数量" min={5} max={100} value={config.count} suffix="道" onChange={value => update('count', value)} /></>}
          </> : <><div className="choice-row compact">{[1, 2, 3, MAX_VERTICAL_PAGES].map(pages => <button type="button" className={config.verticalPages === pages ? 'selected' : ''} aria-pressed={config.verticalPages === pages} onClick={() => update('verticalPages', pages)} key={pages}>{pages} 页</button>)}</div><BoundedNumberInput label="自定义竖式页数" min={1} max={MAX_VERTICAL_PAGES} value={config.verticalPages} suffix="页" onChange={value => update('verticalPages', value)} /></>}
        </section>
      </div>

      {config.practiceMode === 'standard' && <details className="builder-details" open={drawerOpen} onToggle={event => setDrawerOpen((event.currentTarget as HTMLDetailsElement).open)}>
        <summary><span><b>自定义题库</b><small>已选 {config.types.length} 项 · 当前年级可用 {allowedDefinitions.length} 项</small></span><i aria-hidden="true">⌄</i></summary>
        <div className="details-content">
          <div className="knowledge-tools">
            <label className="search-field"><span>⌕</span><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索知识点，例如：进位、余数、钟表、周长" aria-label="搜索知识点" /></label>
            <div className="domain-tabs" role="tablist" aria-label="题型分组筛选">
              <button type="button" className={groupFilter === 'all' ? 'selected' : ''} onClick={() => setGroupFilter('all')}>全部 ({searchedDefinitions.length})</button>
              {QUESTION_GROUPS.map(group => {
                const count = searchedDefinitions.filter(item => item.group === group.id).length;
                return count > 0 ? <button type="button" className={groupFilter === group.id ? 'selected' : ''} onClick={() => setGroupFilter(group.id)} key={group.id}>{group.icon} {group.label} ({count})</button> : null;
              })}
            </div>
          </div>
          <div className="type-toolbar"><button type="button" onClick={() => setConfig(current => ({ ...current, preset: 'custom', types: STAGE_RECOMMENDED_TYPES[current.stage] }))}>选择本年级推荐</button><button type="button" onClick={() => setConfig(current => ({ ...current, preset: 'custom', types: [...new Set([...current.types, ...visibleDefinitions.map(item => item.id)])] }))}>全选当前结果</button><button type="button" onClick={() => setConfig(current => ({ ...current, preset: 'custom', types: [] }))}>清空</button><span>展示 {visibleDefinitions.length} 个知识点</span></div>
          <div className="knowledge-groups">{visibleTypeGroups.map(group => {
            const groupIds = group.definitions.map(item => item.id);
            const allGroupSelected = groupIds.every(id => config.types.includes(id));
            return <section key={group.id}>
              <div className="group-header-row">
                <h3><span>{group.icon}</span>{group.label}</h3>
                <button type="button" className="group-toggle-btn" onClick={() => toggleGroupTypes(groupIds, !allGroupSelected)}>{allGroupSelected ? '取消本组' : '全选本组'}</button>
              </div>
              <div className="type-grid">{group.definitions.map(definition => <label className={config.types.includes(definition.id) ? 'check selected' : 'check'} key={definition.id}><input type="checkbox" checked={config.types.includes(definition.id)} onChange={() => toggleType(definition.id)} /><span><strong>{definition.label}</strong><small>{getQuestionExample(definition.id, definition.label)}</small></span></label>)}</div>
            </section>;
          })}</div>
        </div>
      </details>}

      <details className="builder-details advanced-settings">
        <summary><span><b>高级打印设置</b><small>页面方向、答案形式、题序、字段与复现编号</small></span><i aria-hidden="true">⌄</i></summary>
        <div className="details-content advanced-grid">
          <fieldset><legend>页面</legend><div className="choice-row"><ChoiceButton value="portrait" current={config.orientation} onChange={value => update('orientation', value)}>A4 纵向</ChoiceButton><ChoiceButton value="landscape" current={config.orientation} onChange={value => update('orientation', value)}>A4 横向</ChoiceButton></div><div className="choice-row"><ChoiceButton value="standard" current={config.fontSize} onChange={value => update('fontSize', value)}>标准字体</ChoiceButton><ChoiceButton value="large" current={config.fontSize} onChange={value => update('fontSize', value)}>大字体</ChoiceButton></div></fieldset>
          <fieldset><legend>答案页</legend><div className="answer-mode-grid">{([['none', '不生成', '只打印练习'], ['compact', '紧凑核对', '只列题号与答案'], ['detailed', '原位详解', '保留题目与步骤']] as [AnswerMode, string, string][]).map(([mode, label, note]) => <button type="button" key={mode} className={config.answerMode === mode ? 'selected' : ''} aria-pressed={config.answerMode === mode} onClick={() => setAnswerMode(mode)}><strong>{label}</strong><small>{note}</small></button>)}</div></fieldset>
          <fieldset><legend>题目顺序</legend><div className="choice-row"><ChoiceButton value="random" current={config.ordering} onChange={setOrdering}>随机混排（智能行对齐）</ChoiceButton><ChoiceButton value="grouped" current={config.ordering} onChange={setOrdering}>同类分组</ChoiceButton><ChoiceButton value="progressive" current={config.ordering} onChange={setOrdering}>由易到难</ChoiceButton></div></fieldset>
          <fieldset><legend>复现试卷</legend><label className="seed-field">试卷编号（留空则每次生成新卷）<input type="text" maxLength={80} value={config.seed ?? ''} onChange={event => update('seed', event.target.value)} placeholder="例如 class-3-unit-2" /></label></fieldset>
          <fieldset className="wide"><legend>练习纸选项</legend><div className="settings-grid">{([['showNumbers', '显示题号'], ['showLines', '显示答题横线'], ['allowDuplicates', '允许重复题目']] as [keyof WorksheetConfig, string][]).map(([key, label]) => <label className="switch" key={key}><input type="checkbox" checked={Boolean(config[key])} onChange={event => update(key, event.target.checked as never)} /><span>{label}</span></label>)}</div><div className="settings-grid fields">{Object.entries({ name: '姓名栏', date: '日期栏', time: '用时栏', score: '得分栏', streak: '坚持打卡天数' }).map(([key, label]) => <label className="switch" key={key}><input type="checkbox" checked={config.fields[key as keyof typeof config.fields]} onChange={event => update('fields', { ...config.fields, [key]: event.target.checked })} /><span>{label}</span></label>)}</div></fieldset>
        </div>
      </details>
      <PrintGuide className="builder-print-guide" />

      <div className="builder-summary"><div><span>当前练习</span><strong>{STAGE_LABELS[config.stage]} · {summary}</strong><small>{config.rangeMode === 'curriculum' ? '严格课程范围' : '跨年级自由范围'} · {isTieredDifficulty ? '分层递进难度' : `${DIFFICULTY_LABELS[config.difficulty]}难度`} · {config.answerMode === 'compact' ? '紧凑答案' : config.answerMode === 'detailed' ? '详解答案' : '无答案页'}</small></div><div className="actions"><button type="button" onClick={session.reset}>恢复默认</button><button type="button" className="primary" onClick={() => runGenerate()}>✨ 生成练习题</button></div></div>
      {error && <p role="alert" className="error">⚠ {error}</p>}
      <StickyActionBar className="math-sticky-actions" label="练习生成操作"><button type="button" className="mobile-generate primary" onClick={() => runGenerate()}>✨ 生成 {estimatedCount} 道练习</button></StickyActionBar>
    </section>

    {sparkle && <div className="sparkles no-print" aria-hidden="true">✦　⭐　✧</div>}
    <section className="preview" aria-labelledby="math-preview-title"><div className="preview-bar no-print"><div><p className="eyebrow">A4 PRINT PREVIEW</p><h2 className="preview-title" id="math-preview-title" tabIndex={-1}>练习题预览</h2>{worksheet && <><PreviewStatus summary={`${questionPageCount} 张练习纸${answerPageCount ? ` + ${answerPageCount} 张答案纸` : ''} · A4 ${renderedConfig.orientation === 'portrait' ? '纵向' : '横向'} · ${renderedConfig.fontSize === 'large' ? '大字体' : '标准字体'}`} stale={previewIsStale} /><div className="seed-result"><span>试卷编号 <code>{worksheet.seed}</code></span><button type="button" onClick={copySeed}>{copied ? '已复制' : '复制'}</button><button type="button" onClick={reproduce}>复现此卷</button></div></>}</div>{worksheet && <div className="actions small"><button type="button" onClick={reroll}>🎲 换一卷</button>{answerPageCount > 0 && <button type="button" aria-pressed={showAnswers} onClick={() => setShowAnswers(value => !value)}>{showAnswers ? '🙈 隐藏答案页' : '💡 显示答案页'}</button>}<button type="button" className="primary" onClick={onPrint}>🖨️ 打印当前预览</button></div>}</div>
      {!worksheet ? <div className="empty"><div className="bear" aria-hidden="true">🐻</div><h3>准备好就开始吧</h3><p>完成上面的三个选择，点击“生成练习题”。</p><div aria-hidden="true">数轴 · 钟表 · 计算 · 图形 · 统计</div></div> : <MathWorkbook sheets={sheets} config={renderedConfig} showAnswers={showAnswers} seed={worksheet.seed} />}
    </section>
  </div>;
}
