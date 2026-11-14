import type { ProblemType, Question, WorksheetConfig } from '../../core/types';
import { getQuestionDefinition } from '../questions/registry';

export const STANDARD_PAGE_BUDGET_MM = {
  portrait: 208,
  landscape: 136
} as const;

interface TrackRow {
  usedColumns: number;
  heightMm: number;
}

export interface TrackFootprint {
  columns: number | 'full';
  heightMm: number;
}

/** Single source of truth for the physical shape emitted by a question renderer. */
export function questionFootprint(question: Question, config: Pick<WorksheetConfig, 'fontSize'>): TrackFootprint {
  const scale = config.fontSize === 'large' ? 'large' : 'standard';
  if (question.content) {
    const table = question.content.kind === 'table';
    return { columns: 'full', heightMm: table ? scale === 'large' ? 36 : 31 : scale === 'large' ? 43 : 38 };
  }
  if (question.layout === 'word') return { columns: 'full', heightMm: scale === 'large' ? 31 : 28 };
  if (question.layout === 'wide') return { columns: 'full', heightMm: scale === 'large' ? 13 : 11 };
  const definition = getQuestionDefinition(question.type);
  return { columns: definition.footprint.columns, heightMm: definition.footprint.heightMm[scale] };
}

export function footprintHeightMm(type: ProblemType, config: Pick<WorksheetConfig, 'fontSize'>): number {
  return getQuestionDefinition(type).footprint.heightMm[config.fontSize];
}

export function occupiedColumns(type: ProblemType, orientation: WorksheetConfig['orientation']): number {
  const columns = orientation === 'portrait' ? 2 : 3;
  const requested = getQuestionDefinition(type).footprint.columns;
  return requested === 'full' ? columns : Math.min(requested, columns);
}

/** Measures a stable, order-preserving track plan. Items are never reordered to fill gaps. */
export function trackHeightMm(types: readonly ProblemType[], config: Pick<WorksheetConfig, 'orientation' | 'fontSize'>): number {
  return measuredTrackHeightMm(types, config, type => ({
    columns: getQuestionDefinition(type).footprint.columns,
    heightMm: footprintHeightMm(type, config)
  }));
}

export function measuredTrackHeightMm<T>(items: readonly T[], config: Pick<WorksheetConfig, 'orientation'>, getFootprint: (item: T) => TrackFootprint): number {
  const columnCount = config.orientation === 'portrait' ? 2 : 3;
  const gapMm = config.orientation === 'portrait' ? 8 : 7;
  const rows: TrackRow[] = [];

  for (const item of items) {
    const footprint = getFootprint(item);
    const span = footprint.columns === 'full' ? columnCount : Math.min(footprint.columns, columnCount);
    const heightMm = footprint.heightMm;
    const current = rows.at(-1);
    if (span === columnCount || !current || current.usedColumns + span > columnCount) {
      rows.push({ usedColumns: span, heightMm });
    } else {
      current.usedColumns += span;
      current.heightMm = Math.max(current.heightMm, heightMm);
    }
  }

  return rows.reduce((total, row) => total + row.heightMm, 0) + Math.max(0, rows.length - 1) * gapMm;
}

export function paginateByMeasuredFootprints<T>(
  items: readonly T[],
  config: Pick<WorksheetConfig, 'orientation'>,
  getFootprint: (item: T) => TrackFootprint
): T[][] {
  const budgetMm = STANDARD_PAGE_BUDGET_MM[config.orientation];
  const pages: T[][] = [];
  let page: T[] = [];
  for (const item of items) {
    const footprint = getFootprint(item);
    if (footprint.heightMm > budgetMm) {
      throw new Error(`题目打印空间 ${footprint.heightMm}mm 超过 ${config.orientation} 页面可用高度 ${budgetMm}mm`);
    }
    const candidate = [...page, item];
    if (page.length && measuredTrackHeightMm(candidate, config, getFootprint) > budgetMm) {
      pages.push(page);
      page = [item];
    } else {
      page = candidate;
    }
  }
  if (page.length) pages.push(page);
  return pages;
}

export function paginateByFootprints<T>(
  items: readonly T[],
  config: Pick<WorksheetConfig, 'orientation' | 'fontSize'>,
  getType: (item: T) => ProblemType
): T[][] {
  return paginateByMeasuredFootprints(items, config, item => {
    const type = getType(item);
    return { columns: getQuestionDefinition(type).footprint.columns, heightMm: footprintHeightMm(type, config) };
  });
}
