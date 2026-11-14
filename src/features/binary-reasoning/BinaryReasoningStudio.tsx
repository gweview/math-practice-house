import { useMemo } from 'react';
import {
  BINARY_DIFFICULTY_PROFILES,
  createBinaryReasoningConfigStorage,
  DEFAULT_BINARY_REASONING_CONFIG,
  REASONING_METHODS
} from './difficulty';
import { generateReasoningSet } from './generator';
import { planReasoningSheets, type ReasoningSheet } from './layout';
import { symbolById } from './symbols';
import type { BinaryReasoningConfig, LinearEquation, ReasoningMethod, ReasoningProblem, ReasoningStage, VariableId } from './types';
import './binary-reasoning.css';
import { useWorksheetSession } from '../../shared/session/useWorksheetSession';
import PreviewStatus from '../../shared/ui/PreviewStatus';
import PrintGuide from '../../shared/ui/PrintGuide';
import StickyActionBar from '../../shared/ui/StickyActionBar';

const METHOD_COPY: Record<ReasoningMethod, { label: string; icon: string; description: string }> = {
  sameValue: { label: '同值推算', icon: '⚖', description: '相同图形平均分，再求另一个图形' },
  substitution: { label: '代入推算', icon: '↪', description: '把已知图形的数代入下一条等式' },
  sumDifference: { label: '和差推算', icon: '±', description: '根据两个图形的和与差分别求值' },
  chain: { label: '连推算', icon: '🔗', description: '先解简单等式，再连续推导复杂等式' }
};
const STAGE_LABELS: Record<ReasoningStage, string> = { preschool: '数学启蒙', grade1: '一年级', grade2: '二年级', grade3: '三年级' };

function cloneDefaults(): BinaryReasoningConfig {
  return { ...DEFAULT_BINARY_REASONING_CONFIG, methods: [...DEFAULT_BINARY_REASONING_CONFIG.methods], fields: { ...DEFAULT_BINARY_REASONING_CONFIG.fields } };
}
function contentSignature(config: BinaryReasoningConfig) { return `${config.stage}|${config.difficulty}|${config.methods.join(',')}|${config.count}|${config.randomMix}|${config.allowDuplicates}`; }

type BinaryResult = { problems: ReasoningProblem[]; config: BinaryReasoningConfig };
const BINARY_STORAGE = createBinaryReasoningConfigStorage();
const binarySessionOptions = {
  load: BINARY_STORAGE.load,
  save: (config: BinaryReasoningConfig) => { BINARY_STORAGE.save(config); },
  defaults: cloneDefaults,
  generate: (config: BinaryReasoningConfig): BinaryResult => {
    const snapshot = structuredClone(config);
    return { problems: generateReasoningSet(snapshot), config: snapshot };
  },
  resultConfig: (result: BinaryResult) => result.config,
  equivalent: (draft: BinaryReasoningConfig, rendered: BinaryReasoningConfig) => contentSignature(draft) === contentSignature(rendered)
};

function Field({ show, label }: { show: boolean; label: string }) {
  return show ? <span>{label}：<b aria-hidden="true" /></span> : null;
}
function SymbolToken({ problem, variable }: { problem: ReasoningProblem; variable: VariableId }) {
  const symbol = symbolById(problem.symbols[variable]);
  return <span className={`binary-symbol binary-symbol--${symbol.id}`} aria-hidden="true"><i>{symbol.glyph}</i><small>{symbol.label}</small></span>;
}
function EquationView({ equation, problem }: { equation: LinearEquation; problem: ReasoningProblem }) {
  const terms: Array<{ variable: VariableId; sign: '+' | '-'; count: number }> = [];
  if (equation.a > 0) terms.push({ variable: 'a', sign: '+', count: equation.a });
  if (equation.b > 0) terms.push({ variable: 'b', sign: '+', count: equation.b });
  if (equation.a < 0) terms.push({ variable: 'a', sign: '-', count: Math.abs(equation.a) });
  if (equation.b < 0) terms.push({ variable: 'b', sign: '-', count: Math.abs(equation.b) });
  const spoken = terms.map((term, index) => `${index ? term.sign === '-' ? '减' : '加' : term.sign === '-' ? '负' : ''}${term.count > 1 ? `${term.count}个` : ''}${symbolById(problem.symbols[term.variable]).label}`).join('');
  return <div className="binary-equation" aria-label={`${spoken}等于${equation.total}`}>
    {terms.flatMap((term, termIndex) => Array.from({ length: term.count }, (_, itemIndex) => <span className="binary-equation-part" key={`${term.variable}-${itemIndex}`}>
      {(termIndex > 0 || itemIndex > 0) && <b aria-hidden="true">{itemIndex === 0 ? term.sign : '+'}</b>}
      <SymbolToken problem={problem} variable={term.variable} />
    </span>))}
    <strong aria-hidden="true">=</strong><em>{equation.total}</em>
  </div>;
}
function ProblemCard({ problem, number, answer }: { problem: ReasoningProblem; number: number; answer: boolean }) {
  return <article className={`binary-problem-card${answer ? ' binary-problem-card--answer' : ''}`} data-testid={answer ? undefined : 'binary-problem-card'} data-method={problem.method}>
    <header><strong>第 {number} 题 · {METHOD_COPY[problem.method].label}</strong><span>{METHOD_COPY[problem.method].icon}</span></header>
    <div className="binary-equations">{problem.equations.map((item, index) => <EquationView equation={item} problem={problem} key={index} />)}</div>
    {answer ? <div className="binary-solution"><p className="binary-final-answer">答案：{problem.ask.map(variable => `${symbolById(problem.symbols[variable]).label}=${problem.answers[variable]}`).join('，')}</p>{problem.steps.map((step, index) => <p className="binary-solution-step" key={index}><b>{index + 1}</b>{step}</p>)}</div> : <div className="binary-response">{problem.ask.map(variable => <span key={variable}><SymbolToken problem={problem} variable={variable} /> = <b aria-label={`${symbolById(problem.symbols[variable]).label}答案填写处`} /></span>)}</div>}
  </article>;
}
function SheetPage({ sheet, config, showAnswers }: { sheet: ReasoningSheet; config: BinaryReasoningConfig; showAnswers: boolean }) {
  const answer = sheet.kind === 'answers';
  return <section className={`binary-sheet binary-sheet--${sheet.kind} binary-sheet--${sheet.orientation}${answer ? ` binary-answer-pages${showAnswers ? ' visible-on-screen' : ''}` : ''}${sheet.isLast ? ' binary-last-sheet' : ''}`} data-testid="binary-sheet" data-sheet-kind={sheet.kind}>
    <header className="binary-sheet-header"><div><p>{answer ? 'STEP-BY-STEP ANSWERS' : 'BINARY REASONING'}</p><h2>{answer ? '二元推算 · 分步答案' : '二元推算练习'}</h2></div><strong>{answer ? '答案' : '练习'}</strong></header>
    {!answer && <div className="binary-student-fields"><Field show={config.fields.name} label="姓名"/><Field show={config.fields.date} label="日期"/><Field show={config.fields.time} label="用时"/></div>}
    <div className="binary-sheet-grid">{sheet.slots.map(slot => <ProblemCard problem={slot.problem} number={slot.number} answer={answer} key={slot.problem.id}/>)}</div>
  </section>;
}

export default function BinaryReasoningStudio({ active, onPrint }: { active: boolean; onPrint: () => void }) {
  const session = useWorksheetSession(binarySessionOptions);
  const { config, setConfig, result, renderedConfig: generatedConfig, previewIsStale, showAnswers, setShowAnswers, error, create, reset: resetSession } = session;
  const update = <K extends keyof BinaryReasoningConfig>(key: K, value: BinaryReasoningConfig[K]) => setConfig(current => ({ ...current, [key]: value }));
  const toggleMethod = (method: ReasoningMethod) => setConfig(current => {
    if (current.methods.includes(method)) return current.methods.length === 1 ? current : { ...current, methods: current.methods.filter(item => item !== method) };
    return { ...current, methods: [...current.methods, method] };
  });
  const generate = () => {
    const generated = create(config);
    if (generated) window.setTimeout(() => {
      const title = document.querySelector<HTMLElement>('.binary-preview-title');
      title?.scrollIntoView({ behavior: 'smooth' });
      title?.focus({ preventScroll: true });
    }, 20);
  };
  const reset = () => { resetSession(); };
  const renderedConfig = useMemo<BinaryReasoningConfig>(() => result ? {
    ...(generatedConfig ?? config), orientation: config.orientation, fontSize: config.fontSize,
    answerPage: config.answerPage, fields: { ...config.fields }
  } : config, [config, generatedConfig, result]);
  const sheets = useMemo(() => result ? planReasoningSheets(result.problems, renderedConfig) : [], [renderedConfig, result]);
  const contentChanged = result !== null && previewIsStale;
  return <div id="binaryReasoning-panel" role="tabpanel" aria-labelledby="binaryReasoning-tab" className={`binary-mode-content binary-${config.orientation} binary-font-${config.fontSize}${active ? '' : ' mode-hidden'}`} aria-hidden={!active}>
    {active && <style>{`@media print{@page binary-portrait{size:A4 portrait;margin:0}@page binary-landscape{size:A4 landscape;margin:0}}`}</style>}
    <section className="binary-config-panel binary-no-print" aria-labelledby="binary-config-title">
      <div className="section-heading"><span aria-hidden="true">🔍</span><div><h2 id="binary-config-title">二元推算设置</h2><p>通过观察、分析、推理和验证，找到两个图形代表的数。</p></div></div>
      <div className="binary-config-grid">
        <fieldset><legend>① 学习阶段</legend><div className="choice-row">{Object.entries(STAGE_LABELS).map(([stage, label]) => <button type="button" className={config.stage === stage ? 'selected' : ''} aria-pressed={config.stage === stage} onClick={() => update('stage', stage as ReasoningStage)} key={stage}>{label}</button>)}</div></fieldset>
        <fieldset><legend>② 难度</legend><div className="choice-row">{BINARY_DIFFICULTY_PROFILES.map(profile => <button type="button" className={config.difficulty === profile.difficulty ? 'selected' : ''} aria-pressed={config.difficulty === profile.difficulty} onClick={() => update('difficulty', profile.difficulty)} key={profile.difficulty}>{profile.label}</button>)}</div><p className="hint">{BINARY_DIFFICULTY_PROFILES.find(item => item.difficulty === config.difficulty)?.description}</p></fieldset>
        <fieldset className="binary-wide"><legend>③ 推算方法（可多选）</legend><div className="binary-method-grid">{REASONING_METHODS.map(method => <button type="button" className={config.methods.includes(method) ? 'selected' : ''} aria-pressed={config.methods.includes(method)} onClick={() => toggleMethod(method)} key={method}><span aria-hidden="true">{METHOD_COPY[method].icon}</span><strong>{METHOD_COPY[method].label}</strong><small>{METHOD_COPY[method].description}</small></button>)}</div></fieldset>
        <fieldset><legend>④ 题目数量</legend><div className="choice-row compact">{[8, 12, 16, 20].map(count => <button type="button" aria-pressed={config.count === count} className={config.count === count ? 'selected' : ''} onClick={() => update('count', count)} key={count}>{count}</button>)}</div><label className="number-input">自定义 <input aria-label="二元推算题量" type="number" min="4" max="40" value={config.count} onChange={event => update('count', Math.min(40, Math.max(4, Math.round(Number(event.target.value)))))} /> 道</label></fieldset>
        <fieldset><legend>⑤ 页面与字体</legend><div className="choice-row">{(['portrait', 'landscape'] as const).map(value => <button type="button" aria-pressed={config.orientation === value} className={config.orientation === value ? 'selected' : ''} onClick={() => update('orientation', value)} key={value}>A4 {value === 'portrait' ? '纵向' : '横向'}</button>)}</div><div className="choice-row">{(['standard', 'large'] as const).map(value => <button type="button" aria-pressed={config.fontSize === value} className={config.fontSize === value ? 'selected' : ''} onClick={() => update('fontSize', value)} key={value}>{value === 'standard' ? '标准字体' : '大字体'}</button>)}</div></fieldset>
        <fieldset className="binary-wide"><legend>⑥ 生成与打印</legend><div className="binary-settings-grid">{([['randomMix', '随机混合方法'], ['allowDuplicates', '允许重复题目'], ['answerPage', '生成答案页']] as const).map(([key, label]) => <label className="switch" key={key}><input type="checkbox" checked={config[key]} onChange={event => update(key, event.target.checked)} /><span>{label}</span></label>)}{Object.entries({ name: '姓名栏', date: '日期栏', time: '用时栏' }).map(([key, label]) => <label className="switch" key={key}><input type="checkbox" checked={config.fields[key as keyof typeof config.fields]} onChange={event => update('fields', { ...config.fields, [key]: event.target.checked })}/><span>{label}</span></label>)}</div></fieldset>
      </div>
      {error && <p className="error" role="alert">⚠ {error}</p>}
      <div className="actions"><button type="button" className="primary desktop-generate" onClick={generate}>✨ 生成二元推算</button><button type="button" onClick={reset}>↺ 恢复默认设置</button></div>
      <PrintGuide />
      <StickyActionBar className="binary-sticky-actions" label="二元推算生成操作"><button type="button" className="primary" onClick={generate}>✨ 生成二元推算</button></StickyActionBar>
    </section>
    <section className="binary-preview" aria-labelledby="binary-preview-title"><div className="preview-bar binary-no-print"><div><p className="eyebrow">A4 REASONING PREVIEW</p><h2 className="binary-preview-title" id="binary-preview-title" tabIndex={-1}>二元推算打印预览</h2>{result && <PreviewStatus summary={`${sheets.filter(sheet => sheet.kind === 'questions').length} 张练习纸${sheets.some(sheet => sheet.kind === 'answers') ? ' + 答案纸' : ''} · A4 ${renderedConfig.orientation === 'portrait' ? '纵向' : '横向'}`} stale={contentChanged} staleMessage="内容设置已修改；当前仍预览上次生成的题目，请重新生成后更新。" />}</div>{result && <div className="actions small"><button type="button" onClick={generate}>🎲 按当前设置重新生成</button>{renderedConfig.answerPage && <button type="button" aria-pressed={showAnswers} onClick={() => setShowAnswers(value => !value)}>{showAnswers ? '🙈 隐藏答案页' : '💡 显示答案页'}</button>}<button type="button" className="primary" onClick={onPrint}>🖨️ 打印二元推算</button></div>}</div>
      {!result ? <div className="binary-empty"><span aria-hidden="true">🔎</span><h3>还没有推算题</h3><p>选择方法和难度，然后开始观察图形线索吧！</p></div> : <div className="binary-paper-stack" data-testid="binary-workbook">{sheets.map(sheet => <SheetPage sheet={sheet} config={renderedConfig} showAnswers={showAnswers} key={sheet.id}/>)}</div>}
    </section>
  </div>;
}
