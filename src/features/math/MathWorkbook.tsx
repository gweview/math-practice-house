import { Fragment, type CSSProperties } from 'react';
import type { ProblemType, Question, WorksheetConfig } from '../../core/types';
import type { MathSheet } from './layout';
import QuestionVisual from './QuestionVisual';
import './math.css';

const PRACTICE_TITLES: Record<WorksheetConfig['practiceMode'], string> = {
  standard: '数学练习',
  verticalAddSub: '加减法竖式练习',
  verticalMulDiv: '乘除法竖式练习'
};

const EMBEDDED_RESPONSE_TYPES = new Set<ProblemType>([
  'numberRecognition',
  'comparison',
  'compareSigns',
  'unitConversion',
  'fractionComparison'
]);

function Field({ show, label, suffix }: { show: boolean; label: string; suffix?: string }) {
  return show ? <span className={suffix ? 'student-field streak-field' : 'student-field'}>
    {label}：<b aria-hidden="true" />{suffix && ` ${suffix}`}
  </span> : null;
}

function PageHeader({ answer, config, answerMode, seed }: { answer: boolean; config: WorksheetConfig; answerMode: MathSheet['answerMode']; seed?: string }) {
  const title = PRACTICE_TITLES[config.practiceMode];
  return <header className="sheet-header">
    <div className="sheet-header-main">
      <div className="sheet-title">
        <p>{answer ? 'ANSWER KEY' : 'MATH WORKSHEET'}</p>
        <h2>{answer ? `${title} · 参考答案` : title}</h2>
      </div>
      <strong className="sheet-kind">{answer ? '答案' : '练习'}</strong>
    </div>
    {answer
      ? <p className="answer-page-note">{answerMode === 'compact' ? '紧凑答案按原题号排列，方便快速核对。' : '保留原题与解题步骤，适合错题复盘。'}</p>
      : <div className="student-fields">
        <Field show={config.fields.name} label="姓名" />
        <Field show={config.fields.date} label="日期" />
        <Field show={config.fields.time} label="用时" />
        <Field show={config.fields.score} label="得分" />
        <Field show={config.fields.streak} label="坚持打卡" suffix="天" />
      </div>}
    {seed && <span className="sheet-seed">试卷编号：{seed}</span>}
  </header>;
}

function DigitCells({ value, columns }: { value?: number | string; columns: number }) {
  const text = value === undefined ? ''.padStart(columns, ' ') : String(value).padStart(columns, ' ');
  return <>{[...text].map((digit, index) => <span className="vertical-digit" aria-hidden="true" key={index}>
    {digit === ' ' ? '\u00a0' : digit}
  </span>)}</>;
}

function VerticalExpression({ question, answer }: { question: Question; answer: boolean }) {
  const values = [...question.operands, Number(question.answer)].filter(Number.isFinite);
  const columns = Math.max(2, ...values.map(value => String(Math.abs(value)).length));
  const columnStyle = { '--vertical-columns': columns } as CSSProperties;
  const operator = question.operators?.[0] ?? '';

  return <span
    className="vertical-expression"
    style={columnStyle}
    data-digit-columns={columns}
    aria-label={`${question.text}${answer ? `，答案 ${question.answer}` : '，列竖式计算'}`}
  >
    <span className="vertical-carry-row" aria-hidden="true">
      <i />{Array.from({ length: columns }, (_, index) => <b key={index} />)}
    </span>
    <span className="vertical-number-row" aria-hidden="true">
      <i /><DigitCells value={question.operands[0]} columns={columns} />
    </span>
    <span className="vertical-number-row vertical-second-row" aria-hidden="true">
      <i>{operator}</i><DigitCells value={question.operands[1]} columns={columns} />
    </span>
    <span className={`vertical-result-row${answer ? ' answered' : ''}`} aria-hidden="true">
      <i /><DigitCells value={answer ? question.answer : undefined} columns={columns} />
    </span>
  </span>;
}

function LongDivisionExpression({ question, answer }: { question: Question; answer: boolean }) {
  const quotient = question.metadata?.quotient ?? Math.floor(question.operands[0] / question.operands[1]);
  const remainder = Number(question.metadata?.remainder ?? question.operands[0] % question.operands[1]);
  return <span
    className="long-division-expression"
    aria-label={`${question.operands[0]} 除以 ${question.operands[1]}${answer ? `，商 ${quotient}，余数 ${remainder}` : '，列竖式计算'}`}
  >
    <span className={`long-division-quotient${answer ? ' answered' : ''}`} aria-hidden="true">
      {answer ? quotient : null}
    </span>
    <span className="long-division-row" aria-hidden="true">
      <span className="long-division-divisor">{question.operands[1]}</span>
      <span className="long-division-dividend">{question.operands[0]}</span>
    </span>
    <span className="long-division-work" aria-hidden="true"><i /><i /><i /></span>
    <span className={`long-division-result${answer ? ' answered' : ''}`} aria-hidden="true">
      {answer ? `商 ${quotient}，余数 ${remainder}` : '余数：'}<b />
    </span>
  </span>;
}

function QuestionView({ question, number, config, answer }: {
  question: Question;
  number: number;
  config: WorksheetConfig;
  answer: boolean;
}) {
  if (question.layout === 'longDivision') {
    return <div className={`question long-division${answer ? ' answered' : ''}`} data-testid="question" data-operation="division" data-question-number={number}>
      {config.showNumbers && <span className="q-number">{number}.</span>}
      <LongDivisionExpression question={question} answer={answer} />
    </div>;
  }

  if (question.layout === 'vertical' && question.operators?.length === 1) {
    return <div className={`question vertical${answer ? ' answered' : ''}`} data-testid="question" data-operation={question.operators[0]} data-question-number={number}>
      {config.showNumbers && <span className="q-number">{number}.</span>}
      <VerticalExpression question={question} answer={answer} />
    </div>;
  }

  if (question.content) {
    const display = question.answerDetails?.display ?? String(question.answer);
    return <div className={`question structured wide structured--${question.content.kind}${answer ? ' answered' : ''}`} data-testid="question" data-question-number={number}>
      {config.showNumbers && <span className="q-number">{number}.</span>}
      <div className="structured-question-body">
        <span className="q-text">{question.text}</span>
        <QuestionVisual content={question.content} answer={answer ? question.answer : undefined} />
        {!answer && config.showLines && <span className="answer-line structured-answer-line" aria-hidden="true" />}
        {answer && <div className="detailed-answer"><strong className="answer-value">{display}</strong>{question.answerDetails?.steps?.length
          ? <ol>{question.answerDetails.steps.map(step => <li key={step}>{step}</li>)}</ol>
          : null}</div>}
      </div>
    </div>;
  }

  const preserveSpaces = (value: string) => question.layout === 'word' ? value : value.replace(/ /g, '\u00a0');
  const hasResponseBox = question.text.includes('□');
  const textParts = hasResponseBox ? question.text.split('□') : [];
  const showLine = config.showLines && !answer && !hasResponseBox && !EMBEDDED_RESPONSE_TYPES.has(question.type);
  return <div className={`question ${question.layout}${answer ? ' answered' : ''}`} data-testid="question" data-question-number={number}>
    {config.showNumbers && <span className="q-number">{number}.</span>}
    <span className="q-text">{hasResponseBox
      ? textParts.map((part, partIndex) => <Fragment key={`${question.id}-${partIndex}`}>
        {preserveSpaces(part)}
        {partIndex < textParts.length - 1 && <span className={`fill-box${answer ? ' answered' : ''}`} aria-label={answer ? `答案 ${question.answer}` : '填空处'}>{answer ? question.answer : null}</span>}
      </Fragment>)
      : preserveSpaces(question.text)}</span>
    {showLine && <span className={question.layout === 'word' ? 'answer-line answer-line--word' : 'answer-line'} aria-hidden="true" />}
    {answer && !hasResponseBox && <><strong className="answer-value">{question.answerDetails?.display ?? question.answer}</strong>{question.answerDetails?.steps?.length
      ? <ol className="solution-steps">{question.answerDetails.steps.map(step => <li key={step}>{step}</li>)}</ol>
      : null}</>}
  </div>;
}

function CompactAnswerSheet({ sheet }: { sheet: MathSheet }) {
  return <div className="compact-answer-grid">
    {sheet.slots.map(slot => {
      const display = slot.question.answerDetails?.compact ?? slot.question.answerDetails?.display ?? String(slot.question.answer);
      const long = display.length > 16;
      return <div className={`compact-answer-item${long ? ' compact-answer-item--long' : ''}`} key={`compact-${slot.question.id}`}>
        <b>{slot.questionNumber}.</b><span>{display}</span>
      </div>;
    })}
  </div>;
}

function MathSheetPage({ sheet, config, showAnswers }: {
  sheet: MathSheet;
  config: WorksheetConfig;
  showAnswers: boolean;
}) {
  const answer = sheet.kind === 'answers';
  const vertical = sheet.practiceMode !== 'standard';
  const answerClasses = answer ? ` answer-page answer-pages${showAnswers ? ' visible-on-screen' : ''}` : ' worksheet-page';
  return <section
    className={`paper math-sheet math-sheet--${sheet.orientation}${vertical ? ' vertical-worksheet-page' : ''}${answerClasses}${sheet.isLast ? ' math-last-sheet' : ''}`}
    data-testid={answer ? 'answer-sheet' : 'worksheet-page'}
    data-sheet-kind={sheet.kind}
    data-sheet-orientation={sheet.orientation}
    data-page-number={sheet.pageNumber}
    data-page-total={sheet.pageTotal}
    aria-label={`${answer ? '答案' : '练习'}第 ${sheet.pageNumber} 页，共 ${sheet.pageTotal} 页`}
  >
    <div className="math-sheet-content">
      {!answer && <div className="paper-stickers no-print" aria-hidden="true"><span>⭐</span><span>🌼</span></div>}
      <PageHeader answer={answer} config={config} answerMode={sheet.answerMode} seed={config.seed} />
      {answer && sheet.answerMode === 'compact'
        ? <CompactAnswerSheet sheet={sheet} />
        : <div className="questions math-sheet-grid">
          {sheet.slots.map(slot => <QuestionView
            question={slot.question}
            number={slot.questionNumber}
            config={config}
            answer={answer}
            key={`${sheet.kind}-${slot.question.id}`}
          />)}
        </div>}
    </div>
  </section>;
}

export default function MathWorkbook({ sheets, config, showAnswers, seed }: {
  sheets: readonly MathSheet[];
  config: WorksheetConfig;
  showAnswers: boolean;
  seed?: string;
}) {
  return <div className="paper-stack" data-testid="worksheet">
    {sheets.map(sheet => <MathSheetPage sheet={sheet} config={seed ? { ...config, seed } : config} showAnswers={showAnswers} key={sheet.id} />)}
  </div>;
}
