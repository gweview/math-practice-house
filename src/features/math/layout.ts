import { VERTICAL_PAGE_SIZE, type Question, type WorksheetConfig } from '../../core/types';
import { paginateByMeasuredFootprints, questionFootprint } from '../../domain/worksheet/layout-metrics';

export type MathSheetKind = 'questions' | 'answers';

export interface MathSheetSlot {
  question: Question;
  /** Stable, one-based number shared by the exercise and its answer. */
  questionNumber: number;
}

export interface MathSheet {
  id: string;
  kind: MathSheetKind;
  orientation: WorksheetConfig['orientation'];
  practiceMode: WorksheetConfig['practiceMode'];
  pageNumber: number;
  pageTotal: number;
  slots: MathSheetSlot[];
  isLast: boolean;
  answerMode: NonNullable<WorksheetConfig['answerMode']>;
}

function paginateStandard(slots: readonly MathSheetSlot[], config: WorksheetConfig): MathSheetSlot[][] {
  return paginateByMeasuredFootprints(slots, config, slot => questionFootprint(slot.question, config));
}

function compactAnswerCost(slot: MathSheetSlot): number {
  const display = slot.question.answerDetails?.compact ?? slot.question.answerDetails?.display ?? String(slot.question.answer);
  if (display.length > 28) return 4;
  if (display.length > 16) return 2;
  return 1;
}

function paginateCompactAnswers(slots: readonly MathSheetSlot[], config: WorksheetConfig): MathSheetSlot[][] {
  const capacity = config.orientation === 'landscape' ? 120 : 100;
  const pages: MathSheetSlot[][] = [];
  let page: MathSheetSlot[] = [];
  let used = 0;
  for (const slot of slots) {
    const cost = compactAnswerCost(slot);
    if (page.length && used + cost > capacity) {
      pages.push(page);
      page = [];
      used = 0;
    }
    page.push(slot);
    used += cost;
  }
  if (page.length) pages.push(page);
  return pages;
}

function paginateDetailedAnswers(slots: readonly MathSheetSlot[], config: WorksheetConfig): MathSheetSlot[][] {
  return paginateByMeasuredFootprints(slots, config, slot => {
    const steps = slot.question.answerDetails?.steps?.length ?? 0;
    const footprint = questionFootprint(slot.question, config);
    return {
      columns: footprint.columns,
      heightMm: footprint.heightMm + steps * (config.fontSize === 'large' ? 7 : 5)
    };
  });
}

function paginateQuestions(questions: readonly Question[], config: WorksheetConfig): MathSheetSlot[][] {
  const slots = questions.map((question, index) => ({ question, questionNumber: index + 1 }));
  if (config.practiceMode === 'standard') return paginateStandard(slots, config);

  const pages: MathSheetSlot[][] = [];
  for (let index = 0; index < slots.length; index += VERTICAL_PAGE_SIZE) {
    pages.push(slots.slice(index, index + VERTICAL_PAGE_SIZE));
  }
  return pages;
}

function makeSection(
  pages: readonly MathSheetSlot[][],
  kind: MathSheetKind,
  config: WorksheetConfig,
  answerMode: NonNullable<WorksheetConfig['answerMode']>
): MathSheet[] {
  return pages.map((slots, index) => ({
    id: `math-${kind}-${index + 1}`,
    kind,
    orientation: config.orientation,
    practiceMode: config.practiceMode,
    pageNumber: index + 1,
    pageTotal: pages.length,
    slots,
    isLast: false,
    answerMode
  }));
}

/**
 * Plans a complete workbook before rendering. Every returned object maps to exactly one
 * physical A4 sheet. Detailed answers paginate by their rendered footprint;
 * vertical answers mirror their fixed exercise pages, while compact answers use
 * an independent dense key that preserves the original question order and numbers.
 */
export function planMathSheets(
  questions: readonly Question[],
  config: WorksheetConfig
): MathSheet[] {
  if (questions.length === 0) return [];

  const pages = paginateQuestions(questions, config);
  const answerMode = config.answerMode ?? (config.answerPage ? 'detailed' : 'none');
  const allSlots = pages.flat();
  const answerPages = answerMode === 'compact'
    ? paginateCompactAnswers(allSlots, config)
    : config.answerMode === 'detailed'
      // Vertical worksheets have a fixed eight-question physical page. Keep
      // answer sheets aligned one-for-one even when detailed answer content
      // would otherwise make the generic footprint paginator repack them.
      ? config.practiceMode === 'standard' ? paginateDetailedAnswers(allSlots, config) : pages
      : pages;
  const sheets = [
    ...makeSection(pages, 'questions', config, answerMode),
    ...(config.answerPage && answerMode !== 'none' ? makeSection(answerPages, 'answers', config, answerMode) : [])
  ];
  sheets[sheets.length - 1].isLast = true;
  return sheets;
}
